"use strict";
// ГЕЙТ ПРИЗНАКА ЗЕРКАЛА. Старший бит базы набора (запись +09/+0A) значит
// «набор отражается» ТОЛЬКО для типов из LB4F0_mirtab. Если бит стоит у другого
// типа, он уходит в АДРЕС: указатель кадра уезжает в чужие данные, и существо
// рисуется мусором (дефект 2026-09-07: змейка вправо, угри «не всегда»).
// Причина была в ШАБЛОНАХ записей — они ставили признак независимо от таблицы.
// Гейт обходит все группы I..V каждые несколько тиков и краснеет на первом таком.
//   node tools/verify/mirflag_gate.js <rom> <sym> [уровни=1,2,3,4] [тиков=1500]
const { reachGame, KEY } = require("./drive.js");
const [rom, sym] = process.argv.slice(2, 4);
const LVLS = (process.argv[4] || "1,2,3,4").split(",").map(Number);
const NT = parseInt(process.argv[5] || "1500", 10);
let bad = 0, checks = 0;
for (const LVL of LVLS) {
  const g = reachGame(rom, sym, { cpu: "i8080", level: LVL, seed: 0x0167 });
  const m = g.m, S = g.S, w = a => m.rd(a) | (m.rd(a + 1) << 8);
  const mir = new Set(); for (let i = 0; i < 16; i++) { const d = w(S.LB4F0_mirtab + 2 * i); if (!d) break; mir.add(d); }
  const seen = new Set(); let hit = null;
  const scan = () => { const b4 = w(S.RecsAddrIV), n4 = m.rd(S.NumRecsIV);
    const gs = [[S.LC4F0, 21, m.rd(S.NumRecsI)], [w(S.RecsAddrII), 26, m.rd(S.NumRecsII)],
      [w(S.RecsAddrIII), 26, m.rd(S.NumRecsIII)], [b4, 26, n4], [b4 + 26 * n4, 28, m.rd(S.NumRecsV)]];
    for (const [base, sz, n] of gs) { if (base < 0x300 || n > 200) continue;
      for (let i = 0; i < n; i++) { const r = base + i * sz, p = w(r + 9), d = w(r + 19);
        checks++;
        if ((p & 0x8000) && !mir.has(d)) { if (!hit) hit = { r, p, d, i }; seen.add(d); } } } };
  let ticks = 0; m.onPc(S.LD9C0, () => { ticks++; if (ticks % 20 === 0) scan(); });
  m.key(KEY.UP, true); let guard = 0; while (ticks < NT && guard++ < 900000) m.step(); m.key(KEY.UP, false);
  if (hit) { bad++;
    console.log(`  ПРОВАЛ  уровень ${LVL}: запись ${hit.r.toString(16)} тип ${hit.d.toString(16)} не зеркальный, а база ${hit.p.toString(16)} с признаком`); }
  else console.log(`  ok      уровень ${LVL}: признак зеркала только у зеркальных типов (${ticks} тиков)`);
}
if (process.env.MF_INJECT === "1") { console.log("негативный контроль"); bad++; }
console.log(bad ? `ГЕЙТ КРАСНЫЙ: ${bad}` : `ГЕЙТ ЗЕЛЁНЫЙ: проверок ${checks}`);
process.exit(bad ? 1 : 0);
