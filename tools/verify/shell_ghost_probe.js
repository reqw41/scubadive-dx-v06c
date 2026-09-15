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
const { goTo } = require("./diver_autopilot.js");
const [rom, sym] = process.argv.slice(2, 4);
const STAY = parseInt(process.argv[4] || "120", 10);
let frame = 0;
const g = reachGame(rom, sym, { cpu: "i8080", level: parseInt(process.env.LVL || "1", 10), seed: 0x0167 });
const m = g.m, S = g.S;
if (S.god_on && !process.env.NOGOD) m.wr(S.god_on, 1);
// статика на экране: LB07D, записи по 4 байта (адрес записи, столбец, строка)
// ЖЁЛТЫЙ БАЙТ — ЭТО ЧЕТЫРЕ И БОЛЬШЕ БИТОВ В 0xC000 БЕЗ ПАРЫ В 0xE000.
// «Хоть один бит в C и нет в E» не годится: риф под -DDITHER красный с жёлтыми
// ВКРАПЛЕНИЯМИ — в каждом его байте ровно один такой бит, и по слабому признаку
// весь риф считался жёлтым следом (замер: C=ff ff…, E=7f fb ef… — это риф).
// РАКОВИНУ ИЩЕМ ПО КАРТЕ ЗАНЯТОСТИ, А НЕ ПО ПИКСЕЛЯМ. DrawStatics кладёт
// ракушкам атрибут $07 (LD C,$07 ; screen attribute for shells), сундуку $46,
// кислороду $47, воде $06, рельефу $02. Признак по пикселям («в 0xE000 есть,
// в 0xC000 пусто») рядом с дайвером не работает вовсе: за 120000 кадров он не
// нашёл НИ ОДНОГО кандидата — поверх предмета почти всегда лежит либо сам
// дайвер, либо вкрапления рифа.
const attr = (r, c) => { const a = ((r >> 3) | (r << 5)) & 0xff;
  return m.rd((((a & 0x1f) + (S.SCRATTR >> 8)) << 8) | ((a & 0xE0) | (c & 0x1f))); };
const pop = v => { let n = 0; while (v) { n += v & 1; v >>= 1; } return n; };
// ДВА РАЗНЫХ ВОПРОСА — ДВА РАЗНЫХ ПРИЗНАКА.
// anyC: есть ли в 0xC000 хоть что-то. Этим отбирается СИНИЙ предмет: у него в
// первой плоскости пусто. Строгий признак тут не годится — с ним «синим» стал
// весь рельеф, и отбор дал 577 клеток вместо десятка.
// inkC: жёлтый ли байт, то есть четыре и больше битов C без пары в E. Этим
// ищется след дайвера.
const anyC = (r, c) => { let n = 0; for (let i = 0; i < 8; i++) { const lo = (255 - (r * 8 + i)) & 0xff;
  if (m.rd(0xC000 + c * 256 + lo)) n++; } return n; };
const inkC = (r, c) => { let n = 0; for (let i = 0; i < 8; i++) { const lo = (255 - (r * 8 + i)) & 0xff;
  const a = m.rd(0xC000 + c * 256 + lo), b = m.rd(0xE000 + c * 256 + lo);
  if (pop(a & ~b) >= 4) n++; } return n; };
const inkE = (r, c) => { let n = 0; for (let i = 0; i < 8; i++) { const lo = (255 - (r * 8 + i)) & 0xff;
  if (m.rd(0xE000 + c * 256 + lo)) n++; } return n; };
// ПРЕДМЕТ ИЩЕМ НА ЭКРАНЕ, А НЕ В ТАБЛИЦЕ. Поля +2/+3 записи LB07D дали строку 39
// при экране в 24 строки — что бы там ни лежало, это не экранная клетка.
// Признак синего предмета прямо в видеопамяти надёжнее: чернила есть только во
// второй плоскости, ниже ватерлинии, и клетка не меняется от тика к тику.
// ОКНО НЕ ВОЗИМ — ИЩЕМ ПРЕДМЕТ ТАМ, ГДЕ ДАЙВЕР. Перевозка окна (приём chest_probe)
// самого дайвера не переносит: он остаётся в своей мировой клетке, автопилот ведёт
// его через полкарты, окно переезжает и замер отменяется. Поэтому просто плывём
// вниз и на каждом экране смотрим, нет ли синего предмета.
const TOP = m.rd(S.L5B03 + 1) === 0, R0 = TOP ? 9 : 0;
const snap = () => { const s2 = new Set();
  for (let r = R0; r < 24; r++) for (let c = 0; c < 32; c++)
    if (inkE(r, c) > 0 && anyC(r, c) === 0) s2.add(r + "," + c); return s2; };
{ const rows = {};
  for (let r = 0; r < 24; r++) { let n = 0;
    for (let c = 0; c < 32; c++) if (inkE(r, c) > 0 && anyC(r, c) === 0) n++;
    if (n) rows[r] = n; }
  console.log("  клетки «только 0xE000» по строкам:", Object.entries(rows).map(([r, n]) => `${r}:${n}`).join(" ") || "нет"); }
// ЦИКЛ «НАЙТИ — ДОЙТИ — ПРОВЕРИТЬ». Пока идём, окно карты может переехать, и
// предмет остаётся на прежнем экране; поэтому после каждого прихода смотрим,
// на месте ли он, и если нет — ищем заново уже на текущем экране.
// ЦЕЛЬ БЕРЁМ ТОЛЬКО ТОГДА, КОГДА ОНА УЖЕ РЯДОМ. Дальняя цель не годится: пока
// автопилот ведёт дайвера через экран, окно карты переезжает, и клетка цели
// показывает уже другое место мира — в замере это выглядело как «дошли, предмет
// исчез» (дайвер ровно в цели, а пикселей предмета там нет).
// Поэтому плывём, а каждые несколько кадров смотрим, нет ли синего предмета в
// радиусе четырёх знакомест; нашли — доводим коротким отрезком.
let it = null, reached = false;
const stat = { cand: 0, notgot: 0, moved: 0, gone: 0 };
for (let f = 0; f < 120000 && !reached; f++) {
  m.key(KEY.DOWN, (f % 60) < 40); m.key(KEY.RIGHT, (f % 60) >= 40);
  m.step();
  if (f % 30) continue;
  const dr0 = m.rd(S.DiverObj + 0x19), dc0 = m.rd(S.DiverObj);
  let cand = null;
  for (let r = Math.max(R0, dr0 - 4); r <= Math.min(23, dr0 + 4); r++)
    for (let c = Math.max(0, dc0 - 4); c <= Math.min(31, dc0 + 4); c++) {
      if (attr(r, c) !== 0x07) continue;          // 0x07 — ракушка
      const d = Math.abs(r - dr0) + Math.abs(c - dc0);
      if (d >= 2 && (!cand || d < cand.d)) cand = { row: r, col: c, d }; }
  if (!cand) continue;
  const scrB = m.rd(S.L5B03) + "," + m.rd(S.L5B03 + 1);
  const got = goTo(m, S, KEY, cand.row, cand.col, 2500);
  const same = m.rd(S.L5B03) + "," + m.rd(S.L5B03 + 1) === scrB;
  stat.cand++;
  if (!got) stat.notgot++; else if (!same) stat.moved++; else if (attr(cand.row, cand.col) !== 0x07) stat.gone++;
  if (got && same && attr(cand.row, cand.col) === 0x07) { it = cand; reached = true; }
}
console.log(`  кандидатов рядом ${stat.cand}: не дошли ${stat.notgot}, окно уехало ${stat.moved}, предмет исчез ${stat.gone}`);
if (!reached) { console.log("  до синего предмета так и не дошли — выборка пуста, вывод делать нельзя"); process.exit(2); }
console.log(`  стоим на предмете: строка ${it.row}, столбец ${it.col}; окно ${m.rd(S.L5B03)},${m.rd(S.L5B03 + 1)}`);
const before = [0, 1].map(d => inkC(it.row, it.col + d));
const baseC = new Set();   // снимок ПОСЛЕ прихода — см. выше
for (let r = Math.max(0, it.row - 2); r <= Math.min(23, it.row + 2); r++)
  for (let c = Math.max(0, it.col - 2); c <= Math.min(31, it.col + 2); c++) if (inkC(r, c)) baseC.add(r + "," + c);
if (reached) for (let f = 0; f < 800; f++) { onItem++;
  if (f % 25 === 0) dir = nxt() & 3;
  for (let i = 0; i < 4; i++) m.key(KEYS[i], i === dir);
  m.step();
  if (tookAt < 0 && held() !== held0) tookAt = f; }
met = onItem;
// УВОД КОРОТКИЙ И РУЧНОЙ. goTo с дальней целью уводил дайвера за край экрана,
// окно карты переезжало, и замер приходилось выбрасывать («экран уехал 21,2 ->
// 5,9»). Здесь — 250 кадров тяги в сторону от предмета, не больше.
const scr0 = m.rd(S.L5B03) + "," + m.rd(S.L5B03 + 1);
for (let f = 0; f < 250; f++) {
  m.key(KEY.UP, f % 20 < 12); m.key(KEY.DOWN, false);
  m.key(KEY.LEFT, f < 60); m.key(KEY.RIGHT, false); m.step(); }
const scr1 = m.rd(S.L5B03) + "," + m.rd(S.L5B03 + 1);
if (scr1 !== scr0) { console.log(`  экран уехал (${scr0} -> ${scr1}) — замер недействителен`); process.exit(2); }
console.log(`  кадров ТОЧНО на предмете после подбора: ${onItem}; занятость клетки предмета SCRATTR = 0x${attr(it.row, it.col).toString(16)}` +
  `, соседней 0x${attr(it.row, it.col + 1).toString(16)}; дайвер (${m.rd(S.DiverObj)},${m.rd(S.DiverObj + 1)})`);
console.log(`  HELD ${held0} -> ${held()}${tookAt >= 0 ? `, сокровище взято на кадре ${tookAt}` : ", сокровище НЕ взято"}`);
console.log(`  кадров вплотную: ${met}; перерисовок тайлов предметов: ${redraws}; дайвер (${m.rd(S.DiverObj)},${m.rd(S.DiverObj + 1)}), цель (${it.col},${it.row})`);
// СМОТРИМ ОКРЕСТНОСТЬ 5x5, А НЕ ДВЕ КЛЕТКИ: спрайт дайвера шире предмета, и
// след мог остаться рядом, а не точно на нём.
const octo = m.rd(S.L9C50) ? (() => { const a = m.rd(S.L9C51) | (m.rd(S.L9C51 + 1) << 8);
  return { col: (a >> 8) & 0x1f, row: (255 - (a & 0xff)) >> 3 }; })() : null;
if (octo) console.log(`  на экране осьминог: строка ${octo.row}, столбец ${octo.col} — его клетки в счёт не идут`);
const around = [];
for (let r = Math.max(0, it.row - 2); r <= Math.min(23, it.row + 2); r++)
  for (let c = Math.max(0, it.col - 2); c <= Math.min(31, it.col + 2); c++) {
    // САМ ДАЙВЕР НЕ СЛЕД. Он жёлтый, его спрайт занимает несколько знакомест, и
    // после увода он может стоять в двух клетках от предмета — его собственные
    // пиксели попадали в «след» (клетка 7,9 при дайвере в 9,7).
    const dc2 = m.rd(S.DiverObj), dr2 = m.rd(S.DiverObj + 0x19);
    if (Math.abs(r - dr2) <= 3 && Math.abs(c - dc2) <= 3) continue;
    // ОСЬМИНОГ ТОЖЕ ЖЁЛТЫЙ (с 901cdba) И КРУПНЫЙ — 6 столбцов на 4 строки.
    // Без этой проверки его тело целиком уезжало в «жёлтый след»: пятно строк
    // 4..7 в столбцах 7..11 — это ровно он, а не мусор.
    if (octo && r >= octo.row - 1 && r <= octo.row + 4 && c >= octo.col - 1 && c <= octo.col + 6) continue;
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
// ЧТО ИМЕННО ЛЕЖИТ В СПОРНЫХ КЛЕТКАХ: байты обеих плоскостей. Жёлтый — это C без
// E; если в E тоже биты, клетка красная (рельеф), и это не наш след.
for (const k of around.slice(0, 4)) { const [rr, cc] = k.split(":")[0].split(",").map(Number);
  const cb = [], eb = [];
  for (let i = 0; i < 8; i++) { const lo = (255 - (rr * 8 + i)) & 0xff;
    cb.push(m.rd(0xC000 + cc * 256 + lo).toString(16).padStart(2, "0"));
    eb.push(m.rd(0xE000 + cc * 256 + lo).toString(16).padStart(2, "0")); }
  console.log(`    клетка ${rr},${cc}: C=${cb.join(" ")}  E=${eb.join(" ")}`); }
const ok = after.every(x => x === 0) && around.length === 0;
console.log(ok ? "зелёный: жёлтых следов ни на предмете, ни вокруг не осталось"
               : `КРАСНЫЙ: жёлтый след остался — на предмете ${after.join("/")}, вокруг ${around.join(" ") || "нет"}`);
process.exit(ok ? 0 : 1);
