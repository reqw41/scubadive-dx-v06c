// ГЕЙТ ДЕМО-РЕЖИМА МЕНЮ: простой на стартовом экране обязан доиграть и вернуться.
//
// Зачем этот гейт существует. Боевой образ `d7664ebb` ВИС НАМЕРТВО через ~20
// секунд простоя на стартовом экране — то есть в самом обычном для владельца
// положении: включил и отошёл. Механизм: демо зовёт `PrepareMiniMap` с закрытыми
// прерываниями, та через `LA193` рождает ракушки из тайлов рельефа `$1C..$1F`, а
// рельеф под -DEVICT лежит в ЛОМТЯХ, которые раскладывал только вход в игру, то
// есть ПОЗЖЕ. Ракушек нет -> в `TableStatics` одни сундуки -> цикл `LB1D4` ищет
// запись со строкой >= $48 и флагами без $60, не находит и крутится вечно.
// Разбор и репродьюсер: tools/verify/attract_probe.js, docs/memory_audit.md.
//
// ЧТО ПРОВЕРЯЕТСЯ (четыре меры, все на одном прогоне):
//   A. демо ВОШЛО (заход в LA193 из менюшного цикла, без единого нажатия);
//   B. демо ДОРИСОВАЛО экран (DrawGameScr) и КРУТИЛО игровой цикл;
//   C. демо ВЕРНУЛОСЬ в меню (LEE2C после демо) и меню отвечает на клавиши;
//   D. ломти зоны ПЕРЕЖИЛИ демо: рельеф и кадры дайвера равны источнику.
//      Мера обязательна: демо — это настоящая партия, она гоняет буферы
//      save-under по дому пула 0xA0..0xAF, где лежит источник ломтей. Если бы
//      раскладка осталась «по первому входу в игру», после демо она разложила бы
//      уже затёртый источник — то есть мусор.
//   E. после демо игра ЗАПУСКАЕТСЯ (клавиша «газ» -> START_GAME -> тики).
//
// ЭТАЛОН ЛОМТЕЙ СНИМАЕТСЯ В МОМЕНТ РАСКЛАДКИ, а не читается из памяти в конце:
// источник живёт в доме пула и после первой партии законно затирается (урок 32).
//
// НЕГАТИВЫ (обязаны краснеть):
//   ATTRACT_EMPTY=1  — ждать заведомо мало (демо не наступает) => выборка пуста;
//   ATTRACT_INJECT=1 — обнулить ломти рельефа перед самым входом в LA193, то
//                      есть вернуть ровно то состояние, из которого рождалось
//                      зависание.
//
//   node tools/verify/attract_gate.js [каталог]
"use strict";
const fs = require("fs"), path = require("path");
const { make, readSym } = require("./harness.js");
const ROOT = path.resolve(__dirname, "../..");
const B = process.env.BUILD_DIR || "build";
const DIR = process.argv[2] || `${ROOT}/${B}/ev`;
for (const f of ["scuba.rom", "scubacod1.sym", "scubacod0.sym"])
  if (!fs.existsSync(`${DIR}/${f}`)) { console.log(`нет ${DIR}/${f}`); process.exit(2); }
const S = Object.assign({}, readSym(`${DIR}/scubacod0.sym`), readSym(`${DIR}/scubacod1.sym`));
for (const n of ["LA193", "DrawGameScr", "LEE2C", "LEF12", "ZoneCopy", "ZoneDone",
                 "SCUBARELF_SRC", "SCUBADIVR_SRC", "RELIEF_HI", "DIVER_A", "DIVER_B",
                 "START_GAME", "LD9C0", "DrawMenuArt"])
  if (S[n] == null) { console.log(`нет метки ${n} в .sym — гейт не на чем строить`); process.exit(2); }

const EMPTY = process.env.ATTRACT_EMPTY === "1";
const INJECT = process.env.ATTRACT_INJECT === "1";
// Порог демо — 0x400 кадров от буста (LEEAD: `LD A,(FRAMES+1) / CP 4`), то есть
// ~20.5 с при 50 Гц. Ждём 60 с: демо обязано и начаться, и кончиться.
const FRAMES = EMPTY ? 400 : +(process.env.ATTRACT_FRAMES || 3000);

const m = make(`${DIR}/scuba.rom`, { cpu: "i8080" });
const labs = Object.entries(S).sort((a, b) => a[1] - b[1]);
const near = pc => { let x = null; for (const [n, v] of labs) { if (v <= pc) x = [n, v]; else break; }
                     return x ? `${x[0]}+${pc - x[1]}` : "?"; };

let srcRelf = null, srcDivr = null, laid = 0;
m.onPc(S.ZoneDone, () => {
  laid++;
  if (srcRelf) return;
  const n = (256 - S.RELIEF_HI) * 64;
  srcRelf = new Uint8Array(n);
  for (let i = 0; i < n; i++) srcRelf[i] = m.rd(S.SCUBARELF_SRC + i);
  srcDivr = new Uint8Array(2048);
  for (let i = 0; i < 2048; i++) srcDivr[i] = m.rd(S.SCUBADIVR_SRC + i);
});

let attract = 0, drawn = 0, demoTicks = 0, menuAfter = 0, demoOver = false;
m.onPc(S.LA193, () => {
  attract++;
  if (INJECT) {                         // ПОДСАДКА В ИЗМЕРЯЕМОЕ ОКНО, а не до него
    for (let p = S.RELIEF_HI; p <= 0xff; p++) for (let l = 192; l < 256; l++) m.wr(p * 256 + l, 0);
  }
});
m.onPc(S.DrawGameScr, () => { if (attract) drawn++; });
m.onPc(S.LEF12, () => { if (attract) demoTicks++; });
m.onPc(S.LEE2C, () => { if (drawn) { menuAfter++; demoOver = true; } });

// ФАЗА 1: НИ ОДНОГО НАЖАТИЯ. Демо включается только по простою, и любая клавиша
// откладывает его (LEEAD: `call DecodeKeyboard / OR A / ret nz`). Порог — 0x400
// кадров от буста, на стенде демо начинается около кадра 1400.
// ОДНО НАЖАТИЕ В САМОМ НАЧАЛЕ — И ОНО ОБЯЗАТЕЛЬНО. Сборка БЕЗ -DNOTITLE
// показывает титульную картинку и ждёт клавишу; не нажав её, до меню не дойти
// вовсе, и демо не наступит никогда. Гейт краснел на build/ev именно так:
// «ПУСТАЯ ВЫБОРКА: демо не наступило за 3000 кадров» — при исправном образе.
// В сборке -DNOTITLE это нажатие безвредно: титула нет, клавиша попадает в
// цикл ожидания отпускания перед меню.
let hung = false;
for (let i = 0; i < 300; i++) m.step();
m.key(13, true); m.run(6); m.key(13, false);
for (let i = 0; i < FRAMES && demoTicks < 200; i++) m.step();
if (attract && !drawn) hung = true;
// СНИМОК СЧЁТЧИКОВ РОВНО НА КОНЦЕ ФАЗЫ ПРОСТОЯ. Дальше начнётся настоящая игра,
// а она зовёт те же LA193 и DrawGameScr — если мерить в конце прогона, «входов в
// демо 2» будет означать «демо + обычный старт», то есть мера станет шире
// явления. До первого нажатия START_GAME невозможен, поэтому снимок чист.
const attract1 = attract, drawn1 = drawn, demoTicks1 = demoTicks;

// ФАЗА 2: ВЫХОД ИЗ ДЕМО. Само оно не кончается никогда — это attract-режим, его
// цикл `jp Z,LEF12` крутится, пока не нажата клавиша, и это авторское поведение,
// а не дефект. Значит «доиграло и вернулось» проверяется НАЖАТИЕМ: сначала
// MenuFromDemo (ожидание отпускания), потом ClearScreen и меню.
// Проверка эта заодно ловит целый класс: если бы в демо остались закрыты
// прерывания, KEYINT не заполнял бы KeyLine, DecodeKeyboard всегда возвращал бы
// ноль — и выйти из демо стало бы НЕЛЬЗЯ вовсе. Замер на стенде: iff=true.
let iffInDemo = null;
if (!EMPTY && drawn) {
  iffInDemo = m.cpu.iff;
  m.key(38, true);
  for (let i = 0; i < 200; i++) m.step();
  m.key(38, false);
  for (let i = 0; i < 400 && !demoOver; i++) m.step();
}

// ФАЗА 3: после демо игра обязана запускаться штатно.
let started = 0, ticks = 0;
m.onPc(S.START_GAME, () => { started++; });
m.onPc(S.LD9C0, () => { ticks++; });
if (!EMPTY && demoOver) {
  m.key(38, true);                      // «газ» = старт игры с меню
  for (let i = 0; i < 400 && !started; i++) m.step();
  m.key(38, false);
  for (let i = 0; i < 800 && ticks < 60; i++) m.step();
}

function damage() {
  let bad = 0;
  if (srcRelf) for (let i = 0; i < srcRelf.length; i++) {
    const a = (S.RELIEF_HI + (i >> 6)) * 256 + 192 + (i & 63);
    if (m.rd(a) !== srcRelf[i]) bad++;
  }
  let badD = 0;
  if (srcDivr) for (let i = 0; i < 2048; i++) {
    const sl = i >> 6, p = sl < 16 ? S.DIVER_A + sl : S.DIVER_B + (sl - 16);
    if (m.rd(p * 256 + 192 + (i & 63)) !== srcDivr[i]) badD++;
  }
  return [bad, badD];
}
const [dRelf, dDivr] = damage();

let fail = 0, checks = 0;
const chk = (ok, msg) => { checks++; if (ok) console.log("  ok      " + msg);
                           else { fail++; console.log("  ПРОВАЛ  " + msg); } };

console.log(`ДЕМО-РЕЖИМ: ${DIR}, кадров ${m.frame}` +
            (EMPTY ? "  [негатив: ждём заведомо мало]" : "") +
            (INJECT ? "  [негатив: ломти рельефа обнулены перед LA193]" : ""));
console.log(`  раскладок ZoneCopy ${laid}; за фазу простоя: входов в LA193 ${attract1}, ` +
            `отрисовок ${drawn1}, тиков демо ${demoTicks1}; возвратов в меню после демо ${menuAfter}`);
console.log(`  PC на конце ожидания: ${near(m.cpu.pc & 0xffff)}`);

// ВЫБОРКА. Демо обязано наступить само; если его не было — мерить нечего, и это
// ПРОВАЛ, а не «зелено по умолчанию» (урок №30: гейт обязан падать на пустой
// выборке).
if (attract1 === 0) {
  console.log(`  ПРОВАЛ  ПУСТАЯ ВЫБОРКА: демо не наступило за ${m.frame} кадров`);
  process.exit(1);
}
chk(laid === 1, `раскладка ломтей однократна и сделана до демо: заходов ${laid} (нужно 1)`);
chk(!hung && drawn1 === 1, `демо не зависло и нарисовало экран ровно раз: отрисовок ${drawn1} ` +
    `(при зависании 0, PC остаётся в LB1D4/LB1EE)`);
chk(demoTicks1 > 50, `демо крутило игровой цикл: тиков ${demoTicks1} (порог 50)`);
chk(iffInDemo === true, `в демо прерывания открыты (иначе из него не выйти клавишей): iff=${iffInDemo}`);
chk(menuAfter > 0, `демо вышло по клавише и вернулось в меню: заходов в LEE2C после демо ${menuAfter}`);
{
  const octLo = 255 - (23 * 8 + 4);
  const octC = m.rd(0xC000 + 19 * 256 + octLo);
  const octE = m.rd(0xE000 + 19 * 256 + octLo);
  chk(menuAfter > 0 && octC !== 0 && octE !== 0,
      `меню после демо перерисовано с украшениями: осьминог C=${octC} E=${octE}`);
}
chk(dRelf === 0, `ломти рельефа пережили демо: разошлось ${dRelf} Б из ${srcRelf ? srcRelf.length : 0}`);
chk(dDivr === 0, `кадры дайвера пережили демо: разошлось ${dDivr} Б из 2048`);
chk(started > 0 && ticks >= 60, `после демо игра запускается: стартов ${started}, тиков ${ticks}`);

console.log(fail ? `ГЕЙТ КРАСНЫЙ: провалов ${fail} из ${checks}`
                 : `ГЕЙТ ЗЕЛЁНЫЙ: все ${checks} проверки`);
process.exit(fail ? 1 : 0);
