// ГЕЙТ СБОРКИ БЕЗ СТАРОГО ТИТУЛА (-DNOTITLE).
//
// Что именно проверяется:
//  1) образ действительно похудел ровно на поток zx0 титульной картинки;
//  2) ЭКРАН ЧИСТ. Это главное. Вместо распаковки 16К титула бут чистит видимые
//     плоскости C000..FFFF. Видимые — потому что PaletteGame повторяется каждые
//     4 слота, и два старших бита индекса цвета не влияют ни на что; плоскости
//     8000..C000 в игре не видны и специально не чистятся (их всё равно сразу
//     засыпает переезжающий блок кода — и в сборке с титулом тоже).
//     Проверка: память набивается мусором 0xAA ДО загрузки образа, и к моменту
//     титульного экрана в C000..FFFF не должно остаться ни одного байта 0xAA.
//     Без чистки там осталась бы 16-цветная каша от арта splash под 4-цветной
//     игровой палитрой.
//  3) меню функционально: титул -> клавиша -> меню -> клавиша -> START_GAME ->
//     главный цикл крутится.
//  4) сборка с титулом прогоняется тем же измерением как КОНТРАСТ: у неё
//     заполненность экрана обязана быть кратно выше (там лежит картинка).
//
// Негативные контроли:
//   NOTITLE_INJECT=1 — подсадить дефект: сузить чистку до 0xFF00..0xFFFF.
//                      Гейт обязан покраснеть.
//   NOTITLE_EMPTY=1  — обнулить выборку. Гейт обязан покраснеть.
//
//   node tools/verify/notitle_gate.js
"use strict";
const fs = require("fs"), path = require("path");
const { make, readSym } = require("./harness.js");
const ROOT = path.resolve(__dirname, "../..");
const B = process.env.BUILD_DIR || "build";
const INJECT = process.env.NOTITLE_INJECT === "1";
const EMPTY = process.env.NOTITLE_EMPTY === "1";

const cleanRom = `${ROOT}/${B}/prod/scuba.rom`;
const ntRom = `${ROOT}/${B}/notitle/scuba.rom`;
for (const f of [cleanRom, ntRom]) if (!fs.existsSync(f)) {
  console.log(`нет образа ${f} — собери SRC=src8080 OUT=${B}/prod и NOTITLE=1 OUT=${B}/notitle`);
  process.exit(2);
}
// Метки У КАЖДОЙ СБОРКИ СВОИ: бут без титула длиннее на 2 байта, значит весь
// cod1 съехал. Общая таблица символов дала бы промах по адресу и «не дошли до
// титула» на ровном месте.
const NEED = ["WaitAnyKey_1", "LEE2C", "START_GAME", "LD9C0"];
const SYM = {};
for (const [k, d] of [["nt", "notitle"], ["cl", "prod"]]) {
  SYM[k] = readSym(`${ROOT}/${B}/${d}/scubacod1.sym`);
  for (const n of NEED) if (SYM[k][n] == null) { console.log(`нет метки ${n} в ${d}`); process.exit(2); }
}
const S = SYM.nt;

let fail = 0, checks = 0;
const chk = (ok, msg) => { checks++; if (ok) console.log("  ok      " + msg);
                           else { fail++; console.log("  ПРОВАЛ  " + msg); } };

const FILL = 0xAA;

// --- 1. размер --------------------------------------------------------------
const scrnZx0 = fs.statSync(`${ROOT}/${B}/prod/scubascrn.zx0`).size;
const cleanSz = fs.statSync(cleanRom).size, ntSz = fs.statSync(ntRom).size;
// бут подрос на пару байт: цикл чистки длиннее вызова распаковки
const boot = fs.statSync(`${ROOT}/${B}/notitle/scubacod0.bin`).size
           - fs.statSync(`${ROOT}/${B}/prod/scubacod0.bin`).size;
chk(ntSz < cleanSz && cleanSz - ntSz >= scrnZx0 - 16,
    `образ без титула ${ntSz} Б против ${cleanSz} Б: минус ${cleanSz - ntSz} Б ` +
    `(поток титула zx0 ${scrnZx0} Б, бут ${boot >= 0 ? "+" : ""}${boot} Б)`);

// --- измерение экрана на титульном шаге --------------------------------------
// Считаем в видимых плоскостях C000..FFFF: сколько байт осталось мусором 0xAA и
// сколько байт вообще не нули (то есть занято картинкой или текстом).
function screenAt(rom, inject, sym) {
  const img = new Uint8Array(fs.readFileSync(rom));
  if (inject) {
    // сузить чистку: ld hl,0C000h -> ld hl,0FF00h
    const pat = [0x21, 0x00, 0xC0, 0x36, 0x00, 0x23, 0x7C, 0xB5, 0xC2];
    let at = -1;
    outer: for (let i = 0; i + pat.length <= img.length; i++) {
      for (let k = 0; k < pat.length; k++) if (img[i + k] !== pat[k]) continue outer;
      at = i; break;
    }
    if (at < 0) throw new Error("подсадка невозможна: цикл чистки в образе не найден");
    img[at + 1] = 0x00; img[at + 2] = 0xFF;
    rom = `${ROOT}/${B}/notitle/_inject.rom`;
    fs.writeFileSync(rom, Buffer.from(img));
  }
  const m = make(rom, { cpu: "i8080", ramFill: FILL });
  let hit = -1;
  m.onPc(sym.WaitAnyKey_1, () => { if (hit < 0) hit = m.frame; });
  for (let f = 0; f < 3000 && hit < 0; f++) m.step();
  if (hit < 0) return null;
  let junk = 0, nz = 0;
  for (let a = 0xC000; a <= 0xFFFF; a++) { const v = m.rd(a); if (v === FILL) junk++; if (v) nz++; }
  return { junk, nz, frame: hit };
}

const nt = screenAt(ntRom, INJECT, SYM.nt);
const cl = screenAt(cleanRom, false, SYM.cl);
const samples = EMPTY ? [] : [nt, cl].filter(Boolean);
if (samples.length < 2) {
  console.log(`  ПРОВАЛ  ПУСТАЯ ВЫБОРКА: снято ${samples.length} измерений экрана из 2`);
  console.log("ГЕЙТ НЕДЕЙСТВИТЕЛЕН");
  process.exit(2);
}
chk(nt.junk === 0,
    `без титула: мусора 0xAA в видимых плоскостях C000..FFFF осталось ${nt.junk} Б из 16384`);
chk(nt.nz > 0 && nt.nz < 2000,
    `без титула: занято ${nt.nz} Б из 16384 — только текст титульных строк`);
chk(cl.nz > nt.nz * 4,
    `контраст: со старым титулом занято ${cl.nz} Б против ${nt.nz} Б без него ` +
    `(картинка на месте, измерение различает)`);

// --- меню функционально ------------------------------------------------------
const KEY = { ENTER: 13, FIRE2: 87, UP: 38 };
function menuWorks(rom, toMenu, startKey) {
  const m = make(rom, { cpu: "i8080", ramFill: FILL });
  let title = -1, menu = -1, started = -1, ticks = 0;
  m.onPc(S.WaitAnyKey_1, () => { if (title < 0) title = m.frame; });
  m.onPc(S.LEE2C, () => { if (menu < 0) menu = m.frame; });
  m.onPc(S.START_GAME, () => { if (started < 0) started = m.frame; });
  m.onPc(S.LD9C0, () => { ticks++; });
  for (let f = 0; f < 3000 && title < 0; f++) m.step();
  if (title < 0) return { ok: false, why: "не дошли до титула (WaitAnyKey_1)" };
  m.key(toMenu, true); for (let i = 0; i < 6; i++) m.step(); m.key(toMenu, false);
  for (let f = 0; f < 600 && menu < 0; f++) m.step();
  if (menu < 0) return { ok: false, why: "не вышли в меню (LEE2C)" };
  m.key(startKey, true);
  for (let f = 0; f < 600 && started < 0; f++) m.step();
  m.key(startKey, false);
  if (started < 0) return { ok: false, why: "START_GAME не достигнут" };
  for (let f = 0; f < 900 && ticks === 0; f++) m.step();
  return { ok: ticks > 0, why: ticks > 0 ? "" : "старт есть, главный цикл не крутится",
           title, menu, started, ticks };
}
for (const [nm, a, b] of [["ENTER -> FIRE2", KEY.ENTER, KEY.FIRE2],
                          ["FIRE2 -> UP", KEY.FIRE2, KEY.UP]]) {
  const r = menuWorks(ntRom, a, b);
  chk(r.ok, `без титула, меню функционально (${nm}): ` +
      (r.ok ? `титул кадр ${r.title}, меню ${r.menu}, START_GAME ${r.started}, тиков ${r.ticks}` : r.why));
}

if (checks === 0) { console.log("ГЕЙТ НЕДЕЙСТВИТЕЛЕН: пустая выборка"); process.exit(2); }
console.log(fail ? `ГЕЙТ КРАСНЫЙ: ${fail} из ${checks}` : `ГЕЙТ ЗЕЛЁНЫЙ: все ${checks} проверки`);
process.exit(fail ? 1 : 0);
