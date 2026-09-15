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
let onIt = 0, hit = null, stuck = 0, lastWin = "";
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
  // ЗАСТРЕВАНИЕ У КРАЯ. Цель «столбец 1» дайвер достигает и стоит: goTo считает
  // задачу выполненной, а окно не переходит, потому что перейти на соседний
  // экран можно только ПЕРЕСЕКШИ границу. На уровне 4 он так простоял сто шагов
  // в клетке (22,1). Лечение — толчок вслепую в нужную сторону.
  const winNow = m.rd(S.L5B03) + "," + m.rd(S.L5B03 + 1);
  if (winNow === lastWin) stuck++; else { stuck = 0; lastWin = winNow; }
  if (stuck >= 3) { stuck = 0;
    for (let f = 0; f < 320; f++) {
      m.key(KEY.LEFT, dCol < 0 && f % 18 < 6); m.key(KEY.RIGHT, dCol > 0 && f % 18 < 6);
      m.key(KEY.DOWN, dRow > 0 && f % 18 < 6); m.key(KEY.UP, f % 18 >= 6);
      m.step(); } }
  const r2 = m.rd(S.DiverObj + 0x19), c2 = m.rd(S.DiverObj);
  // ЗАПОМИНАЕМ КЛЕТКУ ПОПАДАНИЯ. Пересчитывать sr/sc после цикла нельзя: окно к
  // тому времени могло уехать, и замер шёл по клетке (38,28) — вне экрана и с
  // занятостью 0xc вместо 0x07, а «клеток, где дайвер побывал» выходило 0.
  if (near && r2 === sr && c2 === sc) {
    // ПОПАЛИ — НО ТОЛЬКО ЕСЛИ ОКНО НЕ УЕХАЛО В ТОТ ЖЕ МИГ. На глубине дайвер
    // часто попадает в клетку ровно при пересечении границы экрана; раньше это
    // отменяло весь прогон, теперь просто ищем дальше.
    if (m.rd(S.L5B03) === winC && m.rd(S.L5B03 + 1) === winR) { onIt = 1; hit = { sr, sc, win: winC + "," + winR }; }
  }
  if (step % 50 === 49) console.log(`   шаг ${step + 1}: окно (${winC},${winR}), цель на экране (${sr},${sc}), кратчайшая разница (${dRow},${dCol}), дайвер (${r2},${c2})`);
}
const winC = m.rd(S.L5B03), winR = m.rd(S.L5B03 + 1);
const sr = hit ? hit.sr : target.row - winR * 8, sc = hit ? hit.sc : target.col - winC * 8;
if (!onIt) { console.log(`  до ракушки не доплыли (цель на экране ${sr},${sc}) — выборка пуста`); process.exit(2); }
console.log(`  стоим на ракушке: экран (${sr},${sc}), занятость 0x${attr(sr, sc).toString(16)}`);
// --- КРУТИМСЯ НА НЕЙ И СЛЕДИМ НЕПРЕРЫВНО --------------------------------
// Отход в конце не годится: дайвер с инерцией всё равно вылетает за край, окно
// карты переезжает, и замер отменяется — а к этому моменту он уже стоял на цели,
// то есть выбрасывается самая дорогая часть прогона.
// Поэтому следим по ходу: клетка считается проверяемой, когда дайвер её ПОКИНУЛ
// (ушёл на три знакоместа и дальше). Если в покинутой клетке жёлтое держится
// 60 кадров подряд — это след.
let rng = 0x2545F491, dir = 0;
const nxt = () => { rng ^= rng << 13; rng ^= rng >>> 17; rng ^= rng << 5; return rng >>> 0; };
const KEYS = [KEY.UP, KEY.DOWN, KEY.LEFT, KEY.RIGHT];
const win0 = m.rd(S.L5B03) + "," + m.rd(S.L5B03 + 1);
const streak = new Map(), worst = new Map();
let visited = new Set(), spun = 0;
for (let f = 0; f < SPIN * 4; f++) {
  if (f % 25 === 0) dir = nxt() & 3;
  for (let i2 = 0; i2 < 4; i2++) m.key(KEYS[i2], i2 === dir);
  m.step();
  if (m.rd(S.L5B03) + "," + m.rd(S.L5B03 + 1) !== win0) break;   // экран сменился — дальше не считаем
  spun++;
  const dr2 = m.rd(S.DiverObj + 0x19), dc2 = m.rd(S.DiverObj);
  for (let r = Math.max(0, sr - 2); r <= Math.min(23, sr + 2); r++)
    for (let c = Math.max(0, sc - 2); c <= Math.min(31, sc + 2); c++) {
      const k = r + "," + c;
      const under = Math.abs(r - dr2) <= 2 && Math.abs(c - dc2) <= 2;
      if (under) { visited.add(k); streak.delete(k); continue; }
      if (!visited.has(k)) continue;                 // дайвер здесь ещё не был
      if (Math.abs(r - dr2) <= 3 && Math.abs(c - dc2) <= 3) { streak.delete(k); continue; }
      if (!yellow(r, c)) { streak.delete(k); continue; }
      const n = (streak.get(k) || 0) + 1; streak.set(k, n);
      if (n > (worst.get(k) || 0)) worst.set(k, n); }
}
const left = [...worst.entries()].filter(([, n]) => n >= 60).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}:${n} кадров`);
console.log(`  кадров на ракушке и вокруг: ${spun}; клеток, где дайвер побывал: ${visited.size}`);
console.log(`  жёлтое в покинутых клетках: ${left.length ? left.join(" ") : "нет"}`);
const ok = left.length === 0;
console.log(ok ? "зелёный: жёлтого следа на раковине не осталось" : "КРАСНЫЙ: на раковине остался жёлтый след");
process.exit(ok ? 0 : 1);
