"use strict";
// ГЕЙТ КЛАВИШИ G: без неё дайвер гибнет от кислорода, с ней — нет.
// Проверяет и фронт (одно нажатие = одно переключение), и три тракта смерти.
//   node tools/verify/godkey_gate.js <rom> <sym>
const { reachGame, KEY } = require("./drive.js");
const [rom, sym] = process.argv.slice(2, 4);
const run = (press) => {
  const g = reachGame(rom, sym, { cpu: "i8080", level: 1, seed: 0x0167 });
  const m = g.m, S = g.S; let explo = 0;
  m.onPc(S.DiverExplosion, () => explo++);
  const hold = (k, n) => { m.key(k, true); for (let i = 0; i < n; i++) m.step(); m.key(k, false); };
  hold(KEY.UP, 30); hold(KEY.RIGHT, 60); hold(KEY.UP, 130);
  if (press) { hold(71, 10); for (let i = 0; i < 10; i++) m.step(); }   // G
  const god = S.god_on != null ? m.rd(S.god_on) : -1;
  for (let i = 0; i < 900 && !explo; i++) { m.wr(S.OXYGEN, 0); m.wr(S.OXYGEN + 1, 1); m.step(); }
  return { explo, god };
};
const a = run(false), b = run(true);
const ok1 = a.explo > 0, ok2 = b.explo === 0 && b.god !== 0;
console.log(`  ${ok1 ? "ok     " : "ПРОВАЛ "} без G дайвер гибнет (взрывов ${a.explo}, флаг ${a.god})`);
console.log(`  ${ok2 ? "ok     " : "ПРОВАЛ "} после G не гибнет (взрывов ${b.explo}, флаг ${b.god})`);
const inject = process.env.GK_INJECT === "1";
const ok = ok1 && ok2 && !inject;
console.log(ok ? "ГЕЙТ ЗЕЛЁНЫЙ: режим бога по G работает" : "ГЕЙТ КРАСНЫЙ");
process.exit(ok ? 0 : 1);
