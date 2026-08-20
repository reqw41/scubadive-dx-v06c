// ГЕЙТ ПОЛНОТЫ: СТОЛЬКО ЖЕ СУЩЕСТВ, СТОЛЬКО ЖЕ БУФЕРОВ, НОЛЬ СТРАХОВОК.
//
// Зачем он есть (урок №30). Набор из полусотни зелёных вердиктов был зелёным
// ровно тогда, когда в образе жила регрессия ёмкости пула: раздатчик выдавал
// крупным четвёрки ломтей, мест стало 6 вместо 16, страховка «пул исчерпан»
// срабатывала 19 раз за прогон против НУЛЯ у безвыселенной сборки. Следствия
// владелец видел на железе: существ подозрительно мало (буфера не дали — не
// рисуем) и спрайты перестают стираться после смерти (буфера нет — фон под
// существом восстанавливать нечем).
//
// Ни один прежний гейт этого не ловил: все они проверяют ЦЕЛОСТЬ («не испорчено
// ли то, что есть»), и ни один не проверял ПОЛНОТУ («появилось ли всё, что
// должно»). Эта мера — самая дешёвая из полнотных: КОЛИЧЕСТВА на одном сценарии
// против эталонной (безвыселенной) сборки.
//
// Меры (обе сборки, одна и та же сцена, DET=1):
//   выдач буфера      — попадания в LB655_marked;
//   отрисовок существ — заходы в LB470 (рисование с save-under);
//   страховок         — попадания в LB646_none («пул исчерпан», существо не
//                       рисуется). У обеих сборок обязан быть НОЛЬ;
//   пик занятости     — максимум одновременно занятых записей таблицы LB676.
//
//   node tools/verify/pool_capacity_gate.js
//   CAP_LEVELS=1,4  CAP_SEEDS=0x0167  CAP_TICKS=900
//   CAP_INJECT=1 — сузить бюджет: держать записи пула 4..15 занятыми. Страховка
//                  обязана сработать, гейт — покраснеть.
//   CAP_EMPTY=1  — обнулить выборку. Гейт обязан покраснеть.
"use strict";
const fs = require("fs"), path = require("path");
const { readSym } = require("./harness.js");
const { reachGame, swim } = require("./drive.js");
const ROOT = path.resolve(__dirname, "../..");
const B = process.env.BUILD_DIR || "build";
const OURS = process.env.CAP_DIR || `${ROOT}/${B}/ev`;
const REF = process.env.CAP_REF || `${ROOT}/${B}/gzref`;
for (const d of [OURS, REF]) for (const f of ["scuba.rom", "scubacod1.sym"])
  if (!fs.existsSync(`${d}/${f}`)) {
    console.log(`нет ${d}/${f} — собери DET=1 GEOM=1 ZONE=1 EVICT=1 и без EVICT`); process.exit(2); }
const LEVELS = (process.env.CAP_LEVELS || "1,4").split(",").map(Number);
const SEEDS = (process.env.CAP_SEEDS || "0x0167,0x2B1D").split(",").map(Number);
const TICKS = Number(process.env.CAP_TICKS || 900);
const INJECT = process.env.CAP_INJECT === "1";
const EMPTY = process.env.CAP_EMPTY === "1";

function run(dir, level, seed, inject) {
  const S = readSym(`${dir}/scubacod1.sym`);
  for (const n of ["LB655_marked", "LB646_none", "LB470", "LB676", "LD9C0"])
    if (S[n] == null) { console.log(`нет метки ${n} в ${dir}`); process.exit(2); }
  const st = { allocs: 0, draws: 0, none: 0, peak: 0, ticks: 0, busy: 0 };
  const occ = new Array(16).fill(false);
  const g = reachGame(`${dir}/scuba.rom`, `${dir}/scubacod1.sym`,
    { cpu: "i8080", level, seed, preHook: (m, SS) => {
      m.onPc(SS.LB655_marked, () => { st.allocs++; });
      m.onPc(SS.LB470, () => { st.draws++; });
      m.onPc(SS.LB646_none, () => { st.none++; });
      const o = m.memory.write.bind(m.memory);
      m.memory.write = (a, v, s2) => { a &= 0xffff;
        if (a >= SS.LB676 && a < SS.LB676 + 16) {
          const i = a - SS.LB676, now = (v & 0x80) !== 0;
          if (now !== occ[i]) { occ[i] = now; st.busy += now ? 1 : -1;
            if (st.busy > st.peak) st.peak = st.busy; }
        }
        return o(a, v, s2); }; } });
  // СУЖЕНИЕ БЮДЖЕТА накладывается КАЖДЫЙ тик, а не однажды: LBEC7 чистит таблицу
  // на постановке уровня, и однократная подсадка была бы стёрта до измерения
  // (урок №2).
  g.m.onPc(g.S.LD9C0, () => { st.ticks++;
    if (inject) for (let i = 4; i < 16; i++) g.m.wr(g.S.LB676 + i, 0x80); });
  swim(g, { passes: 2, frames: 30 });
  let q = 0; while (st.ticks < TICKS && q < 40000) { g.m.step(); q++; }
  return st;
}

const sum = { ours: { allocs: 0, draws: 0, none: 0, peak: 0, ticks: 0 },
              ref: { allocs: 0, draws: 0, none: 0, peak: 0, ticks: 0 } };
if (!EMPTY) for (const lvl of LEVELS) for (const sd of SEEDS) {
  const a = run(OURS, lvl, sd, INJECT), b = run(REF, lvl, sd, false);
  for (const k of ["allocs", "draws", "none", "ticks"]) { sum.ours[k] += a[k]; sum.ref[k] += b[k]; }
  sum.ours.peak = Math.max(sum.ours.peak, a.peak); sum.ref.peak = Math.max(sum.ref.peak, b.peak);
  console.log(`  уровень ${lvl} сид 0x${sd.toString(16)}: наша выдач ${a.allocs} отрисовок ${a.draws} ` +
              `страховок ${a.none} пик ${a.peak} | эталон выдач ${b.allocs} отрисовок ${b.draws} ` +
              `страховок ${b.none} пик ${b.peak}`);
}

let fail = 0, checks = 0;
const chk = (ok, msg) => { checks++; if (ok) console.log("  ok      " + msg);
                           else { fail++; console.log("  ПРОВАЛ  " + msg); } };
console.log(`ПОЛНОТА ПУЛА: наша ${OURS}, эталон ${REF}, уровней ${LEVELS.length}, сидов ${SEEDS.length}`);
console.log(`  наша:   тиков ${sum.ours.ticks}, выдач ${sum.ours.allocs}, отрисовок ${sum.ours.draws}, ` +
            `страховок ${sum.ours.none}, пик занятости ${sum.ours.peak}/16`);
console.log(`  эталон: тиков ${sum.ref.ticks}, выдач ${sum.ref.allocs}, отрисовок ${sum.ref.draws}, ` +
            `страховок ${sum.ref.none}, пик занятости ${sum.ref.peak}/16`);
// ПУСТАЯ ВЫБОРКА НЕДЕЙСТВИТЕЛЬНА: без тиков, без выдач и без отрисовок сверять
// нечего, и молчаливый зелёный тут — худший из исходов.
if (EMPTY || !sum.ours.ticks || !sum.ref.ticks || !sum.ours.allocs || !sum.ref.allocs ||
    sum.ours.draws < 100 || sum.ref.draws < 100) {
  console.log(`  ПРОВАЛ  ПУСТАЯ ВЫБОРКА: тиков ${sum.ours.ticks}/${sum.ref.ticks}, ` +
              `выдач ${sum.ours.allocs}/${sum.ref.allocs}, отрисовок ${sum.ours.draws}/${sum.ref.draws}`);
  console.log("ГЕЙТ НЕДЕЙСТВИТЕЛЕН"); process.exit(2); }
chk(sum.ref.none === 0, `у эталона страховка не срабатывает: ${sum.ref.none}`);
chk(sum.ours.none === 0, `у нашей сборки страховка не срабатывает: ${sum.ours.none} ` +
    `(регрессия ёмкости выглядела как 19 против 0)`);
// ДОПУСК 10%: сборки идут с разной скоростью, и одна и та же сцена по кадрам
// даёт чуть разное число игровых тиков. Регрессия ёмкости давала провал в разы,
// а не в проценты.
const lim = (r) => Math.floor(r * 0.9);
chk(sum.ours.allocs >= lim(sum.ref.allocs),
    `выдач буфера не меньше эталонных: ${sum.ours.allocs} против ${sum.ref.allocs} (порог ${lim(sum.ref.allocs)})`);
chk(sum.ours.draws >= lim(sum.ref.draws),
    `отрисовок существ не меньше эталонных: ${sum.ours.draws} против ${sum.ref.draws} (порог ${lim(sum.ref.draws)})`);
chk(sum.ours.peak <= 16 && sum.ref.peak <= 16, `пик занятости в пределах таблицы: ${sum.ours.peak}/${sum.ref.peak}`);
console.log(fail ? `ГЕЙТ КРАСНЫЙ: ${fail} из ${checks}` : `ГЕЙТ ЗЕЛЁНЫЙ: все ${checks} проверки`);
process.exit(fail ? 1 : 0);
