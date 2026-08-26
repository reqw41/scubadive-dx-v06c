// ЛИСТ СПРАЙТОВ СУЩЕСТВ: html со всеми кадрами каждого типа.
// Имя и адрес кадра берутся из ШАБЛОНА записи (DEFW SprXxx,SprXxx), размеры —
// из дескриптора типа, на который шаблон ссылается последним словом.
// Формат кадра на Векторе: байт = 8 пикселей по горизонтали, следующий байт —
// следующая строка ВНИЗ внутри столбца; столбцы идут слева направо.
//   node tools/verify/sprite_sheet.js <каталог сборки> <out.html>
"use strict";
const fs = require("fs"), path = require("path"), zlib = require("zlib");
const ROOT = path.resolve(__dirname, "../..");
const DIR = process.argv[2] || `${ROOT}/build/pbsky`;
const OUT = process.argv[3] || `${ROOT}/sprites.html`;

const S = {};
for (const f of ["scubacod0.sym", "scubacod1.sym"])
  for (const l of fs.readFileSync(`${DIR}/${f}`, "latin1").split("\n")) {
    const m = /^(\S+?):?\s+EQU\s+(?:0x)?([0-9A-Fa-f]+)/.exec(l);
    if (m) S[m[1]] = parseInt(m[2], 16);
  }
const cod1 = fs.readFileSync(`${DIR}/scubacod1.bin`);
const LO = S.SCUBACOD0_END;
const at = a => (a >= LO && a - LO < cod1.length) ? cod1[a - LO] : 0;

// --- разбор исходника: шаблоны записей ---------------------------------------
const src = fs.readFileSync(`${ROOT}/src8080/scubacodb.asm`, "utf8").split("\n");
const items = [];
for (let i = 0; i < src.length; i++) {
  const t = /Record template for .*record - (.+)$/.exec(src[i]);
  if (!t) continue;
  const name = t[1].trim();
  const body = src.slice(i + 1, i + 12).join("\n");
  // спрайты названы по-разному: SprBoat у лодки, L8D43 у медузы — ловим по
  // комментарию автора, а не по имени метки
  const spr = /DEFW\s+(\w+),\s*\w+\s*;\s*sprite address/.exec(body);
  const desc = /DEFW\s+(LC[0-9A-F]{3})\s*;\s*object record/.exec(body);
  if (!spr || !desc) continue;
  const d = S[desc[1]];
  if (d === undefined || S[spr[1]] === undefined) continue;
  // один тип объявлен и 21-, и 26-байтовым шаблоном — кадр тот же, не дублируем
  if (items.some(x => x.addr === S[spr[1]])) continue;
  items.push({ name, spr: spr[1], addr: S[spr[1]], desc: desc[1],
               w: at(d + 7), h: at(d + 9) });
}

// --- PNG ---------------------------------------------------------------------
const crcT = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const crc = b => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function png(W, H, rgb) {
  const raw = Buffer.alloc(H * (W * 3 + 1));
  for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; rgb.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3); }
  const chunk = (type, data) => { const b = Buffer.alloc(8 + data.length + 4); b.writeUInt32BE(data.length, 0); b.write(type, 4); data.copy(b, 8);
    b.writeUInt32BE(crc(Buffer.concat([Buffer.from(type), data])), 8 + data.length); return b; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr),
                        chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
// цвет спрайта — бледно-жёлтый ColorText на чёрном
function render(addr, wBytes, hCells, scale) {
  const rows = hCells * 8, W = wBytes * 8, H = rows;
  const rgb = Buffer.alloc(W * H * 3);
  for (let col = 0; col < wBytes; col++)
    for (let r = 0; r < rows; r++) {
      const v = at(addr + col * rows + r);
      for (let b = 7; b >= 0; b--) {
        const on = (v >> b) & 1, x = col * 8 + (7 - b), o = (r * W + x) * 3;
        rgb[o] = on ? 252 : 0; rgb[o + 1] = on ? 252 : 0; rgb[o + 2] = on ? 170 : 0;
      }
    }
  // масштаб
  const W2 = W * scale, H2 = H * scale, big = Buffer.alloc(W2 * H2 * 3);
  for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
    const so = (((y / scale) | 0) * W + ((x / scale) | 0)) * 3, doff = (y * W2 + x) * 3;
    big[doff] = rgb[so]; big[doff + 1] = rgb[so + 1]; big[doff + 2] = rgb[so + 2];
  }
  return { png: png(W2, H2, big), W, H };
}

// Осьминог живёт вне системы записей: ни дескриптора, ни шаблона у него нет,
// его рисует отдельный тракт DrawOctopusSprite. Размеры зашиты там же в коде:
// 6 знакомест в ширину, 4 в высоту.
if (S.SprOctopus !== undefined)
  items.push({ name: "Octopus", spr: "SprOctopus", addr: S.SprOctopus, desc: "—", w: 6, h: 4 });

let html = `<title>Существа Scuba Dive</title>
<style>body{background:#111;color:#ddd;font:14px/1.5 system-ui,sans-serif;padding:24px}
h1{font-size:20px;font-weight:600;margin:0 0 4px}p{color:#888;margin:0 0 24px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:20px}
.c{background:#1b1b1b;border:1px solid #2c2c2c;border-radius:8px;padding:12px}
.c img{display:block;image-rendering:pixelated;background:#000;border-radius:4px;margin-bottom:8px}
.n{font-weight:600}.m{color:#888;font-size:12px;font-family:ui-monospace,monospace}</style>
<h1>Существа Scuba Dive</h1><p>Кадры взяты из образа ${path.basename(DIR)}; размеры — из дескрипторов типов.</p><div class="grid">`;
for (const it of items) {
  if (!it.w || !it.h) continue;
  const r = render(it.addr, it.w, it.h, 3);
  html += `<div class="c"><img src="data:image/png;base64,${r.png.toString("base64")}">` +
          `<div class="n">${it.name}</div><div class="m">${it.spr} @ 0x${it.addr.toString(16)}<br>${r.W}×${r.H} px · ${it.desc}</div></div>`;
}
html += `</div>`;
fs.writeFileSync(OUT, html);
console.log(`${items.length} типов -> ${OUT}`);
for (const it of items) console.log(`  ${it.name.padEnd(26)} ${it.spr.padEnd(14)} ${it.w}×${it.h} знакомест`);
