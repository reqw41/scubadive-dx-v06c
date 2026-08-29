"use strict";
const { reachGame, KEY } = require("./drive.js");
const [rom, sym] = process.argv.slice(2, 4); const LVL = parseInt(process.argv[4] || "4", 10), NT = parseInt(process.argv[5] || "12000", 10), SEED = parseInt(process.argv[6] || "0x0167", 16);
const g = reachGame(rom, sym, { cpu: "i8080", level: LVL, seed: SEED }); const m = g.m, S = g.S;
let peak = 0, peakIdx = 0; const hist = new Map();
m.onPc(S.LD9C0, () => { let n = 0, hi = -1; for (let i = 0; i < 16; i++) if (m.rd(S.LB676 + i) & 0x80) { n++; hi = i; } if (n > peak) peak = n; if (hi > peakIdx) peakIdx = hi; hist.set(n, (hist.get(n) || 0) + 1); });
m.key(KEY.UP, true); const t0 = g.ticks; let guard = 0; while (g.ticks - t0 < NT && guard < 2500000) { m.step(); guard++; }
console.log(`ур.${LVL} сид ${SEED.toString(16)}: пик занятых страниц ${peak}, старший занятый индекс ${peakIdx}; распределение: ${[...hist.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => k + ':' + v).join(' ')}`);
