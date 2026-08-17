// Профиль исполнения: сколько раз исполняется каждый адрес, с разбивкой по
// процедурам (по .sym) и отдельным счётом (IX+d)/(IY+d)-обращений — очередь на
// дожимку этапа 3.
//
//   node tools/verify/profile.js <rom> <sym> <lst> [ticks=600] [cpu=z80]
"use strict";
const fs = require("fs");
const path = require("path");
const { reachGame, KEY } = require("./drive.js");

const rom = process.argv[2], sym = process.argv[3], lst = process.argv[4];
const NT = parseInt(process.argv[5] || "600", 10);
const cpu = process.argv[6] || "z80";

// --- карта адрес -> исходная строка из .lst (sjasmplus) ----------------------
// формат: "  123+  8C1C 3E 04       LD A,4"  — номер, адрес, байты, текст
function readLst(p) {
  const map = new Map();                 // addr -> {bytes, src, file}
  let file = path.basename(p);
  for (const raw of fs.readFileSync(p, "latin1").split("\n")) {
    const m = raw.match(/^\s*\d+[+]?\s+([0-9A-Fa-f]{4})\s+((?:[0-9A-Fa-f]{2}\s)+)\s*(.*)$/);
    if (!m) continue;
    const addr = parseInt(m[1], 16);
    const bytes = m[2].trim().split(/\s+/);
    const src = (m[3] || "").replace(/\s+$/, "");
    if (!src.trim()) continue;
    if (!map.has(addr)) map.set(addr, { n: bytes.length, src });
  }
  return map;
}

const lstMap = readLst(lst);
const g = reachGame(rom, sym, { cpu, level: 1, seed: 0x0167 });
const S = g.S;

// таблица меток, отсортированная — для отнесения адреса к процедуре
const labels = Object.entries(S).filter(([k, v]) => v >= 0x200 && v < 0xc000 && !k.includes("."))
                      .sort((a, b) => a[1] - b[1]);
function procOf(addr) {
  let lo = 0, hi = labels.length - 1, best = null;
  while (lo <= hi) { const mid = (lo + hi) >> 1;
    if (labels[mid][1] <= addr) { best = labels[mid]; lo = mid + 1; } else hi = mid - 1; }
  return best ? best[0] : "?";
}

g.m.profileOn();
const t0 = g.ticks, i0 = g.m.instrCount, f0 = g.m.frame;
// сценарий: разгон вниз — самая населённая сцена (много существ на экране)
g.m.key(KEY.UP, true);
let guard = 0;
while (g.ticks - t0 < NT && guard < 20000) { g.m.step(); guard++; }
g.m.key(KEY.UP, false);
const ticks = g.ticks - t0, frames = g.m.frame - f0, instrs = g.m.instrCount - i0;

const prof = g.m.profileGet();

// --- сводка ------------------------------------------------------------------
const byProc = new Map();
let idxHits = 0, idxByProc = new Map(), idxSites = [];
for (let a = 0; a < 0x10000; a++) {
  const c = prof[a]; if (!c) continue;
  const p = procOf(a);
  byProc.set(p, (byProc.get(p) || 0) + c);
  const l = lstMap.get(a);
  if (l && /\(i[xy]\s*[+-]/i.test(l.src)) {
    idxHits += c;
    idxByProc.set(p, (idxByProc.get(p) || 0) + c);
    idxSites.push({ a, c, p, src: l.src.trim() });
  }
}
const top = [...byProc.entries()].sort((x, y) => y[1] - x[1]).slice(0, 25);
const topIdx = [...idxByProc.entries()].sort((x, y) => y[1] - x[1]).slice(0, 15);
idxSites.sort((x, y) => y.c - x.c);

console.log(`=== профиль ${path.basename(rom)} ядро=${cpu}: ${ticks} игровых тиков, ${frames} кадров, ${instrs} инструкций`);
console.log(`    ${(instrs / ticks).toFixed(0)} инструкций/тик, ${(ticks / frames).toFixed(2)} тик/кадр`);
console.log(`    (IX+d)/(IY+d)-обращений: ${idxHits} всего, ${(idxHits / ticks).toFixed(1)} на тик, ${(100 * idxHits / instrs).toFixed(1)}% инструкций`);
console.log("\n--- ТОП-25 процедур по числу исполненных инструкций ---");
for (const [p, c] of top)
  console.log(`  ${String(c).padStart(9)}  ${(c / ticks).toFixed(1).padStart(8)}/тик  ${(100 * c / instrs).toFixed(1).padStart(5)}%  ${p}`);
console.log("\n--- ТОП-15 процедур по (IX+d)/(IY+d)-обращениям (очередь этапа 3) ---");
for (const [p, c] of topIdx)
  console.log(`  ${String(c).padStart(9)}  ${(c / ticks).toFixed(1).padStart(8)}/тик  ${p}`);
console.log("\n--- ТОП-30 отдельных (IX+d)-инструкций ---");
for (const s of idxSites.slice(0, 30))
  console.log(`  ${String(s.c).padStart(8)}  0x${s.a.toString(16)}  ${s.p.padEnd(10)}  ${s.src}`);

fs.writeFileSync("build/profile_" + cpu + ".json", JSON.stringify(
  { ticks, frames, instrs, idxHits, byProc: [...byProc], idxByProc: [...idxByProc], idxSites }, null, 1));
console.log("\nполный профиль -> build/profile_" + cpu + ".json");
