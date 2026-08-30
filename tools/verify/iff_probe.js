// ДИСЦИПЛИНА ПРЕРЫВАНИЙ: где и насколько долго игра идёт с закрытым IFF.
//
// Зачем. Единственный `ei` в хвосте DrawGameScr открывал прерывания за оба
// DI-контекста (Game и демо LEEAD) — в ЧУЖОМ файле и без пометки. Прежде чем
// делать пары DI/EI явными (и решать судьбу двух `ei ;HACK to make keyboard
// working`), нужно ЧИСЛО: сколько кадров подряд KEYINT не исполняется и какой
// IFF застаёт каждый из «хаков».
//
// ДВЕ МЕРЫ на каждой сцене:
//   1. РАЗРЫВ KEYINT в кадрах: обработчик прерывания зовётся раз в кадр, значит
//      разрыв = число кадров, в которые прерывание не пришло (IFF был снят).
//      Меряется по счётчику кадров стенда на попадании PC в KEYINT.
//   2. IFF В МОМЕНТ КАЖДОГО `ei ;HACK`: крючок ставится на АДРЕС САМОГО `ei`
//      (ReadKeyboard — это его первая инструкция; LE78C — метка прямо перед
//      вторым). Если ни в одной сцене IFF там не равен 0, снятие «хака» ничего
//      не меняет; если равен хотя бы раз — «хак» держит клавиатуру и остаётся.
//
// СЦЕНЫ (стенд без железа): меню до демо, демо (attract), игра ур.1, игра ур.4,
// гибель до game over и возврат в меню.
//
//   node tools/verify/iff_probe.js [каталог сборки=build/src8080]
"use strict";
const fs = require("fs"), path = require("path");
const { make, readSym } = require("./harness.js");
const { reachGame, KEY, swim } = require("./drive.js");

const ROOT = path.resolve(__dirname, "../..");
const DIR = process.argv[2] || `${ROOT}/${process.env.BUILD_DIR || "build"}/src8080`;
for (const f of ["scuba.rom", "scubacod1.sym", "scubacod0.sym"])
  if (!fs.existsSync(`${DIR}/${f}`)) { console.log(`нет ${DIR}/${f}`); process.exit(2); }
const S = Object.assign({}, readSym(`${DIR}/scubacod0.sym`), readSym(`${DIR}/scubacod1.sym`));
for (const n of ["KEYINT", "ReadKeyboard", "LE78C", "LEE2C", "LD9C0", "LIVES", "DiverObj"])
  if (S[n] == null) { console.log(`нет метки ${n} — мерить нечем`); process.exit(2); }

// Крупные вехи: по ним разрыв KEYINT привязывается к тракту, который его создал.
// Без этого «307 кадров без прерывания» — число без места.
const MARKS = ["Game", "PrepareMiniMap", "PrepareGame", "DrawGameScr", "PlayMelody",
               "LEEAD", "LEADE", "ClearScreen", "LD9C0"].filter(n => S[n] != null);

// Навешивает обе меры на готовый стенд. Возвращает объект-накопитель.
function meter(m) {
  const st = { keyHits: 0, maxGap: 0, gapFrame: -1, big: [], rk: [0, 0], le78c: [0, 0] };
  let last = -1, seen = ["бут"];
  for (const n of MARKS) m.onPc(S[n], () => { if (seen[seen.length - 1] !== n) seen.push(n); });
  m.onPc(S.KEYINT, () => {
    if (last >= 0) {
      const g = m.frame - last;
      // разрыв: кадр начала, длина, ВСЕ вехи, пройденные внутри окна закрытых
      // прерываний (крючки по PC срабатывают и при IFF=0 — стенд их не теряет)
      if (g > 20) st.big.push([last, g, seen.join(">")]);
      if (g > st.maxGap) { st.maxGap = g; st.gapFrame = last; }
    }
    last = m.frame; st.keyHits++; seen = [];
  });
  m.onPc(S.ReadKeyboard, () => { st.rk[m.cpu.iff ? 1 : 0]++; });
  m.onPc(S.LE78C, () => { st.le78c[m.cpu.iff ? 1 : 0]++; });
  return st;
}

function show(name, st, frames) {
  console.log(`${name.padEnd(18)} кадров ${String(frames).padStart(5)}  KEYINT ${String(st.keyHits).padStart(5)}` +
    `  макс. разрыв ${String(st.maxGap).padStart(4)} кадр(ов) с кадра ${String(st.gapFrame).padStart(5)}` +
    `  разрывов >20 кадров: ${st.big.length}` +
    `  ReadKeyboard IFF=0/1: ${st.rk[0]}/${st.rk[1]}` +
    `  LE78C IFF=0/1: ${st.le78c[0]}/${st.le78c[1]}`);
  if (st.big.length) for (const [f, g, k] of st.big.slice(0, 8))
    console.log(`      разрыв: кадр ${f}, длина ${g} кадр(ов), вехи внутри: ${k}`);
  return st;
}

const all = [];

// --- СЦЕНА 1+2+3: меню -> демо -> меню (тот же путь, что у attract_gate) -----
{
  const m = make(`${DIR}/scuba.rom`, { cpu: "i8080" });
  const st = meter(m);
  let demoIn = 0, demoOver = false, drawn = 0;
  m.onPc(S.LA193, () => { demoIn++; });
  m.onPc(S.LEE2C, () => { if (drawn) demoOver = true; });
  m.onPc(S.DrawGameScr, () => { if (demoIn) drawn++; });
  for (let i = 0; i < 300; i++) m.step();
  m.key(13, true); m.run(6); m.key(13, false);
  for (let i = 0; i < 600; i++) m.step();               // меню, демо ещё не пришло
  show("меню (простой)", st, m.frame);
  all.push(["меню", st.maxGap]);
  for (let i = 0; i < 3000 && drawn < 5; i++) m.step(); // дождаться демо
  for (let i = 0; i < 600; i++) m.step();               // покрутить демо
  if (!drawn) { console.log("ПРОВАЛ: демо не наступило"); process.exit(1); }
  show("меню+демо", st, m.frame);
  m.key(38, true); for (let i = 0; i < 200; i++) m.step(); m.key(38, false);
  for (let i = 0; i < 600 && !demoOver; i++) m.step();
  if (!demoOver) { console.log("ПРОВАЛ: из демо не вышли"); process.exit(1); }
  for (let i = 0; i < 300; i++) m.step();
  show("меню+демо+возврат", st, m.frame);
  all.push(["демо", st.maxGap]);
}

// --- СЦЕНЫ 4,5: игра ур.1 и ур.4 --------------------------------------------
for (const lvl of [1, 4]) {
  let st = null;
  const g = reachGame(`${DIR}/scuba.rom`, `${DIR}/scubacod1.sym`,
    { cpu: "i8080", level: lvl, seed: 0x0167, preHook: (m) => { st = meter(m); } });
  g.m.key(KEY.UP, true);
  for (let i = 0; i < 1500; i++) g.m.step();
  g.m.key(KEY.UP, false);
  show(`игра ур.${lvl}`, st, g.m.frame);
  all.push([`игра ур.${lvl}`, st.maxGap]);
}

// --- СЦЕНА 6: гибель -> game over -> меню ------------------------------------
{
  let st = null, backToMenu = 0;
  const g = reachGame(`${DIR}/scuba.rom`, `${DIR}/scubacod1.sym`,
    { cpu: "i8080", level: 1, seed: 0x0167, preHook: (m) => { st = meter(m); } });
  g.m.onPc(S.LEE2C, () => { backToMenu++; });
  // агония включается битом 5 в DiverObj+$10 (та же механика, что в drive.swim)
  g.m.wr(S.LIVES, 1);
  for (let i = 0; i < 6000 && !backToMenu; i++) {
    if ((i & 31) === 0) { g.m.wr(S.LIVES, 1); g.m.wr(S.DiverObj + 0x10, g.m.rd(S.DiverObj + 0x10) | 0x20); }
    g.m.step();
  }
  for (let i = 0; i < 300; i++) g.m.step();
  show("game over -> меню", st, g.m.frame);
  if (!backToMenu) console.log("  ВНИМАНИЕ: до меню не дошли — мера сцены неполная");
  all.push(["game over", st.maxGap]);
}

// --- СЦЕНА 7: полный заплыв (drive.swim) — восемь направлений, дно, поверхность,
// гибель и возрождение. Нужна ради LE78C: «газ» на поверхности в коротких сценах
// исполняется единицы раз, здесь — десятки.
{
  let st = null;
  const g = reachGame(`${DIR}/scuba.rom`, `${DIR}/scubacod1.sym`,
    { cpu: "i8080", level: 1, seed: 0x0167, preHook: (m) => { st = meter(m); } });
  swim(g, { passes: 2, frames: 30 });
  show("заплыв (swim)", st, g.m.frame);
  all.push(["заплыв", st.maxGap]);
}

const worst = all.reduce((a, b) => (b[1] > a[1] ? b : a));
console.log(`\nхудший разрыв KEYINT: ${worst[1]} кадр(ов) на сцене «${worst[0]}»`);
