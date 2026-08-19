// ГЕЙТ ПУЛА БУФЕРОВ. Три верхние страницы $BD00..$BFFF забронированы под данные
// колеса таймеров: в таблице LB676 у них выставлен бит 7, и распределитель
// (LB646 ищет первую запись с нулевым битом 7) их не выдаёт.
//
// Гейт проверяет две вещи на СПЕКТРЕ сцен, а не на одной:
//  1) бронь цела — биты 7 страниц 13..15 не сбрасываются никогда;
//  2) РАБОЧЕЙ занятости (страницы 0..12) хватает с запасом: порог красноты
//     ВЫШЕ 11, то есть гейт краснеет ПРИ ПРИБЛИЖЕНИИ к исчерпанию, а не при
//     самом исчерпании. Замер до брони давал пик 9, после уточнения счёта по
//     биту 7 — 8; порог 11 оставляет три страницы форы на сцены, которых мы не
//     видели.
//
// Почему спектр: замер показал, что глубина для пула ЛЕГЧЕ поверхности
// (постоянные 6 против гуляющих 4..9). Худшая сцена по тактам и худшая по памяти
// — разные сцены, и проверять надо обе.
//
//   POOL_INJECT=1 — занять пять рабочих страниц сверх обычного, гейт обязан
//                   покраснеть по порогу
//   POOL_FREE=1   — сбросить бронь, гейт обязан покраснеть по целости брони
//   POOL_EMPTY=1  — обнулить выборку, гейт обязан покраснеть
"use strict";
const path = require("path");
const { readSym } = require("./harness.js");
const { reachGame } = require("./drive.js");
const ROOT = path.resolve(__dirname, "../..");
const B = process.env.BUILD_DIR || "build";
const rom = `${ROOT}/${B}/prod/scuba.rom`, sym = `${ROOT}/${B}/prod/scubacod1.sym`;
const S = readSym(sym);
for (const n of ["LB676", "LD9C0", "L5B03"])
  if (S[n] == null) { console.log("нет метки " + n); process.exit(2); }

const RESERVED = [13, 14, 15];
const LIMIT = 11;                 // рабочих страниц занято больше -> красный

let fail = 0, checks = 0;
const chk = (ok, msg) => { checks++; if (ok) console.log("  ok      " + msg);
                           else { fail++; console.log("  ПРОВАЛ  " + msg); } };

// сцены: глубина и поверхность, разные уровни — они нагружают пул по-разному
const SCENES = [
  ["уровень 4, глубина",      4, 9,    1500],
  ["уровень 4, поверхность",  4, null, 2500],
  ["уровень 1, поверхность",  1, null, 2500],
];

const results = [];
for (const [name, lvl, row, ticks] of SCENES) {
  const g = reachGame(rom, sym, { cpu: "i8080", level: lvl, seed: 0x0167 });
  const m = g.m;
  let t = 0, peak = 0, broken = -1;
  m.onPc(S.LD9C0, () => {
    t++;
    if (row !== null) m.wr(S.L5B03 + 1, row);
    if (t === 5) {
      // ПОДСАДКА ДОЛЖНА ПРЕВЫСИТЬ ПОРОГ, а не сравняться с ним: при живом пике 7
      // четыре лишние страницы дают ровно 11, то есть пороговое условие
      // «больше 11» не срабатывает и контроль молчит. Берём пять.
      if (process.env.POOL_INJECT === "1")
        for (const p of [8, 9, 10, 11, 12]) m.wr(S.LB676 + p, 0x80);
      if (process.env.POOL_FREE === "1")
        for (const p of RESERVED) m.wr(S.LB676 + p, 0x00);
    }
    let busy = 0;
    for (let i = 0; i < 13; i++) if (m.rd(S.LB676 + i) & 0x80) busy++;
    if (busy > peak) peak = busy;
    for (const p of RESERVED) if (!(m.rd(S.LB676 + p) & 0x80) && broken < 0) broken = t;
  });
  m.key(38, true);
  let guard = 0;
  while (t < ticks && guard < 900000) { m.step(); guard++; }
  results.push({ name, t, peak, broken });
}

if (process.env.POOL_EMPTY === "1" || results.length === 0) {
  console.log("  ПРОВАЛ  ПУСТАЯ ВЫБОРКА: ни одной сцены не прогнано");
  console.log("ГЕЙТ НЕДЕЙСТВИТЕЛЕН"); process.exit(2);
}
for (const r of results) {
  chk(r.broken < 0, `${r.name}: бронь страниц 13..15 цела за ${r.t} тиков` +
      (r.broken < 0 ? "" : ` — СБРОШЕНА на тике ${r.broken}`));
  chk(r.peak <= LIMIT, `${r.name}: пик рабочих страниц ${r.peak} из 13 при пороге ${LIMIT}` +
      (r.peak <= LIMIT ? `, запас ${13 - r.peak}` : " — пул на исходе"));
}
console.log(fail ? `ГЕЙТ КРАСНЫЙ: ${fail} из ${checks}` : `ГЕЙТ ЗЕЛЁНЫЙ: все ${checks} проверки`);
process.exit(fail ? 1 : 0);
