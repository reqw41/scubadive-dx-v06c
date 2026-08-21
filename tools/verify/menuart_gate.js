// ГЕЙТ УКРАШЕНИЙ СТАРТОВОГО МЕНЮ.
//
// Меры (все на одном прогоне, боевой путь -DNOTITLE):
//   Z. DrawMenuArt не пишет в зону (0xC000..0xFFFF, lo 192..255);
//   P. не пишет в столбцы панели 24..31;
//   T. знакоместа текста совпадают со снимком НА ВХОДЕ в DrawMenuArt
//      (спрайты вокруг текста, а не поверх);
//   G. украшения присутствуют: тело осьминога в обеих плоскостях ненулевое.
//
// Считаются записи, НАЧАВШИЕСЯ в измеряемом объекте (PC в DrawMenuArt,
// адрес в зоне / на панели) — не «любая запись с lo>=192» (DmaFl лежит
// по адресу с lo 0xE8 и это не зона).
//
// Негативы (каждый краснеет свою меру):
//   MENUART_ZONE=1   — строка первого спрайта = 0: блит идёт в зону;
//   MENUART_PANEL=1  — столбец первого спрайта = 24: блит идёт на панель;
//   MENUART_TEXT=1   — первый спрайт на заголовок: текст перекрыт;
//   MENUART_NOART=1  — RET вместо DrawMenuArt: осьминога нет;
//   MENUART_EMPTY=1  — не доходить до меню: выборка пуста.
//
//   node tools/verify/menuart_gate.js [каталог]
"use strict";
const fs = require("fs"), path = require("path");
const { make, readSym } = require("./harness.js");
const ROOT = path.resolve(__dirname, "../..");
const B = process.env.BUILD_DIR || "build";
const DIR = process.argv[2] || `${ROOT}/${B}/evnt`;
const ZONE = process.env.MENUART_ZONE === "1";
const PANEL = process.env.MENUART_PANEL === "1";
const TEXT = process.env.MENUART_TEXT === "1";
const NOART = process.env.MENUART_NOART === "1";
const EMPTY = process.env.MENUART_EMPTY === "1";

for (const f of ["scuba.rom", "scubacod1.sym"])
  if (!fs.existsSync(`${DIR}/${f}`)) {
    console.log(`нет ${DIR}/${f} — собери DET=1 SRC=src8080 GEOM=1 ZONE=1 EVICT=1 NOTITLE=1 OUT=${B}/evnt`);
    process.exit(2);
  }

const S = readSym(`${DIR}/scubacod1.sym`);
for (const n of ["LEE2C", "LEDFE", "DrawMenuArt", "DrawMenuArtEnd", "MenuArtTab"])
  if (S[n] == null) { console.log(`нет метки ${n}`); process.exit(2); }

const TEXTBOX = [
  { r: 9,  c: 2, w: 20, h: 2 },
  { r: 12, c: 1, w: 21, h: 1 },
  { r: 13, c: 0, w: 24, h: 1 },
  { r: 16, c: 0, w: 9,  h: 1 },
  { r: 17, c: 0, w: 23, h: 1 },
  { r: 19, c: 0, w: 22, h: 1 },
  { r: 20, c: 0, w: 11, h: 1 },
  { r: 21, c: 2, w: 18, h: 1 },
  { r: 22, c: 0, w: 11, h: 1 },
  { r: 23, c: 2, w: 14, h: 1 },
  { r: 26, c: 4, w: 17, h: 1 },
  { r: 29, c: 0, w: 24, h: 1 },
  { r: 30, c: 0, w: 24, h: 1 },
];

function grabText(m) {
  const o = [];
  for (const t of TEXTBOX)
    for (let r = 0; r < t.h; r++)
      for (let c = 0; c < t.w; c++)
        for (let py = 0; py < 8; py++) {
          const lo = 255 - ((t.r + r) * 8 + py);
          o.push(m.rd(0xC000 + (t.c + c) * 256 + lo));
        }
  return Buffer.from(o);
}

const m = make(`${DIR}/scuba.rom`, { cpu: "i8080" });
m.onPc(S.LEDFE, () => {
  if (ZONE) m.wr(S.MenuArtTab + 2, 0);            // row = 0 → зона
  if (PANEL) m.wr(S.MenuArtTab + 1, 24);           // col = 24 → панель
  if (TEXT) { m.wr(S.MenuArtTab, 2); m.wr(S.MenuArtTab + 1, 2); m.wr(S.MenuArtTab + 2, 9); }
  if (NOART) m.wr(S.DrawMenuArt, 0xC9);
});

let before = null, artW = 0, artZone = 0, artPanel = 0;
m.onPc(S.DrawMenuArt, () => { if (!before) before = grabText(m); });
const ow = m.memory.write.bind(m.memory);
m.memory.write = (a, v, st) => {
  a &= 0xffff;
  const pc = m.cpu.pc & 0xffff;
  if (!EMPTY && pc >= S.DrawMenuArt && pc < S.DrawMenuArtEnd && a >= 0xC000) {
    artW++;
    const lo = a & 255, col = (a >> 8) & 31;
    if (lo >= 192) artZone++;
    if (col >= 24) artPanel++;
  }
  return ow(a, v, st);
};

let menu = false;
m.onPc(S.LEE2C, () => { menu = true; });
if (!EMPTY) {
  for (let i = 0; i < 3000 && !menu; i++) m.step();
  for (let i = 0; i < 8; i++) m.step();
}

let fail = 0, checks = 0;
const chk = (ok, msg) => { checks++; if (ok) console.log("  ok      " + msg);
                           else { fail++; console.log("  ПРОВАЛ  " + msg); } };

if (!menu || !before) {
  console.log(`  ПРОВАЛ  ПУСТАЯ ВЫБОРКА: меню ${menu}, снимок текста ${!!before}`);
  console.log("ГЕЙТ НЕДЕЙСТВИТЕЛЕН");
  process.exit(1);
}

const after = grabText(m);
let dirty = 0;
for (let i = 0; i < before.length; i++) if (before[i] !== after[i]) dirty++;

// Тело осьминога: знакоместо (19, 23), середина тайла — обе плоскости.
const octLo = 255 - (23 * 8 + 4);
const octC = m.rd(0xC000 + 19 * 256 + octLo);
const octE = m.rd(0xE000 + 19 * 256 + octLo);

console.log(`УКРАШЕНИЯ ${path.basename(DIR)}: записей блита ${artW}, в зону ${artZone}, ` +
            `на панель ${artPanel}; байт текста ${before.length}, перекрыто ${dirty}; ` +
            `осьминог C=0x${octC.toString(16)} E=0x${octE.toString(16)}`);

chk(artW > 100, `выборка блита не пуста: записей ${artW}`);
chk(artZone === 0, `Z: ноль записей блита в зону (lo 192..255): ${artZone}`);
chk(artPanel === 0, `P: ноль записей блита в столбцы 24..31: ${artPanel}`);
chk(dirty === 0, `T: знакоместа текста не перекрыты: ${dirty} из ${before.length}`);
chk(octC !== 0 && octE !== 0, `G: осьминог на месте (обе плоскости): C=${octC} E=${octE}`);

console.log(fail ? `ГЕЙТ КРАСНЫЙ: ${fail} из ${checks}` : `ГЕЙТ ЗЕЛЁНЫЙ: все ${checks} проверки`);
process.exit(fail ? 1 : 0);
