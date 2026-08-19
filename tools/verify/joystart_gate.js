// ГЕЙТ: старт игры кнопкой ДЖОЙСТИКА и сохранность старта с клавиатуры.
//
// Джойстик Вектора-06Ц — отдельная микросхема на порту 0x0E, байт active-low:
//   b0=Right b1=Left b2=Up b3=Down, b4/b5 всегда 1 (кнопок нет), b6=Fire1, b7=Fire2.
// В vector06js этот порт собирается из матрицы клавиатуры:
//   Fire1 = ПРОБЕЛ (matrix[7] бит 0x80), Fire2 = W (matrix[6] бит 0x80).
// Для ЧИСТОЙ проверки джойстика годится только Fire2/W: строка матрицы 6 в
// DecodeKeyboard не сканируется вовсе, значит сработать может лишь путь через
// порт 0x0E. Пробел заодно и клавиша «тормоз», поэтому он проверяется отдельно.
//
//   node tools/verify/joystart_gate.js <rom> <sym> <cpu>
"use strict";
const { make, readSym } = require("./harness.js");

const rom = process.argv[2], sym = process.argv[3], cpu = process.argv[4] || "i8080";
const S = readSym(sym);
// СБОРКА БЕЗ ТИТУЛА (-DNOTITLE) идёт СРАЗУ в единый экран меню: шага «PRESS
// ENTER» у неё нет вовсе, и ждать WaitAnyKey_1 бесполезно (ловилось как «не
// дошли до титула»). Признак берётся из самого образа, а не из ключа снаружи:
// у сборки без титула поток zx0(scrn) в образ не дописывается, но надёжнее и
// проще спросить сам сценарий — экран меню LEE2C наступает в обеих.
const NOTITLE = process.env.JOYSTART_NOTITLE === "1";
const NEED = NOTITLE ? ["LEE2C", "START_GAME", "LD9C0"]
                     : ["WaitAnyKey_1", "LEE2C", "START_GAME", "LD9C0"];
for (const n of NEED) if (S[n] == null) { console.log("нет метки " + n); process.exit(2); }

const KEY = { FIRE2: 87, FIRE1: 32, ENTER: 13, UP: 38 };

// Один заход: доводит до меню способом `way`, затем жмёт клавишу `k` и смотрит,
// дойдёт ли дело до START_GAME и до первого игрового тика.
function trial(name, toMenu, startKey) {
  const m = make(rom, { cpu });
  let started = -1, ticks = 0, menu = -1, title = -1;
  m.onPc(S.WaitAnyKey_1, () => { if (title < 0) title = m.frame; });
  m.onPc(S.LEE2C, () => { if (menu < 0) menu = m.frame; });
  m.onPc(S.START_GAME, () => { if (started < 0) started = m.frame; });
  m.onPc(S.LD9C0, () => { ticks++; });

  // 1) титул: ждём WaitAnyKey_1, жмём toMenu
  if (NOTITLE) {
    for (let f = 0; f < 3000 && menu < 0; f++) m.step();
    if (menu < 0) return { name, ok: false, why: "не вышли в меню (LEE2C)" };
  } else {
    for (let f = 0; f < 3000 && title < 0; f++) m.step();
    if (title < 0) return { name, ok: false, why: "не дошли до титула (WaitAnyKey_1)" };
    m.key(toMenu, true); for (let i = 0; i < 6; i++) m.step(); m.key(toMenu, false);
    for (let f = 0; f < 600 && menu < 0; f++) m.step();
    if (menu < 0) return { name, ok: false, why: "не вышли в меню (LEE2C)" };
  }
  // 2) меню: жмём стартовую кнопку
  m.key(startKey, true);
  for (let f = 0; f < 600 && started < 0; f++) m.step();
  m.key(startKey, false);
  if (started < 0) return { name, ok: false, why: "START_GAME не достигнут", title, menu };
  for (let f = 0; f < 900 && ticks === 0; f++) m.step();
  return { name, ok: ticks > 0, why: ticks > 0 ? "" : "игра стартовала, но главный цикл не крутится",
           title, menu, started, ticks };
}

const trials = [
  ["титул ENTER -> меню FIRE2 (W, чистый джойстик: строка 6 матрицы клавиатурой не сканируется)", KEY.ENTER, KEY.FIRE2],
  ["титул FIRE2 -> меню FIRE2 (весь путь только кнопкой)", KEY.FIRE2, KEY.FIRE2],
  ["титул FIRE1 -> меню FIRE1 (пробел: он же клавиша «тормоз»)", KEY.FIRE1, KEY.FIRE1],
  ["титул ENTER -> меню UP (клавиатурный путь, не сломан ли)", KEY.ENTER, KEY.UP],
];
let fails = 0, n = 0;
for (const [name, a, b] of trials) {
  const r = trial(name, a, b);
  n++;
  if (r.ok) console.log(`  ok      ${name}\n          титул кадр ${r.title}, меню ${r.menu}, START_GAME кадр ${r.started}, тиков ${r.ticks}`);
  else { fails++; console.log(`  ПРОВАЛ  ${name}: ${r.why}`); }
}
if (n === 0) { console.log("ГЕЙТ НЕДЕЙСТВИТЕЛЕН: пустая выборка"); process.exit(2); }
console.log(fails ? `ГЕЙТ КРАСНЫЙ: ${fails} из ${n}` : `ГЕЙТ ЗЕЛЁНЫЙ: все ${n} способа старта работают`);
process.exit(fails ? 1 : 0);
