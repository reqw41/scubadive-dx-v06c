// Предпросмотр украшений стартового меню. НИЧЕГО не шьёт в образ:
// доводит боевую сборку до LEE2C, снимает видеопамять, блитует спрайты
// из той же памяти поверх копии и пишет PNG. Палитра — из образа, либо
// подмена слотов 0..3 для вариантов PAL=A|B|C (те же байты, что CLRSET).
//
//   node tools/verify/menuart_preview.js [каталог-сборки]
"use strict";
const fs = require("fs"), path = require("path"), zlib = require("zlib");
const { make, readSym } = require("./harness.js");

const ROOT = path.resolve(__dirname, "../..");
const DIR = process.argv[2] || `${ROOT}/build/menuart`;
const OUT = `${ROOT}/docs`;

const PAL = {
  def: [0x00, 0xDB, 0xBF, 0x07],
  A:   [0x00, 0xA8, 0x2D, 0x05],
  B:   [0x00, 0xF8, 0x3F, 0x07],
  C:   [0x00, 0xC0, 0xFF, 0x07],
};
const vc = p => [(p & 7) * 36, ((p >> 3) & 7) * 36, ((p >> 6) & 3) * 85];

for (const f of ["scuba.rom", "scubacod0.sym", "scubacod1.sym"])
  if (!fs.existsSync(`${DIR}/${f}`)) {
    console.log(`нет ${DIR}/${f} — собери SRC=src8080 GEOM=1 ZONE=1 EVICT=1 NOTITLE=1 OUT=build/menuart`);
    process.exit(2);
  }

const S = Object.assign({}, readSym(`${DIR}/scubacod0.sym`), readSym(`${DIR}/scubacod1.sym`));
for (const n of ["LEE2C", "SprBoat", "SprOctopus", "SprDiverSit", "L6364", "L6A26",
                 "L7BCE", "L8254", "L8D43", "L83D8", "L7748", "L6000", "LB1B4",
                 "LB18C", "LB17C", "L798A", "SCUBADIVR_SRC", "MENU_ROWS"])
  if (S[n] == null) { console.log(`нет метки ${n}`); process.exit(2); }
if (S.MENU_ROWS !== 8) { console.log(`MENU_ROWS=${S.MENU_ROWS}, нужен 8`); process.exit(2); }

const m = make(`${DIR}/scuba.rom`, { cpu: "i8080" });
let menu = false;
m.onPc(S.LEE2C, () => { menu = true; });
let f = 0;
for (; f < 3000 && !menu; f++) m.step();
if (!menu) { console.log("НЕ ДОШЛИ ДО МЕНЮ"); process.exit(2); }
for (let i = 0; i < 8; i++) m.step();          // дорисовать печать

const bytes = (a, n) => { const b = Buffer.alloc(n); for (let i = 0; i < n; i++) b[i] = m.rd(a + i); return b; };
const shot = () => {
  const C = Buffer.alloc(32 * 256), E = Buffer.alloc(32 * 256);
  for (let col = 0; col < 32; col++)
    for (let lo = 0; lo < 256; lo++) {
      C[col * 256 + lo] = m.rd(0xC000 + col * 256 + lo);
      E[col * 256 + lo] = m.rd(0xE000 + col * 256 + lo);
    }
  return { C, E };
};

const BASE = shot();

// Знакоместа текста меню (после сдвига +8). Столбец + длина, строка.
const TEXT = [
  { r: 9,  c: 2, w: 20, h: 2 },   // SCUBA DIVE 2x2
  { r: 12, c: 1, w: 21, h: 1 },   // SPECTRUM 1983 DURRELL
  { r: 13, c: 0, w: 24, h: 1 },   // I8080 PORT...
  { r: 16, c: 0, w: 9,  h: 1 },   // CONTROLS:
  { r: 17, c: 0, w: 23, h: 1 },   // KEYBOARD AND JOYSTICK-P
  { r: 19, c: 0, w: 22, h: 1 },   // ROTATE:...
  { r: 20, c: 0, w: 11, h: 1 },   // ACCELERATE:
  { r: 21, c: 2, w: 18, h: 1 },   // UP/US/...
  { r: 22, c: 0, w: 11, h: 1 },   // DECELERATE:
  { r: 23, c: 2, w: 14, h: 1 },   // DOWN/SPACE/TAB
  { r: 26, c: 4, w: 17, h: 1 },   // SKILL SELECTED
  { r: 29, c: 0, w: 24, h: 1 },   // PRESS 1..4...
  { r: 30, c: 0, w: 24, h: 1 },   // ACCELERATE TO START
];

const SPR = {
  boat:   { d: bytes(S.SprBoat, 168),     w: 7, h: 24, fmt: "row" },
  octopus:{ d: bytes(S.SprOctopus, 192),  w: 6, h: 32, fmt: "oct" },
  sit:    { d: bytes(S.SprDiverSit, 32),  w: 2, h: 16, fmt: "row" },
  swim:   { d: bytes(S.SCUBADIVR_SRC, 32),w: 2, h: 16, fmt: "row" },
  // угол 1 — плывёт вправо-вверх, лучше читается на витрине
  swim1:  { d: bytes(S.SCUBADIVR_SRC + 128, 32), w: 2, h: 16, fmt: "row" },
  fish:   { d: bytes(S.L6364, 96),        w: 6, h: 16, fmt: "row" },
  shark:  { d: bytes(S.L6A26, 168),       w: 7, h: 24, fmt: "row" },
  longf:  { d: bytes(S.L7BCE, 32),        w: 4, h: 8,  fmt: "row" },
  round:  { d: bytes(S.L8254, 16),        w: 2, h: 8,  fmt: "row" },
  meduza: { d: bytes(S.L8D43, 16),        w: 1, h: 16, fmt: "row" },
  squid:  { d: bytes(S.L83D8, 112),       w: 7, h: 16, fmt: "row" },
  cloud:  { d: bytes(S.L7748, 72),        w: 3, h: 24, fmt: "row" },
  smsq:   { d: bytes(S.L6000, 24),        w: 3, h: 8,  fmt: "row" },
  chest:  { d: bytes(S.LB1B4, 16),        w: 2, h: 8,  fmt: "row" },
  shell:  { d: Buffer.concat([bytes(S.LB17C, 16), bytes(S.LB18C, 16)]),
            w: 2, h: 16, fmt: "row" },
  eel:    { d: bytes(S.L798A, 24),        w: 3, h: 8,  fmt: "row" },
};

function blit(vram, spr, col, row, plane) {
  // plane: 1 = E000 (индекс 1), 2 = C000 (индекс 2), 3 = обе (индекс 3)
  const dest = plane & 2 ? vram.C : null;
  const destE = plane & 1 ? vram.E : null;
  const put = (c, vr, pix) => {
    if (!pix) return;
    if (c < 0 || c > 23 || vr < 64 || vr > 255) throw new Error(`выход col=${c} vr=${vr}`);
    const lo = 255 - vr;
    if (lo >= 192) throw new Error(`зона lo=${lo} col=${c}`);
    if (dest) dest[c * 256 + lo] |= pix;
    if (destE) destE[c * 256 + lo] |= pix;
  };
  if (spr.fmt === "oct") {
    let i = 0;
    for (let cr = 0; cr < 4; cr++)
      for (let c = 0; c < 6; c++)
        for (let py = 0; py < 8; py++)
          put(col + c, row * 8 + cr * 8 + py, spr.d[i++]);
    return;
  }
  let i = 0;
  for (let py = 0; py < spr.h; py++)
    for (let c = 0; c < spr.w; c++)
      put(col + c, row * 8 + py, spr.d[i++]);
}

function textHits(vram) {
  let n = 0, dirty = 0;
  for (const t of TEXT)
    for (let r = 0; r < t.h; r++)
      for (let c = 0; c < t.w; c++)
        for (let py = 0; py < 8; py++) {
          const vr = (t.r + r) * 8 + py, lo = 255 - vr;
          const a = t.c + c;
          const was = BASE.C[a * 256 + lo];
          if (was) {
            n++;
            if (vram.C[a * 256 + lo] !== was) dirty++;
          }
        }
  return { n, dirty };
}

function zoneHits(vram) {
  let n = 0;
  for (let col = 0; col < 32; col++)
    for (let lo = 192; lo < 256; lo++)
      if (vram.C[col * 256 + lo] !== BASE.C[col * 256 + lo] ||
          vram.E[col * 256 + lo] !== BASE.E[col * 256 + lo]) n++;
  return n;
}

function panelHits(vram) {
  let n = 0;
  for (let col = 24; col < 32; col++)
    for (let lo = 0; lo < 192; lo++)
      if (vram.C[col * 256 + lo] !== BASE.C[col * 256 + lo] ||
          vram.E[col * 256 + lo] !== BASE.E[col * 256 + lo]) n++;
  return n;
}

const crcT = (() => { const t = []; for (let n = 0; n < 256; n++) {
  let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const crc = b => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 0xff] ^ (c >>> 8); return c ^ 0xffffffff; };
const ch = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length);
  const tt = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(tt) >>> 0); return Buffer.concat([l, tt, c]); };

function png(vram, palBytes, file) {
  const pal = palBytes.map(vc);
  const W = 256, H = 192, rgb = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    const lo = 191 - y;
    for (let col = 0; col < 32; col++) {
      const a = vram.C[col * 256 + lo], b = vram.E[col * 256 + lo];
      for (let bit = 7; bit >= 0; bit--) {
        const c = pal[(((a >> bit) & 1) << 1) | ((b >> bit) & 1)];
        const x = col * 8 + (7 - bit), o = (y * W + x) * 3;
        rgb[o] = c[0]; rgb[o + 1] = c[1]; rgb[o + 2] = c[2];
      }
    }
  }
  const raw = Buffer.alloc(H * (W * 3 + 1));
  for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; rgb.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3); }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(H, 4); ih[8] = 8; ih[9] = 2;
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    ch("IHDR", ih), ch("IDAT", zlib.deflateSync(raw)), ch("IEND", Buffer.alloc(0)),
  ]));
}

function clone(v) { return { C: Buffer.from(v.C), E: Buffer.from(v.E) }; }

// Плоскости: 1 = вода/панель (индекс 1), 2 = текст/спрайты (индекс 2), 3 = рельеф (индекс 3).
const INK_WATER = 1, INK_SPRITE = 2, INK_RELIEF = 3;

const V1 = [
  // лодка справа под заголовком (полоса 14..16, CONTROLS занимает 0..8)
  { s: SPR.boat,   c: 16, r: 14, p: INK_SPRITE },
  { s: SPR.sit,    c: 18, r: 14, p: INK_SPRITE },
  // осьминог — обязателен, правее DECELERATE/DOWN, 4 ряда
  { s: SPR.octopus,c: 17, r: 22, p: INK_RELIEF },
  { s: SPR.meduza, c: 22, r: 8,  p: INK_WATER },
  { s: SPR.meduza, c: 0,  r: 8,  p: INK_WATER },
  { s: SPR.round,  c: 0,  r: 11, p: INK_WATER },
  { s: SPR.fish,   c: 0,  r: 27, p: INK_WATER },
  { s: SPR.swim1,  c: 21, r: 27, p: INK_SPRITE },
  { s: SPR.longf,  c: 0,  r: 18, p: INK_WATER },
  { s: SPR.chest,  c: 21, r: 18, p: INK_SPRITE },
  { s: SPR.shell,  c: 0,  r: 24, p: INK_SPRITE },
];

const V2 = [
  // «аквариум»: украшения цветом воды, осьминог красный, текст жёлтый не тронут
  { s: SPR.boat,   c: 16, r: 14, p: INK_WATER },
  { s: SPR.sit,    c: 18, r: 14, p: INK_SPRITE },   // герой как в игре — жёлтый
  { s: SPR.octopus,c: 17, r: 22, p: INK_RELIEF },
  { s: SPR.shark,  c: 9,  r: 14, p: INK_WATER },
  { s: SPR.meduza, c: 22, r: 8,  p: INK_WATER },
  { s: SPR.meduza, c: 0,  r: 10, p: INK_WATER },
  { s: SPR.fish,   c: 1,  r: 27, p: INK_WATER },
  { s: SPR.swim1,  c: 21, r: 27, p: INK_SPRITE },
  { s: SPR.round,  c: 21, r: 11, p: INK_WATER },
  { s: SPR.smsq,   c: 0,  r: 18, p: INK_WATER },
  { s: SPR.eel,    c: 20, r: 18, p: INK_WATER },
  { s: SPR.chest,  c: 0,  r: 24, p: INK_SPRITE },
  { s: SPR.shell,  c: 2,  r: 24, p: INK_SPRITE },
];

const V3 = [
  // плотнее, крупный кальмар и стая; все существа жёлтые «как в игре»
  { s: SPR.boat,   c: 16, r: 14, p: INK_SPRITE },
  { s: SPR.sit,    c: 18, r: 14, p: INK_SPRITE },
  { s: SPR.octopus,c: 17, r: 22, p: INK_SPRITE },
  { s: SPR.cloud,  c: 0,  r: 24, p: INK_SPRITE },
  { s: SPR.squid,  c: 0,  r: 27, p: INK_SPRITE },
  { s: SPR.swim1,  c: 21, r: 27, p: INK_SPRITE },
  { s: SPR.meduza, c: 22, r: 8,  p: INK_SPRITE },
  { s: SPR.longf,  c: 0,  r: 18, p: INK_SPRITE },
  { s: SPR.round,  c: 0,  r: 11, p: INK_SPRITE },
  { s: SPR.chest,  c: 21, r: 18, p: INK_SPRITE },
];

function compose(list) {
  const v = clone(BASE);
  for (const x of list) blit(v, x.s, x.c, x.r, x.p);
  const t = textHits(v), z = zoneHits(v), p = panelHits(v);
  return { v, t, z, p };
}

const palRom = [0, 1, 2, 3].map(i => m.rd(S.PaletteGame + i));
console.log("палитра образа: " + palRom.map(x => "0x" + x.toString(16).padStart(2, "0")).join(" "));

png(BASE, palRom, `${OUT}/menuart_now.png`);
console.log("снимок docs/menuart_now.png (голое меню)");

function report(name, r) {
  const ok = r.t.dirty === 0 && r.z === 0 && r.p === 0;
  console.log(`${name}: текст ${r.t.n} байт, перекрыто ${r.t.dirty}; зона ${r.z}; панель ${r.p}` +
              (ok ? " — ЧИСТО" : " — СТОП"));
  if (!ok) process.exitCode = 2;
  return ok;
}

const R1 = compose(V1); report("v1", R1); png(R1.v, palRom, `${OUT}/menuart_v1.png`);
const R2 = compose(V2); report("v2", R2); png(R2.v, palRom, `${OUT}/menuart_v2.png`);
const R3 = compose(V3); report("v3", R3); png(R3.v, palRom, `${OUT}/menuart_v3.png`);

for (const [k, p] of [["A", PAL.A], ["B", PAL.B], ["C", PAL.C]]) {
  png(R2.v, p, `${OUT}/menuart_v2_pal${k}.png`);
  console.log(`снимок docs/menuart_v2_pal${k}.png`);
}

console.log("готово");
