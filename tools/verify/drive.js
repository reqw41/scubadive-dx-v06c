// Вождение игры: доводит любую сборку (Z80-эталон или наш i8080) до одного и
// того же ИГРОВОГО состояния и даёт покадрово/потиково снимать переменные.
//
// Синхронизация НЕ по кадрам: сборки идут с разной скоростью, «кадр N» у них —
// разные моменты игры. Опорные точки — попадания PC в метки (WaitAnyKey_1,
// START_GAME, LD9C0 = итерация главного цикла).
//
// RANDOM: Start делает `LD HL,(FRAMES) / LD (RANDOM),HL` — сид = счётчик кадров
// на момент выхода в меню, а он у сборок РАЗНЫЙ (распаковка ZX0 идёт разное
// число кадров). Для lockstep сид принудительно ставится в момент входа в
// START_GAME (до CALL Game, значит до постройки лабиринта и до всех бросков).
"use strict";
const { make, readSym } = require("./harness.js");

const KEY = { ENTER: 13, TAB: 9, SPACE: 32, LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40,
              D1: 49, D2: 50, D3: 51, D4: 52 };

// Наблюдаемое состояние игры: то, что сверяет lockstep.
// Адреса берутся из .sym сборки — карта памяти у обеих сборок одна (рекомпиляция
// сохраняет метки), так что сверка идёт адрес-в-адрес по ИМЕНАМ меток.
const VARS = [
  ["RANDOM",  "RANDOM",  2],
  ["SCORE",   "SCORE",   2],
  ["HISCORE", "HISCORE", 2],
  ["HELD",    "HELD",    2],
  ["OXYGEN",  "OXYGEN",  2],
  ["LIVES",   "LIVES",   1],
  ["LEVEL",   "LEVEL",   1],
  ["mapPos",  "L5B03",   2],   // положение экрана на мини-карте
  ["worldPos","L5B0B",   2],   // положение на карте 256x256
  ["nRecI",   "NumRecsI",1],
  ["nRecII",  "NumRecsII",1],
  ["nRecIII", "NumRecsIII",1],
  ["nRecIV",  "NumRecsIV",1],
  ["nRecV",   "NumRecsV", 1],
  // ныряльщик — запись DiverObj, поля из комментариев scubacodc.asm
  ["dCol",    "LE33B",   1],   // +$00 колонка 0..255
  ["dRow",    "LE33C",   1],   // +$01 строка 0..255
  ["dDX",     "LE33F",   1],   // +$04
  ["dDY",     "LE340",   1],   // +$05
  ["dAngle",  "LE341",   1],   // +$06 угол 0..15
  ["dFlags0D","LE348",   1],   // +$0D
  ["dSpeed",  "LE349",   1],   // +$0E
  ["dSpdCnt", "LE34A",   1],   // +$0F
  ["dFlags10","LE34B",   1],   // +$10
  ["dX",      "LE34E",   1],   // +$13
  ["dY",      "LE34F",   1],   // +$14 (метки нет — берём LE34E+1)
];

function stateReader(m, S) {
  const addr = {};
  for (const [name, lbl, sz] of VARS) {
    let a = S[lbl];
    if (a == null && lbl === "LE34F") a = S["LE34E"] + 1;
    if (a == null) throw new Error("нет метки " + lbl + " в .sym — сверять нечего");
    addr[name] = [a, sz];
  }
  return () => {
    const o = {};
    for (const k in addr) { const [a, sz] = addr[k]; o[k] = sz === 2 ? m.rdw(a) : m.rd(a); }
    return o;
  };
}

// Доводит сборку до первого игрового тика.
// opts.level = 1..4 (по умолчанию 1), opts.seed = фиксированный сид RANDOM.
function reachGame(romPath, symPath, opts) {
  opts = opts || {};
  const S = readSym(symPath);
  const m = make(romPath, { cpu: opts.cpu || "i8080" });

  let ticks = 0, started = false, bootFrame = 0, startFrame = 0;
  m.onPc(S.LD9C0, () => { ticks++; });
  m.onPc(S.START_GAME, () => { started = true; startFrame = m.frame; });

  bootFrame = m.runUntilPc(S.WaitAnyKey_1, 3000);   // распаковка + титры
  m.key(KEY.ENTER, true); m.run(4); m.key(KEY.ENTER, false);
  m.runUntilPc(S.LEE2C, 600);                        // главное меню

  const lvl = opts.level || 1;
  if (lvl !== 1) { m.key(KEY.D1 + lvl - 1, true); m.run(4); m.key(KEY.D1 + lvl - 1, false); m.run(4); }

  // фиксация сида: ставим сразу после входа в START_GAME
  const seed = opts.seed == null ? 0x0167 : opts.seed;
  m.onPc(S.START_GAME, () => { m.wr(S.RANDOM, seed & 0xff); m.wr(S.RANDOM + 1, (seed >> 8) & 0xff); });

  m.key(KEY.UP, true);
  for (let i = 0; i < 400 && !started; i++) m.step();
  m.key(KEY.UP, false);
  if (!started) throw new Error("игра не стартовала: START_GAME не достигнут");
  for (let i = 0; i < 600 && ticks === 0; i++) m.step();
  if (ticks === 0) throw new Error("игра стартовала, но главный цикл LD9C0 не крутится");

  return { m, S, read: stateReader(m, S), get ticks() { return ticks; },
           bootFrame, startFrame, KEY };
}

module.exports = { KEY, VARS, reachGame, stateReader };
