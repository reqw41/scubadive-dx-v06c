"use strict";
// ОБРЕЗКА НА КРОМКЕ: сколько раз спрайт рисуется УЖЕ полной ширины и кто это.
// Гипотеза: обрезанная часть не участвует ни в рисовании, ни в восстановлении
// фона, и её пиксели остаются. Ловим LB4C4 — точку сразу после клипа LB4BB,
// где (IY+$0E) уже содержит обрезанную ширину, а (IY+$07) — полную.
const { reachGame, KEY } = require("./drive.js");
const [rom, sym] = process.argv.slice(2, 4);
const g = reachGame(rom, sym, { cpu: "i8080", level: 4, seed: 0x0167 });
const m = g.m, S = g.S, w = a => m.rd(a) | (m.rd(a + 1) << 8);
const NAMES = {}; for (const [n, a] of Object.entries(S)) if (/^LC[0-9A-F]{3}$/.test(n)) NAMES[a] = n;
let ticks = 0; const stat = new Map(); const examples = [];
m.onPc(S.LD9C0, () => { ticks++; });
m.onPc(S.LB4C4, () => {
  const iy = w(S.z80_iy);                      // рабочая запись существа на экране
  // ⚠ (IY+$0E) на входе в LB4C4 ещё СТАРЫЙ: его записывает первая же команда
  // этой метки. Обрезанная ширина лежит в регистре B — её и читаем.
  const full = m.rd(iy + 7), cut = m.cpu.b(), col = m.rd(iy + 2), row = m.rd(iy + 3);
  const d = w(S.z80_ix) , nm = "запись " + d.toString(16);
  const k = nm + (cut < full ? " ОБРЕЗАН" : " целиком");
  stat.set(k, (stat.get(k) || 0) + 1);
  if (cut < full && examples.length < 8)
    examples.push(`тик ${ticks}: ${nm} в (стр ${row}, стлб ${col}): ширина ${full} -> ${cut}`);
});
let row0 = m.rd(S.L5B03 + 1), chk = 0, rot = -1, guard = 0;
while (ticks < 1031 && guard++ < 900000) { const row = m.rd(S.L5B03 + 1);
  m.key(KEY.UP, true); m.key(KEY.RIGHT, rot >= 0 && guard < rot); m.step();
  if (guard - chk >= 60) { if (row <= row0) rot = guard + 25; row0 = row; chk = guard; } }
console.log(`тиков ${ticks}, отрисовок с обрезкой и без:`);
for (const [k, v] of [...stat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`  ${k}: ${v}`);
console.log("примеры обрезки:"); for (const e of examples) console.log("  " + e);
