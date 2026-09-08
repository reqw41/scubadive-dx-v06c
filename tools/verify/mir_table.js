"use strict";
// ОТЧЁТ «кто зеркальный, а кто нет» (не гейт — инвентаризация для глаз).
// Таблица «кто зеркальный»: по каждому дескриптору — есть ли признак в наборе
// «влево» (+12), стоит ли тип в LB4F0_mirtab, и совпадает ли набор «влево» с
// набором «вправо» (тогда влево рисуется зеркалированием, а не своими байтами).
const { reachGame } = require("/Users/boris/projects/scubadive-i8080/palette-dither/tools/verify/drive.js");
const [rom, sym] = process.argv.slice(2, 4);
const g = reachGame(rom, sym, { cpu: "i8080", level: 1, seed: 0x0167 });
const m = g.m, S = g.S, w = a => m.rd(a) | (m.rd(a + 1) << 8);
const MIR = []; for (let i = 0; i < S.MIRTAB_N; i++) MIR.push(w(S.LB4F0_mirtab + i * 2));
const NAMES = { LC092: "лодка", LC0A2: "медуза", LC0B2: "круглая рыба (гориз.)", LC0CE: "круглая рыба (верт.)",
  LC0EA: "рыба", LC102: "акула", LC11A: "длинная рыба", LC132: "стайка рыб", LC14A: "мелкий кальмар (гориз.)",
  LC166: "мелкий кальмар (верт.)", LC182: "электрический угорь (гориз.)", LC19E: "электрический угорь (верт.)",
  LC1BA: "змейка (гориз.)", LC1D6: "змейка (верт.)", LC1F2: "кальмар" };
const ds = Object.entries(S).filter(([k, v]) => /^LC[0-9A-F]{3}$/.test(k) && v >= S.LC092 && v < S.LC20A).sort((a, b) => a[1] - b[1]);
const rows = [];
for (let i = 0; i < ds.length; i++) { const [k, a] = ds[i], end = i + 1 < ds.length ? ds[i + 1][1] : S.LC20A;
  const nsets = Math.floor((end - a - 0x10) / 2); if (nsets < 2) { rows.push([NAMES[k] || k, k, "—", "нет наборов"]); continue; }
  const right = w(a + 0x10), left = w(a + 0x12), mir = MIR.includes(a);
  // У ВЕРТИКАЛЬНЫХ типов пара +10/+12 — это «вверх/вниз», а не «вправо/влево»:
  // зеркалить по горизонтали там нечего, и второй набор всегда свой.
  const vert = /верт\./.test(NAMES[k] || "");
  const kind = mir ? "ЗЕРКАЛО набора «вправо»" : (vert ? "свой набор «вниз»" : "свой набор «влево», хранится целиком");
  rows.push([NAMES[k] || k, k, mir ? "да" : "нет", `${kind}: ${vert ? "вверх" : "вправо"} ${right.toString(16)}, ${vert ? "вниз" : "влево"} ${left.toString(16)}${(left & 0x8000) ? " (признак)" : ""}, наборов ${nsets}`]); }
const hdr = ["существо", "тип", "зерк."];
const wid = [0, 1, 2].map(c => Math.max([...hdr[c]].length, ...rows.map(r => [...r[c]].length)));
const pad = (s, n) => s + " ".repeat(n - [...s].length);
console.log(`${pad(hdr[0], wid[0])}  ${pad(hdr[1], wid[1])}  ${pad(hdr[2], wid[2])}  как рисуется «влево»`);
console.log("-".repeat(wid[0] + wid[1] + wid[2] + 30));
for (const r of rows) console.log(`${pad(r[0], wid[0])}  ${pad(r[1], wid[1])}  ${pad(r[2], wid[2])}  ${r[3]}`);
console.log(`\nв таблице зеркальных ${MIR.length} типов: ${MIR.map(x => { const e = ds.find(([, v]) => v === x); return NAMES[e && e[0]] || x.toString(16); }).join(", ")}`);
