// Перепись баз IX/IY по КАЖДОМУ месту (IX+d)/(IY+d): какие значения индексного
// регистра там реально бывают. Нужна, чтобы выбрать стратегию трансляции:
//   * база одна и та же всегда  -> прямой абсолютный адрес (3 байта, БЫСТРЕЕ Z80);
//   * база гуляет               -> тень + dad (тёплый код) или хелпер (холодный).
// Мерим, а не верим комментариям: гоняются ВСЕ сценарии оракула.
//
//   node tools/verify/idxcensus.js <rom> <sym> <lst> [outjson]
"use strict";
const fs = require("fs");
const { reachGame } = require("./drive.js");
const { SCENARIOS } = require("./oracle.js");

const rom = process.argv[2], sym = process.argv[3], lst = process.argv[4];
const out = process.argv[5] || "build/idxcensus.json";

// адреса всех инструкций с (ix+d)/(iy+d) из .lst
const sites = new Map();                 // addr -> {src, reg}
for (const raw of fs.readFileSync(lst, "latin1").split("\n")) {
  const m = raw.match(/^\s*\d+[+]?\s+([0-9A-Fa-f]{4})\s+((?:[0-9A-Fa-f]{2}\s)+)\s*(.*)$/);
  if (!m) continue;
  const src = (m[3] || "").replace(/;.*$/, "").trim();
  if (!src) continue;
  const mm = src.match(/\(\s*(i[xy])\s*[+-]/i);
  if (!mm) continue;
  const a = parseInt(m[1], 16);
  if (!sites.has(a)) sites.set(a, { src, reg: mm[1].toLowerCase() });
}
console.log(`мест с (IX+d)/(IY+d) в .lst: ${sites.size}`);

const seen = new Map();                  // addr -> Map(base -> count)
for (const [a] of sites) seen.set(a, new Map());

for (const name of Object.keys(SCENARIOS)) {
  const sc = SCENARIOS[name];
  // ВАЖНО: крючки вешаются ДО бута — иначе не видны обращения на загрузке и
  // титрах, где IX/IY ещё не инициализированы (ReadKeyboard там зовётся с IX=0).
  const preHook = (mm) => {
    for (const [a, s] of sites) {
      const cnt = seen.get(a);
      mm.onPc(a, () => {
        const st = mm.cpu.getState();
        const v = s.reg === "ix" ? st.ix : st.iy;
        cnt.set(v, (cnt.get(v) || 0) + 1);
      });
    }
  };
  const g = reachGame(rom, sym, { cpu: "z80", level: sc.level, seed: sc.seed, preHook });
  let held = [];
  const setKeys = keys => {
    for (const k of held) if (!keys.includes(k)) g.m.key(k, false);
    for (const k of keys) if (!held.includes(k)) g.m.key(k, true);
    held = keys.slice();
  };
  // сценарий 'long' режем: для переписи хватит 3000 тиков
  for (const ph of sc.phases) {
    setKeys(ph.keys || []);
    const target = g.ticks + Math.min(ph.ticks, 3000);
    let guard = 0;
    while (g.ticks < target && guard < 60000) { g.m.step(); guard++; }
  }
  setKeys([]);
  console.log(`  сценарий ${name}: ${g.ticks} тиков`);
}

// метки: адрес -> имя (для читаемого отчёта)
const S = require("./harness.js").readSym(sym);
const byAddr = new Map();
for (const k in S) if (!byAddr.has(S[k])) byAddr.set(S[k], k);
const known = [...byAddr.entries()].sort((a, b) => a[0] - b[0]);
const nameOf = v => {
  const e = byAddr.get(v);
  if (e) return e;
  // ближайшая метка снизу
  let lo = 0, hi = known.length - 1, best = null;
  while (lo <= hi) { const mid = (lo + hi) >> 1;
    if (known[mid][0] <= v) { best = known[mid]; lo = mid + 1; } else hi = mid - 1; }
  return best ? `${best[1]}+${v - best[0]}` : "0x" + v.toString(16);
};

const rows = [];
for (const [a, s] of sites) {
  const m = seen.get(a);
  const bases = [...m.entries()].sort((x, y) => y[1] - x[1]);
  const hits = bases.reduce((s2, b) => s2 + b[1], 0);
  rows.push({ addr: a, reg: s.reg, src: s.src, hits, nbases: bases.length,
              bases: bases.slice(0, 4).map(([v, c]) => ({ v, c, name: nameOf(v) })) });
}
rows.sort((x, y) => y.hits - x.hits);

const cold = rows.filter(r => r.hits === 0);
const const1 = rows.filter(r => r.nbases === 1);
const multi = rows.filter(r => r.nbases > 1);
console.log(`\nитог по ${rows.length} местам:`);
console.log(`  ни разу не исполнялись:      ${cold.length}`);
console.log(`  ровно ОДНА база за все прогоны: ${const1.length}  (из них исполнялись: ${const1.filter(r => r.hits > 0).length})`);
console.log(`  база гуляет (>1 значения):   ${multi.length}`);
const byBase = new Map();
for (const r of const1) if (r.hits > 0) {
  const k = r.bases[0].name;
  byBase.set(k, (byBase.get(k) || 0) + 1);
}
console.log("\n  константные базы (сколько мест на каждую):");
for (const [k, v] of [...byBase.entries()].sort((a, b) => b[1] - a[1]))
  console.log(`    ${String(v).padStart(4)}  ${k}`);
console.log("\n  ТОП-15 мест с гуляющей базой (по исполнениям):");
for (const r of multi.slice(0, 15))
  console.log(`    ${String(r.hits).padStart(8)}  0x${r.addr.toString(16)} баз=${r.nbases}  ${r.src.slice(0, 40)}  напр. ${r.bases.map(b => b.name).slice(0, 3).join(", ")}`);

fs.writeFileSync(out, JSON.stringify(rows, null, 1));
console.log(`\nполная перепись -> ${out}`);
