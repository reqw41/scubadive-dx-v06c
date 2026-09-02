"use strict";
// ГДЕ ИМЕННО ЗЕРКАЛЬНАЯ СБОРКА РАСХОДИТСЯ С ИСХОДНОЙ.
//
// romdiff_pix говорит «столько-то байт экрана», и по нему не отличить чужую
// форму от той же формы, сдвинутой на пиксель. Здесь сверяется не экран, а
// СОБРАННЫЙ КАДР: слот стейджинга сразу после сборки, до того как его положил
// блит. Если отражение верно, слот обязан совпасть байт в байт — он уже сдвинут
// на k и уже развёрнут.
//
// Указатели между сборками сравнивать НЕЛЬЗЯ: адреса кадров и дескрипторов у
// них разные (код разной длины). Сравнивается содержимое слота, а тип берётся
// по имени метки дескриптора из .sym КАЖДОЙ сборки.
//
// Сборки идут по одному игровому времени: state_cmp показал тождественность
// состояния, значит тик N — один и тот же момент, и заходы в блит внутри тика
// идут в одном порядке.
//
//   node tools/verify/mirror_trace.js <romA> <symA> <romB> <symB> [тиков=800] [уровень=1]
// MT_DUMP=1 — напечатать оба слота картинкой в месте первого расхождения
const fs = require("fs"), path = require("path");
const { reachGame, KEY } = require("./drive.js");
const [romA, symA, romB, symB] = process.argv.slice(2, 6);
const NT = parseInt(process.argv[6] || "800", 10);
const LVL = parseInt(process.argv[7] || "1", 10);
const DUMP = process.env.MT_DUMP === "1";
const ROOT = path.resolve(__dirname, "../..");

// имя типа по адресу дескриптора — из шапок шаблонов записей (как в inkmap.js)
const src = fs.readFileSync(path.join(ROOT, "src8080", "scubacodb.asm"), "utf8").split("\n");
const nameOfDesc = {};
for (let i = 0; i < src.length; i++) {
  const t = /Record template for \d+-byte record - (.+)$/.exec(src[i]);
  if (!t) continue;
  // ОКНО ПОИСКА ДЕСКРИПТОРА — 24 СТРОКИ, А НЕ 12. Шаблон записи может быть
  // раздвинут врезкой условной компиляции: у круглой рыбы -DMIRROR добавляет
  // семь строк комментария и IFDEF, и `DEFW LC0B2 ; object record` уезжает на
  // тринадцатую строку. С окном в 12 строк тип молча терял имя и печатался как
  // «?6530» — перепись врала на самом массовом существе игры.
  const body = src.slice(i + 1, i + 24).join("\n");
  const d = /DEFW\s+(LC[0-9A-F]{3})\s*;\s*object record/.exec(body);
  if (d && !nameOfDesc[d[1]]) nameOfDesc[d[1]] = t[1].trim();
}

function run(rom, sym) {
  const g = reachGame(rom, sym, { cpu: "i8080", level: LVL, seed: 0x0167 });
  const m = g.m, S = g.S;
  const byAddr = {};                       // адрес дескриптора -> имя типа
  for (const lbl of Object.keys(nameOfDesc)) if (S[lbl] !== undefined) byAddr[S[lbl]] = nameOfDesc[lbl];
  const ticks = [];
  let cur = [];
  m.onPc(S.LD9C0, () => { ticks.push(cur); cur = []; });
  // ПОСЛЕ СБОРКИ КАДРА, ДО БЛИТА. LB496 — первая точка, где кадр уже в слоте, а
  // указатель маски ещё не сдвинут отсечением по краю поля (LB4A5).
  m.onPc(S.LB496, () => {
    const ix = m.rdw(S.z80_ix), iy = m.rdw(S.z80_iy);
    if (!(m.rd(ix + 13) & 1)) return;      // стирание: кадр не собирался
    const w = m.rd(iy + 9), sz = m.rd(iy + 10), n = w * sz;
    if (!n || n > 512) return;
    // ЛОДКУ ПРОПУСКАЕМ. Под -DBOATFAST её кадр собирается не в стейджинг, а в
    // свою страницу BOAT_PAGE, и чтение (LB7B9) для неё возвращает ОБЪЕДКИ
    // прошлого существа. Первая редакция этого не учла и объявила расходящейся
    // ровно лодку — единственный тип, чей кадр здесь вообще не лежит.
    const nm = byAddr[iy] || ("?" + iy.toString(16));
    if (/^Boat/.test(nm)) return;
    const base = m.rdw(S.LB7B9);
    const b = Buffer.alloc(n);
    for (let i = 0; i < n; i++) b[i] = m.rd(base + i);
    cur.push({ type: nm, col: m.rd(iy + 2), row: m.rd(iy + 3),
               w, sz, wid: m.rd(iy + 7), off: m.rd(iy + 6), slot: b.toString("hex") });
  });
  const t0 = g.ticks; let guard = 0;
  m.key(KEY.UP, true);
  while (g.ticks - t0 < NT && guard < 3000000) { m.step(); guard++; }
  return ticks;
}

const A = run(romA, symA), B = run(romB, symB);
const n = Math.min(A.length, B.length);
let firstBad = null, nBad = 0, byType = new Map(), firstCount = null, nCount = 0;
for (let t = 0; t < n; t++) {
  const a = A[t] || [], b = B[t] || [];
  if (a.length !== b.length) {
    // Расхождение ЧИСЛА заходов в первых тиках — артефакт стенда, а не игры:
    // крючок LD9C0 у сборок разной длины кода срабатывает на разных кадрах
    // старта. Отмечаем отдельно и не путаем с расхождением кадров.
    if (!firstCount) firstCount = { t, a: a.length, b: b.length };
    nCount++;
    continue;
  }
  for (let i = 0; i < a.length; i++) {
    const geomA = `${a[i].type}|${a[i].col},${a[i].row}|${a[i].w}x${a[i].sz}|${a[i].wid},${a[i].off}`;
    const geomB = `${b[i].type}|${b[i].col},${b[i].row}|${b[i].w}x${b[i].sz}|${b[i].wid},${b[i].off}`;
    if (geomA !== geomB) {
      nBad++; byType.set(a[i].type + " (геометрия)", (byType.get(a[i].type + " (геометрия)") || 0) + 1);
      if (!firstBad) firstBad = { t, i, why: `геометрия разошлась\n    без MIRROR: ${geomA}\n    с  MIRROR: ${geomB}`, a: a[i], b: b[i] };
      continue;
    }
    if (a[i].slot === b[i].slot) continue;
    nBad++;
    byType.set(a[i].type, (byType.get(a[i].type) || 0) + 1);
    if (!firstBad) firstBad = { t, i, a: a[i], b: b[i] };
  }
}
console.log(`уровень ${LVL}, ${n} тиков: собранных кадров расходится ${nBad}` +
            (nCount ? `; тиков с разным числом заходов ${nCount} (первый ${firstCount.t}: ${firstCount.a} против ${firstCount.b})` : ""));
console.log("по типам: " + ([...byType].sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} x${v}`).join(", ") || "нет"));
if (!firstBad) { console.log("ОК: все собранные кадры совпали байт в байт"); process.exit(0); }
if (firstBad.why) { console.log(`первое: тик ${firstBad.t}, заход ${firstBad.i} — ${firstBad.why}`); process.exit(1); }
const { t, i, a, b } = firstBad;
console.log(`первое расхождение: тик ${t}, заход ${i}, тип «${a.type}», столбец ${a.col} строка ${a.row}, слот ${a.w}x${a.sz}`);
const A1 = Buffer.from(a.slot, "hex"), B1 = Buffer.from(b.slot, "hex");
let diffBytes = 0, diffBits = 0;
const pc = x => { let c = 0; while (x) { c += x & 1; x >>= 1; } return c; };
for (let j = 0; j < A1.length; j++) if (A1[j] !== B1[j]) { diffBytes++; diffBits += pc(A1[j] ^ B1[j]); }
console.log(`  в слоте разошлось ${diffBytes} байт, ${diffBits} пикселей`);
// СДВИГ ИЛИ ФОРМА: пробуем совместить слоты сдвигом на 1..7 пикселей влево и
// вправо. Если после сдвига они совпадают — дело не в отражении, а в k.
const W = Math.floor(A1.length / (a.sz / 8 * a.w) ) || 0;
function shiftRows(buf, rowLen, rows, dir) {
  const out = Buffer.alloc(buf.length);
  for (let r = 0; r < rows; r++) {
    let carry = 0;
    if (dir > 0) for (let c = 0; c < rowLen; c++) { const v = buf[r * rowLen + c]; out[r * rowLen + c] = (v >> 1) | (carry << 7); carry = v & 1; }
    else for (let c = rowLen - 1; c >= 0; c--) { const v = buf[r * rowLen + c]; out[r * rowLen + c] = ((v << 1) & 0xff) | carry; carry = (v >> 7) & 1; }
  }
  return out;
}
const rowLen = a.w, rows = A1.length / a.w;
let matched = null;
for (const dir of [1, -1]) {
  let cur = B1;
  for (let k = 1; k <= 7 && !matched; k++) {
    cur = shiftRows(cur, rowLen, rows, dir);
    if (cur.equals(A1)) matched = k * dir;
  }
  if (matched) break;
}
console.log(matched ? `  🎯 СЛОТЫ СОВПАДАЮТ ПОСЛЕ СДВИГА НА ${Math.abs(matched)} пикс. ${matched > 0 ? "вправо" : "влево"} — дело в k, а не в отражении`
                    : "  сдвигом 1..7 пикселей слоты не совмещаются — расходится сама форма");
if (DUMP) {
  const show = (buf, tag) => {
    console.log("  " + tag + ":");
    for (let r = 0; r < rows; r++) {
      let s = "";
      for (let c = 0; c < rowLen; c++) { const v = buf[r * rowLen + c]; for (let bit = 7; bit >= 0; bit--) s += (v >> bit) & 1 ? "#" : "."; }
      if (/#/.test(s)) console.log("    " + s);
    }
  };
  show(A1, "без MIRROR"); show(B1, "с MIRROR");
}
process.exit(1);
