// ПЕРЕПИСЬ ИСПОЛНЕНИЯ КОДОВЫХ ТЕЛ: кто холодный, кто тёплый, кого нельзя двигать.
//
// Зачем. Выселять в ломти можно не только данные, но и код — ассемблер разрешает
// ссылки символически через DISP/ENT. Но у кода есть два свойства, которых у
// данных нет, и оба ловятся не рассуждением, а замером:
//
//   ВХОД ПРОВАЛОМ. Если предыдущее тело кончается не безусловным переходом, в
//   наше тело входят «сверху», просто досчитав до него. Перенос такое рвёт.
//   Именно так прошлый заход выселил метки циклов L9C69/L9C6C/L9CAA из
//   DrawGameScr: это не процедуры, а метки внутри чужого тела.
//
//   ВЫХОД ПРОВАЛОМ. Если тело кончается не ret/jp, оно проваливается в соседа.
//   На новом месте сосед другой, и телу нужен шов `jp` (3 байта в ломте).
//
// Признак безусловности берётся по ПОСЛЕДНЕМУ ОПКОДУ из листинга: ret (0xC9),
// jp nn (0xC3), pchl (0xE9), rst (0xC7|0xCF|...|0xFF). Условные ret/jp сюда не
// входят намеренно — после них исполнение продолжается вниз.
//
// Холодность — число исполнений за спектр сцен. Горячим считается тело с
// исполнениями выше порога HOT (по умолчанию 0: горячий = исполнялся вообще).
//
//   node tools/verify/exec_census.js              — сводка
//   EC_LIST=cold node tools/verify/exec_census.js — список годных к переносу
"use strict";
const fs = require("fs"), path = require("path");
const { readSym } = require("./harness.js");
const { reachGame } = require("./drive.js");
const ROOT = path.resolve(__dirname, "../..");
const B = process.env.BUILD_DIR || "build";
const rom = `${ROOT}/${B}/ev/scuba.rom`, sym = `${ROOT}/${B}/ev/scubacod1.sym`;
const lst = `${ROOT}/${B}/ev/scubacod1.lst`;
for (const f of [rom, sym, lst]) if (!fs.existsSync(f)) {
  console.log(`нет файла ${f} — собери DET=1 SRC=src8080 GEOM=1 EVICT=1 OUT=${B}/ev`);
  process.exit(2); }
const S = readSym(sym);

// --- 1. карта «адрес -> байты инструкции» из листинга -------------------------
// Строки ДАННЫХ (DEFB/DB/DEFW/DW/DS) помечаются отдельно. Без этого байт данных,
// случайно равный 0xC9, читается как «тело кончается ret» — а по такому признаку
// решается, можно ли тело двигать. Данные выселяет свой механизм, кодовым телом
// считается только то, что целиком набрано инструкциями.
const insn = new Map();                    // addr -> [b0, b1, ...]
const dataAt = new Set();                  // адреса, объявленные директивой данных
for (const line of fs.readFileSync(lst, "latin1").split("\n")) {
  const m = /^\s*\d+[+ ]?\s+([0-9A-F]{4})\s+((?:[0-9A-F]{2} )+)/.exec(line);
  if (!m) continue;
  const a = parseInt(m[1], 16);
  const bytes = m[2].trim().split(/\s+/).map(x => parseInt(x, 16));
  if (!insn.has(a)) insn.set(a, bytes);
  if (/\b(DEFB|DEFW|DEFM|DEFS|DB|DW|DS|ABYTE)\b/i.test(line)) dataAt.add(a);
}
if (insn.size < 1000) { console.log(`листинг разобран подозрительно бедно: ${insn.size} инструкций`);
                        process.exit(2); }

// --- 2. границы тел по меткам -------------------------------------------------
const CODE_LO = 0x1000, CODE_HI = 0xC000;
const labs = Object.entries(S).filter(([k, v]) => v >= CODE_LO && v < CODE_HI)
                              .sort((a, b) => a[1] - b[1]);
const bodies = [];
for (let i = 0; i < labs.length - 1; i++) {
  const [name, a] = labs[i], end = labs[i + 1][1];
  if (end <= a) continue;
  bodies.push({ name, a, end, size: end - a });
}

// Последняя инструкция тела и её опкод: идём по карте инструкций внутри тела.
const UNCOND = b => b === 0xC9 || b === 0xC3 || b === 0xE9 ||
                    (b >= 0xC7 && (b & 0x07) === 7);      // rst
for (const b of bodies) {
  let last = null, covered = 0, anyData = false;
  for (let a = b.a; a < b.end; ) {
    const ins = insn.get(a);
    if (!ins) { a++; continue; }
    if (dataAt.has(a)) anyData = true;
    last = ins[0]; covered += ins.length; a += ins.length;
  }
  b.lastOp = last;
  b.isCode = !anyData && covered > 0;
  b.decoded = covered === b.size && b.isCode;
  b.exitsClean = b.isCode && last != null && UNCOND(last);
}
// вход провалом: предыдущее тело кончается НЕ безусловно
// Провалиться можно только ИЗ КОДА. Если сверху лежат данные, линейного входа
// в тело нет — а прежняя версия объявляла его входом провалом и отсеивала
// сотни годных тел на основании байта данных.
for (let i = 1; i < bodies.length; i++) {
  const prev = bodies[i - 1];
  // Провал засчитывается ВСЕГДА, когда предыдущее тело не кончается безусловно.
  // Исключение одно: предыдущее — заведомо неисполняемые данные (не код и ни
  // разу не исполнялось ни в игре, ни до раскладки).
  // Прежняя версия требовала prev.isCode, и метка L9CBF, идущая сразу за
  // «LD B,$08» внутри процедуры отрисовки тайла, попадала в корпус: тело
  // считалось самостоятельным, а в него проваливаются сверху. Бисекция нашла
  // его на границе 15/16 ломтей.
  const prevDead = !prev.isCode && !prev.hits && !prev.preHits;
  bodies[i].fallIn = !prev.exitsClean && !prevDead;
}
if (bodies.length) bodies[0].fallIn = false;

// --- 3а. ОКНО ДО РАСКЛАДКИ ----------------------------------------------------
// Кодовое тело, в отличие от данных, может ИСПОЛНЯТЬСЯ. Ломти наполняются только
// в ZoneCopy на входе в Game, а до этого работают бут, меню и прерывание KEYINT —
// вызов выселенного тела в этом окне прыгает в пустую видеопамять. «Холодное в
// геймплее» не значит «холодное в буте». Меряем на ЧИСТОЙ сборке (тела ещё на
// своих местах): всё, что исполнилось до входа в Game, к переносу негодно.
const preHits = new Map();
if (process.env.EC_PRE) {
  const pr = `${ROOT}/${B}/gz/scuba.rom`, ps = `${ROOT}/${B}/gz/scubacod1.sym`;
  if (!fs.existsSync(pr)) { console.log(`нет ${pr} — собери DET=1 SRC=src8080 GEOM=1 OUT=${B}/gz`);
                            process.exit(2); }
  // Доводит до игры ШТАТНЫЙ драйвер: бут, титры, меню и выбор уровня он проходит
  // сам. Своя последовательность клавиш висла на меню — сбор шёл в пустоту.
  let closed = false;
  reachGame(pr, ps, { cpu: "i8080", level: 1, seed: 0x0167,
    preHook: (m, SS) => {
      m.onPc(SS.Game, () => { closed = true; });   // окно закрывается входом в Game
      const cb = m.v06c.check_breakpoint;
      m.v06c.check_breakpoint = () => { const pc = m.cpu.pc & 0xffff;
        if (!closed && pc >= CODE_LO && pc < CODE_HI)
          preHits.set(pc, (preHits.get(pc) || 0) + 1);
        return cb(); }; } });
  console.log(`окно до раскладки: исполненных адресов ${preHits.size}`);
  if (preHits.size === 0) { console.log("окно пусто — замер не состоялся"); process.exit(2); }
}

// --- 3. перепись исполнения на спектре сцен -----------------------------------
const SCENES = [["уровень 4 поверхность", 4, null, 900], ["уровень 1 поверхность", 1, null, 900],
                ["уровень 4 глубина", 4, 9, 900], ["уровень 1 долгий+гибели", 1, null, 3000],
                ["уровень 2", 2, null, 700], ["уровень 3", 3, null, 700]];
const hits = new Map();                     // addr -> сколько раз исполнялся
for (const [name, lvl, row, ticks] of SCENES) {
  const g = reachGame(rom, sym, { cpu: "i8080", level: lvl, seed: 0x0167,
    preHook: (m, SS) => {
      const cb = m.v06c.check_breakpoint;
      m.v06c.check_breakpoint = () => {     // ОБЁРТКА, а не подмена: подмена уже
        const pc = m.cpu.pc & 0xffff;       // однажды убила диспетчер onPc
        if (pc >= CODE_LO && pc < CODE_HI) hits.set(pc, (hits.get(pc) || 0) + 1);
        return cb();
      }; } });
  let t = 0; g.m.onPc(S.LD9C0, () => { t++; if (row !== null) g.m.wr(S.L5B03 + 1, row); });
  let q = 0; while (t < ticks && q < 900000) { g.m.step(); q++; }
  process.stderr.write(`  ${name}: ${t} тиков\n`);
}
if (hits.size === 0) { console.log("перепись пуста — замер не состоялся"); process.exit(2); }
for (const b of bodies) {
  let n = 0, p = 0;
  for (let a = b.a; a < b.end; a++) { n += hits.get(a) || 0; p += preHits.get(a) || 0; }
  b.hits = n; b.preHits = p;
}
if (process.env.EC_PRE) {
  const live = bodies.filter(b => b.preHits > 0);
  console.log(`тел, исполнявшихся ДО раскладки: ${live.length} — все они к переносу негодны`);
}

// --- 4. сводка ----------------------------------------------------------------
const MAXB = 61;                            // тело крупнее в ломоть не влезет
const cold = bodies.filter(b => b.hits === 0 && !b.preHits && b.decoded && b.isCode && !b.fallIn && b.size <= MAXB);
const coldClean = cold.filter(b => b.exitsClean);
const coldSeam = cold.filter(b => !b.exitsClean && b.size + 3 <= 64);
const warm = bodies.filter(b => b.hits > 0 && !b.preHits && b.decoded && b.isCode && !b.fallIn && b.size <= MAXB);
const sum = arr => arr.reduce((s, b) => s + b.size, 0);
console.log(`тел всего ${bodies.length}, исполнялось ${bodies.filter(b => b.hits > 0).length}`);
console.log(`ХОЛОДНЫЕ, годные к переносу (<=${MAXB} Б, без входа провалом, разобраны):`);
console.log(`   без шва (кончаются ret/jp/rst): ${coldClean.length} тел, ${sum(coldClean)} Б`);
console.log(`   со швом jp (+3 Б в ломте):      ${coldSeam.length} тел, ${sum(coldSeam)} Б`);
console.log(`   ИТОГО холодных: ${cold.length} тел, ${sum(cold)} Б`);
console.log(`тёплые (исполнялись) той же годности: ${warm.length} тел, ${sum(warm)} Б`);
console.log(`отсеяно: вход провалом ${bodies.filter(b => b.fallIn).length}, ` +
            `не разобрано целиком ${bodies.filter(b => !b.decoded).length}, ` +
            `крупнее ${MAXB} Б ${bodies.filter(b => b.size > MAXB).length}`);
// ГОРЯЧИЕ НЕПРИКОСНОВЕННЫ. Ранжируем исполнявшиеся тела по числу исполнений:
// верхние HOT_N — это те самые горячие, которые не трогаем ни при какой нехватке.
// Порог задаётся числом тел, а не долей: так он не поедет от длины прогона.
const HOT_N = +(process.env.HOT_N || 22);
const byHits = bodies.filter(b => b.hits > 0).sort((a, b) => b.hits - a.hits);
const hotSet = new Set(byHits.slice(0, HOT_N).map(b => b.name));
const warmCool = warm.filter(b => !hotSet.has(b.name));
const totalHits = byHits.reduce((s, b) => s + b.hits, 0);
const hotShare = byHits.slice(0, HOT_N).reduce((s, b) => s + b.hits, 0) / totalHits;
console.log(`горячих ${HOT_N} тел держат ${(hotShare * 100).toFixed(1)} % всех исполнений — ` +
            `их не трогаем; тёплые без них: ${warmCool.length} тел, ${sum(warmCool)} Б`);
console.log(`РЕЗЕРВ ПОД КОД: холодные ${sum(cold)} Б + тёплые без горячих ${sum(warmCool)} Б ` +
            `= ${sum(cold) + sum(warmCool)} Б`);
// EC_PLAN=<файл> — выгрузка корпуса кодовых тел для tools/mkzone.py.
// Формат TSV: имя, нужен-шов(0/1), метка-соседа (куда тело проваливалось).
// Порядок: сперва холодные (шов бесплатен — они не исполняются), потом тёплые
// без горячих, по возрастанию числа исполнений: если корпуса хватит, самые
// живые тела до переноса просто не дойдут.
if (process.env.EC_PLAN) {
  const nextOf = new Map();
  for (let i = 0; i < bodies.length - 1; i++) nextOf.set(bodies[i].name, bodies[i + 1].name);
  const order = [...cold.sort((a, b) => a.hits - b.hits),
                 ...warmCool.sort((a, b) => a.hits - b.hits)];
  const rows = order.map(b => `${b.name}\t${b.exitsClean ? 0 : 1}\t${nextOf.get(b.name) || ""}`);
  fs.writeFileSync(process.env.EC_PLAN, rows.join("\n") + "\n");
  console.log(`план корпуса выгружен: ${rows.length} тел -> ${process.env.EC_PLAN}`);
}
if (process.env.EC_LIST === "hot")
  for (const b of byHits.slice(0, HOT_N))
    console.log(`   ${b.name}\t${b.size} Б\t${b.hits} исполнений`);
if (process.env.EC_LIST === "cold")
  for (const b of cold.sort((x, y) => y.size - x.size))
    console.log(`   ${b.name}\t${b.size}\t${b.exitsClean ? "ret/jp" : "ШОВ"}`);
