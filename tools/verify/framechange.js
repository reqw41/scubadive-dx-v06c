"use strict";
// СМЕНА КАДРА АНИМАЦИИ, А НЕ ПЕРЕРИСОВКА. anim_rate считает СБОРКИ кадра (LB3E9),
// то есть перерисовки, а они идут каждый тик независимо от того, изменилась ли
// картинка. Игрок же видит СМЕНУ кадра — она происходит, когда указатель
// (+0B/0C) стал другим. Считаем именно смены в секунду на существо.
const { reachGame, KEY } = require("./drive.js");
const [rom, sym] = process.argv.slice(2, 4);
const LVL = parseInt(process.argv[4] || "4", 10), NF = parseInt(process.argv[5] || "3000", 10);
const g = reachGame(rom, sym, { cpu: "i8080", level: LVL, seed: 0x0167 });
const m = g.m, S = g.S, w = a => m.rd(a) | (m.rd(a + 1) << 8);
const n1 = m.rd(S.NumRecsI), base = S.LC4F0, sz = 21;
let prev = new Array(n1).fill(-1), chg = 0, moved = 0, prevPos = new Array(n1).fill(-1), frames = 0, redraw = 0;
m.onPc(S.LB3E9, () => { redraw++; });
for (let f = 0; f < NF; f++) { const ph = f % 400;
  m.key(KEY.UP, ph < 250); m.key(KEY.RIGHT, ph >= 120 && ph < 170); m.step(); frames++;
  for (let i = 0; i < n1; i++) { const r = base + i * sz, p = w(r + 11), pos = (m.rd(r) << 8) | m.rd(r + 1);
    if (prev[i] >= 0 && p !== prev[i]) chg++;
    if (prevPos[i] >= 0 && pos !== prevPos[i]) moved++;
    prev[i] = p; prevPos[i] = pos; } }
const sec = frames / 50;
console.log(`уровень ${LVL}, ${frames} кадров (${sec.toFixed(1)} с), существ группы I ${n1}:`);
console.log(`  смен кадра анимации ${(chg / sec / n1).toFixed(2)} в секунду на существо`);
console.log(`  сдвигов позиции     ${(moved / sec / n1).toFixed(2)} в секунду на существо`);
console.log(`  сборок кадра (перерисовок) всего ${(redraw / sec).toFixed(0)} в секунду`);
