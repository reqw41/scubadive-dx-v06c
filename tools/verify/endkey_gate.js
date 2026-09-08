"use strict";
// ГЕЙТ КЛАВИШИ E: после нажатия счётчики уровня стоят в зачётных значениях
// (ракушек осталось 8, сундуков опустошено 3) — именно их игра сверяет при
// причаливании к лодке. Плюс признак на экране: красная буква E в панели.
//   node tools/verify/endkey_gate.js <rom> <sym>
const { reachGame, KEY } = require("./drive.js");
const [rom, sym] = process.argv.slice(2, 4);
const g = reachGame(rom, sym, { cpu: "i8080", level: 1, seed: 0x0167 });
const m = g.m, S = g.S;
const mark = () => { let n = 0; for (let q = 0; q < 8; q++) { const lo = 255 - (30 * 8 + q);
  n += ((m.rd(0xC000 + 27 * 256 + lo) & m.rd(0xE000 + 27 * 256 + lo)).toString(2).match(/1/g) || []).length; } return n; };
m.key(KEY.UP, true); for (let i = 0; i < 400; i++) m.step(); m.key(KEY.UP, false);
for (let i = 0; i < 100; i++) m.step();
const before = [m.rd(S.L5B00), m.rd(S.L5B0F), mark()];
m.key(69, true); for (let i = 0; i < 8; i++) m.step(); m.key(69, false);
for (let i = 0; i < 10; i++) m.step();
const after = [m.rd(S.L5B00), m.rd(S.L5B0F), mark()];
// чит обязан ДЕРЖАТЬ значения: сбиваем счётчики, как это делает подбор предмета
m.wr(S.L5B00, 42); m.wr(S.L5B0F, 0);
for (let i = 0; i < 40; i++) m.step();
const held = [m.rd(S.L5B00), m.rd(S.L5B0F)];
const ok1 = !(before[0] === 8 && before[1] === 3);
const ok2 = after[0] === 8 && after[1] === 3 && after[2] > 0;
const ok3 = held[0] === 8 && held[1] === 3;
console.log(`  ${ok1 ? "ok     " : "ПРОВАЛ "} до нажатия условие не выполнено (ракушек ${before[0]}, сундуков ${before[1]})`);
console.log(`  ${ok2 ? "ok     " : "ПРОВАЛ "} после E: ракушек ${after[0]}, сундуков ${after[1]}, признак ${after[2]} пикселей`);
const inject = process.env.EK_INJECT === "1";
console.log(`  ${ok3 ? "ok     " : "ПРОВАЛ "} значения держатся после подбора (ракушек ${held[0]}, сундуков ${held[1]})`);
const ok = ok1 && ok2 && ok3 && !inject;
console.log(ok ? "ГЕЙТ ЗЕЛЁНЫЙ: клавиша E засчитывает сбор" : "ГЕЙТ КРАСНЫЙ");
process.exit(ok ? 0 : 1);
