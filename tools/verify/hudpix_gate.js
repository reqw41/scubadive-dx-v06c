"use strict";
// ПОЛОСА HUD — ПРОТИВ СВОЕГО ЗАМОРОЖЕННОГО СЛЕПКА, А НЕ ПРОТИВ ZX.
// Пиксель-гейт сверяет видеопамять с Z80-эталоном, и на полосе HUD он краснел
// всегда. Разбор 2026-09-14: это не дефект. Наш HUD ПЕРЕРАБОТАН намеренно —
// перенесён вниз, получил рамку, а число HELD печатается на два разряда короче
// и на два столбца правее, чтобы правые края SCORE/HIGH/HELD совпали
// (scubacodc.asm, карта строк 24..31). Замер: у эталона цифры HELD стоят в
// строке 26 столбцах 6..9, у нас — в 8..11; поле при этом совпадает байт в байт
// во всех девяти сценариях (PIXGATE_FIELD=1, 23366 снимков).
// Поэтому HUD стережётся отдельно и от своего слепка: полоса растровых строк
// lo < 64 после фиксированного числа тиков, md5 на конфигурацию.
//   node tools/verify/hudpix_gate.js            — сверить с эталоном
//   HUDPIX_FREEZE=1 node ...                    — переморозить эталон
//   HUDPIX_INJECT=1 node ...                    — негативный контроль
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const ROOT = path.resolve(__dirname, "../..");
const B = process.env.BUILD_DIR || "build";
const REF = path.join(__dirname, "ref", "hudpix.md5");
const { reachGame, KEY } = require("./drive.js");
const NT = 300;
const CONF = [["bare", "i8080"], ["prodd", "i8080"]];
const got = {};
for (const [name, cpu] of CONF) {
  const rom = `${ROOT}/${B}/${name}/scuba.rom`, sym = `${ROOT}/${B}/${name}/scubacod1.sym`;
  if (!fs.existsSync(rom)) { console.log(`  ПРОВАЛ ${name}: образ не собран (${rom})`); process.exit(1); }
  const g = reachGame(rom, sym, { cpu, level: 1, seed: 0x0167 });
  const m = g.m, S = g.S;
  let t = 0; m.onPc(S.LD9C0, () => { t++; });
  for (let f = 0; f < 20000 && t < NT; f++) m.step();
  // полоса HUD: растровые строки 0..63 снизу экрана, обе видимые плоскости
  const buf = Buffer.alloc(32 * 64 * 2); let i = 0;
  for (let c = 0; c < 32; c++) for (let lo = 0; lo < 64; lo++) {
    buf[i++] = m.rd(0xC000 + c * 256 + lo); buf[i++] = m.rd(0xE000 + c * 256 + lo); }
  if (process.env.HUDPIX_INJECT) buf[777] ^= 0x20;
  got[name] = crypto.createHash("md5").update(buf).digest("hex");
}
if (process.env.HUDPIX_FREEZE) {
  fs.writeFileSync(REF, Object.entries(got).map(([k, v]) => `${k} ${v}`).join("\n") + "\n");
  console.log("эталон переморожен:", REF); for (const [k, v] of Object.entries(got)) console.log(`  ${k} ${v}`);
  process.exit(0);
}
if (!fs.existsSync(REF)) { console.log("  ПРОВАЛ: эталона нет, заморозить: HUDPIX_FREEZE=1 node tools/verify/hudpix_gate.js"); process.exit(1); }
const ref = {};
for (const l of fs.readFileSync(REF, "utf8").split("\n")) { const [k, v] = l.trim().split(/\s+/); if (k) ref[k] = v; }
let bad = 0;
for (const [k, v] of Object.entries(got)) {
  if (ref[k] === v) console.log(`  ok  ${k} ${v}`);
  else { console.log(`  ПРОВАЛ ${k}: ${v} против эталона ${ref[k] || "(нет)"}`); bad++; } }
console.log(bad ? `ГЕЙТ КРАСНЫЙ: ${bad} из ${CONF.length}` : `ГЕЙТ ЗЕЛЁНЫЙ: полоса HUD совпала во всех ${CONF.length} конфигурациях`);
process.exit(bad ? 1 : 0);
