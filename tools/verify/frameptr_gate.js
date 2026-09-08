"use strict";
// ГЕЙТ УКАЗАТЕЛЯ КАДРА. Текущий кадр существа (запись +0B/+0C) обязан лежать ВНУТРИ
// набора спрайтов и НИКОГДА не иметь старшего бита (он значит зеркальность и живёт
// только в базе +09/+0A). Дефект 2026-09-08: решение о зеркальности бралось из
// регистра типа, который в момент сборки кадра принадлежал другой записи; база
// уходила в указатель вместе с признаком, кадр уезжал в код, существо рисовалось
// мусором («красные кальмары»).
//   node tools/verify/frameptr_gate.js <rom> <sym> [уровни=1,4] [тиков=1200]
const { reachGame, KEY } = require("./drive.js");
const [rom, sym] = process.argv.slice(2, 4);
const LVLS = (process.argv[4] || "1,4").split(",").map(Number);
const NT = parseInt(process.argv[5] || "1200", 10);
let bad = 0, checks = 0;
for (const LVL of LVLS) {
  const g = reachGame(rom, sym, { cpu: "i8080", level: LVL, seed: 0x0167 });
  const m = g.m, S = g.S, w = a => m.rd(a) | (m.rd(a + 1) << 8);
  const CODE_HI = 0x7000;      // выше этого — код и пул, спрайтов там нет
  let hit = null;
  const scan = () => { const b4 = w(S.RecsAddrIV), n4 = m.rd(S.NumRecsIV);
    const gs = [[S.LC4F0, 21, m.rd(S.NumRecsI)], [w(S.RecsAddrII), 26, m.rd(S.NumRecsII)],
      [w(S.RecsAddrIII), 26, m.rd(S.NumRecsIII)], [b4, 26, n4], [b4 + 26 * n4, 28, m.rd(S.NumRecsV)]];
    for (const [base, sz, n] of gs) { if (base < 0x300 || n > 200) continue;
      for (let i = 0; i < n; i++) { const r = base + i * sz, p = w(r + 11); checks++;
        if (!hit && ((p & 0x8000) || (p > CODE_HI && p < 0xA000))) hit = { r, p, d: w(r + 19) }; } } };
  let ticks = 0; m.onPc(S.LD9C0, () => { ticks++; if (ticks % 10 === 0) scan(); });
  let row0 = m.rd(S.L5B03 + 1), chk = 0, rot = -1, guard = 0;
  while (ticks < NT && guard++ < 900000) { const row = m.rd(S.L5B03 + 1);
    m.key(KEY.UP, true); m.key(KEY.RIGHT, rot >= 0 && guard < rot); m.step();
    if (guard - chk >= 60) { if (row <= row0) rot = guard + 25; row0 = row; chk = guard; } }
  if (hit) { bad++; console.log(`  ПРОВАЛ  уровень ${LVL}: запись ${hit.r.toString(16)} тип ${hit.d.toString(16)}, кадр ${hit.p.toString(16)} вне набора`); }
  else console.log(`  ok      уровень ${LVL}: указатели кадров в наборах (${ticks} тиков)`);
}
if (process.env.FP_INJECT === "1") { console.log("негативный контроль"); bad++; }
console.log(bad ? `ГЕЙТ КРАСНЫЙ: ${bad}` : `ГЕЙТ ЗЕЛЁНЫЙ: проверок ${checks}`);
process.exit(bad ? 1 : 0);
