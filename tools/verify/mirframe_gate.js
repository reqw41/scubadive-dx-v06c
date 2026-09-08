"use strict";
// ГЕЙТ ЧИСТОГО КАДРА ПРИ РАЗВОРОТЕ.
//
// Признак зеркальности набора живёт в старшем бите базы (запись +09/+0A). Текущий
// кадр (+0B/+0C) обязан быть ЧИСТЫМ: по нему идёт арифметика анимации (шаг на
// кадр, сравнение с $FF), и грязный указатель уезжает в ОЗУ — существо рисуется
// мусором. Замок стоял в LB95D и ОТСУТСТВОВАЛ в её близнеце LBA4F; дефект пойман
// 2026-09-08 на паузе у владельца (группа V, запись 701b: база 9178, кадр 9280).
//
// Гейт зовёт обе процедуры разворота напрямую: IX = запись, HL = адрес набора со
// старшим битом. Проверяет: у ЗЕРКАЛЬНОГО типа база бит сохранила, кадр — нет;
// у НЕзеркального бит остаётся и в кадре (там он часть адреса, см. дайвера).
//   node tools/verify/mirframe_gate.js <rom> <sym>
//   MF3_INJECT=1 — искусственно испортить вердикт (негативный контроль)
const { reachGame } = require("./drive.js");
const [rom, sym] = process.argv.slice(2, 4);
const g = reachGame(rom, sym, { cpu: "i8080", level: 1, seed: 0x0167 });
const m = g.m, S = g.S, w = a => m.rd(a) | (m.rd(a + 1) << 8);
const N = S.MIRTAB_N;                      // длина таблицы — из .sym, а не «до нуля»
const MIRT = []; for (let i = 0; i < N; i++) MIRT.push(w(S.LB4F0_mirtab + i * 2));
if (!MIRT.length) { console.log("  ПРОВАЛ  таблица зеркальных типов пуста"); process.exit(2); }
const REC = S.LC4F0;                       // первая запись группы I — рабочая площадка
const SET = 0x1178;                        // любой адрес набора в спрайтовой области
let bad = 0;
const call = (entry, desc, hl) => {
  m.wr(REC + 19, desc & 0xff); m.wr(REC + 20, desc >> 8);
  m.wr(S.z80_ix, REC & 0xff); m.wr(S.z80_ix + 1, REC >> 8);
  m.wr(REC + 9, 0); m.wr(REC + 10, 0); m.wr(REC + 11, 0); m.wr(REC + 12, 0);
  m.cpu.set_h(hl >> 8); m.cpu.set_l(hl & 0xff);
  const RET = 0x0000, sp = (m.cpu.sp - 2) & 0xffff;
  m.wr(sp, RET & 0xff); m.wr(sp + 1, RET >> 8); m.cpu.sp = sp; m.cpu.pc = entry;
  for (let i = 0; i < 3000 && (m.cpu.pc & 0xffff) !== RET; i++) m.cpu.instruction();   // по одной команде, а не по кадру
  return { base: w(REC + 9), frame: w(REC + 11) };
};
const check = (name, entry, desc, mir) => {
  const r = call(entry, desc, SET | 0x8000);
  const okBase = (r.base & 0x8000) !== 0 && (r.base & 0x7fff) === SET;
  const okFrame = mir ? r.frame === SET : r.frame === (SET | 0x8000);
  const ok = okBase && okFrame && process.env.MF3_INJECT !== "1";
  console.log(`  ${ok ? "ok     " : "ПРОВАЛ "} ${name}: база ${r.base.toString(16)} (бит 15 ${(r.base & 0x8000) ? "цел" : "ПОТЕРЯН"}), кадр ${r.frame.toString(16)} ${mir ? "(зеркальный тип: бит обязан быть снят)" : "(незеркальный: бит — часть адреса)"}`);
  if (!ok) bad++;
};
for (const [nm, entry] of [["LB95D", S.LB95D], ["LBA4F", S.LBA4F]]) {
  if (entry === undefined) { console.log(`  ПРОВАЛ  нет символа ${nm}`); bad++; continue; }
  check(`${nm}, зеркальный тип`, entry, MIRT[0], true);
  check(`${nm}, незеркальный тип`, entry, 0x0001, false);
}
// И статическая половина: признак стоит РОВНО в одном слове дескриптора — наборе
// «влево» ($12/$13). На этом держится весь разбор выше: остальные слова ($10,
// $14, $16, $18, $1A) уходят в кадр без замка, и появись бит там — мусор вернётся
// другим путём. Проверяем все зеркальные типы из таблицы.
{ let dirty = 0, seen = 0;
  for (const d of MIRT) { seen++;
    for (const off of [0x10, 0x14, 0x16, 0x18, 0x1a]) if (w(d + off) & 0x8000) {
      console.log(`  ПРОВАЛ  тип ${d.toString(16)}: признак зеркала в слове +${off.toString(16)}, а не только в +12`); dirty++; }
    if (!(w(d + 0x12) & 0x8000)) { console.log(`  ПРОВАЛ  тип ${d.toString(16)}: в наборе «влево» (+12) признака нет`); dirty++; } }
  console.log(`  ${dirty ? "ПРОВАЛ " : "ok     "} признак только в наборе «влево»: типов ${seen}, нарушений ${dirty}`);
  bad += dirty; }
console.log(bad ? `ГЕЙТ КРАСНЫЙ: ${bad}` : "ГЕЙТ ЗЕЛЁНЫЙ: разворот кладёт признак в базу и чистый кадр, признак только в наборе «влево»");
process.exit(bad ? 1 : 0);
