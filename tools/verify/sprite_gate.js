// ГЕЙТ СПРАЙТОВ ПРИ ВЫСЕЛЕНИИ (-DEVICT).
//
// Зачем. Массив кадров героя разъехался по ломтям поштучно, и НИ ОДИН гейт этого
// не увидел: сверки картинки EVICT против безвыселенной у нас нет (у сборок
// разное число кадров на распаковку, урок 19), а сверка потоков чтений была
// сделана только для РЕЛЬЕФА. Дефект ушёл на железо. Этот гейт закрывает дыру
// ровно по образцу проверок C и D в relief_gate: сверяется ПОТОК ПРОЧИТАННЫХ
// БАЙТОВ, а не адреса — адреса законно разные.
//
// Меры:
//   A. поток байтов, прочитанных копировщиком спрайта в стейджинг (`i80_ldir_1`);
//   B. поток байтов, прочитанных подготовкой спрайта `LB3E9`.
// Обе — чистые функции от данных спрайтов и адресной арифметики, от числа
// кадров не зависят.
//
// Негативы:
//   SPRITE_INJECT=1 — испортить байт в выселенном ломте после раскладки;
//   SPRITE_TEAR=1   — РАЗОРВАТЬ МАССИВ: не разложить один ломоть вовсе (ровно
//                     тот дефект, что ушёл на железо);
//   SPRITE_EMPTY=1  — обнулить выборку.
//
//   node tools/verify/sprite_gate.js
//   SPRITE_LEVELS=1,2,3,4   SPRITE_TICKS=400
"use strict";
const fs = require("fs"), path = require("path");
const { readSym } = require("./harness.js");
const { reachGame } = require("./drive.js");
const ROOT = path.resolve(__dirname, "../..");
const B = process.env.BUILD_DIR || "build";
const EV = `${ROOT}/${B}/ev`, REF = `${ROOT}/${B}/gzref`;
for (const d of [EV, REF]) for (const f of ["scuba.rom", "scubacod1.sym"])
  if (!fs.existsSync(`${d}/${f}`)) {
    console.log(`нет ${d}/${f} — собери:\n` +
      `  DET=1 SRC=src8080 GEOM=1 ZONE=1 EVICT=1 OUT=${B}/ev ./tools/build.sh\n` +
      `  DET=1 SRC=src8080 GEOM=1 ZONE=1          OUT=${B}/gzref ./tools/build.sh`);
    process.exit(2); }

const INJECT = process.env.SPRITE_INJECT === "1";
const TEAR   = process.env.SPRITE_TEAR === "1";
const EMPTY  = process.env.SPRITE_EMPTY === "1";
const LEVELS = EMPTY ? [] : (process.env.SPRITE_LEVELS || "1,2,3,4").split(",").map(Number);
const TICKS  = Number(process.env.SPRITE_TICKS || 400);

let fail = 0, checks = 0;
const chk = (ok, msg) => { checks++; if (ok) console.log("  ok      " + msg);
                           else { fail++; console.log("  ПРОВАЛ  " + msg); } };

function run(dir, level) {
  const sym = `${dir}/scubacod1.sym`, S = readSym(sym);
  for (const n of ["i80_ldir_1", "LB3E9", "LD9C0"])
    if (S[n] == null) { console.log(`нет метки ${n} в ${sym}`); process.exit(2); }
  const isEv = S.ZoneCopy != null;
  const ldir = [], prep = [];
  // ПРИЗНАК ДАННЫХ, А НЕ ВЫБОРКИ КОМАНДЫ: адрес не равен PC (урок 21).
  const g = reachGame(`${dir}/scuba.rom`, sym, { cpu: "i8080", level, seed: 0x0167,
    preHook: (m, SS) => {
      const rd0 = m.memory.read.bind(m.memory);
      m.memory.read = (a, st) => { a &= 0xffff;
        if (!EMPTY) { const pc = m.cpu.pc & 0xffff;
          if (a !== pc) {
            if (pc >= SS.i80_ldir_1 && pc < SS.i80_ldir_1 + 24) ldir.push(rd0(a, st) & 0xff);
            else if (pc >= SS.LB3E9 && pc < SS.LB3E9 + 24) prep.push(rd0(a, st) & 0xff);
          } }
        return rd0(a, st); };
      if (!isEv) return;
      if (INJECT) m.onPc(SS.ZoneDone, () => { m.wr(0xC0C0 + 7, 0x5a); });
      // РАЗРЫВ МАССИВА: один ломоть не раскладывается вовсе — ровно то, что
      // случилось с кадрами героя на железе.
      if (TEAR) { let n = 0;
        m.onPc(SS.ZoneDone, () => { if (n++) return;
          for (let i = 0; i < 64; i++) m.wr(0xC1C0 + i, 0); }); }
    }});
  let t = 0; g.m.onPc(S.LD9C0, () => { t++; });
  let q = 0; while (t < TICKS && q < 600000) { g.m.step(); q++; }
  if (t < TICKS) { console.log(`  ПРОВАЛ  ${dir}: главный цикл не дал ${TICKS} тиков`); process.exit(1); }
  return { ldir, prep };
}

const diffs = (a, b) => { if (a.length !== b.length) return Math.abs(a.length - b.length) + 1;
  let n = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++; return n; };

let dA = 0, dB = 0, nA = 0, nB = 0, samples = 0;
for (const lvl of LEVELS) {
  const e = run(EV, lvl), r = run(REF, lvl);
  const a = diffs(e.ldir, r.ldir), b = diffs(e.prep, r.prep);
  console.log(`  уровень ${lvl}: копия спрайта ${a} расхождений из ${r.ldir.length}; ` +
              `подготовка ${b} из ${r.prep.length}`);
  dA += a; dB += b; nA += r.ldir.length; nB += r.prep.length; samples++;
}
if (!samples || !nA) {
  console.log("  ПРОВАЛ  ПУСТАЯ ВЫБОРКА: спрайтовых чтений не снято");
  console.log("ГЕЙТ НЕДЕЙСТВИТЕЛЕН"); process.exit(2); }
chk(dA === 0, `A: поток байтов копии спрайта совпал с безвыселенной сборкой ` +
    `(${nA} чтений, расхождений ${dA})`);
chk(dB === 0, `B: поток байтов подготовки спрайта совпал (${nB} чтений, расхождений ${dB})`);
console.log(fail ? `ГЕЙТ КРАСНЫЙ: ${fail} из ${checks}` : `ГЕЙТ ЗЕЛЁНЫЙ: все ${checks} проверки`);
process.exit(fail ? 1 : 0);
