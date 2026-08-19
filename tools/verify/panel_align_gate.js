// ГЕЙТ ВЫРАВНИВАНИЯ БОКОВОЙ ПАНЕЛИ (сборка -DGEOM).
//
// ЧТО ЛЕЧИЛОСЬ. Панель Зимина распаковывается в VRAM ПРЯМЫМ адресом ($F800), без
// пересчёта строк, поэтому её положение на экране задано самим битмапом. А поле
// рисуется через GetScrAddr, и вот она у Зимина и у нас РАЗНАЯ:
//
//   Зимин  (первый коммит src_ref/scubacodb.asm, `sub 4*8+1`):  y = 32 + 8*row
//   наш GEOM (src8080/scubacodb.asm, `cpl` + `sub 64`):         y = 64 + 8*row
//
// То есть наше поле стоит на 32 строки ниже зиминского, а битмап панели остался
// на месте — это владелец и увидел на железе как «HUD по центру, игра ниже».
// Лечение: битмап механически сдвинут вниз на те же 32 строки.
//
// ЧТО ПРОВЕРЯЕТСЯ. Не «панель на такой-то строке» (это было бы повторением той же
// догадки другими словами), а СОХРАНЕНИЕ ОТНОСИТЕЛЬНОГО ПОЛОЖЕНИЯ, попиксельно:
// пиксель панели, соседствовавший у Зимина со строкой поля r, обязан соседствовать
// с ней же и у нас. Формально — для каждого столбца панели и каждой строки:
//
//   VRAM[y] == old_bitmap[y - D],  где D = (наш сдвиг поля) - (сдвиг поля Зимина)
//
// Обе величины сдвига НЕ зашиты числом: наш сдвиг снимается прогоном настоящей
// GetScrAddrF в эмуляторе, зиминский — единственная константа гейта, и она взята
// не из комментария, а из его кода (см. выше), почему и вынесена с обоснованием.
//
// Негативные контроли (каждый ОБЯЗАН красить гейт):
//   PANEL_INJECT=1  — вернуть в VRAM СТАРЫЙ, невыровненный битмап: ровно тот
//                     дефект, что видел владелец. Проверки 1 и 2 обязаны упасть.
//   PANEL_SHIFT=n   — сверять с эталоном, сдвинутым на неверные n строк.
//   PANEL_EMPTY=1   — обнулить выборку: гейт обязан упасть, а не «пройти на нуле».
"use strict";
const fs = require("fs"), path = require("path");
const { reachGame } = require("./drive.js");
const ROOT = path.resolve(__dirname, "../..");
const B = process.env.BUILD_DIR || "build";
const INJECT = process.env.PANEL_INJECT === "1", EMPTY = process.env.PANEL_EMPTY === "1";
const SHIFT = process.env.PANEL_SHIFT ? parseInt(process.env.PANEL_SHIFT, 10) : null;

// Сдвиг поля у Зимина. Источник — ПЕРВАЯ версия src_ref/scubacodb.asm (коммит
// cdb53d2, до всех наших правок геометрии): GetScrAddr делает cpl/inc a/sub 4*8+1,
// то есть lo = 223 - 8*row, экранная строка y = 255 - lo = 32 + 8*row.
const ZIMIN_ROW0 = 32;

const gRom = `${ROOT}/${B}/geomonly/scuba.rom`, gSym = `${ROOT}/${B}/geomonly/scubacod1.sym`;
// Эталонный битмап панели — распакованный ОРИГИНАЛ Зимина (src_ref/scubapanl.asm,
// побайтно тот же файл, что и в src/). Распаковывается тем же salvador -classic.
const OLD_BMP = `${ROOT}/${B}/geomonly/panl_ref.bin`;
for (const f of [gRom, gSym, OLD_BMP]) if (!fs.existsSync(f)) {
  console.log(`нет файла ${f} — собери DET=1 SRC=src8080 GEOM=1 OUT=${B}/geomonly ` +
              `и распакуй эталон: OUT=${B}/geomonly tools/verify/mkpanlref.sh`);
  process.exit(2); }

let fail = 0, checks = 0;
const chk = (ok, msg) => { checks++; if (ok) console.log("  ok      " + msg);
                           else { fail++; console.log("  ПРОВАЛ  " + msg); } };

const old = fs.readFileSync(OLD_BMP);
if (old.length !== 2048) { console.log(`эталон панели не 2048 Б, а ${old.length}`); process.exit(2); }

// ---- 1. НАШ сдвиг поля снимается ПРОГОНОМ, а не чтением исходника -----------
// Зовём настоящую GetScrAddrF для row 0 и смотрим, на какую экранную строку она
// показывает. Так гейт останется честным, если формулу когда-нибудь тронут.
function measureFieldRow0(g) {
  const { m, S } = g, cpu = m.cpu;
  const PAD = 0xbe00, SENT = 0x0002, R = { h: 4, l: 5 };
  m.wr(PAD, 0xcd); m.wr(PAD + 1, S.GetScrAddrF & 0xff); m.wr(PAD + 2, S.GetScrAddrF >> 8);
  m.wr(PAD + 3, 0xc3); m.wr(PAD + 4, SENT & 0xff); m.wr(PAD + 5, SENT >> 8);
  cpu.regs[R.h] = 0; cpu.regs[R.l] = 0;        // row 0, column 0
  cpu.sp = 0x00f0; cpu.pc = PAD;
  let q = 0; while ((cpu.pc & 0xffff) !== SENT && q < 300000) { cpu.instruction(); q++; }
  if (q >= 300000) { console.log("GetScrAddrF не вернулась"); process.exit(2); }
  return 255 - cpu.regs[R.l];                  // экранная строка строки поля 0
}

function snap(lvl, row, ticks) {
  const g = reachGame(gRom, gSym, { cpu: "i8080", level: lvl, seed: 0x0167 });
  let t = 0; g.m.onPc(g.S.LD9C0, () => { t++; if (row !== null) g.m.wr(g.S.L5B03 + 1, row); });
  let guard = 0; while (t < ticks && guard < 900000) { g.m.step(); guard++; }
  if (INJECT)                            // подсадить старый битмап обратно в VRAM
    for (let i = 0; i < 2048; i++) g.m.wr(0xF800 + i, old[i]);
  const vram = new Uint8Array(4 * 8 * 256);   // 4 плоскости x столбцы 24..31
  const bases = [0x8000, 0xA000, 0xC000, 0xE000];
  for (let p = 0; p < 4; p++) for (let c = 0; c < 8; c++) for (let lo = 0; lo < 256; lo++)
    vram[p * 2048 + c * 256 + lo] = EMPTY ? 0 : g.m.rd(bases[p] + (24 + c) * 256 + lo);
  return { vram, field0: measureFieldRow0(g) };
}

const SCENES = [["уровень 4 поверхность", 4, null, 400],
                ["уровень 1 поверхность", 1, null, 400],
                ["уровень 4 глубина", 4, 9, 400]];
let D = null;
for (const [name, lvl, row, ticks] of SCENES) {
  const s = snap(lvl, row, ticks);
  if (D === null) {
    D = s.field0 - ZIMIN_ROW0;
    console.log(`  сдвиг поля: наш ${s.field0} (замер прогоном GetScrAddrF), ` +
                `Зимина ${ZIMIN_ROW0} (его код) => панель обязана уехать на D=${D}`);
  }
  chk(s.field0 === 64, `${name}: наше поле начинается со строки ${s.field0} (ждём 64)`);
  const d = SHIFT === null ? D : SHIFT;

  // --- проверка 1: попиксельное совпадение со сдвинутым эталоном --------------
  // Сверяется СОХРАНЁННАЯ часть — экранные строки 64..255. Выше 64 лежит зона
  // данных, и туда панель пускать нельзя: два крайних пояса рамки Зимина (его
  // строки 0..31 и 224..255) отброшены сознательно, это и есть цена выравнивания.
  let cmp = 0, bad = 0, badLine = -1;
  for (let c = 0; c < 8; c++) for (let y = 64; y < 256; y++) {
    const ys = y - d;                                   // строка эталона
    const want = (ys < 0 || ys > 255) ? 0 : old[c * 256 + (255 - ys)];
    const got = s.vram[3 * 2048 + c * 256 + (255 - y)]; // плоскость битмапа 0xE000
    cmp++;
    if (want !== got && bad++ === 0) badLine = y;
  }
  chk(cmp > 0 && bad === 0,
      `${name}: панель попиксельно = эталон Зимина, сдвинутый на ${d} строк ` +
      `(сверено ${cmp} точек в строках 64..255, расхождений ${bad}` +
      `${bad ? `, первое на строке ${badLine}` : ""})`);

  // --- проверка 1б: отброшено РОВНО два пояса и ничего сверх них --------------
  // Иначе «сдвиг» мог бы незаметно потерять кусок рисунка: проверяем, что всё
  // потерянное содержимое эталона лежит строго в его строках 0..31 и 224..255.
  let lostIn = 0, lostOut = 0;
  for (let c = 0; c < 8; c++) for (let ys = 0; ys < 256; ys++) {
    if (!old[c * 256 + (255 - ys)]) continue;
    const y = ys + d;                                   // куда бы он уехал
    if (y >= 64 && y <= 255) continue;                  // не потерян
    if (ys <= 31 || ys >= 224) lostIn++; else lostOut++;
  }
  chk(lostOut === 0,
      `${name}: потери эталона только в двух поясах рамки (${lostIn} байт), ` +
      `вне поясов не потеряно ничего (${lostOut})`);

  // --- проверка 2: панель не заходит в зону данных (строки 0..63) -------------
  // Считаются ВИДИМЫЕ плоскости 0xC000 и 0xE000. Плоскости 0x8000/0xA000 —
  // это КОД (кончается на 0xA790), его байты не пиксели; включив их, гейт мерил
  // бы тело программы и краснел на ~500 «байт панели» в каждой. После выселения,
  // когда плоскость 1 станет цветом, её место здесь.
  let inZone = 0;
  for (const p of [2, 3]) for (let c = 0; c < 8; c++) for (let lo = 192; lo < 256; lo++)
    if (s.vram[p * 2048 + c * 256 + lo]) inZone++;
  chk(cmp > 0 && inZone === 0,
      `${name}: в строках 0..63 ноль байт панели в видимых плоскостях (наблюдалось ${inZone})`);
}
// выборка обязана быть непустой — иначе «зелено на нуле»
chk(!EMPTY && D !== null, `выборка непуста: сцен ${SCENES.length}, сдвиг измерен`);
console.log(fail ? `ГЕЙТ КРАСНЫЙ: ${fail} из ${checks}` : `ГЕЙТ ЗЕЛЁНЫЙ: все ${checks} проверки`);
process.exit(fail ? 1 : 0);
