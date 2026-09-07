"use strict";
// ГЕЙТ ЦВЕТА ПАНЕЛИ. Числа HUD печатаются в 0xC000 и обязаны остаться бледно-жёлтыми.
// Красными (обе плоскости) им положено быть только там, где это задумано: подсветка
// выбранного класса и текущей жизни. Дефект 2026-09-08: подготовка партии чистила
// только поле, цифры от меню доживали до HudToPlane, тот переносил их в 0xE000, а игра
// печатала их заново в 0xC000 — все числа краснели. Ловилось лишь на живой машине.
//   node tools/verify/hudink_gate.js <rom> <sym> [порог=40]
const { make, readSym } = require("./harness.js");
const [rom, sym] = process.argv.slice(2, 4);
const LIMIT = parseInt(process.argv[4] || "40", 10);
const S = readSym(sym), m = make(rom, { cpu: "i8080" });
let menu = 0; m.onPc(S.LEE2C, () => menu++);
for (let f = 0; f < 6000 && !menu; f++) m.step();
if (!menu) { console.log("НЕ ДОШЛИ ДО МЕНЮ"); process.exit(2); }
m.key(38, true); for (let f = 0; f < 900; f++) m.step(); m.key(38, false);
for (let f = 0; f < 300; f++) m.step();
const cells = [];
for (let r = 24; r < 32; r++) for (let c = 0; c < 32; c++) { let n = 0;
  for (let q = 0; q < 8; q++) { const lo = 255 - (r * 8 + q);
    n += ((m.rd(0xC000 + c * 256 + lo) & m.rd(0xE000 + c * 256 + lo)).toString(2).match(/1/g) || []).length; }
  if (n) cells.push(`${r}:${c}=${n}`); }
const px = cells.reduce((s, x) => s + (+x.split("=")[1]), 0);
const inject = process.env.HI_INJECT === "1";
const ok = !inject && px <= LIMIT;
console.log(`  ${ok ? "ok     " : "ПРОВАЛ "} красных пикселей в панели ${inject ? 999 : px} (порог ${LIMIT}): ${cells.join(" ") || "нет"}`);
console.log(ok ? "ГЕЙТ ЗЕЛЁНЫЙ: числа HUD не покраснели" : "ГЕЙТ КРАСНЫЙ");
process.exit(ok ? 0 : 1);
