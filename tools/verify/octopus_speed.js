"use strict";
// СКОРОСТЬ ОСЬМИНОГА: смен фазы в секунду, пока он на экране (флаг L9C50).
// Фаза — L9C55, задержка — L5B0E (10/8/6/4 по уровню). Та же мера для ZX:
// tools/verify/zx/octopus_speed.lua (адреса меток = адреса ZX).
//   [CPU=z80] node tools/verify/octopus_speed.js <rom> <sym> [level=1] [frames=6000]
const { reachGame, KEY } = require("./drive.js");
const [rom, sym] = process.argv.slice(2, 4);
const LVL = parseInt(process.argv[4] || "1", 10), NF = parseInt(process.argv[5] || "6000", 10);
const g = reachGame(rom, sym, { cpu: process.env.CPU || "i8080", level: LVL, seed: 0x0167 });
const m = g.m, S = g.S;
let draws = 0; if (S.LB346 != null) m.onPc(S.LB346, () => draws++);
let onScr = 0, changes = 0, prev = m.rd(S.L9C55), f0 = m.frame;
let row0 = m.rd(S.L5B03 + 1), chk = 0, rot = -1, explo = 0;
if (S.DiverExplosion != null) m.onPc(S.DiverExplosion, () => explo++);
for (let f = 0; f < NF && !explo; f++) {
  const row = m.rd(S.L5B03 + 1);
  m.key(KEY.UP, true); m.key(KEY.RIGHT, rot >= 0 && f < rot);
  m.step();
  if (f - chk >= 60) { if (row <= row0) rot = f + 25; row0 = row; chk = f; }
  if (f < 200) continue;
  if (m.rd(S.L9C50)) { onScr++; const p = m.rd(S.L9C55); if (p !== prev) changes++; prev = p; }
}
const s = (m.frame - f0) / 50, os = onScr / 50;
console.log(`уровень ${LVL}: осьминог на экране ${os.toFixed(1)} с из ${s.toFixed(0)}; смен фазы ${changes}` +
  (os > 0.5 ? ` = ${(changes / os).toFixed(1)}/с` : " (мало времени на экране)") +
  `; задержка (L5B0E) ${m.rd(S.L5B0E)}, отрисовок ${draws}${explo ? ", оборвано гибелью" : ""}`);
