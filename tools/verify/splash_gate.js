// ГЕЙТ SPLASH-ROM. Три требования:
//  1) образ игры внутри splash БАЙТ В БАЙТ равен боевому (кроме трёх первых
//     байт — там jp на стартер, и стартер возвращает их на место сам);
//  2) частоты трёх голосов, реально выданные в ВИ53, совпадают со score (1%),
//     делитель 0 в режиме 3 не выдаётся никогда;
//  3) плоскости заставки в видеопамяти совпадают с эталоном упаковщика.
//   node tools/verify/splash_gate.js
"use strict";
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const { make } = require("./harness.js");
const ROOT = path.resolve(__dirname, "../..");
const B = process.env.BUILD_DIR || "build";
const splashP = `${ROOT}/${B}/prod/scuba_splash.rom`;
const gameP   = `${ROOT}/${B}/prod/scuba.rom`;
const planesP = `${ROOT}/${B}/splash/planes.raw`;
const expect  = JSON.parse(fs.readFileSync(`${ROOT}/${B}/splash_expect.json`, "utf8"));

let fail = 0, checks = 0;
const chk = (ok, msg) => { checks++; if (ok) console.log("  ok      " + msg);
                           else { fail++; console.log("  ПРОВАЛ  " + msg); } };

// --- 1. игра внутри splash ---------------------------------------------------
const splash = fs.readFileSync(splashP), game = fs.readFileSync(gameP);
const inner = Buffer.from(splash.subarray(0, game.length));
const orig3 = fs.readFileSync(`${ROOT}/src_splash/orig3.bin`);
chk(splash[0] === 0xC3, `первые три байта splash = jp (0x${splash[0].toString(16)})`);
orig3.copy(inner, 0);                       // вернуть, как это делает стартер
const md5 = b => crypto.createHash("md5").update(b).digest("hex");
chk(md5(inner) === md5(game),
    `образ игры внутри splash после возврата 3 байт: ${md5(inner)} против боевого ${md5(game)}`);

// --- 2 и 3: прогон заставки --------------------------------------------------
const m = make(splashP, { cpu: "i8080" });
const writes = [];             // {ctrl, div} по каждому каналу
let ctrl = {}, half = {}, palWrites = 0;
const io = m.io, origOut = io.output.bind(io);
io.output = (p, v) => {
  p &= 0xff; v &= 0xff;
  if (p === 0x08) { const ch = v >> 6; ctrl[ch] = v; half[ch] = null; }
  if (p === 0x0B || p === 0x0A || p === 0x09) {
    const ch = { 0x0B: 0, 0x0A: 1, 0x09: 2 }[p];
    if (half[ch] == null) half[ch] = v;
    else { writes.push({ ch, ctrl: ctrl[ch], div: half[ch] | (v << 8) }); half[ch] = null; }
  }
  if (p === 0x0C) palWrites++;
  return origOut(p, v);
};
m.run(700);                                  // ~14 с заставки

chk(palWrites >= 128, `палитра запрограммирована: записей в порт 0x0C ${palWrites} (16 слотов по 8)`);

const planes = fs.readFileSync(planesP);
let bad = 0, first = -1;
for (let i = 0; i < 32768; i++) {
  if (m.rd(0x8000 + i) !== planes[i]) { bad++; if (first < 0) first = i; }
}
chk(bad === 0, bad === 0 ? "плоскости заставки в видеопамяти совпали с эталоном упаковщика (32768 Б)"
    : `плоскости разошлись в ${bad} байтах, первый +0x${first.toString(16)}`);

// частоты
const okDiv = new Set(expect.div);
let notes = 0, badHz = 0, zero = 0, shown = 0;
for (const w of writes) {
  const mode3 = ((w.ctrl >> 1) & 7) === 3;
  if (!mode3) continue;                      // режим 0 — это тишина
  notes++;
  if (w.div === 0) { zero++; continue; }
  if (!okDiv.has(w.div)) {
    // допуск 1% по частоте
    const hz = expect.clk / w.div;
    const near = expect.div.map(d => Math.abs(expect.clk / d - hz) / (expect.clk / d))
                           .reduce((a, b) => Math.min(a, b), 1e9);
    if (near > 0.01) { badHz++; if (shown++ < 5)
      console.log(`      делитель ${w.div} = ${hz.toFixed(1)} Гц: ближайшая нота score мимо на ${(100*near).toFixed(2)}%`); }
  }
}
chk(notes > 0, `нот сыграно за прогон: ${notes} (по трём каналам)`);
chk(zero === 0, `делитель 0 в режиме 3 не выдавался ни разу (выдач: ${zero})`);
chk(badHz === 0, `все ${notes} нот в пределах 1% от таблицы score (мимо: ${badHz})`);

if (checks === 0) { console.log("ГЕЙТ НЕДЕЙСТВИТЕЛЕН: пустая выборка"); process.exit(2); }
console.log(fail ? `ГЕЙТ КРАСНЫЙ: ${fail} из ${checks}` : `ГЕЙТ ЗЕЛЁНЫЙ: все ${checks} проверки`);
process.exit(fail ? 1 : 0);
