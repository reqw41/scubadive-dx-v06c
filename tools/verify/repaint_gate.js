"use strict";
// ЧИСТИТ ЛИ ИГРА ЭКРАН ПРИ СТАРТЕ. Владелец играл в ленточную версию: перед
// запуском в видеопамяти лежит чужое — карта прогресса ПЗУ и картинка заставки.
// Если игра при входе закрашивает не весь экран, чужие пиксели останутся висеть
// и будут выглядеть ровно как мусор на пустом месте.
// Проверка в лоб: забиваем всю видимую видеопамять узором 0xAA в момент старта
// партии и смотрим, какие знакоместа НИКТО так и не перерисовал.
const { reachGame, KEY } = require("./drive.js");
const [rom, sym] = process.argv.slice(2, 4);
const LVL = parseInt(process.argv[4] || "1", 10), NT = parseInt(process.argv[5] || "300", 10);
// УЗОР ЗАВИСИТ ОТ АДРЕСА. Ранняя версия сажала везде 0xAA и врала: небо с
// градиентом само пишет 0xAA/0x55 по строкам из SKY_TAB, и залитая заново полоса
// неба выглядела «нетронутой». Байт, посчитанный из адреса, игра воспроизвести
// не может.
const pat = (a) => { let x = (a * 2654435761) >>> 0; x ^= x >>> 13; return (x ^ (x >>> 7)) & 0xFF; };
let filled = false;
const g = reachGame(rom, sym, { cpu: process.env.CPU || "i8080", level: LVL, seed: 0x0167, preHook: (m, S) => {
  m.onPc(S.START_GAME, () => { if (filled) return; filled = true;
    for (let c = 0; c < 32; c++) for (let lo = 0; lo < 256; lo++) {
      m.wr(0xC000 + c * 256 + lo, pat(0xC000 + c * 256 + lo)); m.wr(0xE000 + c * 256 + lo, pat(0xE000 + c * 256 + lo)); } }); } });
const m = g.m, S = g.S;
let ticks = 0; m.onPc(S.LD9C0, () => { ticks++; });
// САМОПРОВЕРКА: REPAINT_LATE=1 подсаживает узор ЗАНОВО, когда партия уже идёт, и
// даёт всего пару кадров. Перерисовки экрана в них не случается, узор обязан
// уцелеть почти весь — сторож должен покраснеть. Без такой проверки зелёный
// результат ничего не значит: он же зелёный и когда узор вообще не лёг.
if (process.env.REPAINT_LATE) {
  for (let c = 0; c < 32; c++) for (let lo = 0; lo < 256; lo++) {
    m.wr(0xC000 + c * 256 + lo, pat(0xC000 + c * 256 + lo)); m.wr(0xE000 + c * 256 + lo, pat(0xE000 + c * 256 + lo)); }
  m.step(); m.step();
} else
  for (let f = 0; f < 4000 && ticks < NT; f++) { m.key(KEY.UP, f % 400 < 250); m.step(); }
// где узор уцелел
const left = [];
for (let r = 0; r < 32; r++) for (let c = 0; c < 32; c++) {
  let n = 0; for (let i = 0; i < 8; i++) { const lo = (255 - (r * 8 + i)) & 0xff;
    if (m.rd(0xC000 + c * 256 + lo) === pat(0xC000 + c * 256 + lo)) n++;
    if (m.rd(0xE000 + c * 256 + lo) === pat(0xE000 + c * 256 + lo)) n++; }
  if (n < 4) continue;
  left.push({ r, c, n }); }
console.log(`${left.length ? "КРАСНЫЙ" : "зелёный"}: узор подсажен ${filled}; тиков ${ticks}; знакомест с уцелевшим узором ${left.length} из 1024`);
const rows = {}; for (const x of left) rows[x.r] = (rows[x.r] || 0) + 1;
console.log("по строкам:", Object.entries(rows).map(([r, n]) => `${r}:${n}`).join(" "));
process.exit(left.length ? 1 : 0);
