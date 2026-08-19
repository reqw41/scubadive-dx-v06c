// ДИНАМИЧЕСКИЕ ФИЛЬТРЫ КОРПУСА ВЫСЕЛЕНИЯ: указатели И ИСПОЛНЕНИЕ.
//
// УРОК, РАДИ КОТОРОГО ЗДЕСЬ ДВА ФИЛЬТРА, А НЕ ОДИН: каждый новый класс блоков
// приносит свой класс связей, и фильтр, годный для одного класса, для другого
// слеп. Спрайты держатся на указателях — их ловит трасса чтений. Стоило
// расширить корпус на рельеф, как всплыл класс, которого трасса чтений не видит
// В ПРИНЦИПЕ: тело, в которое входят ПРОВАЛОМ. Признак был громкий — игра ушла
// исполнять данные по 0x4F31, ниже начала кода. Поэтому фильтров должно быть
// столько, сколько классов связей, и новый класс блоков обязан приносить свой
// замер ДО того, как попадёт в корпус.
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

const dirty = new Set();      // адрес всплыл указателем
const execd = new Set();      // хоть один байт блока попал в PC
// карта «адрес -> имя блока» для быстрой пометки исполнения
const blockOf = new Int32Array(SPR_END);
blockOf.fill(-1);
const names = [...cand.keys()];
for (let i = 0; i < names.length; i++) {
  const a = S[names[i]], sz = size[names[i]];
  for (let k = 0; k < sz; k++) blockOf[a + k] = i;
}
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
  // ИСПОЛНЕНИЕ: любой PC внутри блока делает блок грязным. Смотрим не только
  // точки входа — крючок висит на КАЖДОЙ инструкции, поэтому провалы насквозь и
  // хвосты тел попадают в счёт наравне с вызовами.
  let ex0 = execd.size;
  const origCb = g.m.v06c.check_breakpoint;
  g.m.v06c.check_breakpoint = () => { const pc = g.m.cpu.pc & 0xffff;
    if (pc < SPR_END) { const b = blockOf[pc]; if (b >= 0) execd.add(names[b]); }
    return origCb(); };
  let t = 0; g.m.onPc(S.LD9C0, () => { t++; started = true; if (row !== null) g.m.wr(S.L5B03 + 1, row); });
  let guard = 0; while (t < ticks && guard < 400000) { g.m.step(); guard++; }
  console.log(`  ${name}: ${t} тиков, новых грязных по указателям ${hits}, ` +
              `по исполнению +${execd.size - ex0}; всего ${dirty.size}/${execd.size}`);
}
const clean = [...cand.keys()].filter(n => !dirty.has(n) && !execd.has(n));
const bytes = n => size[n];
const cleanB = clean.reduce((s, n) => s + bytes(n), 0);
console.log(`\nИТОГ: кандидатов ${cand.size} (${[...cand.keys()].reduce((s,n)=>s+bytes(n),0)} Б)`);
console.log(`  грязных по УКАЗАТЕЛЯМ: ${dirty.size}`);
console.log(`  грязных по ИСПОЛНЕНИЮ: ${execd.size}` +
            ` (из них только по исполнению: ${[...execd].filter(n => !dirty.has(n)).length})`);
console.log(`  ЧИСТЫХ: ${clean.length}, ${cleanB} Б`);
const statClean = [...cand.keys()].filter(n => cand.get(n).length === 0);
console.log(`  для сравнения, чистых по СТАТИКЕ: ${statClean.length}, ` +
            `${statClean.reduce((s,n)=>s+bytes(n),0)} Б`);
// Список кладётся В РЕПОЗИТОРИЙ: генератор выселения читает именно его, и
// сборка обязана быть воспроизводимой без повторного замера.
fs.writeFileSync(`${ROOT}/tools/zone_clean.txt`, clean.sort().join("\n") + "\n");
console.log(`  список чистых -> tools/zone_clean.txt`);
