"use strict";
// НОРМИРОВАННАЯ СКОРОСТЬ СУЩЕСТВ ПО ТИПАМ, ВСЕ ГРУППЫ I..V.
// На каждом кадре берём записи, попавшие в окно экрана, и копим по ТИПУ
// (описатель лежит в 19-м байте записи у всех групп — проверено): кадров на
// экране и шагов (смена клетки+сдвига). Итог — шагов в секунду НА ОДНО существо
// этого типа, то есть мера, не зависящая от того, сколько их сейчас видно.
// Позиция: (+0)=столбец, (+1)=строка карты 0..255, (+2)/(+3) — сдвиг 0..7.
//   [CPU=z80] node tools/verify/creature_parity.js <rom> <sym> [level=1] [frames=6000]
const { reachGame, KEY } = require("./drive.js");
const [rom, sym] = process.argv.slice(2, 4);
const LVL = parseInt(process.argv[4] || "1", 10), NF = parseInt(process.argv[5] || "6000", 10);
const g = reachGame(rom, sym, { cpu: process.env.CPU || "i8080", level: LVL, seed: 0x0167 });
const m = g.m, S = g.S;
const NAME = { LC092: "лодка", LC0A2: "медуза", LC0B2: "круглая рыба", LC0EA: "рыба", LC102: "акула",
  LC11A: "длинная рыба", LC14A: "кальмар малый г.", LC166: "кальмар малый в.", LC182: "угорь г.",
  LC19E: "угорь в.", LC1BA: "змейка г.", LC1D6: "змейка в.", LC1F2: "кальмар" };
const TYPES = {}; for (const [n, a] of Object.entries(S)) if (/^LC[0-9A-F]{3}$/.test(n)) TYPES[a] = NAME[n] || n;
const w = a => m.rd(a) | (m.rd(a + 1) << 8);
const groups = () => { const b4 = w(S.RecsAddrIV), n4 = m.rd(S.NumRecsIV);
  return [[S.LC4F0, 21, m.rd(S.NumRecsI)], [w(S.RecsAddrII), 26, m.rd(S.NumRecsII)],
          [w(S.RecsAddrIII), 26, m.rd(S.NumRecsIII)], [b4, 26, n4], [b4 + 26 * n4, 28, m.rd(S.NumRecsV)]]; };
const acc = {}; const prev = new Map();
let explo = 0; if (S.DiverExplosion != null) m.onPc(S.DiverExplosion, () => explo++);
let row0 = m.rd(S.L5B03 + 1), chk = 0, rot = -1, f0 = 0;
for (let f = 0; f < NF && !explo; f++) {
  const row = m.rd(S.L5B03 + 1);
  m.key(KEY.UP, true); m.key(KEY.RIGHT, rot >= 0 && f < rot);
  m.step();
  if (f - chk >= 60) { if (row <= row0) rot = f + 25; row0 = row; chk = f; }
  if (f === 200) { for (const k in acc) delete acc[k]; prev.clear(); f0 = m.frame; }
  if (f < 200) continue;
  const scol = m.rd(S.L5B0B), srow = m.rd(S.L5B0B + 1);
  for (const [base, sz, n] of groups()) for (let i = 0; i < n; i++) {
    const r = base + i * sz, col = m.rd(r), rw = m.rd(r + 1);
    const dc = (col - scol) & 0xff, dr = (rw - srow) & 0xff;
    const key = base + ":" + i;
    if (dc >= 36 || dr >= 24) { prev.delete(key); continue; }
    const t = TYPES[w(r + 19)]; if (!t) continue;
    const x = col * 8 + m.rd(r + 2), y = rw * 8 + m.rd(r + 3);
    const A = acc[t] || (acc[t] = { fr: 0, steps: 0, px: 0, ids: new Set() });
    A.fr++; A.ids.add(key);
    const p = prev.get(key);
    if (p) { const d = Math.abs(x - p[0]) + Math.abs(y - p[1]); if (d > 0 && d < 64) { A.steps++; A.px += d; } }
    prev.set(key, [x, y]);
  }
}
const s = (m.frame - f0) / 50;
console.log(`уровень ${LVL}, окно ${s.toFixed(0)} с${explo ? " (оборвано гибелью)" : ""}:`);
for (const [t, A] of Object.entries(acc).sort((a, b) => b[1].fr - a[1].fr)) {
  const cs = A.fr / 50;   // существо-секунд на экране
  console.log(`  ${t.padEnd(17)} ${(A.steps / cs).toFixed(2)} шаг/с  ${(A.px / cs).toFixed(1)} px/с  (на экране ${cs.toFixed(0)} существо-с, разных ${A.ids.size})`);
}
