// ЗАМЕР ПОД БЮДЖЕТ ТРЕТЬЕЙ ПЛОСКОСТИ. Ничего не правит.
//
// Отвечает на три вопроса владельца числом:
//   (A) SCRATTR (1024 Б) — программная эмуляция атрибутной памяти ZX. Кто её
//       читает и пишет, какие значения там реально бывают, и хватит ли бита или
//       таблицы типов вместо байта на знакоместо.
//   (B) MiniMap (1024 Б) — годится ли в ломти зоны по 64 Б. Решает НЕ размер, а
//       ГЕОМЕТРИЯ ЧТЕНИЙ: если тракт ходит по карте подряд, он пересечёт границу
//       ломтя, и каждому такому ходоку нужен перенос курсора (как RELF_INC у
//       рельефа). Меряем длину непрерывных пробегов и число пересечений.
//   (C) буферы пула — ПИК ОДНОВРЕМЕННО ЖИВЫХ, чтобы знать, сколько страниц
//       реально нужно вместо шестнадцати.
//
// Мера пробега: подряд идущие обращения ОДНОГО тракта к соседним адресам.
// Прерывается сменой тракта или скачком адреса. Это та же мера, которой мерили
// выход курсора за блок рельефа (relief_probe), и она уже один раз спасла от
// ошибки: «пересечение границы указателем» — не то же, что «чтение за границей»
// (урок №18).
//
//   node tools/verify/budget_probe.js [каталог]
"use strict";
const fs = require("fs"), path = require("path");
const { readSym } = require("./harness.js");
const { reachGame, swim } = require("./drive.js");
const ROOT = path.resolve(__dirname, "../..");
const B = process.env.BUILD_DIR || "build";
const DIR = process.argv[2] || `${ROOT}/${B}/ev`;
for (const f of ["scuba.rom", "scubacod1.sym"])
  if (!fs.existsSync(`${DIR}/${f}`)) { console.log(`нет ${DIR}/${f}`); process.exit(2); }
const S = Object.assign({}, readSym(`${DIR}/scubacod0.sym`), readSym(`${DIR}/scubacod1.sym`));
const labs = Object.entries(S).filter(([, v]) => v >= 0x100 && v < 0xA000).sort((a, b) => a[1] - b[1]);
const near = pc => { let x = null; for (const [n, v] of labs) { if (v <= pc) x = [n, v]; else break; }
                     return x ? (pc - x[1] ? `${x[0]}+${pc - x[1]}` : x[0]) : "?"; };

const ATTR0 = S.SCRATTR, ATTR1 = S.SCRATTR + 0x400;
const MM0 = S.MiniMap, MM1 = S.MiniMap + 0x400;
const POOL0 = S.POOL_HI * 256, POOL1 = POOL0 + 0x1000;

const attrR = new Map(), attrW = new Map();      // PC -> число
const attrVal = new Map();                        // значение -> число записей
const mmR = new Map(), mmW = new Map();
// пробеги: тракт -> {max, cross} (cross = пересечений границы 64 Б внутри пробега)
const runs = new Map();
let cur = null;
function noteRun(pc, a) {
  if (cur && cur.pc === pc && a === cur.last + 1) { cur.len++; cur.last = a;
    if ((a & 63) === 0) cur.cross++; return; }
  flushRun();
  cur = { pc, first: a, last: a, len: 1, cross: 0 };
}
function flushRun() {
  if (!cur) return;
  let r = runs.get(cur.pc);
  if (!r) { r = { max: 0, cross: 0, n: 0 }; runs.set(cur.pc, r); }
  if (cur.len > r.max) r.max = cur.len;
  r.cross += cur.cross; r.n++;
  cur = null;
}

// пул: пик одновременно живых буферов
let alive = new Set(), peak = 0, allocs = 0;
const hist = {};

function instrument(m, SS) {
  const origRead = m.memory.read.bind(m.memory);
  m.memory.write = ((o) => (a, v, st) => {
    const ad = a & 0xffff, pc = m.cpu.pc & 0xffff;
    if (!st) {
      if (ad >= ATTR0 && ad < ATTR1) { attrW.set(pc, (attrW.get(pc) || 0) + 1);
        attrVal.set(v & 0xff, (attrVal.get(v & 0xff) || 0) + 1); }
      if (ad >= MM0 && ad < MM1) { mmW.set(pc, (mmW.get(pc) || 0) + 1); noteRun(pc, ad); }
    }
    return o(a, v, st);
  })(m.memory.write.bind(m.memory));
  m.memory.read = (a, st) => {
    const ad = a & 0xffff, pc = m.cpu.pc & 0xffff;
    if (!st && !(ad >= pc && ad < pc + 3)) {
      if (ad >= ATTR0 && ad < ATTR1) attrR.set(pc, (attrR.get(pc) || 0) + 1);
      if (ad >= MM0 && ad < MM1) { mmR.set(pc, (mmR.get(pc) || 0) + 1); noteRun(pc, ad); }
    }
    return origRead(a, st);
  };
  // выдача буфера и его освобождение: считаем ПИК одновременно занятых страниц
  if (SS.LB655_marked != null) m.onPc(SS.LB655_marked, () => {
    allocs++;
    const ix = m.rd(SS.z80_ix) | (m.rd(SS.z80_ix + 1) << 8);
    alive.add(m.rd(ix + 8));
  });
  // ЗАНЯТОСТЬ ЧИТАЕТСЯ ИЗ ТАБЛИЦЫ БРОНИ, А НЕ СЧИТАЕТСЯ ПО ВЫДАЧАМ. Выдача
  // (LB655) случается один раз на ПОЯВЛЕНИЕ существа, а буфер живёт у его записи
  // сколько угодно тиков; поэтому «страниц, выданных за тик» — мера не того
  // явления: за 4003 тика выдач всего 54, и пик по ней вышел бы 6 просто потому,
  // что чаще одного-двух появлений в тик не бывает. Настоящая занятость —
  // таблица LB676: 16 байт, бит 7 = страница занята. Считаем её каждый тик.
  m.onPc(SS.LD9C0, () => {
    let busy = 0;
    for (let i = 0; i < 16; i++) if (m.rd(SS.LB676 + i) & 0x80) busy++;
    if (busy > peak) peak = busy;
    hist[busy] = (hist[busy] || 0) + 1;
  });
}

let ticks = 0, shark = 0;
for (const [lvl, row, seed] of [[1, null, 0x0167], [4, 9, 0x0167], [3, null, 0x2B1D], [2, null, 0x77A3]]) {
  const g = reachGame(`${DIR}/scuba.rom`, `${DIR}/scubacod1.sym`,
    { cpu: "i8080", level: lvl, seed, preHook: (m, SS) => instrument(m, SS) });
  let t = 0, drawnAt = null;
  g.m.onPc(S.LD9C0, () => { t++; if (row !== null) g.m.wr(S.L5B03 + 1, row); });
  // СПАВН АКУЛЫ: без него пик буферов мерится на мелочи (рецепт из
  // pool_overflow_gate.js — координаты берутся у медузы/круглой рыбы).
  if (S.LB655_marked != null) g.m.onPc(S.LB655_marked, () => {
    const ix = g.m.rd(S.z80_ix) | (g.m.rd(S.z80_ix + 1) << 8);
    const iy = g.m.rd(ix + 0x13) | (g.m.rd(ix + 0x14) << 8);
    if (iy === S.LC0A2 || iy === S.LC0B2) drawnAt = [g.m.rd(ix), g.m.rd(ix + 1)];
    if (iy === S.LC102) shark++;
  });
  g.m.onPc(S.LD9C0, () => {
    if (t % 20 || !drawnAt) return;
    for (const nm of ["RecsAddrII", "RecsAddrIII", "RecsAddrIV"]) {
      const p = S[nm]; if (p == null) continue;
      const b = g.m.rd(p) | (g.m.rd(p + 1) << 8);
      for (let k = 0; k < 10; k++) { const r = b + k * 26;
        if ((g.m.rd(r + 19) | (g.m.rd(r + 20) << 8)) === S.LC102) { g.m.wr(r, drawnAt[0]); g.m.wr(r + 1, drawnAt[1]); } }
    }
  });
  swim(g, { passes: 1, frames: 25, noDeath: true });
  let q = 0; while (t < 1000 && q < 1600) { g.m.step(); q++; }
  ticks += t;
  process.stderr.write(`  уровень ${lvl} сид ${seed.toString(16)}: ${t} тиков\n`);
}
flushRun();
if (!ticks) { console.log("ПУСТАЯ ВЫБОРКА"); process.exit(1); }

const top = (mm, n) => [...mm.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
console.log(`БЮДЖЕТ: ${DIR}, тиков ${ticks}, выдач буфера ${allocs}, выдач акуле ${shark}`);

console.log("");
console.log(`--- (A) SCRATTR ${"0x" + ATTR0.toString(16)}..${"0x" + ATTR1.toString(16)} (1024 Б) ---`);
console.log(`  писателей ${attrW.size}, читателей ${attrR.size}`);
for (const [pc, n] of top(attrW, 8)) console.log(`    пишет  ${near(pc).padEnd(22)} ${n}`);
for (const [pc, n] of top(attrR, 8)) console.log(`    читает ${near(pc).padEnd(22)} ${n}`);
const vals = [...attrVal.entries()].sort((a, b) => b[1] - a[1]);
console.log(`  РАЗЛИЧНЫХ ЗНАЧЕНИЙ ЗАПИСАНО: ${vals.length}`);
for (const [v, n] of vals.slice(0, 12))
  console.log(`    0x${v.toString(16).padStart(2, "0")}  ${String(n).padStart(8)} записей`);

console.log("");
console.log(`--- (B) MiniMap ${"0x" + MM0.toString(16)}..${"0x" + MM1.toString(16)} (1024 Б) ---`);
console.log(`  писателей ${mmW.size}, читателей ${mmR.size}`);
console.log("  тракт                    обращений  макс.пробег  пересечений границы 64 Б");
const all = new Map();
for (const [pc, n] of mmR) all.set(pc, (all.get(pc) || 0) + n);
for (const [pc, n] of mmW) all.set(pc, (all.get(pc) || 0) + n);
let crossTot = 0, longest = 0;
for (const [pc, n] of [...all.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14)) {
  const r = runs.get(pc) || { max: 1, cross: 0 };
  crossTot += r.cross; if (r.max > longest) longest = r.max;
  console.log(`  ${near(pc).padEnd(24)} ${String(n).padStart(9)}  ${String(r.max).padStart(11)}  ${String(r.cross).padStart(10)}`);
}
console.log(`  САМЫЙ ДЛИННЫЙ ПРОБЕГ ПО КАРТЕ: ${longest} Б; пересечений границы 64 Б у топ-14 трактов: ${crossTot}`);

console.log("");
console.log(`--- (C) ПУЛ: пик страниц, выданных за один игровой тик ---`);
console.log(`  ПИК ЗАНЯТЫХ СТРАНИЦ ПО ТАБЛИЦЕ БРОНИ LB676: ${peak} из 16 ` +
            `(выдач всего ${allocs}, из них акуле ${shark})`);
console.log("  распределение занятости по тикам:");
for (const k of Object.keys(hist).sort((a, b) => +a - +b))
  console.log(`    ${String(k).padStart(2)} страниц занято — ${hist[k]} тиков`);
