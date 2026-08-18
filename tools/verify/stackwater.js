// ВОДЯНОЙ ЗНАК СТЕКА ЗА ВСЮ ЖИЗНЬ ОБРАЗА. Только замер.
//
// SP ставится в 0x0100 (бут и RestartInt), стек растёт ВНИЗ и живёт в той же
// нулевой странице, где лежат RST-векторы. Поэтому вопрос «свободен ли RST k»
// решается не только тем, что там сейчас нули, но и тем, докуда доходит стек.
//
// Меряется с ПЕРВОЙ инструкции образа: бут, распаковка, титул, меню, игра,
// конец партии, возврат в меню. Ограничиться игрой нельзя — самая глубокая
// вложенность вполне может быть в подготовке уровня.
//
// Худший случай считается, а не берётся на удачу: минимальный SP ВНЕ
// обработчика прерывания минус максимальный кадр самого обработчика. Так
// учитывается прерывание, пришедшее на самой глубокой вложенности вызовов,
// даже если в конкретном прогоне оно туда не попало.
//
//   node tools/verify/stackwater.js <rom> <sym1,sym2> [ticks] [level]
"use strict";
const { reachGame } = require("./drive.js");
const { readSym } = require("./harness.js");

const rom = process.argv[2], symArg = process.argv[3];
const NT = parseInt(process.argv[4] || "2000", 10);
const LVL = parseInt(process.argv[5] || "4", 10);
const symList = symArg.split(",");
const S = {};
for (const p of symList) Object.assign(S, readSym(p));

const labs = Object.entries(S).sort((a, b) => a[1] - b[1]);
const lab = a => { let lo = 0, hi = labs.length - 1, x = null;
  while (lo <= hi) { const m = (lo + hi) >> 1;
    if (labs[m][1] <= a) { x = labs[m]; lo = m + 1; } else hi = m - 1; }
  return x ? (a - x[1] ? `${x[0]}+${a - x[1]}` : x[0]) : "?"; };

let minSp = 0x10000, minSpPc = 0, minSpOut = 0x10000, minSpOutPc = 0;
let isrFrame = 0, inIsr = false, spAtIsr = 0, isrCount = 0;
let lowestStackWrite = 0x10000, phase = "бут/титул/меню";
let phaseOfMin = "", phaseOfMinOut = "";

function attach(m) {
  const ow = m.memory.write.bind(m.memory);
  m.memory.write = (a, v, st) => {
    if (st) { const ad = a & 0xffff; if (ad < lowestStackWrite) lowestStackWrite = ad; }
    return ow(a, v, st);
  };
  const orig = m.v06c.check_breakpoint;
  m.v06c.check_breakpoint = () => {
    const r = orig();
    const pc = m.cpu.pc & 0xffff, sp = m.cpu.sp & 0xffff;
    if (pc === 0x38 && !inIsr) { inIsr = true; spAtIsr = sp; isrCount++; }
    if (sp < minSp) { minSp = sp; minSpPc = pc; phaseOfMin = phase; }
    if (inIsr) {
      const f = (spAtIsr - sp) & 0xffff;
      if (f < 0x100 && f > isrFrame) isrFrame = f;
      if (sp > spAtIsr) inIsr = false;
    }
    if (!inIsr && sp < minSpOut) { minSpOut = sp; minSpOutPc = pc; phaseOfMinOut = phase; }
    return r;
  };
}

const g = reachGame(rom, symList[0], { cpu: "i8080", level: LVL, seed: 0x0167, preHook: attach });
const m = g.m;
phase = "игра";
let ticks = 0;
m.onPc(S.LD9C0, () => { ticks++; });
m.key(38, true);
let guard = 0;
while (ticks < NT && guard < 4000000) { m.step(); guard++; }
m.key(38, false);
phase = "конец партии/возврат в меню";
let goReached = 0;
if (S.LEA7A != null) m.onPc(S.LEA7A, () => { goReached++; });
m.wr(S.OXYGEN, 0); m.wr(S.OXYGEN + 1, 0); m.wr(S.LIVES, 1);
for (let i = 0; i < 3000; i++) m.step();

const hex = a => "0x" + (a & 0xffff).toString(16).toUpperCase().padStart(4, "0");
if (ticks === 0) { console.log("ВЫБОРКА ПУСТА: игровых тиков нет"); process.exit(1); }
if (isrCount === 0) { console.log("ВЫБОРКА ПУСТА: обработчик прерывания ни разу не вошёл — замер недействителен"); process.exit(1); }
console.log(`=== СТЕК  ${rom}  уровень ${LVL}, тиков ${ticks}, входов в ISR ${isrCount}` +
            (goReached ? `, конец партии достигнут (${goReached})` : ", КОНЕЦ ПАРТИИ НЕ ДОСТИГНУТ"));
console.log(`    минимальный SP вообще:        ${hex(minSp)}  (PC ${lab(minSpPc)}, фаза: ${phaseOfMin})`);
console.log(`    минимальный SP ВНЕ ISR:       ${hex(minSpOut)}  (PC ${lab(minSpOutPc)}, фаза: ${phaseOfMinOut})`);
console.log(`    максимальный кадр ISR:        ${isrFrame} Б`);
console.log(`    РАСЧЁТНЫЙ ХУДШИЙ SP:          ${hex(minSpOut - isrFrame)}  = SPвнеISR - кадрISR`);
console.log(`    самый глубокий записанный стеком байт: ${hex(lowestStackWrite)}`);
console.log(`    стек НИКОГДА не опускался ниже ${hex(lowestStackWrite)}; ` +
            `свободно под ним ${lowestStackWrite} Б, до расчётного худшего ${minSpOut - isrFrame} Б`);
