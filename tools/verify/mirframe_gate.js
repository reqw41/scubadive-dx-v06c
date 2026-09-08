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
// И СТАТИЧЕСКАЯ ПОЛОВИНА — ПО ВСЕМ ТИПАМ, А НЕ ТОЛЬКО ПО ЗЕРКАЛЬНЫМ. Признак
// обязан стоять РОВНО в наборе «влево» (+12) и ровно у тех типов, что записаны в
// LB4F0_mirtab. Появись он в другом слове — оно уходит в кадр без замка, и мусор
// вернётся другим путём; появись у типа вне таблицы — IsMirrorIY ответит «не
// зеркальный», бит уедет в адрес, и отрисовка пойдёт по ОЗУ (так и жили угорь со
// змейкой до NOEELMIR/NOSNAKEMIR).
// Дескрипторы — символы LCxxx от LC092 до LC20A; дальше идут ШАБЛОНЫ записей и код.
{ let dirty = 0, seen = 0;
  const ds = Object.entries(S).filter(([k, v]) => /^LC[0-9A-F]{3}$/.test(k) && v >= S.LC092 && v < S.LC20A)
    .sort((a, b) => a[1] - b[1]);
  for (let i = 0; i < ds.length; i++) {
    const [k, a] = ds[i], end = i + 1 < ds.length ? ds[i + 1][1] : S.LC20A;
    const sets = []; for (let o = 0x10; o + 2 <= end - a; o += 2) sets.push([o, w(a + o)]);
    if (!sets.length) continue;
    seen++;
    const flagged = sets.filter(([, v]) => v & 0x8000), isMir = MIRT.includes(a);
    if (flagged.length && !isMir) { console.log(`  ПРОВАЛ  ${k}: признак есть, а типа нет в таблице зеркальных`); dirty++; }
    if (flagged.some(([o]) => o !== 0x12)) { console.log(`  ПРОВАЛ  ${k}: признак не в наборе «влево» (+12)`); dirty++; }
    if (isMir && !flagged.length) { console.log(`  ПРОВАЛ  ${k}: тип зеркальный, а признака в наборах нет`); dirty++; }
  }
  console.log(`  ${dirty ? "ПРОВАЛ " : "ok     "} признак только в наборе «влево» и только у типов из таблицы: дескрипторов ${seen}, зеркальных ${MIRT.length}, нарушений ${dirty}`);
  bad += dirty; }
// ШАБЛОНЫ ЗАПИСЕЙ — тот же вопрос при рождении существа: в шаблоне лежат и база
// (+09/+0A), и стартовый кадр (+0B/+0C). Признак допустим только в базе.
{ let dirty = 0, seen = 0;
  const ts = Object.entries(S).filter(([k, v]) => /^LC[0-9A-F]{3}$/.test(k) && v >= S.LC20A && v < S.LC431)
    .sort((a, b) => a[1] - b[1]);
  for (const [k, a] of ts) { const base = w(a + 9), fr = w(a + 11), d = w(a + 0x13);
    // шаблон опознаём по 19-му байту: там адрес дескриптора — так же, как в живой
    // записи. Иначе в выборку попадают таблицы указателей на сами шаблоны.
    if (!(d >= S.LC092 && d < S.LC20A)) continue;
    if (!(0x1000 <= (base & 0x7fff) && (base & 0x7fff) < 0x7000)) continue;
    seen++;
    if (fr & 0x8000) { console.log(`  ПРОВАЛ  шаблон ${k}: стартовый кадр ${fr.toString(16)} с признаком`); dirty++; } }
  console.log(`  ${dirty ? "ПРОВАЛ " : "ok     "} в шаблонах записей признак только в базе: шаблонов ${seen}, нарушений ${dirty}`);
  bad += dirty; }
console.log(bad ? `ГЕЙТ КРАСНЫЙ: ${bad}` : "ГЕЙТ ЗЕЛЁНЫЙ: разворот, дескрипторы и шаблоны держат признак только в базе");
process.exit(bad ? 1 : 0);
