// ЗАВИСАНИЕ ДЕМО-РЕЖИМА МЕНЮ: воспроизведение и механизм. ТОЛЬКО ЗАМЕР.
//
// Что происходит. Через ~20 секунд простоя в меню (LEEAD: `LD A,(FRAMES+1) /
// CP 4`) игра запускает демо: DI, PrepareMiniMap, InitLevelVars, LBEDB,
// DrawGameScr. В боевом образе (GEOM+ZONE+EVICT+NOTITLE) до DrawGameScr дело не
// доходит НИКОГДА — процессор навсегда остаётся в цикле LB1D4/LB1EE. Прерывания
// закрыты тем самым DI, поэтому машина мертва целиком: ни клавиатуры, ни звука.
//
// МЕХАНИЗМ (каждое звено измеряется этим стендом):
//   1. LB1D4 расставляет баллоны кислорода: крутит TableStatics, ища запись со
//      строкой >= 0x48 и флагами без битов 5/6. Если такой записи нет, цикл
//      restart'ится с начала таблицы и не кончается никогда.
//   2. TableStatics наполняет LA193 внутри PrepareMiniMap. Ракушки он рождает из
//      тайлов рельефа со значением $1C..$1F.
//   3. Под -DEVICT рельеф лежит в ЛОМТЯХ верхней зоны, а раскладывает их
//      ZoneCopy — и вызывается она из Game/PrepareGame, то есть ПОСЛЕ меню.
//      В демо-режиме ломти ещё пусты: замер даёт 0 ненулевых байт из 1920 и ноль
//      кандидатов $1C..$1F.
//   4. Значит ракушек нет, в таблице остаются только сундуки (флаг $40, бит 6),
//      условие выхода LB1D4 не выполняется ни на одной записи — зависание.
//
// Эталонная Z80-сборка (SRC=src, без выселения) на том же месте даёт 16 записей
// и демо доигрывает: то есть это НЕ наследство порта, а следствие выселения
// рельефа в ломти.
//
//   node tools/verify/attract_probe.js [каталог] [cpu]
"use strict";
const fs = require("fs"), path = require("path");
const { make, readSym } = require("./harness.js");
const ROOT = path.resolve(__dirname, "../..");
const DIR = process.argv[2] || `${ROOT}/build/prod_hw`;
const CPU = process.argv[3] || "i8080";
for (const f of ["scuba.rom", "scubacod1.sym", "scubacod0.sym"])
  if (!fs.existsSync(`${DIR}/${f}`)) { console.log(`нет ${DIR}/${f}`); process.exit(2); }
const S = Object.assign({}, readSym(`${DIR}/scubacod0.sym`), readSym(`${DIR}/scubacod1.sym`));
const labs = Object.entries(S).sort((a, b) => a[1] - b[1]);
const near = pc => { let x = null; for (const [n, v] of labs) { if (v <= pc) x = [n, v]; else break; }
                     return x ? `${x[0]}+${pc - x[1]}` : "?"; };

const m = make(`${DIR}/scuba.rom`, { cpu: CPU });
let attract = 0, drawn = 0, snap = null, relief = null, laid = null;
if (S.LA193 != null) m.onPc(S.LA193, () => {
  attract++;
  if (snap) return;
  laid = S.ZoneLaid != null ? m.rd(S.ZoneLaid) : null;
  if (S.RELIEF_HI != null) {
    let nz = 0, cand = 0;
    for (let p = S.RELIEF_HI; p <= 0xff; p++) for (let l = 192; l < 256; l++) {
      const v = m.rd(p * 256 + l); if (v) nz++; if (v >= 0x1c && v < 0x20) cand++;
    }
    relief = { nz, cand, tot: (256 - S.RELIEF_HI) * 64 };
  }
});
if (S.LB1D4 != null) m.onPc(S.LB1D4, () => {
  if (snap) return;
  snap = [];
  for (let i = 0; i < 128; i++) snap.push(m.rd(S.TableStatics + i));
});
if (S.DrawGameScr != null) m.onPc(S.DrawGameScr, () => { drawn++; });

// Бут, уход с титула (в сборке -DNOTITLE клавиша просто игнорируется), затем
// ПРОСТОЙ: ничего не нажимаем, чтобы демо включилось само.
for (let i = 0; i < 300; i++) m.step();
m.key(13, true); m.run(6); m.key(13, false);
const LIM = +(process.env.AP_FRAMES || 8000);
for (let i = 0; i < LIM; i++) m.step();

console.log(`ДЕМО-РЕЖИМ МЕНЮ: ${DIR} (${CPU}), кадров ${m.frame}`);
console.log(`  входов в демо ${attract}, отрисовок экрана демо ${drawn}`);
console.log(`  PC на конце прогона: ${near(m.cpu.pc & 0xffff)}`);
if (relief) console.log(`  ломти рельефа на входе в демо: ненулевых ${relief.nz} из ${relief.tot}, ` +
                        `тайлов $1C..$1F (кандидаты в ракушки) ${relief.cand}; признак раскладки ZoneLaid=${laid}`);
if (snap) {
  let recs = 0;
  while (recs * 4 < snap.length && snap[recs * 4] !== 0x80) recs++;
  let ok = 0;
  for (let k = 0; k < recs; k++) if (snap[k * 4 + 2] >= 0x48 && !(snap[k * 4] & 0x60)) ok++;
  console.log(`  TableStatics: записей ${recs}, из них годных для LB1D4 (строка>=0x48 и флаги без $60): ${ok}`);
  console.log(`  первые записи: ${snap.slice(0, 24).map(x => x.toString(16).padStart(2, "0")).join(" ")}`);
  if (!ok) console.log("  ВЫВОД: годных записей НЕТ — цикл LB1D4 не кончится никогда, это и есть зависание");
} else console.log("  LB1D4 не достигнут — демо не входило");
if (attract && !drawn) { console.log("  ЗАВИСАНИЕ ВОСПРОИЗВЕДЕНО"); process.exit(1); }
console.log("  зависания нет");
