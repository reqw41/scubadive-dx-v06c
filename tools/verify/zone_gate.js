// ГЕЙТ ЭТАПА 2: переезд пула в ломти верхней зоны (-DZONE).
//
// Главная проверка — НЕВИДИМОСТЬ переезда: видеопамять ВНЕ зоны обязана
// совпадать с бесфлаговой сборкой байт в байт на всём сценарии. Если совпадает,
// значит игра работает ровно как раньше, а буферы просто живут в другом месте.
//
//   ZONE_INJECT=1 — подсадить дефект: выдать ломоть и странице 1 (у неё буфер
//                   256 Б, он вылезет из ломтя). Гейт обязан покраснеть.
//   ZONE_EMPTY=1  — обнулить выборку. Гейт обязан покраснеть.
"use strict";
const fs = require("fs"), path = require("path");
const { readSym } = require("./harness.js");
const { reachGame } = require("./drive.js");
const ROOT = path.resolve(__dirname, "../..");
const B = process.env.BUILD_DIR || "build";
const INJECT = process.env.ZONE_INJECT === "1", EMPTY = process.env.ZONE_EMPTY === "1";
// Потолок прогона в КАДРАХ. Здоровой сборке на 900 тиков хватает около 600
// кадров, поэтому 5000 — восьмикратный запас и при этом секунды, а не пять
// часов. Исчерпание потолка обязано быть КРАСНЫМ: гейт, который висит, хуже
// гейта, который врёт, — он не даёт даже узнать, что он врёт.
const GUARD = Number(process.env.ZONE_GUARD || 5000);
const zRom = `${ROOT}/${B}/zone/scuba.rom`, zSym = `${ROOT}/${B}/zone/scubacod1.sym`;
const cRom = `${ROOT}/${B}/src8080/scuba.rom`, cSym = `${ROOT}/${B}/src8080/scubacod1.sym`;
for (const f of [zRom, zSym, cRom, cSym]) if (!fs.existsSync(f)) {
  console.log(`нет файла ${f} — собери DET=1 ZONE=1 OUT=${B}/zone и DET=1 OUT=${B}/src8080`);
  process.exit(2); }
let fail = 0, checks = 0;
const chk = (ok, msg) => { checks++; if (ok) console.log("  ok      " + msg);
                           else { fail++; console.log("  ПРОВАЛ  " + msg); } };
// адреса ломтей: плоскость 0xC000, столбец = индекс страницы, младшие 208..255
const inSlice = a => a >= 0xC000 && a < 0xE000 && (a & 0xff) >= 208;

const SCENES = [["уровень 4 поверхность", 4, null, 900], ["уровень 1 поверхность", 1, null, 900],
                ["уровень 4 глубина", 4, 9, 900]];
for (const [name, lvl, row, ticks] of SCENES) {
  // --- прогон флаговой сборки со слежением за пулом
  const occupied = new Array(16).fill(false), curMax = new Array(16).fill(-1);
  const lives = [], strayB = [];
  let emptied = false;
  // Записи БУТА не в счёт: копия сжатого потока к 0xC000 проходит через
  // 0xB200..0xBFFF (3584 байта, ровно весь диапазон) — это происходит ДО игры и
  // к пулу отношения не имеет. Считаем только то, что пишет игровой цикл.
  let started = false;
  const install = m => {
    const S = readSym(zSym);
    const orig = m.memory.write.bind(m.memory);
    m.memory.write = (a, v, st) => {
      a &= 0xffff;
      if (a >= S.LB676 && a < S.LB676 + 16) {
        const p = a - S.LB676, was = occupied[p], now = (v & 0x80) !== 0;
        if (!was && now) { occupied[p] = true; curMax[p] = -1; }
        else if (was && !now) { occupied[p] = false; lives.push({ p, sz: curMax[p] + 1 }); }
      } else if (a >= 0xB000 && a < 0xC000) {
        const p = (a >> 8) & 15, o = a & 255; if (o > curMax[p]) curMax[p] = o;
        if (a >= 0xB200 && started) strayB.push(a);
      } else if (inSlice(a)) {
        const p = (a >> 8) & 15, o = (a & 0xff) - 208; if (o > curMax[p]) curMax[p] = o;
      }
      return orig(a, v, st);
    };
  };
  const gz = reachGame(zRom, zSym, { cpu: "i8080", level: lvl, seed: 0x0167,
    preHook: (m, S) => { install(m);
      // ПОДСАДКА ставится на входе в START_GAME: буферы раздаются на постановке
      // уровня, то есть ДО возврата из reachGame. Патч, наложенный после, не
      // успевал ни на что повлиять — первая версия контроля зеленела впустую.
      if (INJECT) m.onPc(S.START_GAME, () => { m.wr(S.LB655_cp + 1, 1); });
      if (EMPTY) m.onPc(S.START_GAME, () => { emptied = true; });
    } });
  const Sz = gz.S;
  // ПОДСАДКА: порог «полная страница или ломоть» сдвигается с 2 на 1, и страница
  // 1 с её буфером в 256 Б уезжает в ломоть на 48 Б. Гейт обязан покраснеть и по
  // переполнению ломтя, и по расхождению видеопамяти.
  if (INJECT) gz.m.wr(Sz.LB655_cp + 1, 1);
  // СНИМОК БЕРЁТСЯ РОВНО НА ТИКЕ, а не на границе кадра. Первая версия гейта
  // останавливала прогон по кадрам, и сборки, идущие с разной скоростью,
  // оказывались на РАЗНОМ числе тиков — расхождение в два байта было дефектом
  // измерения, а не игры.
  let t = 0, snapZ = null;
  gz.m.onPc(Sz.LD9C0, () => { t++; started = true; if (row !== null) gz.m.wr(Sz.L5B03 + 1, row);
    if (t === ticks && !snapZ) { snapZ = new Uint8Array(0x4000);
      for (let a = 0xC000; a <= 0xFFFF; a++) snapZ[a - 0xC000] = gz.m.rd(a); } });
  // ПРЕДЕЛ ПРОГОНА — ЭТО КАДРЫ, А НЕ ФАНТАЗИЯ. Шаг стенда — целый кадр Вектора,
  // поэтому «300000» означало пять часов эмуляции: подсаженный ZONE_INJECT образ
  // до снимка не доходит вовсе, и НЕГАТИВНЫЙ КОНТРОЛЬ ПОВЕСИЛ ВЕСЬ НАБОР (33
  // минуты без единой строки в логе). Теперь предел реальный, а его исчерпание —
  // КРАСНЫЙ с числом, а не молчаливый выход из цикла.
  let guard = 0; while (!snapZ && guard < GUARD) { gz.m.step(); guard++; }
  chk(!!snapZ, `${name}: сборка ZONE дошла до тика ${ticks} за ${guard} кадров ` +
      `(предел ${GUARD})`);
  if (!snapZ) { console.log("  ГЕЙТ ОСТАНОВЛЕН: снимок ZONE не снят"); continue; }
  for (let p = 0; p < 16; p++) if (occupied[p] && curMax[p] >= 0) lives.push({ p, sz: curMax[p] + 1 });
  if (emptied) lives.length = 0;
  // СТОРОЖ ПУСТОЙ ВЫБОРКИ: без него гейт зеленеет на нуле наблюдений.
  chk(lives.filter(l => l.p >= 2).length >= 4,
      `${name}: наблюдалось ломтей ${lives.filter(l => l.p >= 2).length} (ждём не меньше 4)`);
  // --- прогон бесфлаговой сборки тем же сценарием
  const gc = reachGame(cRom, cSym, { cpu: "i8080", level: lvl, seed: 0x0167 });
  const Sc = gc.S;
  let t2 = 0, snapC = null;
  gc.m.onPc(Sc.LD9C0, () => { t2++; if (row !== null) gc.m.wr(Sc.L5B03 + 1, row);
    if (t2 === ticks && !snapC) { snapC = new Uint8Array(0x4000);
      for (let a = 0xC000; a <= 0xFFFF; a++) snapC[a - 0xC000] = gc.m.rd(a); } });
  guard = 0; while (!snapC && guard < GUARD) { gc.m.step(); guard++; }
  chk(!!snapC, `${name}: бесфлаговая сборка дошла до тика ${ticks} за ${guard} кадров ` +
      `(предел ${GUARD})`);
  if (!snapC) { console.log("  ГЕЙТ ОСТАНОВЛЕН: снимок бесфлаговой не снят"); continue; }
  // сверка видеопамяти ВНЕ зоны
  let diff = 0, first = -1;
  for (let a = 0xC000; a <= 0xFFFF; a++) {
    if (inSlice(a)) continue;                       // ломти — законное расхождение
    if (snapZ[a - 0xC000] !== snapC[a - 0xC000]) { diff++; if (first < 0) first = a; } }
  chk(diff === 0, `${name}: видеопамять вне ломтей совпадает с бесфлаговой (расхождений ${diff}` +
      (first >= 0 ? `, первое 0x${first.toString(16)}` : "") + ")");
  const big = lives.filter(l => l.p >= 2 && l.sz > 48);
  chk(big.length === 0, `${name}: ни один ломоть не превысил 48 Б (нарушений ${big.length}` +
      (big.length ? `, худший ${Math.max(...big.map(b => b.sz))} Б на странице ${big[0].p}` : "") + ")");
  chk(strayB.length === 0, `${name}: в 0xB200..0xBFFF не записано ни байта (записей ${strayB.length})`);
}
console.log(fail ? `ГЕЙТ КРАСНЫЙ: ${fail} из ${checks}` : `ГЕЙТ ЗЕЛЁНЫЙ: все ${checks} проверки`);
process.exit(fail ? 1 : 0);
