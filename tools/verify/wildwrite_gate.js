"use strict";
// ДИКИЕ ЗАПИСИ БЛИТА. Без всякой «принадлежности по снимку»: на входе в LB4C4
// известно, куда существо СОБИРАЕТСЯ рисовать (столбец IY+2, строка IY+3,
// обрезанная ширина B, высота IY+9). Дальше сторож стоит на ВСЕЙ видимой
// видеопамяти и ловит любой байт, записанный телом блита ВНЕ этого прямоугольника.
// Такая запись и есть мусор: пиксели, которых никто потом не уберёт, потому что
// буфер save-under их не покрывает.
const { reachGame, KEY } = require("./drive.js");
const [rom, sym] = process.argv.slice(2, 4);
const NT = parseInt(process.argv[4] || "20000", 10);
const g = reachGame(rom, sym, { cpu: "i8080", level: 4, seed: 0x0167 });
const m = g.m, S = g.S, w = a => m.rd(a) | (m.rd(a + 1) << 8);
let foot = null, ticks = 0;
const bad = new Map(), hud = new Map();
m.onPc(S.LB4C4, () => { const iy = w(S.z80_iy);
  foot = { col: m.rd(iy + 2), row: m.rd(iy + 3), w: m.cpu.b(), h: m.rd(iy + 9) || 1, t: ticks }; });
const BODY0 = Math.min(S.LB500, S.LB500R), BODY1 = Math.max(S.LB500, S.LB500R) + 0x40;
for (let a = 0xC000; a <= 0xFFFF; a++) m.onWrite(a, (addr, v, pc) => {
  if (pc < BODY0 || pc > BODY1 || !foot) return;
  const col = (addr >> 8) & 0x1F;   // 0xC0..0xDF и 0xE0..0xFF — один и тот же столбец в двух плоскостях
  const row = (255 - (addr & 0xff)) >> 3;
  // блит рисует ширину+1 столбцов (сдвиг на полбайта) и высоту+1 строк — запас
  // СТРОКА СЧИТАЕТСЯ ПО КРУГУ. lo = 255-8*строка по модулю 256, значит строка
  // 255 (существо на один ряд выше верха поля) ложится на экранную строку 31 —
  // в полосу HUD. Это и есть дефект, а не ошибка счёта: сам блит согласован.
  // САМОПРОВЕРКА: WILD_SHRINK=1 сужает ожидаемый след на столбец — сторож обязан
  // покраснеть. Без неё зелёный результат ничего не значит.
  const SH = process.env.WILD_SHRINK ? 2 : 0;
  const okc = col >= foot.col - 1 && col <= foot.col + foot.w - SH;
  let okr = false; for (let k = -1; k <= foot.h; k++) if (((foot.row + k) & 31) === row) okr = true;
  if (okc && okr) { if (row >= 24) hud.set(`строка ${foot.row} выс ${foot.h} -> экранная ${row}`, (hud.get(`строка ${foot.row} выс ${foot.h} -> экранная ${row}`) || 0) + 1); return; }
  const k = `стр ${row} стлб ${col} при следе (стр ${foot.row}..${foot.row + foot.h - 1}, стлб ${foot.col}..${foot.col + foot.w - 1})`;
  if (!bad.has(k)) bad.set(k, { n: 0, t: ticks }); bad.get(k).n++; });
m.onPc(S.LD9C0, () => { ticks++; });
if (S.god_on) m.wr(S.god_on, 1);
let guard = 0, rng = 0x2545F491, dir = 0;
const nxt = () => { rng ^= rng << 13; rng ^= rng >>> 17; rng ^= rng << 5; return (rng >>> 0); };
const KEYS = [KEY.UP, KEY.DOWN, KEY.LEFT, KEY.RIGHT];
while (ticks < NT && guard++ < 3000000) {
  if (guard % 300 === 0) dir = nxt() & 3;
  for (let i = 0; i < 4; i++) m.key(KEYS[i], i === dir);
  m.step(); }
const FAIL = bad.size > 0 || [...hud.values()].some(n => n > 0);
console.log(`${FAIL ? "КРАСНЫЙ" : "зелёный"}: тиков ${ticks}; видов записей вне следа: ${bad.size}`);
console.log(`байт блита, упавших в полосу HUD (строки 24..31): ${[...hud.values()].reduce((a,b)=>a+b,0)}`);
for (const [k, n] of [...hud].sort((a,b)=>b[1]-a[1]).slice(0,10)) console.log(`  ${k} — ${n} байт`);
for (const [k, v] of [...bad].sort((a, b) => b[1].n - a[1].n).slice(0, 12)) console.log(`  ${k} — ${v.n} байт, первый раз на тике ${v.t}`);
process.exit(FAIL ? 1 : 0);
