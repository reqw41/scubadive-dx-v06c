// ГЕЙТ ГРАНИЦ ЗОНЫ (-DEVICT): куда раскладка кладёт ломти на самом деле.
//
// Два независимых описания одной карты адресов: автомат `zcopy` в
// src8080/scubacod1.asm и функция slice_addrs в tools/mkzone.py. Их расхождение
// уже стоило прогона — бут шагал подряд, а генератор пропускал столбцы, и из
// 240 байт разошёлся 131. Гейт снимает АДРЕСА РЕАЛЬНЫХ ЗАПИСЕЙ раскладки в
// эмуляторе и сверяет их с картой генератора: сверяется поведение, а не два
// текста, поэтому «поправил в одном месте и забыл про второе» ловится сразу.
//
// Плюс три границы, каждая из которых уже кого-то убивала:
//   1. ломти не залезают на КОД (плоскость 1 лежит в 0xA000..0xBFFF, и пока код
//      не съехал ниже 0xA000, раскладка туда затирает сам код);
//   2. ломти не пересекают буферы пула (страницы 0xB000/0xB100 целиком и
//      столбцы 2..6 плоскости 0xC000, младшие 208..255);
//   3. каждая запись попадает в младшие байты 192..255 — то есть в зону, а не
//      в тело картинки ниже неё.
//
//   BOUNDS_INJECT=1 — сдвинуть карту генератора на один ломоть: сверка обязана
//                     покраснеть (иначе она сверяет не то).
//   BOUNDS_RELF=1   — проделать дыру в ряду ломтей рельефа: ряд обязан быть
//                     сплошным, иначе «блок n = страница RELIEF_HI+n» неверно.
//   BOUNDS_CODE=1   — объявить конец кода выше плоскости 1: страж кода обязан
//                     покраснеть.
//   BOUNDS_EMPTY=1  — обнулить выборку: гейт обязан покраснеть, а не «пройти».
"use strict";
const fs = require("fs"), path = require("path");
const { readSym } = require("./harness.js");
const { reachGame } = require("./drive.js");
const ROOT = path.resolve(__dirname, "../..");
const B = process.env.BUILD_DIR || "build";
const INJECT = process.env.BOUNDS_INJECT === "1", EMPTY = process.env.BOUNDS_EMPTY === "1";
const CODE = process.env.BOUNDS_CODE === "1";
const rom = `${ROOT}/${B}/ev/scuba.rom`, sym = `${ROOT}/${B}/ev/scubacod1.sym`;
for (const f of [rom, sym]) if (!fs.existsSync(f)) {
  console.log(`нет файла ${f} — собери DET=1 SRC=src8080 GEOM=1 EVICT=1 OUT=${B}/ev`);
  process.exit(2); }
const S = readSym(sym);
for (const n of ["ZoneCopy", "ZoneDone", "SCUBAZONE_N", "SCUBACOD1_END", "ZN_P1", "RELIEF_HI"])
  if (S[n] == null) { console.log(`нет метки ${n} в .sym`); process.exit(2); }

let fail = 0, checks = 0;
const chk = (ok, msg) => { checks++; if (ok) console.log("  ok      " + msg);
                           else { fail++; console.log("  ПРОВАЛ  " + msg); } };

// Карта генератора — тот же автомат, что в mkzone.py и в zcopy. Держать её здесь
// третьим текстом было бы ошибкой, поэтому она РОВНО такая же и сверяется с
// поведением: разойдётся любая из трёх — гейт покраснеет.
function mapAddrs(n) {
  const out = []; let d = 0xC0, inP1 = false;
  while (out.length < n) {
    out.push(d * 256 + 192);
    let a = (d + 1) & 0xff;
    // Страницы RELIEF_HI..0xFF отданы рельефу целиком (он переезжает одним
    // куском), поэтому плоскости 2 и 3 кончаются на RELIEF_HI, а не на 0x100.
    if (a === S.RELIEF_HI) { a = S.ZN_P1; inP1 = true; }
    else if (a === 0xC2) a = 0xC7;                 // буферы пула, столбцы 2..6
    if (a === 0xB0) a = 0xB2;                      // страницы пула 0xB000/0xB100
    if (inP1 && a >= 0xC0) break;                  // плоскость 1 кончилась
    d = a;
  }
  return out;
}
const N = S.SCUBAZONE_N;
const want = mapAddrs(N);
if (INJECT) want.unshift(want[0] - 256);          // сдвиг на ломоть
// РЕЛЬЕФ ЦЕЛЫМ КУСКОМ идёт ПЕРВЫМ в той же процедуре ZoneCopy: 30 ломтей подряд
// от RELIEF_HI до 0xFF, без единого пропуска. Отсутствие пропусков — не
// косметика: адресация «блок n = страница RELIEF_HI+n» держится ровно на ней.
const NRELF = 256 - S.RELIEF_HI;
const wantRelf = [];
for (let i = 0; i < NRELF; i++) wantRelf.push((S.RELIEF_HI + i) * 256 + 192);
if (process.env.BOUNDS_RELF === "1") wantRelf[NRELF - 1] -= 256;   // дыра в ряду

// --- снять РЕАЛЬНЫЕ адреса записей раскладки ---------------------------------
const seen = [];                                   // база каждого ломтя по порядку
let inCopy = false, outside = 0, lowLo = 0;
const g = reachGame(rom, sym, { cpu: "i8080", level: 4, seed: 0x0167,
  preHook: (m, SS) => {
    // Раскладка зовётся ДВАЖДЫ за игру (перед PrepareMiniMap и после панели).
    // Мерить надо ОДНУ: иначе адреса ломтей приходят по второму разу, число
    // ломтей удваивается и проверка «все различны» краснеет на здоровой сборке.
    let done = false;
    m.onPc(SS.ZoneCopy, () => { if (!done) inCopy = true; });
    m.onPc(SS.ZoneDone, () => { if (inCopy) { inCopy = false; done = true; } });
    const o = m.memory.write.bind(m.memory);
    m.memory.write = (a, v, st) => { a &= 0xffff;
      if (inCopy && !EMPTY) {
        const lo = a & 0xff, base = (a & 0xff00) | 192;
        if (lo < 192) lowLo++;                     // запись ниже зоны
        if (a < 0xA000) outside++;                 // вообще не в видеопамяти
        if (seen[seen.length - 1] !== base) seen.push(base);
      }
      return o(a, v, st); }; } });
let t = 0; g.m.onPc(S.LD9C0, () => { t++; });
let q = 0; while (t < 300 && q < 400000) { g.m.step(); q++; }

chk(seen.length > 0, `раскладка отработала: ломтей записано ${seen.length} ` +
    `(объявлено ${NRELF} рельефа + ${N} данных)`);
// сперва рельеф, потом ломти данных — порядок задан телом ZoneCopy
const seenRelf = seen.slice(0, NRELF), seenData = seen.slice(NRELF);
const rmis = [];
for (let i = 0; i < Math.max(seenRelf.length, wantRelf.length); i++)
  if (seenRelf[i] !== wantRelf[i]) rmis.push(i);
chk(seenRelf.length === NRELF && rmis.length === 0,
    `рельеф лёг ${NRELF} ломтями подряд от $${(wantRelf[0]||0).toString(16).toUpperCase()} ` +
    `(расхождений ${rmis.length}` + (rmis.length ? `, первое на ломте ${rmis[0]}: реально ` +
    `$${(seenRelf[rmis[0]]||0).toString(16).toUpperCase()}, карта ` +
    `$${(wantRelf[rmis[0]]||0).toString(16).toUpperCase()}` : "") + ")");
chk(seenData.length === N, `число ломтей данных совпало с SCUBAZONE_N: ${seenData.length} против ${N}`);
const mismatch = [];
for (let i = 0; i < Math.max(seenData.length, want.length); i++)
  if (seenData[i] !== want[i]) mismatch.push(i);
chk(seenData.length > 0 && mismatch.length === 0,
    `адреса ломтей данных совпали с картой генератора (расхождений ${mismatch.length}` +
    (mismatch.length ? `, первое на ломте ${mismatch[0]}: реально $${(seenData[mismatch[0]]||0).toString(16)
     .toUpperCase()}, карта $${(want[mismatch[0]]||0).toString(16).toUpperCase()}` : "") + ")");
chk(!EMPTY && lowLo === 0, `все записи попали в младшие 192..255 (ниже зоны ${lowLo})`);
chk(!EMPTY && outside === 0, `все записи попали в видеопамять 0xA000+ (мимо ${outside})`);

// --- граница 1: ломти не залезают на код -------------------------------------
// Мера берётся по ВСЕЙ карте, а не по занятой её части. Первая версия смотрела
// только на розданные ломти: при малом выселении плоскость 1 не задействована,
// выборка пуста, и проверка проходила вхолостую — негативный контроль
// BOUNDS_CODE=1 честно оставался зелёным, то есть страж не сторожил ничего.
// Конец кода — SCUBACOD1_END, а НЕ SCUBACOD1_ENDA: первая версия гейта взяла
// вторую метку (0xA594 против 0xAD3E) и объявила бы безопасной карту, лежащую
// поверх полутора килобайт библиотеки рекомпиляции и самой выселенной области.
const codeEnd = CODE ? 0xB800 : S.SCUBACOD1_END;
const full = mapAddrs(999);
const p1full = full.filter(a => a < 0xC000);       // все ломти плоскости 1 в карте
const p1 = seen.filter(a => a < 0xC000);           // из них розданные сейчас
chk(p1full.length > 0 && p1full[0] >= codeEnd,
    `карта не налезает на код ни одним ломтем: код до $${codeEnd.toString(16).toUpperCase()}, ` +
    `первый ломоть плоскости 1 в карте $${(p1full[0] || 0).toString(16).toUpperCase()} ` +
    `(роздано из них ${p1.length})`);

// --- граница 2: ломти не пересекают буферы пула -------------------------------
const clash = seen.filter(a => (a >= 0xB000 && a <= 0xB1FF) ||
                               (a >= 0xC000 && a < 0xE000 &&
                                [2,3,4,5,6].includes((a >> 8) & 0x1f) && (a & 0xff) >= 208));
chk(seen.length > 0 && clash.length === 0,
    `ломти не пересекают буферы пула (пересечений ${clash.length})`);

// --- граница 3: ломти не повторяются -----------------------------------------
chk(seen.length > 0 && new Set(seen).size === seen.length,
    `все ломти различны (уникальных ${new Set(seen).size} из ${seen.length})`);

console.log(`  ёмкость карты: ${mapAddrs(999).length} ломтей = ${mapAddrs(999).length * 64} Б; ` +
            `занято ${N} = ${N * 64} Б`);
console.log(fail ? `ГЕЙТ КРАСНЫЙ: ${fail} из ${checks}` : `ГЕЙТ ЗЕЛЁНЫЙ: все ${checks} проверки`);
process.exit(fail ? 1 : 0);
