"use strict";
// Обращения к верхней четверти SCRATTR (строки 24..31): адрес, PC, чтение/запись
const { reachGame, KEY } = require("./drive.js");
const { readSym } = require("./harness.js");
const [rom, sym] = process.argv.slice(2, 4); const LVL = parseInt(process.argv[4] || "4", 10), NT = parseInt(process.argv[5] || "12000", 10), SEED = parseInt(process.argv[6] || "0x0167", 16);
const S = readSym(sym); const S1 = readSym(sym.replace(/scubacod1\.sym$/, "scubacod1.sym"));
const labs = Object.entries(S).filter(([k, v]) => v >= 0x100 && v < 0xc000).sort((a, b) => a[1] - b[1]);
function proc(a) { let lo = 0, hi = labs.length - 1, x = null; while (lo <= hi) { const m = (lo + hi) >> 1; if (labs[m][1] <= a) { x = labs[m]; lo = m + 1; } else hi = m - 1; } return x ? x[0] : "?"; }
const g = reachGame(rom, sym, { cpu: "i8080", level: LVL, seed: SEED }); const m = g.m;
const LO = S.SCRATTR + 768, HI = S.SCRATTR + 1024; const hits = new Map(); let lo3 = 0;
const r0 = m.memory.read.bind(m.memory), w0 = m.memory.write.bind(m.memory);
m.memory.read = (a, st) => { a &= 0xffff; const pc = m.cpu.pc & 0xffff; if (a >= LO && a < HI && a !== pc) { const k = 'R ' + proc(pc); hits.set(k, (hits.get(k) || 0) + 1); } else if (a >= S.SCRATTR && a < LO && a !== pc) lo3++; return r0(a, st); };
m.memory.write = (a, v) => { a &= 0xffff; if (a >= LO && a < HI) { const k = 'W ' + proc(m.cpu.pc & 0xffff); hits.set(k, (hits.get(k) || 0) + 1); } return w0(a, v); };
let menu = 0; m.onPc(S.LEDFE, () => { menu++; }); m.key(KEY.UP, true); const t0 = g.ticks; let guard = 0; while (g.ticks - t0 < NT && guard < 2500000 && !menu) { m.step(); guard++; } m.key(KEY.UP, false); let extra = 0; if (menu) { for (; extra < 3000; extra++) m.step(); }
console.log(`${rom} ур.${LVL} сид ${SEED.toString(16)}: шагов ${guard}, тиков ${g.ticks - t0}, меню ${menu ? 'да, +' + extra + ' шагов (аттракт)' : 'нет'}; обращений к строкам 0..23: ${lo3}; к строкам 24..31: ${[...hits.entries()].map(([k, v]) => k + ':' + v).join(' ') || 'НЕТ'}`);
