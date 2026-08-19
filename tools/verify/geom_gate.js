// ГЕЙТ ГЕОМЕТРИИ ЗОНЫ (-DGEOM): поле уехало вниз на 64 строки и влево на 4
// столбца, а верхние 64 строки экрана освободились ПОЛНОСТЬЮ.
//
// Проверяется ровно то свойство, ради которого всё затевалось: поле не пишет в
// зону НИ ОДНОГО байта. Без него выселение кода в зону невозможно — игра затрёт
// код первой же перерисовкой.
//
//   GEOM_INJECT=1 — убрать сдвиг строки (sub 64 -> два nop): поле возвращается
//                   наверх и лезет в зону. Гейт обязан покраснеть.
//   GEOM_EMPTY=1  — обнулить выборку. Гейт обязан покраснеть.
"use strict";
const fs = require("fs"), path = require("path");
const { readSym } = require("./harness.js");
const { reachGame } = require("./drive.js");
const ROOT = path.resolve(__dirname, "../..");
const B = process.env.BUILD_DIR || "build";
const INJECT = process.env.GEOM_INJECT === "1", EMPTY = process.env.GEOM_EMPTY === "1";
const gRom = `${ROOT}/${B}/geomonly/scuba.rom`, gSym = `${ROOT}/${B}/geomonly/scubacod1.sym`;
const cRom = `${ROOT}/${B}/src8080/scuba.rom`, cSym = `${ROOT}/${B}/src8080/scubacod1.sym`;
for (const f of [gRom, gSym, cRom, cSym]) if (!fs.existsSync(f)) {
  console.log(`нет файла ${f} — собери DET=1 GEOM=1 OUT=${B}/geomonly и DET=1 OUT=${B}/src8080`);
  process.exit(2); }
let fail = 0, checks = 0;
const chk = (ok, msg) => { checks++; if (ok) console.log("  ok      " + msg);
                           else { fail++; console.log("  ПРОВАЛ  " + msg); } };
// зона = экранные строки 0..63 = младшие байты 192..255
const ZONE_LO = 192;

function run(rom, sym, ticks, lvl, row, inject) {
  const g = reachGame(rom, sym, { cpu: "i8080", level: lvl, seed: 0x0167,
    preHook: (m, S) => { if (inject) m.onPc(S.START_GAME, () => {
      // sub 64 (D6 40) в GetScrAddrF -> два nop
      for (let a = S.GetScrAddrF; a < S.GetScrAddrF + 24; a++)
        if (m.rd(a) === 0xD6 && m.rd(a + 1) === 64) { m.wr(a, 0); m.wr(a + 1, 0); break; } }); } });
  let t = 0; g.m.onPc(g.S.LD9C0, () => { t++; if (row !== null) g.m.wr(g.S.L5B03 + 1, row); });
  let guard = 0; while (t < ticks && guard < 300000) { g.m.step(); guard++; }
  let inZone = 0, minLine = 256, maxLine = -1;
  for (let c = 0; c < 32; c++) for (let lo = 0; lo < 256; lo++) {
    const v2 = g.m.rd(0xC000 + c * 256 + lo), v3 = g.m.rd(0xE000 + c * 256 + lo);
    if (!(v2 | v3)) continue;
    const y = 255 - lo; if (y < minLine) minLine = y; if (y > maxLine) maxLine = y;
    if (lo >= ZONE_LO) inZone++;
  }
  return { inZone: EMPTY ? null : inZone, minLine, maxLine, t };
}
const SCENES = [["уровень 4 поверхность", 4, null, 400], ["уровень 1 поверхность", 1, null, 400],
                ["уровень 4 глубина", 4, 9, 400]];
for (const [name, lvl, row, ticks] of SCENES) {
  const r = run(gRom, gSym, ticks, lvl, row, INJECT);
  chk(r.inZone === 0, `${name}: в зоне (экранные строки 0..63) ноль байт картинки (наблюдалось ${r.inZone})`);
  chk(r.minLine >= 64, `${name}: верхняя занятая строка ${r.minLine} (ждём не выше 64)`);
}
// контраст: бесфлаговая сборка ОБЯЗАНА писать в зону — иначе гейт мерит не то
const c = run(cRom, cSym, 400, 4, null, false);
chk(c.inZone > 0, `контраст: бесфлаговая сборка пишет в верхние 64 строки (${c.inZone} байт) — измерение различает`);
console.log(`  габариты: GEOM строки ${run(gRom, gSym, 400, 4, null, INJECT).minLine}..., чистая ${c.minLine}...`);
console.log(fail ? `ГЕЙТ КРАСНЫЙ: ${fail} из ${checks}` : `ГЕЙТ ЗЕЛЁНЫЙ: все ${checks} проверки`);
process.exit(fail ? 1 : 0);
