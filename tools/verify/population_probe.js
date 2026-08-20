// НАСЕЛЕНИЕ НА ПЕРВОМ СТАРТЕ ПРОТИВ НАСЕЛЕНИЯ ПОСЛЕ СМЕРТИ.
//
// Наблюдение владельца на железе: «при первом запуске существ мало — долго плыл
// до акулы и осьминога; после смерти их резко стало больше».
//
// Вопрос: это стоковое поведение (население копится по ходу игры) или наша
// регрессия инициализации? Отвечает сверка ТРЁХ сборок на ОДНОМ сценарии:
//   наша (GEOM+ZONE+EVICT), безвыселенная ровесница (GEOM+ZONE), штатная
//   бесфлаговая. Если все три ведут себя одинаково — поведение стоковое.
//
// Окна равной длины и с ОДИНАКОВЫМ вводом:
//   A — первый старт: N тиков от первого игрового тика;
//   B — после гибели: N тиков от первого тика следующей постановки уровня.
//
// Меры на окно:
//   отрисовок       — заходов в LB470 (существо рисуется с save-under);
//   разных существ  — сколько РАЗНЫХ записей области LC4F0 отрисовано;
//   по типам        — отрисовки с разбивкой по шаблону (IY), включая акулу;
//   живых записей   — среднее и максимум за тик по флагам записей (бит 0 в
//                     (IX+$0D) — «на экране», бит 1 — «буфер выдан»);
//   выдач буфера    — LB655_marked, и страховок — LB646_none.
//
//   node tools/verify/population_probe.js
//   POP_TICKS=600  POP_LEVEL=1  POP_SEED=0x0167
"use strict";
const fs = require("fs"), path = require("path");
const { readSym } = require("./harness.js");
const { reachGame, KEY } = require("./drive.js");
const ROOT = path.resolve(__dirname, "../..");
const B = process.env.BUILD_DIR || "build";
const TICKS = Number(process.env.POP_TICKS || 600);
const LEVEL = Number(process.env.POP_LEVEL || 1);
const SEED = Number(process.env.POP_SEED || 0x0167);
const BUILDS = (process.env.POP_BUILDS || "ev,gzref,src8080").split(",");
const TITLE = { ev: "наша (GEOM+ZONE+EVICT)", gzref: "безвыселенная (GEOM+ZONE)",
                src8080: "штатная бесфлаговая" };

// Имена шаблонов — из исходника, чтобы «акула» была акулой, а не адресом.
const codb = fs.readFileSync(path.join(ROOT, "src8080", "scubacodb.asm"), "utf8").split("\n");
const TPL = new Map();
for (let i = 0; i < codb.length; i++) {
  const m = codb[i].match(/^(LC[0-9A-Fa-f]{3})\s+DEFW/);
  if (!m) continue;
  let nm = (codb[i].match(/;\s*(.+?)\s*$/) || [])[1];
  if (!nm && codb[i + 1]) nm = (codb[i + 1].match(/;\s*(.+?)\s*$/) || [])[1];
  TPL.set(m[1], nm || m[1]);
}

// ОДИН И ТОТ ЖЕ ВВОД В ОБОИХ ОКНАХ. Иначе сравнивались бы разные заплывы, а не
// разные моменты игры.
const PLAN = [[[KEY.DOWN], 120], [[KEY.DOWN, KEY.RIGHT], 200], [[KEY.RIGHT], 300],
              [[KEY.DOWN], 150], [[KEY.RIGHT], 300], [[KEY.UP, KEY.RIGHT], 150],
              [[KEY.RIGHT], 300]];

function census(m, S) {
  // ЗАПИСИ СУЩЕСТВ. Структура взята из объявлений scubacoda.asm, а не угадана:
  //   группа I   — 21-байтовые записи, начало LC4F0, счётчик NumRecsI;
  //   группы II..IV — 26-байтовые, начало в (RecsAddrII/III/IV);
  //   группа V   — 28-байтовые, отдельного адреса у неё нет, в счёт не берём.
  // Флаги записи — байт +$0D: бит 0 «на экране» (его переключает LB62D), бит 1
  // «буфер выдан» (по нему LB470 решает, чистить ли буфер).
  let onScr = 0, withBuf = 0, total = 0;
  const walk = (base, cnt, stride) => {
    for (let k = 0; k < cnt; k++) {
      const f = m.rd(base + k * stride + 0x0d); total++;
      if (f & 1) onScr++;
      if (f & 2) withBuf++;
    }
  };
  if (S.LC4F0 != null && S.NumRecsI != null) walk(S.LC4F0, m.rd(S.NumRecsI), 21);
  for (const [aName, nName] of [["RecsAddrII", "NumRecsII"], ["RecsAddrIII", "NumRecsIII"],
                                ["RecsAddrIV", "NumRecsIV"]]) {
    const p2 = S[aName], n = S[nName];
    if (p2 == null || n == null) continue;
    walk(m.rd(p2) | (m.rd(p2 + 1) << 8), m.rd(n), 26);
  }
  return { onScr, withBuf, total };
}

function measure(dir) {
  const S = readSym(`${dir}/scubacod1.sym`);
  for (const n of ["LB470", "LB655_marked", "LB646_none", "LD9C0", "PrepareGame",
                   "DiverObj", "LIVES", "z80_ix", "LC4F0", "NumRecsI"])
    if (S[n] == null) { console.log(`нет метки ${n} в ${dir}`); process.exit(2); }
  const tplAddr = new Map();                    // адрес шаблона -> имя
  for (const [lbl, nm] of TPL) if (S[lbl] != null) tplAddr.set(S[lbl], nm);

  let win = null;                               // текущее окно измерения
  const mk = () => ({ draws: 0, allocs: 0, none: 0, ticks: 0, who: new Set(),
                      byType: new Map(), onScr: 0, onScrMax: 0, buf: 0, bufMax: 0 });
  const g = reachGame(`${dir}/scuba.rom`, `${dir}/scubacod1.sym`,
    { cpu: "i8080", level: LEVEL, seed: SEED, preHook: (m, SS) => {
      m.onPc(SS.LB470, () => {
        if (!win) return;
        win.draws++;
        const ix = m.rd(SS.z80_ix) | (m.rd(SS.z80_ix + 1) << 8);
        const iy = m.rd(ix + 0x13) | (m.rd(ix + 0x14) << 8);
        win.who.add(ix);
        const nm = tplAddr.get(iy) || "0x" + iy.toString(16);
        win.byType.set(nm, (win.byType.get(nm) || 0) + 1);
      });
      m.onPc(SS.LB655_marked, () => { if (win) win.allocs++; });
      m.onPc(SS.LB646_none, () => { if (win) win.none++; });
    } });
  const S2 = g.S;
  const tickHook = () => {
    if (!win) return;
    win.ticks++;
    const c = census(g.m, S2);
    win.onScr += c.onScr; win.buf += c.withBuf;
    if (c.onScr > win.onScrMax) win.onScrMax = c.onScr;
    if (c.withBuf > win.bufMax) win.bufMax = c.withBuf;
    win.recs = c.total;
  };
  g.m.onPc(S2.LD9C0, tickHook);
  const hold = (keys, f) => { for (const k of keys) g.m.key(k, true);
    for (let i = 0; i < f; i++) g.m.step();
    for (const k of keys) g.m.key(k, false); for (let i = 0; i < 4; i++) g.m.step(); };
  const runWindow = () => {
    const w = mk(); win = w;
    w.rnd = S2.RANDOM != null ? (g.m.rd(S2.RANDOM) | (g.m.rd(S2.RANDOM + 1) << 8)) : -1;
    w.recs0 = census(g.m, S2).total;
    for (const [keys, f] of PLAN) { if (w.ticks >= TICKS) break; hold(keys, f); }
    let q = 0; while (w.ticks < TICKS && q < 4000) { g.m.step(); q++; }
    win = null; return w;
  };
  const A = runWindow();
  // КООРДИНАТЫ ЗАПИСЕЙ ДО ГИБЕЛИ. Байты 0 и 1 записи — столбец и строка мира.
  // Если они переживают гибель, «население» не строится заново, а продолжает
  // жить там, куда доплыло, — и это единственное, что может менять плотность
  // встреч по ходу партии.
  const coords = (m2) => {
    const out = [];
    const walk = (base, cnt, stride) => { for (let k = 0; k < cnt; k++)
      out.push((m2.rd(base + k * stride) << 8) | m2.rd(base + k * stride + 1)); };
    if (S2.LC4F0 != null) walk(S2.LC4F0, g.m.rd(S2.NumRecsI), 21);
    for (const [a2, n2] of [["RecsAddrII", "NumRecsII"], ["RecsAddrIII", "NumRecsIII"],
                            ["RecsAddrIV", "NumRecsIV"]]) {
      if (S2[a2] == null) continue;
      walk(m2.rd(S2[a2]) | (m2.rd(S2[a2] + 1) << 8), m2.rd(S2[n2]), 26); }
    return out;
  };
  const before = coords(g.m);
  // --- ГИБЕЛЬ И СЛЕДУЮЩАЯ ПОСТАНОВКА УРОВНЯ
  let prepared = false;
  g.m.onPc(S2.PrepareGame, () => { prepared = true; });
  g.m.wr(S2.LIVES, 3);
  for (let i = 0; i < 2600 && !prepared; i++) {
    if ((i & 63) === 0) g.m.wr(S2.DiverObj + 0x10, g.m.rd(S2.DiverObj + 0x10) | 0x20);
    g.m.step();
  }
  for (let i = 0; i < 60; i++) g.m.step();      // дать постановке доиграть
  const after = coords(g.m);
  let kept = 0;
  for (let i = 0; i < Math.min(before.length, after.length); i++) if (before[i] === after[i]) kept++;
  const Bw = runWindow();
  return { A, B: Bw, prepared, kept, keptOf: before.length };
}

const line = (tag, w) =>
  `    ${tag}: тиков ${String(w.ticks).padStart(4)}, отрисовок ${String(w.draws).padStart(5)}, ` +
  `разных существ ${String(w.who.size).padStart(3)}, живых записей сред. ` +
  `${(w.onScr / Math.max(1, w.ticks)).toFixed(1)} макс ${w.onScrMax}, с буфером сред. ` +
  `${(w.buf / Math.max(1, w.ticks)).toFixed(1)} макс ${w.bufMax}, выдач ${w.allocs}, ` +
  `страховок ${w.none}, записей на входе ${w.recs0}, RANDOM 0x${(w.rnd >>> 0).toString(16)}`;

console.log(`НАСЕЛЕНИЕ: уровень ${LEVEL}, сид 0x${SEED.toString(16)}, окно ${TICKS} тиков, ` +
            `ввод в обоих окнах одинаковый`);
const res = {};
for (const b of BUILDS) {
  const dir = `${ROOT}/${B}/${b}`;
  if (!fs.existsSync(`${dir}/scuba.rom`)) { console.log(`  нет ${dir}/scuba.rom — пропуск`); continue; }
  const r = measure(dir);
  res[b] = r;
  console.log(`  ${TITLE[b] || b} (${b}), записей существ на уровне ${r.A.recs}:`);
  console.log(line("A первый старт", r.A));
  console.log(line("B после смерти", r.B));
  const types = new Set([...r.A.byType.keys(), ...r.B.byType.keys()]);
  const rows = [...types].map(t => [t, r.A.byType.get(t) || 0, r.B.byType.get(t) || 0])
                         .sort((x, y) => (y[1] + y[2]) - (x[1] + x[2]));
  console.log(`      по типам (A / B): ` + rows.map(([t, a, b2]) => `${t} ${a}/${b2}`).join(", "));
  console.log(`      координаты записей пережили гибель: ${r.kept} из ${r.keptOf}`);
  if (!r.prepared) console.log("      ВНИМАНИЕ: постановка уровня после гибели не наступила");
}
// СВЕРКА СБОРОК: одинаково ли отношение B/A. Именно оно и есть предмет вопроса.
console.log("");
console.log("ОТНОШЕНИЕ B/A (после смерти против первого старта):");
for (const b of Object.keys(res)) {
  const r = res[b];
  const rat = (x, y) => (y ? (x / y).toFixed(2) : "-");
  console.log(`  ${(TITLE[b] || b).padEnd(26)} отрисовок ${rat(r.B.draws, r.A.draws)}, ` +
              `живых записей ${rat(r.B.onScr, r.A.onScr)}, разных существ ` +
              `${r.A.who.size} -> ${r.B.who.size}`);
}
