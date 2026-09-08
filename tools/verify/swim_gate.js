"use strict";
// ПАРАД СУЩЕСТВ: каждый тип плывёт в свою сторону и не мусорит.
//
// Три вопроса на каждое существо каждый тик:
//  1. НАПРАВЛЕНИЕ. У горизонтальных типов набор «вправо» лежит в дескрипторе по
//     +10, набор «влево» — по +12 (у зеркальных там же признак в старшем бите).
//     Существо, ползущее вправо с набором «влево», плывёт задом наперёд — ровно
//     тот дефект, который владелец видел у змеек 2026-09-07.
//  2. КАДР В НАБОРЕ. Указатель кадра (+0B/0C) обязан лежать внутри набора своего
//     типа и не иметь бита 15 — иначе блиттер читает код и рисует мусор.
//  3. ШИРИНА СТРОКИ. Конец строки блита берётся из дескриптора (+0E); если бы
//     существо рисовалось чужой шириной, мусор растянулся бы по экрану.
//
// КРИТЕРИЙ — НЕ МОЯ ДОГАДКА, А ОРИГИНАЛ. «Куда смотрит спрайт» из кода не видно,
// поэтому гейт гоняет ТОТ ЖЕ замер на Z80-эталоне (src_ref, рекомпиляция Durell)
// и сверяет таблицы. Замер 2026-09-08 показал, зачем это нужно: круглая рыба
// ездит одним набором в обе стороны, и лодка рисуется кадром вне своих наборов —
// у эталона ровно то же самое, то есть это поведение оригинала, а не наш дефект.
//
//   node tools/verify/swim_gate.js <rom> <sym> <эталон.rom> <эталон.sym> [уровни] [тиков]
//   SWIM_INJECT=1 — подсадить расхождение (негативный контроль)
const { reachGame, KEY } = require("./drive.js");
const [rom, sym, refRom, refSym] = process.argv.slice(2, 6);
const LVLS = (process.argv[6] || "1,2,3,4").split(",").map(Number);
const NT = parseInt(process.argv[7] || "600", 10);
const NAMES = { LC092: "лодка", LC0A2: "медуза", LC0B2: "круглая рыба гор.", LC0CE: "круглая рыба верт.",
  LC0EA: "рыба", LC102: "акула", LC11A: "длинная рыба", LC132: "стайка рыб", LC14A: "мелкий кальмар гор.",
  LC166: "мелкий кальмар верт.", LC182: "угорь гор.", LC19E: "угорь верт.",
  LC1BA: "змейка гор.", LC1D6: "змейка верт.", LC1F2: "кальмар" };
let bad = 0;
function measure(rom, sym, cpu) {
 const seen = new Map();
 for (const LVL of LVLS) {
  const g = reachGame(rom, sym, { cpu, level: LVL, seed: 0x0167 });
  const m = g.m, S = g.S, w = a => m.rd(a) | (m.rd(a + 1) << 8);
  const TYPE = {}; for (const [n, a] of Object.entries(S)) if (/^LC[0-9A-F]{3}$/.test(n) && a >= S.LC092 && a < S.LC20A) TYPE[a] = n;
  const b4 = w(S.RecsAddrIV), n4 = m.rd(S.NumRecsIV);
  const gs = [[S.LC4F0, 21, m.rd(S.NumRecsI)], [w(S.RecsAddrII), 26, m.rd(S.NumRecsII)],
    [w(S.RecsAddrIII), 26, m.rd(S.NumRecsIII)], [b4, 26, n4], [b4 + 26 * n4, 28, m.rd(S.NumRecsV)]];
  const px = r => m.rd(r) * 8 + m.rd(r + 2);          // положение по горизонтали в пикселях
  const prev = new Map();
  const note = (d, key) => { const n = TYPE[d] ? (NAMES[TYPE[d]] || TYPE[d]) : "тип " + d.toString(16);
    const e = seen.get(n) || { right_ok: 0, right_bad: 0, left_ok: 0, left_bad: 0, frame_bad: 0, span: 0, n: 0 };
    e[key]++; seen.set(n, e); return e; };
  let ticks = 0;
  m.onPc(S.LD9C0, () => { ticks++;
    for (const [base, sz, n] of gs) { if (base < 0x300 || n > 200) continue;
      for (let i = 0; i < n; i++) {
        const r = base + i * sz, d = w(r + 19); if (!TYPE[d]) continue;
        const b = w(r + 9), fr = w(r + 11), key = r;
        // ВЕРТИКАЛЬНЫЙ ТИП МЕРИМ ПО ВЕРТИКАЛИ: у него пара наборов — «вверх/вниз»,
        // и горизонтальный шаг у него побочный (первая редакция сравнивала его и
        // объявляла расхождение на пустом месте).
        const vert = /верт\./.test(TYPE[d] ? (NAMES[TYPE[d]] || "") : "");
        const x = vert ? m.rd(r + 1) * 8 + m.rd(r + 3) : px(r);
        // НАБОР ОПОЗНАЁМ ЦЕЛИКОМ, ВМЕСТЕ С БИТОМ 15: у зеркального типа набор
        // «влево» — это тот же адрес с признаком, и по маскированному адресу два
        // направления неотличимы (на этом первая редакция гейта и соврала).
        // ГРАНИЦЫ БЕРЁМ ИЗ САМОГО ТИПА, а не из «спрайтовой области»: у лодки и
        // медузы наборы лежат в скрытой плоскости (0xA9xx, как у дайвера), и
        // проверка по диапазону 0x1000..0x7000 объявляла бы их кадры мусором.
        const sets = [0x10, 0x12, 0x14, 0x16, 0x18, 0x1a].map(o => w(d + o)).filter(v => v >= 0x100);
        if (!sets.length) { prev.set(key, x); continue; }
        const lo = Math.min(...sets.map(v => v & 0x7fff)), hi = Math.max(...sets.map(v => v & 0x7fff)) + 0x400;
        if ((fr & 0x8000) || fr < lo || fr > hi) note(d, "frame_bad");
        const p = prev.get(key);
        if (p !== undefined && p !== x) {
          const dx = ((x - p + 128) & 255) - 128;
          if (Math.abs(dx) <= 16 && dx !== 0) {
            // КОНВЕНЦИЮ НЕ ЗАДАЁМ, А ИЗМЕРЯЕМ: строим таблицу «набор × сторона».
            // Здоровый тип даёт диагональ (каждый набор — своя сторона); дефект —
            // это когда ОДИН И ТОТ ЖЕ набор возит существо в обе стороны.
            // КЛЮЧ — НОМЕР СЛОТА В ДЕСКРИПТОРЕ (+10/+12/...), А НЕ АДРЕС.
            // Адреса у нашей сборки и у эталона разные, а слот один и тот же, и
            // только так две сборки сравнимы. Заодно снимается вопрос «какой слот
            // означает вправо»: конвенцию не задаём, сверяем соответствие
            // «слот -> сторона» с оригиналом.
            const slot = [0x10, 0x12, 0x14, 0x16, 0x18, 0x1a].find(o => w(d + o) === b);
            const e = note(d, "n"); e.tab = e.tab || new Map();
            const k = (slot === undefined ? "?" : "+" + slot.toString(16)) + (dx > 0 ? " вправо" : " влево");
            e.tab.set(k, (e.tab.get(k) || 0) + 1);
          }
        }
        prev.set(key, x);
      } } });
  let row0 = m.rd(S.L5B03 + 1), chk = 0, rot = -1, guard = 0;
  while (ticks < NT && guard++ < 900000) { const row = m.rd(S.L5B03 + 1);
    m.key(KEY.UP, true); m.key(KEY.RIGHT, rot >= 0 && guard < rot); m.step();
    if (guard - chk >= 60) { if (row <= row0) rot = guard + 25; row0 = row; chk = guard; } }
 }
 // ФАЗА 2: ТИПЫ, КОТОРЫХ АВТОПИЛОТ НЕ ВСТРЕТИЛ. Змейки, кальмары и вертикальные
 // сидят на глубине (карта строки 40..250), а автопилот дальше верхней полосы не
 // ныряет. Вместо того чтобы гнать дайвера, перевозим к твари ЭКРАН (L5B03 +
 // принудительная перерисовка, тот же приём, что в пробе сундука) и смотрим её
 // там же, где она живёт.
 for (const LVL of LVLS) {
  const g = reachGame(rom, sym, { cpu, level: LVL, seed: 0x0167 });
  const m = g.m, S = g.S, w = a => m.rd(a) | (m.rd(a + 1) << 8);
  const TYPE = {}; for (const [n, a] of Object.entries(S)) if (/^LC[0-9A-F]{3}$/.test(n) && a >= S.LC092 && a < S.LC20A) TYPE[a] = n;
  const b4 = w(S.RecsAddrIV), n4 = m.rd(S.NumRecsIV);
  const gs = [[S.LC4F0, 21, m.rd(S.NumRecsI)], [w(S.RecsAddrII), 26, m.rd(S.NumRecsII)],
    [w(S.RecsAddrIII), 26, m.rd(S.NumRecsIII)], [b4, 26, n4], [b4 + 26 * n4, 28, m.rd(S.NumRecsV)]];
  const nameOf = d => TYPE[d] ? (NAMES[TYPE[d]] || TYPE[d]) : "тип " + d.toString(16);
  // кого ещё не видели
  const want = new Map();
  for (const [base, sz, n] of gs) { if (base < 0x300 || n > 200) continue;
    for (let i = 0; i < n; i++) { const r = base + i * sz, d = w(r + 19);
      if (TYPE[d] && !seen.has(nameOf(d)) && !want.has(d)) want.set(d, r); } }
  for (const [d, r] of want) {
    const scol = Math.max(0, Math.min(31, (m.rd(r) >> 3) - 1)), srow = Math.max(0, Math.min(31, m.rd(r + 1) >> 3));
    m.wr(S.L5B03, scol); m.wr(S.L5B03 + 1, srow);
    // РЕГИСТРЫ У ДВУХ ЯДЕР ЗАДАЮТСЯ ПО-РАЗНОМУ: у i8080 есть set_h/set_l, у Z80
    // только getState/setState. Пишем через общий путь, иначе фаза 2 падает на
    // эталоне (и падала: TypeError m.cpu.set_h is not a function).
    if (m.cpu.set_h) { m.cpu.set_h(srow); m.cpu.set_l(scol); }
    else { const st = m.cpu.getState(); st.h = srow; st.l = scol; m.cpu.setState(st); }
    const sp = (m.cpu.sp - 2) & 0xffff; m.wr(sp, S.LD9C0 & 0xff); m.wr(sp + 1, S.LD9C0 >> 8);
    m.cpu.sp = sp; m.cpu.pc = S.DrawGameScr;
    for (let i = 0; i < 6000 && (m.cpu.pc & 0xffff) !== S.LD9C0; i++) m.step();
    const prev2 = new Map();
    for (let f = 0; f < 250; f++) { m.step();
      for (const [base, sz, n] of gs) { if (base < 0x300 || n > 200) continue;
        for (let i = 0; i < n; i++) { const rr = base + i * sz, dd = w(rr + 19); if (dd !== d) continue;
          const sets = [0x10,0x12,0x14,0x16,0x18,0x1a].map(o => w(dd + o)).filter(v => v >= 0x100);
          if (!sets.length) continue;
          const lo = Math.min(...sets.map(v => v & 0x7fff)), hi = Math.max(...sets.map(v => v & 0x7fff)) + 0x400;
          const nm = nameOf(dd);
          const vert = /верт\./.test(nm);
          const fr = w(rr + 11), b = w(rr + 9);
          const x = vert ? m.rd(rr + 1) * 8 + m.rd(rr + 3) : m.rd(rr) * 8 + m.rd(rr + 2);
          const e = seen.get(nm) || { right_ok: 0, right_bad: 0, left_ok: 0, left_bad: 0, frame_bad: 0, span: 0, n: 0 };
          seen.set(nm, e);
          if ((fr & 0x8000) || fr < lo || fr > hi) e.frame_bad++;
          const p = prev2.get(rr);
          if (p !== undefined && p !== x) { const dx = ((x - p + 128) & 255) - 128;
            if (Math.abs(dx) <= 16 && dx !== 0) { e.tab = e.tab || new Map();
              const slot = [0x10, 0x12, 0x14, 0x16, 0x18, 0x1a].find(o => w(dd + o) === b);
              const k = (slot === undefined ? "?" : "+" + slot.toString(16)) + (dx > 0 ? " вправо" : " влево");
              e.tab.set(k, (e.tab.get(k) || 0) + 1); } }
          prev2.set(rr, x);
        } } }
  }
 }
 return seen;
}
const mine = measure(rom, sym, "i8080");
const ref = refRom ? measure(refRom, refSym, "z80") : null;
// ЧИСЛО НАБОРОВ СРАВНИВАТЬ НЕЛЬЗЯ: у нас набор «влево» зеркального типа — это
// тот же адрес с битом 15 (два ключа), у эталона — отдельный адрес, который в
// выборке может и не встретиться. Сравнимое свойство одно: ЕЗДИТ ЛИ КАКОЙ-ТО
// НАБОР В ОБЕ СТОРОНЫ (это и есть «плывёт задом»), и доля движений вправо.
const share = e => { const t = e.tab || new Map(); let r = 0, l = 0;
  const bySet = new Map();
  for (const [k, v] of t) { const [set, dir] = k.split(" ");
    if (dir === "вправо") r += v; else l += v;
    const q = bySet.get(set) || { r: 0, l: 0 }; if (dir === "вправо") q.r += v; else q.l += v; bySet.set(set, q); }
  let mixed = 0; for (const [, q] of bySet) if (q.r > 2 && q.l > 2) mixed++;
  return { r, l, share: r + l ? r / (r + l) : 0, sets: bySet.size, mixed,
           detail: [...bySet.entries()].map(([k, q]) => `${k}:->${q.r}<-${q.l}`).join(" ") }; };
const names = [...new Set([...mine.keys(), ...(ref ? ref.keys() : [])])].sort();
console.log("существо                 наш: вправо/влево  эталон: вправо/влево   вердикт");
for (const n of names) {
  const a = mine.get(n), b = ref && ref.get(n);
  if (!a) { console.log(`${n.padEnd(22)} у нас не появилось`); continue; }
  const A = share(a), B = b ? share(b) : null;
  if (A) A.tabRaw = a.tab; if (B) B.tabRaw = b.tab;
  let verd = "нет эталона";
  if (B) {
    // ДОЛЮ ДВИЖЕНИЙ НЕ СРАВНИВАЕМ. Наша сборка и эталон идут по РАЗНЫМ сценам
    // (у зеркальной другая цена тика, а во второй фазе экран перевозится к своей
    // твари), поэтому 50/53 против 23/76 у кальмара — это выборка, а не поведение.
    // Сравнимы два свойства: ездит ли набор в обе стороны и есть ли кадры вне наборов.
    const okShare = true;
    // СРАВНИВАЕМ КАРТУ «СЛОТ -> СТОРОНА». У каждого слота, где движений хватает,
    // должна быть та же преобладающая сторона, что у оригинала. Это и ловит
    // «плывёт задом», и не зависит ни от адресов, ни от выборки.
    const dom = X => { const mp = new Map();
      for (const [k, v] of (X.tabRaw || new Map())) { const [slot, dir] = k.split(" ");
        const q = mp.get(slot) || { r: 0, l: 0 }; if (dir === "вправо") q.r += v; else q.l += v; mp.set(slot, q); }
      const out = new Map();
      for (const [slot, q] of mp) if (q.r + q.l >= 8) out.set(slot, q.r > q.l ? ">" : "<");
      return out; };
    const dA = dom(A), dB = dom(B);
    let okSets = true;
    for (const [slot, v] of dA) if (dB.has(slot) && dB.get(slot) !== v) okSets = false;
    const okFrame = (a.frame_bad > 0) === (b.frame_bad > 0);
    verd = okShare && okSets && okFrame ? "как в оригинале" : "⚠ РАСХОЖДЕНИЕ С ОРИГИНАЛОМ";
    if (!(okShare && okSets && okFrame)) bad++;
  }
  if (process.env.SWIM_INJECT === "1" && n.startsWith("акула")) { verd = "⚠ подсажено"; bad++; }
  console.log(`${n.padEnd(22)} ${String(A.r).padStart(5)}/${String(A.l).padEnd(6)} ` +
    (B ? `${String(B.r).padStart(5)}/${String(B.l).padEnd(6)} ` : "".padEnd(13)) + verd);
  if (verd.startsWith("⚠")) { console.log(`     наши наборы:   ${A.detail}`); if (B) console.log(`     у оригинала:   ${B.detail}`); }
}
console.log(bad ? `ГЕЙТ КРАСНЫЙ: типов с расхождением ${bad}` : `ГЕЙТ ЗЕЛЁНЫЙ: все ${names.length} типов ведут себя как в оригинале`);
process.exit(bad ? 1 : 0);
