"use strict";
// Тяжёлые тики (дольше кадра) без смены экрана: из чего они состоят
const { reachGame, KEY } = require("./drive.js");
const { readSym } = require("./harness.js");
const [rom, sym] = process.argv.slice(2, 4); const LVL = parseInt(process.argv[4] || "4", 10), NT = parseInt(process.argv[5] || "3000", 10);
const S = readSym(sym); const labs = Object.entries(S).filter(([k, v]) => v >= 0x100 && v < 0xc000).sort((a, b) => a[1] - b[1]);
function proc(a) { let lo = 0, hi = labs.length - 1, x = null; while (lo <= hi) { const m = (lo + hi) >> 1; if (labs[m][1] <= a) { x = labs[m]; lo = m + 1; } else hi = m - 1; } return x ? x[0] : "?"; }
const g = reachGame(rom, sym, { cpu: "i8080", level: LVL, seed: 0x0167 }); const m = g.m;
let cur = new Map(), acc = 0, prevPc = -1, on = false, draw = false, upd = 0; const heavy = new Map(); let nHeavy = 0, nTrans = 0, nTicks = 0, heavyUpd = 0, normUpd = 0, nNorm = 0;
const cb = m.v06c.check_breakpoint;
m.v06c.check_breakpoint = () => { const r = cb(); if (on && prevPc >= 0) { const c = m.cpu.vcycles || 0; acc += c; const p = proc(prevPc); cur.set(p, (cur.get(p) || 0) + c); } prevPc = m.cpu.pc & 0xffff; return r; };
m.onPc(S.DrawGameScr, () => { draw = true; }); m.onPc(S.LB737, () => { upd++; });
m.onPc(S.LD9C0, () => { if (on) { nTicks++; if (draw) nTrans++; else if (acc > 59904) { nHeavy++; heavyUpd += upd; for (const [k, v] of cur) heavy.set(k, (heavy.get(k) || 0) + v); } else { nNorm++; normUpd += upd; } }
  cur = new Map(); acc = 0; draw = false; upd = 0; });
on = true; m.key(KEY.UP, true); let guard = 0; while (nTicks < NT && guard < 1500000) { m.step(); guard++; }
console.log(`тиков ${nTicks}: со сменой экрана ${nTrans}, тяжёлых без смены ${nHeavy}, обычных ${nNorm}; обновлений существ на тик: тяжёлые ${(heavyUpd / Math.max(1, nHeavy)).toFixed(1)}, обычные ${(normUpd / Math.max(1, nNorm)).toFixed(2)}`);
let tot = 0; for (const v of heavy.values()) tot += v;
console.log(`тяжёлый тик в среднем ${Math.round(tot / Math.max(1, nHeavy))} тактов; состав:`);
for (const [k, v] of [...heavy.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14)) console.log(`  ${String(Math.round(v / Math.max(1, nHeavy))).padStart(7)}  ${(100 * v / tot).toFixed(1).padStart(5)}%  ${k}`);
