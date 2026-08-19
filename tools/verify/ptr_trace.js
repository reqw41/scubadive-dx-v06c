// ДИНАМИЧЕСКИЙ ФИЛЬТР УКАЗАТЕЛЕЙ.
//
// Статический скан ищет адрес блока сырым словом в образе, но в 44 КБ данных
// двухбайтовое слово совпадает случайно с вероятностью около 67% — он метит
// грязными и невиновных. Здесь то же место проверяется ЗАМЕРОМ: читает ли игра
// эту пару байт ПОДРЯД, то есть грузит ли её как указатель.
//
// ЧЕСТНАЯ ГРАНИЦА МЕТОДА: динамика не доказывает отсутствия. Не всплывший в
// прогоне указатель может всплыть в сцене, которой мы не видели. Поэтому прогон
// идёт по СПЕКТРУ сцен (уровни, поверхность, глубина, гибели), а блок считается
// чистым только если его адрес не всплыл указателем НИ В ОДНОЙ.
//
//   node tools/verify/ptr_trace.js
"use strict";
const fs = require("fs"), path = require("path");
const { readSym } = require("./harness.js");
const { reachGame } = require("./drive.js");
const ROOT = path.resolve(__dirname, "../..");
const B = process.env.BUILD_DIR || "build";
const rom = `${ROOT}/${B}/gz/scuba.rom`, sym = `${ROOT}/${B}/gz/scubacod1.sym`;
const S = readSym(sym);
const img = fs.readFileSync(`${ROOT}/${B}/gz/scubacod1.bin`);
const ORG = S.SCUBACOD0_END, SPR_END = 0x8E90;

// блоки-кандидаты и позиции, где их адрес лежит сырым словом
const addrs = Object.entries(S).filter(([k, v]) => v >= 0x1000 && v < SPR_END).sort((a, b) => a[1] - b[1]);
const size = {};
for (let i = 0; i < addrs.length - 1; i++) size[addrs[i][0]] = addrs[i + 1][1] - addrs[i][1];
const cand = new Map();          // имя -> [позиции]
for (const [n, a] of addrs) {
  if (!(size[n] > 0 && size[n] <= 64)) continue;
  const w = Buffer.from([a & 0xff, a >> 8]);
  const pos = [];
  let i = img.indexOf(w);
  while (i >= 0) { pos.push(ORG + i); i = img.indexOf(w, i + 1); }
  cand.set(n, pos);
}
const watch = new Map();          // позиция -> [имена]
for (const [n, pos] of cand) for (const p of pos) {
  if (!watch.has(p)) watch.set(p, []); watch.get(p).push(n);
}
console.log(`кандидатов ${cand.size}, различных позиций под наблюдением ${watch.size}`);

const dirty = new Set();
const SCENES = [["уровень 4 поверхность", 4, null, 1200], ["уровень 1 поверхность", 1, null, 1200],
                ["уровень 4 глубина", 4, 9, 1200], ["уровень 1 долгий", 1, null, 3000],
                ["уровень 2", 2, null, 900], ["уровень 3", 3, null, 900]];
for (const [name, lvl, row, ticks] of SCENES) {
  let prev = -1, started = false, hits = 0;
  const g = reachGame(rom, sym, { cpu: "i8080", level: lvl, seed: 0x0167,
    preHook: m => { const o = m.memory.read.bind(m.memory);
      m.memory.read = (a, st) => { a &= 0xffff;
        // указатель = чтение позиции P и сразу P+1
        if (started && watch.has(prev) && a === prev + 1) {
          for (const n of watch.get(prev)) if (!dirty.has(n)) { dirty.add(n); hits++; }
        }
        prev = a; return o(a, st); }; } });
  let t = 0; g.m.onPc(S.LD9C0, () => { t++; started = true; if (row !== null) g.m.wr(S.L5B03 + 1, row); });
  let guard = 0; while (t < ticks && guard < 400000) { g.m.step(); guard++; }
  console.log(`  ${name}: ${t} тиков, новых грязных ${hits}, всего грязных ${dirty.size}`);
}
const clean = [...cand.keys()].filter(n => !dirty.has(n));
const bytes = n => size[n];
const cleanB = clean.reduce((s, n) => s + bytes(n), 0);
console.log(`\nИТОГ: кандидатов ${cand.size} (${[...cand.keys()].reduce((s,n)=>s+bytes(n),0)} Б)`);
console.log(`  грязных по ЗАМЕРУ: ${dirty.size}`);
console.log(`  ЧИСТЫХ: ${clean.length}, ${cleanB} Б`);
const statClean = [...cand.keys()].filter(n => cand.get(n).length === 0);
console.log(`  для сравнения, чистых по СТАТИКЕ: ${statClean.length}, ` +
            `${statClean.reduce((s,n)=>s+bytes(n),0)} Б`);
fs.writeFileSync("/tmp/ptr_clean.txt", clean.join("\n"));
console.log(`  список чистых -> /tmp/ptr_clean.txt`);
