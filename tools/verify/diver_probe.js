// ЗАМЕР ГЕОМЕТРИИ МАССИВА SprDiver0 — ВСЁ В ОДНОМ ПРОГОНЕ.
//
// Зачем один прогон: показания, которые предстоит сопоставлять, снимаются вместе
// (урок №5). Здесь сопоставляются четыре вещи, и порознь они уже дали
// противоречие: разведка объявила единицу адресации 16 Б («угол n -> ломоть n»),
// а статика .sym и текст массива говорят про 128 Б на угол.
//
// Что меряется за один заход:
//   1. ФОРМУЛА. На метке DvSprCalc (сразу за ADD HL,DE) сверяется
//      HL - SprDiver0 против угол*128 + фаза*32 И против угол*64 + фаза*16.
//      Побеждает та, что совпала на ВСЕХ наблюдениях.
//   2. ПОКРЫТИЕ. Подсадка угла (DiverObj+$06) и фазы (DiverObj+$17) делается
//      НА ВХОДЕ В LE1D2, то есть за несколько команд до чтения полей, — тогда
//      формула считает ровно наши значения. Прошлая подсадка в геймплее дала
//      ноль чтений именно потому, что логика её перетирала.
//   3. ЧТЕНИЯ КОПИРОВЩИКА. Крючок на i80_ldir_1 (метка тела цикла: срабатывает
//      на КАЖДОЙ итерации) даёт полный поток адресов источника. По нему:
//      длины непрерывных серий, минимум/максимум смещения внутри кадра и
//      пересечения границ 32/64/128 — то есть ровно то, от чего зависит, нужен
//      ли перенос курсора при раскладке по ломтям.
//   4. LE848. Подсадка битов DiverObj+$26 := (v|4)&~0x0A открывает вход;
//      считаются заходы, наблюдаемый сброс (IX+4)=0,(IX+5)=0,(IX+6)=4 и
//      ЗНАЧЕНИЕ УКАЗАТЕЛЯ (IX+$24/$25) на входе — последнее нужно, чтобы
//      узнать, ходит ли этот тракт по чужим массивам (SprDiverClimb).
//
//   node tools/verify/diver_probe.js [dir]
//   DP_TICKS=1200 DP_LEVEL=1 DP_INJECT=1
"use strict";
const fs = require("fs"), path = require("path");
const { readSym } = require("./harness.js");
const { reachGame, swim } = require("./drive.js");
const ROOT = path.resolve(__dirname, "../..");
const DIR = process.argv[2] || `${ROOT}/build/dp`;
for (const f of ["scuba.rom", "scubacod1.sym"])
  if (!fs.existsSync(`${DIR}/${f}`)) {
    console.log(`нет ${DIR}/${f} — собери:\n  DET=1 SRC=src8080 GEOM=1 ZONE=1 NOTITLE=1 OUT=build/dp ./tools/build.sh`);
    process.exit(2); }

const S = readSym(`${DIR}/scubacod1.sym`);
const NEED = ["SprDiver0", "SprDiver1", "SprDiver5", "SprDrowned", "DiverObj",
              "i80_ldir_1", "LD9C0", "LE1D2", "DvSprCalc", "LE848", "LE837", "LE7E0",
              "SprDiverClimb"];
for (const n of NEED) if (S[n] == null) { console.log(`нет метки ${n} в .sym`); process.exit(2); }
const BASE = S.SprDiver0, END = S.SprDrowned, SIZE = END - BASE;
const TICKS = Number(process.env.DP_TICKS || 1200);
const LEVEL = Number(process.env.DP_LEVEL || 1);
const INJECT = process.env.DP_INJECT !== "0";

// --- накопители --------------------------------------------------------------
// ДВЕ ФАЗЫ В ОДНОМ ПРОГОНЕ. Подсадки мешают друг другу: открытый вход в LE848
// уводит дайвера в анимацию «прыжок с лодки», и тракт LE1D2 (расчёт кадра по
// углу и фазе) в это время не исполняется вовсе — первый заход дал 2 захода из
// 1200 тиков. Поэтому подсадки разведены по фазам, а прогон остаётся один.
const calc = [];                 // {hl, ang, ph}
const reads = [];                // {hl, op} — адреса источника копии внутри массива
const readsAll = [];             // все адреса источника копии (для контекста)
let le848 = 0; const le848ptr = new Map(); let le848reset = 0;
let nLE7E0 = 0, nLE837 = 0;
const combos = new Set();        // сочетания угол*4+фаза, ПОСЧИТАННЫЕ формулой
let nLE1D2 = 0;

let want = 0, phase = "A";       // A: подсадка угла/фазы; B: подсадка битов $26
let op = 0, prevBc = -1;         // разбор потока копий на ОПЕРАЦИИ по счётчику BC
const g = reachGame(`${DIR}/scuba.rom`, `${DIR}/scubacod1.sym`,
  { cpu: "i8080", level: LEVEL, seed: 0x0167, preHook: (m, SS) => {
    const D = SS.DiverObj;
    // 2. ПОДСАДКА угла и фазы на входе в тракт, который их читает
    m.onPc(SS.LE1D2, () => {
      nLE1D2++;
      if (!INJECT || phase !== "A") return;
      // СОЧЕТАНИЕ МЕНЯЕТСЯ НА КАЖДОМ ЗАХОДЕ, а не по тикам: заходов на порядок
      // меньше, чем тиков (26 на 2000), и привязка к тикам покрывала лишь
      // случайную дюжину сочетаний из 64.
      want = (want + 1) & 63;
      const a = (want >> 2) & 15, p = want & 3;
      m.wr(D + 0x06, a);
      m.wr(D + 0x17, (m.rd(D + 0x17) & 0xfc) | p);
    });
    // 1. ФОРМУЛА: HL уже посчитан
    m.onPc(SS.DvSprCalc, () => {
      const hl = m.cpu.hl() & 0xffff;
      const ang = m.rd(D + 0x06) & 15, ph = m.rd(D + 0x17) & 3;
      calc.push({ hl, ang, ph });
      combos.add(ang * 4 + ph);
    });
    // 3. ЧТЕНИЯ КОПИРОВЩИКА. Метка i80_ldir_1 — ТЕЛО цикла, крючок бьёт на
    // каждой итерации. Границу операций даёт счётчик BC: новая копия начинается
    // там, где BC не равен «предыдущий минус один». Без этого две подряд идущие
    // копии со смежными источниками склеиваются в одну «серию» и дают ложное
    // пересечение границы.
    m.onPc(SS.i80_ldir_1, () => {
      const hl = m.cpu.hl() & 0xffff, bc = m.cpu.rp(0) & 0xffff;
      if (bc !== ((prevBc - 1) & 0xffff)) op++;
      prevBc = bc;
      readsAll.push(hl);
      if (hl >= BASE && hl < END) reads.push({ hl, op });
    });
    // 4. LE848
    m.onPc(SS.LE848, () => {
      le848++;
      const p = m.rd(D + 0x24) | (m.rd(D + 0x25) << 8);
      le848ptr.set(p, (le848ptr.get(p) || 0) + 1);
    });
    m.onPc(SS.LE7E0, () => { nLE7E0++; });
    m.onPc(SS.LE837, () => { nLE837++; });
    m.onWrite(D + 0x06, (a, v, pc) => {
      if (pc >= SS.LE848 && pc < SS.LE848 + 0x80 && v === 4) le848reset++;
    });
  }});

let t = 0; g.m.onPc(S.LD9C0, () => {
  t++;
  phase = t * 2 < TICKS ? "A" : "B";
  if (!INJECT) return;
  if (phase === "A") {
    // ОТКРЫТЬ САМ ТРАКТ РАСЧЁТА. LE1D2 работает только при $10 бит7=1, бит4=0,
    // бит5=0; в свободном плавании он исполняется единицы раз за тысячи тиков
    // (замер: 15 заходов на 6000), и подсадка сочетаний упиралась не в перебор,
    // а в число заходов. Эффект подсадки проверяется числом заходов в LE1D2.
    const f = g.m.rd(S.DiverObj + 0x10);
    g.m.wr(S.DiverObj + 0x10, (f | 0x80) & ~0x30);
  }
  if (phase === "B") {                           // открыть вход в LE848
    const v = g.m.rd(S.DiverObj + 0x26);
    g.m.wr(S.DiverObj + 0x26, (v | 0x04) & ~0x0a);
  }
});
swim(g, { passes: 1, frames: 30, noDeath: true });
let q = 0; while (t < TICKS && q < 900000) { g.m.step(); q++; }

// --- разбор ------------------------------------------------------------------
const pr = (k, v) => console.log("  " + k.padEnd(46) + v);
console.log(`ЗАМЕР SprDiver0: ${DIR}, уровень ${LEVEL}, тиков ${t}, подсадка ${INJECT ? "да" : "нет"}`);
pr("массив", `0x${BASE.toString(16)}..0x${END.toString(16)} = ${SIZE} Б`);
pr("SprDiver1-SprDiver0", S.SprDiver1 - BASE);
pr("SprDiver5-SprDiver0", S.SprDiver5 - BASE);

// 1. формула
let ok128 = 0, ok64 = 0;
for (const c of calc) {
  const d = (c.hl - BASE) & 0xffff;
  if (d === c.ang * 128 + c.ph * 32) ok128++;
  if (d === c.ang * 64 + c.ph * 16) ok64++;
}
console.log("\n1. ФОРМУЛА АДРЕСА (наблюдений " + calc.length + ")");
pr("совпало с угол*128 + фаза*32", ok128);
pr("совпало с угол*64  + фаза*16", ok64);
if (!calc.length) console.log("  ПУСТАЯ ВЫБОРКА — вывода нет");
else if (ok128 === calc.length && ok64 !== calc.length) console.log("  ВЕРНА: угол*128 + фаза*32 (кадр = 128 Б, фаза = 32 Б)");
else if (ok64 === calc.length && ok128 !== calc.length) console.log("  ВЕРНА: угол*64 + фаза*16");
else console.log("  НЕ РАЗДЕЛЕНО — выборка не различает формулы");

// 2. покрытие
console.log("\n2. ПОКРЫТИЕ");
pr("заходов в LE1D2 (расчёт кадра)", nLE1D2);
pr("сочетаний угол*фаза, посчитанных формулой", `${combos.size} из 64`);
const readCombo = new Set();
for (const r of reads) { const d = r.hl - BASE; readCombo.add((d >> 5) & 63); }
pr("сочетаний, реально ПРОЧИТАННЫХ копией", `${readCombo.size} из 64`);
pr("чтений копировщика внутри массива", reads.length);
pr("чтений копировщика всего", readsAll.length);

// 3. геометрия чтений
console.log("\n3. ГЕОМЕТРИЯ ЧТЕНИЙ КОПИРОВЩИКА");
const runs = []; let s = null, prev = null, prevOp = -1;
for (const r of reads) {
  if (prev !== null && r.hl === prev + 1 && r.op === prevOp) { s.len++; }
  else { s = { at: r.hl, len: 1 }; runs.push(s); }
  prev = r.hl; prevOp = r.op;
}
const hist = new Map();
for (const r of runs) hist.set(r.len, (hist.get(r.len) || 0) + 1);
pr("серий", runs.length);
pr("длины серий", [...hist.entries()].sort((a, b) => b[1] - a[1])
   .map(([l, n]) => `${l}Б x${n}`).join(", ") || "—");
const cross = (m) => runs.filter(r => Math.floor((r.at - BASE) / m) !== Math.floor((r.at - BASE + r.len - 1) / m)).length;
pr("серий, пересекающих границу 32 Б (фаза)", cross(32));
pr("серий, пересекающих границу 64 Б (ломоть)", cross(64));
pr("серий, пересекающих границу 128 Б (угол)", cross(128));
const starts = new Set(runs.map(r => (r.at - BASE) % 32));
pr("смещения начала серии внутри фазы", [...starts].sort((a, b) => a - b).join(",") || "—");
pr("максимальная длина серии", runs.reduce((m, r) => Math.max(m, r.len), 0));

// 4. LE848
console.log("\n4. ТРАКТ LE848 (ограничитель анимации)");
pr("заходов в LE7E0 / LE837 / LE848", `${nLE7E0} / ${nLE837} / ${le848}`);
pr("наблюдённых сбросов (IX+6)=4", le848reset);
pr("значения (IX+$24/$25) на входе", [...le848ptr.entries()]
   .map(([p, n]) => `0x${p.toString(16)}${p >= BASE && p < END ? "[в массиве]" :
        p === S.SprDiverClimb ? "[SprDiverClimb]" : "[ЧУЖОЙ]"} x${n}`).join(", ") || "—");
