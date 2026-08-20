// ПЕРЕПИСЬ ПЛОСКОСТЕЙ: кто из трактов в какую плоскость пишет и какой индекс
// палитры этим получает. ТОЛЬКО ЗАМЕР.
//
// Зачем. Вопрос «можно ли раскрасить игру одной палитрой, без третьей плоскости»
// сводится к одному измеримому: РАЗВЕДЕНЫ ЛИ КЛАССЫ ОБЪЕКТОВ ПО ИНДЕКСАМ уже
// сегодня. Индекс пикселя на Векторе набирается битами плоскостей, а палитра в
// этой игре повторяется каждые 4 слота (PaletteGame: четыре одинаковые
// четвёрки), значит значащих бита ДВА и доступных чернил ТРИ.
//
// КАК СЧИТАЕТСЯ ИНДЕКС (взято из vector06js, а не из головы):
//   Memory.tobank: байт слова = (адрес>>13)&3, то есть 0x8000->0, 0xA000->1,
//   0xC000->2, 0xE000->3;
//   PixelFiller.shiftOutPixels: modeless = (p>>4&8)|(p>>13&4)|(p>>22&2)|(p>>31&1),
//   то есть байт0 (0x8000) даёт бит 3, байт1 (0xA000) — бит 2, байт2 (0xC000) —
//   бит 1, байт3 (0xE000) — бит 0.
// Итого при палитре с периодом 4 видимы только два младших бита:
//   индекс 0 — ни одной плоскости      -> PaletteGame[0]
//   индекс 1 — только 0xE000           -> PaletteGame[1]
//   индекс 2 — только 0xC000           -> PaletteGame[2]
//   индекс 3 — обе                     -> PaletteGame[3]
// Плоскости 0x8000 и 0xA000 в этой палитре НЕВИДИМЫ.
//
// МЕРА. Каждая запись в 0x8000..0xFFFF приписывается PC, который её сделал, и
// плоскости по старшим битам адреса. Записи транспорта (dzx0 на буте и
// раскладка ZoneCopy) считаются отдельным классом: это укладка, а не рисование.
// Отдельно считается, какие пиксельные БИТЫ реально ставятся: тракт может писать
// в плоскость нули (гашение) — тогда цвета он не даёт. Поэтому для каждой записи
// смотрится не только адрес, но и то, добавила ли она единичных битов.
//
//   node tools/verify/plane_census.js [каталог]
//   PC_JSON=file.json — выгрузить таблицу
"use strict";
const fs = require("fs"), path = require("path");
const { readSym } = require("./harness.js");
const { reachGame, swim, KEY } = require("./drive.js");
const ROOT = path.resolve(__dirname, "../..");
const B = process.env.BUILD_DIR || "build";
const DIR = process.argv[2] || `${ROOT}/${B}/ev`;
for (const f of ["scuba.rom", "scubacod1.sym", "scubacod0.sym"])
  if (!fs.existsSync(`${DIR}/${f}`)) { console.log(`нет ${DIR}/${f}`); process.exit(2); }
const S = Object.assign({}, readSym(`${DIR}/scubacod0.sym`), readSym(`${DIR}/scubacod1.sym`));
const labs = Object.entries(S).filter(([, v]) => v >= 0x100 && v < 0xB000).sort((a, b) => a[1] - b[1]);
const near = pc => { let x = null; for (const [n, v] of labs) { if (v <= pc) x = [n, v]; else break; }
                     return x ? (pc - x[1] ? `${x[0]}+${pc - x[1]}` : x[0]) : "?"; };

// tract -> {plane: {writes, setBits, clrBits}}
const stat = new Map();
function note(pc, plane, added, cleared) {
  let t = stat.get(pc);
  if (!t) { t = [0, 1, 2, 3].map(() => ({ w: 0, set: 0, clr: 0 })); stat.set(pc, t); }
  t[plane].w++; t[plane].set += added; t[plane].clr += cleared;
}

function popcnt(x) { let n = 0; while (x) { n += x & 1; x >>= 1; } return n; }

function instrument(m) {
  const o = m.memory.write.bind(m.memory);
  const rd = m.memory.read.bind(m.memory);
  m.memory.write = (a, v, st) => {
    const ad = a & 0xffff;
    // ТОЛЬКО ВИДИМЫЕ ПЛОСКОСТИ 0xC000..0xFFFF. Диапазон 0x8000..0xBFFF — это
    // физически плоскости 0 и 1, но в них лежат КОД и буферы save-under, а не
    // пиксели: палитра игры повторяется каждые четыре слота, и оба старших бита
    // индекса не значат ничего. Первый заход считал их наравне, и верх таблицы
    // заняли рабочие ячейки библиотеки рекомпиляции (il_a, il_hl, z80_ix) —
    // 92 658 «записей в плоскость» у z80_cp_Y. Мера была шире явления ровно на
    // весь код.
    if (!st && ad >= 0xC000) {
      const plane = (ad >> 13) & 3;
      const old = rd(ad, false) & 0xff, nv = v & 0xff;
      note(m.cpu.pc & 0xffff, plane, popcnt(nv & ~old), popcnt(old & ~nv));
    }
    return o(a, v, st);
  };
}

const SCENES = [
  ["уровень 1 заплыв", 1, null],
  ["уровень 4 глубина", 4, 9],
];
let ticks = 0;
for (const [nm, lvl, row] of SCENES) {
  const g = reachGame(`${DIR}/scuba.rom`, `${DIR}/scubacod1.sym`,
    { cpu: "i8080", level: lvl, seed: 0x0167, preHook: (m) => instrument(m) });
  let t = 0;
  g.m.onPc(S.LD9C0, () => { t++; if (row !== null) g.m.wr(S.L5B03 + 1, row); });
  swim(g, { passes: 1, frames: 30, noDeath: true });
  let q = 0; while (t < 1200 && q < 2000) { g.m.step(); q++; }
  ticks += t;
  process.stderr.write(`  ${nm}: ${t} тиков\n`);
}
if (!ticks) { console.log("ПУСТАЯ ВЫБОРКА: ни одного тика"); process.exit(1); }

// --- свод по трактам ---------------------------------------------------------
const PLANE = ["0x8000 (код)", "0xA000 (буферы)", "0xC000 -> индекс 2", "0xE000 -> индекс 1"];
const rows = [...stat.entries()].map(([pc, t]) => ({ pc, name: near(pc), t,
  total: t.reduce((s, x) => s + x.w, 0) })).sort((a, b) => b.total - a.total);

console.log(`ПЕРЕПИСЬ ПЛОСКОСТЕЙ: ${DIR}, тиков ${ticks}`);
console.log("");
console.log("  тракт (PC)                    всего    0xC000    0xE000   индексы");
for (const r of rows) {
  if (r.total < 32) continue;
  const c = r.t[2].w > 0, e = r.t[3].w > 0;
  const idx = c && e ? "1+2 (и 3 на пересечении)" : c ? "2" : e ? "1" : "невидимые";
  console.log(`  ${r.name.padEnd(28)} ${String(r.total).padStart(7)}  ` +
              `${String(r.t[2].w).padStart(8)}  ${String(r.t[3].w).padStart(8)}   ${idx}`);
}
console.log("");
console.log("  «set» — сколько единичных битов тракт ДОБАВИЛ (то есть зажёг пикселей),");
console.log("  «clr» — сколько погасил. Тракт, у которого set=0, цвета не даёт вовсе.");
console.log("  тракт (PC)                    0xC000 set/clr        0xE000 set/clr");
for (const r of rows) {
  if (r.total < 32) continue;
  console.log(`  ${r.name.padEnd(28)} ${String(r.t[2].set).padStart(9)}/${String(r.t[2].clr).padEnd(9)}  ` +
              `${String(r.t[3].set).padStart(9)}/${String(r.t[3].clr).padEnd(9)}`);
}

// --- ГИСТОГРАММА ИНДЕКСОВ НА ЖИВОМ ЭКРАНЕ ------------------------------------
// Сколько пикселей на поле какого чернила. Считается по СНИМКУ видеопамяти в
// конце сцены: индекс = (бит 0xC000)*2 + (бит 0xE000). Поле под -DGEOM — это
// экранные строки 64..255, то есть младшие байты 0..191 столбцов 4..27.
{
  const g = reachGame(`${DIR}/scuba.rom`, `${DIR}/scubacod1.sym`,
    { cpu: "i8080", level: 4, seed: 0x0167 });
  let t = 0; g.m.onPc(S.LD9C0, () => { t++; g.m.wr(S.L5B03 + 1, 9); });
  swim(g, { passes: 1, frames: 30, noDeath: true });
  let q = 0; while (t < 900 && q < 1500) { g.m.step(); q++; }
  const hist = [0, 0, 0, 0];
  let overRelief = 0, spriteBits = 0;
  for (let col = 4; col < 28; col++) for (let lo = 0; lo < 192; lo++) {
    const c = g.m.rd(0xC000 + col * 256 + lo), e = g.m.rd(0xE000 + col * 256 + lo);
    for (let b = 0; b < 8; b++) {
      const bc = (c >> b) & 1, be = (e >> b) & 1;
      hist[bc * 2 + be]++;
    }
  }
  const tot = hist.reduce((a, b) => a + b, 0);
  console.log("");
  console.log(`ГИСТОГРАММА ЧЕРНИЛ НА ПОЛЕ (снимок на тике ${t}, всего ${tot} пикселей):`);
  const NM = ["0 — фон (ни одной плоскости)", "1 — только 0xE000", "2 — только 0xC000", "3 — обе плоскости"];
  for (let i = 0; i < 4; i++)
    console.log(`  индекс ${NM[i].padEnd(30)} ${String(hist[i]).padStart(7)} px  ${(100 * hist[i] / tot).toFixed(2)} %`);
}

if (process.env.PC_JSON)
  fs.writeFileSync(process.env.PC_JSON, JSON.stringify(rows, null, 1));
