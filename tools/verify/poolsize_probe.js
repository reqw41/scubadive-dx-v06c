// РАЗМЕРЫ БУФЕРОВ SAVE-UNDER И ПИК ОДНОВРЕМЕННЫХ КРУПНЫХ.
//
// Вопрос, от которого зависит бюджет четвёрок: сколько буферов КРУПНЕЕ 48 Б
// игра держит выданными ОДНОВРЕМЕННО. Размер известен статически: буфер
// чистится циклом LB48D/LB48E как C=(IY+$09) раз по L=(IY+$0A) байт, то есть
// размер = (IY+$09)*(IY+$0A). IY — запись области LC092, её адрес лежит в
// (IX+$13)/(IX+$14).
//
// Занятость берётся не по PC, а по ТАБЛИЦЕ LB676: бит 7 элемента i = «индекс i
// занят». Установка бита = выдача, снятие = освобождение. Мера не зависит от
// того, какие метки я угадал, и ловит освобождение из любого места.
// Индексы 0 и 13..15 забронированы навсегда (LBEC7) и в счёт не идут.
//
//   node tools/verify/poolsize_probe.js
//   PS_SPAWN=0   — без подсадки координат акулам (естественная выборка)
"use strict";
const fs = require("fs"), path = require("path");
const { readSym } = require("./harness.js");
const { reachGame, swim } = require("./drive.js");
const ROOT = path.resolve(__dirname, "../..");
const B = process.env.BUILD_DIR || "build";
const DIR = process.env.PS_DIR || `${ROOT}/${B}/ev`;
const S = readSym(`${DIR}/scubacod1.sym`);
for (const n of ["LB655_marked", "LB676", "LD9C0", "LC092"])
  if (S[n] == null) { console.log(`нет метки ${n}`); process.exit(2); }
const LEVELS = (process.env.PS_LEVELS || "1,2,3,4").split(",").map(Number);
const SEEDS = (process.env.PS_SEEDS || "0x0167,0x2B1D,0x77A3,0x0C55").split(",").map(Number);
const TICKS = Number(process.env.PS_TICKS || 900);
const SPAWN = process.env.PS_SPAWN !== "0";
const QUADS = Number(process.env.PS_QUADS || 4);   // сколько четвёрок в бюджете

// Имена шаблонов области LC092 берём из исходника: метка + комментарий строки,
// в которой она объявлена (или следующей — у существ со спрайтовым хвостом).
const codb = fs.readFileSync(path.join(ROOT, "src8080", "scubacodb.asm"), "utf8").split("\n");
const TPL = new Map();
for (let i = 0; i < codb.length; i++) {
  const m = codb[i].match(/^(LC[0-9A-Fa-f]{3})\s+DEFW/);
  if (!m || S[m[1]] == null) continue;
  let nm = (codb[i].match(/;\s*(.+?)\s*$/) || [])[1];
  if (!nm && codb[i + 1]) nm = (codb[i + 1].match(/;\s*(.+?)\s*$/) || [])[1];
  TPL.set(S[m[1]], nm || m[1]);
}
if (TPL.size < 10) { console.log(`шаблонов найдено ${TPL.size} — разбор таблицы врёт`); process.exit(2); }
const tname = (a) => TPL.get(a) || "0x" + a.toString(16);

const sizes = new Map();
const peakBig = { v: 0, when: "-" };
const histBig = new Map();
const idxOfBig = new Map();
let allocs = 0, bigAllocs = 0, noBuf = 0, wouldStarve = 0, quadPeak = 0;
const STATIC = new Map();

function run(level, seed) {
  const busy = new Map();
  let last = null, drawnAt = null, quadBusy = 0;
  const g = reachGame(`${DIR}/scuba.rom`, `${DIR}/scubacod1.sym`,
    { cpu: "i8080", level, seed, preHook: (m, SS) => {
      m.onPc(SS.LB655_marked, () => {
        const ix = m.rd(SS.z80_ix) | (m.rd(SS.z80_ix + 1) << 8);
        const iy = m.rd(ix + 0x13) | (m.rd(ix + 0x14) << 8);
        const w = m.rd(iy + 9), r = m.rd(iy + 10), size = w * r, nm = tname(iy);
        const idx = m.cpu.regs[7] & 0x0f;
        last = { idx, size, nm };
        allocs++;
        sizes.set(nm, `${w} x ${r} = ${size}`);
        if (size > 48) { bigAllocs++;
          idxOfBig.set(idx, (idxOfBig.get(idx) || 0) + 1);
          // МОДЕЛЬ ПЛАНА: индекс 1 -> полная страница 0xB100; крупный с индексом
          // >= 2 берёт четвёрку; четвёрок нет -> страховка (существо не рисуется).
          if (idx >= 2) { if (quadBusy >= QUADS) wouldStarve++;
                          else { quadBusy++; if (quadBusy > quadPeak) quadPeak = quadBusy; } }
        }
      });
      const o = m.memory.write.bind(m.memory);
      m.memory.write = (a, v, st) => { a &= 0xffff;
        if (a >= SS.LB676 && a < SS.LB676 + 16) {
          const i = a - SS.LB676, was = busy.has(i);
          if (i !== 0 && i < 13) {
            if (v & 0x80) { if (!was) busy.set(i, last && last.idx === i ? last : { size: -1, nm: "?" }); }
            else if (was) { const b = busy.get(i); busy.delete(i);
                            if (b.size > 48 && i >= 2 && quadBusy > 0) quadBusy--; }
            let big = 0; for (const [, b] of busy) if (b.size > 48) big++;
            histBig.set(big, (histBig.get(big) || 0) + 1);
            if (big > peakBig.v) { peakBig.v = big;
              peakBig.when = `ур.${level} сид 0x${seed.toString(16)}: ` +
                [...busy.entries()].filter(([, b]) => b.size > 48)
                  .map(([i, b]) => `${i}:${b.nm}(${b.size})`).join(", "); }
          }
        }
        return o(a, v, st); }; } });
  let t = 0;
  g.m.onPc(S.LD9C0, () => { t++;
    if (t === 1 && !STATIC.size)
      for (const [a, n] of TPL) { const w = g.m.rd(a + 9), r = g.m.rd(a + 10);
        STATIC.set(a, `${n.padEnd(26)} ${w} x ${String(r).padStart(2)} = ${String(w * r).padStart(3)} Б` +
                      (w * r > 48 ? "   КРУПНЫЙ" : "")); }
  });
  // ПУЛ ИСЧЕРПАН: LB646 не нашёл свободного индекса и ставит бит 7 в (IX+$0D).
  if (S.LB646 != null) g.m.onPc(S.LB646, () => {});
  if (SPAWN) {
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
  }
  swim(g, { passes: 1, frames: 20, noDeath: true });
  let q = 0; while (t < TICKS && q < 6000) { g.m.step(); q++; }
  return t;
}

let ticks = 0;
for (const lvl of LEVELS) for (const sd of SEEDS) ticks += run(lvl, sd);
console.log(`РАЗМЕРЫ БУФЕРОВ: ${DIR}, уровни ${LEVELS.join(",")}, сидов ${SEEDS.length}, ` +
            `тиков ${ticks}, подсадка акул ${SPAWN ? "ДА" : "нет"}`);
console.log(`  выдач ${allocs}, из них крупнее 48 Б: ${bigAllocs}`);
console.log(`  наблюдённые размеры:`);
for (const [n, s] of [...sizes.entries()].sort()) console.log(`      ${n.padEnd(28)} ${s}`);
console.log(`  ПИК одновременных крупных (>48 Б): ${peakBig.v}`);
console.log(`      ${peakBig.when}`);
console.log(`  распределение числа одновременных крупных:`);
for (const [k, v] of [...histBig.entries()].sort((a, b) => a[0] - b[0]))
  console.log(`      ${String(k).padStart(2)} — ${v} наблюдений`);
console.log(`  индексы, достающиеся крупным: ` +
  [...idxOfBig.entries()].sort((a, b) => a[0] - b[0]).map(([i, n]) => `${i}: ${n}`).join(", "));
console.log(`  МОДЕЛЬ ПЛАНА (${QUADS} четвёрки): пик занятых четвёрок ${quadPeak}, ` +
            `страховок (крупный без четвёрки) ${wouldStarve} из ${bigAllocs}`);
console.log(`  СТАТИЧЕСКИ по таблице шаблонов (память образа на первом тике):`);
for (const [a, n] of [...STATIC.entries()].sort((x, y) => x[0] - y[0]))
  console.log(`      0x${a.toString(16)} ${n}`);
