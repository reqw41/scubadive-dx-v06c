"use strict";
// ОСТАТКИ НА ПУСТОМ МЕСТЕ: ищем чернила, за которые никто не отвечает.
//
// Владелец увидел в игре мусор на пустой воде «от дайвера». Живой разбор в
// vector06js показал главное: рядом с пятном НЕ БЫЛО НИ ОДНОЙ записи существа,
// то есть это не кривой спрайт, а брошенные пиксели — след save-under.
//
// Кто «отвечает» за клетку: рельеф (карта занятости = 02), статический предмет
// (список на экране LB07D), живое существо (у него выдан буфер) и дайвер.
// Клетка с чернилами, которую не объясняет никто И которая держится много тиков
// подряд, — это остаток: существо ушло дальше запаса слота и не стёрло себя.
//
//   node tools/verify/residue_probe.js <rom> <sym> [уровень=4] [тиков=2000] [порог=40]
const { reachGame, KEY } = require("./drive.js");
const [rom, sym] = process.argv.slice(2, 4);
const LVL = parseInt(process.argv[4] || "4", 10), NT = parseInt(process.argv[5] || "2000", 10);
const HOLD = parseInt(process.argv[6] || "40", 10);     // сколько замеров подряд держится, чтобы считать остатком
const g = reachGame(rom, sym, { cpu: process.env.CPU || "i8080", level: LVL, seed: 0x0167 });
const m = g.m, S = g.S, w = a => m.rd(a) | (m.rd(a + 1) << 8);
const attr = (r, c) => { const a = ((r >> 3) | (r << 5)) & 0xff;
  return m.rd((((a & 0x1f) + (S.SCRATTR >> 8)) << 8) | ((a & 0xE0) | (c & 0x1f))); };
const ink = (r, c) => { for (let i = 0; i < 8; i++) { const lo = (255 - (r * 8 + i)) & 0xff;
  if (m.rd(0xC000 + c * 256 + lo) || m.rd(0xE000 + c * 256 + lo)) return true; } return false; };
const b4 = w(S.RecsAddrIV), n4 = m.rd(S.NumRecsIV);
const GS = [[S.LC4F0, 21, m.rd(S.NumRecsI)], [w(S.RecsAddrII), 26, m.rd(S.NumRecsII)],
  [w(S.RecsAddrIII), 26, m.rd(S.NumRecsIII)], [b4, 26, n4], [b4 + 26 * n4, 28, m.rd(S.NumRecsV)]];
const D = S.DiverObj;
// ФОН НАДО ИСКЛЮЧИТЬ. Первая редакция ловила ВЕСЬ верхний ряд: небо, ватерлиния
// и градиент — это чернила, за которые тоже «никто не отвечает», но они там были
// всегда. Поэтому держим ЭТАЛОН экрана: карту чернил сразу после смены экрана, и
// ищем только то, что ПОЯВИЛОСЬ поверх неё и осталось.
let ticks = 0, samples = 0, scrKey = "", settle = 0;
let base = null;                       // эталон чернил текущего экрана
const streak = new Map(), worst = new Map();
m.onPc(S.LD9C0, () => { ticks++; if (ticks % 10) return;
  const key = m.rd(S.L5B03) + "," + m.rd(S.L5B03 + 1);
  if (key !== scrKey) { scrKey = key; base = null; settle = 3; streak.clear(); return; }
  if (settle > 0) { settle--; return; }
  if (!base) { base = new Set();
    for (let r = 0; r < 24; r++) for (let c = 0; c < 32; c++) if (ink(r, c)) base.add(r + "," + c);
    return; }
  samples++;
  const busy = new Set();
  const mark = (r, c, rad) => { for (let dr = -rad; dr <= rad; dr++) for (let dc = -rad; dc <= rad; dc++) busy.add((r + dr) + "," + (c + dc)); };
  mark(m.rd(D + 1), m.rd(D), 3);                       // дайвер: кадр три клетки плюс запас
  for (const [base, sz, n] of GS) { if (base < 0x300 || n > 200) continue;
    for (let i = 0; i < n; i++) { const r = base + i * sz;
      if (m.rd(r + 7) | m.rd(r + 8)) mark(m.rd(r + 1), m.rd(r), 3); } }
  for (let i = 0; i < 48; i++) { const e = S.LB07D + i * 4;      // статические предметы на экране
    if (!(m.rd(e) | m.rd(e + 1))) continue; mark(m.rd(e + 3), m.rd(e + 2), 2); }
  for (let r = 0; r < 24; r++) for (let c = 0; c < 32; c++) {
    const k = r + "," + c;
    if (!ink(r, c) || attr(r, c) === 2 || busy.has(k) || base.has(k)) { streak.delete(k); continue; }
    const s = (streak.get(k) || 0) + 1; streak.set(k, s);
    if (s > (worst.get(k) || 0)) worst.set(k, s);
  } });
let row0 = m.rd(S.L5B03 + 1), chk = 0, rot = -1, guard = 0;
while (ticks < NT && guard++ < 900000) { const row = m.rd(S.L5B03 + 1);
  m.key(KEY.UP, true); m.key(KEY.RIGHT, rot >= 0 && guard < rot); m.step();
  if (guard - chk >= 60) { if (row <= row0) rot = guard + 25; row0 = row; chk = guard; } }
const bad = [...worst.entries()].filter(([, s]) => s >= HOLD).sort((a, b) => b[1] - a[1]);
console.log(`уровень ${LVL}: тиков ${ticks}, замеров ${samples}, порог держания ${HOLD} замеров (${HOLD * 10} тиков)`);
if (!bad.length) console.log("  остатков не найдено");
for (const [k, s] of bad.slice(0, 12)) console.log(`  клетка ${k}: держалась ${s} замеров подряд (${s * 10} тиков)`);
process.exit(bad.length ? 1 : 0);
