// LOCKSTEP-ГЕЙТ: потиковая сверка нашей i8080-сборки с эталонной Z80 (src_ref).
//
// Ось времени — ИГРОВОЙ ТИК (итерация главного цикла LD9C0), не кадр: сборки
// идут с разной скоростью, в кадрах они не совпадут никогда.
// Сверка идёт по ИМЕНАМ меток (адреса у сборок разные — рекомпиляция сдвинула
// карту), список переменных — в tools/verify/drive.js.
//
//   node tools/verify/lockstep.js [сценарий...]        все сценарии, если пусто
//   LOCKSTEP_INJECT=dX      негативный контроль: подсадить сдвиг X ныряльщика
//   LOCKSTEP_EMPTY=1        негативный контроль: пустая выборка должна ПРОВАЛИТЬ
"use strict";
const fs = require("fs");
const path = require("path");
const { reachGame, VARS, stateReader } = require("./drive.js");
const { SCENARIOS } = require("./oracle.js");

const ROOT = path.resolve(__dirname, "../..");
const REF = { rom: ROOT + "/build/src_ref/scuba.rom", sym: ROOT + "/build/src_ref/scubacod1.sym", cpu: "z80" };
const OUR = { rom: ROOT + "/build/src8080/scuba.rom", sym: ROOT + "/build/src8080/scubacod1.sym", cpu: "i8080" };

const INJECT = process.env.LOCKSTEP_INJECT || "";
const EMPTY = process.env.LOCKSTEP_EMPTY === "1";
const MAXTICKS = parseInt(process.env.LOCKSTEP_TICKS || "0", 10);

function runOne(build, sc, inject) {
  const rows = [];
  // Расписание ввода строится по НОМЕРУ ТИКА и применяется прямо в крючке
  // LD9C0. Иначе клавиша нажимается «когда счётчик тиков перевалил», а прогон
  // идёт целыми кадрами — и у более медленной сборки нажатие приходится на
  // другой тик. Ровно на этом сценарий turn и краснел на 301-м тике.
  const sched = [];
  for (const ph of sc.phases) for (let i = 0; i < ph.ticks; i++) sched.push(ph.keys || []);
  const total = MAXTICKS ? Math.min(sched.length, MAXTICKS) : sched.length;

  const preHook = (m, S) => {
    // читалку строим ПРЯМО ЗДЕСЬ: если ждать возврата reachGame, первые тики
    // окажутся потеряны, причём у сборок в РАЗНОМ количестве (reachGame добегает
    // до первого тика целыми кадрами, а кадр у нашей сборки «длиннее» по тикам),
    // и строки поедут — гейт покажет расхождение там, где его нет.
    const read = stateReader(m, S);
    const KL0 = S.KeyLine0, KL7 = S.KeyLine7;
    if (KL0 == null || KL7 == null) throw new Error("нет меток KeyLine0/KeyLine7 в .sym");
    let held = [];
    m.onPc(S.LD9C0, () => {
      const r = read();
      if (inject && rows.length === 50) r[inject] = (r[inject] + 1) & 0xff;   // подсадка дефекта
      rows.push(r);
      const keys = sched[rows.length - 1] || [];
      for (const k of held) if (!keys.includes(k)) m.key(k, false);
      for (const k of keys) if (!held.includes(k)) m.key(k, true);
      held = keys.slice();
      // Матрицу эмулятора игра увидит только после СЛЕДУЮЩЕГО прерывания, а
      // прерывание приходит раз в кадр — то есть у эталона раз в 3.5 тика, а у
      // нашей (медленной) сборки чаще чем раз в тик. Из-за этого одно и то же
      // нажатие доезжает до опроса клавиатуры на разных тиках, и сверка краснеет
      // на разнице СКОРОСТИ, а не логики. Поэтому дублируем нажатие прямо в
      // ячейки, которые заполняет KEYINT: игра видит клавишу ровно на том тике,
      // на котором её задало расписание.
      let l0 = 0xff, l7 = 0xff;
      for (const k of keys) {
        if (k === 37) l0 &= ~0x10; else if (k === 39) l0 &= ~0x40;
        else if (k === 38) l0 &= ~0x20; else if (k === 40) l0 &= ~0x80;
        else if (k === 13) l0 &= ~0x04; else if (k === 9) l0 &= ~0x01;
        else if (k === 32) l7 &= ~0x80;
      }
      m.wr(KL0, l0 & 0xff); m.wr(KL7, l7 & 0xff);
    });
  };
  const g = reachGame(build.rom, build.sym,
                      { cpu: build.cpu, level: sc.level, seed: sc.seed, preHook });
  let guard = 0;
  while (rows.length < total && guard < 400000) { g.m.step(); guard++; }
  if (guard >= 400000) throw new Error("тики встали на " + rows.length);
  return { rows, frames: g.m.frame, ticks: g.ticks };
}

function diff(name, a, b) {
  const n = Math.min(a.rows.length, b.rows.length);
  if (n === 0) return { ok: false, why: "ПУСТАЯ ВЫБОРКА: сверять нечего" };
  for (let i = 0; i < n; i++) {
    const x = a.rows[i], y = b.rows[i];
    const bad = Object.keys(x).filter(k => x[k] !== y[k]);
    if (bad.length) {
      const lines = [];
      lines.push(`РАСХОЖДЕНИЕ на тике ${i}, переменных ${bad.length}: ${bad.join(", ")}`);
      for (const k of bad) lines.push(`    ${k}: эталон=${x[k]}  наш=${y[k]}`);
      lines.push("    контекст (5 тиков до и после, только расходящиеся переменные):");
      for (let j = Math.max(0, i - 5); j < Math.min(n, i + 6); j++) {
        const mark = j === i ? ">>" : "  ";
        lines.push(`    ${mark} тик ${j}: ` + bad.map(k =>
          `${k} ${a.rows[j][k]}/${b.rows[j][k]}`).join("  "));
      }
      return { ok: false, why: lines.join("\n"), tick: i };
    }
  }
  // Равенства ДЛИН не требуем: прогон останавливается по целым кадрам, а кадр у
  // нашей (более медленной) сборки содержит меньше тиков — последний кадр даёт
  // разбег в 1-3 тика. Это артефакт стенда, а не расхождение игры.
  return { ok: true, n };
}

const names = process.argv.slice(2).filter(x => !x.startsWith("-"));
const list = names.length ? names : Object.keys(SCENARIOS);
let fails = 0, totalTicks = 0;
for (const name of list) {
  const sc = SCENARIOS[name];
  if (!sc) { console.log(`нет сценария ${name}`); fails++; continue; }
  const t = Date.now();
  const ref = runOne(REF, sc, "");
  const our = runOne(OUR, sc, INJECT);
  if (EMPTY) { ref.rows = []; our.rows = []; }
  const d = diff(name, ref, our);
  totalTicks += d.ok ? d.n : (d.tick || 0);
  const speed = `эталон ${ref.frames} кадров / наш ${our.frames} кадров = x${(our.frames / ref.frames).toFixed(2)}`;
  if (d.ok) {
    console.log(`ЗЕЛЁНЫЙ  ${name.padEnd(8)} ${String(d.n).padStart(6)} тиков совпали; ${speed}; ${((Date.now() - t) / 1000).toFixed(1)}с`);
  } else {
    fails++;
    console.log(`КРАСНЫЙ  ${name.padEnd(8)} ${speed}`);
    console.log("  " + d.why.split("\n").join("\n  "));
  }
}
console.log(`\nитог: сценариев ${list.length}, красных ${fails}, сверено тиков ${totalTicks}`);
if (totalTicks === 0 && fails === 0) {
  console.log("ГЕЙТ НЕДЕЙСТВИТЕЛЕН: выборка пуста, а он молчит");
  process.exit(2);
}
process.exit(fails ? 1 : 0);
