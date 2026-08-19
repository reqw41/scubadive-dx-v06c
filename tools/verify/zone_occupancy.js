// КАРТА ЗАНЯТОСТИ ЗОНЫ: кто пишет в верхние 64 строки экрана и в какие столбцы.
//
// Зона (младшие байты 192..255 каждого столбца) свободна не вся: в ней законно
// живут ПЕЧАТНИКИ. GetScrAddr при знакоместных строках 0..7 даёт ровно эти
// младшие байты, поэтому любая печать в верхних восьми знакоместных строках
// попадает в зону. Меню печатает там заголовок и подсказки, а в геймплее —
// числа HUD, поэтому спектр сцен обязателен: вход в игру карту не покрывает.
//
// ВНИМАНИЕ, МЕРА ЭТОГО ИНСТРУМЕНТА НЕВЕРНА, и это выяснилось первым же прогоном.
// Он считает ЛЮБУЮ запись в зону — и получает «занято 32 столбца из 32 во всех
// трёх плоскостях», то есть свободного места нет вовсе. Ответ бесполезен, потому
// что в список попадают:
//   LDA44 (ClearScreen) — чистит зону НУЛЯМИ, ничего в ней не занимая;
//   dzx0 — распаковка образа при буте, до всякой игры;
//   LB466/LB500 — спрайтовый блит, стирающий за собой.
// Занятость зоны определяется не фактом записи, а тем, ПЕРЕЖИВАЕТ ли записанное:
// байт, немедленно затёртый нулём, ломтю не мешает. Правильная мера — «в момент
// X содержимое ненулевое» либо «запись, не отменённая до следующего чтения».
//
// Инструмент оставлен как есть НАРОЧНО: он документирует ошибку меры, которая
// сегодня уже дважды создавала фантомные дефекты. Переделывать его надо вместе
// с решением, что именно считать занятостью.
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

const touched = new Set();     // "плоскость:столбец"
const who = new Map();
const SCENES = [["уровень 4 поверхность", 4, null, 900], ["уровень 1 поверхность", 1, null, 900],
                ["уровень 4 глубина", 4, 9, 900], ["уровень 1 долгий", 1, null, 2500],
                ["уровень 2", 2, null, 700], ["уровень 3", 3, null, 700]];
for (const [name, lvl, row, ticks] of SCENES) {
  let started = false, n0 = touched.size;
  const g = reachGame(rom, sym, { cpu: "i8080", level: lvl, seed: 0x0167,
    preHook: m => { const o = m.memory.write.bind(m.memory);
      m.memory.write = (a, v, st) => { a &= 0xffff;
        if (a >= 0x8000 && (a & 0xff) >= 192) {
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
