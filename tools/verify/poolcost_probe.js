// ЦЕНА ФИКСА ЧЕТВЁРОК НА СЦЕНЕ С АКУЛОЙ И БЕЗ.
//
// Темп «тиков главного цикла на кадр» — та же величина, что у tempo_probe, но
// на сцене со спавном акулы: без акулы четвёрки не выдаются вовсе, и цена
// правки на такой сцене не видна по построению.
//
//   node tools/verify/poolcost_probe.js <каталог> [ещё каталоги...]
//   PC_FRAMES=600  PC_LEVELS=1,4  PC_SPAWN=0
"use strict";
const { readSym } = require("./harness.js");
const { reachGame, swim } = require("./drive.js");
const dirs = process.argv.slice(2);
if (!dirs.length) { console.log("укажи каталоги сборок"); process.exit(2); }
const FRAMES = Number(process.env.PC_FRAMES || 600);
const LEVELS = (process.env.PC_LEVELS || "1,4").split(",").map(Number);
const SPAWN = process.env.PC_SPAWN !== "0";

for (const dir of dirs) for (const lvl of LEVELS) {
  const S = readSym(`${dir}/scubacod1.sym`);
  let drawnAt = null, t = 0, quads = 0;
  const g = reachGame(`${dir}/scuba.rom`, `${dir}/scubacod1.sym`,
    { cpu: "i8080", level: lvl, seed: 0x0167 });
  g.m.onPc(S.LD9C0, () => { t++; });
  g.m.onPc(S.LB655_marked, () => {
    const ix = g.m.rd(S.z80_ix) | (g.m.rd(S.z80_ix + 1) << 8);
    const iy = g.m.rd(ix + 0x13) | (g.m.rd(ix + 0x14) << 8);
    if (iy === S.LC0A2 || iy === S.LC0B2) drawnAt = [g.m.rd(ix), g.m.rd(ix + 1)];
    const hi = g.m.rd(ix + 8); if (hi >= 0xa0 && hi < 0xb0) quads++;
  });
  if (SPAWN) g.m.onPc(S.LD9C0, () => {
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
  const f0 = g.m.frame, t0 = t;
  while (g.m.frame - f0 < FRAMES) g.m.step();
  const dt = t - t0, df = g.m.frame - f0;
  console.log(`${dir}  ур.${lvl} ${SPAWN ? "СО СПАВНОМ АКУЛЫ" : "без спавна"}: ` +
              `темп ${(dt / df).toFixed(4)} тик/кадр (${dt} тиков за ${df} кадров), ` +
              `выдач четвёрок ${quads}`);
}
