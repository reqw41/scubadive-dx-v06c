"use strict";
// ЗАМЕР НА ГЛУБИНЕ: дайвера не заставляем нырять (он тонет за 15-20 с и не
// успевает), а СТАВИМ вниз карты — в свободную воду, выбранную по карте
// занятости SCRATTR (02 = рельеф, туда нельзя). Экран переносим туда же.
//   node deep_probe.js <rom> <sym> [строка экрана=4] [окон=4]
const { reachGame, KEY } = require("./drive.js");
const [rom, sym] = process.argv.slice(2, 4);
const ROW = parseInt(process.argv[4] || "4", 10), WINS = parseInt(process.argv[5] || "4", 10);
const g = reachGame(rom, sym, { cpu: "i8080", level: 4, seed: 0x0167 });
const m = g.m, S = g.S, D = S.DiverObj, w = a => m.rd(a) | (m.rd(a + 1) << 8);
// сперва даём дайверу нормально уйти под воду (тяга), иначе он «в лодке»
for (let f = 0; f < 300; f++) { m.key(KEY.UP, f % 400 < 250); m.step(); }
m.key(KEY.UP, false);
if (S.god_on) m.wr(S.god_on, 1);              // кислород и рельеф не должны обрывать окно
const attr = (row, col) => { const a = ((row >> 3) | (row << 5)) & 0xff;
  return m.rd((((a & 0x1f) + (S.SCRATTR >> 8)) << 8) | ((a & 0xE0) | (col & 0x1f))); };
// переносим экран вниз и перерисовываем
const scol = m.rd(S.L5B03);
m.wr(S.L5B03, scol); m.wr(S.L5B03 + 1, ROW);
m.cpu.set_h(ROW); m.cpu.set_l(scol);
let sp = (m.cpu.sp - 2) & 0xffff; m.wr(sp, S.LD9C0 & 0xff); m.wr(sp + 1, S.LD9C0 >> 8);
m.cpu.sp = sp; m.cpu.pc = S.DrawGameScr;
for (let i = 0; i < 6000 && (m.cpu.pc & 0xffff) !== S.LD9C0; i++) m.step();
// ищем свободную воду: клетка и её окрестность 3x3 без рельефа
let spot = null;
for (let r = 4; r < 18 && !spot; r++) for (let c = 6; c < 26 && !spot; c++) {
  let free = true;
  // СВОБОДНО — ЭТО НЕ НОЛЬ. Карта занятости хранит ZX-атрибуты: 02 — рельеф (о
  // него дайвер и убивается, LE3A6 cp 02), 06 — вода, прочее — предметы.
  // Первая редакция искала нули и не находила ничего.
  for (let dr = -1; dr <= 2 && free; dr++) for (let dc = -1; dc <= 2; dc++) if (attr(r + dr, c + dc) === 2) { free = false; break; }
  if (free) spot = { r, c }; }
if (!spot) { console.log(`на строке ${ROW} свободной воды 4x4 не нашлось`); process.exit(2); }
m.wr(D + 0x00, spot.c); m.wr(D + 0x01, spot.r); m.wr(D + 0x02, 0); m.wr(D + 0x03, 0);
console.log(`экран на строке ${ROW}, дайвер поставлен в свободную воду (столбец ${spot.c}, строка ${spot.r})`);
// экран мог уехать обратно, пока шла перерисовка: держим его на месте и проверяем
m.wr(S.L5B03 + 1, ROW);
let t = 0; m.onPc(S.LD9C0, () => { t++; });
// СЧИТАЕМ ВСЕ ГРУППЫ, А НЕ ТОЛЬКО I. На глубине группа I (верхние рыбы) стоит
// далеко, и замер по ней дал ровные нули — сцена не пустая, просто смотрел не туда.
const b4 = w(S.RecsAddrIV), n4 = m.rd(S.NumRecsIV);
const GS = [[S.LC4F0, 21, m.rd(S.NumRecsI)], [w(S.RecsAddrII), 26, m.rd(S.NumRecsII)],
  [w(S.RecsAddrIII), 26, m.rd(S.NumRecsIII)], [b4, 26, n4], [b4 + 26 * n4, 28, m.rd(S.NumRecsV)]];
const RECS = []; for (const [bs, sz, n] of GS) { if (bs < 0x300 || n > 200) continue;
  for (let i = 0; i < n; i++) RECS.push(bs + i * sz); }
console.log(`записей существ всего: ${RECS.length}`);
for (let win = 1; win <= WINS; win++) {
  const f0 = m.frame; t = 0;
  const pos = new Map(); let px = 0, ev = 0; const drawn = new Set();
  for (let f = 0; f < 250; f++) { const ph = f % 400;
    m.key(KEY.UP, ph < 250); m.key(KEY.RIGHT, ph >= 120 && ph < 170); m.step();
    for (const r of RECS) { const x = m.rd(r) * 8 + m.rd(r + 2), y = m.rd(r + 1) * 8 + m.rd(r + 3);
      const p = pos.get(r); if (p) { const d = Math.abs(x - p[0]) + Math.abs(y - p[1]);
        if (d > 0 && d < 64) { px += d; ev++; } } pos.set(r, [x, y]);
      if (m.rd(r + 7) | m.rd(r + 8)) drawn.add(r); } }
  m.key(KEY.UP, false); m.key(KEY.RIGHT, false);
  const fr = m.frame - f0, sec = fr / 50;
  const nd = drawn.size || 1;
  console.log(`окно ${win}: ${(t / sec).toFixed(1)} тик/с | рисовалось существ ${drawn.size} | ` +
    `${(px / sec).toFixed(1)} px/с всего, ${(px / sec / nd).toFixed(1)} px/с и ${(ev / sec / nd).toFixed(1)} шагов/с на рисуемое | ` +
    `экран строка ${m.rd(S.L5B03 + 1)} | жизни ${m.rd(S.LIVES)}`);
}
