"use strict";
// Распределение стоимости тика: сколько тиков не влезают в кадр (59904 тактов)
const { reachGame, KEY } = require("./drive.js");
const [rom, sym] = process.argv.slice(2, 4); const LVL = parseInt(process.argv[4] || "4", 10), NT = parseInt(process.argv[5] || "3000", 10), CPU = process.argv[6] || "i8080";
const g = reachGame(rom, sym, { cpu: CPU, level: LVL, seed: 0x0167 }); const m = g.m, S = g.S;
let acc = 0, prevPc = -1, on = false; const ticks = []; const cb = m.v06c.check_breakpoint;
m.v06c.check_breakpoint = () => { const r = cb(); if (on && prevPc >= 0) acc += m.cpu.vcycles || 0; prevPc = m.cpu.pc & 0xffff; return r; };
m.onPc(S.LD9C0, () => { if (on) ticks.push(acc); acc = 0; });
on = true; m.key(KEY.UP, true); let guard = 0; while (ticks.length < NT && guard < 1500000) { m.step(); guard++; }
ticks.sort((a, b) => a - b); const n = ticks.length, F = 59904;
const pct = p => ticks[Math.min(n - 1, Math.floor(n * p))];
const over = ticks.filter(t => t > F).length, over2 = ticks.filter(t => t > 2 * F).length;
console.log(`${rom} ур.${LVL} ${CPU}: тиков ${n}, медиана ${pct(0.5)}, 90% ${pct(0.9)}, 99% ${pct(0.99)}, макс ${ticks[n - 1]}; тиков дольше кадра ${over} (${(100 * over / n).toFixed(1)}%), дольше двух кадров ${over2}`);
