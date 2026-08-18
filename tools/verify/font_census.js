// ПЕРЕПИСЬ ШРИФТА: какие глифы ROM_CHARSET реально нужны. Только замер.
//
// Шрифт — charset ZX-ПЗУ, символы $20..$5A (хвост $5B..$5F в дереве уже
// закомментирован), по 8 байт на глиф. Адресация арифметическая:
// PrintChar делает BC = ROM_CHARSET, смещение = (символ-$20)*8 — значит дыру в
// СЕРЕДИНЕ выкинуть нельзя, сдвинутся все последующие глифы.
//
// Два независимых источника, которые обязаны сойтись:
//   СТАТИКА — все строки ABYTE в src8080/*.asm (+ цифры, которые печатает
//             PrintDec из ROM_CHARSET+$80, то есть глиф '0');
//   ПРОГОН  — сторож ЧТЕНИЯ по диапазону ROM_CHARSET..ROM_CHARSET_END: какие
//             8-байтные глифы читались на титуле, в меню, в игре и на game over.
// Расхождение — не помеха, а находка: докладывается явно.
//
//   node tools/verify/font_census.js <rom> <sym1,sym2> [ticks] [srcdir]
"use strict";
const fs = require("fs"), path = require("path");
const { reachGame, KEY } = require("./drive.js");
const { readSym } = require("./harness.js");

const rom = process.argv[2], symArg = process.argv[3];
const NT = parseInt(process.argv[4] || "1200", 10);
const SRC = process.argv[5] || path.resolve(__dirname, "../../src8080");

const symList = symArg.split(",");
const S = {};
for (const p of symList) Object.assign(S, readSym(p));
const F0 = S.ROM_CHARSET, F1 = S.ROM_CHARSET_END;
if (F0 == null || F1 == null) { console.error("нет меток ROM_CHARSET/ROM_CHARSET_END"); process.exit(2); }
const NGLYPH = (F1 - F0) / 8;

// ---- СТАТИКА ---------------------------------------------------------------
const staticSet = new Set();
const strFiles = [];
for (const f of fs.readdirSync(SRC)) {
  if (!f.endsWith(".asm")) continue;
  const txt = fs.readFileSync(path.join(SRC, f), "latin1");
  for (const ln of txt.split("\n")) {
    const t = ln.replace(/^\s+/, "");
    if (t.startsWith(";")) continue;                 // закомментированная строка не печатается
    const m = ln.match(/ABYTE\s+-\$20\s+"([^"]*)"/);
    if (m) { strFiles.push(f + ": " + m[1]); for (const ch of m[1]) staticSet.add(ch); }
  }
}
// PrintDec печатает цифры из ROM_CHARSET+$80 = глиф '0', дальше по порядку
for (const ch of "0123456789") staticSet.add(ch);
if (staticSet.size === 0) { console.log("ВЫБОРКА ПУСТА: ни одной строки ABYTE не найдено"); process.exit(1); }

// ---- ПРОГОН ----------------------------------------------------------------
const hitG = new Uint32Array(NGLYPH);
const byPc = new Map();                  // метка читателя -> Set индексов глифов
// ЛОВУШКА, В КОТОРУЮ ЛЕГКО ПОПАСТЬ: наивный сторож чтения даёт ВСЕ 59 глифов
// «живыми». Читает их не печать, а ЗАГРУЗЧИК: Init_1 переносит блок, dzx0_ldir1
// его распаковывает — оба проходят по всему образу, шрифт внутри. Поэтому
// чтения из зоны бута 0x0100..0x0322 не считаются.
const BOOT0 = 0x0100, BOOT1 = 0x0323;
function attach(m) {
  const orig = m.memory.read.bind(m.memory);
  m.memory.read = (a, st) => {
    const ad = a & 0xffff;
    if (!st && ad >= F0 && ad < F1) {
      const pc = m.cpu.pc & 0xffff;
      if (!(pc >= BOOT0 && pc < BOOT1)) {
        hitG[(ad - F0) >> 3]++;
        const k = lab(pc);
        let s = byPc.get(k); if (!s) { s = new Set(); byPc.set(k, s); }
        s.add((ad - F0) >> 3);
      }
    }
    return orig(a, st);
  };
}
const labs = Object.entries(S).sort((a, b) => a[1] - b[1]);
function lab(a) { let lo = 0, hi = labs.length - 1, x = null;
  while (lo <= hi) { const mm = (lo + hi) >> 1;
    if (labs[mm][1] <= a) { x = labs[mm]; lo = mm + 1; } else hi = mm - 1; }
  return x ? (a - x[1] ? `${x[0]}+${a - x[1]}` : x[0]) : "?"; }
// Титул и меню проходятся внутри reachGame — сторож ставим ДО них через preHook.
const g = reachGame(rom, symList[0], { cpu: "i8080", level: 4, seed: 0x0167, preHook: (m) => attach(m) });
const m = g.m;
let ticks = 0;
m.onPc(S.LD9C0, () => { ticks++; });
m.key(38, true);
let guard = 0;
while (ticks < NT && guard < 4000000) { m.step(); guard++; }
m.key(38, false);
// GAME OVER: обнуляем кислород и жизни и даём доиграть
const beforeGO = hitG.slice();
let goReached = 0, menuReached = 0;
if (S.LEA7A != null) m.onPc(S.LEA7A, () => { goReached++; });     // конец партии: обновить HISCORE, чистить экран
if (S.LEE2C != null) m.onPc(S.LEE2C, () => { menuReached++; });   // главное меню
m.wr(S.OXYGEN, 0); m.wr(S.OXYGEN + 1, 0); m.wr(S.LIVES, 1);
for (let i = 0; i < 3000; i++) m.step();
let goNew = 0;
for (let i = 0; i < NGLYPH; i++) if (!beforeGO[i] && hitG[i]) goNew++;
const goTag = goReached ? `конец партии достигнут (${goReached}), возврат в меню ${menuReached}`
                        : "ВЫБОРКА ПУСТА: конец партии НЕ достигнут, экран после смерти не мерился";

// ---- сведение --------------------------------------------------------------
const chOf = i => String.fromCharCode(0x20 + i);
const runSet = new Set();
for (let i = 0; i < NGLYPH; i++) if (hitG[i]) runSet.add(chOf(i));
if (runSet.size === 0) { console.log("ВЫБОРКА ПУСТА: за прогон не прочитан НИ ОДИН байт шрифта"); process.exit(1); }

const used = new Set([...staticSet, ...runSet].filter(c => c.charCodeAt(0) >= 0x20 && c.charCodeAt(0) < 0x20 + NGLYPH));
const unusedIdx = [];
for (let i = 0; i < NGLYPH; i++) if (!used.has(chOf(i))) unusedIdx.push(i);

const show = s => [...s].sort().map(c => c === " " ? "␠" : c).join("");
console.log(`=== ШРИФТ ROM_CHARSET 0x${F0.toString(16).toUpperCase()}..0x${(F1 - 1).toString(16).toUpperCase()}: ${NGLYPH} глифов, ${NGLYPH * 8} Б`);
console.log(`    строк ABYTE найдено: ${strFiles.length}`);
console.log(`    СТАТИКА (${staticSet.size}): ${show(staticSet)}`);
console.log(`    ПРОГОН  (${runSet.size}): ${show(runSet)}   [тиков ${ticks}; конец партии: новых глифов ${goNew}, ${goTag}]`);
const onlyStatic = [...staticSet].filter(c => !runSet.has(c));
const onlyRun = [...runSet].filter(c => !staticSet.has(c));
console.log("    читатели шрифта (PC -> метка), кроме загрузчика:");
for (const [k, s] of byPc)
  console.log(`      ${k}: ${s.size} глифов  ${[...s].sort((a, b) => a - b).map(i => chOf(i) === " " ? "␠" : chOf(i)).join("")}`);
console.log(`    только в статике: ${onlyStatic.length ? show(onlyStatic) : "нет"}`);
console.log(`    только в прогоне: ${onlyRun.length ? show(onlyRun) : "нет"}`);
console.log(`    ИТОГО живых глифов: ${used.size}, мёртвых: ${unusedIdx.length} (${unusedIdx.length * 8} Б)`);

// непрерывные куски мёртвых глифов
const runs = [];
for (const i of unusedIdx) {
  const last = runs[runs.length - 1];
  if (last && last[1] === i - 1) last[1] = i; else runs.push([i, i]);
}
console.log("    непрерывные куски мёртвых глифов (годятся только под ДАННЫЕ):");
for (const [a, b] of runs)
  console.log(`      '${chOf(a)}'..'${chOf(b)}'  индексы ${a}..${b}  адрес 0x${(F0 + a * 8).toString(16).toUpperCase()}  ${(b - a + 1) * 8} Б`);
const tail = runs.length && runs[runs.length - 1][1] === NGLYPH - 1 ? runs[runs.length - 1] : null;
console.log(`    ХВОСТ (отрезается со сдвигом вершины кода, без переселений): ` +
  (tail ? `'${chOf(tail[0])}'..'${chOf(tail[1])}' = ${(tail[1] - tail[0] + 1) * 8} Б` : "ПУСТ — последний глиф живой"));
