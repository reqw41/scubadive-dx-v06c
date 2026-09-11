"use strict";
// ОСТАТКИ С ТОЧНОЙ ПРИНАДЛЕЖНОСТЬЮ. Прежние редакции считали «свой» след
// существа то радиусом, то шириной из дескриптора, а последняя вообще сравнивала
// КАРТОЧНЫЕ координаты записи (+0/+1) с ЭКРАННОЙ клеткой — и «никого не находила»
// там, где сторож записи видел работу блита.
// Здесь принадлежность берётся У САМОГО БЛИТА: на LB4C4 (сразу после клипа)
// известны экранный столбец (IY+$02), экранная строка (IY+$03), ОБРЕЗАННАЯ
// ширина (регистр B) и высота в знакоместах (IY+$09). Это ровно то, что будет
// нарисовано, без догадок.
const { reachGame, KEY } = require("./drive.js");
const [rom, sym] = process.argv.slice(2, 4);
const NT = parseInt(process.argv[4] || "1031", 10), HOLD = parseInt(process.argv[5] || "30", 10);
const g = reachGame(rom, sym, { cpu: "i8080", level: 4, seed: 0x0167 });
const m = g.m, S = g.S, w = a => m.rd(a) | (m.rd(a + 1) << 8);
const attr = (r, c) => { const a = ((r >> 3) | (r << 5)) & 0xff;
  return m.rd((((a & 0x1f) + (S.SCRATTR >> 8)) << 8) | ((a & 0xE0) | (c & 0x1f))); };
const ink = (r, c) => { for (let i = 0; i < 8; i++) { const lo = (255 - (r * 8 + i)) & 0xff;
  if (m.rd(0xC000 + c * 256 + lo) || m.rd(0xE000 + c * 256 + lo)) return true; } return false; };
let ticks = 0, samples = 0, scrKey = "", settle = 0, base = null;
let drawn = [];                       // след блита за текущий тик
const streak = new Map(), worst = new Map(), lastOwner = new Map();
// z80_ix на входе в LB4C4 ещё указывает на ЗАПИСЬ существа (перестановка на
// маску идёт следующими командами) — по ней и опознаём виновника.
const TYPE = {}; for (const [n, a] of Object.entries(S)) if (/^LC[0-9A-F]{3}$/.test(n)) TYPE[a] = n;
const trail = [];      // история отрисовок у интересной клетки
m.onPc(S.LB4C4, () => { const iy = w(S.z80_iy), ix = w(S.z80_ix);
  const d = { col: m.rd(iy + 2), row: m.rd(iy + 3), w: m.cpu.b(), h: m.rd(iy + 9) || 1, iy, ix,
              полн: m.rd(iy + 7), тип: TYPE[w(ix + 19)] || "?" };
  drawn.push(d);
  // ровно те отрисовки, что накрывают спорную клетку (9,30)
  const RC = (process.env.CELL || "9,30").split(",").map(Number);
  if (d.row - 1 <= RC[0] && RC[0] <= d.row + d.h && d.col - 1 <= RC[1] && RC[1] <= d.col + d.w)
    trail.push(`тик ${ticks}: ${d.тип} запись ${ix.toString(16)} на (стр ${d.row}, стлб ${d.col}), ширина ${d.полн} -> ${d.w}, высота ${d.h}`); });
// СЛЕД ЖИВЁТ ДО СЛЕДУЮЩЕЙ ОТРИСОВКИ ЭТОГО ЖЕ СУЩЕСТВА. Медуза перерисовывается
// раз в полсотни тиков, и между её отрисовками клетка «ничья» — из-за этого
// прошлая редакция объявила остатком место, где спокойно висит живая медуза.
const lastFoot = new Map();          // запись -> её последний след
m.onPc(S.LD9C0, () => { ticks++;
  for (const d of drawn) lastFoot.set(d.ix, d);
  drawn = [];
  const cover = new Map();
  // ДАЙВЕР НЕ ИДЁТ ЧЕРЕЗ LB4C4 — у него свой тракт (LE21A), и без этой строки его
  // собственные пиксели объявлялись ничейными: в длинном прогоне так вышло шесть
  // «остатков» в строках 15-18, ровно там, где он и плавает.
  { const dr = m.rd(S.DiverObj + 1), dc = m.rd(S.DiverObj);
    for (let r = dr - 1; r <= dr + 3; r++) for (let c = dc - 1; c <= dc + 3; c++) cover.set(r + "," + c, "дайвер"); }
  for (const d of lastFoot.values()) for (let r = d.row - 1; r <= d.row + d.h; r++) for (let c = d.col - 1; c <= d.col + d.w; c++)
    cover.set(r + "," + c, d.ix);
  if (ticks % 10) return;
  const key = m.rd(S.L5B03) + "," + m.rd(S.L5B03 + 1);
  if (key !== scrKey) { scrKey = key; base = null; settle = 3; streak.clear(); return; }
  if (settle > 0) { settle--; return; }
  if (!base) { base = new Set();
    for (let r = 0; r < 24; r++) for (let c = 0; c < 32; c++) if (ink(r, c)) base.add(r + "," + c);
    return; }
  samples++;
  for (let r = 0; r < 24; r++) for (let c = 0; c < 32; c++) { const k = r + "," + c;
    if (cover.has(k)) lastOwner.set(k, { iy: cover.get(k), t: ticks });
    if (!ink(r, c) || attr(r, c) === 2 || cover.has(k) || base.has(k)) { streak.delete(k); continue; }
    const s = (streak.get(k) || 0) + 1; streak.set(k, s);
    if (s > (worst.get(k) || 0)) worst.set(k, s); } });
// РЕЖИМ БОГА НА ВРЕМЯ ЗАМЕРА: без него прогон кончается на ~2600 тике (дайвер
// гибнет, игра уходит в меню), и длинную выдержку не получить. На отрисовку это
// не влияет: бог только пропускает смертельную ветку.
if (S.god_on) m.wr(S.god_on, 1);
let row0 = m.rd(S.L5B03 + 1), chk = 0, rot = -1, guard = 0;
while (ticks < NT && guard++ < 900000) { const row = m.rd(S.L5B03 + 1);
  m.key(KEY.UP, true); m.key(KEY.RIGHT, rot >= 0 && guard < rot); m.step();
  if (guard - chk >= 60) { if (row <= row0) rot = guard + 25; row0 = row; chk = guard; } }
const bad = [...worst.entries()].filter(([, s]) => s >= HOLD).sort((a, b) => b[1] - a[1]);
console.log(`тиков ${ticks}, замеров ${samples}, порог ${HOLD}: остатков ${bad.length}`);
for (const [k, s] of bad.slice(0, 8)) { const o = lastOwner.get(k);
  console.log(`  клетка ${k}: ${s} замеров подряд; последним накрывал ${o ? "блит на тике " + o.t : "никто"}`); }
console.log(`отрисовок, накрывавших клетку ${process.env.CELL || "9,30"}: ${trail.length}`);
for (const t of trail.slice(-10)) console.log("  " + t);
