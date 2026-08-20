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
const allocList = []; let drawnAt = null, sharkAlloc = 0, sharkReads = 0;
const seenCre = new Set(), byIdx = new Map(), overShots = [];
const names = Object.entries(S).sort((a, b) => b[1] - a[1]);
const near = (pc) => { const e = names.find(([, v]) => v <= pc); return e ? `${e[0]}+${pc - e[1]}` : "?"; };

function run(level, seed) {
  const bufs = new Map();          // база буфера -> {idx, max}
  const savePc = new Set();        // PC, пишущие ВНУТРЬ ломтя = тракты save-under
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
      // СПАВН АКУЛЫ РЯДОМ С ДАЙВЕРОМ. Возить дайвера через всю карту не нужно и
      // не получается: сцена по рецепту доходит до дна (Y=54) и едет вдоль него,
      // а бродячих существ не встречает — 0 чтений их спрайтов за 5800 тиков.
      // Поэтому координаты берутся у того, кого РЕАЛЬНО рисуют (в момент выдачи
      // буфера), и вписываются в записи акул: байты 0 и 1 записи — столбец и
      // строка. Признак достижения проверяется числом: чтения спрайтов акулы и
      // выдача буфера с именем Shark.
      // МЕРА — СМЕЩЕНИЕ ЗАПИСИ ОТ БАЗЫ ВЫДАННОГО БУФЕРА, а не догадки про заворот.
      // База берётся там же, где её берёт игра: (IX+7)/(IX+8) сразу после выдачи.
      // Прежние две версии (калибровка писателей по PC и детектор перехода
      // lo 255 -> следующая страница) ловили соответственно 181076 законных
      // записей общих хелперов и 40 переходов распаковщика — обе меры были не о
      // том. Смещение от базы не зависит ни от того, какие метки я угадал, ни от
      // того, каким шагом идёт курсор.
      m.onPc(SS.LB655_marked, () => {
        allocs++;
        const ix = m.rd(SS.z80_ix) | (m.rd(SS.z80_ix + 1) << 8);
        const w = m.rd(ix + 19) | (m.rd(ix + 20) << 8);   // тип существа лежит по +19
        const nm = w === SS.LC102 ? "Shark" : w === SS.LC092 ? "Boat" :
                   w === SS.LC0A2 ? "Meduza" : w === SS.LC0B2 ? "Round fish" : "?";
        if (w === SS.LC0A2 || w === SS.LC0B2) drawnAt = [m.rd(ix), m.rd(ix + 1)];
        if (nm === "Shark") sharkAlloc++;
        const base = m.rd(ix + 7) | (m.rd(ix + 8) << 8);
        const idx = m.cpu.regs[7] & 0x0f;
        byIdx.set(idx, (byIdx.get(idx) || 0) + 1);
        const rec = { idx, base, max: -1, nm };
        bufs.set(base, rec); allocList.push(rec);
      });
      // ТОЛЬКО ТРАКТЫ SAVE-UNDER, И ЭТО ДОКАЗАНО, А НЕ ПРЕДПОЛОЖЕНО.
      // Мера «любая запись в 256 байт от базы буфера» дала «максимальное смещение
      // 239» и выглядела воспроизведением дефекта с железа. Проверка развела PC:
      //   внутри ломтя (0..47):  LB500+12, i80_lddr_3+2, LB48E+1, i80_ldir_2+2
      //   за ломтём (48..255):   LDA44+2 (чистка), LB500+22, L9CBF (тайлы)
      // Пересечение этих множеств ПУСТО — значит за ломоть пишут не сохранение
      // фона, а рисование ПОЛЯ, которое просто попадает в моё окно. Классическая
      // мера шире явления (уроки 9, 19, 28), пойманная до публикации вывода.
      // Поэтому окно сужено до PC, которые пишут ВНУТРЬ ломтя.
      const o = m.memory.write.bind(m.memory);
      m.memory.write = (a, v, st) => { a &= 0xffff;
        if (!EMPTY) { const pc = m.cpu.pc & 0xffff;
          for (const [base, r] of bufs) {
            const d = (a - base) & 0xffff;
            if (d < 48) { savePc.add(pc); if (d > r.max) r.max = d; }
            else if (d < 256 && savePc.has(pc)) { r.max = d; overflow++;
              if (overShots.length < 6) overShots.push({ a, pc, level, seed }); }
          } }
        return o(a, v, st); }; } });
  let t = 0; g.m.onPc(S.LD9C0, () => { t++; inGame = true; });
  g.m.onPc(S.LD9C0, () => {                      // подсадка координат акулам
    if (t % 30 || !drawnAt) return;
    for (const nm of ["RecsAddrII", "RecsAddrIII", "RecsAddrIV"]) {
      const p = S[nm]; if (p == null) continue;
      const b = g.m.rd(p) | (g.m.rd(p + 1) << 8);
      for (let k = 0; k < 8; k++) { const r = b + k * 26;
        if ((g.m.rd(r + 19) | (g.m.rd(r + 20) << 8)) === S.LC102) {
          g.m.wr(r, drawnAt[0]); g.m.wr(r + 1, drawnAt[1]); } }
    }
  });
  g.m.onPc(S.i80_ldir_1, () => {
    const hl = g.m.cpu.hl() & 0xffff;
    let best = null;
    for (const c of CRE) if (c.a0 <= hl && (!best || c.a0 > best.a0)) best = c;
    if (best && hl - best.a0 < 256) { seenCre.add(best.name);
      if (best.name.indexOf("Shark") === 0) sharkReads++; }
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
console.log(`  чтений спрайтов акулы: ${sharkReads}, выдач буфера акуле: ${sharkAlloc}`);
console.log(`  выдачи по индексам: ` + ([...byIdx.entries()].sort((a, b) => a[0] - b[0])
  .map(([i, n]) => `${i}${i < 2 ? "(страница 256 Б)" : "(ломоть 48 Б)"}: ${n}`).join(", ") || "нет"));
// СЦЕНА ОБЯЗАНА ДОВЕСТИ ДО АКУЛЫ, и это проверяется числом: без нарисованной
// акулы гейт мерил бы мелких существ, которым 48 Б хватает, и зеленел впустую.
if (EMPTY || !ticks || !sharkReads || !sharkAlloc) {
  console.log(`  ПРОВАЛ  ПУСТАЯ ВЫБОРКА: тиков ${ticks}, чтений акулы ${sharkReads}, ` +
              `выдач акуле ${sharkAlloc}`);
  console.log("ГЕЙТ НЕДЕЙСТВИТЕЛЕН"); process.exit(2); }
const over = allocList.filter(r => r.idx >= 2 && r.max > 47);
console.log(`  выходов за ломоть трактами сохранения фона: ${overflow}`);
const worst = over.length ? Math.max(...over.map(r => r.max)) : -1;
for (const [i, n] of [...byIdx.entries()].sort((a, b) => a[0] - b[0])) {
  const rs = allocList.filter(r => r.idx === i);
  const mx = Math.max(...rs.map(r => r.max));
  const who = [...new Set(rs.map(r => r.nm))].join("/");
  console.log(`      индекс ${String(i).padStart(2)} ${i < 2 ? "(страница 256 Б)" : "(ломоть 48 Б) "}` +
              ` выдач ${String(n).padStart(3)}, максимальное смещение ${String(mx).padStart(3)}  ${who}`);
}
chk(over.length === 0, `ни один ломоть 48 Б не переполнен ` +
    `(переполнено буферов ${over.length}, худшее смещение ${worst})`);
console.log(fail ? `ГЕЙТ КРАСНЫЙ: ${fail} из ${checks}` : `ГЕЙТ ЗЕЛЁНЫЙ: все ${checks} проверки`);
process.exit(fail ? 1 : 0);
