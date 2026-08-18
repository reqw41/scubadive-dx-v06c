// ГЕЙТ SPLASH-ROM. Три требования:
//  1) образ игры внутри splash БАЙТ В БАЙТ равен боевому (кроме трёх первых
//     байт — там jp на стартер, и стартер возвращает их на место сам);
//  2) частоты трёх голосов, реально выданные в ВИ53, совпадают со score (1%),
//     делитель 0 в режиме 3 не выдаётся никогда;
//  3) плоскости заставки в видеопамяти совпадают с эталоном упаковщика.
//   node tools/verify/splash_gate.js
// РОДОСЛОВНАЯ ЭТАЛОНА: стартер f79785f (подтверждён на железе) ПЛЮС две команды
// гигиены квазидиска (xor a / out 0x10) — эта добавка на железе ЕЩЁ НЕ ПРОВЕРЕНА,
// до следующей поездки владельца эталон считается предварительным.
"use strict";
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const { make } = require("./harness.js");
const ROOT = path.resolve(__dirname, "../..");
const B = process.env.BUILD_DIR || "build";
const splashP = `${ROOT}/${B}/prod/scuba_splash.rom`;
// Внутрь splash кладётся сборка БЕЗ старого титула (build.sh NOTITLE=1), поэтому
// и сверять байт в байт надо с ней, а не с чистым боевым образом.
const gameP   = `${ROOT}/${B}/${process.env.NOTITLE === "0" ? "prod" : "notitle"}/scuba.rom`;
const planesP = `${ROOT}/${B}/splash/planes.raw`;
const expect  = JSON.parse(fs.readFileSync(`${ROOT}/${B}/splash_expect.json`, "utf8"));

const md5 = b => crypto.createHash("md5").update(b).digest("hex");
let fail = 0, checks = 0;
const chk = (ok, msg) => { checks++; if (ok) console.log("  ok      " + msg);
                           else { fail++; console.log("  ПРОВАЛ  " + msg); } };

// --- 1. игра внутри splash ---------------------------------------------------
const splash = fs.readFileSync(splashP), game = fs.readFileSync(gameP);
const inner = Buffer.from(splash.subarray(0, game.length));
const orig3 = fs.readFileSync(`${ROOT}/src_splash/orig3.bin`);
chk(splash[0] === 0xC3, `первые три байта splash = jp (0x${splash[0].toString(16)})`);
orig3.copy(inner, 0);                       // вернуть, как это делает стартер
chk(md5(inner) === md5(game),
    `образ игры внутри splash после возврата 3 байт: ${md5(inner)} против боевого ${md5(game)}`);

// --- 1б. СТАРТЕР ШТАТНОЙ ЗАСТАВКИ = ЖЕЛЕЗНЫЙ ЭТАЛОН ---------------------------
// Зачем эта проверка. Образ, собранный в эпоху экспериментов с полосной палитрой,
// на MiSTer дал испорченные цвета и зависание, хотя ВЕСЬ набор гейтов был зелёный:
// стенд не судья по фазе растра и защёлке палитры. Единственная защита, которая
// работает без железа, — требовать, чтобы штатный (без BANDS/RULER) стартер был
// БАЙТ В БАЙТ равен последнему стартеру, доказанно работавшему на живом железе
// (коммит f79785f). Экспериментальный код живёт в splash_bands.asm под IFDEF и в
// штатную сборку не попадает ни байтом.
// ЕСЛИ ЭТА ПРОВЕРКА УПАЛА — это не «обнови эталон». Это значит, что штатный путь
// заставки изменился и его НАДО ПРОВЕРИТЬ НА ЖЕЛЕЗЕ, а эталон пересоздавать
// (tools/verify/ref/gen_splash_ref.js) только после того, как владелец подтвердил
// новый образ на MiSTer.
const refStarter = fs.readFileSync(`${ROOT}/tools/verify/ref/splash_starter_ref.bin`);
const STARTER_AT = 0x5500 - 0x100;
const gotStarter = Buffer.from(splash.subarray(STARTER_AT, STARTER_AT + refStarter.length));
chk(gotStarter.equals(refStarter),
    `стартер штатной заставки байт в байт равен железному эталону (f79785f + гигиена квазидиска) ` +
    `(${refStarter.length} Б, md5 эталона ${md5(refStarter).slice(0, 8)}, собрано ${md5(gotStarter).slice(0, 8)})`);

// --- 1в. ПОРЯДОК И СОДЕРЖИМОЕ ПАЛИТРОВЫХ ЗАПИСЕЙ ------------------------------
// Байтовое равенство выше поймает любую правку стартера, но не поймает правку
// ВХОДНЫХ ДАННЫХ: сменилась картинка — сменилась и палитра, а стартер тот же.
// Поэтому отдельно сверяется сама последовательность обращений к портам 2 и 0x0C:
// и порядок (сначала индекс слота в кайму, потом восемь записей значения), и
// значения. Именно порядок ломался бы при перестановке блоков в ISR.
const refSeqAll = JSON.parse(fs.readFileSync(`${ROOT}/tools/verify/ref/splash_pal_seq.json`, "utf8")).seq;
function palSeq(rom, inject) {
  const m = make(rom, { cpu: "i8080" });
  const seq = [];
  const io = m.io, oo = io.output.bind(io);
  io.output = (p, v) => { p &= 0xff; v &= 0xff;
    if (p === 0x0C || p === 0x02) seq.push([p, v]);
    return oo(p, v); };
  for (let f = 0; f < 8; f++) m.step();
  if (inject && seq.length > 40) seq[40] = [seq[40][0], seq[40][1] ^ 0x20];
  return seq;
}
const gotSeq = process.env.SPLASH_EMPTY === "1" ? []
             : palSeq(splashP, process.env.SPLASH_INJECT === "1");
if (gotSeq.length === 0) {
  console.log("  ПРОВАЛ  ПУСТАЯ ВЫБОРКА: ни одной записи в порты 2/0x0C");
  fail++; checks++;
} else {
  const same = gotSeq.length === refSeqAll.length &&
               gotSeq.every((x, i) => x[0] === refSeqAll[i][0] && x[1] === refSeqAll[i][1]);
  let firstBad = -1;
  for (let i = 0; i < Math.min(gotSeq.length, refSeqAll.length); i++)
    if (gotSeq[i][0] !== refSeqAll[i][0] || gotSeq[i][1] !== refSeqAll[i][1]) { firstBad = i; break; }
  chk(same, `порядок и содержимое палитровых записей совпали с эталоном (f79785f + гигиена квазидиска) ` +
      `(${gotSeq.length} записей против ${refSeqAll.length}` +
      (same ? "" : `, первое расхождение №${firstBad}: ` +
        `порт ${gotSeq[firstBad] ? "0x" + gotSeq[firstBad][0].toString(16) : "-"} ` +
        `значение ${gotSeq[firstBad] ? gotSeq[firstBad][1] : "-"} вместо ` +
        `${refSeqAll[firstBad] ? refSeqAll[firstBad][1] : "-"}`) + ")");
}

// --- 2 и 3: два прогона заставки — с AY и без ---------------------------------
// ЧЕСТНОЕ ПРЕДУСЛОВИЕ ЭТОГО ГЕЙТА. Проба AY читает ДВА порта, потому что чтение
// разведено по-разному:
//   железо/MiSTer: данные читаются с 0x15 (BDIR=0, BC=1; чтение 0x14 = inactive
//     = 0xFF) — Vector-06C.sv + rtl/ym2149.sv;
//   vector06js:    данные читаются с 0x14, а 0x15 возвращает номер регистра.
// СТЕНД ПОДТВЕРЖДАЕТ ТОЛЬКО ВЕТКУ 0x14. Ветку 0x15, которая и работает на живом
// железе, проверить здесь НЕЛЬЗЯ — её подтвердил владелец на MiSTer. Первая
// версия пробы читала только 0x14, была зелёной на этом самом гейте и провалилась
// на железе; отсюда и двойное чтение. Тот же урок записан в KV,
// ~/projects/kvalley-v06c src/v06c/vec_boot.asm (проба AY).
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
