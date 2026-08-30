// ГЕЙТ ДЕМО-РЕЖИМА (боевая раскладка, 2026-08-30 — заново после снятия EVICT-стенда).
//
// Зачем. Простой на стартовом экране ~20 с уводит в аттракт: демо — настоящая
// партия уровня 4 с закрытыми прерываниями на время подготовки (DI в LEEAD,
// EI сразу за DrawGameScr — D2 ревизии). Если пара DI/EI разойдётся, демо
// виснет навсегда: клавиатуру сканирует только KEYINT. Прежний гейт держался
// на метке ZoneCopy и ушёл вместе с EVICT.
//
// Меры (один прогон, боевой образ $B/prodd):
//   A. демо ВОШЛО без единого нажатия (LA193 из LEEAD);
//   B. поле дорисовано (DrawGameScr) и игровой цикл демо крутится (LEF12 >= 200);
//   C. HUD пережил вход в демо: в строках 24..31 плоскости 0xE000 есть пиксели
//      (демо чистит только поле — ClearFieldFillAttr);
//   D. по клавише демо ВЕРНУЛОСЬ в меню (MenuFromDemo -> LEE2C) с IFF=1;
//   E. после демо игра ЗАПУСКАЕТСЯ («газ» -> START_GAME -> тики LD9C0 >= 50).
// Негативы: ATTRACT_EMPTY=1 — ждать заведомо мало (демо не наступает);
//           ATTRACT_INJECT=1 — `jp $` на входе MenuFromDemo: возврата в меню нет.
// Проверено 2026-08-30: гашение EI за CALL DrawGameScr в LEEAD демо НЕ ломает —
// pace_tick в своём цикле ожидания делает `ei` сам, прерывания открываются на
// первом же тике демо. Поэтому негатив с NOP вместо EI не краснеет и не годится.
//   node tools/verify/attract_gate.js [каталог сборки = $BUILD_DIR/prodd]
"use strict";
const fs = require("fs"), path = require("path");
const { make, readSym } = require("./harness.js");
const ROOT = path.resolve(__dirname, "../..");
const B = process.env.BUILD_DIR || "build";
const DIR = process.argv[2] || `${ROOT}/${B}/prodd`;   // боевая сборка стенда (run_gates: DET=1 build_prod.sh $B/prodd)
const EMPTY = process.env.ATTRACT_EMPTY === "1", INJECT = process.env.ATTRACT_INJECT === "1";
for (const f of ["scuba.rom", "scubacod1.sym"]) if (!fs.existsSync(`${DIR}/${f}`)) { console.log(`нет ${DIR}/${f} — собери DET=1 tools/build_prod.sh ${DIR}`); process.exit(2); }
const S = readSym(`${DIR}/scubacod1.sym`);
for (const n of ["LEE2C", "LEEAD", "LA193", "LEF12", "MenuFromDemo", "DrawGameScr", "START_GAME", "LD9C0"]) if (S[n] == null) { console.log(`нет метки ${n}`); process.exit(2); }
const m = make(`${DIR}/scuba.rom`, { cpu: "i8080" });
let menu = 0, eead = 0, la193 = 0, la193demo = 0, draw = 0, demoTicks = 0, back = 0, started = 0, ticks = 0, inDemo = false;
m.onPc(S.LEE2C, () => { menu++; });
m.onPc(S.LEEAD, () => { eead++; });
m.onPc(S.LA193, () => { la193++; if (inDemo) la193demo++; });
m.onPc(S.DrawGameScr, () => { draw++; });
m.onPc(S.LEF12, () => { demoTicks++; });
m.onPc(S.MenuFromDemo, () => { back++; });
m.onPc(S.START_GAME, () => { started++; });
m.onPc(S.LD9C0, () => { ticks++; });
const ok = [], bad = [];
const check = (c, t) => (c ? ok : bad).push(t);
let f = 0; for (; f < 3000 && !menu; f++) m.step();
if (!menu) { console.log("НЕ ДОШЛИ ДО МЕНЮ"); process.exit(2); }
if (INJECT) { m.wr(S.MenuFromDemo, 0xC3); m.wr(S.MenuFromDemo + 1, S.MenuFromDemo & 0xFF); m.wr(S.MenuFromDemo + 2, S.MenuFromDemo >> 8); }
// A: ждём вход в демо без нажатий (аттракт после 0x400 кадров простоя)
inDemo = true; const drawBefore = draw;
const waitDemo = EMPTY ? 50 : 4000;
for (let i = 0; i < waitDemo && la193demo === 0; i++) m.step();
check(la193demo > 0, `A. демо вошло без нажатий (LA193 после ${f} кадров меню): ${la193demo}`);
// B: поле дорисовано, демо-цикл крутится
for (let i = 0; i < 1500 && demoTicks < 200; i++) m.step();
check(draw > drawBefore, `B1. DrawGameScr в демо: ${draw - drawBefore}`);
check(demoTicks >= 200, `B2. тиков демо LEF12: ${demoTicks} (нужно >= 200)`);
// C: HUD жив (строки 24..31 = lo 0..63, плоскость 0xE000)
let hud = 0; for (let col = 0; col < 32; col++) for (let lo = 0; lo < 64; lo++) if (m.rd(0xE000 + col * 256 + lo)) hud++;
check(hud > 200, `C. HUD в демо не стёрт: ненулевых байт в 0xE000 строках 24..31 = ${hud}`);
// D: клавиша -> возврат в меню с IFF=1
const menuBefore = menu; let iffAtMenu = null;
m.onPc(S.LEE2C, () => { if (iffAtMenu == null && menu > menuBefore) iffAtMenu = m.cpu.iff != null ? (m.cpu.iff ? 1 : 0) : (m.cpu.interruptsEnabled ? 1 : 0); });
m.key(40, true); for (let i = 0; i < 10; i++) m.step(); m.key(40, false);
for (let i = 0; i < 600 && menu === menuBefore; i++) m.step();
check(back > 0, `D1. MenuFromDemo: ${back}`);
check(menu > menuBefore, `D2. меню после демо (LEE2C): ${menu - menuBefore}`);
check(iffAtMenu === 1, `D3. прерывания открыты при возврате в меню: IFF=${iffAtMenu}`);
// E: игра стартует
for (let i = 0; i < 30; i++) m.step();
m.key(38, true); for (let i = 0; i < 400 && !started; i++) m.step(); m.key(38, false);
const t0 = ticks; for (let i = 0; i < 1500 && ticks - t0 < 50; i++) m.step();
check(started > 0 && ticks - t0 >= 50, `E. игра после демо запустилась: START_GAME=${started}, тиков ${ticks - t0}`);
for (const t of ok) console.log("  ok      " + t);
for (const t of bad) console.log("  ПРОВАЛ  " + t);
console.log(bad.length ? `ГЕЙТ КРАСНЫЙ: ${bad.length} из ${ok.length + bad.length}` : `ГЕЙТ ЗЕЛЁНЫЙ: все ${ok.length} проверки`);
process.exit(bad.length ? 1 : 0);
