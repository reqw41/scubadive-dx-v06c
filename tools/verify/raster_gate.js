// ГЕЙТ РАСТРОВОГО ФОНА (диагностический образ -DRASTER).
//
// ЧЕСТНАЯ ШАПКА, читать ДО того, как поверить зелёному.
// Стенд точно моделирует ТАКТЫ процессора и положение луча, поэтому «в какой
// растровой строке и в какой точке строки произошла запись слота и дышит ли она
// от кадра к кадру» он проверить может — это и есть предмет гейта.
// А вот САМУ ЗАЩЁЛКУ палитры (слот выбирается цветом, который луч показывает в
// момент out 0x0C) стенд моделирует ИНАЧЕ, чем RTL MiSTer, и мягче живой
// микросхемы. Поэтому:
//     зелёный гейт означает «записи стоят в нужных строках, внутри окна каймы,
//     адресованы слоту 0 и не дышат»,
//     и НЕ означает «на экране появились три полосы».
// ЭКРАН ПОДТВЕРЖДАЕТ ТОЛЬКО ЖЕЛЕЗО. На этом месте проект уже обжигался дважды:
// порты AY (стенд 0x14, MiSTer 0x15) и эксперимент с полосной палитрой — гейт
// зелёный с нулевым дрожанием, на MiSTer видно 4 полосы из 6.
// Разбор: docs/experiment_B_bands_palette.md, docs/vi53_line_timer.md.
//
// Негативные контроли:
//   RASTER_INJECT=1 — сдвинуть цель довводки (RZ_Q += 40, то есть залп на 80
//                     тактов раньше). Гейт обязан покраснеть: залп уезжает из
//                     окна каймы в поле и защёлкивается в чужие слоты.
//   RASTER_EMPTY=1  — обнулить выборку. Гейт обязан покраснеть.
//
//   node tools/verify/raster_gate.js
"use strict";
const fs = require("fs"), path = require("path");
const { readSym } = require("./harness.js");
const { reachGame } = require("./drive.js");
const ROOT = path.resolve(__dirname, "../..");
const B = process.env.BUILD_DIR || "build";
const INJECT = process.env.RASTER_INJECT === "1";
const EMPTY = process.env.RASTER_EMPTY === "1";

const rRom = `${ROOT}/${B}/raster/scuba.rom`, rSym = `${ROOT}/${B}/raster/scubacod1.sym`;
const cRom = `${ROOT}/${B}/src8080/scuba.rom`, cSym = `${ROOT}/${B}/src8080/scubacod1.sym`;
for (const f of [rRom, rSym, cRom, cSym]) if (!fs.existsSync(f)) {
  console.log(`нет файла ${f} — собери DET=1 RASTER=1 OUT=${B}/raster и DET=1 OUT=${B}/src8080`);
  process.exit(2);
}

let fail = 0, checks = 0;
const chk = (ok, msg) => { checks++; if (ok) console.log("  ok      " + msg);
                           else { fail++; console.log("  ПРОВАЛ  " + msg); } };

// --- ГЕОМЕТРИЯ КАДРА (rtl/video.sv и модель стенда совпадают) --------------
// 312 строк по 768 точек, картинка — строки 40..295, то есть строка картинки Y
// это растровая строка 40+Y. Кайма по горизонтали — точки 664..767 текущей
// строки и 0..151 следующей: 256 точек = 64 такта процессора, СПЛОШНЫМ куском
// через границу строки. Слот палитры защёлкивается по цвету под лучом, значит
// граница строки Y пишется в этом окне, в хвосте строки Y-1.
const LINE = 768, PIC0 = 40, VLINES = 312;
const winLo = -(LINE - 664), winHi = 151;   // окно каймы в координатах строки Y
const inWindow = (line, px, targetY) => {
  const d = (line - (PIC0 + targetY)) * LINE + px;
  return d >= winLo && d <= winHi;
};

// --- 1. РАЗВЯЗКА ФЛАГА -----------------------------------------------------
// Требование: без -DRASTER штатный образ не меняется ни байтом. Проверяем это
// не сравнением md5 с замороженным числом (оно устареет на первой же законной
// правке), а тем, что растрового кода в бесфлаговой сборке НЕТ ВОВСЕ — так же,
// как развязан ZXSOUND.
// Проверяем ВЫПУЩЕННЫЕ БАЙТЫ, а не текст листинга: sjasmplus печатает в .lst и
// пропущенные по IFDEF строки, поэтому поиск имени файла в листинге зеленел бы
// на пустом месте (первая версия гейта именно на этом и покраснела).
const has = (buf, sig) => buf.indexOf(Buffer.from(sig)) >= 0;
const CALL_ARM = [0xCC, 0x00, 0xBD];   // call z,0BD00h  — взвод счётчика
const CALL_ISR = [0xC4, 0x03, 0xBD];   // call nz,0BD03h — залп неба
const c0 = fs.readFileSync(`${ROOT}/${B}/src8080/scubacod0.bin`);
const r0 = fs.readFileSync(`${ROOT}/${B}/raster/scubacod0.bin`);
chk(!has(c0, CALL_ARM) && !has(c0, CALL_ISR),
    "бесфлаговый блок кода0: вызовов растровых трамплинов в БАЙТАХ нет");
chk(has(r0, CALL_ARM) && has(r0, CALL_ISR),
    "флаговый блок кода0: вызовы трамплинов на месте (иначе гейт мерил бы не то)");
// Блок кода1 без флага обязан кончаться РОВНО на конце игрового кода: ни одного
// байта модуля и ни одного байта дыры до его ORG.
const cS = readSym(cSym), rS = readSym(rSym);
const c1len = fs.statSync(`${ROOT}/${B}/src8080/scubacod1.bin`).size;
const r1len = fs.statSync(`${ROOT}/${B}/raster/scubacod1.bin`).size;
chk(c1len === cS.SCUBACOD1_END - cS.SCUBACOD0_END,
    `бесфлаговый блок кода1 кончается на SCUBACOD1_END: ${c1len} байт против ${cS.SCUBACOD1_END - cS.SCUBACOD0_END}`);
chk(r1len > rS.SCUBACOD1_END - rS.SCUBACOD0_END,
    `флаговый блок кода1 длиннее на модуль: ${r1len} против ${rS.SCUBACOD1_END - rS.SCUBACOD0_END}`);

// --- 2. БЕСФЛАГОВЫЙ ОБРАЗ МОЛЧИТ В ЭФИРЕ -----------------------------------
// Статики мало: важно, что в геймплее штатный образ не трогает ни палитру, ни
// канал 1 ВИ53. Это ловит случайную утечку кода мимо IFDEF.
{
  const g = reachGame(cRom, cSym, { cpu: "i8080", level: 4, seed: 0x0167 });
  let pal = 0, ch1 = 0;
  const io = g.m.io, orig = io.output.bind(io);
  io.output = (p, v) => { p &= 0xff; if (p === 0x0c) pal++; if (p === 0x0a) ch1++; return orig(p, v); };
  for (let i = 0; i < 120; i++) g.m.step();
  chk(pal === 0, `бесфлаговый образ: записей в палитру за 120 кадров геймплея ${pal} (ждём 0)`);
  chk(ch1 === 0, `бесфлаговый образ: записей в канал 1 ВИ53 за 120 кадров ${ch1} (ждём 0)`);
}

// --- 3. ЗАМЕР ФЛАГОВОГО ОБРАЗА ---------------------------------------------
const S = readSym(rSym);
for (const n of ["rz_sub", "rz_water", "rz_hud", "rz_shot", "LD9C0"])
  if (S[n] == null) { console.log("нет метки " + n + " — сверять нечего"); process.exit(2); }
const RZ_LO = 0xBD00, RZ_HI = 0xBE00;          // страница растрового модуля

function measure(level, frames) {
  const g = reachGame(rRom, rSym, { cpu: "i8080", level, seed: 0x0167 });
  const m = g.m, io = m.io;
  // ПОДСАДКА: правим операнд `sub RZ_Q` уже в памяти — образ сжат ZX0, в файле
  // этот байт не адресуем.
  if (INJECT) m.wr(S.rz_sub + 1, (m.rd(S.rz_sub + 1) + 40) & 0xff);
  const rec = [];
  const orig = io.commit_palette.bind(io);
  io.commit_palette = (index) => {
    const had = io.palettebyte !== undefined || io.outport === 0x0c;
    const v = io.palettebyte !== undefined ? io.palettebyte : io.outbyte;
    const f = m.v06c.filler;
    if (had && !EMPTY) rec.push({ fr: m.frame, line: f.raster_line, px: f.raster_pixel, slot: index, val: v });
    return orig(index);
  };
  // цена: такты, проведённые внутри страницы растрового модуля
  let rzCyc = 0, ticks = 0;
  const origCb = m.v06c.check_breakpoint;
  let prevIn = false;
  m.v06c.check_breakpoint = () => { if (prevIn) rzCyc += m.cpu.vcycles || 0;
                                    const pc = m.cpu.pc & 0xffff; prevIn = pc >= RZ_LO && pc < RZ_HI;
                                    return origCb(); };
  m.onPc(S.LD9C0, () => { ticks++; });
  const f0 = m.frame;
  for (let i = 0; i < frames; i++) m.step();
  const nf = m.frame - f0;
  // залп = подряд идущие записи одного значения
  const shots = [];
  for (const r of rec) {
    const last = shots[shots.length - 1];
    if (last && last.fr === r.fr && last.val === r.val && (r.line - last.line) * LINE + r.px - last.px < 400)
      { last.n++; for (const s of r.slots || [r.slot]) last.slots.add(s); }
    else shots.push({ fr: r.fr, line: r.line, px: r.px, val: r.val, n: 1, slots: new Set([r.slot]) });
  }
  return { shots, frames: nf, rzCyc, ticks, rec };
}

const LVL = 4, NF = 300;
const R = measure(LVL, NF);
const KIND = [["небо", 0xf8, null], ["вода", 0xc0, 64], ["HUD", 0x00, 192]];

console.log(`  замер: уровень ${LVL}, ${R.frames} кадров, залпов ${R.shots.length}`);
for (const [name, val, targetY] of KIND) {
  const s = R.shots.filter(x => x.val === val);
  if (!s.length) { chk(false, `${name}: залпов нет вовсе`); continue; }
  const pos = s.map(x => x.line * LINE + x.px);
  const mn = Math.min(...pos), mx = Math.max(...pos);
  const slots = new Set(); for (const x of s) for (const y of x.slots) slots.add(y);
  const sizes = new Set(s.map(x => x.n));
  console.log(`    ${name}: ${s.length} залпов, по ${[...sizes].join("/")} записей, ` +
              `строка ${Math.floor(mn / LINE)}.${mn % LINE} .. ${Math.floor(mx / LINE)}.${mx % LINE}, слоты ${[...slots].join(",")}`);
  chk(slots.size === 1 && slots.has(0), `${name}: ВСЕ записи защёлкнулись в слот 0 (наблюдалось: ${[...slots].join(",")})`);
  if (targetY === null) {
    // небо пишется в вертикальном гашении: там кайма показывает слот 0 всю строку
    const bad = s.filter(x => !(x.line < PIC0 || x.line >= PIC0 + 256));
    chk(bad.length === 0, `${name}: все залпы в вертикальном гашении (вне картинки), нарушений ${bad.length}`);
    chk(s.length === R.frames, `${name}: залп в КАЖДОМ кадре (${s.length} из ${R.frames})`);
  } else {
    const badLine = s.filter(x => Math.abs(x.line - (PIC0 + targetY)) > 2);
    chk(badLine.length === 0, `${name}: строка залпа в окне ±2 от ${PIC0 + targetY} (нарушений ${badLine.length})`);
    // строгая проверка: КАЖДАЯ запись залпа обязана лежать в окне каймы перед целью
    let out = 0;
    for (const r of R.rec) if (r.val === val && !inWindow(r.line, r.px, targetY)) out++;
    chk(out === 0, `${name}: все записи внутри окна каймы перед строкой ${targetY} (вне окна ${out})`);
    chk(mx - mn === 0, `${name}: джиттер по кадрам ${mx - mn} точек (ждём 0)`);
  }
}
// три залпа за кадр — либо все три, либо только небо (длинная перерисовка съела кадр)
const per = new Map();
for (const s of R.shots) per.set(s.fr, (per.get(s.fr) || 0) + 1);
const hist = {};
for (const [, c] of per) hist[c] = (hist[c] || 0) + 1;
const full = hist[3] || 0;
console.log(`    залпов в кадре: ${JSON.stringify(hist)}`);
chk((hist[2] || 0) === 0, `нет кадров с половиной набора (кадров с 2 залпами: ${hist[2] || 0})`);
chk(full / R.frames >= 0.70, `полный набор из трёх залпов в ${(100 * full / R.frames).toFixed(1)}% кадров (порог 70%)`);

// --- 4. ЦЕНА ---------------------------------------------------------------
console.log(`    цена: ${Math.round(R.rzCyc / R.frames)} тактов/кадр в растровом модуле ` +
            `(${(100 * R.rzCyc / R.frames / 59904).toFixed(1)}% бюджета кадра), темп ${(R.ticks / R.frames).toFixed(2)} тика/кадр`);

console.log(fail ? `ГЕЙТ КРАСНЫЙ: ${fail} из ${checks}`
                 : `ГЕЙТ ЗЕЛЁНЫЙ: все ${checks} проверки (но экран подтверждает только железо, см. шапку)`);
process.exit(fail ? 1 : 0);
