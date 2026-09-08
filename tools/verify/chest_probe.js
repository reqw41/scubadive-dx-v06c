"use strict";
// СУНДУК: снимок до и после взятия. Находим на экране запись статики с битом 6
// («сундук»), снимаем её клетки, ставим бит 3 («взят»), заставляем перерисовать
// экран и снимаем снова. Проверяет OPENCHEST: рисунок обязан смениться, и
// полный обязан быть жёлтым (0xC000), опустошённый — синим (0xE000).
//   node tools/verify/chest_probe.js <rom> <sym> <out_prefix> [level=1]
const fs = require("fs"), zlib = require("zlib");
const { reachGame, KEY } = require("./drive.js");
const [rom, sym, pre] = process.argv.slice(2, 5);
// CHEST_GATE=1 — режим гейта: тайл ОБЯЗАН смениться после взятия (иначе КРАСНЫЙ).
const LVL = parseInt(process.argv[5] || "1", 10);
const g = reachGame(rom, sym, { cpu: "i8080", level: LVL, seed: 0x0167 });
const m = g.m, S = g.S;
const S0 = require("./harness.js").readSym(rom.replace(/scuba[^/]*\.rom$/, "scubacod0.sym"));
const vc = p => [(p & 7) * 36, ((p >> 3) & 7) * 36, ((p >> 6) & 3) * 85];
const PAL = [0, 1, 2, 3].map(i => vc(m.rd(S0.PaletteGame + i)));
const crcT = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const crc = b => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 0xff] ^ (c >>> 8); return c ^ 0xffffffff; };
const ch = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const tt = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(tt) >>> 0); return Buffer.concat([l, tt, c]); };
function shot(out, x0, y0, w, h, sc) {
  const rgb = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) { const lo = 255 - (y0 + y);
    for (let x = 0; x < w; x++) { const col = (x0 + x) >> 3, bit = 7 - ((x0 + x) & 7);
      const a = m.rd(0xC000 + col * 256 + lo), b = m.rd(0xE000 + col * 256 + lo);
      const c = PAL[(((a >> bit) & 1) << 1) | ((b >> bit) & 1)], o = (y * w + x) * 3;
      rgb[o] = c[0]; rgb[o + 1] = c[1]; rgb[o + 2] = c[2]; } }
  const W = w * sc, H = h * sc, big = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const s = ((y / sc | 0) * w + (x / sc | 0)) * 3, d = (y * W + x) * 3;
    big[d] = rgb[s]; big[d + 1] = rgb[s + 1]; big[d + 2] = rgb[s + 2]; }
  const raw = Buffer.alloc(H * (W * 3 + 1));
  for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; big.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3); }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(H, 4); ih[8] = 8; ih[9] = 2;
  fs.writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ch("IHDR", ih), ch("IDAT", zlib.deflateSync(raw)), ch("IEND", Buffer.alloc(0))]));
}
// TableStatics: записи по 4 байта — флаги, столбец 0..255, строка 0..255 (бит 7 флагов
// = конец списка, бит 6 = сундук, бит 3 = уже взят). Экран перевозим К СУНДУКУ
// (L5B03 — положение экрана на мини-карте), дайвера не трогаем.
const TS = S.TableStatics; let found = null, n = 0;
for (let a = TS; a < TS + 4 * 200; a += 4) {
  const fl = m.rd(a); if (fl & 0x80) break; n++;
  if ((fl & 0x40) && !(fl & 8)) { found = { addr: a, col: m.rd(a + 1), row: m.rd(a + 2), fl }; break; }
}
if (!found) { console.log(`сундука в таблице нет (записей ${n})`); process.exit(2); }
console.log(`сундук: запись ${found.addr.toString(16)}, карта (${found.col},${found.row}), флаги ${found.fl.toString(16)}, всего предметов ${n}`);
// экран мини-карты: 8 клеток карты на экран по столбцам и строкам
const scol = Math.max(0, Math.min(31, (found.col >> 3) - 1)), srow = Math.max(0, Math.min(31, found.row >> 3));
const redraw = () => { m.wr(S.L5B03, scol); m.wr(S.L5B03 + 1, srow);
  m.cpu.set_h(srow); m.cpu.set_l(scol);
  const sp = (m.cpu.sp - 2) & 0xffff; m.wr(sp, S.LD9C0 & 0xff); m.wr(sp + 1, S.LD9C0 >> 8);
  m.cpu.sp = sp; m.cpu.pc = S.DrawGameScr;
  for (let i = 0; i < 4000 && (m.cpu.pc & 0xffff) !== S.LD9C0; i++) m.step(); };
redraw();
// где сундук оказался на экране: ищем его запись в LB07D
const T = S.LB07D; let sc = null;
for (let i = 0; i < 48; i++) { const e = T + i * 4;
  if ((m.rd(e) | (m.rd(e + 1) << 8)) === found.addr) { sc = { col: m.rd(e + 2), row: m.rd(e + 3) }; break; } }
if (!sc) { console.log("сундук не попал в список на экране"); process.exit(2); }
console.log(`на экране: столбец ${sc.col}, строка ${sc.row}`);
found.col = sc.col; found.row = sc.row;
const x0 = Math.max(0, found.col * 8 - 8), y0 = Math.max(0, found.row * 8 - 8);
const rect = () => { const b = []; for (let y = 0; y < 24; y++) { const lo = 255 - (y0 + y);
  for (let c = x0 >> 3; c < (x0 >> 3) + 4; c++) { b.push(m.rd(0xC000 + c * 256 + lo), m.rd(0xE000 + c * 256 + lo)); } } return b; };
const before = rect();
if (pre) shot(`${pre}_shut.png`, x0, y0, 32, 24, 8);
m.wr(found.addr, found.fl | 8);           // «взят»
m.cpu.set_h(m.rd(S.L5B03 + 1)); m.cpu.set_l(m.rd(S.L5B03));
const sp = (m.cpu.sp - 2) & 0xffff; m.wr(sp, S.LD9C0 & 0xff); m.wr(sp + 1, S.LD9C0 >> 8);
m.cpu.sp = sp; m.cpu.pc = S.DrawGameScr;
for (let i = 0; i < 3000 && (m.cpu.pc & 0xffff) !== S.LD9C0; i++) m.step();
const after = rect();
if (pre) shot(`${pre}_open.png`, x0, y0, 32, 24, 8);
const diff = before.reduce((n, v, i) => n + (v !== after[i] ? 1 : 0), 0);
// КРАСНЫЙ = индекс 3 = биты в ОБЕИХ плоскостях. Пары в rect() идут (C, E) подряд,
// поэтому «красный» — это побайтное равенство чётных и нечётных при непустом рисунке.
// Смотрим ТОЛЬКО две клетки самого сундука. По изменившимся байтам считать
// нельзя: на ур.4 в окно попадает соседняя живность, она за две перерисовки
// уезжает, и её байты тоже «изменились». Окно rect(): 24 строки × 4 столбца от
// (x0>>3), сундук — столбцы 1 и 2 окна, строки 8..15 (y0 = строка*8 − 8).
// ЦВЕТ = ПЛОСКОСТЬ: жёлтый лежит в 0xC000, синий в 0xE000. Полный обязан быть
// жёлтым, пустой — синим, и рисунок обязан быть ТОТ ЖЕ: байты просто переезжают
// из плоскости в плоскость.
const ink = (() => { let rows = 0, yellow = 0, blue = 0, same = 0;
  for (let y = 8; y <= 15; y++) for (const cx of [1, 2]) {
    const i = (y * 4 + cx) * 2;
    if (!(before[i] | before[i + 1] | after[i] | after[i + 1])) continue;   // пустая строка рисунка
    rows++;
    if (before[i] && !before[i + 1]) yellow++;      // до: только 0xC000
    if (!after[i] && after[i + 1]) blue++;          // после: только 0xE000
    if (before[i] && before[i] === after[i + 1]) same++;   // тот же рисунок, но в другой плоскости
  }
  return { rows, yellow, blue, same }; })();
if (process.env.CHEST_GATE === "1") {
  const inject = process.env.CHEST_INJECT === "1";
  const okY = !inject && ink.rows > 0 && ink.yellow === ink.rows;
  const okB = !inject && ink.blue === ink.rows && ink.same === ink.rows;
  const ok = !inject && diff > 0 && okY && okB;
  console.log(`  ${diff > 0 && !inject ? "ok     " : "ПРОВАЛ "} пустой сундук выглядит иначе: байт изменилось ${inject ? 0 : diff}`);
  console.log(`  ${okY ? "ok     " : "ПРОВАЛ "} ПОЛНЫЙ жёлтый: байтовых строк рисунка ${ink.rows}, только в 0xC000 ${inject ? 0 : ink.yellow}`);
  console.log(`  ${okB ? "ok     " : "ПРОВАЛ "} ПУСТОЙ синий тем же рисунком: только в 0xE000 ${inject ? 0 : ink.blue}/${ink.rows}, рисунок совпал ${inject ? 0 : ink.same}/${ink.rows}`);
  console.log(ok ? "ГЕЙТ ЗЕЛЁНЫЙ: полный сундук жёлтый, опустошённый синий" : "ГЕЙТ КРАСНЫЙ");
  process.exit(ok ? 0 : 1);
}
console.log("снимки:", `${pre}_shut.png`, `${pre}_open.png`, "байт изменилось", diff);
