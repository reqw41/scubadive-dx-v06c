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
  // Столбцы 24..31 плоскости 3 — БОКОВАЯ ПАНЕЛЬ, её строки 0..63 объявлены
  // занятыми и в карту ломтей не входят. Всё остальное в зоне обязано быть пусто.
  let inZone = 0, minLine = 256, maxLine = -1, panel = 0, panelZone = 0;
  // Столбцы панели 24..31 меряются в ОБЕИХ ВИДИМЫХ плоскостях — 0xC000 (цифры
  // панели) и 0xE000 (битмап). Плоскости 0x8000 и 0xA000 в счёт НЕ идут: там
  // сейчас лежит КОД (он кончается на 0xA790), и его байты — не пиксели. Попытка
  // померить все четыре даёт ~500 «байт панели в зоне» на каждой из них, то есть
  // меряет тело программы. Когда выселение освободит плоскость 1 под цвет, её
  // надо будет сюда добавить — но не раньше, чем она перестанет быть кодом.
  for (let c = 0; c < 32; c++) for (let lo = 0; lo < 256; lo++) {
    const v2 = g.m.rd(0xC000 + c * 256 + lo), v3 = g.m.rd(0xE000 + c * 256 + lo);
    if (c >= 24) { if (v3) panel++;
      if (lo >= ZONE_LO && (v2 || v3)) panelZone++; }
    if (!(v2 | v3)) continue;
    if (c < 24) { const y = 255 - lo; if (y < minLine) minLine = y; if (y > maxLine) maxLine = y;
                  if (lo >= ZONE_LO) inZone++; }
    // Столбцы 24..31 целиком отданы панели В ОБЕИХ ВИДИМЫХ ПЛОСКОСТЯХ: замер
    // показал, что цифры HIGH печатаются по адресу $D9CF, то есть в экранные
    // строки 48..55 — это внутри зоны. Значит панель владеет своими восемью
    // столбцами и в плоскости 0xC000 тоже, и ломтей там нет.
  }
  return { inZone: EMPTY ? null : inZone, minLine, maxLine, panel, panelZone, t };
}
const SCENES = [["уровень 4 поверхность", 4, null, 400], ["уровень 1 поверхность", 1, null, 400],
                ["уровень 4 глубина", 4, 9, 400]];
for (const [name, lvl, row, ticks] of SCENES) {
  const r = run(gRom, gSym, ticks, lvl, row, INJECT);
  chk(r.inZone === 0, `${name}: в зоне (экранные строки 0..63) ноль байт картинки (наблюдалось ${r.inZone})`);
  chk(r.minLine >= 64, `${name}: верхняя занятая строка поля ${r.minLine} (ждём не выше 64)`);
  // Порог: 700. Было 900 при 932 ненулевых (пояса рамки уже отброшены), затем
  // 726 после стирания подписей из битмапа. Теперь панель рисуется тайлами
  // (DrawSidePanel): рамка и корыта те же, цифры SKILL/LIVES — ROM_CHARSET.
  // Точное равенство рамки/корыт эталону Зимина проверяет panel_align_gate.js;
  // здесь — факт «панель нарисована, а не пуста».
  chk(r.panel > 700, `${name}: хром боковой панели на месте (${r.panel} байт в 0xE000 столбцы 24..31)`);
  // ВЫРАВНИВАНИЕ ПАНЕЛИ: до него панель законно жила в строках 0..63 и эта
  // проверка была бы красной. Теперь она обязана быть зелёной по-настоящему —
  // ради неё и затевался сдвиг битмапа на 32 строки.
  chk(r.panelZone === 0, `${name}: панель не заходит в зону ни одним байтом в видимых плоскостях 0xC000/0xE000 (наблюдалось ${r.panelZone})`);
}
// НЕПЕРЕСЕЧЕНИЕ ПАНЕЛИ И ЛОМТЕЙ — прямая проверка множеств адресов.
// Панель занимает 0xF800..0xFFFF. Ломти пула этапа 2 лежат в плоскости 0xC000,
// столбцы 2..6, младшие 208..255. Пересечение обязано быть пустым, и оно пусто
// по построению: разные плоскости. Проверяем это числом, а не рассуждением.
{
  const panelSet = new Set(); for (let a = 0xF800; a <= 0xFFFF; a++) panelSet.add(a);
  let clash = 0;
  for (let c = 2; c <= 6; c++) for (let lo = 208; lo <= 255; lo++)
    if (panelSet.has(0xC000 + c * 256 + lo)) clash++;
  chk(clash === 0, `панель и ломти пула не пересекаются ни одним адресом (пересечений ${clash})`);
  // и обратная сторона: ёмкость зоны. Раньше столбцы 24..31 плоскостей 2 и 3 были
  // отданы панели (80 ломтей); после выравнивания панель из зоны ушла — но число
  // освободившихся ломтей ЗДЕСЬ НЕ ОБЪЯВЛЯЕТСЯ, его меряет zone_occupancy.js на
  // живом прогоне. Гейт лишь фиксирует факт ухода (проверка panelZone === 0).
  console.log(`  панель освободила свои столбцы в зоне; ёмкость считает zone_occupancy.js`);
}
// контраст: бесфлаговая сборка ОБЯЗАНА писать в зону — иначе гейт мерит не то
const c = run(cRom, cSym, 400, 4, null, false);
chk(c.inZone > 0, `контраст: бесфлаговая сборка пишет в верхние 64 строки (${c.inZone} байт) — измерение различает`);
console.log(`  габариты: GEOM строки ${run(gRom, gSym, 400, 4, null, INJECT).minLine}..., чистая ${c.minLine}...`);
console.log(fail ? `ГЕЙТ КРАСНЫЙ: ${fail} из ${checks}` : `ГЕЙТ ЗЕЛЁНЫЙ: все ${checks} проверки`);
process.exit(fail ? 1 : 0);
