// ПЕРЕПОЛНЕНИЕ ЛОМТЯ ПУЛА: сторож в МОМЕНТ ЗАПИСИ, а не постфактум.
//
// Свидетельство с железа (образ 3a6a49c3): порча появляется С ПОЯВЛЕНИЕМ БОЛЬШОЙ
// АКУЛЫ и идёт парой столбцов слева по всей вертикали.
//
// Устройство, из-за которого это возможно (`LB655`, scubacodb.asm): раздатчик
// буферов save-under РАЗМЕРА НЕ ЗНАЕТ. Он берёт первый свободный индекс и выдаёт
//   индекс 0 и 1 -> ПОЛНАЯ страница 256 Б (0xB000 / 0xB100),
//   индекс 2..15 -> ЛОМОТЬ 48 Б (страница 0xC0+индекс, младшие 208..255).
// Индекс 0 занят стейджингом навсегда, значит полная страница остаётся ровно
// ОДНА. Любое второе существо, которому нужно больше 48 Б, получает ломоть — и
// его сохранение фона уходит за младший байт 255 в соседнюю страницу, то есть в
// ВИДИМОЕ ПОЛЕ соседнего столбца. «Пара столбцов по всей вертикали» — это оно.
//
// Мера. Писатели save-under не берутся из головы, а КАЛИБРУЮТСЯ: сначала
// собираются PC всех записей внутрь законных границ буферов (полная страница —
// вся, ломоть — только 208..255), и это множество объявляется трактами
// сохранения фона. Затем ищутся записи ТЕХ ЖЕ PC мимо границ. Так мера не
// зависит от того, какие метки я угадал.
//
//   node tools/verify/pool_overflow_gate.js
//   PO_LEVELS=1,2,3,4   PO_SEEDS=0x0167,0x2B1D,0x77A3   PO_TICKS=1200
//   PO_INJECT=1  — сдвинуть порог раздатчика так, что полную страницу получает
//                  только индекс 0: второе крупное существо садится в ломоть.
//                  Гейт обязан покраснеть — иначе он не мерит переполнения.
//   PO_EMPTY=1   — обнулить выборку.
"use strict";
const fs = require("fs"), path = require("path");
const { readSym } = require("./harness.js");
const { reachGame, swim } = require("./drive.js");
const ROOT = path.resolve(__dirname, "../..");
const B = process.env.BUILD_DIR || "build";
const DIR = process.env.PO_DIR || `${ROOT}/${B}/ev`;
for (const f of ["scuba.rom", "scubacod1.sym"])
  if (!fs.existsSync(`${DIR}/${f}`)) { console.log(`нет ${DIR}/${f}`); process.exit(2); }
const S = readSym(`${DIR}/scubacod1.sym`);
for (const n of ["LB655_marked", "LB655_cp", "LD9C0", "DiverObj", "i80_ldir_1", "LBFC3"])
  if (S[n] == null) { console.log(`нет метки ${n} в .sym`); process.exit(2); }
const LEVELS = (process.env.PO_LEVELS || "1,4").split(",").map(Number);
const SEEDS = (process.env.PO_SEEDS || "0x0167,0x2B1D,0x77A3,0x0C55").split(",").map(x => Number(x));
const TICKS = Number(process.env.PO_TICKS || 900);
const INJECT = process.env.PO_INJECT === "1";
const EMPTY = process.env.PO_EMPTY === "1";
// Какой шаблон существа форсировать (индекс в таблице LC2EB): 1 = Shark.
// -1 отключает подсадку.
const FORCE = process.env.PO_FORCE === undefined ? 1 : Number(process.env.PO_FORCE);

// Существа и их спрайтовые блоки — из таблицы записей, а не из головы.
const codb = fs.readFileSync(path.join(ROOT, "src8080", "scubacodb.asm"), "utf8").split("\n");
const CRE = [];
for (const l of codb) {
  const m = l.match(/^\s*DEFW\s+((?:L[0-9A-Fa-f]{4}\s*,\s*)+L[0-9A-Fa-f]{4})\s*;\s*(.+?)\s*$/);
  if (!m) continue;
  const ls = m[1].split(/\s*,\s*/);
  // ПРИНАДЛЕЖНОСТЬ ПО МЕТКЕ, А НЕ ПО ДИАПАЗОНУ min..max: у существа 4-6 указателей,
  // разбросанных по всему спрайтовому файлу, и «от минимального до максимального»
  // накрывает чужие блоки целиком — первая версия видела одну круглую рыбу и
  // приписывала ей всё подряд.
  if ((ls.length === 4 || ls.length === 6) && ls.every(n => S[n] != null))
    for (const n of ls) CRE.push({ name: m[2], label: n, a0: S[n] });
}

let allocs = 0, overflow = 0, checked = 0, forced = 0, inGame = false;
const seenCre = new Set(), byIdx = new Map(), overShots = [];
const names = Object.entries(S).sort((a, b) => b[1] - a[1]);
const near = (pc) => { const e = names.find(([, v]) => v <= pc); return e ? `${e[0]}+${pc - e[1]}` : "?"; };

function run(level, seed) {
  const bufs = new Map();          // страница -> {idx, lo0, size}
  const savePc = new Set();        // калиброванные PC трактов save-under
  const outside = [];              // записи тех же PC мимо границ
  const g = reachGame(`${DIR}/scuba.rom`, `${DIR}/scubacod1.sym`,
    { cpu: "i8080", level, seed, preHook: (m, SS) => {
      // ПОДСАДКА: порог раздатчика с 2 на 1 — полную страницу получает только
      // индекс 0, и первое же крупное существо садится в ломоть 48 Б.
      if (INJECT) m.onPc(SS.START_GAME, () => { m.wr(SS.LB655_cp + 1, 1); });
      // ЧТО ИМЕННО ВЫДАНО. На выходе раздатчика A = 0xB0+индекс, а буфер уже
      // записан в (IX+7)/(IX+8). Индекс — это и есть ответ на вопрос «кому
      // досталась единственная полная страница, а кому ломоть в 48 Б».
      m.onPc(SS.LB655_marked, () => {
        allocs++;
        const idx = m.cpu.regs[7] & 0x0f;
        byIdx.set(idx, (byIdx.get(idx) || 0) + 1);
      });
      // ФОРСИРОВАНИЕ ТИПА СУЩЕСТВА. Тип берётся из ГПСЧ (`NextRandom / AND $0E`),
      // и за восемь прогонов на четырёх сидах в выборку попала одна круглая рыба:
      // ждать акулу случаем — это не сцена, а лотерея. Подсадка адресна и честна:
      // мы меряем геометрию буферов, а не логику выбора. Эффект проверяется
      // числом — чтения спрайтов акулы обязаны появиться.
      if (SS.LBFC3 != null && FORCE >= 0)
        m.onPc(SS.LBFC3, () => { forced++; m.cpu.regs[3] = (FORCE * 2) & 0x0e; m.cpu.regs[2] = 0; });
      // СТРОГИЙ ДЕТЕКТОР ПЕРЕПОЛНЕНИЯ: сохранение фона идёт ПОДРЯД по возрастанию
      // адреса, поэтому выход из ломтя выглядит однозначно — запись в младший
      // байт 255 страницы ломтя, а СЛЕДУЮЩАЯ тем же трактом в младший 0 соседней
      // страницы. Никакой калибровки «кто такие писатели» не нужно: первая версия
      // объявляла писателем любой PC, once написавший в буфер, и ловила 181076
      // «переполнений», из которых все были законными записями общих хелперов.
      const o = m.memory.write.bind(m.memory);
      let prevA = -1, prevPc = -1;
      m.memory.write = (a, v, st) => { a &= 0xffff;
        if (!EMPTY) {
          const pc = m.cpu.pc & 0xffff, pp = (prevA >> 8) & 0xff;
          // ТОЛЬКО ГЕЙМПЛЕЙ. Распаковщик образа (dzx0) идёт по видеопамяти линейно
          // и границы страниц пересекает законно — 40 его переходов первая версия
          // засчитала переполнениями. Сохранение фона живёт в главном цикле,
          // поэтому смотрим только после первого тика.
          // ДВА ВИДА ЗАВОРОТА, и ловить надо ОБА. Курсор сохранения фона шагает
          // младшим байтом: `inc hl` уводит в СЛЕДУЮЩУЮ страницу (lo 255 -> +1),
          // а `inc l` заворачивается в ТУ ЖЕ страницу (lo 255 -> lo 0). Второй
          // случай и объясняет свидетельство «пара столбцов слева по всей
          // вертикали»: страницы 0xC2..0xC6 — это столбцы 2..6 плоскости 2, и
          // запись с младшим байтом ниже 208 попадает в видимое поле столбца во
          // всю его высоту. Первая версия ловила только первый вид и молчала.
          const wrapNext = a === ((prevA + 1) & 0xffff);
          const wrapSame = ((a >> 8) & 0xff) === pp && (a & 0xff) === 0;
          if (inGame && prevA >= 0 && (prevA & 0xff) === 255 && (wrapNext || wrapSame) &&
              pp >= 0xC2 && pp <= 0xC6) {
            overflow++;
            if (overShots.length < 6) overShots.push({ a, pc, level, seed });
          }
          prevA = a; prevPc = pc;
        }
        return o(a, v, st); }; } });
  let t = 0; g.m.onPc(S.LD9C0, () => { t++; inGame = true; });
  g.m.onPc(S.i80_ldir_1, () => {
    const hl = g.m.cpu.hl() & 0xffff;
    let best = null;
    for (const c of CRE) if (c.a0 <= hl && (!best || c.a0 > best.a0)) best = c;
    if (best && hl - best.a0 < 256) seenCre.add(best.name);
  });
  swim(g, { passes: 1, frames: 20, noDeath: true });
  let q = 0; while (t < TICKS && q < 6000) { g.m.step(); q++; }
  return t;
}

let ticks = 0;
if (!EMPTY) for (const lvl of LEVELS) for (const sd of SEEDS) { inGame = false; ticks += run(lvl, sd); }

let fail = 0, checks = 0;
const chk = (ok, msg) => { checks++; if (ok) console.log("  ok      " + msg);
                           else { fail++; console.log("  ПРОВАЛ  " + msg); } };
console.log(`ПУЛ: ${DIR}, уровни ${LEVELS.join(",")}, сидов ${SEEDS.length}, тиков ${ticks}`);
console.log(`  существ в выборке: ${[...seenCre].join("; ") || "нет"}`);
console.log(`  форсирований типа существа: ${forced}, выдач буферов: ${allocs}`);
console.log(`  выдачи по индексам: ` + ([...byIdx.entries()].sort((a, b) => a[0] - b[0])
  .map(([i, n]) => `${i}${i < 2 ? "(страница 256 Б)" : "(ломоть 48 Б)"}: ${n}`).join(", ") || "нет"));
if (EMPTY || !ticks || !seenCre.size) {
  console.log(`  ПРОВАЛ  ПУСТАЯ ВЫБОРКА: тиков ${ticks}, существ ${seenCre.size}`);
  console.log("ГЕЙТ НЕДЕЙСТВИТЕЛЕН"); process.exit(2); }
chk(overflow === 0, `ни одна запись save-under не вышла за границы буфера ` +
    `(выходов ${overflow})`);
for (const s of overShots)
  console.log(`      [0x${s.a.toString(16).toUpperCase()}] PC=0x${s.pc.toString(16).toUpperCase()} ` +
              `${near(s.pc)} уровень ${s.level} сид 0x${s.seed.toString(16)}`);
console.log(fail ? `ГЕЙТ КРАСНЫЙ: ${fail} из ${checks}` : `ГЕЙТ ЗЕЛЁНЫЙ: все ${checks} проверки`);
process.exit(fail ? 1 : 0);
