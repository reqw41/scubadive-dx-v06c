"use strict";
// ЖЁЛТЫЙ СЛЕД НА СИНЕЙ РАКОВИНЕ. Владелец 2026-09-15: «в режиме бога при
// пересечении с синими раковинами остаётся жёлтый мусор».
// Критерий точный и не требует догадок: синий предмет (SHELLBLUE) лежит ТОЛЬКО
// во второй плоскости (0xE000, индекс 1). Любой бит в 0xC000 в его знакоместах —
// чужой: там мог остаться только дайвер, который жёлтый.
// Дайвера в раковину перевозим записью координат — своим ходом он туда не
// доплывёт, а в штатной игре и не должен: раковина его убивает, и пересечение
// бывает только в режиме бога.
//   node tools/verify/shell_ghost_probe.js <rom> <sym> [тиков стоянки]
//   NOGOD=1 — без режима бога (контроль: дайвер гибнет, пересечения нет)
const { reachGame, KEY } = require("./drive.js");
const [rom, sym] = process.argv.slice(2, 4);
const STAY = parseInt(process.argv[4] || "120", 10);
let frame = 0;
const g = reachGame(rom, sym, { cpu: "i8080", level: parseInt(process.env.LVL || "1", 10), seed: 0x0167 });
const m = g.m, S = g.S;
if (S.god_on && !process.env.NOGOD) m.wr(S.god_on, 1);
// статика на экране: LB07D, записи по 4 байта (адрес записи, столбец, строка)
const inkC = (r, c) => { let n = 0; for (let i = 0; i < 8; i++) { const lo = (255 - (r * 8 + i)) & 0xff;
  if (m.rd(0xC000 + c * 256 + lo)) n++; } return n; };
const inkE = (r, c) => { let n = 0; for (let i = 0; i < 8; i++) { const lo = (255 - (r * 8 + i)) & 0xff;
  if (m.rd(0xE000 + c * 256 + lo)) n++; } return n; };
// ПРЕДМЕТ ИЩЕМ НА ЭКРАНЕ, А НЕ В ТАБЛИЦЕ. Поля +2/+3 записи LB07D дали строку 39
// при экране в 24 строки — что бы там ни лежало, это не экранная клетка.
// Признак синего предмета прямо в видеопамяти надёжнее: чернила есть только во
// второй плоскости, ниже ватерлинии, и клетка не меняется от тика к тику.
// ВЕЗЁМ ЭКРАН К ПРЕДМЕТУ. На стартовом экране уровня 1 синих предметов нет
// вовсе; берём первую запись TableStatics без бита 6 (бит 6 — сундук) и
// перерисовываем экран на её клетке, как это делает chest_probe.
{ const TS = S.TableStatics; let it0 = null;
  for (let a = TS; a < TS + 4 * 200; a += 4) { const fl = m.rd(a);
    if (fl & 0x80) break; if (!(fl & 0x40)) { it0 = { col: m.rd(a + 1), row: m.rd(a + 2) }; break; } }
  if (it0) { const scol = Math.max(0, Math.min(31, (it0.col >> 3) - 1)), srow = Math.max(0, Math.min(31, it0.row >> 3));
    m.wr(S.L5B03, scol); m.wr(S.L5B03 + 1, srow);
    if (m.cpu.set_h) { m.cpu.set_h(srow); m.cpu.set_l(scol); }
    else { const st = m.cpu.getState(); st.h = srow; st.l = scol; m.cpu.setState(st); }
    const sp = (m.cpu.sp - 2) & 0xffff; m.wr(sp, S.LD9C0 & 0xff); m.wr(sp + 1, S.LD9C0 >> 8);
    m.cpu.sp = sp; m.cpu.pc = S.DrawGameScr;
    for (let i = 0; i < 6000 && (m.cpu.pc & 0xffff) !== S.LD9C0; i++) m.step();
    console.log(`  окно перевезено к предмету карты (${it0.col},${it0.row}): столбец ${scol}, ряд ${srow}`); } }
// НЕБО ИСКЛЮЧАЕТСЯ ТОЛЬКО НА ВЕРХНЕМ ЭКРАНЕ. Там заливка SKYFILL сама кладёт
// чернила только во вторую плоскость. На нижних экранах строки 0..7 — обычная
// вода, и синие предметы там законны: жёсткое «r >= 10» их отсекало, и зонд
// объявлял выборку пустой на экране, где предметы были.
const TOP = m.rd(S.L5B03 + 1) === 0, R0 = TOP ? 9 : 0;
const snap = () => { const s2 = new Set();
  for (let r = R0; r < 24; r++) for (let c = 0; c < 32; c++)
    if (inkE(r, c) > 0 && inkC(r, c) === 0) s2.add(r + "," + c); return s2; };
{ const rows = {};
  for (let r = 0; r < 24; r++) { let n = 0;
    for (let c = 0; c < 32; c++) if (inkE(r, c) > 0 && inkC(r, c) === 0) n++;
    if (n) rows[r] = n; }
  console.log("  клетки «только 0xE000» по строкам:", Object.entries(rows).map(([r, n]) => `${r}:${n}`).join(" ") || "нет"); }
const a1 = snap();
for (let f = 0; f < 60; f++) m.step();
const a2 = snap();
const still = [...a1].filter(x => a2.has(x));         // не мигает, значит не существо
console.log(`синих знакомест (строки ${R0}..23): ${a1.size}, из них неподвижных ${still.length}`);
if (!still.length) { console.log("  синих предметов на экране нет — выборка пуста, вывод делать нельзя"); process.exit(2); }
const [br, bc] = still[Math.floor(still.length / 2)].split(",").map(Number);
const it = { row: br, col: bc };
console.log(`  берём предмет в клетке строка ${it.row}, столбец ${it.col}`);
// ЖУРНАЛ ЗАПИСЕЙ В СПОРНОЕ ЗНАКОМЕСТО (WATCH=строка,столбец): кто оставил
// жёлтые биты и кто их не убрал. Имя берётся по ближайшей метке от PC.
const wlog = [];
if (process.env.WATCH) { const [wr, wc] = process.env.WATCH.split(",").map(Number);
  const nm = Object.entries(S).filter(([, a]) => typeof a === "number" && a > 0x300).sort((a, b) => a[1] - b[1]);
  const near = pc => { let best = "?"; for (const [n, a] of nm) { if (a > pc) break; best = `${n}+${pc - a}`; } return best; };
  for (let i = 0; i < 8; i++) { const lo = (255 - (wr * 8 + i)) & 0xff;
    m.onWrite(0xC000 + wc * 256 + lo, (a, v, pc) =>
      wlog.push(`кадр ${frame} пикс.строка ${wr * 8 + i} := ${v.toString(16).padStart(2, "0")} из ${near(pc)}`)); } }
const before = [0, 1].map(d => inkC(it.row, it.col + d));
const baseC = new Set();
for (let r = Math.max(0, it.row - 2); r <= Math.min(23, it.row + 2); r++)
  for (let c = Math.max(0, it.col - 2); c <= Math.min(31, it.col + 2); c++) if (inkC(r, c)) baseC.add(r + "," + c);
// ДАЙВЕРА ВЕДЁМ КЛАВИШАМИ, А НЕ ЗАПИСЬЮ КООРДИНАТ. Запись в DiverObj меняет
// числа, но спрайт остаётся на прежнем месте: пересечения не происходит, и
// первый вариант зонда мерил пустоту («при дайвере 0/0»).
// КРУТИМСЯ РЯДОМ: владелец 2026-09-15 — «рядом с раковиной нужно покрутиться,
// возможно она меняет в этот момент своё состояние». Раковина анимированная
// (открыта/закрыта), её перерисовка идёт через DrawTile16x8 — ловим и её.
// СМЕНА СОСТОЯНИЯ — ЭТО ПОДБОР СОКРОВИЩА. Владелец: «рядом с раковиной нужно
// покрутиться, возможно она меняет в этот момент своё состояние». По коду
// (scubacodc.asm, LE509/LE510) подбор увеличивает HELD, перерисовывает тайл
// предмета и ставит его клеткам атрибут $06 — то есть предмет перестаёт быть
// препятствием. Следим именно за HELD: пока он не вырос, состояние не менялось
// и мерить нечего.
const held = () => m.rd(S.HELD) | (m.rd(S.HELD + 1) << 8);
const held0 = held();
let met = 0, during = [0, 0], redraws = 0, dirtyAt = -1, tookAt = -1;
const tile = S.DrawTile16x8;
if (tile != null) m.onPc(tile, () => { redraws++; });
let rng = 0x1234567, dir = 0;
const nxt = () => { rng ^= rng << 13; rng ^= rng >>> 17; rng ^= rng << 5; return rng >>> 0; };
const KEYS = [KEY.UP, KEY.DOWN, KEY.LEFT, KEY.RIGHT];
for (let f = 0; f < 20000 && met < STAY; f++) {
  frame = f;
  const dc = m.rd(S.DiverObj), dr = m.rd(S.DiverObj + 1);
  const dd = Math.abs(dc - it.col) + Math.abs(dr - it.row);
  if (dd > 2) {                       // ещё не дошли — правим курс
    m.key(KEY.RIGHT, dc < it.col); m.key(KEY.LEFT, dc > it.col);
    m.key(KEY.DOWN, dr < it.row); m.key(KEY.UP, dr > it.row);
  } else {                            // дошли — крутимся на месте
    met++;
    if (f % 25 === 0) dir = nxt() & 3;
    for (let i = 0; i < 4; i++) m.key(KEYS[i], i === dir);
  }
  m.step();
  if (tookAt < 0 && held() !== held0) { tookAt = f; }
  if (dd <= 3) { const now = [0, 1].map(d => inkC(it.row, it.col + d));
    if (now[0] + now[1] > during[0] + during[1]) during = now; }
  if (tookAt >= 0 && f > tookAt + 200) break;     // подобрал — дальше незачем
}
console.log(`  HELD ${held0} -> ${held()}${tookAt >= 0 ? `, сокровище взято на кадре ${tookAt}` : ", сокровище НЕ взято"}`);
console.log(`  кадров вплотную: ${met}; перерисовок тайлов предметов: ${redraws}; дайвер (${m.rd(S.DiverObj)},${m.rd(S.DiverObj + 1)}), цель (${it.col},${it.row})`);
// УВОДИМ НЕДАЛЕКО И СЛЕДИМ ЗА ЭКРАНОМ. Первая редакция гнала дайвера 800 кадров
// в одну сторону — окно карты успевало переехать, и «жёлтый след» оказывался
// просто РЕЛЬЕФОМ нового экрана (журнал записей называл TileOne, а не дайвера).
// Сменился экран — замер недействителен, вывод делать нельзя.
const scr0 = m.rd(S.L5B03) + "," + m.rd(S.L5B03 + 1);
for (let f = 0; f < 400; f++) {
  const dc = m.rd(S.DiverObj), dr = m.rd(S.DiverObj + 1);
  const tc = Math.max(2, Math.min(29, it.col + 8)), tr = Math.max(2, Math.min(21, it.row + 5));
  m.key(KEY.RIGHT, dc < tc); m.key(KEY.LEFT, dc > tc);
  m.key(KEY.DOWN, dr < tr); m.key(KEY.UP, dr > tr);
  m.step(); }
const scr1 = m.rd(S.L5B03) + "," + m.rd(S.L5B03 + 1);
if (scr1 !== scr0) { console.log(`  экран уехал (${scr0} -> ${scr1}) — замер недействителен`); process.exit(2); }
// СМОТРИМ ОКРЕСТНОСТЬ 5x5, А НЕ ДВЕ КЛЕТКИ: спрайт дайвера шире предмета, и
// след мог остаться рядом, а не точно на нём.
const around = [];
for (let r = Math.max(0, it.row - 2); r <= Math.min(23, it.row + 2); r++)
  for (let c = Math.max(0, it.col - 2); c <= Math.min(31, it.col + 2); c++) {
    // САМ ДАЙВЕР НЕ СЛЕД. Он жёлтый, его спрайт занимает несколько знакомест, и
    // после увода он может стоять в двух клетках от предмета — его собственные
    // пиксели попадали в «след» (клетка 7,9 при дайвере в 9,7).
    const dc2 = m.rd(S.DiverObj), dr2 = m.rd(S.DiverObj + 1);
    if (Math.abs(r - dr2) <= 3 && Math.abs(c - dc2) <= 3) continue;
    const n = inkC(r, c); if (n && !baseC.has(r + "," + c)) around.push(`${r},${c}:${n}`); }
console.log(`  дайвер после увода: (${m.rd(S.DiverObj)},${m.rd(S.DiverObj + 1)})`);
console.log(`  жёлтые байты вокруг предмета, которых не было до подхода: ${around.length ? around.join(" ") : "нет"}`);
const after = [0, 1].map(d => inkC(it.row, it.col + d));
console.log(`  байт с чернилами в 0xC000 у предмета: до ${before.join("/")}, при дайвере ${during.join("/")}, после ухода ${after.join("/")}`);
// ВЕРДИКТ ПО ОКРЕСТНОСТИ, А НЕ ПО ДВУМ КЛЕТКАМ. Первая редакция смотрела только
// на сам предмет и печатала «зелёный», хотя рядом (7,8) и (7,9) оставались
// жёлтые байты — то есть ровно тот след, из-за которого зонд и писался.
if (process.env.WATCH) { console.log(`  журнал записей в ${process.env.WATCH}: ${wlog.length}`);
  for (const l of wlog.slice(-24)) console.log("    " + l); }
const ok = after.every(x => x === 0) && around.length === 0;
console.log(ok ? "зелёный: жёлтых следов ни на предмете, ни вокруг не осталось"
               : `КРАСНЫЙ: жёлтый след остался — на предмете ${after.join("/")}, вокруг ${around.join(" ") || "нет"}`);
process.exit(ok ? 0 : 1);
