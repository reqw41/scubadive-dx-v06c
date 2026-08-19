// ГЕЙТ HUD: горизонтальные полосы-индикаторы и безопасность сдвига поля.
//
// Зачем отдельно от pixgate/lockstep. Те сверяют НАШУ сборку с Z80-эталоном, и
// правки в оба дерева внесены одинаковые — значит одинаковую ошибку они не
// заметят В ПРИНЦИПЕ. Здесь проверяется не совпадение сборок, а само свойство.
//
// Что проверяется:
//  1) ПОЛОСЫ. UpdateDepth1/UpdateOxygen вызываются напрямую на всём диапазоне
//     входа (вверх, вниз, через 0 и 127), и для каждого значения сверяется:
//       - сохранённое состояние == ожидаемому,
//       - число ЗАЖЖЁННЫХ пикселей на экране == состоянию,
//       - все 4 строки полосы одинаковы (высота полосы не поехала).
//     Полоса рисуется ИНКРЕМЕНТАЛЬНО (только разница), поэтому накопленный
//     дрейф — самый вероятный дефект, и ловится он только так.
//  2) СТОЛБЦЫ ПОЛЯ. GetScrAddrF делает `add a,$C4`, и столбец >= 28 уехал бы в
//     плоскость 0xE000 — прямо в HUD. Клип LB4BB (столбец+ширина < 24) это
//     запрещает; здесь то же самое ЗАМЕРЯЕТСЯ на прогоне сценариев.
//
// Негативные контроли:
//   HUD_INJECT=1  — испортить один байт полосы. Гейт обязан покраснеть.
//   HUD_EMPTY=1   — обнулить выборку. Гейт обязан покраснеть.
//
//   node tools/verify/hud_gate.js <rom> <sym>
"use strict";
const path = require("path");
const { reachGame } = require("./drive.js");
const { SCENARIOS } = require("./oracle.js");

const rom = process.argv[2], sym = process.argv[3];
const INJECT = process.env.HUD_INJECT === "1";
const EMPTY = process.env.HUD_EMPTY === "1";

// Базы полос: левый верхний байт в плоскости 0xC000, столбец 8.
// Держим их здесь ЧИСЛАМИ, а не читаем из .sym: смысл гейта в том, чтобы
// заметить, если код уедет на другой адрес, а раскладка HUD останется прежней.
// HUD_PANEL=1 — режим ВЕРТИКАЛЬНОЙ ПАНЕЛИ (сборка -DGEOM): раскладка Зимина,
// шкала шириной в один столбец, ползунок высотой 4 строки едет по 128 пикселям,
// а состояние — не длина полосы, а АДРЕС ползунка. Проверяемое свойство другое,
// поэтому и модель другая, а не подкрученные константы старой.
// Адреса шкал в режиме панели БЕРУТСЯ ИЗ СИМВОЛОВ СБОРКИ, а не зашиты числом:
// при выравнивании панели под нашу геометрию они уехали на 32 строки ($D9A3 ->
// $D983), и зашитая константа молча мерила бы пустое место. Символы GAUGE_OXY /
// GAUGE_DEPTH — обычные EQU, sjasmplus кладёт их в .sym.
const PANEL = process.env.HUD_PANEL === "1";
let GAUGE_DEPTH, GAUGE_OXY;    // в режиме панели — из .sym, ниже; иначе полосы HUD
const BAR_COLS = 16;          // 16 столбцов * 8 = 128 пикселей (горизонтальный HUD)
const BAR_ROWS = 4;

let fail = 0, checks = 0;
const chk = (ok, msg) => { checks++; if (ok) console.log("  ok      " + msg);
                           else { fail++; console.log("  ПРОВАЛ  " + msg); } };

const g = reachGame(rom, sym, { cpu: "i8080", level: 1, seed: 0x0167 });
const S = g.S, m = g.m, cpu = m.cpu;
for (const n of ["UpdateDepth1", "UpdateOxygen", "LDE55", "LDE57", "GetScrAddr", "GetScrAddrF"])
  if (S[n] == null) { console.log(`нет метки ${n} в .sym`); process.exit(2); }
if (PANEL) {
  for (const n of ["GAUGE_OXY", "GAUGE_DEPTH"])
    if (S[n] == null) { console.log(`нет EQU ${n} в .sym — гейт не станет мерить по догадке`);
                        process.exit(2); }
  GAUGE_OXY = S.GAUGE_OXY; GAUGE_DEPTH = S.GAUGE_DEPTH;
  console.log(`  шкалы из .sym: OXY=$${GAUGE_OXY.toString(16).toUpperCase()} ` +
              `DEPTH=$${GAUGE_DEPTH.toString(16).toUpperCase()}`);
} else { GAUGE_DEPTH = 0xc80d; GAUGE_OXY = 0xc81d; }

// сколько пикселей полосы горит (по верхней строке полосы)
function lit(base) {
  let k = 0; const lo = base & 0xff, col = base >> 8;
  for (let c = 0; c < BAR_COLS; c++) {
    const v = m.rd(((col + c) << 8) | lo);
    for (let b = 7; b >= 0; b--) if ((v >> b) & 1) k++;
  }
  return k;
}
// все BAR_ROWS строк полосы совпадают с верхней
function rowsEven(base) {
  const lo = base & 0xff, col = base >> 8;
  for (let c = 0; c < BAR_COLS; c++) {
    const a = m.rd(((col + c) << 8) | lo);
    for (let r = 1; r < BAR_ROWS; r++) if (m.rd(((col + c) << 8) | ((lo - r) & 0xff)) !== a) return false;
  }
  return true;
}
// --- модель ВЕРТИКАЛЬНОЙ шкалы -------------------------------------------
// Ползунок: четыре байта $FF по адресам st-1 .. st+2, где st = база - значение.
// Проверяем три вещи сразу: состояние равно ожидаемому адресу, все четыре байта
// на месте, и в столбце НЕТ НИ ОДНОГО лишнего $FF (инкрементальная отрисовка
// обязана стирать за собой — накопленный след это самый вероятный дефект).
function sliderState(addr) { return m.rd(addr) | (m.rd(addr + 1) << 8); }
function sliderOk(base, want) {
  const st = (base - want) & 0xffff, col = st >> 8;
  let lo = st & 0xff, ok = true, extra = 0;
  for (const d of [-1, 0, 1, 2]) if (m.rd((col << 8) | ((lo + d) & 0xff)) !== 0xff) ok = false;
  for (let i = 0; i < 256; i++) {
    if (m.rd((col << 8) | i) !== 0xff) continue;
    const rel = ((i - lo) << 24 >> 24);
    if (rel < -1 || rel > 2) extra++;
  }
  return { st, ok, extra };
}

// вызвать процедуру игры: площадка `call <addr>; jp SENT`
const PAD = 0xbe00, SENT = 0x0002, R = { h: 4, l: 5, a: 7 };
function call(addr, a, hl) {
  m.wr(PAD, 0xcd); m.wr(PAD + 1, addr & 0xff); m.wr(PAD + 2, addr >> 8);
  m.wr(PAD + 3, 0xc3); m.wr(PAD + 4, SENT & 0xff); m.wr(PAD + 5, SENT >> 8);
  cpu.regs[R.a] = (a || 0) & 0xff;
  if (hl !== undefined) { cpu.regs[R.h] = (hl >> 8) & 0xff; cpu.regs[R.l] = hl & 0xff; }
  cpu.sp = 0x00f0; cpu.pc = PAD;
  let q = 0;
  while ((cpu.pc & 0xffff) !== SENT && q < 300000) { cpu.instruction(); q++; }
  if (q >= 300000) throw new Error("процедура " + addr.toString(16) + " не вернулась");
}

// --- 1. полосы на всём диапазоне ----------------------------------------------
// Порядок нарочно рваный: рост, спад, прыжок через весь диапазон, повтор того же
// значения. Инкрементальная отрисовка обязана выдержать всё.
const samples = [];
const DEPTH_ROWS = [0, 1, 2, 5, 12, 17, 31, 30, 7, 3, 0, 31, 16, 16, 8, 0, 31];
const OXY_HL = [0xffff, 0xf000, 0x8000, 0x4000, 0x2000, 0x0100, 0x0000, 0xffff, 0x0000, 0xc000, 0xc000];
if (!EMPTY) {
  for (const row of DEPTH_ROWS) {
    call(S.UpdateDepth1, row);
    const want = (row * 4) & 0x7f;
    // ПОДСАДКА бьёт по тому, что гейт МЕРЯЕТ, а не по фиксированному адресу:
    // в нижнем HUD полоса начинается с базы, а в панели ползунок стоит там, где
    // велит значение. Первая версия портила базу и в режиме панели не срабатывала.
    if (INJECT && samples.length === 5)
      { const a = PANEL ? sliderState(S.LDE55) : GAUGE_DEPTH; m.wr(a, m.rd(a) ^ 0x80); }
    if (PANEL) { const r = sliderOk(GAUGE_DEPTH, want);
      samples.push({ what: `DEPTH строка ${row}`, want, st: sliderState(S.LDE55) === r.st ? want : -1,
                     drawn: r.ok && r.extra === 0 ? want : -1, even: r.extra === 0 }); }
    else samples.push({ what: `DEPTH строка ${row}`, want,
                   st: m.rd(S.LDE55), drawn: lit(GAUGE_DEPTH), even: rowsEven(GAUGE_DEPTH) });
  }
  for (const hl of OXY_HL) {
    call(S.UpdateOxygen, 0, hl);
    // в панели шкала показывает РАСХОД (127 - остаток), в нижнем HUD — остаток
    const rest = (hl >> 9) & 0x7f, want = PANEL ? (0x7f - rest) & 0x7f : rest;
    if (PANEL) { const r = sliderOk(GAUGE_OXY, want);
      samples.push({ what: `OXYGEN HL=0x${hl.toString(16)}`, want, st: sliderState(S.LDE57) === r.st ? want : -1,
                     drawn: r.ok && r.extra === 0 ? want : -1, even: r.extra === 0 }); }
    else samples.push({ what: `OXYGEN HL=0x${hl.toString(16)}`, want: rest,
                   st: m.rd(S.LDE57), drawn: lit(GAUGE_OXY), even: rowsEven(GAUGE_OXY) });
  }
}
if (samples.length < DEPTH_ROWS.length + OXY_HL.length) {
  console.log(`  ПРОВАЛ  ПУСТАЯ ВЫБОРКА: снято ${samples.length} замеров полос из ` +
              `${DEPTH_ROWS.length + OXY_HL.length}`);
  console.log("ГЕЙТ НЕДЕЙСТВИТЕЛЕН");
  process.exit(2);
}
let bad = samples.filter(s => s.st !== s.want || s.drawn !== s.want || !s.even);
for (const s of bad.slice(0, 6))
  console.log(`          ${s.what}: ждали ${s.want}, состояние ${s.st}, ` +
              `нарисовано ${s.drawn}, 4 строки ровные ${s.even}`);
chk(bad.length === 0,
    `полосы: ${samples.length} замеров, нарисованная длина везде равна состоянию ` +
    `(расхождений ${bad.length})`);
// диапазон реально прощупан, а не застрял в нуле
const vals = samples.map(s => s.want);
chk(Math.min(...vals) === 0 && Math.max(...vals) >= 120,
    `диапазон входа прощупан: значения от ${Math.min(...vals)} до ${Math.max(...vals)} из 0..127`);

// --- 1b. ПЛОСКОСТЬ ПОДСВЕТКИ SKILL/LIVES (только режим панели) ----------------
// Цвет на Векторе — комбинация плоскостей. Цифры SKILL/LIVES приходят готовыми в
// битмапе панели (плоскость 0xE000), поэтому подсветка обязана лечь в 0xC000:
// обе плоскости дают красный. Наша правка эпохи нижнего HUD клала подсветку тем
// же xor $20 в 0xE000 — в ту же плоскость, где уже нарисована цифра, и цвет на
// железе сбивался. Проверяем не команду, а РЕЗУЛЬТАТ: индекс палитры.
if (PANEL && !EMPTY) {
  // Строка подсветки: цифры SKILL стоят у Зимина в его знакоместных строках
  // 7/9/11/13. Наша GetScrAddr не делает его смещения (+4 знакоместа), а после
  // ВЫРАВНИВАНИЯ ПАНЕЛИ битмап уехал вниз ещё на 32 пикселя (+4 знакоместа),
  // итого 7+4+4 = 15. Ровно это число стоит в scubacodc.asm (`ADD A,$0F`).
  const col = 29, lit = 15 + (1 - 1) * 2;   // уровень 1 -> подсвечена строка 15
  const idxOf = r => { const lo = 255 - 8 * r; let c = 0, e = 0;
    for (let i = 0; i < 8; i++) { c |= m.rd(0xC000 + col * 256 + lo - i);
                                  e |= m.rd(0xE000 + col * 256 + lo - i); }
    if (INJECT && r === lit) c = 0;          // подсадка: подсветка не в ту плоскость
    return (c ? 2 : 0) | (e ? 1 : 0); };
  chk(idxOf(lit) === 3, `подсветка SKILL: строка ${lit} даёт индекс ${idxOf(lit)} (ждём 3 = красный, обе плоскости)`);
  const others = [17, 19, 21].map(idxOf);
  chk(others.every(v => v === 1), `неподсвеченные SKILL синие: индексы ${others.join(",")} (ждём 1)`);
}

// --- 2. столбцы, приходящие в GetScrAddrF --------------------------------------
// Поле сдвинуто на 4 столбца (`add a,$C4`), значит столбец 28 и выше уехал бы в
// плоскость 0xE000 — в HUD. Клип LB4BB это запрещает; замеряем.
let worstF = -1, worstG = -1, callsF = 0, callsG = 0;
if (!EMPTY) {
  for (const name of ["dive", "level4", "turn"]) {
    const sc = SCENARIOS[name];
    const sched = [];
    for (const ph of sc.phases) for (let i = 0; i < ph.ticks; i++) sched.push(ph.keys || []);
    const total = Math.min(sched.length, 900);
    let n = 0;
    const preHook = (mm, SS) => {
      let held = [];
      mm.onPc(SS.LD9C0, () => {
        n++;
        const keys = sched[n - 1] || [];
        for (const k of held) if (!keys.includes(k)) mm.key(k, false);
        for (const k of keys) if (!held.includes(k)) mm.key(k, true);
        held = keys.slice();
        let l0 = 0xff, l7 = 0xff;
        for (const k of keys) {
          if (k === 37) l0 &= ~0x10; else if (k === 39) l0 &= ~0x40;
          else if (k === 38) l0 &= ~0x20; else if (k === 40) l0 &= ~0x80;
          else if (k === 13) l0 &= ~0x04; else if (k === 9) l0 &= ~0x01;
          else if (k === 32) l7 &= ~0x80;
        }
        mm.wr(SS.KeyLine0, l0 & 0xff); mm.wr(SS.KeyLine7, l7 & 0xff);
        mm.wr(SS.JoystickE, mm.io.input(0x0e) & 0xff);
      });
      mm.onPc(SS.GetScrAddrF, () => { callsF++; const c = mm.cpu.regs[R.l] & 0x1f; if (c > worstF) worstF = c; });
      mm.onPc(SS.GetScrAddr,  () => { callsG++; const c = mm.cpu.regs[R.l] & 0x1f; if (c > worstG) worstG = c; });
    };
    const gg = reachGame(rom, sym, { cpu: "i8080", level: sc.level, seed: sc.seed, preHook });
    let guard = 0;
    while (n < total && guard < 1500000) { gg.m.step(); guard++; }
  }
}
if (callsF === 0) {
  console.log("  ПРОВАЛ  ПУСТАЯ ВЫБОРКА: GetScrAddrF не вызывался ни разу");
  console.log("ГЕЙТ НЕДЕЙСТВИТЕЛЕН");
  process.exit(2);
}
chk(worstF <= 23,
    `столбцы поля: ${callsF} вызовов GetScrAddrF, максимум ${worstF} при пределе 23 ` +
    `($C4+23 = $DB, плоскость 0xC000 не покидаем)`);
chk(callsG > 0 && worstG <= 31,
    `столбцы текста: ${callsG} вызовов GetScrAddr, максимум ${worstG} при пределе 31`);

if (checks === 0) { console.log("ГЕЙТ НЕДЕЙСТВИТЕЛЕН: пустая выборка"); process.exit(2); }
console.log(fail ? `ГЕЙТ КРАСНЫЙ: ${fail} из ${checks}` : `ГЕЙТ ЗЕЛЁНЫЙ: все ${checks} проверки`);
process.exit(fail ? 1 : 0);
