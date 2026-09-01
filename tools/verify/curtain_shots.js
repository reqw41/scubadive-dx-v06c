"use strict";
// ПЛЁНКА ПЕРЕХОДА: как выглядит перерисовка экрана в середине, а не в конце.
// Гейт доказывает, что итоговая картинка не изменилась; смысл же правки — в том,
// что видно ПОКА она идёт. Здесь перерисовка заводится принудительно (автопилот
// стенда границу экрана не пересекает — разбор в oracle.js) и снимается через
// равные промежутки тактов.
//
//   node tools/verify/curtain_shots.js <rom> <sym> <каталог> <направление 0..3> [снимков=8]
// Направление кладётся в cu_dir; у сборки с блочным обходом ячейки нет, и оно
// просто игнорируется — снимки покажут её собственный порядок.
// СНАЧАЛА РИСУЕТСЯ ЭКРАН «ОТКУДА», И ТОЛЬКО ПОТОМ СНИМАЕТСЯ ПЕРЕХОД НА «КУДА».
// Иначе перерисовка кладёт поверх той же самой картинки, и на плёнке не видно
// ничего: кадры отличаются только тем, что уже нарисовано.
//   CS_FROM=столбец,строка   экран, с которого уходим (по умолчанию 10,1)
//   CS_TO=столбец,строка     экран, на который приходим (по умолчанию 24,0)
const fs = require("fs"), zlib = require("zlib"), path = require("path");
const { reachGame } = require("./drive.js");
const { readSym } = require("./harness.js");
const [rom, sym, outDir] = process.argv.slice(2, 5);
const DIR = parseInt(process.argv[5] || "0", 10);
const N = parseInt(process.argv[6] || "8", 10);
const S0 = readSym(path.join(path.dirname(sym), "scubacod0.sym"));

const crcT = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const crc = b => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 0xff] ^ (c >>> 8); return c ^ 0xffffffff; };
const ch = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const tt = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(tt) >>> 0); return Buffer.concat([l, tt, c]); };
function png(W, H, rgb) {
  const raw = Buffer.alloc(H * (W * 3 + 1));
  for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; rgb.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ch("IHDR", ihdr), ch("IDAT", zlib.deflateSync(raw)), ch("IEND", Buffer.alloc(0))]);
}
const vc = p => [(p & 7) * 36, ((p >> 3) & 7) * 36, ((p >> 6) & 3) * 85];

const g = reachGame(rom, sym, { cpu: "i8080", level: 4, seed: 0x0167 });
const m = g.m, S = g.S;
if (S0.PaletteGame == null) { console.log("нет метки PaletteGame"); process.exit(2); }
const PAL = [0, 1, 2, 3].map(i => vc(m.rd(S0.PaletteGame + i)));
// Видно то, что видно на железе: дисплейная строка 0 — это VRAM-строка 64
// (развёртка стоит в 0xBF с буста), значит снимаем y = 64..255.
const W = 256, H = 192;
function shot() {
  const rgb = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) for (let c = 0; c < 32; c++) {
    const lo = 255 - (y + 64);
    const p1 = m.rd(0xC000 + c * 256 + lo), p2 = m.rd(0xE000 + c * 256 + lo);
    for (let b = 0; b < 8; b++) {
      const v = (((p1 >> b) & 1) << 1) | ((p2 >> b) & 1);
      const o = (y * W + c * 8 + (7 - b)) * 3;
      rgb[o] = PAL[v][0]; rgb[o + 1] = PAL[v][1]; rgb[o + 2] = PAL[v][2];
    }
  }
  return rgb;
}

fs.mkdirSync(outDir, { recursive: true });
const FROM = (process.env.CS_FROM || "10,1").split(",").map(Number);
const TO = (process.env.CS_TO || "24,0").split(",").map(Number);
// СНИМКИ ОТМЕРЯЮТСЯ ПО ЧИСЛУ ОТРИСОВАННЫХ ТАЙЛОВ, А НЕ ПО ТАКТАМ. Тактов на
// перерисовку гуляет от захода к заходу на десятки тысяч (в неё попадают
// прерывания KEYINT), и деление фиксированной суммы на N давало неровную
// плёнку: первые кадры почти пустые, последние почти полные. Тайлов ровно
// FIELD_W*24 на перерисовку, и это одно и то же число у обоих обходов.
const TILES = 32 * 24;
let inForce = false, done = false, acc = 0, next = 0, k = 0, step = 0, saved = 0, tick = 0, phase = 0;
m.onPc(S.TileOne, () => {
  if (!inForce) return;
  acc++;
  if (acc >= next && k < N) { fs.writeFileSync(path.join(outDir, `s${k}.png`), png(W, H, shot())); k++; next += step; }
});
m.onPc(S.LD9C0, () => {
  if (inForce) {
    inForce = false;
    if (phase === 2) {
      done = true;
      while (k < N) { fs.writeFileSync(path.join(outDir, `s${k}.png`), png(W, H, shot())); k++; }
      m.wr(S.L5B03, saved & 0xff); m.wr(S.L5B03 + 1, (saved >> 8) & 0xff);
    }
    return;
  }
  if (done || ++tick < 60) return;
  if (phase === 0) {                       // экран «откуда» — рисуем молча
    saved = m.rdw(S.L5B03);
    phase = 1;
    m.wr(S.L5B03, FROM[0]); m.wr(S.L5B03 + 1, FROM[1]);
    m.cpu.set_h(FROM[1]); m.cpu.set_l(FROM[0]);
    m.cpu.call(S.DrawGameScr);
    return;
  }
  phase = 2;                               // переход «куда» — его и снимаем
  m.wr(S.L5B03, TO[0]); m.wr(S.L5B03 + 1, TO[1]);
  if (S.cu_dir !== undefined) m.wr(S.cu_dir, DIR);
  m.cpu.set_h(TO[1]); m.cpu.set_l(TO[0]);
  acc = 0; step = Math.floor(TILES / N); next = step; k = 0;
  inForce = true;
  m.cpu.call(S.DrawGameScr);
});
let guard = 0;
while (!done && guard < 3000000) { m.step(); guard++; }
console.log(done ? `снимков ${k} -> ${outDir}` : "перерисовка не состоялась");
process.exit(done ? 0 : 1);
