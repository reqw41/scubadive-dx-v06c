"use strict";
// ОХОТА НА РАКОВИНУ: доплыть до КОНКРЕТНОЙ ракушки и проверить, не остаётся ли
// на ней жёлтого следа. Владелец 2026-09-15: «в режиме бога при пересечении с
// синими раковинами остаётся жёлтый мусор; синяя раковина, я был прямо на ней».
//
// ПОЧЕМУ ЦЕЛЬ — МИРОВАЯ, А НЕ ЭКРАННАЯ. Раковина на экране редкость: гистограмма
// карты занятости на глубине дала 409 клеток воды, 110 рельефа, 6 сундуков и
// РОВНО ОДНУ ракушку ($07). Случайное плавание к ней не приводит, а перевозка
// окна (приём chest_probe) не переносит дайвера — он остаётся в своей мировой
// клетке. Поэтому цель берётся из TableStatics (мировые столбец и строка), а
// экранная цель пересчитывается каждый заход из положения окна L5B03.
//
//   node tools/verify/shell_hunt_probe.js <rom> <sym> [кадров кручения]
//   LVL=4 — уровень; NOGOD=1 — без режима бога
const { reachGame, KEY } = require("./drive.js");
const { goTo } = require("./diver_autopilot.js");
const [rom, sym] = process.argv.slice(2, 4);
const SPIN = parseInt(process.argv[4] || "600", 10);
const g = reachGame(rom, sym, { cpu: "i8080", level: parseInt(process.env.LVL || "1", 10), seed: 0x0167 });
const m = g.m, S = g.S;
if (S.god_on && !process.env.NOGOD) m.wr(S.god_on, 1);
const attr = (r, c) => { const a = ((r >> 3) | (r << 5)) & 0xff;
  return m.rd((((a & 0x1f) + (S.SCRATTR >> 8)) << 8) | ((a & 0xE0) | (c & 0x1f))); };
const pop = v => { let n = 0; while (v) { n += v & 1; v >>= 1; } return n; };
// жёлтый байт — четыре и больше битов в 0xC000 без пары в 0xE000 (у рифа таких
// бит ровно один на байт: он красный с жёлтыми вкраплениями)
const yellow = (r, c) => { let n = 0; for (let i = 0; i < 8; i++) { const lo = (255 - (r * 8 + i)) & 0xff;
  const a = m.rd(0xC000 + c * 256 + lo), b = m.rd(0xE000 + c * 256 + lo);
  if (pop(a & ~b) >= 4) n++; } return n; };
// --- выбираем ракушку: не сундук (бит 6), не кислород (бит 5), не взятая (бит 3)
const TS = S.TableStatics; const shells = [];
for (let a = TS; a < TS + 4 * 200; a += 4) { const fl = m.rd(a); if (fl & 0x80) break;
  if (!(fl & 0x40) && !(fl & 0x20) && !(fl & 8)) shells.push({ addr: a, col: m.rd(a + 1), row: m.rd(a + 2), fl }); }
console.log(`ракушек в таблице: ${shells.length}`);
if (!shells.length) { console.log("  ракушек нет — выборка пуста, вывод делать нельзя"); process.exit(2); }
// ближайшая к дайверу по миру: мировая клетка дайвера = окно*8 + экранная
const worldOf = () => [m.rd(S.L5B03 + 1) * 8 + m.rd(S.DiverObj + 0x19), m.rd(S.L5B03) * 8 + m.rd(S.DiverObj)];
let [wr, wc] = worldOf();
shells.sort((a, b) => (Math.abs(a.row - wr) + Math.abs(a.col - wc)) - (Math.abs(b.row - wr) + Math.abs(b.col - wc)));
const target = shells[0];
console.log(`  цель: ракушка карты (столбец ${target.col}, строка ${target.row}), дайвер в мире (${wc},${wr})`);
// --- плывём к ней, пересчитывая экранную цель из положения окна
let onIt = 0;
// КОРОТКИМИ ОТРЕЗКАМИ. С бюджетом 2500 кадров дайвер за один заход проезжал
// несколько экранов и проскакивал цель: окно прыгало 4 -> 25 -> 7 -> 23, знак
// разницы менялся, и он колебался вокруг цели, не приближаясь.
for (let step = 0; step < 400 && !onIt; step++) {
  const winC = m.rd(S.L5B03), winR = m.rd(S.L5B03 + 1);
  // КАРТА ЗАМКНУТА В КОЛЬЦО. Окно по столбцам гуляло 0..28 и обратно, потому что
  // «плыть вправо» по прямой разнице уводит по кругу мимо цели. Разницу берём
  // кратчайшую: со знаком, по модулю 256.
  const ring = d => ((d % 256) + 384) % 256 - 128;
  const sr = target.row - winR * 8, sc = target.col - winC * 8;
  const dRow = ring(sr), dCol = ring(sc);
  const near = sr >= 0 && sr < 24 && sc >= 0 && sc < 32;
  const tr = near ? sr : (dRow < 0 ? 1 : 22);
  const tc = near ? sc : (dCol < 0 ? 1 : 30);
  goTo(m, S, KEY, tr, tc, near ? 1200 : 350);
  const r2 = m.rd(S.DiverObj + 0x19), c2 = m.rd(S.DiverObj);
  if (near && r2 === sr && c2 === sc) onIt = 1;
  if (step % 50 === 49) console.log(`   шаг ${step + 1}: окно (${winC},${winR}), цель на экране (${sr},${sc}), кратчайшая разница (${dRow},${dCol}), дайвер (${r2},${c2})`);
}
const winC = m.rd(S.L5B03), winR = m.rd(S.L5B03 + 1);
const sr = target.row - winR * 8, sc = target.col - winC * 8;
if (!onIt) { console.log(`  до ракушки не доплыли (цель на экране ${sr},${sc}) — выборка пуста`); process.exit(2); }
console.log(`  стоим на ракушке: экран (${sr},${sc}), занятость 0x${attr(sr, sc).toString(16)}`);
// --- крутимся на ней
const baseY = new Set();
for (let r = Math.max(0, sr - 2); r <= Math.min(23, sr + 2); r++)
  for (let c = Math.max(0, sc - 2); c <= Math.min(31, sc + 2); c++) if (yellow(r, c)) baseY.add(r + "," + c);
let rng = 0x2545F491, dir = 0;
const nxt = () => { rng ^= rng << 13; rng ^= rng >>> 17; rng ^= rng << 5; return rng >>> 0; };
const KEYS = [KEY.UP, KEY.DOWN, KEY.LEFT, KEY.RIGHT];
for (let f = 0; f < SPIN; f++) { if (f % 25 === 0) dir = nxt() & 3;
  for (let i = 0; i < 4; i++) m.key(KEYS[i], i === dir); m.step(); }
// --- отходим недалеко и смотрим, что осталось
for (let f = 0; f < 260; f++) { m.key(KEY.UP, f % 20 < 12); m.key(KEY.LEFT, f < 70);
  m.key(KEY.DOWN, false); m.key(KEY.RIGHT, false); m.step(); }
const winC2 = m.rd(S.L5B03), winR2 = m.rd(S.L5B03 + 1);
if (winC2 !== winC || winR2 !== winR) { console.log("  окно уехало, пока отходили — замер недействителен"); process.exit(2); }
const dr = m.rd(S.DiverObj + 0x19), dc = m.rd(S.DiverObj);
const left = [];
for (let r = Math.max(0, sr - 2); r <= Math.min(23, sr + 2); r++)
  for (let c = Math.max(0, sc - 2); c <= Math.min(31, sc + 2); c++) {
    if (Math.abs(r - dr) <= 3 && Math.abs(c - dc) <= 3) continue;   // сам дайвер не след
    const n = yellow(r, c); if (n && !baseY.has(r + "," + c)) left.push(`${r},${c}:${n}`); }
console.log(`  дайвер отошёл в (${dr},${dc}); жёлтых клеток вокруг ракушки: ${left.length ? left.join(" ") : "нет"}`);
const ok = left.length === 0;
console.log(ok ? "зелёный: жёлтого следа на раковине не осталось" : "КРАСНЫЙ: на раковине остался жёлтый след");
process.exit(ok ? 0 : 1);
