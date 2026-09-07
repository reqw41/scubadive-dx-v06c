"use strict";
// ГЕЙТ БЫСТРОГО ТАЙЛА: перерисовка экрана в сборке FASTTILE даёт ТЕ ЖЕ байты
// видеопамяти (0xC000..0xFFFF) и карты атрибутов SCRATTR, что и стоковый цикл
// тайлов, на одной серии принудительных перерисовок (позиции как в
// drawscr_cost.js). Снимок берётся сразу после возврата DrawGameScr, до того как
// существа снова что-то нарисуют.
//   node tools/verify/fasttile_gate.js <rom_slow> <sym_slow> <rom_fast> <sym_fast> [level=4] [runs=9]
const { reachGame, KEY } = require("./drive.js");
const [r1, s1, r2, s2] = process.argv.slice(2, 6);
const LVL = parseInt(process.argv[6] || "4", 10), RUNS = parseInt(process.argv[7] || "9", 10);
function snaps(rom, sym) {
  const g = reachGame(rom, sym, { cpu: "i8080", level: LVL, seed: 0x0167 });
  const m = g.m, S = g.S; const out = []; let tick = 0, n = 0, pend = null, armed = false;
  // ПРИНУЖДЕНИЕ БЕЗ m.cpu.call: внутри call диспетчер крючков стенда не зовётся
  // (проверено: 0 инструкций через check_breakpoint), а снимок нужен В СЕРЕДИНЕ
  // перерисовки. Поэтому в крючке LD9C0 кладём адрес возврата на стек и переставляем
  // PC на DrawGameScr — дальше обычный шаг, крючки работают, RET вернёт в LD9C0.
  m.onPc(S.DGS_water, () => {
    if (!armed) return;
    const v = Buffer.alloc(0x4000); for (let i = 0; i < 0x4000; i++) v[i] = m.rd(0xC000 + i);
    const a = Buffer.alloc(0x300); for (let i = 0; i < 0x300; i++) a[i] = m.rd(S.SCRATTR + i);
    pend = { v, a }; armed = false;
  });
  let saved = 0, restore = false;
  m.onPc(S.LD9C0, () => {
    if (restore) { restore = false; m.wr(S.L5B03, saved & 0xff); m.wr(S.L5B03 + 1, (saved >> 8) & 0xff);
      if (!pend) throw new Error("DGS_water не достигнут внутри принудительной перерисовки");
      out.push({ k: n - 1, v: pend.v, a: pend.a }); pend = null; return; }
    if (++tick % 40) return;
    saved = m.rdw(S.L5B03); const k = n++, row = k % 3, col = (k * 5) & 0x1f;
    m.wr(S.L5B03, col); m.wr(S.L5B03 + 1, row); if (S.cu_dir !== undefined) m.wr(S.cu_dir, k & 3);
    m.cpu.set_h(row); m.cpu.set_l(col);
    const sp = (m.cpu.sp - 2) & 0xffff; m.wr(sp, S.LD9C0 & 0xff); m.wr(sp + 1, S.LD9C0 >> 8);
    m.cpu.sp = sp; m.cpu.pc = S.DrawGameScr; armed = true; restore = true;
  });
  m.key(KEY.UP, true); let guard = 0; while (out.length < RUNS && guard++ < 3000000) m.step();
  return out;
}
const A = snaps(r1, s1), B = snaps(r2, s2); let fail = 0;
for (let i = 0; i < Math.min(A.length, B.length); i++) {
  // ПОЛЕ: младшие байты 64..255 (VRAM-строки 0..191); HUD (lo 0..63) перерисовка не трогает,
  // а состояние игры (счёт, шкалы) в двух сборках расходится по времени.
  let dv = 0, da = 0, first = -1; const cols = new Set();
  for (let j = 0; j < 0x4000; j++) { if ((j & 0xff) < 64) continue; if (A[i].v[j] !== B[i].v[j]) { dv++; cols.add((j >> 8) & 31); if (first < 0) first = j; } }
  for (let j = 0; j < 0x300; j++) if (A[i].a[j] !== B[i].a[j]) da++;
  if (dv) console.log("    столбцы с расхождениями: " + [...cols].sort((a, b) => a - b).join(","));
  if (dv && process.env.FT_DEBUG) { let shown = 0, p1 = 0, p2 = 0; for (let j = 0; j < 0x4000; j++) { if ((j & 0xff) < 64) continue; if (A[i].v[j] !== B[i].v[j]) { if (j < 0x2000) p1++; else p2++; if (shown++ < 16) console.log(`      0x${(0xC000 + j).toString(16)} медленная ${A[i].v[j].toString(16).padStart(2, "0")} быстрая ${B[i].v[j].toString(16).padStart(2, "0")}`); } } console.log(`      плоскость C000: ${p1}, плоскость E000: ${p2}`); }
  const ok = dv === 0 && da === 0; if (!ok) fail++;
  console.log(`  ${ok ? "ok     " : "ПРОВАЛ "} перерисовка ${i}: видеопамять расхождений ${dv}${first >= 0 ? " (первое 0x" + (0xC000 + first).toString(16) + ")" : ""}, SCRATTR ${da}`);
}
if (process.env.FT_INJECT === "1") { console.log("негативный контроль: подсаженное расхождение"); fail++; }
console.log(fail ? `ГЕЙТ КРАСНЫЙ: ${fail} из ${A.length}` : `ГЕЙТ ЗЕЛЁНЫЙ: ${A.length} перерисовок байт в байт (уровень ${LVL})`);
process.exit(fail ? 1 : 0);
