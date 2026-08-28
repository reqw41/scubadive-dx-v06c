// Потиковая сверка игровых переменных ДВУХ наших i8080-образов (как lockstep,
// но без Z80-эталона): первый расходящийся тик и переменные.
//   node tools/verify/state_cmp.js <romA> <symA> <romB> <symB> [ticks=300] [level=1]
"use strict";
const { reachGame, KEY } = require("./drive.js");
const [ra, sa, rb, sb] = process.argv.slice(2, 6);
const NT = parseInt(process.argv[6] || "300", 10), LVL = parseInt(process.argv[7] || "1", 10);
function run(rom, sym) {
  const g = reachGame(rom, sym, { cpu: "i8080", level: LVL, seed: 0x0167 });
  const rows = []; g.m.onPc(g.S.LD9C0, () => { rows.push(g.read()); });
  g.m.key(KEY.UP, true); let guard = 0; while (rows.length < NT && guard < 400000) { g.m.step(); guard++; }
  return rows;
}
const A = run(ra, sa), B = run(rb, sb);
// Сдвиг нумерации тиков: стенд запускает игру по КАДРАМ, и у образов разной
// скорости первый снимок может прийтись на соседний тик. Ищем сдвиг -2..2.
for (const off of [0, 1, -1, 2, -2, 3, -3, 4, -4]) {
  let n = 0, first = null;
  for (let t = Math.max(0, -off); t + off < B.length && t < A.length; t++) {
    const d = Object.keys(A[t]).filter(k => A[t][k] !== B[t + off][k]);
    if (d.length) { first = `тик A${t}/B${t + off}: ` + d.map(k => `${k} ${A[t][k]}/${B[t + off][k]}`).join("  "); break; }
    n++;
  }
  console.log(`сдвиг ${off}: совпало ${n} тиков` + (first ? `; первое расхождение ${first}` : ""));
  if (!first) process.exit(0);
}
process.exit(1);
