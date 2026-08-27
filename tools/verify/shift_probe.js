// Проба геометрии сдвига спрайта (LB3A0): совпадает ли размер сдвигаемого буфера
// (IY+0D) с объёмом копии (w+1)*rows + w, и распределение величин сдвига k.
//   node tools/verify/shift_probe.js <rom> <sym> [level] [ticks]
"use strict";
const { reachGame, KEY } = require("./drive.js");
const { SCENARIOS } = require("./oracle.js");
const [rom, sym] = process.argv.slice(2, 4);
const LVL = parseInt(process.argv[4] || "1", 10), NT = parseInt(process.argv[5] || "800", 10);
const g = reachGame(rom, sym, { cpu: "i8080", level: LVL, seed: 0x0167 });
const S = g.S, m = g.m;
const geom = new Map(), kdist = new Map(); let calls = 0, mism = 0, bytes = 0, ex = [];
m.onPc(S.LB3E9, () => {
  const iy = m.rdw(S.z80_iy), ix = m.rdw(S.z80_ix);
  const w = m.rd(iy + 6), rows = m.rd(iy + 0x0b), size = m.rd(iy + 0x0d), k = m.rd(ix + 2), skip = m.rd(ix + 3);
  const exp = (w + 1) * rows; calls++; bytes += size;
  const key = `w${w} r${rows} size${size} exp${exp} skip${skip}`; geom.set(key, (geom.get(key) || 0) + 1);
  if (size !== exp) { mism++; if (ex.length < 5) ex.push({ hl: m.cpu.hl().toString(16), w, rows, size, exp, k, skip }); }
});
m.onPc(S.LB446, () => { const b = (m.cpu.rp(0) >> 8) & 0xff; kdist.set(b, (kdist.get(b) || 0) + 1); });
let kz = 0; m.onPc(S.LB438, () => { kz++; });
m.key(KEY.UP, true);
const t0 = g.ticks; let guard = 0; while (g.ticks - t0 < NT && guard < 400000) { m.step(); guard++; }
console.log(`ур.${LVL}, ${g.ticks - t0} тиков: вызовов LB3A0 ${calls} (${(calls / (g.ticks - t0)).toFixed(2)}/тик), байт буфера ${bytes} (${(bytes / (g.ticks - t0)).toFixed(1)}/тик), несовпадений размера ${mism}`);
for (const [k, v] of [...geom.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log("  ", k, v);
console.log("  входы LB446 по B (k; повторные входы после нибблов тоже считаются):", [...kdist.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join(" "), " выходов LB438:", kz);
if (ex.length) console.log("  примеры несовпадений:", JSON.stringify(ex));
