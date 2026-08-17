// Профиль НАШЕЙ i8080-сборки в тактах Вектора: где уходит бюджет кадра.
// Такты берём у самого ядра (cpu.vcycles за предыдущую инструкцию) — это
// реальные такты Вектора, а не оценка.
//   node tools/verify/prof8080.js <rom> <sym> [ticks=400] [level=4] [cpu=i8080]
"use strict";
const fs = require("fs");
const { reachGame, KEY } = require("./drive.js");
const { readSym } = require("./harness.js");

const rom = process.argv[2], sym = process.argv[3];
const NT = parseInt(process.argv[4] || "400", 10);
const LVL = parseInt(process.argv[5] || "4", 10);
const CPU = process.argv[6] || "i8080";

const S = readSym(sym);
const labs = Object.entries(S).filter(([k, v]) => v >= 0x100 && v < 0xc000)
                   .sort((a, b) => a[1] - b[1]);
function proc(a) { let lo = 0, hi = labs.length - 1, x = null;
  while (lo <= hi) { const m = (lo + hi) >> 1;
    if (labs[m][1] <= a) { x = labs[m]; lo = m + 1; } else hi = m - 1; }
  return x ? x[0] : "?"; }

const g = reachGame(rom, sym, { cpu: CPU, level: LVL, seed: 0x0167 });
const cyc = new Float64Array(0x10000);
const cnt = new Uint32Array(0x10000);
// ВАЖНО: не подменяем check_breakpoint целиком — там сидит диспетчер крючков
// стенда (в том числе счётчик тиков). Оборачиваем.
let prev = -1, on = false;
const origCb = g.m.v06c.check_breakpoint;
g.m.v06c.check_breakpoint = () => {
  const r = origCb();
  if (on && prev >= 0) { cyc[prev] += g.m.cpu.vcycles || 0; }
  prev = g.m.cpu.pc & 0xffff;
  if (on) cnt[prev]++;
  return r;
};
let ticks = 0;
g.m.onPc(S.LD9C0, () => { ticks++; });
on = true;
const f0 = g.m.frame;
let guard = 0;
while (ticks < NT && guard < 200000) { g.m.step(); guard++; }
const frames = g.m.frame - f0;

const agg = new Map(), aggc = new Map();
let total = 0, totc = 0;
for (let a = 0; a < 0x10000; a++) {
  if (!cnt[a]) continue;
  const p = proc(a);
  agg.set(p, (agg.get(p) || 0) + cyc[a]);
  aggc.set(p, (aggc.get(p) || 0) + cnt[a]);
  total += cyc[a]; totc += cnt[a];
}
console.log(`=== ${rom} ядро=${CPU} уровень=${LVL}: ${ticks} тиков, ${frames} кадров`);
console.log(`    ${(frames / ticks).toFixed(2)} кадра на тик; ${(total / ticks).toFixed(0)} тактов/тик при бюджете кадра 59904`);
console.log(`    инструкций/тик ${(totc / ticks).toFixed(0)}`);
console.log("--- ТОП-25 по ТАКТАМ ---");
for (const [p, c] of [...agg.entries()].sort((x, y) => y[1] - x[1]).slice(0, 25))
  console.log(`  ${String(Math.round(c / ticks)).padStart(7)} тактов/тик  ${(100 * c / total).toFixed(1).padStart(5)}%  ${p}`);
