// РАЗВЕДКА (замер, ничего не правит): окупается ли скан «только живых» записей.
//
// Пять групп записей существ (I..V) обходятся циклами LBE40/LBE58/LBE6D/LBE85/
// LBE9A/LBEB2/LC431/LC45C. Гипотеза, которую надо проверить: часть записей —
// пустые слоты, и их можно не обходить.
//
// Скрипт умеет три режима:
//   census  — гистограмма «сколько записей в группе удовлетворяет предикату» на тик
//   wr0d    — сторож записи по байту состояния (+$0D) ВСЕХ записей всех групп:
//             множество PC, которые его пишут, с привязкой к ближайшей метке
//   cost    — такты по меткам обходчиков и число вызовов тел LB737/LB7BB на тик
//
//   sweep   — статическая перепись видимости по ВСЕМ 32x32 положениям экрана:
//             ныряльщик в стенде дальше поверхности не проходит, а координаты
//             записей (+$00,+$01) АБСОЛЮТНЫЕ, поэтому «сколько записей попадёт
//             в окно 24x24 при данном положении экрана» считается точно и без
//             прохождения игры
//
//   node tools/verify/livecensus.js <mode> <rom> <sym> [level=1] [ticks=3000]
"use strict";
const { reachGame } = require("./drive.js");
const { readSym } = require("./harness.js");
const { KEY } = require("./scenario.js");

const MODE = process.argv[2] || "census";
const ROM = process.argv[3], SYM = process.argv[4];
const LVL = parseInt(process.argv[5] || "1", 10);
const NT = parseInt(process.argv[6] || "3000", 10);

const S = readSym(SYM);

// ---- разметка групп записей -------------------------------------------------
// База группы V в исходнике нигде не хранится: LC431 идёт по группе IV и
// продолжает тем же указателем IX, значит V начинается сразу за IV.
function groups(m) {
  const n = { I: m.rd(S.NumRecsI), II: m.rd(S.NumRecsII), III: m.rd(S.NumRecsIII),
              IV: m.rd(S.NumRecsIV), V: m.rd(S.NumRecsV) };
  const b = { I: S.LC4F0, II: m.rdw(S.RecsAddrII), III: m.rdw(S.RecsAddrIII), IV: m.rdw(S.RecsAddrIV) };
  b.V = (b.IV + 26 * n.IV) & 0xffff;
  const sz = { I: 21, II: 26, III: 26, IV: 26, V: 28 };
  return ["I", "II", "III", "IV", "V"].map(k => ({ k, base: b[k], n: n[k], sz: sz[k] }));
}

// ---- ближайшая метка для PC (как в prof8080.js) -----------------------------
const labs = Object.entries(S).filter(([k, v]) => v >= 0x100 && v < 0xc000).sort((a, b) => a[1] - b[1]);
function proc(a) {
  let lo = 0, hi = labs.length - 1, x = null;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (labs[m][1] <= a) { x = labs[m]; lo = m + 1; } else hi = m - 1; }
  return x ? x[0] + (a === x[1] ? "" : "+" + (a - x[1])) : "?";
}

// ---- скриптованный ввод: держим разгон и вертим ныряльщика -------------------
// Без движения сцена статична и перепись врёт: экран не скроллится, объекты
// не входят и не выходят из окна 24x24.
function driver(m) {
  let held = new Set();
  const set = keys => {
    for (const k of held) if (!keys.includes(k)) m.key(k, false);
    for (const k of keys) if (!held.has(k)) m.key(k, true);
    held = new Set(keys);
  };
  // цикл: разгон вниз, поворот, разгон, поворот в другую сторону
  const plan = [[300, [KEY.UP]], [40, [KEY.LEFT, KEY.UP]], [300, [KEY.UP]],
                [40, [KEY.RIGHT, KEY.UP]], [200, [KEY.UP]], [60, [KEY.LEFT]],
                [300, [KEY.UP]], [60, [KEY.RIGHT, KEY.UP]]];
  let idx = 0, left = plan[0][0];
  set(plan[0][1]);
  return () => { if (--left <= 0) { idx = (idx + 1) % plan.length; left = plan[idx][0]; set(plan[idx][1]); } };
}

function fmt(a) { return "$" + (a & 0xffff).toString(16).toUpperCase().padStart(4, "0"); }
function stats(arr) {
  const s = [...arr].sort((x, y) => x - y);
  const sum = s.reduce((a, b) => a + b, 0);
  return { min: s[0], med: s[s.length >> 1], avg: sum / s.length, max: s[s.length - 1] };
}

// =============================================================================
if (MODE === "census") {
  const g = reachGame(ROM, SYM, { cpu: "i8080", level: LVL, seed: 0x0167 });
  const m = g.m;
  const G = groups(m);
  console.log(`=== перепись, уровень ${LVL}, ${NT} тиков ===`);
  for (const x of G) console.log(`  группа ${x.k}: база ${fmt(x.base)}, записей ${x.n}, размер ${x.sz}`);

  // предикаты-кандидаты на «запись жива»
  const PRED = {
    vis:  (m, a) => (m.rd(a + 0x0d) & 1) !== 0,          // бит 0 (+$0D): объект в окне 24x24, ставит LB5E0
    was:  (m, a) => (m.rd(a + 0x0d) & 2) !== 0,          // бит 1: был виден в прошлый раз
    buf:  (m, a) => m.rd(a + 0x08) !== 0,                // выделен буфер сохранения фона
    d0d:  (m, a) => m.rd(a + 0x0d) !== 0,                // байт состояния вообще ненулевой
    proc: (m, a) => (m.rd(a + 0x05) | m.rd(a + 0x06)) !== 0, // адрес процедуры движения не нулевой
    zero: (m, a, sz) => { for (let i = 0; i < sz; i++) if (m.rd(a + i)) return false; return true; },
    fire: (m, a) => m.rd(a + 0x0f) === 1,                // на этом проходе dec (+$0F) даст 0 => CALL LB737
  };
  const keys = Object.keys(PRED);
  const hist = {};                    // group -> pred -> array per tick
  for (const x of G) { hist[x.k] = {}; for (const p of keys) hist[x.k][p] = []; }
  const totVis = [], rows = [];
  // Смены статуса «виден/не виден» на тик — это ЧАСТОТА СОБЫТИЙ для гипотетического
  // списка живых: сколько раз за тик пришлось бы вставлять/удалять.
  const prevVis = {}, flips = { n: 0 };
  const periods = {};                 // group -> Map(значение +$0E -> сколько раз встречено)
  for (const x of G) periods[x.k] = new Map();
  // счётчики вызовов тел и обходчиков за тик
  const walkers = ["LBE40", "LBE58", "LBE6D", "LBE85", "LBE9A", "LBEB2", "LC431", "LC45C"];
  const wcnt = {}; for (const w of walkers) wcnt[w] = 0;
  let b737 = 0, b7bb = 0;
  for (const w of walkers) m.onPc(S[w], () => { wcnt[w]++; });
  m.onPc(S.LB737, () => { b737++; });
  m.onPc(S.LB7BB, () => { b7bb++; });

  let ticks = 0;
  const advance = driver(m);
  m.onPc(S.LD9C0, () => {
    ticks++; advance();
    let tv = 0;
    for (const x of G) {
      const c = {}; for (const p of keys) c[p] = 0;
      for (let i = 0; i < x.n; i++) {
        const a = (x.base + x.sz * i) & 0xffff;
        for (const p of keys) if (PRED[p](m, a, x.sz)) c[p]++;
        if (ticks % 100 === 0) { const e = m.rd(a + 0x0e); periods[x.k].set(e, (periods[x.k].get(e) || 0) + 1); }
        const v = m.rd(a + 0x0d) & 1;
        if (prevVis[a] !== undefined && prevVis[a] !== v) flips.n++;
        prevVis[a] = v;
      }
      for (const p of keys) hist[x.k][p].push(c[p]);
      tv += c.vis;
    }
    totVis.push(tv);
    rows.push(m.rd(S.L5B03 + 1));
  });
  let guard = 0;
  while (ticks < NT && guard < 4000000) { m.step(); guard++; }
  console.log(`  прогон: ${ticks} тиков, ${m.frame} кадров`);

  console.log("\n  доля записей, удовлетворяющих предикату (мин / медиана / среднее / макс, и % от всех):");
  console.log("  группа  всего  " + keys.map(k => k.padStart(22)).join(""));
  for (const x of G) {
    let line = "  " + x.k.padEnd(7) + String(x.n).padStart(5) + "  ";
    for (const p of keys) {
      const s = stats(hist[x.k][p]);
      line += `${s.min}/${s.med}/${s.avg.toFixed(1)}/${s.max} ${(100 * s.avg / x.n).toFixed(0)}%`.padStart(22);
    }
    console.log(line);
  }
  const sv = stats(totVis);
  const nAll = G.reduce((a, x) => a + x.n, 0);
  console.log(`\n  ВСЕГО записей ${nAll}; видимых на тик: мин ${sv.min}, медиана ${sv.med}, среднее ${sv.avg.toFixed(1)}, макс ${sv.max} (${(100 * sv.avg / nAll).toFixed(1)}%)`);
  const rh = {}; for (const r of rows) rh[r] = (rh[r] || 0) + 1;
  console.log("  распределение строки мини-карты (L5B03+1): " + Object.entries(rh).map(([k, v]) => `${k}:${v}`).join(" "));
  console.log("\n  вызовов на тик: " + walkers.map(w => `${w}=${(wcnt[w] / ticks).toFixed(2)}`).join(" "));
  console.log(`  тело LB737 (движение) = ${(b737 / ticks).toFixed(2)} вызовов/тик; тело LB7BB (перерисовка) = ${(b7bb / ticks).toFixed(2)} вызовов/тик`);
  console.log(`  смен бита видимости (+$0D бит 0): ${(flips.n / ticks).toFixed(3)} на тик — столько было бы вставок/удалений в списке живых`);
  console.log("  период перезарядки (+$0E), гистограмма значений:");
  for (const x of G) {
    const e = [...periods[x.k].entries()].sort((a, b) => a[0] - b[0]);
    const tot = e.reduce((a, b) => a + b[1], 0);
    console.log(`    ${x.k.padEnd(4)} ${e.map(([v, c]) => v + "x" + (100 * c / tot).toFixed(0) + "%").join(" ")}`);
  }
}

// =============================================================================
if (MODE === "sweep") {
  // Точная копия условия видимости из LB5E0:
  //   dx = (IX+$00) - lo(L5B0B);  x_out = !(dx<24 || (dx+(IY+$06))<24)
  //   dy = (IX+$01) - hi(L5B0B);  y_in  =  (dy<24 || (dy+(IY+$08))<24)
  //   bit0(IX+$0D) = y_in && !x_out
  // IY берётся из (IX+$13),(IX+$14) — дескриптор записи в области LC092.
  const g = reachGame(ROM, SYM, { cpu: "i8080", level: LVL, seed: 0x0167 });
  const m = g.m;
  const G = groups(m);
  // какие группы обходит LBDEA при данной строке мини-карты (см. LBDEA/LBDBA)
  const walkedBy = r => r < 3 ? ["I", "II"] : r === 3 ? ["II", "III"] : r < 6 ? ["III"]
                      : r < 9 ? ["III", "IV/2", "V/2"] : ["IV", "V"];
  const SAMPLES = [];
  let ticks = 0;
  const advance = driver(m);
  const snap = () => G.map(x => {
    const recs = [];
    for (let i = 0; i < x.n; i++) {
      const a = (x.base + x.sz * i) & 0xffff;
      const iy = m.rd(a + 0x13) | (m.rd(a + 0x14) << 8);
      recs.push({ c: m.rd(a), r: m.rd(a + 1), w: m.rd(iy + 6), h: m.rd(iy + 8) });
    }
    return { k: x.k, n: x.n, recs };
  });
  m.onPc(S.LD9C0, () => { ticks++; advance(); if (ticks % 300 === 0) SAMPLES.push(snap()); });
  let guard = 0;
  while (ticks < NT && guard < 4000000) { m.step(); guard++; }
  console.log(`=== статическая развёртка видимости, уровень ${LVL}, ${SAMPLES.length} снимков за ${ticks} тиков ===`);
  // per group: для каждого положения экрана (row,col) число видимых
  const perGroup = {}, perRow = {};
  for (const x of G) { perGroup[x.k] = []; }
  for (let r = 0; r < 32; r++) perRow[r] = { scanned: 0, vis: 0, samples: 0 };
  for (const S1 of SAMPLES) {
    for (const grp of S1) {
      for (let r = 0; r < 32; r++) for (let c = 0; c < 32; c++) {
        const ox = c * 8, oy = r * 8;
        let v = 0;
        for (const q of grp.recs) {
          const dx = (q.c - ox) & 255, dy = (q.r - oy) & 255;
          const xout = !(dx < 24 || ((dx + q.w) & 255) < 24);
          const yin = (dy < 24 || ((dy + q.h) & 255) < 24);
          if (yin && !xout) v++;
        }
        perGroup[grp.k].push(v);
      }
    }
  }
  console.log("  видимых записей в окне 24x24 по группам (по всем 1024 положениям экрана x снимкам):");
  console.log("  группа  всего   мин  медиана  среднее   макс   доля живых");
  for (const x of G) {
    const s = stats(perGroup[x.k]);
    console.log(`  ${x.k.padEnd(7)}${String(x.n).padStart(5)}${String(s.min).padStart(6)}${String(s.med).padStart(9)}${s.avg.toFixed(2).padStart(9)}${String(s.max).padStart(7)}      ${(100 * s.avg / x.n).toFixed(1)}%`);
  }
  // разрез: для каждой строки мини-карты — сколько записей СКАНИРУЕТСЯ и сколько ВИДНО
  console.log("\n  разрез по строке мини-карты (что обходит LBDEA, сколько записей сканируется, сколько видно):");
  const idxOf = {}; G.forEach((x, i) => idxOf[x.k] = i);
  for (let r = 0; r < 32; r++) {
    const wl = walkedBy(r);
    let scanned = 0, visAvg = 0;
    for (const wk of wl) {
      const half = wk.endsWith("/2");
      const k = wk.replace("/2", "");
      const gi = G[idxOf[k]];
      scanned += gi.n * (half ? 0.5 : 1);
      // среднее видимых для этой группы при экране в строке r (по всем колонкам и снимкам)
      let sum = 0, cntv = 0;
      for (let si = 0; si < SAMPLES.length; si++) {
        for (let c = 0; c < 32; c++) { sum += perGroup[k][si * 1024 + r * 32 + c]; cntv++; }
      }
      visAvg += (sum / cntv) * (half ? 0.5 : 1);
    }
    if (r === 0 || r === 3 || r === 4 || r === 6 || r === 9 || r === 20)
      console.log(`   строка ${String(r).padStart(2)}: обходит ${wl.join("+").padEnd(14)} сканируется ${scanned.toFixed(1).padStart(6)} записей, видимо в среднем ${visAvg.toFixed(2)} (${(100 * visAvg / scanned).toFixed(1)}%)`);
  }
}

// =============================================================================
if (MODE === "wr0d") {
  // Сторож: кто вообще пишет байты записей. Считаем отдельно по смещению в записи.
  const g = reachGame(ROM, SYM, { cpu: "i8080", level: LVL, seed: 0x0167 });
  const m = g.m;
  const G = groups(m);
  const byOff = new Map();    // "off:PC" -> count
  const off0d = new Map();    // PC -> count (только байт состояния +$0D)
  const offAll = new Map();   // PC -> Set(смещений)
  // Хелперы z80_* лежат выше $A800 и вызываются из игрового кода. Сам PC записи
  // внутри хелпера ничего не говорит — нужен ВЫЗЫВАЮЩИЙ. Держим последний PC,
  // который был в игровой области.
  const HELPER_LO = 0xa800;
  let lastGamePc = 0;
  const origCb = m.v06c.check_breakpoint;
  m.v06c.check_breakpoint = () => { const r = origCb(); const p = m.cpu.pc & 0xffff;
                                    if (p < HELPER_LO) lastGamePc = p; return r; };
  const site = new Map();     // "PC@caller" -> count, только для +$0D
  for (const x of G) {
    for (let i = 0; i < x.n; i++) {
      const a = (x.base + x.sz * i) & 0xffff;
      for (let j = 0; j < x.sz; j++) {
        const off = j;
        m.onWrite(a + j, (addr, val, pc) => {
          const k = off + ":" + pc;
          byOff.set(k, (byOff.get(k) || 0) + 1);
          if (!offAll.has(pc)) offAll.set(pc, new Set());
          offAll.get(pc).add(off);
          if (off === 0x0d) {
            off0d.set(pc, (off0d.get(pc) || 0) + 1);
            const s = pc >= HELPER_LO ? proc(pc) + " <- " + fmt(lastGamePc) + " " + proc(lastGamePc)
                                      : fmt(pc) + " " + proc(pc);
            site.set(s, (site.get(s) || 0) + 1);
          }
        });
      }
    }
  }
  let ticks = 0;
  const advance = driver(m);
  m.onPc(S.LD9C0, () => { ticks++; advance(); });
  let guard = 0;
  while (ticks < NT && guard < 4000000) { m.step(); guard++; }
  console.log(`=== сторож записи, уровень ${LVL}, ${ticks} тиков ===`);
  console.log("--- ПИСАТЕЛИ БАЙТА СОСТОЯНИЯ (+$0D) ---");
  for (const [pc, c] of [...off0d.entries()].sort((a, b) => b[1] - a[1]))
    console.log(`  ${fmt(pc)} ${proc(pc).padEnd(22)} ${String(c).padStart(9)} записей`);
  console.log("--- ТО ЖЕ, С РАСКРЫТИЕМ ХЕЛПЕРОВ ДО ВЫЗЫВАЮЩЕГО ---");
  for (const [s, c] of [...site.entries()].sort((a, b) => b[1] - a[1]))
    console.log(`  ${String(c).padStart(9)}  ${s}`);
  console.log("--- ВСЕ ПИСАТЕЛИ ПО СМЕЩЕНИЯМ (PC -> какие поля пишет) ---");
  for (const [pc, set] of [...offAll.entries()].sort((a, b) => a[0] - b[0]))
    console.log(`  ${fmt(pc)} ${proc(pc).padEnd(22)} поля: ${[...set].sort((a, b) => a - b).map(x => "+" + x.toString(16)).join(",")}`);
}

// =============================================================================
if (MODE === "cost") {
  // Такты по меткам, как prof8080, но с разбивкой ровно по обходчикам и телам.
  const g = reachGame(ROM, SYM, { cpu: "i8080", level: LVL, seed: 0x0167 });
  const m = g.m;
  const G = groups(m);
  const cyc = new Float64Array(0x10000), cnt = new Uint32Array(0x10000);
  let prev = -1, on = false;
  const orig = m.v06c.check_breakpoint;
  m.v06c.check_breakpoint = () => {
    const r = orig();
    if (on && prev >= 0) cyc[prev] += m.cpu.vcycles || 0;
    prev = m.cpu.pc & 0xffff;
    if (on) cnt[prev]++;
    return r;
  };
  let ticks = 0;
  const advance = driver(m);
  m.onPc(S.LD9C0, () => { ticks++; advance(); });
  const walkers = ["LBE40", "LBE58", "LBE6D", "LBE85", "LBE9A", "LBEB2", "LC431", "LC45C"];
  const wcnt = {}; for (const w of walkers) wcnt[w] = 0;
  for (const w of walkers) m.onPc(S[w], () => { wcnt[w]++; });
  on = true;
  let guard = 0, total = 0;
  while (ticks < NT && guard < 4000000) { m.step(); guard++; }
  const agg = new Map();
  for (let a = 0; a < 0x10000; a++) {
    if (!cnt[a]) continue;
    const p = proc(a).split("+")[0];
    agg.set(p, (agg.get(p) || 0) + cyc[a]);
    total += cyc[a];
  }
  console.log(`=== такты, уровень ${LVL}, ${ticks} тиков; ${(total / ticks).toFixed(0)} тактов/тик ===`);
  for (const x of G) console.log(`  группа ${x.k}: записей ${x.n}`);
  console.log("  вызовов на тик: " + walkers.map(w => `${w}=${(wcnt[w] / ticks).toFixed(2)}`).join(" "));
  const want = ["LBE40", "LBE48", "LBE48_adv", "LBE58", "LBE60", "LBE6D", "LBE75", "LBE75_adv",
                "LBE85", "LBE8D", "LBE9A", "LBEA2", "LBEA2_adv", "LBEB2", "LBEBA",
                "LC431", "LC439", "LC44C", "LC45C", "LC464", "LC474", "LB737", "LB7BB", "LB5E0", "LB470", "LB686"];
  let scan = 0;
  for (const w of want) {
    const c = agg.get(w) || 0;
    if (/^(LBE|LC4)/.test(w)) scan += c;
    console.log(`  ${String(Math.round(c / ticks)).padStart(6)} тактов/тик  ${(100 * c / total).toFixed(2).padStart(5)}%  ${w}`);
  }
  console.log(`  ИТОГО обходчики: ${Math.round(scan / ticks)} тактов/тик = ${(100 * scan / total).toFixed(2)}%`);
  console.log("--- ТОП-15 ---");
  for (const [p, c] of [...agg.entries()].sort((x, y) => y[1] - x[1]).slice(0, 15))
    console.log(`  ${String(Math.round(c / ticks)).padStart(6)} тактов/тик  ${(100 * c / total).toFixed(2).padStart(5)}%  ${p}`);
}
