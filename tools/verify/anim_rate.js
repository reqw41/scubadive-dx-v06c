"use strict";
// ТЕМП АНИМАЦИИ ПО ТИПАМ СУЩЕСТВ. Ловим сборку кадра (LB3E9) и смотрим, чей это
// тип: описатель лежит в IY (z80_iy). Мера — сборок кадра в секунду на одно
// существо этого типа на экране. Работает одинаково для всех групп, потому что
// не зависит от раскладки записей. Для ZX — tools/verify/zx/anim_rate.lua (там
// адреса описателей LCxxx и есть адреса ZX).
//   [CPU=z80] node tools/verify/anim_rate.js <rom> <sym> [level=1] [frames=6000]
const { reachGame, KEY } = require("./drive.js");
const [rom, sym] = process.argv.slice(2, 4);
const LVL = parseInt(process.argv[4] || "1", 10), NF = parseInt(process.argv[5] || "6000", 10);
const g = reachGame(rom, sym, { cpu: process.env.CPU || "i8080", level: LVL, seed: 0x0167 });
const m = g.m, S = g.S;
const TYPES = {}; for (const [n, a] of Object.entries(S)) if (/^LC[0-9A-F]{3}$/.test(n)) TYPES[a] = n;
const NAME = { LC092: "лодка", LC0A2: "медуза", LC0B2: "круглая рыба", LC0EA: "рыба", LC102: "акула",
  LC11A: "длинная рыба", LC14A: "кальмар малый г.", LC166: "кальмар малый в.", LC182: "угорь г.",
  LC19E: "угорь в.", LC1BA: "змейка г.", LC1D6: "змейка в.", LC1F2: "кальмар" };
const cnt = {};
m.onPc(S.LB3E9, () => { const iy = m.rd(S.z80_iy) | (m.rd(S.z80_iy + 1) << 8);
  const t = TYPES[iy] || ("?" + iy.toString(16)); cnt[t] = (cnt[t] || 0) + 1; });
let oct = 0; if (S.LB346 != null) m.onPc(S.LB346, () => oct++);
let row0 = m.rd(S.L5B03 + 1), chk = 0, rot = -1, explo = 0, f0 = 0;
if (S.DiverExplosion != null) m.onPc(S.DiverExplosion, () => explo++);
for (let f = 0; f < NF && !explo; f++) {
  const row = m.rd(S.L5B03 + 1);
  m.key(KEY.UP, true); m.key(KEY.RIGHT, rot >= 0 && f < rot);
  m.step();
  if (f - chk >= 60) { if (row <= row0) rot = f + 25; row0 = row; chk = f; }
  if (f === 200) { for (const k in cnt) delete cnt[k]; oct = 0; f0 = m.frame; }
}
const s = (m.frame - f0) / 50;
console.log(`уровень ${LVL}, окно ${s.toFixed(0)} с${explo ? " (оборвано гибелью)" : ""}:`);
for (const [t, n] of Object.entries(cnt).sort((a, b) => b[1] - a[1]))
  console.log(`  ${(NAME[t] || t).padEnd(18)} ${(n / s).toFixed(1)} сборок/с`);
console.log(`  ${"осьминог".padEnd(18)} ${(oct / s).toFixed(1)} отрисовок/с`);
