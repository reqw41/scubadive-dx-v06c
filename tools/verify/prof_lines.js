// Построчный профиль тактов: такты/тик на каждую строку .lst внутри заданных
// процедур + площадки вызова заданных меток (кто зовёт хелпер).
//   node tools/verify/prof_lines.js <rom> <sym> <lst> <ticks> <level> PROC1,PROC2 CALLEE1,CALLEE2
"use strict";
const fs = require("fs"), path = require("path");
const { reachGame } = require("./drive.js");
const { readSym } = require("./harness.js");
const [rom, sym, lst] = process.argv.slice(2, 5);
const NT = parseInt(process.argv[5] || "400", 10), LVL = parseInt(process.argv[6] || "4", 10);
const PROCS = (process.argv[7] || "").split(",").filter(Boolean);
const CALLEES = (process.argv[8] || "").split(",").filter(Boolean);
const S = readSym(sym);
const labs = Object.entries(S).filter(([k, v]) => v >= 0x100 && v < 0xc000).sort((a, b) => a[1] - b[1]);
function proc(a) { let lo = 0, hi = labs.length - 1, x = null;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (labs[m][1] <= a) { x = labs[m]; lo = m + 1; } else hi = m - 1; }
  return x ? x[0] : "?"; }
const lstMap = new Map();
for (const raw of fs.readFileSync(lst, "latin1").split("\n")) {
  const m = raw.match(/^\s*\d+[+]?\s+([0-9A-Fa-f]{4})\s+((?:[0-9A-Fa-f]{2}\s)+)\s*(.*)$/);
  if (!m) continue; const a = parseInt(m[1], 16); const src = (m[3] || "").trim();
  if (src && !lstMap.has(a)) lstMap.set(a, { bytes: m[2].trim(), src });
}
const g = reachGame(rom, sym, { cpu: "i8080", level: LVL, seed: 0x0167 });
const cyc = new Float64Array(0x10000), cnt = new Uint32Array(0x10000);
let prev = -1, on = false; const origCb = g.m.v06c.check_breakpoint;
g.m.v06c.check_breakpoint = () => { const r = origCb();
  if (on && prev >= 0) cyc[prev] += g.m.cpu.vcycles || 0;
  prev = g.m.cpu.pc & 0xffff; if (on) cnt[prev]++; return r; };
let ticks = 0; g.m.onPc(S.LD9C0, () => { ticks++; }); on = true;
let guard = 0; while (ticks < NT && guard < 200000) { g.m.step(); guard++; }
let total = 0; for (let a = 0; a < 0x10000; a++) total += cyc[a];
console.log(`=== ${rom} ур.${LVL}: ${ticks} тиков, ${(total / ticks).toFixed(0)} тактов/тик`);
for (const P of PROCS) {
  const start = S[P]; if (start == null) { console.log("нет метки", P); continue; }
  const i = labs.findIndex(([k]) => k === P); const end = i >= 0 && labs[i + 1] ? labs[i + 1][1] : start + 256;
  let sum = 0; for (let a = start; a < end; a++) sum += cyc[a];
  console.log(`\n--- ${P} 0x${start.toString(16)}..0x${end.toString(16)}: ${(sum / ticks).toFixed(0)} тактов/тик (${(100 * sum / total).toFixed(1)}%)`);
  for (let a = start; a < end; a++) { if (!cnt[a]) continue; const l = lstMap.get(a) || { bytes: "", src: "?" };
    console.log(`  ${a.toString(16)}  ${String((cnt[a] / ticks).toFixed(1)).padStart(7)}x  ${String((cyc[a] / ticks).toFixed(0)).padStart(6)}т  ${l.bytes.padEnd(9)} ${l.src}`); }
}
for (const C of CALLEES) {
  const tgt = S[C]; if (tgt == null) { console.log("нет метки", C); continue; }
  const sites = [];
  for (let a = 0; a < 0xc000; a++) { if (!cnt[a]) continue; const l = lstMap.get(a); if (!l) continue;
    const b = l.bytes.split(" "); if (b.length === 3 && parseInt(b[1], 16) + 256 * parseInt(b[2], 16) === tgt && (b[0] === "CD" || b[0] === "C3" || /^[CD][4C]$/i.test(b[0]) || /^[CDEF][24ACE]$/i.test(b[0])))
      sites.push({ a, c: cnt[a], p: proc(a), src: l.src }); }
  sites.sort((x, y) => y.c - x.c);
  console.log(`\n--- площадки ${C} (0x${tgt.toString(16)}):`);
  for (const s of sites.slice(0, 20)) console.log(`  ${s.a.toString(16)}  ${String((s.c / ticks).toFixed(1)).padStart(7)}/тик  ${s.p.padEnd(12)} ${s.src}`);
}
