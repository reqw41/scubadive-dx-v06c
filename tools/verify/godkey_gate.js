"use strict";
// ГЕЙТ КЛАВИШИ G: без неё дайвер гибнет от кислорода, с ней — нет.
// Проверяет и фронт (одно нажатие = одно переключение), и три тракта смерти.
// Старт с зажатыми F1+F3 (GodStart, 2026-10-19) — режим бога сразу, без G;
// старт с одной F1 — нет.
//   node tools/verify/godkey_gate.js <rom> <sym>
const { reachGame, KEY } = require("./drive.js");
const [rom, sym] = process.argv.slice(2, 4);
const run = (press, holdKeys) => {
  const g = reachGame(rom, sym, { cpu: "i8080", level: 1, seed: 0x0167, holdKeys });
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
const c = run(false, [112, 114]), d = run(false, [112]);   // F1+F3; одна F1
const ok1 = a.explo > 0, ok2 = b.explo === 0 && b.god !== 0;
const ok3 = c.explo === 0 && c.god !== 0, ok4 = d.explo > 0 && d.god === 0;
console.log(`  ${ok1 ? "ok     " : "ПРОВАЛ "} без G дайвер гибнет (взрывов ${a.explo}, флаг ${a.god})`);
console.log(`  ${ok2 ? "ok     " : "ПРОВАЛ "} после G не гибнет (взрывов ${b.explo}, флаг ${b.god})`);
console.log(`  ${ok3 ? "ok     " : "ПРОВАЛ "} старт с F1+F3: не гибнет без G (взрывов ${c.explo}, флаг ${c.god})`);
console.log(`  ${ok4 ? "ok     " : "ПРОВАЛ "} старт с одной F1: гибнет (взрывов ${d.explo}, флаг ${d.god})`);
const inject = process.env.GK_INJECT === "1";
const ok = ok1 && ok2 && ok3 && ok4 && !inject;
console.log(ok ? "ГЕЙТ ЗЕЛЁНЫЙ: режим бога по G и по старту с F1+F3 работает" : "ГЕЙТ КРАСНЫЙ");
process.exit(ok ? 0 : 1);
