// Снятие ЭТАЛОНА палитровой последовательности штатной заставки.
// Запускать ТОЛЬКО осознанно, когда штатный стартер намеренно меняется и новая
// последовательность проверена НА ЖЕЛЕЗЕ. Эталон снят со стартера, байт в байт
// равного коммиту f79785f — последнему, доказанно работающему на MiSTer.
//   node tools/verify/ref/gen_splash_ref.js <splash.rom> <out.json>
"use strict";
const fs = require("fs");
const { make } = require("../harness.js");
const m = make(process.argv[2], { cpu: "i8080" });
const seq = [];
const io = m.io, oo = io.output.bind(io);
io.output = (p, v) => { p &= 0xff; v &= 0xff;
  if (p === 0x0C || p === 0x02) seq.push([p, v]);
  return oo(p, v); };
for (let f = 0; f < 8; f++) m.step();
fs.writeFileSync(process.argv[3], JSON.stringify({
  note: "порядок и содержимое записей в порты 2 (кайма/индекс слота) и 0x0C (палитра) за первые 8 кадров штатной заставки; эталон = стартер коммита f79785f",
  seq }, null, 1));
console.log(`записей ${seq.length}, из них в 0x0C: ${seq.filter(x => x[0] === 0x0C).length}`);
