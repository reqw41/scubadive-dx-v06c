"use strict";
// ИНВАРИАНТ ЧИСТОГО КАДРА. У зеркального типа признак зеркальности живёт ТОЛЬКО
// в базе набора (запись +$09/+$0A); текущий кадр (+$0B/+$0C) обязан быть чистым,
// потому что по нему идёт арифметика анимации: шаг на кадр и сравнение с $FF.
// Грязный кадр ломает именно проверку конца набора — чтение уходит по адресу с
// битом 15, маркера там нет, и указатель уезжает в чужие данные.
//
// Живой дамп 2026-09-16 (пауза владельца, Emu80): запись 0x6f30, мелкий кальмар
// горизонтальный, база 0x9178, кадр 0x9238 = база + 0xC0 — на экране красное
// бесформенное пятно вместо существа, ровно то, что она и сняла.
//
//   node tools/verify/frameclean_gate.js <rom> <sym> [тиков] [уровни]
//   FRAMECLEAN_INJECT=1 — негативный контроль: пачкаем кадр сами
const { reachGame, KEY } = require("./drive.js");
const [rom, sym] = process.argv.slice(2, 4);
const NT = parseInt(process.argv[4] || "4000", 10);
const LVLS = (process.argv[5] || "1,2,3,4").split(",").map(Number);
let bad = 0, checked = 0;
for (const LVL of LVLS) {
  const g = reachGame(rom, sym, { cpu: "i8080", level: LVL, seed: 0x0167 });
  const m = g.m, S = g.S, w = a => m.rd(a) | (m.rd(a + 1) << 8);
  if (S.god_on) m.wr(S.god_on, 1);
  const recs = () => { const b4 = w(S.RecsAddrIV), n4 = m.rd(S.NumRecsIV);
    return [[S.LC4F0, 21, m.rd(S.NumRecsI)], [w(S.RecsAddrII), 26, m.rd(S.NumRecsII)],
      [w(S.RecsAddrIII), 26, m.rd(S.NumRecsIII)], [b4, 26, n4], [b4 + 26 * n4, 28, m.rd(S.NumRecsV)]]; };
  let t = 0, hit = null;
  m.onPc(S.LD9C0, () => { t++;
    if (process.env.FRAMECLEAN_INJECT && t === 50) {      // негативный контроль
      for (const [base, sz, n] of recs()) { if (!base || base < 0x300 || n > 200) continue;
        if (n) { m.wr(base + 12, m.rd(base + 12) | 0x80); break; } } }
    if (hit) return;
    for (const [base, sz, n] of recs()) { if (!base || base < 0x300 || n > 200) continue;
      for (let i = 0; i < n; i++) { const r = base + i * sz; checked++;
        if (w(r + 11) & 0x8000) { hit = { t, r, base: w(r + 9), frame: w(r + 11), type: w(r + 19) }; return; } } } });
  let rng = 0x2545F491 ^ LVL, dir = 0, guard = 0;
  const nxt = () => { rng ^= rng << 13; rng ^= rng >>> 17; rng ^= rng << 5; return rng >>> 0; };
  const KEYS = [KEY.UP, KEY.DOWN, KEY.LEFT, KEY.RIGHT];
  while (t < NT && guard++ < 600000 && !hit) { if (guard % 200 === 0) dir = nxt() & 3;
    for (let i = 0; i < 4; i++) m.key(KEYS[i], i === dir); m.step(); }
  if (hit) { bad++;
    console.log(`  ПРОВАЛ уровень ${LVL}, тик ${hit.t}: запись 0x${hit.r.toString(16)}, тип 0x${hit.type.toString(16)}, ` +
      `база 0x${hit.base.toString(16)}, кадр 0x${hit.frame.toString(16)} — бит 15 в кадре`); }
  else console.log(`  ok  уровень ${LVL}: ${t} тиков, кадр чист во всех записях`);
}
console.log(bad ? `ГЕЙТ КРАСНЫЙ: ${bad} из ${LVLS.length}` : `ГЕЙТ ЗЕЛЁНЫЙ: проверок ${checked}, грязных кадров нет`);
process.exit(bad ? 1 : 0);
