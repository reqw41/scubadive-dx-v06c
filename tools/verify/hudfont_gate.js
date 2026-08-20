// ГЕЙТ ЕДИНОГО ШРИФТА HUD: подписи панели напечатаны ROM_CHARSET в знакоместах.
//
// Зачем. На железе были ДВА шрифта: цифры HIGH/SCORE/HELD — римейковый 8×8 из
// ROM_CHARSET, подписи — узкий шрифт Зимина, вшитый в битмап scubapanl.asm.
// Подписи стёрты из битмапа (tools/mkpanl.py) и печатаются PrintChar после
// ShowGamePanel. Этот гейт проверяет ИТОГ, а не намерение: каждый глиф в
// плоскости 0xC000 равен соответствующему символу ROM_CHARSET, а в 0xE000
// на тех же местах — нули (битмап больше не несёт подпись).
//
// Сборка: боевой путь -DNOTITLE (build/evnt), экран меню. Печать однократна
// (бут), чистка столбцы 24..31 не трогает — к меню подписи уже на месте.
//
//   FONT_NOPRINT=1 — RET на PrintPanelLabels: подписей нет, гейт обязан покраснеть;
//   FONT_WRONG=1   — сверять с инвертированным глифом: обязана покраснеть мера A;
//   FONT_EMPTY=1   — не доходить до меню: выборка пуста, гейт недействителен.
"use strict";
const fs = require("fs"), path = require("path");
const { make, readSym } = require("./harness.js");
const ROOT = path.resolve(__dirname, "../..");
const B = process.env.BUILD_DIR || "build";
const DIR = process.argv[2] || `${ROOT}/${B}/evnt`;
const NOPRINT = process.env.FONT_NOPRINT === "1";
const WRONG = process.env.FONT_WRONG === "1";
const EMPTY = process.env.FONT_EMPTY === "1";

for (const f of ["scuba.rom", "scubacod1.sym"])
  if (!fs.existsSync(`${DIR}/${f}`)) {
    console.log(`нет ${DIR}/${f} — собери DET=1 SRC=src8080 GEOM=1 ZONE=1 EVICT=1 NOTITLE=1 OUT=${B}/evnt`);
    process.exit(2);
  }

let fail = 0, checks = 0;
const chk = (ok, msg) => { checks++; if (ok) console.log("  ok      " + msg);
                           else { fail++; console.log("  ПРОВАЛ  " + msg); } };

const S = readSym(`${DIR}/scubacod1.sym`);
for (const n of ["PrintPanelLabels", "ROM_CHARSET", "LEE2C", "Start", "ShowGamePanel"])
  if (S[n] == null) { console.log(`нет метки ${n}`); process.exit(2); }

// Знакоместа печати — те же, что tools/mkpanl.py PRINT. Не зона: row>=8.
const LABELS = [
  { name: "HIGH",   row: 9,  col: 26, text: "HIGH",   vert: false },
  { name: "SCORE",  row: 11, col: 25, text: "SCORE",  vert: false },
  { name: "HELD",   row: 13, col: 26, text: "HELD",   vert: false },
  { name: "OXYGEN", row: 20, col: 26, text: "OXYGEN", vert: true },
  { name: "DEPTH",  row: 20, col: 28, text: "DEPTH",  vert: true },
  { name: "SKILL",  row: 16, col: 30, text: "SKILL",  vert: true },
  { name: "LIVES",  row: 25, col: 30, text: "LIVES",  vert: true },
];

function glyph(m, ch) {
  const a = S.ROM_CHARSET + (ch - 0x20) * 8;
  const g = [];
  for (let i = 0; i < 8; i++) g.push(m.rd(a + i));
  return g;
}
function cellC(m, row, col) {
  const addr = ((0xC0 + col) << 8) | ((255 - 8 * row) & 0xff);
  const g = [];
  for (let k = 0; k < 8; k++) g.push(m.rd(addr - k));
  return g;
}

const m = make(`${DIR}/scuba.rom`, { cpu: "i8080" });
if (NOPRINT)
  m.onPc(S.Start, () => { m.wr(S.PrintPanelLabels, 0xC9); });
let atMenu = false;
m.onPc(S.LEE2C, () => { atMenu = true; });
if (!EMPTY) for (let i = 0; i < 4000 && !atMenu; i++) m.step();

if (EMPTY || !atMenu) {
  console.log(`  ПРОВАЛ  ПУСТАЯ ВЫБОРКА: меню ${atMenu}`);
  console.log("ГЕЙТ НЕДЕЙСТВИТЕЛЕН");
  process.exit(2);
}

let nGlyph = 0, nBad = 0, first = null, zoneHit = 0, eInk = 0;
for (const L of LABELS) {
  for (let i = 0; i < L.text.length; i++) {
    const row = L.row + (L.vert ? i : 0);
    const col = L.col + (L.vert ? 0 : i);
    const lo = 255 - 8 * row;
    if (lo >= 192) zoneHit++;
    const got = cellC(m, row, col);
    let want = glyph(m, L.text.charCodeAt(i));
    if (WRONG) want = want.map(b => b ^ 0xff);
    nGlyph++;
    const ok = got.every((v, k) => v === want[k]);
    if (!ok) { nBad++; if (!first) first = `${L.name}[${i}]=${L.text[i]} row ${row} col ${col}`; }
    for (let k = 0; k < 8; k++) if (m.rd(0xE000 + col * 256 + (lo - k))) eInk++;
  }
}

chk(nGlyph === 34, `выборка: ${nGlyph} глифов (ждём 34 = 4+5+4+6+5+5+5)`);
chk(nBad === 0, `A: подписи в 0xC000 совпали с ROM_CHARSET (${nBad} расхождений` +
    (first ? `, первое ${first}` : "") + `)`);
chk(eInk === 0, `B: в 0xE000 на знакоместах подписей ноль чернил (наблюдалось ${eInk})`);
chk(zoneHit === 0, `C: ни одно знакоместо подписи не в зоне (lo>=192): ${zoneHit}`);

console.log(fail ? `ГЕЙТ КРАСНЫЙ: ${fail} из ${checks}` : `ГЕЙТ ЗЕЛЁНЫЙ: все ${checks} проверки`);
process.exit(fail ? 1 : 0);
