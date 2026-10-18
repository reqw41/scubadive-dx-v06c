// GATE: Joystick-P (port 6 behind port 5) starts the game and steers.
// The port is emulated as in the MiSTer core (Vector-06C.sv: joy_port[6:5]
// 00 = A&B, 01 = A, 10 = B, 11 = none; byte active-low: b7 Fire2, b6 Fire1,
// b3 Down, b2 Up, b1 Left, b0 Right). Port 0x0E reads 0xFF, so only the
// Joystick-P path can work. Joystick A is driven by the test, B is idle.
//   node joyp_gate.js <rom> <sym> [harness.js]
//   JOYP_DEAD=1 — порт 6 молчит (негативный контроль: гейт обязан покраснеть)
"use strict";
const path = require("path");
const { make, readSym } = require(process.argv[4] || path.join(__dirname, "harness.js"));
const rom = process.argv[2], S = readSym(process.argv[3]);
for (const n of ["START_GAME", "LD9C0", "KSTATE5", "DecodeKeyboard"]) if (S[n] == null) { console.log("no label " + n); process.exit(2); }
const m = make(rom, { cpu: "i8080" });
let joyA = 0, sel = 3;
const out = m.io.output.bind(m.io), inp = m.io.input.bind(m.io);
m.io.output = (p, v) => { if ((p & 0xff) === 5) sel = (v >> 5) & 3; return out(p, v); };
m.io.input = (p) => {
  p &= 0xff;
  if (p === 0x0e || p === 0x0f) return 0xff;
  if (p === 6) return (process.env.JOYP_DEAD !== "1" && (sel === 0 || sel === 1)) ? (~joyA) & 0xff : 0xff;
  return inp(p);
};
let started = -1, ticks = 0;
m.onPc(S.START_GAME, () => { if (started < 0) started = m.frame; });
m.onPc(S.LD9C0, () => { ticks++; });
const press = (bits, frames) => { joyA = bits; for (let i = 0; i < frames; i++) m.step(); joyA = 0; for (let i = 0; i < 10; i++) m.step(); };
for (let f = 0; f < 400; f++) m.step();            // idle: the boot reads the joystick's rest value
for (let k = 0; k < 8 && started < 0; k++) press(0x80, 12); // Fire2 until the game starts (title, then menu)
if (started < 0) { console.log("FAIL: Fire2 on Joystick-P did not start the game"); process.exit(1); }
// The game reads the controls only once the diver is in the water: wait for
// DecodeKeyboard to run again after the start.
let decodes = 0, inWater = -1;
if (S.DecodeKeyboard != null) m.onPc(S.DecodeKeyboard, () => { decodes++; if (inWater < 0 && m.frame > started + 20) inWater = m.frame; });
for (let f = 0; f < 4000 && inWater < 0; f++) m.step();
if (inWater < 0) { console.log("FAIL: the game never read the controls after the start"); process.exit(1); }
// KSTATE5 is rewritten by every decode and consumed by the game, so the gate
// watches the values written to it rather than reading it at some moment.
let wrote = 0;
m.onWrite(S.KSTATE5, (a, v) => { wrote |= v; });
const seen = {};
for (const [name, bits, want] of [["right", 0x01, 0x04], ["left", 0x02, 0x02], ["up", 0x04, 0x08], ["down", 0x08, 0x01], ["fire1", 0x40, 0x08]]) {
  joyA = 0; for (let i = 0; i < 10; i++) m.step();
  wrote = 0; joyA = bits;
  for (let i = 0; i < 20; i++) m.step();
  seen[name] = (wrote & want) === want ? 1 : 0;
  joyA = 0;
}
const bad = Object.entries(seen).filter(([, h]) => !h).map(([n]) => n);
console.log("start by Fire2 at frame " + started + ", controls read from frame " + inWater + ", game ticks " + ticks + "; decoded: " + JSON.stringify(seen));
console.log(bad.length ? "GATE RED: not decoded: " + bad.join(", ") : "GATE GREEN: Joystick-P starts the game and all directions and fire are decoded");
process.exit(bad.length ? 1 : 0);
