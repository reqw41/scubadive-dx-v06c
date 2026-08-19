// ЗАМЕР ТЕМПА: тиков главного цикла на кадр и длина постановки уровня.
//
// Две величины, потому что правка рельефа бьёт в РАЗНЫЕ места:
//   * геймплей — там стало ДЕШЕВЛЕ (LA0F5 и DrawGameScr больше не сдвигают пару
//     вправо на два разряда);
//   * постановка уровня — там стало ДОРОЖЕ (перенос курсора в цикле LA209,
//     +10 тактов на чтение, около 16 тысяч чтений на уровень).
//
//   node tools/verify/tempo_probe.js <каталог сборки> [ещё каталоги...]
//   TEMPO_FRAMES=600  — сколько кадров считать тики
//   TEMPO_LEVELS=1,4  — уровни
"use strict";
const { readSym } = require("./harness.js");
const { reachGame } = require("./drive.js");
const dirs = process.argv.slice(2);
if (!dirs.length) { console.log("укажи каталоги сборок"); process.exit(2); }
const FRAMES = Number(process.env.TEMPO_FRAMES || 600);
const LEVELS = (process.env.TEMPO_LEVELS || "1,4").split(",").map(Number);

for (const dir of dirs) {
  for (const lvl of LEVELS) {
    const S = readSym(`${dir}/scubacod1.sym`);
    let startFrame = null, firstTick = null, t = 0;
    const g = reachGame(`${dir}/scuba.rom`, `${dir}/scubacod1.sym`,
      { cpu: "i8080", level: lvl, seed: 0x0167,
        preHook: (m, SS) => {
          m.onPc(SS.START_GAME, () => { if (startFrame === null) startFrame = m.frame; });
          m.onPc(SS.LD9C0, () => { if (firstTick === null) firstTick = m.frame; }); } });
    const f0 = g.m.frame, t0 = (t = 0, 0);
    g.m.onPc(S.LD9C0, () => { t++; });
    for (let i = 0; i < FRAMES; i++) g.m.step();
    const ticks = t, frames = g.m.frame - f0;
    console.log(`${dir}  уровень ${lvl}: постановка ${firstTick - startFrame} кадров; ` +
                `темп ${(ticks / frames).toFixed(4)} тик/кадр (${ticks} тиков за ${frames} кадров)`);
  }
}
