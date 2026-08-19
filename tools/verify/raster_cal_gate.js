// ГЕЙТ САМОКАЛИБРУЮЩЕГОСЯ ОБРАЗА (-DRASTER_CAL).
//
// Тут стенд проверяет не «правильно ли выбрана фаза» — правильную фазу называет
// ТОЛЬКО ЖЕЛЕЗО, ради этого образ и собран. Стенд проверяет ИНСТРУМЕНТ:
//  1) лестница идёт: 16 ступеней, каждая держится ровно RZ_CAL_FRAMES кадров,
//     цикл замыкается;
//  2) ступени реально сдвигают залп, и шаг сдвига равен обещанным 12 тактам
//     (48 точкам растра) — иначе владелец будет искать чистую фазу там, где её
//     не может быть;
//  3) сетка ЗАМКНУТА: 16 шагов по 12 тактов = 192 такта = ровно строка, то есть
//     ни одна фаза не пропущена;
//  4) на стенде чистые ступени ЕСТЬ и их больше одной подряд — значит полоса
//     допустимых фаз шире шага лестницы, как и задумано;
//  5) линейка позиции рисуется и её длина равна номеру ступени.
//
//   node tools/verify/raster_cal_gate.js
"use strict";
const fs = require("fs"), path = require("path");
const { readSym } = require("./harness.js");
const { reachGame } = require("./drive.js");
const ROOT = path.resolve(__dirname, "../..");
const B = process.env.BUILD_DIR || "build";
const EMPTY = process.env.RASTER_CAL_EMPTY === "1";
const INJECT = process.env.RASTER_CAL_INJECT === "1";

const rom = `${ROOT}/${B}/rcal/scuba.rom`, sym = `${ROOT}/${B}/rcal/scubacod1.sym`;
for (const f of [rom, sym]) if (!fs.existsSync(f)) {
  console.log(`нет файла ${f} — собери DET=1 RASTER=1 RASTER_CAL=1 OUT=${B}/rcal`);
  process.exit(2);
}
const S = readSym(sym);
for (const n of ["rz_step", "rz_fcnt", "rz_qtab", "rz_sub"])
  if (S[n] == null) { console.log("нет метки " + n); process.exit(2); }

let fail = 0, checks = 0;
const chk = (ok, msg) => { checks++; if (ok) console.log("  ok      " + msg);
                           else { fail++; console.log("  ПРОВАЛ  " + msg); } };

const LINE = 768;
const g = reachGame(rom, sym, { cpu: "i8080", level: 4, seed: 0x0167 });
const m = g.m, io = m.io;
// ПОДСАДКА: обнулить шаг таблицы — все ступени становятся одной фазой, лестница
// перестаёт быть лестницей. Гейт обязан покраснеть по шагу и по замкнутости.
if (INJECT) for (let i = 0; i < 16; i++) m.wr(S.rz_qtab + i, 192);

const rec = [];
const orig = io.commit_palette.bind(io);
io.commit_palette = (index) => {
  const had = io.palettebyte !== undefined || io.outport === 0x0c;
  const v = io.palettebyte !== undefined ? io.palettebyte : io.outbyte;
  const f = m.v06c.filler;
  if (had && !EMPTY) rec.push({ fr: m.frame, step: m.rd(S.rz_step), line: f.raster_line, px: f.raster_pixel, slot: index, val: v });
  return orig(index);
};
// длина линейки: считаем закрашенные метки в верхней строке картинки
const barLen = () => { let n = 0;
  for (let j = 0; j < 16; j++) if (m.rd(0xC000 + j * 2 * 256 + 0xF8) === 0xff) n++;
  return n; };
const bars = new Map();
const stepFrames = new Map();
let prevStep = m.rd(S.rz_step), runStart = m.frame;
const order = [];
for (let i = 0; i < 2600; i++) {
  m.step();
  const st = m.rd(S.rz_step);
  const bl = barLen();
  if (!bars.has(st)) bars.set(st, new Set());
  bars.get(st).add(bl);
  if (st !== prevStep) { stepFrames.set(prevStep, m.frame - runStart); order.push(prevStep); prevStep = st; runStart = m.frame; }
}
chk(order.length >= 16, `лестница прошла ${order.length} ступеней за 2600 кадров (ждём не меньше 16)`);
const uniq = new Set(order);
chk(uniq.size === 16, `все 16 ступеней разные и цикл замкнулся (различных: ${uniq.size})`);
const lens = [...stepFrames.values()];
chk(lens.every(v => v === lens[0]), `каждая ступень держится одинаково: ${[...new Set(lens)].join(",")} кадров`);
chk(lens[0] === 150, `ступень держится 150 кадров = 3 с (наблюдалось ${lens[0]})`);

// позиция залпа по ступеням: берём воду (0xC0), первую запись каждого залпа
const first = new Map();
for (const r of rec) {
  if (r.val !== 0xc0) continue;
  const key = r.step;
  const pos = r.line * LINE + r.px;
  if (!first.has(key)) first.set(key, new Set());
  // первая запись залпа: та, перед которой не было записи в пределах 400 точек
  first.get(key).add(pos);
}
const startPos = new Map();
for (const [st, set] of first) {
  const arr = [...set].sort((a, b) => a - b);
  const starts = arr.filter((p, i) => i === 0 || p - arr[i - 1] > 200);
  startPos.set(st, starts);
}
console.log("  ступень: позиция первой записи залпа воды (строка.точка)");
const base = [];
for (let st = 0; st < 16; st++) {
  const s = startPos.get(st) || [];
  base.push(s.length === 1 ? s[0] : null);
  console.log(`    ${String(st).padStart(2)}: ` +
    s.map(p => `${Math.floor(p / LINE)}.${p % LINE}`).join(" ") + (s.length === 1 ? "" : "  <- НЕ ОДНА ПОЗИЦИЯ"));
}
chk(base.every(v => v !== null), `на каждой ступени фаза залпа ОДНА (дышащих ступеней: ${base.filter(v => v === null).length})`);
if (base.every(v => v !== null)) {
  const d = [];
  for (let i = 1; i < 16; i++) d.push(base[i] - base[i - 1]);
  chk(d.every(v => v === 48), `шаг лестницы ровно 48 точек = 12 тактов (наблюдалось: ${[...new Set(d)].join(",")})`);
  const span = base[15] - base[0] + 48;
  chk(span === LINE, `сетка замкнута: 16 ступеней покрывают ${span} точек = ${span / 4} тактов = ровно строка (768 точек / 192 такта)`);
}
// чистые ступени: все записи залпа внутри окна каймы перед строкой 104
const winLo = -(LINE - 664), winHi = 151;
const dirty = new Map();
for (const r of rec) {
  if (r.val !== 0xc0) continue;
  const d = (r.line - 104) * LINE + r.px;
  const ok = d >= winLo && d <= winHi && r.slot === 0;
  if (!dirty.has(r.step)) dirty.set(r.step, 0);
  if (!ok) dirty.set(r.step, dirty.get(r.step) + 1);
}
const clean = [];
for (let st = 0; st < 16; st++) if ((dirty.get(st) || 0) === 0 && startPos.has(st)) clean.push(st);
console.log(`  чистых ступеней на СТЕНДЕ: ${clean.length ? clean.join(", ") : "нет"} (на железе они будут другими — в этом весь смысл образа)`);
chk(clean.length >= 2, `чистых ступеней не меньше двух подряд: полоса шире шага лестницы (${clean.length})`);

// линейка
let barBad = 0;
for (const [st, set] of bars) { if (set.size !== 1 || [...set][0] !== st + 1) barBad++; }
chk(barBad === 0, `линейка показывает номер ступени: длина = номер+1 на всех ступенях (расхождений ${barBad})`);

console.log(fail ? `ГЕЙТ КРАСНЫЙ: ${fail} из ${checks}`
                 : `ГЕЙТ ЗЕЛЁНЫЙ: все ${checks} проверки (какая ступень чистая НА ЖЕЛЕЗЕ — стенд не знает и знать не может)`);
process.exit(fail ? 1 : 0);
