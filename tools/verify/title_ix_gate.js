// ГЕЙТ: титул не должен зависеть от того, что лежит в IX при входе в игру.
//
// На титуле WaitAnyKey крутится ДО первой LD IX,DiverObj, то есть IX там — что
// осталось от загрузчика. Эмулятор после сброса даёт IX=0 и потому дефект не
// показывал; на железе значение произвольное, отсюда жалоба владельца
// «на клавиатуре старт иногда зависает».
//
// Гейт принудительно ставит IX в разные значения в момент входа в код игры и
// требует, чтобы титул (а) дошёл до WaitAnyKey_1 и (б) не сделал НИ ОДНОЙ записи
// по адресу IX+6.
//
//   node tools/verify/title_ix_gate.js <rom> <sym0> <sym1>
"use strict";
const { make, readSym } = require("./harness.js");

const rom = process.argv[2], sym0 = process.argv[3], sym1 = process.argv[4];
const S0 = readSym(sym0), S1 = readSym(sym1);
if (S0.SCUBACOD0_END == null || S1.WaitAnyKey_1 == null) { console.log("нет нужных меток"); process.exit(2); }

// Значения IX: 0 (как даёт эмулятор), середина образа, начало карты, область
// стека, видеопамять, «все единицы».
const CASES = [0x0000, 0x0100, 0x8100, 0x9000, 0xA800, 0xC000, 0xFFFF];

let fails = 0, n = 0;
for (const IX of CASES) {
  const m = make(rom, { cpu: "z80" });
  let set = false, writes = 0, title = -1;
  m.onPc(S0.SCUBACOD0_END, () => {
    if (set) return;
    // У нашей i8080-ветки регистра IX нет: его роль играет ячейка-тень z80_ix,
    // и она лежит В ОБРАЗЕ (defw 0), то есть на железе тоже всегда 0. Чтобы
    // гейт проверял ту же поверхность, мусор кладём в ячейку.
    if (S1.z80_ix != null) { m.wr(S1.z80_ix, IX & 0xff); m.wr(S1.z80_ix + 1, IX >> 8); }
    else { const st = m.cpu.getState(); st.ix = IX; m.cpu.setState(st); }
    set = true;
  });
  m.onWrite((IX + 6) & 0xffff, () => { if (set && title < 0) writes++; });
  m.onPc(S1.WaitAnyKey_1, () => { if (title < 0) title = m.frame; });
  for (let f = 0; f < 600 && title < 0; f++) m.step();
  n++;
  const ok = title >= 0 && writes === 0;
  if (!ok) fails++;
  console.log(`  ${ok ? "ok    " : "ПРОВАЛ"}  IX=0x${IX.toString(16).padStart(4, "0")}: ` +
              (title >= 0 ? `титул на кадре ${title}` : "ТИТУЛ НЕ ДОСТИГНУТ (зависание)") +
              `, записей в 0x${((IX + 6) & 0xffff).toString(16)}: ${writes}`);
}
if (n === 0) { console.log("ГЕЙТ НЕДЕЙСТВИТЕЛЕН: пустая выборка"); process.exit(2); }
console.log(fails ? `ГЕЙТ КРАСНЫЙ: ${fails} из ${n}` : `ГЕЙТ ЗЕЛЁНЫЙ: титул не зависит от IX ни в одном из ${n} случаев`);
process.exit(fails ? 1 : 0);
