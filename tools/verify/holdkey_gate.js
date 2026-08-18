// ГЕЙТ УДЕРЖАНИЯ КНОПКИ СКВОЗЬ ПЕРЕХОДЫ.
//
// Владелец на железе поймал утечку нажатия: кнопка, которой выходят из заставки,
// ещё удерживается, когда меню начинает читать ввод, — «газ» срабатывает мгновенно,
// экран выбора мелькает один кадр и игра стартует сама. Замер до фикса: меню на
// кадре 194 и START_GAME на кадре 194 же, ноль кадров на выбор.
//
// Все прежние гейты жали клавишу И ОТПУСКАЛИ, поэтому этот путь не исполнялся
// ни разу. Теперь стенд умеет держать — и обязан держать в наборе.
//
// Проверяется контракт: пока кнопка УДЕРЖИВАЕТСЯ, игра стартовать НЕ должна;
// после отпускания — обязана.
//
//   HOLD_ROM=<путь>  проверить другой образ (для негативного контроля)
//   HOLD_EMPTY=1     обнулить выборку, гейт обязан покраснеть
"use strict";
const path = require("path");
const { make, readSym } = require("./harness.js");
const ROOT = path.resolve(__dirname, "../..");
const B = process.env.BUILD_DIR || "build";
const rom = process.env.HOLD_ROM || `${ROOT}/${B}/prod/scuba.rom`;
const sym = rom.replace(/scuba\.rom$/, "scubacod1.sym");
const S = readSym(sym);
for (const n of ["LEE2C", "START_GAME", "LD9C0"])
  if (S[n] == null) { console.log("нет метки " + n); process.exit(2); }

let fail = 0, checks = 0;
const chk = (ok, msg) => { checks++; if (ok) console.log("  ok      " + msg);
                           else { fail++; console.log("  ПРОВАЛ  " + msg); } };

const KEYS = [["клавиша «газ» (UP)", 38], ["джойстик FIRE2 (W)", 87]];
if (process.env.HOLD_EMPTY === "1") {
  console.log("  ПРОВАЛ  ПУСТАЯ ВЫБОРКА: ни одного способа удержания не проверено");
  console.log("ГЕЙТ НЕДЕЙСТВИТЕЛЕН"); process.exit(2);
}

for (const [name, key] of KEYS) {
  const m = make(rom, { cpu: "i8080", ramFill: 0xAA });
  let f = 0, menu = -1, startHeld = -1, startFree = -1, ticks = 0;
  m.onPc(S.LEE2C, () => { if (menu < 0) menu = f; });
  m.onPc(S.START_GAME, () => { if (startHeld < 0 && held) startHeld = f;
                               if (startFree < 0 && !held) startFree = f; });
  m.onPc(S.LD9C0, () => { ticks++; });
  let held = false;
  // жмём рано и ДЕРЖИМ: проходим заставку/титул и упираемся в меню
  for (; f < 420; f++) { if (f === 100 && !held) { m.key(key, true); held = true; } m.step(); }
  const menuSeen = menu >= 0, startedWhileHeld = startHeld >= 0;
  // ОТПУСКАЕМ. Дальше игра стартовать НЕ должна сама — нечем: кнопок не нажато.
  // Ровно на этом первая версия гейта и требовала невозможного.
  m.key(key, false); held = false;
  for (; f < 560; f++) m.step();
  const menuAfterRelease = menu >= 0;
  const startedIdle = ticks > 0;
  // ТРЕТИЙ ШАГ: новое нажатие обязано запустить игру.
  m.key(key, true);
  for (; f < 760 && ticks === 0; f++) m.step();
  m.key(key, false);

  chk(!startedWhileHeld,
      `${name}: пока кнопка удерживается с прошлого экрана, игра НЕ стартует` +
      (startedWhileHeld ? ` — УТЕЧКА НАЖАТИЯ, START_GAME на кадре ${startHeld}` : ""));
  chk(menuAfterRelease, `${name}: после отпускания показан экран выбора (кадр ${menu < 0 ? "НЕТ" : menu})`);
  chk(!startedIdle, `${name}: без нажатий игра сама не стартует`);
  chk(ticks > 0, `${name}: НОВОЕ нажатие запускает игру (тиков ${ticks})`);
}

console.log(fail ? `ГЕЙТ КРАСНЫЙ: ${fail} из ${checks}` : `ГЕЙТ ЗЕЛЁНЫЙ: все ${checks} проверки`);
process.exit(fail ? 1 : 0);
