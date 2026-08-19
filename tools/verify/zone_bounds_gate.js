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
//   BOUNDS_DIVR=1   — то же для ряда кадров дайвера: на сплошности ряда держится
//                     «угол n -> страницы ряд+2n и +2n+1».
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
for (const n of ["ZoneCopy", "ZoneDone", "SCUBAZONE_N", "SCUBACOD1_END", "ZN_P1", "RELIEF_HI",
                 "DIVER_A", "DIVER_B", "ZN_DATA0", "ZN_DATA_N"])
  if (S[n] == null) { console.log(`нет метки ${n} в .sym`); process.exit(2); }

let fail = 0, checks = 0;
const chk = (ok, msg) => { checks++; if (ok) console.log("  ok      " + msg);
                           else { fail++; console.log("  ПРОВАЛ  " + msg); } };

// Карта генератора — тот же автомат, что в mkzone.py и в zcopy. Держать её здесь
// третьим текстом было бы ошибкой, поэтому она РОВНО такая же и сверяется с
// поведением: разойдётся любая из трёх — гейт покраснеет.
// КАРТА ЛОМТЕЙ ДАННЫХ — ОДИН СПЛОШНОЙ РЯД. Прежде она обходила три плоскости и
// перешагивала занятые столбцы, и этот автомат приходилось держать ТРЕМЯ
// одинаковыми текстами (zcopy, mkzone, гейт). После переноса кадров дайвера
// свободные страницы сведены к ряду ZN_DATA0..DIVER_B-1, и автомат выродился в
// «подряд»: расходиться стало нечему, а ёмкость проверяется отдельно.
function mapAddrs(n) {
  const out = [];
  for (let i = 0; i < Math.min(n, S.ZN_DATA_N); i++) out.push((S.ZN_DATA0 + i) * 256 + 192);
  return out;
}
const N = S.SCUBAZONE_N;
const want = mapAddrs(N);
// Сдвиг карты на ломоть. База берётся от ZN_DATA0, а не от want[0]: корпус
// данных может быть ПУСТ (после того как область наборов существ ушла из
// кандидатов целиком), и от пустого массива сдвигать нечего.
if (INJECT) want.unshift((S.ZN_DATA0 - 1) * 256 + 192);
// РЕЛЬЕФ ЦЕЛЫМ КУСКОМ идёт ПЕРВЫМ в той же процедуре ZoneCopy: 30 ломтей подряд
// от RELIEF_HI до 0xFF, без единого пропуска. Отсутствие пропусков — не
// косметика: адресация «блок n = страница RELIEF_HI+n» держится ровно на ней.
const NRELF = 256 - S.RELIEF_HI;
const wantRelf = [];
for (let i = 0; i < NRELF; i++) wantRelf.push((S.RELIEF_HI + i) * 256 + 192);
if (process.env.BOUNDS_RELF === "1") wantRelf[NRELF - 1] -= 256;   // дыра в ряду

// КАДРЫ ДАЙВЕРА: 32 ломтя ДВУМЯ рядами по 16 (углы 0..7 и 8..15). Сплошность
// каждого ряда — не косметика: на ней держится «угол n -> страницы ряд+2n и +2n+1»,
// и разрыв ряда даёт ровно тот дефект, что однажды ушёл на железо.
const wantDivr = [];
for (let i = 0; i < 16; i++) wantDivr.push((S.DIVER_A + i) * 256 + 192);
for (let i = 0; i < 16; i++) wantDivr.push((S.DIVER_B + i) * 256 + 192);
if (process.env.BOUNDS_DIVR === "1") wantDivr[5] -= 256;          // дыра в ряду A

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
    `(объявлено ${NRELF} рельефа + 32 кадров дайвера + ${N} данных)`);
// порядок задан телом ZoneCopy: рельеф, кадры дайвера, ломти данных
const seenRelf = seen.slice(0, NRELF), seenDivr = seen.slice(NRELF, NRELF + 32),
      seenData = seen.slice(NRELF + 32);
const rmis = [];
for (let i = 0; i < Math.max(seenRelf.length, wantRelf.length); i++)
  if (seenRelf[i] !== wantRelf[i]) rmis.push(i);
chk(seenRelf.length === NRELF && rmis.length === 0,
    `рельеф лёг ${NRELF} ломтями подряд от $${(wantRelf[0]||0).toString(16).toUpperCase()} ` +
    `(расхождений ${rmis.length}` + (rmis.length ? `, первое на ломте ${rmis[0]}: реально ` +
    `$${(seenRelf[rmis[0]]||0).toString(16).toUpperCase()}, карта ` +
    `$${(wantRelf[rmis[0]]||0).toString(16).toUpperCase()}` : "") + ")");
const dmis = [];
for (let i = 0; i < Math.max(seenDivr.length, wantDivr.length); i++)
  if (seenDivr[i] !== wantDivr[i]) dmis.push(i);
chk(seenDivr.length === 32 && dmis.length === 0,
    `кадры дайвера легли 32 ломтями двумя рядами по 16 от ` +
    `$${(wantDivr[0]||0).toString(16).toUpperCase()} и ` +
    `$${(wantDivr[16]||0).toString(16).toUpperCase()} (расхождений ${dmis.length}` +
    (dmis.length ? `, первое на ломте ${dmis[0]}: реально ` +
     `$${(seenDivr[dmis[0]]||0).toString(16).toUpperCase()}, карта ` +
     `$${(wantDivr[dmis[0]]||0).toString(16).toUpperCase()}` : "") + ")");
chk(seenData.length === N, `число ломтей данных совпало с SCUBAZONE_N: ${seenData.length} против ${N}`);
const mismatch = [];
for (let i = 0; i < Math.max(seenData.length, want.length); i++)
  if (seenData[i] !== want[i]) mismatch.push(i);
// ПУСТОЙ РЯД ДАННЫХ — ЗАКОННОЕ СОСТОЯНИЕ, и мерой пустоты тут служит НЕ
// «наблюдений больше нуля», а совпадение с объявленным SCUBAZONE_N: цель по Top
// держат целые массивы, а поштучных ломтей может не быть вовсе. Сторож пустой
// выборки при этом никуда не делся — он стоит на рельефе и кадрах дайвера,
// которые пустыми не бывают никогда.
chk(seenData.length === N && mismatch.length === 0,
    `адреса ломтей данных совпали с картой генератора (ломтей ${seenData.length} из ${N}, ` +
    `расхождений ${mismatch.length}` +
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
// САМЫЙ НИЗКИЙ ЛОМОТЬ В КАРТЕ теперь принадлежит не ломтям данных, а ряду A
// кадров дайвера (0xB2C0): ломти данных живут высоко и на код не налезут никогда.
// Мера берётся по ВСЕЙ карте, а не по розданной её части — первая версия
// смотрела только на розданные ломти, выборка бывала пуста, и негативный контроль
// честно оставался зелёным, то есть страж не сторожил ничего.
const full = mapAddrs(999).concat(wantDivr);
const p1full = full.filter(a => a < 0xC000).sort((x, y) => x - y);
const p1 = seen.filter(a => a < 0xC000);           // из них розданные сейчас
chk(p1full.length > 0 && p1full[0] >= codeEnd,
    `карта не налезает на код ни одним ломтем: код до $${codeEnd.toString(16).toUpperCase()}, ` +
    `самый низкий ломоть в карте $${(p1full[0] || 0).toString(16).toUpperCase()} ` +
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

console.log(`  ёмкость ряда данных: ${S.ZN_DATA_N} ломтей = ${S.ZN_DATA_N * 64} Б, занято ` +
            `${N} = ${N * 64} Б; кадры дайвера ${wantDivr.length} ломтей, рельеф ${NRELF}`);
console.log(fail ? `ГЕЙТ КРАСНЫЙ: ${fail} из ${checks}` : `ГЕЙТ ЗЕЛЁНЫЙ: все ${checks} проверки`);
process.exit(fail ? 1 : 0);
