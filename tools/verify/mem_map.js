// КАРТА СЕКЦИЙ ОБРАЗА: кто где лежит и сколько занимает.
//
// Источник — листинг sjasmplus, а НЕ исходники: только листинг знает, какие
// ветки IFDEF реально попали в боевой образ и куда встали ALIGN/DS.
//
// Что считается и как:
//   * ЭМИТИРОВАННЫЕ БАЙТЫ. Строка листинга вида «NNN  AAAA bb bb bb bb» кладёт
//     байты по адресу AAAA. Байты приписываются САМОМУ ВНУТРЕННЕМУ открытому
//     файлу (маркеры «# file opened/closed»), поэтому INCLUDE внутри INCLUDE
//     разделяются честно.
//   * ДЫРЫ. Всё, что внутри диапазона блока кода НЕ покрыто ни одним
//     эмитированным байтом: DS-добивка, хвосты ALIGN. Дыра не попадает в
//     .bin как «наш» байт, но место в памяти занимает и в образе тоже (raw
//     вывод sjasmplus добивает нулями).
//   * СЕКЦИИ ВЕРХНЕГО УРОВНЯ. Задаются вручную по меткам: границы, которые
//     нельзя вывести из файлов (панель, ломти-источники, хвост кода).
//
// Мера не шире явления: байт приписывается ровно тому файлу, в котором стоит
// его директива. Совпадение адреса с границей окна проверяется отдельно —
// такое совпадение считается уликой против меры (урок 12 tool_defects).
//
//   node tools/verify/mem_map.js [каталог_сборки]
//   MM_JSON=file.json  — выгрузить машинно-читаемую карту
"use strict";
const fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "../..");
const DIR = process.argv[2] || `${ROOT}/build/prod_hw`;

function parseLst(file) {
  const stack = [path.basename(file)];
  const bytesOf = new Map();          // file -> число байт
  const rangeOf = new Map();          // file -> [lo, hi)
  const cover = [];                   // [addr, len] всех эмитированных кусков
  const gaps = [];                    // [addr, len, вид, файл] — резервы и выравнивание
  const lines = fs.readFileSync(file, "latin1").split("\n");
  // ПРОБЕЛ В АДРЕСАХ — НЕ ВСЕГДА ДЫРА. `DEFS $1490` печатается одной строкой с
  // огрызком «00 00 00...», а адрес прыгает на 5264 вперёд: это РЕЗЕРВ (буфер
  // записей объектов), а не потеря. Классифицируем прыжок по директиве той
  // строки, ПОСЛЕ которой он случился, иначе резерв в 5 КБ читается как мусор.
  let prevEnd = null, prevLine = "", prevFile = stack[0];
  const flush = a => {
    if (prevEnd != null && a > prevEnd) {
      const kind = /\b(DEFS|DS)\b/i.test(prevLine) ? "резерв (DS)"
                 : /\bALIGN\b/i.test(prevLine) ? "выравнивание"
                 : /\bORG\b|\bDISP\b/i.test(prevLine) ? "перенос ORG/DISP" : "разрыв";
      gaps.push([prevEnd, a - prevEnd, kind, prevFile]);
    }
  };
  for (const line of lines) {
    let m = /^# file opened: (.+?)\s*$/.exec(line);
    if (m) { stack.push(m[1]); continue; }
    if (/^# file closed:/.test(line)) { if (stack.length > 1) stack.pop(); continue; }
    // ВНИМАНИЕ НА ПРОБЕЛ: при вложенности INCLUDE sjasmplus печатает «3++1000»,
    // без пробела между плюсами и адресом. Регулярка с обязательным \s+ теряла
    // ВЕСЬ файл целиком (13 328 Б спрайтов уходили в «дыры») — а «дыра» размером
    // с секцию есть улика против меры, а не открытие.
    const ma = /^\s*\d+[+]*\s*([0-9A-F]{4})(?:\s|$)/.exec(line);
    if (!ma) continue;
    const a = parseInt(ma[1], 16);
    const f = stack[stack.length - 1];
    flush(a);
    m = /^\s*\d+[+]*\s*[0-9A-F]{4}\s+((?:[0-9A-F]{2} )*[0-9A-F]{2})(?:\s|\.|$)/.exec(line);
    let n = 0;
    if (m) {
      n = m[1].trim().split(/\s+/).length;
      bytesOf.set(f, (bytesOf.get(f) || 0) + n);
      const r = rangeOf.get(f);
      if (!r) rangeOf.set(f, [a, a + n]);
      else { if (a < r[0]) r[0] = a; if (a + n > r[1]) r[1] = a + n; }
      cover.push([a, n]);
    }
    prevEnd = a + n; prevLine = line; prevFile = f;
  }
  return { bytesOf, rangeOf, cover, gaps };
}

function holes(cover, lo, hi) {
  const seen = new Uint8Array(0x10000);
  for (const [a, n] of cover) for (let i = 0; i < n; i++) if (a + i < 0x10000) seen[a + i] = 1;
  const out = [];
  let s = -1;
  for (let a = lo; a < hi; a++) {
    if (!seen[a] && s < 0) s = a;
    else if (seen[a] && s >= 0) { out.push([s, a - s]); s = -1; }
  }
  if (s >= 0) out.push([s, hi - s]);
  return { holes: out, seen };
}

const hx = a => "0x" + a.toString(16).toUpperCase().padStart(4, "0");

function readSymFile(f) {
  const S = {};
  for (const l of fs.readFileSync(f, "latin1").split("\n")) {
    const m = /^(\S+?):?\s+EQU\s+(?:0x)?([0-9A-Fa-f]+)/.exec(l);
    if (m) S[m[1]] = parseInt(m[2], 16);
  }
  return S;
}

const l0 = parseLst(`${DIR}/scubacod0.lst`);
const l1 = parseLst(`${DIR}/scubacod1.lst`);
const S0 = readSymFile(`${DIR}/scubacod0.sym`);
const S1 = readSymFile(`${DIR}/scubacod1.sym`);
const rom = fs.readFileSync(`${DIR}/scuba.rom`);
const cod0 = fs.readFileSync(`${DIR}/scubacod0.bin`);
const cod1 = fs.readFileSync(`${DIR}/scubacod1.bin`);
const zx0 = fs.readFileSync(`${DIR}/scubacod1.zx0`);

const COD0_LO = 0x100, COD0_HI = S0.SCUBACOD0_END;
const COD1_LO = COD0_HI, COD1_HI = S1.SCUBAZONE_END;
if (cod0.length !== COD0_HI - COD0_LO) throw new Error("cod0.bin не совпал с границами листинга");
if (cod1.length !== COD1_HI - COD1_LO) throw new Error("cod1.bin не совпал с границами листинга");

console.log(`ОБРАЗ ${DIR}/scuba.rom: ${rom.length} Б`);
console.log(`  блок 0 (бут, сырой)        ${cod0.length} Б  ${hx(COD0_LO)}..${hx(COD0_HI)}`);
console.log(`  блок 1 (ZX0)               ${zx0.length} Б в образе, ${cod1.length} Б в памяти  ${hx(COD1_LO)}..${hx(COD1_HI)}`);
console.log(`  сжатие блока 1             ${(100 * zx0.length / cod1.length).toFixed(1)} %`);
console.log("");

const h0 = holes(l0.cover, COD0_LO, COD0_HI);
const h1 = holes(l1.cover, COD1_LO, COD1_HI);

console.log("--- ПО ФАЙЛАМ ИСХОДНИКА (блок 1) ---");
const rows = [...l1.bytesOf.entries()].map(([f, n]) => ({ f, n, r: l1.rangeOf.get(f) }))
  .sort((a, b) => b.n - a.n);
for (const r of rows)
  console.log(`  ${r.f.padEnd(20)} ${String(r.n).padStart(6)} Б   ${hx(r.r[0])}..${hx(r.r[1])}`);
console.log(`  ${"ДЫРЫ (DS/ALIGN)".padEnd(20)} ${String(h1.holes.reduce((s, x) => s + x[1], 0)).padStart(6)} Б`);
console.log(`  ${"ВСЕГО".padEnd(20)} ${String([...l1.bytesOf.values()].reduce((a, b) => a + b, 0)
  + h1.holes.reduce((s, x) => s + x[1], 0)).padStart(6)} Б`);
console.log("");
console.log("--- ПО ФАЙЛАМ ИСХОДНИКА (блок 0) ---");
for (const [f, n] of [...l0.bytesOf.entries()].sort((a, b) => b[1] - a[1]))
  console.log(`  ${f.padEnd(20)} ${String(n).padStart(6)} Б   ${hx(l0.rangeOf.get(f)[0])}..${hx(l0.rangeOf.get(f)[1])}`);
console.log("");

console.log("--- ПРОБЕЛЫ В АДРЕСАХ (резервы, выравнивание, разрывы) ---");
for (const [a, n, kind, f] of [...l1.gaps, ...l0.gaps].sort((x, y) => y[1] - x[1]))
  if (n >= 1 && kind !== "перенос ORG/DISP")
    console.log(`  ${hx(a)} +${String(n).padStart(5)} Б  ${kind.padEnd(14)} ${f}`);
const align = [...l1.gaps, ...l0.gaps].filter(g => g[2] === "выравнивание" || g[2] === "разрыв");
console.log(`  --- итого выравнивание+разрывы: ${align.reduce((s, g) => s + g[1], 0)} Б`);
console.log("");

// --- секции верхнего уровня по меткам ---------------------------------------
const SECT = [
  ["бут: код+палитра+dzx0+звук", COD0_LO, COD0_HI],
  ["cod1: старт/строки меню",    COD1_LO, S1.ROM_CHARSET],
  ["ШРИФТ ZX (ROM_CHARSET)",     S1.ROM_CHARSET, S1.ROM_CHARSET_END],
  ["переменные игры",            S1.ROM_CHARSET_END, S1.MiniMap],
  ["MiniMap 32x32",              S1.MiniMap, S1.SCRATTR],
  ["SCRATTR (буфер атрибутов)",  S1.SCRATTR, 0x1000],
  ["спрайты+таблицы (codb)",     0x1000, S1.CODE_START || 0x7E6B],
  ["код игры (codc)",            S1.CODE_START || 0x7E6B, S1.SCUBAPANL_ZX0],
  ["битмап панели ZX0",          S1.SCUBAPANL_ZX0, S1.SCUBACOD1_ENDA],
  ["библиотека рекомпиляции",    S1.SCUBACOD1_ENDA, S1.SCUBACOD1_END],
  ["ZoneCopy (раскладка)",       S1.SCUBACOD1_END, S1.SCUBARELF_SRC],
  ["источник: рельеф 30x64",     S1.SCUBARELF_SRC, S1.SCUBARELF_END],
  ["источник: дайвер 32x64",     S1.SCUBADIVR_SRC, S1.SCUBADIVR_END],
  ["источник: зона (SprExplosion)", S1.SCUBAZONE_SRC, S1.SCUBAZONE_END],
];
console.log("--- СЕКЦИИ ВЕРХНЕГО УРОВНЯ ---");
let tot = 0;
for (const [n, a, b] of SECT) {
  if (a == null || b == null) { console.log(`  ${n}: НЕТ МЕТКИ — пропуск`); continue; }
  tot += b - a;
  console.log(`  ${n.padEnd(32)} ${hx(a)}..${hx(b)}  ${String(b - a).padStart(6)} Б`);
}
console.log(`  ${"СУММА".padEnd(32)} ${" ".repeat(14)}${String(tot).padStart(6)} Б  (образ в памяти ${COD1_HI - COD0_LO} Б)`);

if (process.env.MM_JSON) {
  fs.writeFileSync(process.env.MM_JSON, JSON.stringify({
    rom: rom.length, cod0: cod0.length, cod1: cod1.length, zx0: zx0.length,
    files1: [...l1.bytesOf.entries()].map(([f, n]) => ({ f, n, r: l1.rangeOf.get(f) })),
    files0: [...l0.bytesOf.entries()].map(([f, n]) => ({ f, n, r: l0.rangeOf.get(f) })),
    holes: [...h0.holes, ...h1.holes], sections: SECT,
  }, null, 1));
  console.log(`карта выгружена в ${process.env.MM_JSON}`);
}
