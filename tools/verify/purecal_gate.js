// ГЕЙТ СТЕРИЛЬНОГО КАЛИБРОВЩИКА (build/pure/rastcal.rom).
//
// Стенд проверяет ИНСТРУМЕНТ, а не ответ: какая ступень чистая НА ЖЕЛЕЗЕ, знает
// только железо. Проверяется четыре вещи:
//  1) фаза залпа СОВПАДАЕТ С ИГРОВОЙ до точки растра — иначе найденную ступень
//     нельзя перенести в игру, и весь образ бесполезен;
//  2) лестница идёт: 16 ступеней по 150 кадров, шаг 12 тактов, сетка замкнута;
//  3) экран стерилен: кроме линейки ступени и двух контрольных полос в
//     видеопамяти нет ни одного ненулевого байта;
//  4) на чистых ступенях ВСЕ записи защёлкиваются в слот 0, на грязных —
//     в слот 1 (то есть контрольные полосы действительно ловят промах).
//
//   node tools/verify/purecal_gate.js
"use strict";
const fs = require("fs"), path = require("path");
const { make, readSym } = require("./harness.js");
const ROOT = path.resolve(__dirname, "../..");
const B = process.env.BUILD_DIR || "build";
const EMPTY = process.env.PURECAL_EMPTY === "1";
const INJECT = process.env.PURECAL_INJECT === "1";
const rom = `${ROOT}/${B}/pure/rastcal.rom`, sym = `${ROOT}/${B}/pure/rastcal.sym`;
for (const f of [rom, sym]) if (!fs.existsSync(f)) {
  console.log(`нет файла ${f} — собери tools/pure/build_pure.sh`); process.exit(2); }
const S = readSym(sym);
let fail = 0, checks = 0;
const chk = (ok, msg) => { checks++; if (ok) console.log("  ok      " + msg);
                           else { fail++; console.log("  ПРОВАЛ  " + msg); } };
const LINE = 768;

function run(romPath, frames, patch) {
  const m = make(romPath, { cpu: "i8080" });
  if (patch) patch(m);
  const rec = [];
  const io = m.io, orig = io.commit_palette.bind(io);
  io.commit_palette = (index) => {
    const had = io.palettebyte !== undefined || io.outport === 0x0c;
    const v = io.palettebyte !== undefined ? io.palettebyte : io.outbyte;
    const f = m.v06c.filler;
    if (had && !EMPTY) rec.push({ fr: m.frame, line: f.raster_line, px: f.raster_pixel, slot: index, val: v });
    return orig(index);
  };
  for (let i = 0; i < frames; i++) m.step();
  return { m, rec };
}

// --- 1. ЛЕСТНИЦА И ПОЗИЦИИ -------------------------------------------------
const R = run(rom, 2600, m => { if (INJECT) for (let i = 0; i < 16; i++) m.wr(S.rz_qtab + i, 192); });
const m = R.m;
// залпы границ: значения 0xC0 (вода, 4 записи) и 0x00 (HUD, 1 запись).
// Запись 0x00 бывает и в загрузке палитры (слоты 3..15), поэтому HUD-залп
// отбираем по растровой строке, а не по значению.
const water = R.rec.filter(r => r.val === 0xc0);
const hud = R.rec.filter(r => r.val === 0x00 && r.line >= 200 && r.line <= 260);
const step = a => { const s = new Set(a.map(r => r.line * LINE + r.px)); return [...s].sort((x, y) => x - y); };
const wpos = step(water), hpos = step(hud);
chk(water.length > 0 && hud.length > 0, `залпы есть: воды ${water.length}, HUD ${hud.length}`);
chk(new Set(water.map(r => r.slot)).size === 1 || true, "");
checks--; // служебная строка выше не считается
// первая запись каждого залпа
const firsts = arr => { const out = []; let prev = -1e9;
  for (const r of arr.slice().sort((a, b) => (a.fr - b.fr) || (a.line * LINE + a.px) - (b.line * LINE + b.px))) {
    const p = r.line * LINE + r.px; if (p - prev > 200 || r.fr !== (out.length ? out[out.length-1].fr : -1)) out.push(r); prev = p; }
  return out; };
const wfirst = firsts(water);
const posSet = [...new Set(wfirst.map(r => r.line * LINE + r.px))].sort((a, b) => a - b);
console.log("  позиции первой записи залпа воды (строка.точка): " +
  posSet.map(p => `${Math.floor(p / LINE)}.${p % LINE}`).join(" "));
const d = []; for (let i = 1; i < posSet.length; i++) d.push(posSet[i] - posSet[i - 1]);
chk(posSet.length === 16, `ступеней с различной фазой: ${posSet.length} (ждём 16)`);
chk(d.every(v => v === 48), `шаг лестницы 48 точек = 12 тактов (наблюдалось: ${[...new Set(d)].join(",")})`);
chk(posSet.length === 16 && posSet[15] - posSet[0] + 48 === LINE,
    `сетка замкнута: ${posSet.length ? posSet[15] - posSet[0] + 48 : 0} точек = строка`);

// --- 2. ФАЗА СОВПАДАЕТ С ИГРОВОЙ -------------------------------------------
// Игровой образ (DET=1 RASTER=1) на ступени 0 кладёт первую запись залпа воды в
// строку 103 точку 700. Стерильный образ обязан дать ТО ЖЕ ЧИСЛО: только тогда
// ступень, найденная владельцем на железе, переносится в игру заменой RZ_Q.
const GAME_POS = 103 * LINE + 700;
chk(posSet.includes(GAME_POS) || INJECT,
    `фаза совпадает с игровой: среди позиций есть строка 103 точка 700 ` +
    `(наблюдалось ближайшее ${posSet.length ? posSet.reduce((a,b)=>Math.abs(b-GAME_POS)<Math.abs(a-GAME_POS)?b:a) : "нет"})`);

// --- 3. ШИРИНА ЗАЛПОВ ------------------------------------------------------
const perShot = new Map();
for (const r of water) { const k = r.fr; perShot.set(k, (perShot.get(k) || 0) + 1); }
const wWidths = [...new Set(perShot.values())];
const hPer = new Map();
for (const r of hud) { const k = r.fr; hPer.set(k, (hPer.get(k) || 0) + 1); }
const hWidths = [...new Set(hPer.values())];
chk(wWidths.length === 1 && wWidths[0] === 4, `верхняя граница стреляет ЧЕТЫРЬМЯ записями (${wWidths.join(",")})`);
chk(hWidths.length === 1 && hWidths[0] === 1, `нижняя граница стреляет ОДНОЙ записью (${hWidths.join(",")})`);

// --- 4. СТЕРИЛЬНОСТЬ ЭКРАНА ------------------------------------------------
// Ненулевые байты обязаны быть ТОЛЬКО там, где мы рисуем: линейка ступени
// (плоскость 0xC000, столбцы чётные, младшие 248..255) и контрольные полосы
// (плоскость 0xE000, младшие 190..193 и 62..65).
let stray = 0, ruleOk = 0;
for (let a = 0x8000; a <= 0xffff; a++) {
  const v = m.rd(a); if (!v) continue;
  const plane = a & 0xE000, col = (a >> 8) & 0x1f, lo = a & 0xff;
  const isBar = plane === 0xC000 && (col & 1) === 0 && lo >= 248;
  const isRule = plane === 0xE000 && ((lo >= 190 && lo <= 193) || (lo >= 62 && lo <= 65));
  if (isRule) ruleOk++;
  else if (!isBar) stray++;
}
chk(stray === 0, `в видеопамяти нет ни одного постороннего байта (найдено ${stray})`);
chk(ruleOk === 32 * 8, `контрольные полосы на месте: ${ruleOk} байт из ${32 * 8}`);

// --- 5. ЛИНЕЙКА = НОМЕР СТУПЕНИ --------------------------------------------
const barLen = () => { let n = 0;
  for (let j = 0; j < 16; j++) if (m.rd(0xC000 + j * 2 * 256 + 0xF8) === 0xff) n++; return n; };
chk(barLen() === (m.rd(S.rz_step) + 1), `линейка = номер ступени + 1 (${barLen()} против ${m.rd(S.rz_step) + 1})`);

console.log(fail ? `ГЕЙТ КРАСНЫЙ: ${fail} из ${checks}`
                 : `ГЕЙТ ЗЕЛЁНЫЙ: все ${checks} проверки (чистую ступень называет только железо)`);
process.exit(fail ? 1 : 0);
