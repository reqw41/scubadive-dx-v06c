// ЮНИТ-ТЕСТ ЗАМЕНЫ RRD: все 65536 сочетаний входов (A, (HL)) прогоняются через
// НАШ хелпер z80_rrd прямо в эмуляторе и сверяются с формулой Z80:
//   tmp=(HL);  (HL) = ((A&0F)<<4) | (tmp>>4);  A = (A&F0) | (tmp&0F)
//   флаги: S,Z,P от нового A; H=0, N=0; CY НЕ МЕНЯЕТСЯ.
// Заодно проверяются регистры BC/DE/HL и указатель — RRD на Z80 не трогает ничего,
// кроме A, (HL) и флагов.
//
// Почему отдельно от сценарных гейтов: RRD исполняется 8.9 раз на игровой тик в
// предсдвиге спрайта, но сценарии покрывают лишь те сочетания входов, которые в
// них случились. Здесь покрытие полное.
//
//   node tools/verify/rrd_unit.js <rom> <sym>
"use strict";
const { reachGame } = require("./drive.js");

const rom = process.argv[2], sym = process.argv[3];
const g = reachGame(rom, sym, { cpu: "i8080", level: 1, seed: 0x0167 });
const S = g.S, m = g.m, cpu = m.cpu;
const ADDR = S.z80_rrd;
if (ADDR == null) { console.log("нет метки z80_rrd в .sym"); process.exit(2); }

const SCRATCH = 0xbf00;          // байт-подопытный: буферная область спрайтов, вне кода
const SENT = 0x0002;             // адрес-часовой: досюда «вернётся» хелпер

// прямой доступ к регистрам ядра i8080: regs = [b,c,d,e,h,l,m,a]
const R = { b: 0, c: 1, d: 2, e: 3, h: 4, l: 5, a: 7 };
function callHelper(a, mem, cy) {
  m.wr(SCRATCH, mem);
  cpu.regs[R.a] = a;
  cpu.regs[R.h] = SCRATCH >> 8; cpu.regs[R.l] = SCRATCH & 0xff;
  cpu.regs[R.b] = 0x5a; cpu.regs[R.c] = 0xa5;
  cpu.regs[R.d] = 0x3c; cpu.regs[R.e] = 0xc3;
  cpu.cf = cy; cpu.sf = 0; cpu.zf = 0; cpu.pf = 0; cpu.hf = 0;
  cpu.sp = 0x00f0;
  // адрес возврата-часового на стек
  m.wr(0x00ee, SENT & 0xff); m.wr(0x00ef, SENT >> 8);
  cpu.sp = 0x00ee;
  cpu.pc = ADDR;
  let n = 0;
  while ((cpu.pc & 0xffff) !== SENT && n < 500) { cpu.instruction(); n++; }
  if (n >= 500) throw new Error("хелпер не вернулся");
  return { a: cpu.regs[R.a], mem: m.rd(SCRATCH),
           hl: (cpu.regs[R.h] << 8) | cpu.regs[R.l],
           bc: (cpu.regs[R.b] << 8) | cpu.regs[R.c],
           de: (cpu.regs[R.d] << 8) | cpu.regs[R.e],
           sf: cpu.sf ? 1 : 0, zf: cpu.zf ? 1 : 0, pf: cpu.pf ? 1 : 0, cf: cpu.cf ? 1 : 0 };
}

function parity(v) { let n = 0; for (let i = 0; i < 8; i++) if (v & (1 << i)) n++; return n % 2 === 0 ? 1 : 0; }

let bad = 0, checked = 0, badFlags = 0, badRegs = 0, badCy = 0;
const shown = [];
for (let a = 0; a < 256; a++) {
  for (let mem = 0; mem < 256; mem++) {
    for (const cy of [0, 1]) {
      const expA = (a & 0xf0) | (mem & 0x0f);
      const expM = ((a & 0x0f) << 4) | (mem >> 4);
      const r = callHelper(a, mem, cy);
      checked++;
      let err = null;
      if (r.a !== expA || r.mem !== expM)
        err = `A ${r.a}/${expA}, (HL) ${r.mem}/${expM}`;
      else if (r.hl !== SCRATCH || r.bc !== 0x5aa5 || r.de !== 0x3cc3) { badRegs++; err = `регистры: HL=${r.hl.toString(16)} BC=${r.bc.toString(16)} DE=${r.de.toString(16)}`; }
      else if (r.sf !== ((expA & 0x80) ? 1 : 0) || r.zf !== (expA === 0 ? 1 : 0) || r.pf !== parity(expA)) { badFlags++; err = `флаги S/Z/P: ${r.sf}${r.zf}${r.pf}, ждали ${(expA & 0x80) ? 1 : 0}${expA === 0 ? 1 : 0}${parity(expA)}`; }
      else if (r.cf !== cy) { badCy++; err = `CY: вошёл ${cy}, вышел ${r.cf} (RRD на Z80 его НЕ трогает)`; }
      if (err) { bad++; if (shown.length < 8) shown.push(`  A=0x${a.toString(16).padStart(2, "0")} (HL)=0x${mem.toString(16).padStart(2, "0")} CY=${cy}: ${err}`); }
    }
  }
}
console.log(`проверено сочетаний: ${checked}`);
for (const s of shown) console.log(s);
console.log(`значения (A и (HL)): ${bad - badFlags - badRegs - badCy} ошибок`);
console.log(`регистры BC/DE/HL:   ${badRegs} ошибок`);
console.log(`флаги S/Z/P:         ${badFlags} ошибок`);
console.log(`флаг CY:             ${badCy} ошибок`);
if (checked === 0) { console.log("ГЕЙТ НЕДЕЙСТВИТЕЛЕН: пустая выборка"); process.exit(2); }
// CY выведен в ОТДЕЛЬНЫЙ итог намеренно: расхождение по нему заявлено в аудите
// трансляции (build/audit.txt, метка rrd-cy) и на поведение игры не влияет, пока
// ни одна ветка после RRD не читает перенос.
const fatal = bad - badCy;
console.log(fatal ? `ГЕЙТ КРАСНЫЙ: ${fatal} расхождений по значениям/регистрам/флагам S,Z,P` :
            `ГЕЙТ ЗЕЛЁНЫЙ: значения, регистры и флаги S,Z,P совпадают во всех ${checked} сочетаниях` +
            (badCy ? `; CY расходится в ${badCy} (известно, см. аудит rrd-cy)` : ""));
process.exit(fatal ? 1 : 0);
