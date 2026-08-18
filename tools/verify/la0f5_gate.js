// ГЕЙТ ЭКВИВАЛЕНТНОСТИ LA0F5 НА ПОЛНОМ ПЕРЕБОРЕ ВХОДОВ.
//
// LA0F5 переводит знакоместные координаты (H = строка, L = столбец) в адрес в
// блоке рельефа. Этап G.1 заменил в ней два развёрнутых блока однобитных сдвигов
// на прямую разрядную идиому. Замена обязана быть ТОЧНОЙ, поэтому сверяются не
// отдельные случаи, а ВСЕ 65536 сочетаний HL: процедура вызывается по-настоящему,
// инструкция за инструкцией, в двух сборках, и сравнивается выходной HL.
//
// Эталон — КОНТРОЛЬНАЯ СУММА всех 65536 результатов, снятая со сборки ДО правки
// G.1 и замороженная в tools/verify/ref/la0f5_all.md5. Первая версия гейта вместо
// этого пересобирала старый коммит на каждом прогоне: набор из-за неё перевалил за
// десять минут и упёрся в таймаут, да ещё и зависел от зашитого номера коммита.
//
//   node tools/verify/la0f5_gate.js [<rom> <sym>]
//   LA0F5_FREEZE=1 — пересоздать эталон (только осознанно!)
//   LA0F5_EMPTY=1  — обнулить выборку, гейт обязан покраснеть
"use strict";
const { make, readSym } = require("./harness.js");
const RET_SENTINEL = 0x0002;          // адрес-ловушка: туда «вернётся» процедура

function runAll(rom, sym) {
  const S = readSym(sym);
  if (S.LA0F5 == null) { console.log("нет метки LA0F5 в " + sym); process.exit(2); }
  if (S.LA4DD == null) { console.log("нет метки LA4DD в " + sym); process.exit(2); }
  const m = make(rom, { cpu: "i8080" });
  for (let f = 0; f < 200; f++) m.step();      // дать буту распаковаться
  const cpu = m.cpu, out = new Int32Array(65536);
  for (let hl = 0; hl < 65536; hl++) {
    cpu.sp = 0x7F00;
    m.wr(0x7EFE, RET_SENTINEL & 0xff); m.wr(0x7EFF, RET_SENTINEL >> 8);
    cpu.sp = 0x7EFE;
    cpu.pc = S.LA0F5;
    cpu.set_reg(4, hl >> 8); cpu.set_reg(5, hl & 0xff);
    let guard = 0;
    while ((cpu.pc & 0xffff) !== RET_SENTINEL && guard++ < 400) cpu.instruction();
    if (guard >= 400) { console.log(`  ПРОВАЛ  вход 0x${hl.toString(16)}: процедура не вернулась`); process.exit(1); }
    // НОРМИРОВКА ОБЯЗАТЕЛЬНА: процедура возвращает АБСОЛЮТНЫЙ адрес в таблице
    // рельефа (индекс + LA4DD), а сама таблица между сборками переезжает —
    // правка меняет размер кода. Без вычитания базы гейт краснел бы на всех
    // 65536 входах ровно на величину переезда (замерено: 0x4C) и говорил бы не
    // о вычислении, а о раскладке.
    out[hl] = ((cpu.reg(4) << 8) | cpu.reg(5)) - S.LA4DD;
  }
  return out;
}

const fs = require("fs"), path = require("path"), crypto = require("crypto");
const ROOT = path.resolve(__dirname, "../..");
const B = process.env.BUILD_DIR || "build";
const rom = process.argv[2] || `${ROOT}/${B}/src8080/scuba.rom`;
const sym = process.argv[3] || `${ROOT}/${B}/src8080/scubacod1.sym`;
const refP = `${ROOT}/tools/verify/ref/la0f5_all.md5`;

const res = process.env.LA0F5_EMPTY === "1" ? new Int32Array(0) : runAll(rom, sym);
if (res.length === 0) {
  console.log("  ПРОВАЛ  ПУСТАЯ ВЫБОРКА: ни одного входа не прогнано");
  console.log("ГЕЙТ НЕДЕЙСТВИТЕЛЕН"); process.exit(2);
}
const sum = crypto.createHash("md5").update(Buffer.from(res.buffer)).digest("hex");
if (process.env.LA0F5_FREEZE === "1") {
  fs.writeFileSync(refP, sum + "\n");
  console.log("эталон пересоздан: " + sum); process.exit(0);
}
const ref = fs.readFileSync(refP, "utf8").trim();
if (sum === ref) {
  console.log(`  ok      LA0F5: все 65536 сочетаний HL дают тот же адрес, что и до правки (${sum.slice(0,8)})`);
  console.log("ГЕЙТ ЗЕЛЁНЫЙ: все 1 проверки"); process.exit(0);
}
console.log(`  ПРОВАЛ  LA0F5: свод результатов разошёлся с эталоном (${sum.slice(0,8)} против ${ref.slice(0,8)})`);
console.log("ГЕЙТ КРАСНЫЙ: 1 из 1"); process.exit(1);
