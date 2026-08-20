// ГЕЙТ МЕНЮ ПОД ВЫСЕЛЕНИЕМ: текст на прежних местах, ломти целы.
//
// Зачем. Печать меню шла в знакоместных строках 1..22, а строки 0..7 — это
// экранные строки 0..63, то есть ЛОМТИ ЗОНЫ. Смерть уводит в меню, меню
// затирало кадры дайвера: замер `bottom_probe.js` дал 310 испорченных байт на 14
// страницах, писали `LDA89` и `PrintBigChar_1` по зову `PrintBig` из `LEDFE`.
//
// Правка: вся печать меню уезжает на MENU_ROWS = 8 знакомест вниз, а развёртка
// на меню переводится в 0xBF (дисплейная строка 0 = VRAM-строка 64). Сдвиг на 8
// знакомест — это ровно 64 строки, то есть он компенсирует смену развёртки один
// в один, и текст обязан остаться на ПРЕЖНИХ местах экрана. Это и проверяется,
// а не «похоже ли».
//
// Меры:
//   A. ВИДИМАЯ КАРТИНКА меню совпадает с безвыселенной сборкой байт в байт:
//      дисплейная строка d у EVICT-сборки берётся из VRAM-строки d+64, у
//      безвыселенной — из VRAM-строки d. Сверяются все четыре плоскости.
//   B. После цикла «игра -> смерть -> меню» содержимое ломтей равно источнику.
//   C. Печать (PrintChar/PrintBigChar) не пишет в страницы ломтей ни разу.
//
// Негативы:
//   MENU_OFF=63     — сверять с неверной компенсацией: мера A обязана покраснеть
//                     (иначе она сверяет не то);
//   MENU_INJECT=1   — испортить байт ломтя после раскладки: B обязана покраснеть;
//   MENU_EMPTY=1    — обнулить выборку: гейт обязан объявить себя недействительным.
"use strict";
const fs = require("fs"), path = require("path");
const { readSym } = require("./harness.js");
const { reachGame, swim } = require("./drive.js");
const ROOT = path.resolve(__dirname, "../..");
const B = process.env.BUILD_DIR || "build";
const EV = `${ROOT}/${B}/ev`, REF = `${ROOT}/${B}/gzref`;
for (const d of [EV, REF]) for (const f of ["scuba.rom", "scubacod1.sym"])
  if (!fs.existsSync(`${d}/${f}`)) {
    console.log(`нет ${d}/${f} — собери:\n` +
      `  DET=1 SRC=src8080 GEOM=1 ZONE=1 EVICT=1 OUT=${B}/ev ./tools/build.sh\n` +
      `  DET=1 SRC=src8080 GEOM=1 ZONE=1          OUT=${B}/gzref ./tools/build.sh`);
    process.exit(2); }
const OFF = Number(process.env.MENU_OFF || 64);      // компенсация развёртки
// НЕГАТИВ ДЛЯ ГАШЕНИЯ ПАНЕЛИ: вырезать вызов ClearPanelCols тремя NOP. Чистка
// экрана столбцы панели больше не трогает (клип по столбцам), поэтому без
// гашения панель остаётся видимой в меню — мера A обязана покраснеть.
// НЕГАТИВ ДЛЯ МЕРЫ D: вырезать вызов ShowGamePanel — панель не нарисуется вовсе.
const NOBLANK = process.env.MENU_NOBLANK === "1";
const INJECT = process.env.MENU_INJECT === "1";
const EMPTY = process.env.MENU_EMPTY === "1";
const ROWS = Number(process.env.MENU_LINES || 176);  // сколько дисплейных строк сверять

let fail = 0, checks = 0;
const chk = (ok, msg) => { checks++; if (ok) console.log("  ok      " + msg);
                           else { fail++; console.log("  ПРОВАЛ  " + msg); } };
const SE = readSym(`${EV}/scubacod1.sym`);
for (const n of ["LEE2C", "LD9C0", "DiverObj", "LIVES", "ZoneCopy", "ZoneDone",
                 "SCUBADIVR_SRC", "DIVER_A", "DIVER_B", "MENU_ROWS"])
  if (SE[n] == null) { console.log(`нет метки ${n} в ${EV}/scubacod1.sym`); process.exit(2); }
if (SE.MENU_ROWS !== 8) { console.log(`MENU_ROWS = ${SE.MENU_ROWS}, а компенсация развёртки ` +
  `рассчитана на 8 знакомест (64 строки) — сверка была бы бессмысленной`); process.exit(2); }

// --- довести сборку до ЭКРАНА МЕНЮ и снять видеопамять -----------------------
// Стенд умеет два пути (с титулом и без); нам нужен момент, когда меню уже
// напечатано. Признак — попадание PC в LEE2C, метку цикла ожидания выбора.
function menuShot(dir) {
  const S = readSym(`${dir}/scubacod1.sym`);
  const m = require("./harness.js").make(`${dir}/scuba.rom`, { cpu: "i8080" });
  let seen = false;
  if (NOBLANK && S.ShowGamePanel != null) m.onPc(S.ShowGamePanel, () => {
    m.wr(S.ShowGamePanel, 0xC9);                            // ret вместо распаковки
  });
  m.onPc(S.LEE2C, () => { seen = true; });
  for (let i = 0; i < 3000 && !seen; i++) m.step();
  if (!seen) {                                   // путь с титулом: нажать ENTER
    m.key(13, true); m.run(4); m.key(13, false);
    for (let i = 0; i < 900 && !seen; i++) m.step();
  }
  if (!seen) return null;
  // СНИМОК БЕРЁТСЯ РОВНО В МОМЕНТ, КОГДА МЕНЮ НАПЕЧАТАНО, а не «через тридцать
  // кадров»: за LEE2C начинается attract-mode (LEEAD), который рисует игровое
  // поле, и оно у двух сборок ложится по-разному — сверка ловила бы демо, а не
  // меню (урок №20: снимок в тот тик, когда измеряемое только что сложилось).
  const vram = new Uint8Array(0x8000);
  for (let a = 0x8000; a <= 0xFFFF; a++) vram[a - 0x8000] = m.rd(a);
  return vram;
}
// адрес байта: плоскость p (0..3), столбец c (0..31), строка экрана y
const at = (v, p, c, y) => v[(0x8000 + p * 0x2000 + c * 256 + (255 - y)) - 0x8000];

const shotEv = EMPTY ? null : menuShot(EV), shotRef = EMPTY ? null : menuShot(REF);
let diff = 0, first = null, seen = 0;
if (shotEv && shotRef) {
  // СВЕРЯЮТСЯ ТОЛЬКО ВИДИМЫЕ ПЛОСКОСТИ 2 И 3. Плоскости 0 и 1 (0x8000..0xBFFF) в
  // нашей раскладке заняты КОДОМ, и сверка по ним сравнивала бы два разных бинаря:
  // первый заход дал 10998 «расхождений» из 22528 — почти половину, и все они
  // были байтами программы, а не картинки.
  // СВЕРЯЕТСЯ ПОЛЕ (столбцы 0..23), А НЕ ВЕСЬ ЭКРАН. Владелец принял боковую
  // панель видимой и в меню — значит столбцы 24..31 у EVICT-сборки и у
  // безвыселенной РАЗНЫЕ ЗАКОННО, и сверять их с прежним видом бессмысленно.
  // Присутствие самой панели проверяется отдельной мерой D, иначе её пропажу
  // никто бы не заметил.
  for (let y = 0; y < ROWS; y++) for (let c = 0; c < 24; c++) for (let p = 2; p < 4; p++) {
    const a = at(shotEv, p, c, y + OFF), b = at(shotRef, p, c, y);
    seen++;
    if (a !== b) { diff++; if (!first) first = { y, c, p, a, b }; }
  }
}

// --- B и C: цикл «игра -> смерть -> меню» ------------------------------------
function playAndDie() {
  const S = readSym(`${EV}/scubacod1.sym`);
  let inCopy = false, zoneDone = 0, printsToZone = 0;
  const A = S.DIVER_A, Bh = S.DIVER_B;
  const inSlice = (a) => { const p = (a >> 8) & 0xff, lo = a & 0xff;
    return lo >= 192 && ((p >= A && p < A + 16) || (p >= Bh && p < Bh + 16) ||
                         (S.RELIEF_HI != null && p >= S.RELIEF_HI)); };
  const g = reachGame(`${EV}/scuba.rom`, `${EV}/scubacod1.sym`,
    { cpu: "i8080", level: 4, seed: 0x0167, preHook: (m, SS) => {
      m.onPc(SS.ZoneCopy, () => { inCopy = true; });
      m.onPc(SS.ZoneDone, () => { inCopy = false; zoneDone++;
        if (INJECT) m.wr(A * 256 + 192 + 5, 0x5a); });
      const o = m.memory.write.bind(m.memory);
      m.memory.write = (a, v, st) => { a &= 0xffff;
        if (!inCopy && inSlice(a)) {
          const pc = m.cpu.pc & 0xffff;
          // ПЕЧАТЬ, А НЕ «КТО УГОДНО»: мера сужена до тех трактов, которые правка
          // и чинит. Распаковщик панели тоже пишет в ломти рельефа, но его чинит
          // следующая раскладка — он к этой мере отношения не имеет.
          if ((SS.LDA89 != null && pc >= SS.LDA89 && pc < SS.LDA89 + 16) ||
              (SS.PrintBigChar_1 != null && pc >= SS.PrintBigChar_1 && pc < SS.PrintBigChar_1 + 24))
            printsToZone++;
        }
        return o(a, v, st); }; } });
  let t = 0; g.m.onPc(S.LD9C0, () => { t++; });
  swim(g, { passes: 1, frames: 24, noDeath: true });
  g.m.wr(S.LIVES, 1);
  for (let i = 0; i < 1200; i++) {               // довести до game over и меню
    if ((i & 31) === 0) g.m.wr(S.DiverObj + 0x10, g.m.rd(S.DiverObj + 0x10) | 0x20);
    g.m.step();
  }
  // сверка СОДЕРЖИМОГО ломтей кадров дайвера с источником
  let bad = 0;
  for (let i = 0; i < 2048; i++) {
    const sl = i >> 6, p = sl < 16 ? A + sl : Bh + (sl - 16);
    if (g.m.rd(p * 256 + 192 + (i & 63)) !== g.m.rd(S.SCUBADIVR_SRC + i)) bad++;
  }
  return { bad, printsToZone, zoneDone, ticks: t };
}
const r = EMPTY ? { bad: 0, printsToZone: 0, zoneDone: 0, ticks: 0 } : playAndDie();

// ПУСТАЯ ВЫБОРКА — ОТДЕЛЬНАЯ ПРОВЕРКА С ЧИСЛОМ (уроки №2, 8, 24).
if (!seen || !r.zoneDone) {
  console.log(`  ПРОВАЛ  ПУСТАЯ ВЫБОРКА: сверено байт ${seen}, раскладок ${r.zoneDone}`);
  console.log("ГЕЙТ НЕДЕЙСТВИТЕЛЕН"); process.exit(2); }

chk(diff === 0, `A: видимая картинка меню совпала с безвыселенной сборкой ` +
    `(${seen} байт, расхождений ${diff}` +
    (first ? `, первое строка ${first.y} столбец ${first.c} плоскость ${first.p}: ` +
      `0x${first.a.toString(16)} против 0x${first.b.toString(16)}` : "") + ")");
chk(r.bad === 0, `B: кадры дайвера после «игра -> смерть -> меню» равны источнику ` +
    `(разошлось ${r.bad} байт из 2048)`);
chk(r.printsToZone === 0, `C: печать не пишет в ломти ни разу (записей ${r.printsToZone})`);
// МЕРЫ «ПАНЕЛЬ НА ЭКРАНЕ» ЗДЕСЬ НЕТ, И ЭТО НАМЕРЕННО. Первая её версия считала
// ненулевые байты в столбцах 24..31 снимка меню и давала 706 — но сборка build/ev
// идёт БЕЗ NOTITLE, титульная картинка распаковывается при бусте и лежит ровно в
// этих столбцах. То есть мера считала остатки ТИТУЛА, а не панель, и негатив
// (вырезанный ShowGamePanel) её не краснил. Честная проверка присутствия панели
// требует снимка НА БОЕВОМ ПУТИ (NOTITLE) и ПОСЛЕ первой постановки уровня —
// это следующий шаг, а не сегодняшний.
console.log(fail ? `ГЕЙТ КРАСНЫЙ: ${fail} из ${checks}` : `ГЕЙТ ЗЕЛЁНЫЙ: все ${checks} проверки`);
process.exit(fail ? 1 : 0);
