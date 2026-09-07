"use strict";
// СКОЛЬКО СЕКУНД ДЫШИТ ДАЙВЕР. Кислород убывает на (LEVEL*8+10) ЗА ТИК (LE364),
// то есть в секундах запас воздуха обратно пропорционален темпу главного цикла —
// параметр игрового процесса, который TIMEBASE не выравнивает. Меряем скорость
// убыли, пока стоит бит 7 (дайвер в воде), и переводим в секунды полного баллона.
//   [CPU=z80] node tools/verify/air_parity.js <rom> <sym> [level=1]
const { reachGame, KEY } = require("./drive.js");
const [rom, sym] = process.argv.slice(2, 4);
const LVL = parseInt(process.argv[4] || "1", 10);
const g = reachGame(rom, sym, { cpu: process.env.CPU || "i8080", level: LVL, seed: 0x0167 });
const m = g.m, S = g.S, D = S.DiverObj;
let ticks = 0; m.onPc(S.LD9C0, () => ticks++);
// АВТОПИЛОТ ПОГРУЖЕНИЯ (как SD_DIVE в zx/tempo_game.lua): держим тягу, и если строка
// мини-карты за 60 кадров не выросла — доворачиваем.
// ⚠️ ОКНО ОБРЫВАЕТСЯ ПО ГИБЕЛИ. Без этого замер продолжался в агонии, меню и демо,
// где главного цикла LD9C0 нет: выходило «24 тика/с» на ровном месте (2026-09-07).
let explo = 0; m.onPc(S.DiverExplosion, () => explo++);
let row0 = m.rd(S.L5B03 + 1), chk = 0, rot = -1;
let f = 0, inw = 0, drop = 0, prev = 0, t0 = 0, fr0 = 0, started = false, n = 0;
for (; f < 2400 && !explo; f++) {
  const row = m.rd(S.L5B03 + 1);
  m.key(KEY.UP, true); m.key(KEY.RIGHT, rot >= 0 && f < rot);
  m.step();
  if (f - chk >= 60) { if (row <= row0) rot = f + 25; row0 = row; chk = f; }
  if (!started && f > 200) { started = true; prev = m.rdw(S.OXYGEN); t0 = ticks; fr0 = m.frame; continue; }
  if (!started) continue;
  const o = m.rdw(S.OXYGEN), w = (m.rd(D + 0x10) >> 7) & 1; n++;
  if (w) { inw++; if (o < prev && prev - o < 4000) drop += prev - o; }
  prev = o;
}
const s = (m.frame - fr0) / 50, rate = drop / s, per = LVL * 8 + 10;
console.log(`уровень ${LVL}: окно ${s.toFixed(1)} с${explo ? " (оборвано гибелью)" : ""}, под водой ${(100 * inw / n).toFixed(0)} %; расход ${rate.toFixed(0)} ед/с (${per} за срабатывание) -> баллон 61439 ед = ${(61439 / rate).toFixed(0)} с; тиков/с ${((ticks - t0) / s).toFixed(1)}`);
