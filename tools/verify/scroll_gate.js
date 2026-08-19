// ГЕЙТ СКРОЛЛА (-DGEOM): поле прижато, зона уехала вниз, ввод жив.
//
// Что проверяется и ПОЧЕМУ именно так. Развёртка читает скролл из io.PA РОВНО в
// момент начала картинки (tv.js: fb_row = IO.ScrollStart() при raster_line==40).
// Значит проверять надо не «что записали», а «что видит луч в свой такт» — иначе
// проверка не заметит, что скан клавиатуры оставил в порту 3 маску строки
// матрицы. Порт 3 делит функцию: строки 171/175/179 KEYINT пишут туда маски
// скана, и только после возврата ППА в 0x88 восстанавливается скролл (урок
// коммита 9b51fa6).
//
//   SCROLL_INJECT=1 — убрать восстановление скролла после скана (out (3) -> nop).
//                     Гейт обязан покраснеть: луч увидит маску скана.
//   SCROLL_EMPTY=1  — обнулить выборку. Гейт обязан покраснеть.
"use strict";
const fs = require("fs"), path = require("path");
const { readSym } = require("./harness.js");
const { reachGame, KEY } = require("./drive.js");
const ROOT = path.resolve(__dirname, "../..");
const B = process.env.BUILD_DIR || "build";
const INJECT = process.env.SCROLL_INJECT === "1", EMPTY = process.env.SCROLL_EMPTY === "1";
const rom = `${ROOT}/${B}/geomonly/scuba.rom`, sym = `${ROOT}/${B}/geomonly/scubacod1.sym`;
for (const f of [rom, sym]) if (!fs.existsSync(f)) {
  console.log(`нет файла ${f} — собери DET=1 GEOM=1 OUT=${B}/geomonly`); process.exit(2); }
const S = readSym(sym);
let fail = 0, checks = 0;
const chk = (ok, msg) => { checks++; if (ok) console.log("  ok      " + msg);
                           else { fail++; console.log("  ПРОВАЛ  " + msg); } };
const GAME = 0xBF, MENU = 0xFF;

// Снимаем io.PA В МОМЕНТ, когда его читает развёртка, а не когда удобно нам.
function watchScroll(m) {
  const seen = new Set();
  const orig = m.io.ScrollStart.bind(m.io);
  m.io.ScrollStart = () => { const v = orig(); if (!EMPTY) seen.add(v & 0xff); return v; };
  return seen;
}
// --- 1. МЕНЮ: дефолтная развёртка -----------------------------------------
{
  const { make } = require("./harness.js");
  const m = make(rom, { cpu: "i8080" });
  const seen = watchScroll(m);
  m.runUntilPc(S.WaitAnyKey_1, 3000);
  m.key(KEY.ENTER, true); m.run(4); m.key(KEY.ENTER, false);
  m.runUntilPc(S.LEE2C, 600);
  seen.clear(); m.run(20);
  chk(seen.size === 1 && seen.has(MENU),
      `меню: луч видит скролл 0x${[...seen].map(v=>v.toString(16)).join(",")} (ждём только 0x${MENU.toString(16)})`);
}
// --- 2. ГЕЙМПЛЕЙ: поле прижато, ввод жив -----------------------------------
{
  let seen = null;
  const g = reachGame(rom, sym, { cpu: "i8080", level: 1, seed: 0x0167,
    preHook: (m, SS) => { seen = watchScroll(m);
      if (INJECT) m.onPc(SS.START_GAME, () => {
        // Ищем `ld a,(ScrollVal) / out (3),a` по ВСЕМУ блоку кода0. Метки KEYINT
        // в scubacod1.sym НЕТ (она из кода0), и первая версия подсадки бежала
        // циклом от undefined — то есть не делала НИЧЕГО и молча зеленела.
        // Это ровно урок «фильтр по несуществующей метке — тихо пустой фильтр»,
        // поэтому здесь стоит проверка находки, а не надежда на неё.
        if (SS.ScrollVal == null) { console.log("  ПРОВАЛ  нет метки ScrollVal"); process.exit(1); }
        let hit = false;
        for (let a = 0x100; a < 0x400; a++)
          if (m.rd(a) === 0x3a && m.rd(a+1) === (SS.ScrollVal & 0xff) &&
              m.rd(a+2) === (SS.ScrollVal >> 8) && m.rd(a+3) === 0xd3 && m.rd(a+4) === 3) {
            m.wr(a+3, 0); m.wr(a+4, 0); hit = true; break; }   // out (3),a -> nop nop
        if (!hit) { console.log("  ПРОВАЛ  подсадка не нашла восстановление скролла"); process.exit(1); }
      }); } });
  let t = 0; g.m.onPc(S.LD9C0, () => { t++; });
  let guard = 0; while (t < 200 && guard < 200000) { g.m.step(); guard++; }
  seen.clear(); guard = 0; const t0 = t;
  while (t < t0 + 100 && guard < 200000) { g.m.step(); guard++; }
  chk(seen.size === 1 && seen.has(GAME),
      `геймплей: луч видит скролл 0x${[...seen].map(v=>v.toString(16)).join(",")} (ждём только 0x${GAME.toString(16)})`);
  // ввод жив: держим клавишу и смотрим, что игра её видит
  let pressed = 0;
  g.m.key(KEY.UP, true);
  for (let i = 0; i < 40; i++) g.m.step();
  g.m.onPc(S.DecodeKeyboard, () => {});
  const k0 = g.m.rd(S.KeyLine0), k2 = g.m.rd(S.KeyLine2), k7 = g.m.rd(S.KeyLine7);
  g.m.key(KEY.UP, false);
  for (let i = 0; i < 40; i++) g.m.step();
  const u0 = g.m.rd(S.KeyLine0), u2 = g.m.rd(S.KeyLine2), u7 = g.m.rd(S.KeyLine7);
  const diff = (k0 !== u0) || (k2 !== u2) || (k7 !== u7);
  chk(diff, `ввод жив: строки клавиатуры при нажатии ${[k0,k2,k7].map(v=>v.toString(16)).join(",")} ` +
            `и без него ${[u0,u2,u7].map(v=>v.toString(16)).join(",")} — различаются`);
}
console.log(fail ? `ГЕЙТ КРАСНЫЙ: ${fail} из ${checks}` : `ГЕЙТ ЗЕЛЁНЫЙ: все ${checks} проверки`);
process.exit(fail ? 1 : 0);
