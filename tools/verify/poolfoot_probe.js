// ФАКТИЧЕСКИЙ СЛЕД БУФЕРА SAVE-UNDER, МЕРЕННЫЙ ОПЕРАЦИЕЙ ЦЕЛИКОМ.
//
// Зачем ещё одна мера. Раздел 35 плана вывел «след акулы = 64 Б = один ломоть»
// из меры «серии записей, начавшиеся внутри первых 48 байт буфера». У этой меры
// есть системный изъян, зеркальный уроку №29: под -DZONE чистка буфера идёт
// ПО СТРОКАМ ЗНАКОМЕСТ, и между строками курсор переносится на СЛЕДУЮЩИЙ ломоть
// (PoolRowFwd). Значит вторая и последующие строки НАЧИНАЮТСЯ вне окна «первые
// 48 байт», в счёт не идут, и мера видит ровно ОДНУ СТРОКУ — то есть (IY+$0A),
// а не весь буфер.
//
// Мера здесь другая и без окна вовсе: считается ВСЯ операция чистки целиком.
// Чистка буфера — цикл LB48D/LB48E: C=(IY+$09) раз по L=(IY+$0A) байт, ровно
// размер буфера. Крючок на LB470 открывает сессию (кто чистится и какой у него
// шаблонный габарит), записи из тела цикла считаются до конца сессии.
//
// Печатается по типам: габарит шаблона (IY+$09)x(IY+$0A), сколько байт реально
// записала чистка, сколько РАЗНЫХ страниц она задела и какие смещения.
//
//   node tools/verify/poolfoot_probe.js
//   PF_DIR=build/gzref  PF_LEVELS=1,4  PF_SEEDS=0x0167  PF_TICKS=900
"use strict";
const fs = require("fs"), path = require("path");
const { readSym } = require("./harness.js");
const { reachGame, swim } = require("./drive.js");
const ROOT = path.resolve(__dirname, "../..");
const B = process.env.BUILD_DIR || "build";
const DIR = process.env.PF_DIR || `${ROOT}/${B}/ev`;
for (const f of ["scuba.rom", "scubacod1.sym"])
  if (!fs.existsSync(`${DIR}/${f}`)) { console.log(`нет ${DIR}/${f}`); process.exit(2); }
const S = readSym(`${DIR}/scubacod1.sym`);
for (const n of ["LB470", "LB48E", "LB655_marked", "LD9C0", "LC092"])
  if (S[n] == null) { console.log(`нет метки ${n} в .sym`); process.exit(2); }
const LEVELS = (process.env.PF_LEVELS || "1,4").split(",").map(Number);
const SEEDS = (process.env.PF_SEEDS || "0x0167,0x2B1D,0x77A3,0x0C55").split(",").map(Number);
const TICKS = Number(process.env.PF_TICKS || 900);

// Имена шаблонов — из исходника (метка + комментарий строки).
const codb = fs.readFileSync(path.join(ROOT, "src8080", "scubacodb.asm"), "utf8").split("\n");
const TPL = new Map();
for (let i = 0; i < codb.length; i++) {
  const m = codb[i].match(/^(LC[0-9A-Fa-f]{3})\s+DEFW/);
  if (!m || S[m[1]] == null) continue;
  let nm = (codb[i].match(/;\s*(.+?)\s*$/) || [])[1];
  if (!nm && codb[i + 1]) nm = (codb[i + 1].match(/;\s*(.+?)\s*$/) || [])[1];
  TPL.set(S[m[1]], nm || m[1]);
}
const tname = (a) => TPL.get(a) || "0x" + a.toString(16);

const stat = new Map();   // тип -> {n, rows, rsz, tpl, maxBytes, maxPages, minOff, maxOff, base}
let sessions = 0, allocs = 0, noBuf = 0;
const STATIC = [];

function run(level, seed) {
  let cur = null;
  const flush = () => {
    if (!cur || !cur.bytes) { cur = null; return; }
    sessions++;
    const e = stat.get(cur.nm) || { n: 0, rows: cur.rows, rsz: cur.rsz, tpl: cur.rows * cur.rsz,
                                    maxBytes: 0, maxPages: 0, minOff: 255, maxOff: 0, base: cur.base };
    e.n++;
    if (cur.bytes > e.maxBytes) e.maxBytes = cur.bytes;
    if (cur.pages.size > e.maxPages) e.maxPages = cur.pages.size;
    e.minOff = Math.min(e.minOff, cur.minOff); e.maxOff = Math.max(e.maxOff, cur.maxOff);
    stat.set(cur.nm, e); cur = null;
  };
  const g = reachGame(`${DIR}/scuba.rom`, `${DIR}/scubacod1.sym`,
    { cpu: "i8080", level, seed, preHook: (m, SS) => {
      m.onPc(SS.LB655_marked, () => { allocs++; });
      if (SS.LB646_none != null) m.onPc(SS.LB646_none, () => { noBuf++; });
      m.onPc(SS.LB470, () => {
        flush();
        const ix = m.rd(SS.z80_ix) | (m.rd(SS.z80_ix + 1) << 8);
        const iy = m.rd(ix + 0x13) | (m.rd(ix + 0x14) << 8);
        cur = { nm: tname(iy), rows: m.rd(iy + 9), rsz: m.rd(iy + 10),
                base: m.rd(ix + 8) * 256 + m.rd(ix + 7),
                bytes: 0, pages: new Set(), minOff: 255, maxOff: 0 };
      });
      const o = m.memory.write.bind(m.memory);
      m.memory.write = (a, v, st) => { a &= 0xffff;
        const pc = m.cpu.pc & 0xffff;
        if (cur && pc >= SS.LB48E && pc <= SS.LB48E + 3) {
          cur.bytes++; cur.pages.add(a >> 8);
          cur.minOff = Math.min(cur.minOff, a & 0xff); cur.maxOff = Math.max(cur.maxOff, a & 0xff);
        }
        return o(a, v, st); }; } });
  let t = 0; g.m.onPc(S.LD9C0, () => { t++; });
  // ПОДСАДКА КООРДИНАТ АКУЛАМ — тем же приёмом, что в pool_overflow_gate:
  // без неё сцена до акулы не доходит, а она и есть предмет спора.
  let drawnAt = null;
  g.m.onPc(S.LB655_marked, () => {
    const ix = g.m.rd(S.z80_ix) | (g.m.rd(S.z80_ix + 1) << 8);
    const iy = g.m.rd(ix + 0x13) | (g.m.rd(ix + 0x14) << 8);
    if (iy === S.LC0A2 || iy === S.LC0B2) drawnAt = [g.m.rd(ix), g.m.rd(ix + 1)];
  });
  g.m.onPc(S.LD9C0, () => {
    if (t % 30 || !drawnAt) return;
    for (const nm of ["RecsAddrII", "RecsAddrIII", "RecsAddrIV"]) {
      const p = S[nm]; if (p == null) continue;
      const b = g.m.rd(p) | (g.m.rd(p + 1) << 8);
      for (let k = 0; k < 8; k++) { const r = b + k * 26;
        if ((g.m.rd(r + 19) | (g.m.rd(r + 20) << 8)) === S.LC102) {
          g.m.wr(r, drawnAt[0]); g.m.wr(r + 1, drawnAt[1]); } }
    }
  });
  if (!STATIC.length) for (const [a, n] of TPL) {
    const w = g.m.rd(a + 9), r = g.m.rd(a + 10);
    if (w && r && w < 16 && r <= 64) STATIC.push({ n, w, r, size: w * r });
  }
  swim(g, { passes: 1, frames: 20, noDeath: true });
  let q = 0; while (t < TICKS && q < 6000) { g.m.step(); q++; }
  flush();
  return t;
}

let ticks = 0;
for (const lvl of LEVELS) for (const sd of SEEDS) ticks += run(lvl, sd);

console.log(`СЛЕД БУФЕРА: ${DIR}, уровни ${LEVELS.join(",")}, сидов ${SEEDS.length}, тиков ${ticks}`);
console.log(`выдач ${allocs}, сессий чистки ${sessions}, страховок ${noBuf}`);
console.log("");
console.log("ТАБЛИЦА ШАБЛОНОВ (статически, из памяти образа):");
console.log("  тип                          строк  размер строки  размер буфера");
for (const t of STATIC.sort((a, b) => b.size - a.size))
  console.log(`  ${t.n.padEnd(28)} ${String(t.w).padStart(3)}   ${String(t.r).padStart(9)}   ${String(t.size).padStart(8)}`);
console.log("");
console.log("ЧТО ЧИСТКА РЕАЛЬНО ЗАПИСАЛА (операция целиком, без окна):");
console.log("  тип                          сессий  габарит  записано  страниц  смещения");
for (const [n, e] of [...stat.entries()].sort((a, b) => b[1].maxBytes - a[1].maxBytes))
  console.log(`  ${n.padEnd(28)} ${String(e.n).padStart(5)}  ${String(e.rows) + "x" + String(e.rsz)}=${String(e.tpl).padStart(4)}` +
              `  ${String(e.maxBytes).padStart(7)}  ${String(e.maxPages).padStart(6)}   ${e.minOff}..${e.maxOff}`);
const bad = [...stat.entries()].filter(([, e]) => e.maxBytes !== e.tpl);
console.log("");
console.log(bad.length ? `РАСХОЖДЕНИЙ С ГАБАРИТОМ: ${bad.length}` : "записано ровно rows*rowsize у всех типов выборки");
if (!sessions) { console.log("ПУСТАЯ ВЫБОРКА"); process.exit(2); }
