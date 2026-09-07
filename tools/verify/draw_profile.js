"use strict";
// ПРОФИЛЬ ОДНОЙ ПЕРЕРИСОВКИ ЭКРАНА ПО ПРОЦЕДУРАМ: такты Вектора по каждой
// процедуре (.sym) за заходы DrawGameScr, заведённые как в drawscr_cost.js
// (DSC_FORCE). Ответ на вопрос «куда уходит секунда перерисовки».
//   node tools/verify/draw_profile.js <rom> <sym> [level=4] [runs=6]
const { reachGame, KEY } = require("./drive.js");
const [rom, sym] = process.argv.slice(2, 4);
const LVL = parseInt(process.argv[4] || "4", 10), RUNS = parseInt(process.argv[5] || "6", 10);
const g = reachGame(rom, sym, { cpu: "i8080", level: LVL, seed: 0x0167 });
const m = g.m, S = g.S;
const syms = Object.entries(S).filter(([n, a]) => typeof a === "number" && a >= 0x100 && a < 0xC000 && !/^(L[0-9A-F]{4}_|\.)/.test(n))
  .sort((a, b) => a[1] - b[1]);
const addrs = syms.map(s => s[1]);
const nameOf = pc => { let lo = 0, hi = addrs.length - 1, r = -1; while (lo <= hi) { const mid = (lo + hi) >> 1; if (addrs[mid] <= pc) { r = mid; lo = mid + 1; } else hi = mid - 1; } return r < 0 ? "?" : syms[r][0]; };
const cyc = new Map(); let on = false, sp0 = 0, prev = -1, runs = 0, total = 0;
const cb = m.v06c.check_breakpoint;
m.v06c.check_breakpoint = () => {
  const r = cb(); const pc = m.cpu.pc & 0xffff;
  if (on) {
    if (prev >= 0) { const c = m.cpu.vcycles || 0; total += c; const n = nameOf(prev); cyc.set(n, (cyc.get(n) || 0) + c); }
    if ((m.cpu.sp & 0xffff) > sp0) { on = false; runs++; }
  }
  if (!on && pc === S.DrawGameScr) { on = true; sp0 = m.cpu.sp & 0xffff; }
  prev = pc; return r;
};
let tick = 0, n = 0, inForce = false, saved = 0;
m.onPc(S.LD9C0, () => {
  if (inForce) { inForce = false; m.wr(S.L5B03, saved & 0xff); m.wr(S.L5B03 + 1, (saved >> 8) & 0xff); return; }
  if (++tick % 40) return;
  saved = m.rdw(S.L5B03); const k = n++, row = k % 3, col = (k * 5) & 0x1f;
  m.wr(S.L5B03, col); m.wr(S.L5B03 + 1, row); if (S.cu_dir !== undefined) m.wr(S.cu_dir, k & 3);
  m.cpu.set_h(row); m.cpu.set_l(col); inForce = true; m.cpu.call(S.DrawGameScr);
});
m.key(KEY.UP, true); let guard = 0;
while (runs < RUNS + 1 && guard < 3000000) { m.step(); guard++; }
console.log(`заходов ${runs}, тактов на заход ${Math.round(total / runs)} (${(total / runs / 59904).toFixed(1)} кадров)`);
const rows = [...cyc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 22);
for (const [nm, c] of rows) console.log(`${(100 * c / total).toFixed(1).padStart(5)} %  ${Math.round(c / runs).toString().padStart(8)} т/заход  ${nm}`);
