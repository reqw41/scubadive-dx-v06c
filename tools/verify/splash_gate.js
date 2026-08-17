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

// --- 2 и 3: два прогона заставки — с AY и без ---------------------------------
// Стенд умеет глушить AY флагом _noay: порты 0x14/0x15 читаются как 0xFF, то есть
// ровно то, что видит Вектор без AY. Это готовый негативный контроль детекта.
function run(noay) {
  const m = make(splashP, { cpu: "i8080" });
  m.ctx.window._noay = !!noay;                 // флаг живёт в контексте эмулятора
  const vi = [], ay = [];                      // ноты по путям ВИ53 и AY
  let ctrl = {}, half = {}, palWrites = 0, ayreg = 0, ayregs = {};
  const io = m.io, origOut = io.output.bind(io);
  io.output = (p, v) => {
    p &= 0xff; v &= 0xff;
    if (p === 0x08) { ctrl[v >> 6] = v; half[v >> 6] = null; }
    if (p === 0x0B || p === 0x0A || p === 0x09) {
      const ch = { 0x0B: 0, 0x0A: 1, 0x09: 2 }[p];
      if (half[ch] == null) half[ch] = v;
      else { vi.push({ ch, ctrl: ctrl[ch], div: half[ch] | (v << 8) }); half[ch] = null; }
    }
    if (p === 0x0C) palWrites++;
    if (p === 0x15) ayreg = v;          // 0x15 = выбор регистра, 0x14 = данные
    if (p === 0x14) {
      ayregs[ayreg] = v;
      if (ayreg === 1 || ayreg === 3 || ayreg === 5)          // грубый период -> нота готова
        ay.push({ ch: (ayreg - 1) / 2, per: (ayregs[ayreg - 1] | 0) | (v << 8) });
    }
    return origOut(p, v);
  };
  m.run(700);                                   // ~14 с заставки
  return { m, vi, ay, palWrites, ayregs };
}

// --- прогон С AY (умолчание стенда) ---
{
  const r = run(false);
  chk(r.ay.length > 0, `с AY: сыграно нот через AY ${r.ay.length}`);
  chk(r.vi.filter(w => ((w.ctrl >> 1) & 7) === 3).length === 0,
      `с AY: ВИ53 в режиме 3 не трогался (нот ${r.vi.filter(w => ((w.ctrl >> 1) & 7) === 3).length})`);
  chk(r.ayregs[7] === 0x38, `с AY: reg7 = 0x${(r.ayregs[7] || 0).toString(16)} (тоны на трёх каналах, шум выключен)`);
  const vol = expect.vol;
  chk(r.ayregs[8] === vol.melody || r.ayregs[8] === 0,
      `с AY: громкость канала A (мелодия) ${r.ayregs[8]}, ожидали ${vol.melody} или 0 на паузе`);
  chk(r.ayregs[9] === vol.bass || r.ayregs[9] === 0,
      `с AY: громкость канала B (бас) ${r.ayregs[9]}, ожидали ${vol.bass} или 0`);
  chk(r.ayregs[10] === vol.harm || r.ayregs[10] === 0,
      `с AY: громкость канала C (гармония) ${r.ayregs[10]}, ожидали ${vol.harm} или 0`);
  let badHz = 0;
  for (const n of r.ay) {
    if (n.per === 0) { badHz++; continue; }
    const hz = expect.clk_ay / (16 * n.per);
    const near = expect.ay.map(a => Math.abs(expect.clk_ay / (16 * a) - hz) / (expect.clk_ay / (16 * a)))
                          .reduce((a, b) => Math.min(a, b), 1e9);
    if (near > 0.01) badHz++;
  }
  chk(badHz === 0, `с AY: все ${r.ay.length} нот в пределах 1% от таблицы score (мимо: ${badHz})`);
  chk(r.palWrites >= 128, `с AY: палитра запрограммирована (${r.palWrites} записей в 0x0C)`);
}

// --- прогон БЕЗ AY: детект обязан выбрать ВИ53 ---
{
  const r = run(true);
  const notes = r.vi.filter(w => ((w.ctrl >> 1) & 7) === 3);
  chk(r.ay.length === 0, `без AY: в AY ничего не писалось как в источник нот (записей ${r.ay.length})`);
  chk(notes.length > 0, `без AY: детект выбрал ВИ53, сыграно нот ${notes.length}`);
  chk(notes.every(w => w.div !== 0), "без AY: делитель 0 в режиме 3 не выдавался ни разу");
  let badHz = 0;
  for (const w of notes) {
    const hz = expect.clk / w.div;
    const near = expect.div.map(d => Math.abs(expect.clk / d - hz) / (expect.clk / d))
                           .reduce((a, b) => Math.min(a, b), 1e9);
    if (near > 0.01) badHz++;
  }
  chk(badHz === 0, `без AY: все ${notes.length} нот в пределах 1% от таблицы score (мимо: ${badHz})`);
  const planes = fs.readFileSync(planesP);
  let bad = 0;
  for (let i = 0; i < 32768; i++) if (r.m.rd(0x8000 + i) !== planes[i]) bad++;
  chk(bad === 0, `без AY: плоскости в видеопамяти совпали с эталоном упаковщика (расхождений ${bad})`);
}

if (checks === 0) { console.log("ГЕЙТ НЕДЕЙСТВИТЕЛЕН: пустая выборка"); process.exit(2); }
console.log(fail ? `ГЕЙТ КРАСНЫЙ: ${fail} из ${checks}` : `ГЕЙТ ЗЕЛЁНЫЙ: все ${checks} проверки`);
process.exit(fail ? 1 : 0);
