// СМЕРТЬ НА ДНЕ: кто пишет в ломти зоны ПОСЛЕ раскладки.
//
// Свидетельство с железа (образ 109f3420): после смерти НА ДНЕ начинает биться
// сначала рельеф, потом спрайты — вертикальной полосой снизу. Кандидат:
// нижний вылет блита. Адрес видеопамяти считается как `lo = 255 - y`, поэтому
// всё, что вылезает за строку 255, заворачивается в `lo` 192..255 — то есть
// ровно в ломти зоны, где теперь живут рельеф (страницы 0xE2..0xFF) и кадры
// дайвера (0xB2..0xC1 и 0xD2..0xE1).
//
// Почему прошлый заход (раздел 19 плана) вылета НЕ НАШЁЛ: в спектре не было
// смерти У САМОЙ НИЖНЕЙ КРОМКИ — агония шла в толще воды. Дыра ровно того же
// рода, что и «герой не плывёт» из урока №24: гейт без сцены — гейт без предмета.
//
// Мера. После раскладки (ZoneCopy зовётся ОДИН раз, в буте — см. Start) любая запись в страницу
// ломтя с младшим байтом >= 192 — это ПОРЧА, кроме поимённо известных жильцов
// (буферы пула, битмап панели, цифры боковой панели). Считается гистограмма по
// PC и снимок первых записей: адрес, значение, HL, DE, строка дайвера.
//
//   node tools/verify/bottom_probe.js [каталог]     (по умолчанию build/ev)
//   BP_LEVEL=4  BP_DEATHS=3  BP_TICKS=2500
"use strict";
const fs = require("fs"), path = require("path");
const { readSym } = require("./harness.js");
const { reachGame, swim } = require("./drive.js");
const ROOT = path.resolve(__dirname, "../..");
const DIR = process.argv[2] || `${ROOT}/build/ev`;
for (const f of ["scuba.rom", "scubacod1.sym"])
  if (!fs.existsSync(`${DIR}/${f}`)) { console.log(`нет ${DIR}/${f}`); process.exit(2); }
const S = readSym(`${DIR}/scubacod1.sym`);
const LEVEL = Number(process.env.BP_LEVEL || 4);
const DEATHS = Number(process.env.BP_DEATHS || 3);
const TICKS = Number(process.env.BP_TICKS || 2500);
const KEY = { UP: 38, DOWN: 40, LEFT: 37, RIGHT: 39 };
const INJECT = process.env.BP_INJECT === "1";
const EMPTY = process.env.BP_EMPTY === "1";
// Порог «сцена дошла до дна». Замер: удержание клавиши погружения доводит Y до
// 54 и дальше не пускает; берём 40 — заведомо ниже потолка и заведомо выше
// стартовых 12. Без этого числа сцена могла бы тихо не входить в воду, как она
// год и делала, а гейт бодро зеленел бы на пустом месте.
const Y_BOTTOM = Number(process.env.BP_YMIN || 40);

// Страницы ломтей. В безвыселенной сборке символов DIVER_A/RELIEF_HI нет —
// тогда берём ТЕ ЖЕ диапазоны числом, иначе негативный контроль сравнивал бы
// разные множества адресов и ничего не значил.
const A = S.DIVER_A != null ? S.DIVER_A : 0xB2, Bh = S.DIVER_B != null ? S.DIVER_B : 0xD2;
const RH = S.RELIEF_HI != null ? S.RELIEF_HI : 0xE2;
// РЯД ДАННЫХ СЧИТАЕТСЯ ПО ЗАНЯТОМУ, А НЕ ПО ЁМКОСТИ: ломтей данных в плане может
// не быть вовсе, и тогда страницы C7..D1 — обычный экран, писать туда законно.
// Мера, считающая их порчей, объявила бы 7390 «повреждений» на пустом месте.
const D0 = S.ZN_DATA0 != null ? S.ZN_DATA0 : 0xC7;
const DN = S.SCUBAZONE_N != null ? S.SCUBAZONE_N : 0;
const kind = (a) => {
  const p = (a >> 8) & 0xff, lo = a & 0xff;
  if (lo < 192) return null;
  if (p >= RH) return "рельеф";
  if ((p >= A && p < A + 16) || (p >= Bh && p < Bh + 16)) return "кадры дайвера";
  if (p >= D0 && p < D0 + DN) return "ломти данных";
  return null;
};
// ЗАКОННЫЕ ЖИЛЬЦЫ, вычитаемые из выборки ДО всякого вывода (урок №9: прежде чем
// объявлять явление воспроизведённым, вычесть всё, что уже названо законным).
const legal = (a) => {
  const p = (a >> 8) & 0xff, lo = a & 0xff;
  if (p >= 0xC2 && p <= 0xC6 && lo >= 208) return "буфер пула";       // этап 2, законный жилец
  return null;
};
// ПАНЕЛЬ БОЛЬШЕ НЕ СПИСЫВАЕТСЯ В ЗАКОННЫЕ. Прежняя версия вычитала все записи в
// столбцы 24..31 (страницы 0xF8..0xFF и 0xD8..0xDF) как «битмап панели» — а это
// ЛОМТИ РЕЛЬЕФА 22..29. Распаковщик панели их и вправду топчет, но ДО второй
// раскладки, и та их чинит; всё, что пишет туда ПОСЛЕ, — порча. Широкая мера
// прятала ровно то, ради чего написана (урок №9 наизнанку: вычитать законное
// надо по МОМЕНТУ, а не по адресу).

const hist = new Map(), shots = new Map(), byKind = new Map();
// ГЛАВНАЯ МЕРА — СОСТОЯНИЕ, А НЕ СЧЁТ ЗАПИСЕЙ. Счёт записей объявляет порчей и
// то, что следующая же раскладка чинит: ZoneCopy зовётся на КАЖДОЙ постановке
// уровня, а смерть уровень перезапускает. Поэтому меряем СОДЕРЖИМОЕ ломтей
// против источника — ровно то, что видит владелец на экране (урок №20: снимок
// берётся тогда, когда измеряемое сложилось, а не «когда-нибудь»).
const lastWriter = new Map();               // адрес -> PC последней записи
let srcRelf = null, srcDivr = null;   // снимок источника, см. damage()
let zoneDone = 0, watching = false, legalHits = 0, inCopy = false, copyHits = 0;
const g = reachGame(`${DIR}/scuba.rom`, `${DIR}/scubacod1.sym`,
  { cpu: "i8080", level: LEVEL, seed: 0x0167, preHook: (m, SS) => {
    // РАСКЛАДКА — НЕ ПОРЧА. ZoneCopy зовётся заново на КАЖДОЙ постановке уровня, а
    // смерть уровень и перезапускает: без этого фильтра её собственные записи
    // (zrelf1/zdivr1/zcopy1) попадали в выборку и давали 5888 «порчи» на пустом
    // месте. Ровно урок №9: вычесть законное ДО того, как объявлять явление.
    if (SS.ZoneDone != null) {
      m.onPc(SS.ZoneCopy, () => { inCopy = true; });
      // РАСКЛАДКА ТЕПЕРЬ ОДНА И В БУТЕ. Было две (в Game и в PrepareGame после
      // панели), поэтому наблюдение открывалось со второй. С фиксом зависания
      // демо-режима раскладка переехала в Start сразу за распаковку панели и
      // стала одной: наблюдение открывается с ПЕРВОЙ.
      m.onPc(SS.ZoneDone, () => { inCopy = false; zoneDone++; watching = zoneDone >= 1;
        snapSrc(m, SS);
        if (INJECT && SS.DIVER_A != null) m.wr(SS.DIVER_A * 256 + 192 + 9, 0x5a); });
    } else watching = true;                     // безвыселенная сборка: смотрим сразу
    const o = m.memory.write.bind(m.memory);
    m.memory.write = (a, v, st) => { a &= 0xffff;
      if (inCopy) copyHits++;
      if (watching && !inCopy) {
        const k = kind(a);
        if (k) {
          const lg = legal(a);
          if (lg) legalHits++;
          else {
            const pc = m.cpu.pc & 0xffff;
            hist.set(pc, (hist.get(pc) || 0) + 1);
            lastWriter.set(a, pc);
            byKind.set(k, (byKind.get(k) || 0) + 1);
            lastWriter.set(a, m.cpu.pc & 0xffff);
            const sh = shots.get(k) || (shots.set(k, []), shots.get(k));
            // КТО ЗВАЛ ПЕЧАТЬ: без имени тракта правку ставить некуда. Стек
            // разбирается на возвраты — тот же приём, что в разделе 19 плана.
            if (sh.length < 4) { const st = [], sp = m.cpu.sp & 0xffff;
              for (let i = 0; i < 10 && st.length < 4; i++) {
                const w = m.rd(sp + i * 2) | (m.rd(sp + i * 2 + 1) << 8);
                if (w > 0x4000 && w < 0xA000) st.push(w);
              }
              sh.push({ a, v: v & 0xff, pc, stack: st,
              hl: m.cpu.hl() & 0xffff, de: m.cpu.rp(2) & 0xffff,
              row: m.rd(SS.DiverObj + 0x14), col: m.rd(SS.DiverObj + 0x00) }); }
          }
        }
      }
      return o(a, v, st); }; } });

let t = 0, rowMax = 0, rowAtDeath = [];
g.m.onPc(S.LD9C0, () => { t++; const r = g.m.rd(S.DiverObj + 0x14); if (r > rowMax) rowMax = r; });
const step = n => { for (let i = 0; i < n; i++) g.m.step(); };
const hold = (keys, f) => { for (const k of keys) g.m.key(k, true); step(f);
                            for (const k of keys) g.m.key(k, false); step(4); };

const names = Object.entries(S).sort((a, b) => b[1] - a[1]);
const near = (pc) => { const e = names.find(([, v]) => v <= pc); return e ? `${e[0]}+${pc - e[1]}` : "?"; };
// --- СВЕРКА СОДЕРЖИМОГО ЛОМТЕЙ С ИСТОЧНИКОМ ---------------------------------
// ЭТАЛОН СНИМАЕТСЯ В МОМЕНТ РАСКЛАДКИ, А НЕ ЧИТАЕТСЯ ИЗ ЖИВОЙ ПАМЯТИ В КОНЦЕ.
// Упакованный источник лежит в 0xA03C..0xAFFC, и это ДОМ ПУЛА буферов
// save-under: после однократной раскладки источник законно затирается игрой.
// Пока пул стоял в другом месте, «прочитать эталон в конце прогона» работало;
// с переездом пула та же строчка стала сверять ломти с мусором и дала 586
// «расхождений» на целых данных.
function snapSrc(m, SS) {
  if (srcRelf) return;                         // снимок берётся ОДИН раз
  if (SS.SCUBARELF_SRC != null && SS.RELIEF_HI != null) {
    const n = (256 - SS.RELIEF_HI) * 64; srcRelf = new Uint8Array(n);
    for (let i = 0; i < n; i++) srcRelf[i] = m.rd(SS.SCUBARELF_SRC + i);
  }
  if (SS.SCUBADIVR_SRC != null) {
    srcDivr = new Uint8Array(2048);
    for (let i = 0; i < 2048; i++) srcDivr[i] = m.rd(SS.SCUBADIVR_SRC + i);
  }
}
function damage() {
  const bad = { "рельеф": [], "кадры дайвера": [] };
  if (S.SCUBARELF_SRC != null && S.RELIEF_HI != null) {
    const n = (256 - S.RELIEF_HI) * 64;
    for (let i = 0; i < n; i++) {
      const a = (S.RELIEF_HI + (i >> 6)) * 256 + 192 + (i & 63);
      if (srcRelf && g.m.rd(a) !== srcRelf[i]) bad["рельеф"].push(a);
    }
  }
  if (S.SCUBADIVR_SRC != null && S.DIVER_A != null) {
    for (let i = 0; i < 2048; i++) {
      const sl = i >> 6, p = sl < 16 ? S.DIVER_A + sl : S.DIVER_B + (sl - 16);
      const a = p * 256 + 192 + (i & 63);
      if (srcDivr && g.m.rd(a) !== srcDivr[i]) bad["кадры дайвера"].push(a);
    }
  }
  return bad;
}

// --- СЦЕНА: УЙТИ НА САМОЕ ДНО И УМЕРЕТЬ ТАМ ---------------------------------
const D = S.DiverObj;
// ГЛУБИНА — ЭТО DiverObj+$14 (Y на экране), а НЕ +$01. Первая версия сцены мерила
// +$01 (строка на карте мира), видела «6» и считала, что дайвер на дне, — а он
// вообще не двигался в этой мере: за 640 кадров «вниз» она не изменилась ни разу.
// Признак дна теперь честный: спускаться, пока Y растёт, и убедиться, что упёрся.
// КЛАВИША ПОГРУЖЕНИЯ — «ВВЕРХ» (38), А НЕ «ВНИЗ». Замер по клавишам: из точки
// старта UP уводит дайвера с y=12 на y=54 и с карты-строки 6 на 9, а DOWN не
// меняет ни одной координаты за 1200 кадров. Прежняя сцена жала DOWN и потому
// НИКОГДА не входила в воду — «смерть на дне» была смертью у лодки.
const DIVE = KEY.UP;
const yAt = () => g.m.rd(D + 0x14);
// РАСПЛАВАТЬСЯ ПЕРЕД СПУСКОМ. Замер: одни только удержания «вниз» с места старта
// дайвера НЕ ДВИГАЮТ (Y=12 неизменно за 840 кадров), а после штатного swim() он
// идёт вниз как надо. Поэтому сцена начинается с проверенного сценария спектра, и
// только потом гонит на дно — иначе «смерть на дне» была бы смертью у лодки.
let deepest = yAt(), stall = 0;
for (let i = 0; i < 14 && stall < 3; i++) {
  hold([DIVE], 90);
  const y = yAt();
  if (y > deepest) { deepest = y; stall = 0; } else stall++;
}
const rowBottom = yAt();
let deaths = 0; const timeline = [];
for (let d = 0; d < DEATHS && t < TICKS; d++) {
  g.m.wr(S.LIVES, 3);
  rowAtDeath.push(g.m.rd(S.DiverObj + 0x14));
  // агония включается битом 5 в DiverObj+$10 — та же механика, что в swim() и
  // zone_writers.js; держим «вниз», чтобы гибель шла У САМОЙ КРОМКИ, а не в толще
  for (let i = 0; i < 900 && t < TICKS; i++) {
    if ((i & 31) === 0) g.m.wr(D + 0x10, g.m.rd(D + 0x10) | 0x20);
    if (i === 0) g.m.key(DIVE, true);
    g.m.step();
  }
  g.m.key(DIVE, false); step(4);
  deaths++;
  // СНИМОК СРАЗУ ПОСЛЕ ВОЗРОЖДЕНИЯ, а не в конце прогона: владелец видит порчу
  // В ИГРЕ, а к концу её могла бы починить очередная раскладка (урок №20).
  { const d = damage();
    timeline.push(`после смерти ${deaths} (тик ${t}): рельеф ${d["рельеф"].length} Б, ` +
                  `кадры ${d["кадры дайвера"].length} Б`); }
  hold([DIVE], 150);                      // вернуться на дно перед следующей смертью
}
let q = 0; while (t < TICKS && q < 4000) { g.m.step(); q++; }

const dmg = damage();
console.log("");
for (const l of timeline) console.log("  " + l);
for (const k of Object.keys(dmg)) {
  const arr = dmg[k];
  console.log(`  ПОРЧА ${k}: байт разошлось ${arr.length}` +
    (arr.length ? ` (первый 0x${arr[0].toString(16).toUpperCase()}, страниц ` +
      `${new Set(arr.map(a => a >> 8)).size})` : ""));
  if (arr.length) {
    const w = new Map();
    for (const a of arr) { const pc = lastWriter.get(a); if (pc != null) w.set(pc, (w.get(pc) || 0) + 1); }
    for (const [pc, n] of [...w.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4))
      console.log(`      писал 0x${pc.toString(16).toUpperCase()} ${near(pc)} — ${n} байт`);
    if (!w.size) console.log("      писателя в выборке нет: испорчено ДО начала наблюдения");
  }
}

const total = [...hist.values()].reduce((a, b) => a + b, 0);
console.log(`СЦЕНА «СМЕРТЬ НА ДНЕ»: ${DIR}, уровень ${LEVEL}, тиков ${t}, смертей ${deaths}`);
console.log(`  строка дайвера на дне: ${rowBottom} (максимум за спуск ${deepest})`);
console.log(`  раскладок ZoneCopy до наблюдения: ${zoneDone}`);
console.log(`  записей в ломти зоны ПОСЛЕ раскладки: ${total} (законных жильцов вычтено ${legalHits})`);
for (const [k, n] of [...byKind.entries()].sort((a, b) => b[1] - a[1]))
  console.log(`    ${k.padEnd(16)} ${n}`);
if (total) {
  console.log("  писатели по PC:");
  for (const [pc, n] of [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8))
    console.log(`    0x${pc.toString(16).toUpperCase().padStart(4, "0")}  ${near(pc).padEnd(24)} ${n}`);
  for (const [k, sh] of shots) {
    console.log(`  первые записи (${k}):`);
    for (const s of sh)
      console.log(`    [0x${s.a.toString(16).toUpperCase()}]=0x${s.v.toString(16).padStart(2, "0")} ` +
                  `PC=0x${s.pc.toString(16).toUpperCase()} ${near(s.pc)} HL=${s.hl.toString(16).toUpperCase()} ` +
                  `DE=${s.de.toString(16).toUpperCase()} дайвер стр.${s.row}\n` +
                  `        стек: ${(s.stack || []).map(near).join(" | ")}`);
  }
}
// --- ВЕРДИКТ ГЕЙТА ----------------------------------------------------------
let fail = 0, checks = 0;
const chk = (ok, msg) => { checks++; if (ok) console.log("  ok      " + msg);
                           else { fail++; console.log("  ПРОВАЛ  " + msg); } };
if (EMPTY || !deaths || zoneDone < 1) {
  console.log(`  ПРОВАЛ  ПУСТАЯ ВЫБОРКА: смертей ${deaths}, раскладок ${zoneDone}`);
  console.log("ГЕЙТ НЕДЕЙСТВИТЕЛЕН"); process.exit(2); }
chk(rowMax >= Y_BOTTOM, `сцена дошла до дна: максимум Y ${rowMax} (порог ${Y_BOTTOM})`);
// ОДНОКРАТНОСТЬ РАСКЛАДКИ. Разложить ломти надо РОВНО ОДИН раз и только в буте,
// сразу за распаковкой панели: раньше нельзя (панель протрёт ломти рельефа
// 22..29), позже нельзя (демо-режим меню читает рельеф до первого входа в игру и
// без него виснет насмерть). Дальше панель не рисуется, в зону не пишет никто, и
// источник 0xA0..0xAF мёртв — на этом стоит вся раздача его страниц под крупные
// буферы. Сцена гоняет три смерти с перепостановкой уровня, то есть считает
// честно: любая лишняя раскладка была бы видна здесь.
chk(zoneDone === 1, `раскладка однократна: заходов ${zoneDone} (нужно ровно 1)`);
chk(dmg["рельеф"].length === 0, `рельеф после смертей равен источнику ` +
    `(разошлось ${dmg["рельеф"].length} байт из ${(256 - (S.RELIEF_HI || 0xE2)) * 64})`);
chk(dmg["кадры дайвера"].length === 0, `кадры дайвера после смертей равны источнику ` +
    `(разошлось ${dmg["кадры дайвера"].length} байт из 2048)`);
console.log(fail ? `ГЕЙТ КРАСНЫЙ: ${fail} из ${checks}` : `ГЕЙТ ЗЕЛЁНЫЙ: все ${checks} проверки`);
process.exit(fail ? 1 : 0);
