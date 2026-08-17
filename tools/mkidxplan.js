// Построение ПЛАНА трансляции индексных обращений: какое место (файл:строка)
// переводить в прямой абсолютный адрес, а какое — в вызов хелпера.
//
// Вход: .lst эталонной Z80-сборки (даёт адрес <-> файл:строка) и перепись баз
// build/idxcensus.json (даёт, какие значения IX/IY реально бывают в каждом месте).
// Выход: build/idxplan.json  { "scubacodb.asm:1535": {"base":"DiverObj","hits":N} }
//
// В план попадают ТОЛЬКО места, где за все 7 сценариев оракула база была ровно
// одна и она — именованная метка. Это ИЗМЕРЕНИЕ, а не доказательство: рядом
// живёт гейт tools/verify/idxbase_gate.js, который на нашей сборке проверяет
// в каждом таком месте, что тень z80_ix/z80_iy равна предполагаемой базе.
"use strict";
const fs = require("fs");

const lstPath = process.argv[2], censusPath = process.argv[3];
const out = process.argv[4] || "build/idxplan.json";

// --- addr -> file:line из .lst sjasmplus -------------------------------------
const stack = [];
const addrLoc = new Map();
for (const raw of fs.readFileSync(lstPath, "latin1").split("\n")) {
  let m = raw.match(/^# file opened: (.+)$/);
  if (m) { stack.push(m[1].trim()); continue; }
  if (/^# file closed: /.test(raw)) { stack.pop(); continue; }
  m = raw.match(/^\s*(\d+)[+]*\s+([0-9A-Fa-f]{4})\s+((?:[0-9A-Fa-f]{2}\s)+)\s*(.*)$/);
  if (!m) continue;
  const line = parseInt(m[1], 10), addr = parseInt(m[2], 16);
  const src = (m[4] || "").replace(/;.*$/, "").trim();
  if (!src) continue;
  const file = stack[stack.length - 1] || "?";
  const key = file + ":" + line;
  if (!addrLoc.has(addr)) addrLoc.set(addr, key);
}

const census = JSON.parse(fs.readFileSync(censusPath, "utf8"));
const plan = {};
let named = 0, unnamed = 0, cold = 0, multi = 0;
for (const r of census) {
  if (r.hits === 0) { cold++; continue; }
  if (r.nbases !== 1) { multi++; continue; }
  const b = r.bases[0];
  if (/[+]/.test(b.name) || /^0x/.test(b.name)) { unnamed++; continue; }
  const loc = addrLoc.get(r.addr);
  if (!loc) { unnamed++; continue; }
  plan[loc] = { base: b.name, hits: r.hits, reg: r.reg, addr: r.addr };
  named++;
}
fs.writeFileSync(out, JSON.stringify(plan, null, 1));
console.log(`план: прямая адресация в ${named} местах; ` +
            `хелпер в ${cold} холодных + ${multi} с гуляющей базой + ${unnamed} с безымянной базой`);
const byBase = {};
for (const k in plan) byBase[plan[k].base] = (byBase[plan[k].base] || 0) + 1;
for (const [b, n] of Object.entries(byBase).sort((a, c) => c[1] - a[1]))
  console.log(`   ${String(n).padStart(4)}  ${b}`);
console.log("-> " + out);
