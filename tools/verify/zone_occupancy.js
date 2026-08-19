// КАРТА ЗАНЯТОСТИ ЗОНЫ: кто пишет в верхние 64 строки экрана и в какие столбцы.
//
// Зона (младшие байты 192..255 каждого столбца) свободна не вся: в ней законно
// живут ПЕЧАТНИКИ. GetScrAddr при знакоместных строках 0..7 даёт ровно эти
// младшие байты, поэтому любая печать в верхних восьми знакоместных строках
// попадает в зону. Меню печатает там заголовок и подсказки, а в геймплее —
// числа HUD, поэтому спектр сцен обязателен: вход в игру карту не покрывает.
//
// ОПРЕДЕЛЕНИЕ ЗАНЯТОСТИ (решение по конструкции, 2026-08-19):
//   ломоть годен  <=>  в него НЕТ ни одной чужой записи ПОСЛЕ раскладки,
//   на всём спектре сцен. Записи самой раскладки не в счёт.
//
// Отсюда три следствия, каждое меняет счёт:
//  (а) всё, что пишет ДО раскладки, зону НЕ занимает: бут, меню, чистка экрана
//      на постановке уровня. Раскладка стоит в начале Game и лечит любые следы.
//      Это делает законным цикл «меню портит -> вход в игру чинит»;
//  (б) «транзитные» писатели ПОСЛЕ раскладки занимают, даже если стирают за
//      собой: между записью и стиранием наши байты уже мертвы, а стирание кладёт
//      нули, а не их. Категории «пишет, но не занимает» после раскладки нет;
//  (в) спектр обязан включать переходы уровней, гибели, game over и возврат в
//      меню с повторным входом.
//
// Первая версия инструмента считала ЛЮБУЮ запись и объявила занятыми 32 столбца
// из 32 во всех трёх плоскостях — ответ был бесполезен ровно потому, что мера не
// различала «записал» и «занял».
//
//   node tools/verify/zone_occupancy.js
"use strict";
const path = require("path");
const { readSym } = require("./harness.js");
const { reachGame } = require("./drive.js");
const ROOT = path.resolve(__dirname, "../..");
const B = process.env.BUILD_DIR || "build";
const rom = `${ROOT}/${B}/gz/scuba.rom`, sym = `${ROOT}/${B}/gz/scubacod1.sym`;
const S = readSym(sym);
const labs = Object.entries(S).filter(([k, v]) => v < 0xC000).sort((a, b) => a[1] - b[1]);
const proc = a => { let lo = 0, hi = labs.length - 1, x = null;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (labs[m][1] <= a) { x = labs[m]; lo = m + 1; } else hi = m - 1; }
  return x ? x[0] : "?"; };

const touched = new Set();     // "плоскость:столбец", занятые ПОСЛЕ раскладки
const who = new Map();
// Момент раскладки: в сборке без выселения её нет, но точка та же — вход в Game.
// Всё, что пишет раньше, лечится раскладкой и занятости не создаёт.
const SCENES = [["уровень 4 поверхность", 4, null, 900], ["уровень 1 поверхность", 1, null, 900],
                ["уровень 4 глубина", 4, 9, 900], ["уровень 1 долгий", 1, null, 2500],
                ["уровень 2", 2, null, 700], ["уровень 3", 3, null, 700]];
for (const [name, lvl, row, ticks] of SCENES) {
  let started = false, n0 = touched.size;
  let afterCopy = false;
  const g = reachGame(rom, sym, { cpu: "i8080", level: lvl, seed: 0x0167,
    preHook: (m, SS) => { m.onPc(SS.Game, () => { afterCopy = true; });
      const o = m.memory.write.bind(m.memory);
      m.memory.write = (a, v, st) => { a &= 0xffff;
        if (afterCopy && a >= 0x8000 && (a & 0xff) >= 192) {
          const pl = a & 0xE000, col = (a >> 8) & 0x1f;
          touched.add(`${pl.toString(16)}:${col}`);
          const k = proc(m.cpu.pc & 0xffff); who.set(k, (who.get(k) || 0) + 1);
        }
        return o(a, v, st); }; } });
  let t = 0; g.m.onPc(S.LD9C0, () => { t++; started = true; if (row !== null) g.m.wr(S.L5B03 + 1, row); });
  let guard = 0; while (t < ticks && guard < 400000) { g.m.step(); guard++; }
  console.log(`  ${name}: ${t} тиков, новых занятых (плоскость,столбец): ${touched.size - n0}`);
}
console.log(`\nЗАНЯТО В ЗОНЕ: ${touched.size} пар (плоскость, столбец)`);
for (const pl of ["a000", "c000", "e000"]) {
  const cols = [...touched].filter(x => x.startsWith(pl + ":")).map(x => +x.split(":")[1]).sort((a, b) => a - b);
  console.log(`  плоскость 0x${pl}: ${cols.length} столбцов` + (cols.length ? `: ${cols.join(",")}` : ""));
}
console.log("\nКТО ПИШЕТ:");
for (const [k, n] of [...who.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`  ${k}: ${n} байт`);
