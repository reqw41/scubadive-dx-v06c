// ПЕРЕПОЛНЕНИЕ БУФЕРА ПУЛА: сторож в МОМЕНТ ЗАПИСИ, а не постфактум.
//
// Свидетельство с железа (образ 3a6a49c3): порча появляется С ПОЯВЛЕНИЕМ БОЛЬШОЙ
// АКУЛЫ и идёт парой столбцов слева по всей вертикали.
//
// Устройство, из-за которого это было возможно (`LB655`, scubacodb.asm):
// раздатчик буферов save-under выдавал ломоть в 48 байт, а буфер занимает
// (IY+$09)*(IY+$0A) байт — до 256 (лодка и акула 4x64, кальмар 3x64, рыба 3x56;
// замер poolfoot_probe.js, раздел 36 плана). Ровно этот размер и чистит цикл
// LB48D/LB48E, безусловно и без клипа.
//
// Раскладка после фикса — стоковая, только с другой базой:
//   индекс k -> ПОЛНАЯ СТРАНИЦА POOL_HI+k (0xA0+k под -DEVICT, иначе 0xB0+k);
//   индекс 0 — стейджинг, забронирован в LBEC7 навсегда; из остальных бронь
//   держит только 13 (BOAT_PAGE, кадр лодки) и только под -DBOATFAST.
// Мест 16, как в безвыселенной сборке, и любому типу хватает с запасом.
// Существо, которому пул буфера не дал, уходит по ШТАТНОЙ ветке «пул исчерпан»
// (бит 7 в (IX+$0D)): не рисуется, память не портится.
//
// Мера. Границы буфера не берутся из головы: у каждой выдачи читается база
// (IX+7)/(IX+8) и размер по шаблону, из них строится ТОЧНОЕ множество законных
// адресов. Писатели save-under КАЛИБРУЮТСЯ записями внутрь этого множества, и
// только их записи МИМО него считаются переполнением. Полные страницы (индексы
// 0 и 1) из проверки исключены намеренно: их младшие 0..191 лежат в видимом
// поле, туда законно пишут чистка и тайлы, и мера стала бы шире явления.
//
//   node tools/verify/pool_overflow_gate.js
//   PO_LEVELS=1,2,3,4   PO_SEEDS=0x0167,0x2B1D,0x77A3   PO_TICKS=1200
//   PO_INJECT=1  — выдать буферу ломоть 64 Б вместо страницы (младший байт 192):
//                  акула на 256 Б вылезет за него. Гейт обязан покраснеть —
//                  иначе он не мерит переполнения.
//   PO_BUDGET=1  — сузить бюджет: держать записи пула 4..15 занятыми. Существам
//                  буфера не хватит, страховка обязана сработать, и памяти это
//                  портить не должно (гейт остаётся зелёным).
//   PO_EMPTY=1   — обнулить выборку.
"use strict";
const fs = require("fs"), path = require("path");
const { readSym } = require("./harness.js");
const { reachGame, swim } = require("./drive.js");
const ROOT = path.resolve(__dirname, "../..");
const B = process.env.BUILD_DIR || "build";
const DIR = process.env.PO_DIR || `${ROOT}/${B}/ev`;
for (const f of ["scuba.rom", "scubacod1.sym"])
  if (!fs.existsSync(`${DIR}/${f}`)) { console.log(`нет ${DIR}/${f}`); process.exit(2); }
const S = readSym(`${DIR}/scubacod1.sym`);
for (const n of ["LB655_marked", "LB646", "LD9C0", "DiverObj", "i80_ldir_1", "LBFC3",
                 "LB646_none", "LB676", "POOL_HI"])
  if (S[n] == null) { console.log(`нет метки ${n} в .sym`); process.exit(2); }
const LEVELS = (process.env.PO_LEVELS || "1,4").split(",").map(Number);
const SEEDS = (process.env.PO_SEEDS || "0x0167,0x2B1D,0x77A3,0x0C55").split(",").map(x => Number(x));
const TICKS = Number(process.env.PO_TICKS || 900);
const INJECT = process.env.PO_INJECT === "1";
const BUDGET = process.env.PO_BUDGET === "1";
const EMPTY = process.env.PO_EMPTY === "1";

// Существа и их спрайтовые блоки — из таблицы записей, а не из головы.
const codb = fs.readFileSync(path.join(ROOT, "src8080", "scubacodb.asm"), "utf8").split("\n");
const CRE = [];
for (const l of codb) {
  const m = l.match(/^\s*DEFW\s+((?:L[0-9A-Fa-f]{4}\s*,\s*)+L[0-9A-Fa-f]{4})\s*;\s*(.+?)\s*$/);
  if (!m) continue;
  const ls = m[1].split(/\s*,\s*/);
  // ПРИНАДЛЕЖНОСТЬ ПО МЕТКЕ, А НЕ ПО ДИАПАЗОНУ min..max: у существа 4-6 указателей,
  // разбросанных по всему спрайтовому файлу.
  if ((ls.length === 4 || ls.length === 6) && ls.every(n => S[n] != null))
    for (const n of ls) CRE.push({ name: m[2], label: n, a0: S[n] });
}
// ШАБЛОНЫ ОБЛАСТИ LC092 и их габарит — статически, для отдельной проверки того,
// что НИ ОДИН буфер не крупнее выданной страницы. Раздатчик размера не знает, и
// вся раскладка держится на свойстве таблицы rows*rowsize <= 256: одна запись
// вида 5x64 сделала бы её ложной, а в выборку этот тип мог бы и не попасть.
const TPL = new Map();
for (let i = 0; i < codb.length; i++) {
  const m = codb[i].match(/^(LC[0-9A-Fa-f]{3})\s+DEFW/);
  if (!m || S[m[1]] == null) continue;
  let nm = (codb[i].match(/;\s*(.+?)\s*$/) || [])[1];
  if (!nm && codb[i + 1]) nm = (codb[i + 1].match(/;\s*(.+?)\s*$/) || [])[1];
  TPL.set(S[m[1]], nm || m[1]);
}

let allocs = 0, overflow = 0, inGame = false, noBuf = 0;
const allocList = []; let drawnAt = null, sharkAlloc = 0, sharkReads = 0;
const seenCre = new Set(), byIdx = new Map(), overShots = [];
const tplCheck = [];
const names = Object.entries(S).sort((a, b) => b[1] - a[1]);
const near = (pc) => { const e = names.find(([, v]) => v <= pc); return e ? `${e[0]}+${pc - e[1]}` : "?"; };

// ЗАКОННОЕ МНОЖЕСТВО АДРЕСОВ БУФЕРА и окно, в котором ищется выход за него.
// Буфер = полная страница, значит законное множество — она сама, а окно — весь
// дом пула: сосед по пулу и есть тот, кого портит вылет.
function bounds(hi, lo, size) {
  return { kind: "страница", idx: hi & 0x0f,
           ok: (a) => (a >> 8) === hi,
           win: (a) => (a >> 8) >= S.POOL_HI && (a >> 8) <= S.POOL_HI + 15 };
}

function run(level, seed) {
  const bufs = new Map();          // страница -> запись выдачи
  let cur = null;                  // буфер открытой сессии рисования
  const g = reachGame(`${DIR}/scuba.rom`, `${DIR}/scubacod1.sym`,
    { cpu: "i8080", level, seed, preHook: (m, SS) => {
      // ПОДСАДКИ СТАВЯТСЯ В ИЗМЕРЯЕМОЕ ОКНО, а не однажды до него (урок №2):
      // «ломоть» — на самой выдаче, суженный бюджет — каждый игровой тик, иначе
      // LBEC7 сотрёт его на постановке уровня.
      if (INJECT) m.onPc(SS.LB655_marked, () => {
        const ix = m.rd(SS.z80_ix) | (m.rd(SS.z80_ix + 1) << 8);
        m.wr(ix + 7, 192); });
      if (BUDGET) m.onPc(SS.LD9C0, () => {
        for (let i = 4; i < 16; i++) m.wr(SS.LB676 + i, 0x80); });
      // ЧТО ИМЕННО ВЫДАНО. Индекс берётся ИЗ АДРЕСА буфера тем же правилом, что
      // и в игре: младший полубайт старшего байта. База пула кратна 16
      // страницам, поэтому правило верно при любой базе.
      m.onPc(SS.LB655_marked, () => {
        allocs++;
        const ix = m.rd(SS.z80_ix) | (m.rd(SS.z80_ix + 1) << 8);
        const iy = m.rd(ix + 0x13) | (m.rd(ix + 0x14) << 8);
        const nm = iy === SS.LC102 ? "Shark" : iy === SS.LC092 ? "Boat" :
                   iy === SS.LC0A2 ? "Meduza" : iy === SS.LC0B2 ? "Round fish" :
                   (TPL.get(iy) || "0x" + iy.toString(16));
        if (iy === SS.LC0A2 || iy === SS.LC0B2) drawnAt = [m.rd(ix), m.rd(ix + 1)];
        if (nm === "Shark") sharkAlloc++;
        const lo = m.rd(ix + 7), hi = m.rd(ix + 8), base = hi * 256 + lo;
        const size = m.rd(iy + 9) * m.rd(iy + 10);
        const b = bounds(hi, lo, size);
        byIdx.set(b.idx, (byIdx.get(b.idx) || 0) + 1);
        const rec = { idx: b.idx, base, size, nm, kind: b.kind, b, out: 0, worst: null };
        bufs.set(hi, rec); allocList.push(rec);
      });
      // СТРАХОВКА: пул не дал буфера, существо в этот кадр не рисуется.
      m.onPc(SS.LB646_none, () => { noBuf++; });
      // СПАВН АКУЛЫ РЯДОМ С ДАЙВЕРОМ: возить дайвера через карту не нужно и не
      // получается (сцена по рецепту доходит до дна и акул не встречает).
      // Координаты берутся у того, кого РЕАЛЬНО рисуют, и вписываются в записи
      // акул: байты 0 и 1 записи — столбец и строка.
      // ПРИНАДЛЕЖНОСТЬ ЗАПИСИ — ПО ОТКРЫТОЙ СЕССИИ РИСОВАНИЯ, а не по окну
      // вокруг базы. Сессия начинается заходом в LB470: тогда известны и запись
      // существа (IX), и страница его буфера. ВСЁ, что сессия пишет в дом пула,
      // обязано лежать на этой странице; стейджинг-страница (индекс 0, бронь
      // LBEC7) законна всегда — в неё собирают спрайт другие тракты.
      // Окно вокруг базы здесь не годится принципиально: дом пула сплошной, и
      // соседняя страница — такой же буфер, поэтому «любая запись рядом» назвала
      // бы переполнением законную работу соседа (уроки №9 и №29).
      m.onPc(SS.LB470, () => {
        const ix = m.rd(SS.z80_ix) | (m.rd(SS.z80_ix + 1) << 8);
        const iy = m.rd(ix + 0x13) | (m.rd(ix + 0x14) << 8);
        cur = { page: m.rd(ix + 8), nm: TPL.get(iy) || "0x" + iy.toString(16) };
      });
      const o = m.memory.write.bind(m.memory);
      m.memory.write = (a, v, st) => { a &= 0xffff;
        if (!EMPTY && cur) { const pg = a >> 8;
          // Страница BOAT_PAGE (под -DBOATFAST) — не буфер существа, а собранный кадр
          // лодки: запись туда из блита лодки законна по построению (владелец, 2026-08-30).
          if (pg >= SS.POOL_HI && pg <= SS.POOL_HI + 15 && pg !== cur.page && pg !== SS.POOL_HI
              && !(SS.BOAT_PAGE != null && pg === (SS.BOAT_PAGE >> 8))) {
            overflow++;
            const r = bufs.get(cur.page); if (r) { r.out++; if (!r.worst) r.worst = a; }
            if (overShots.length < 6)
              overShots.push({ a, pc: m.cpu.pc & 0xffff, level, seed, nm: cur.nm, kind: "страница" });
          } }
        return o(a, v, st); }; } });
  let t = 0; g.m.onPc(S.LD9C0, () => { t++; inGame = true; });
  g.m.onPc(S.LD9C0, () => {                      // подсадка координат акулам
    if (t % 30 || !drawnAt) return;
    for (const nm of ["RecsAddrII", "RecsAddrIII", "RecsAddrIV"]) {
      const p = S[nm]; if (p == null) continue;
      const b = g.m.rd(p) | (g.m.rd(p + 1) << 8);
      for (let k = 0; k < 8; k++) { const r = b + k * 26;
        if ((g.m.rd(r + 19) | (g.m.rd(r + 20) << 8)) === S.LC102) {
          g.m.wr(r, drawnAt[0]); g.m.wr(r + 1, drawnAt[1]); } }
    }
  });
  g.m.onPc(S.i80_ldir_1, () => {
    const hl = g.m.cpu.hl() & 0xffff;
    let best = null;
    for (const c of CRE) if (c.a0 <= hl && (!best || c.a0 > best.a0)) best = c;
    if (best && hl - best.a0 < 256) { seenCre.add(best.name);
      if (best.name.indexOf("Shark") === 0) sharkReads++; }
  });
  if (!tplCheck.length)                          // габариты шаблонов — один раз
    for (const [a, n] of TPL) { const w = g.m.rd(a + 9), r = g.m.rd(a + 10);
      if (w && r && w < 16 && r <= 64) tplCheck.push({ a, n, w, r, size: w * r }); }
  swim(g, { passes: 1, frames: 20, noDeath: true });
  let q = 0; while (t < TICKS && q < 6000) { g.m.step(); q++; }
  return t;
}

let ticks = 0;
if (!EMPTY) for (const lvl of LEVELS) for (const sd of SEEDS) { inGame = false; ticks += run(lvl, sd); }

let fail = 0, checks = 0;
const chk = (ok, msg) => { checks++; if (ok) console.log("  ok      " + msg);
                           else { fail++; console.log("  ПРОВАЛ  " + msg); } };
console.log(`ПУЛ: ${DIR}, уровни ${LEVELS.join(",")}, сидов ${SEEDS.length}, тиков ${ticks}`);
console.log(`  существ в выборке: ${[...seenCre].join("; ") || "нет"}`);
console.log(`  чтений спрайтов акулы: ${sharkReads}, выдач буфера акуле: ${sharkAlloc}`);
console.log(`  выдач всего ${allocs}; страховок (пул не дал буфера) ${noBuf}`);
// СЦЕНА ОБЯЗАНА ДОВЕСТИ ДО АКУЛЫ, и это проверяется числом: без нарисованной
// акулы гейт мерил бы мелких существ, которым 48 Б хватает, и зеленел впустую.
// В режиме суженного бюджета акулу могут и не нарисовать — буфера не дали, и
// это ровно то, что проверяется. Тогда выборку держат другие числа: выдачи есть,
// страховка сработала.
const enough = BUDGET ? (allocs > 0 && noBuf > 0) : (sharkReads > 0 && sharkAlloc > 0);
if (EMPTY || !ticks || !enough) {
  console.log(`  ПРОВАЛ  ПУСТАЯ ВЫБОРКА: тиков ${ticks}, чтений акулы ${sharkReads}, ` +
              `выдач акуле ${sharkAlloc}, выдач всего ${allocs}, страховок ${noBuf}`);
  console.log("ГЕЙТ НЕДЕЙСТВИТЕЛЕН"); process.exit(2); }
const byKind = new Map();
for (const r of allocList) { const k = `${r.kind} индекс ${String(r.idx).padStart(2)}`;
  const e = byKind.get(k) || { n: 0, out: 0, who: new Set(), worst: null };
  e.n++; e.out += r.out; if (r.worst && !e.worst) e.worst = r.worst; e.who.add(r.nm);
  byKind.set(k, e); }
for (const [k, e] of [...byKind.entries()].sort())
  console.log(`      ${k}: выдач ${String(e.n).padStart(3)}, выходов за границы ${String(e.out).padStart(6)}` +
              `${e.worst ? " (первый 0x" + e.worst.toString(16) + ")" : ""}  ${[...e.who].join("/")}`);
for (const s of overShots)
  console.log(`      выход: 0x${s.a.toString(16)} из ${near(s.pc)} (${s.nm}, ${s.kind}, ур.${s.level})`);

const over = allocList.filter(r => r.out > 0);
chk(over.length === 0, `ни один буфер не вышел за свою страницу ` +
    `(переполнено буферов ${over.length}, выходов ${overflow})`);
// ГАБАРИТ ЛЮБОГО ШАБЛОНА ВЛЕЗАЕТ В СТРАНИЦУ — на ВСЕЙ таблице, а не только на
// попавших в выборку. На этом свойстве стоит вся раскладка пула.
const bad = tplCheck.filter(t => t.size > 256);
chk(tplCheck.length >= 15, `шаблонов в проверке габарита: ${tplCheck.length} (нужно >= 15)`);
chk(bad.length === 0, `буфер каждого шаблона влезает в страницу 256 Б (крупнее ${bad.length}` +
    (bad.length ? ": " + bad.map(t => `${t.n} ${t.w}x${t.r}=${t.size}`).join(", ") : "") + ")");
const worst = tplCheck.reduce((m2, t) => Math.max(m2, t.size), 0);
console.log(`  самый крупный шаблон: ${worst} Б из 256`);
if (BUDGET) chk(noBuf > 0, `суженный бюджет обязан включить страховку: срабатываний ${noBuf}`);
console.log(fail ? `ГЕЙТ КРАСНЫЙ: ${fail} из ${checks}` : `ГЕЙТ ЗЕЛЁНЫЙ: все ${checks} проверки`);
process.exit(fail ? 1 : 0);
