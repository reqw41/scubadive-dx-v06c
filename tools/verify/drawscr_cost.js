// ЦЕНА ПЕРЕРИСОВКИ ЭКРАНА В ТАКТАХ. Мера для правок цикла тайлов: сколько
// стоит ОДИН заход в DrawGameScr от входа до возврата.
//
// Границы берутся не по меткам конца (их несколько — ei/RET один, но выходов из
// вложенных циклов много), а ПО СТЕКУ: на входе запоминается SP, и заход
// считается закрытым, как только SP поднялся выше запомненного, то есть RET уже
// снял адрес возврата. Внутри процедуры SP только опускается (push/call), выше
// входного он не поднимается нигде.
//
// Такты — cpu.vcycles за ПРЕДЫДУЩУЮ исполненную инструкцию (так же меряют
// prof8080.js и tickdist.js): ядро выставляет их перед следующим крючком.
//
//   node tools/verify/drawscr_cost.js <rom> <sym> [level=4] [ticks=600] [seed=0x0167]
"use strict";
const { reachGame, KEY } = require("./drive.js");
const [rom, sym] = process.argv.slice(2, 4);
const LVL = parseInt(process.argv[4] || "4", 10);
const NT = parseInt(process.argv[5] || "600", 10);
const SEED = parseInt(process.argv[6] || "0x0167", 16);
if (!rom || !sym) { console.error("нужны rom sym"); process.exit(2); }

const g = reachGame(rom, sym, { cpu: "i8080", level: LVL, seed: SEED });
const m = g.m, S = g.S;
for (const n of ["DrawGameScr", "DrawSurface", "LD9C0"])
  if (S[n] == null) { console.log("нет метки " + n); process.exit(2); }

let on = false, sp0 = 0, acc = 0, prev = -1;
const runs = [];
let surf = 0, surfRun = 0;
m.onPc(S.DrawSurface, () => { if (on) surfRun++; });
const cb = m.v06c.check_breakpoint;
m.v06c.check_breakpoint = () => {
  const r = cb();
  const pc = m.cpu.pc & 0xffff;
  if (on) {
    if (prev >= 0) acc += m.cpu.vcycles || 0;
    if ((m.cpu.sp & 0xffff) > sp0) {               // RET снял адрес возврата
      on = false; runs.push(acc); surf += surfRun;
    }
  }
  if (!on && pc === S.DrawGameScr) { on = true; sp0 = m.cpu.sp & 0xffff; acc = 0; surfRun = 0; }
  prev = pc;
  return r;
};

m.key(KEY.UP, true);
const t0 = g.ticks; let guard = 0;
while (g.ticks - t0 < NT && guard < 2500000) { m.step(); guard++; }

if (!runs.length) { console.log("ПРОВАЛ: ни одной перерисовки за прогон"); process.exit(1); }
const sum = runs.reduce((a, b) => a + b, 0);
const avg = Math.round(sum / runs.length);
// СРАВНИВАТЬ НАДО ЗАХОД С ЗАХОДОМ, А НЕ СРЕДНЕЕ СО СРЕДНИМ: DI из перерисовки
// снят (2026-08-27), внутрь неё попадают прерывания KEYINT, и их число гуляет
// от захода к заходу на десятки тысяч тактов. Поэтому печатается ВЕСЬ список:
// сравнивать сборки надо по ОДНОИМЁННОМУ заходу (первый с первым и т.д.),
// сцена у них одна и та же.
console.log(`ур.${LVL} сид ${SEED.toString(16)} ${NT} тиков: перерисовок ${runs.length}, ` +
            `тактов на перерисовку сред. ${avg}, мин ${Math.min(...runs)}, макс ${Math.max(...runs)}; ` +
            `вызовов DrawSurface на перерисовку ${(surf / runs.length).toFixed(1)}`);
console.log(`  по заходам: ${runs.join(" ")}`);
