// Сравнение ВСЕЙ памяти двух наших образов на заданных тиках (для сборок с
// одинаковой раскладкой данных): адреса расхождений с привязкой к меткам.
//   node tools/verify/mem_cmp.js <romA> <symA> <romB> <symB> <level> <tick1,tick2,...> [lo-hi исключить]
"use strict";
const { reachGame, KEY } = require("./drive.js");
const { readSym } = require("./harness.js");
const [ra, sa, rb, sb] = process.argv.slice(2, 6);
const LVL = parseInt(process.argv[6] || "4", 10);
const TICKS = process.argv[7].split(",").map(Number);
const S = readSym(sb);
const labs = Object.entries(S).filter(([k, v]) => v >= 0 && v < 0x10000).sort((a, b) => a[1] - b[1]);
function sym(a) { let lo = 0, hi = labs.length - 1, x = null; while (lo <= hi) { const m = (lo + hi) >> 1; if (labs[m][1] <= a) { x = labs[m]; lo = m + 1; } else hi = m - 1; } return x ? `${x[0]}+${(a - x[1]).toString(16)}` : "?"; }
function run(rom, symp) {
  const g = reachGame(rom, symp, { cpu: "i8080", level: LVL, seed: 0x0167 }); const m = g.m; const snaps = new Map();
  m.onPc(g.S.LD9C0, () => { if (TICKS.includes(g.ticks) && !snaps.has(g.ticks)) { const b = new Uint8Array(0x10000); for (let a = 0; a < 0x10000; a++) b[a] = m.rd(a); snaps.set(g.ticks, b); } });
  m.key(KEY.UP, true); const last = Math.max(...TICKS); let guard = 0; while (g.ticks <= last && guard < 600000) { m.step(); guard++; }
  return snaps;
}
const A = run(ra, sa), B = run(rb, sb);
const codeLo = 0x100, codeHi = S.SCUBACOD1_END || 0xa000;
for (const t of TICKS) { const a = A.get(t), b = B.get(t); if (!a || !b) { console.log(`тик ${t}: нет снимка`); continue; }
  const diffs = []; for (let x = 0; x < 0x10000; x++) { if (x < 0x100 || (x >= codeLo && x < codeHi)) continue; if (a[x] !== b[x]) diffs.push(x); }
  console.log(`тик ${t}: расхождений вне кода ${diffs.length}`);
  let i = 0; while (i < diffs.length && i < 120) { const s0 = diffs[i]; let j = i; while (j + 1 < diffs.length && diffs[j + 1] === diffs[j] + 1) j++;
    console.log(`  ${s0.toString(16)}..${diffs[j].toString(16)} (${j - i + 1}) ${sym(s0)}: A ${Array.from(a.slice(s0, Math.min(diffs[j] + 1, s0 + 8))).map(v => v.toString(16).padStart(2, "0")).join(" ")} | B ${Array.from(b.slice(s0, Math.min(diffs[j] + 1, s0 + 8))).map(v => v.toString(16).padStart(2, "0")).join(" ")}`); i = j + 1; }
}
