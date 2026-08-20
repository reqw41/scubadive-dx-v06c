// КТО ХОДИТ ПО КРУПНОМУ БУФЕРУ: перепись трактов, которые придётся чинить.
//
// Вопрос: сколько мест в коде обходят буфер save-under как СПЛОШНОЙ массив
// rows*rowsize. Каждое такое место при переезде буфера в четвёрку ломтей
// (64 Б на страницу, дальше разрыв в 192 Б) обязано получить перенос курсора —
// иначе оно уйдёт в видимое поле.
//
// Мера узкая по построению: считаются ЗАПИСИ И ЧТЕНИЯ по адресу внутри
// [база, база+размер) ВЫДАННОГО буфера, база и размер берутся там же, где их
// берёт игра ((IX+7)/(IX+8) и шаблон (IY+$09)*(IY+$0A)). Чужие тракты в окно
// не попадают: окно — ровно буфер, а не 256 байт от базы.
//
//   node tools/verify/pooltract_probe.js
"use strict";
const fs = require("fs"), path = require("path");
const { readSym } = require("./harness.js");
const { reachGame, swim } = require("./drive.js");
const ROOT = path.resolve(__dirname, "../..");
const B = process.env.BUILD_DIR || "build";
const DIR = process.env.PT_DIR || `${ROOT}/${B}/ev`;
const S = readSym(`${DIR}/scubacod1.sym`);
const LEVELS = (process.env.PT_LEVELS || "1,4").split(",").map(Number);
const SEEDS = (process.env.PT_SEEDS || "0x0167,0x2B1D").split(",").map(Number);
const TICKS = Number(process.env.PT_TICKS || 900);

const names = Object.entries(S).sort((a, b) => b[1] - a[1]);
const near = (pc) => { const e = names.find(([, v]) => v <= pc); return e ? `${e[0]}+${pc - e[1]}` : "?"; };

const bigW = new Map(), bigR = new Map(), smallW = new Map();
let ticks = 0, noBuf = 0, bigAllocs = 0;

function run(level, seed) {
  const bufs = new Map();   // база -> {size, big}
  let drawnAt = null;
  const g = reachGame(`${DIR}/scuba.rom`, `${DIR}/scubacod1.sym`,
    { cpu: "i8080", level, seed, preHook: (m, SS) => {
      m.onPc(SS.LB655_marked, () => {
        const ix = m.rd(SS.z80_ix) | (m.rd(SS.z80_ix + 1) << 8);
        const iy = m.rd(ix + 0x13) | (m.rd(ix + 0x14) << 8);
        const size = m.rd(iy + 9) * m.rd(iy + 10);
        const base = m.rd(ix + 7) | (m.rd(ix + 8) << 8);
        bufs.set(base, { size, big: size > 48 });
        if (size > 48) bigAllocs++;
      });
      // ПУТЬ «ПУЛ ИСЧЕРПАН»: LB646 не нашёл свободного индекса и ставит бит 7
      // в (IX+$0D). Это ШТАТНАЯ ветка игры — считаем, как часто она работает.
      if (SS.LB646_full != null) m.onPc(SS.LB646_full, () => { noBuf++; });
      const ow = m.memory.write.bind(m.memory);
      m.memory.write = (a, v, st) => { a &= 0xffff;
        const pc = m.cpu.pc & 0xffff;
        for (const [base, r] of bufs) { const d = (a - base) & 0xffff;
          if (d < r.size) { const t = r.big ? bigW : smallW;
                            t.set(pc, (t.get(pc) || 0) + 1); } }
        return ow(a, v, st); };
      const or = m.memory.read.bind(m.memory);
      m.memory.read = (a, st) => { a &= 0xffff;
        const pc = m.cpu.pc & 0xffff;
        if (a !== pc) for (const [base, r] of bufs) { const d = (a - base) & 0xffff;
          if (d < r.size && r.big) bigR.set(pc, (bigR.get(pc) || 0) + 1); }
        return or(a, st); }; } });
  let t = 0; g.m.onPc(S.LD9C0, () => { t++; });
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
  swim(g, { passes: 1, frames: 20, noDeath: true });
  let q = 0; while (t < TICKS && q < 6000) { g.m.step(); q++; }
  return t;
}

for (const lvl of LEVELS) for (const sd of SEEDS) ticks += run(lvl, sd);
const show = (t, ttl) => { console.log(`  ${ttl}:`);
  const s = [...t.entries()].sort((a, b) => b[1] - a[1]);
  if (!s.length) { console.log("      нет"); return; }
  for (const [pc, n] of s.slice(0, 14))
    console.log(`      ${near(pc).padEnd(20)} ${String(n).padStart(7)}  ${(n / ticks).toFixed(2)}/тик`); };
console.log(`ТРАКТЫ БУФЕРА: ${DIR}, уровни ${LEVELS.join(",")}, сидов ${SEEDS.length}, тиков ${ticks}`);
console.log(`  выдач крупных буферов: ${bigAllocs}, отказов пула (пул исчерпан): ${noBuf}`);
show(bigW, "ЗАПИСИ внутрь КРУПНОГО буфера");
show(bigR, "ЧТЕНИЯ из КРУПНОГО буфера");
show(smallW, "записи внутрь мелкого буфера (для сравнения)");
