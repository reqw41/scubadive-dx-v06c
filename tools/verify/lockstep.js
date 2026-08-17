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
const { reachGame, VARS } = require("./drive.js");
const { SCENARIOS } = require("./oracle.js");

const ROOT = path.resolve(__dirname, "../..");
const REF = { rom: ROOT + "/build/src_ref/scuba.rom", sym: ROOT + "/build/src_ref/scubacod1.sym", cpu: "z80" };
const OUR = { rom: ROOT + "/build/src8080/scuba.rom", sym: ROOT + "/build/src8080/scubacod1.sym", cpu: "i8080" };

const INJECT = process.env.LOCKSTEP_INJECT || "";
const EMPTY = process.env.LOCKSTEP_EMPTY === "1";
const MAXTICKS = parseInt(process.env.LOCKSTEP_TICKS || "0", 10);

function runOne(build, sc, inject) {
  const rows = [];
  // Крючок вешаем ДО бута: иначе первые тики, которые reachGame тратит на выход
  // в игру, у сборок разные по числу, и строки поедут на 1-2 тика — сверка
  // покажет «расхождение» там, где его нет.
  let read = null;
  const preHook = (m, S) => {
    m.onPc(S.LD9C0, () => {
      if (!read) return;
      const r = read();
      if (inject && rows.length === 50) r[inject] = (r[inject] + 1) & 0xff;   // подсадка дефекта
      rows.push(r);
    });
  };
  const g = reachGame(build.rom, build.sym,
                      { cpu: build.cpu, level: sc.level, seed: sc.seed, preHook });
  read = g.read;
  let held = [];
  const setKeys = keys => {
    for (const k of held) if (!keys.includes(k)) g.m.key(k, false);
    for (const k of keys) if (!held.includes(k)) g.m.key(k, true);
    held = keys.slice();
  };
  for (const ph of sc.phases) {
    setKeys(ph.keys || []);
    const n = MAXTICKS ? Math.min(ph.ticks, MAXTICKS) : ph.ticks;
    const target = g.ticks + n;
    let guard = 0;
    while (g.ticks < target && guard < 300000) { g.m.step(); guard++; }
    if (guard >= 300000) throw new Error("тики встали на " + g.ticks);
  }
  setKeys([]);
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
  if (a.rows.length !== b.rows.length)
    return { ok: false, why: `разное число тиков: эталон ${a.rows.length}, наш ${b.rows.length}` };
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
