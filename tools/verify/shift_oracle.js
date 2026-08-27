// Оракул слитого прохода копия+сдвиг (SH_*): ожидаемый буфер считается в JS из
// байтов источника по прежней семантике (копия строк с нулевым байтом, сдвиг
// всей цепочки (w+1)*rows вправо на k) и сверяется с тем, что оставил код.
//   node tools/verify/shift_oracle.js <rom> <sym> [calls=200] [level=1]
"use strict";
const { reachGame, KEY } = require("./drive.js");
const [rom, sym] = process.argv.slice(2, 4);
const N = parseInt(process.argv[4] || "200", 10), LVL = parseInt(process.argv[5] || "1", 10);
const g = reachGame(rom, sym, { cpu: "i8080", level: LVL, seed: 0x0167 });
const S = g.S, m = g.m; let cur = null, calls = 0, bad = 0, kd = new Map();
m.onPc(S.LB3E9, () => { const iy = m.rdw(S.z80_iy);
  cur = { hl: m.cpu.hl() & 0xffff, w: m.rd(iy + 6), rows: m.rd(iy + 0x0b), size: m.rd(iy + 0x0d), pad: m.cpu.rp(0) & 0xff }; });
m.onPc(S.SH_k, () => { if (!cur) return; cur.k = (m.cpu.rp(0) >> 8) & 0xff; cur.src = m.rdw(S.L5B11);
  const s = []; for (let i = 0; i < cur.w * cur.rows; i++) s.push(m.rd(cur.src + i)); cur.srcb = s; });
m.onPc(S.LB438, () => { if (!cur || cur.k == null) { cur = null; return; }
  const { w, rows, size, k, srcb } = cur; calls++; kd.set(k, (kd.get(k) || 0) + 1);
  const copy = []; for (let r = 0; r < rows; r++) { for (let i = 0; i < w; i++) copy.push(srcb[r * w + i]); copy.push(0); }
  const exp = []; let prev = 0; for (let i = 0; i < copy.length; i++) { const t = copy[i]; exp.push(((t >> k) | (prev << (8 - k))) & 0xff); prev = t; }
  for (let i = 0; i < cur.pad; i++) exp.push(0); // хвост нулей = C на входе в LB3E9 (остаток слота)
  const got = []; for (let i = 0; i < exp.length; i++) got.push(m.rd(cur.hl + i));
  const ixb = m.rd(m.rdw(S.z80_ix) + 0x0b) | (m.rd(m.rdw(S.z80_ix) + 0x0c) << 8);
  const okb = ixb === ((cur.src + w * rows) & 0xffff), okh = m.rdw(m.cpu.sp & 0xffff) === cur.hl; // крючок бьёт ДО POP HL
  if (JSON.stringify(exp) !== JSON.stringify(got) || !okb || !okh) { bad++; if (bad <= 3) {
    console.log(`ПРОВАЛ вызов ${calls}: hl=${cur.hl.toString(16)} w${w} r${rows} sz${size} k${k} src=${cur.src.toString(16)} ixb ${okb} hl ${okh}`);
    console.log("  ждали:", exp.slice(0, 20).map(x => x.toString(16).padStart(2, "0")).join(" "));
    console.log("  есть: ", got.slice(0, 20).map(x => x.toString(16).padStart(2, "0")).join(" ")); } }
  cur = null; });
m.key(KEY.UP, true); let guard = 0; while (calls < N && guard < 400000) { m.step(); guard++; }
console.log(`${rom}: вызовов ${calls}, провалов ${bad}, k: ${[...kd.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => k + ":" + v).join(" ")}`);
