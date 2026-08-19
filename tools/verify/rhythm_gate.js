// ГЕЙТ НОТ Z80-СБОРКИ (-DZXSOUND). Проверяет то, что реально проверяемо.
//
// ЧЕСТНО ПРО РИТМ. Ритм этих таблиц ВЫРОЖДЕН ПО ПОСТРОЕНИЮ: третий байт тройки —
// число периодов, и в таблицах это 2..6. При частотах 550..2800 Гц нота звучала
// в ОРИГИНАЛЕ около 0.2 кадра, то есть это короткие щелчки, а не музыка.
// Формула длительности (t = (P*M + P*M/8) >> 7, M = N>>8) на таких данных даёт
// ноль, и оба наших драйвера — асинхронный i8080 и блокирующий Z80 — округляют
// ноту до ОДНОГО кадра, что уже длиннее оригинала. i8080-ветка ведёт себя так же
// и принята владельцем на слух.
// Поэтому проверять «правильность ритма» здесь нечего: любая такая проверка
// вырождается и даёт ложный зелёный. Проверяем вместо этого две вещи, которые
// ловят настоящие дефекты:
//   (а) каждая нота звучит не меньше кадра и не больше потолка (зависшая нота);
//   (б) высота каждой ноты есть в таблицах мелодий, и ноты вообще играются.
//
//   RHYTHM_STUCK=1 — подсадить зависшую ноту, гейт обязан покраснеть
//   RHYTHM_ALIEN=1 — подсадить чужую высоту, гейт обязан покраснеть
//   RHYTHM_EMPTY=1 — обнулить выборку, гейт обязан покраснеть
"use strict";
const { reachGame } = require("./drive.js");
const { readSym } = require("./harness.js");
const rom = process.argv[2], sym = process.argv[3], CPU = process.argv[4] || "z80";
const S = readSym(sym);
const MAXF = 25;                 // потолок длительности: защита от зависшей ноты
const MELODIES = ["LE604","LE60B","LE61C","LE629","LE630","LE632","LE634","LE638","LEDD5"];

let frame = 0, cur = null, ctrl = null, lo = null;
const notes = [];
const g = reachGame(rom, sym, { cpu: CPU, level: 1, seed: 0x0167, preHook: (m) => {
  const origStep = m.step;                       // счётчик кадров — ЗДЕСЬ: мелодия
  m.step = () => { frame++; return origStep(); };// старта звучит внутри reachGame
  const io = m.io, origOut = io.output.bind(io);
  io.output = (p, v) => {
    p &= 0xff; v &= 0xff;
    if (p === 0x08) { ctrl = v; lo = null; }
    if (p === 0x09) {
      if (lo === null) lo = v;
      else { const n = lo | (v << 8); lo = null;
        if (ctrl === 0xB6 && n) cur = { n, start: frame };
        else if (cur) { notes.push({ n: cur.n, frames: frame - cur.start }); cur = null; } }
    }
    return origOut(p, v);
  };
} });
const m = g.m;
let t = 0; m.onPc(S.LD9C0, () => { t++; });
m.key(38, true);
let gd = 0; while (t < 1200 && gd < 400000) { m.step(); gd++; }

// множество законных высот из таблиц мелодий
const legal = new Set();
for (const nm of MELODIES) {
  let a = S[nm]; if (a == null) continue;
  for (let i = 0; i < 40; i++) {
    const p = m.rd(a); if (p === 0xFF) break;
    const X = m.rd(a + 1) | (m.rd(a + 2) << 8);
    legal.add(3 * X + (X >> 1) - (X >> 4) + 103);
    a += 3;
  }
}
if (process.env.RHYTHM_STUCK === "1" && notes.length) notes[0].frames = MAXF + 5;
if (process.env.RHYTHM_ALIEN === "1" && notes.length) notes[0].n = 12345;
const list = process.env.RHYTHM_EMPTY === "1" ? [] : notes;

let fail = 0, checks = 0;
const chk = (ok, msg) => { checks++; if (ok) console.log("  ok      " + msg);
                           else { fail++; console.log("  ПРОВАЛ  " + msg); } };
if (list.length === 0) {
  console.log("  ПРОВАЛ  ПУСТАЯ ВЫБОРКА: ни одной ноты не сыграно");
  console.log("ГЕЙТ НЕДЕЙСТВИТЕЛЕН"); process.exit(2);
}
const short = list.filter(x => x.frames < 1), long = list.filter(x => x.frames > MAXF);
const alien = list.filter(x => !legal.has(x.n));
chk(short.length === 0, `все ${list.length} нот звучат не меньше кадра` +
    (short.length ? ` — молчащих ${short.length}` : ""));
chk(long.length === 0, `ни одна нота не длиннее ${MAXF} кадров` +
    (long.length ? ` — зависших ${long.length} (максимум ${Math.max(...long.map(x=>x.frames))})` : ""));
chk(alien.length === 0, `все высоты есть в таблицах мелодий (законных делителей ${legal.size})` +
    (alien.length ? ` — чужих ${alien.length}, первый ${alien[0].n}` : ""));
console.log(fail ? `ГЕЙТ КРАСНЫЙ: ${fail} из ${checks}` : `ГЕЙТ ЗЕЛЁНЫЙ: все ${checks} проверки`);
process.exit(fail ? 1 : 0);
