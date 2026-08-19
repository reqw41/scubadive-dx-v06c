// ЗАМЕР: выходит ли чтение рельефа за границу блока в 64 байта.
//
// Зачем. Перенос рельефа целым куском кладёт блок n в ломоть n (шаг 256 вместо
// 64). Внутри блока смежность сохраняется, но ЧТЕНИЕ, ушедшее за 64-й байт, в
// старой раскладке попадало в начало соседнего блока, а в новой — в чужой
// столбец. Прошлый замер (раздел 26.1 плана) насчитал 713 «пересечений» у
// LA209+1 — но считал он ДВИЖЕНИЕ УКАЗАТЕЛЯ (INC HL), а не ЧТЕНИЕ. Разница
// принципиальная: последний INC HL цикла уходит за границу всегда и никем не
// читается.
//
// Здесь считается ровно то, что важно: адрес КАЖДОГО `LD A,(HL)` внутри цикла
// LA209 против базы, снятой на входе (`LD B,$10` перед меткой).
//
//   node tools/verify/relief_probe.js [rom] [sym]
//   RELIEF_LEVELS=1,2,3,4 — уровни спектра
"use strict";
const path = require("path");
const { readSym } = require("./harness.js");
const { reachGame } = require("./drive.js");
const ROOT = path.resolve(__dirname, "../..");
const B = process.env.BUILD_DIR || "build";
const rom = process.argv[2] || `${ROOT}/${B}/src8080/scuba.rom`;
const sym = process.argv[3] || `${ROOT}/${B}/src8080/scubacod1.sym`;
const S = readSym(sym);
for (const n of ["LA209", "LA278", "LA4DD", "LA0F5"])
  if (S[n] == null) { console.log(`нет метки ${n} в ${sym}`); process.exit(2); }

const levels = (process.env.RELIEF_LEVELS || "1,2,3,4").split(",").map(Number);
let totalReads = 0, totalOut = 0, maxExcess = 0, entries = 0;

for (const lvl of levels) {
  let reads = 0, out = 0, mx = 0, ent = 0, base = null;
  const g = reachGame(rom, sym, { cpu: "i8080", level: lvl, seed: 0x0167,
    preHook: (m) => {
      // вход в цикл: `LD B,$10` стоит ровно за две байта до метки LA209
      m.onPc(S.LA209 - 2, (pc, cpu) => {
        base = ((cpu.reg(4) << 8) | cpu.reg(5)) & 0xffff; ent++;
      });
      // все `LD A,(HL)` (опкод 0x7E) в теле цикла LA209..LA278
      for (let a = S.LA209; a <= S.LA278 + 3; a++) {
        m.onPc(a, (pc, cpu) => {
          if (m.rd(pc) !== 0x7e) return;
          const hl = ((cpu.reg(4) << 8) | cpu.reg(5)) & 0xffff;
          if (base == null) return;
          reads++;
          const excess = hl - (base + 16);      // 16 байт от базы — ровно до границы блока
          if (excess >= 0) { out++; if (excess + 1 > mx) mx = excess + 1; }
        });
      }
    }});
  // прогон: постановка уровня уже прошла (LA193 зовётся из PrepareMiniMap)
  for (let i = 0; i < 60; i++) g.m.step();
  console.log(`уровень ${lvl}: входов в цикл ${ent}, чтений ${reads}, ` +
              `ЗА границей блока ${out}, максимум байт за границей ${mx}`);
  totalReads += reads; totalOut += out; entries += ent;
  if (mx > maxExcess) maxExcess = mx;
}
console.log(`ИТОГО: входов ${entries}, чтений ${totalReads}, за границей ${totalOut}, ` +
            `максимальный выход ${maxExcess} Б`);
if (totalReads === 0) { console.log("ПУСТАЯ ВЫБОРКА — замер недействителен"); process.exit(2); }
