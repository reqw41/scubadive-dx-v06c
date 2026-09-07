"use strict";
// ПЕРИОДЫ СКОРОСТИ ПО ТИПАМ — то, что задаёт «ощущение» и не зависит от сцены.
// Шаг существа происходит раз в (+0E) единиц времени, значит шагов/с = (единиц/с)/период.
// Единицы у нас откалиброваны по ZX, поэтому совпадение периодов = совпадение темпа.
// Снимаем сразу после старта партии, до того как лодка успеет разогнаться.
//   [CPU=z80] node tools/verify/period_parity.js <rom> <sym> [level=1]
const { reachGame } = require("./drive.js");
const [rom, sym] = process.argv.slice(2, 4);
const LVL = parseInt(process.argv[4] || "1", 10);
const g = reachGame(rom, sym, { cpu: process.env.CPU || "i8080", level: LVL, seed: 0x0167 });
const m = g.m, S = g.S;
const NAME = { LC092: "лодка", LC0A2: "медуза", LC0B2: "круглая рыба", LC0EA: "рыба", LC102: "акула",
  LC11A: "длинная рыба", LC14A: "кальмар малый г.", LC166: "кальмар малый в.", LC182: "угорь г.",
  LC19E: "угорь в.", LC1BA: "змейка г.", LC1D6: "змейка в.", LC1F2: "кальмар" };
const TYPES = {}; for (const [n, a] of Object.entries(S)) if (/^LC[0-9A-F]{3}$/.test(n)) TYPES[a] = NAME[n] || n;
const w = a => m.rd(a) | (m.rd(a + 1) << 8);
for (let i = 0; i < 60; i++) m.step();
const b4 = w(S.RecsAddrIV), n4 = m.rd(S.NumRecsIV);
const groups = [[S.LC4F0, 21, m.rd(S.NumRecsI)], [w(S.RecsAddrII), 26, m.rd(S.NumRecsII)],
  [w(S.RecsAddrIII), 26, m.rd(S.NumRecsIII)], [b4, 26, n4], [b4 + 26 * n4, 28, m.rd(S.NumRecsV)]];
const per = {};
for (const [base, sz, n] of groups) for (let i = 0; i < n; i++) {
  const r = base + i * sz, t = TYPES[w(r + 19)]; if (!t) continue;
  const p = m.rd(r + 0x0E); (per[t] = per[t] || {})[p] = (per[t][p] || 0) + 1;
}
console.log(`уровень ${LVL}: период (+0E) -> сколько существ`);
for (const [t, h] of Object.entries(per).sort())
  console.log(`  ${t.padEnd(17)} ${Object.entries(h).sort((a, b) => a[0] - b[0]).map(([p, n]) => `${p}×${n}`).join(" ")}`);
