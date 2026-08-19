// ЦЕНА РАСТРОВОГО ФОНА: куда именно уходят такты и во что обходится темп.
// Считает такты Вектора по ДИАПАЗОНАМ PC растрового модуля и темп в тиках на
// кадр — у флаговой и бесфлаговой сборки одного и того же уровня.
//
//   node tools/verify/raster_cost.js [уровень=4] [кадров=300]
"use strict";
const fs = require("fs"), path = require("path");
const { readSym } = require("./harness.js");
const { reachGame } = require("./drive.js");
const ROOT = path.resolve(__dirname, "../..");
const B = process.env.BUILD_DIR || "build";
const LVL = parseInt(process.argv[2] || "4", 10);
const NF = parseInt(process.argv[3] || "300", 10);
const FRAME = 59904;

const rRom = `${ROOT}/${B}/raster/scuba.rom`, rSym = `${ROOT}/${B}/raster/scubacod1.sym`;
const cRom = `${ROOT}/${B}/src8080/scuba.rom`, cSym = `${ROOT}/${B}/src8080/scubacod1.sym`;
for (const f of [rRom, rSym, cRom, cSym]) if (!fs.existsSync(f)) {
  console.log(`нет файла ${f} — собери DET=1 RASTER=1 OUT=${B}/raster и DET=1 OUT=${B}/src8080`);
  process.exit(2);
}

// Такты и тики за прогон. Такты берём у ядра (cpu.vcycles за исполненную
// команду) — это реальные такты Вектора, а не оценка.
function run(rom, sym, ranges) {
  const S = readSym(sym);
  const g = reachGame(rom, sym, { cpu: "i8080", level: LVL, seed: 0x0167 });
  const m = g.m;
  const acc = new Float64Array(ranges.length);
  let ticks = 0, total = 0, prev = -1;
  const origCb = m.v06c.check_breakpoint;
  m.v06c.check_breakpoint = () => {
    if (prev >= 0) {
      const c = m.cpu.vcycles || 0; total += c;
      for (let i = 0; i < ranges.length; i++)
        if (prev >= ranges[i][1] && prev < ranges[i][2]) { acc[i] += c; break; }
    }
    prev = m.cpu.pc & 0xffff;
    return origCb();
  };
  m.onPc(S.LD9C0, () => { ticks++; });
  const f0 = m.frame;
  for (let i = 0; i < NF; i++) m.step();
  return { frames: m.frame - f0, ticks, total, acc, S };
}

const S = readSym(rSym);
// Диапазоны: конец каждого — начало следующей метки по возрастанию адреса.
const R = [
  ["взвод счётчика (один раз)", S.rz_arm_do, S.rz_isr],
  ["залп неба в KEYINT",        S.rz_isr,    S.rz_water],
  ["обвязка вызовов",           S.rz_water,  S.rz_go],
  ["грубые опросы (ожидание)",  S.rz_go,     S.rz_p3],
  ["тонкий опрос + довводка",   S.rz_p3,     S.rz_chain],
  ["цепочка NOP",               S.rz_chain,  S.rz_shot],
  ["залп",                      S.rz_shot,   S.rz_start],
  ["пуск (ei+halt, один раз)",  S.rz_start,  0xBE00],
];
for (const r of R) if (r[1] == null || r[2] == null) { console.log("нет меток в " + rSym); process.exit(2); }

const a = run(rRom, rSym, R);
const b = run(cRom, cSym, []);

console.log(`=== цена растрового фона, уровень ${LVL}, ${a.frames} кадров`);
let sum = 0;
for (let i = 0; i < R.length; i++) {
  sum += a.acc[i];
  console.log(`  ${String(Math.round(a.acc[i] / a.frames)).padStart(6)} тактов/кадр  ${(100 * a.acc[i] / a.frames / FRAME).toFixed(2).padStart(5)}%  ${R[i][0]}`);
}
console.log(`  ${String(Math.round(sum / a.frames)).padStart(6)} тактов/кадр  ${(100 * sum / a.frames / FRAME).toFixed(2).padStart(5)}%  ИТОГО в модуле`);
console.log(`--- темп`);
console.log(`  с флагом:  ${a.ticks} тиков за ${a.frames} кадров = ${(a.ticks / a.frames).toFixed(2)} тика/кадр = ${(50 * a.ticks / a.frames).toFixed(1)} тика/с`);
console.log(`  без флага: ${b.ticks} тиков за ${b.frames} кадров = ${(b.ticks / b.frames).toFixed(2)} тика/кадр = ${(50 * b.ticks / b.frames).toFixed(1)} тика/с`);
console.log(`  замедление ${(b.ticks / a.ticks).toFixed(2)}x, цена эффекта ${(50 * (b.ticks - a.ticks) / a.frames).toFixed(1)} тика/с`);
