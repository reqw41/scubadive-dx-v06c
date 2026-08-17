// ЮНИТ-ТЕСТ ХЕЛПЕРОВ (IX+d): прозрачность по флагам и регистрам.
//
// Подозрение координатора: на Z80 обращение (IX+d) флаги НЕ ТРОГАЕТ, а наш
// хелпер считает адрес сложением (add a,l / adc a,h) и перенос портит. Если
// после такого обращения код ветвится по CY — спрайт не рисуется. Здесь каждый
// хелпер прогоняется во ВСЕХ 16 сочетаниях входных флагов и с известными
// значениями BC/DE/HL, и проверяется его заявленный контракт.
//
// Контракты (из шапки scubai80.asm):
//   z80_ldR_*  ld R,(IX+d)   — флаги ЦЕЛЫ, целы все регистры кроме R
//   z80_stR_*  ld (IX+d),R   — флаги и все регистры ЦЕЛЫ, записан байт
//   z80_stn_*  ld (IX+d),n   — то же, значение из второго инлайн-байта
//   z80_set/res n,(IX+d)     — флаги и A ЦЕЛЫ
//   z80_bit*   A:=(IX+d), прежнее A в il_a; флаги ставит вызывающий
//   z80_inc_/dec_            — S,Z,P от результата; CY ПОРЧЕН (заявлено в аудите)
//   z80_ALU_*                — флаги от результата
//
//   node tools/verify/helpers_unit.js <rom> <sym>
"use strict";
const { reachGame } = require("./drive.js");

const rom = process.argv[2], sym = process.argv[3];
const g = reachGame(rom, sym, { cpu: "i8080", level: 1, seed: 0x0167 });
const S = g.S, m = g.m, cpu = m.cpu;
const R = { b: 0, c: 1, d: 2, e: 3, h: 4, l: 5, a: 7 };
const REC = 0xbf00;        // «запись объекта» в свободной части буферной области
const SENT = 0x0002;

function setFlags(f) { cpu.cf = f & 1; cpu.pf = (f >> 1) & 1; cpu.hf = (f >> 2) & 1; cpu.zf = (f >> 3) & 1; cpu.sf = (f >> 4) & 1; }
function getFlags() { return (cpu.cf ? 1 : 0) | ((cpu.pf ? 1 : 0) << 1) | ((cpu.hf ? 1 : 0) << 2) | ((cpu.zf ? 1 : 0) << 3) | ((cpu.sf ? 1 : 0) << 4); }

// вызвать хелпер: name — метка, tail — байты, которые лежат сразу за call
function call(name, tail, init) {
  const addr = S[name];
  if (addr == null) return null;
  // площадка вызова: call <helper>; defb tail...; и часовой
  const PAD = 0xbe00;
  m.wr(PAD, 0xcd); m.wr(PAD + 1, addr & 0xff); m.wr(PAD + 2, addr >> 8);
  tail.forEach((b, i) => m.wr(PAD + 3 + i, b));
  m.wr(PAD + 3 + tail.length, 0xc3);                     // jp SENT
  m.wr(PAD + 4 + tail.length, SENT & 0xff); m.wr(PAD + 5 + tail.length, SENT >> 8);
  cpu.regs[R.a] = init.a; cpu.regs[R.b] = init.b; cpu.regs[R.c] = init.c;
  cpu.regs[R.d] = init.d; cpu.regs[R.e] = init.e;
  cpu.regs[R.h] = init.h; cpu.regs[R.l] = init.l;
  setFlags(init.f);
  cpu.sp = 0x00f0;
  cpu.pc = PAD;
  let n = 0;
  while ((cpu.pc & 0xffff) !== SENT && n < 2000) { cpu.instruction(); n++; }
  if (n >= 2000) throw new Error("хелпер " + name + " не вернулся");
  return { a: cpu.regs[R.a], b: cpu.regs[R.b], c: cpu.regs[R.c], d: cpu.regs[R.d],
           e: cpu.regs[R.e], h: cpu.regs[R.h], l: cpu.regs[R.l], f: getFlags(), sp: cpu.sp };
}

const INIT = { a: 0x5a, b: 0x11, c: 0x22, d: 0x33, e: 0x44, h: 0x77, l: 0x88, f: 0 };
const DISP = 0x0d, VAL = 0x96;

let fails = 0, checked = 0;
function chk(cond, msg) { checked++; if (!cond) { fails++; console.log("  ПРОВАЛ: " + msg); } }

function prep(cell) {
  m.wr(S.z80_ix, REC & 0xff); m.wr(S.z80_ix + 1, REC >> 8);
  m.wr(S.z80_iy, REC & 0xff); m.wr(S.z80_iy + 1, REC >> 8);
  m.wr(REC + DISP, VAL);
}

console.log("--- ld R,(IX+d) / ld R,(IY+d): флаги и прочие регистры обязаны быть целы ---");
for (const X of ["X", "Y"]) {
  for (const r of ["a", "b", "c", "d", "e", "h", "l"]) {
    const name = `z80_ld${r}_${X}`;
    if (S[name] == null) continue;
    for (let f = 0; f < 32; f++) {
      prep(); const init = { ...INIT, f };
      const o = call(name, [DISP], init);
      chk(o.f === f, `${name}: флаги вошли ${f.toString(2)}, вышли ${o.f.toString(2)} — на Z80 ld r,(ix+d) их НЕ трогает`);
      chk(o[r] === VAL, `${name}: в ${r} должно быть 0x${VAL.toString(16)}, лежит 0x${o[r].toString(16)}`);
      for (const q of ["a", "b", "c", "d", "e", "h", "l"])
        if (q !== r) chk(o[q] === init[q], `${name}: испорчен регистр ${q}: ${init[q].toString(16)} -> ${o[q].toString(16)}`);
      chk(o.sp === 0x00f0, `${name}: стек не сбалансирован, SP=${o.sp.toString(16)}`);
    }
  }
}

console.log("--- ld (IX+d),R: флаги и ВСЕ регистры обязаны быть целы ---");
for (const X of ["X", "Y"]) {
  for (const r of ["a", "b", "c", "d", "e", "h", "l"]) {
    const name = `z80_st${r}_${X}`;
    if (S[name] == null) continue;
    for (let f = 0; f < 32; f++) {
      prep(); m.wr(REC + DISP, 0x00);
      const init = { ...INIT, f };
      const o = call(name, [DISP], init);
      chk(o.f === f, `${name}: флаги вошли ${f.toString(2)}, вышли ${o.f.toString(2)}`);
      chk(m.rd(REC + DISP) === init[r], `${name}: записано 0x${m.rd(REC + DISP).toString(16)}, ждали 0x${init[r].toString(16)}`);
      for (const q of ["a", "b", "c", "d", "e", "h", "l"])
        chk(o[q] === init[q], `${name}: испорчен регистр ${q}: ${init[q].toString(16)} -> ${o[q].toString(16)}`);
    }
  }
}

console.log("--- ld (IX+d),n ---");
for (const X of ["X", "Y"]) {
  const name = `z80_stn_${X}`;
  if (S[name] == null) continue;
  for (let f = 0; f < 32; f++) {
    prep(); m.wr(REC + DISP, 0x00);
    const o = call(name, [DISP, 0xa7], { ...INIT, f });
    chk(o.f === f, `${name}: флаги вошли ${f.toString(2)}, вышли ${o.f.toString(2)}`);
    chk(m.rd(REC + DISP) === 0xa7, `${name}: записано 0x${m.rd(REC + DISP).toString(16)}, ждали 0xa7`);
    for (const q of ["a", "b", "c", "d", "e", "h", "l"])
      chk(o[q] === INIT[q], `${name}: испорчен регистр ${q}`);
  }
}

console.log("--- set/res n,(IX+d): флаги и A целы ---");
for (const X of ["X", "Y"]) {
  for (const [name, mask, exp] of [[`z80_set${X}`, 0x20, VAL | 0x20], [`z80_res${X}`, (~0x04) & 0xff, VAL & ~0x04]]) {
    if (S[name] == null) continue;
    for (let f = 0; f < 32; f++) {
      prep();
      const o = call(name, [DISP, mask], { ...INIT, f });
      chk(o.f === f, `${name}: флаги вошли ${f.toString(2)}, вышли ${o.f.toString(2)} — SET/RES на Z80 их НЕ трогают`);
      chk(m.rd(REC + DISP) === (exp & 0xff), `${name}: байт 0x${m.rd(REC + DISP).toString(16)}, ждали 0x${(exp & 0xff).toString(16)}`);
      for (const q of ["a", "b", "c", "d", "e", "h", "l"])
        chk(o[q] === INIT[q], `${name}: испорчен регистр ${q}`);
    }
  }
}

console.log("--- bit n,(IX+d): A := байт, прежнее A в il_a, регистры целы ---");
for (const X of ["X", "Y"]) {
  const name = `z80_bit${X}`;
  if (S[name] == null) continue;
  for (let f = 0; f < 32; f++) {
    prep();
    const o = call(name, [DISP], { ...INIT, f });
    chk(o.a === VAL, `${name}: A=0x${o.a.toString(16)}, ждали 0x${VAL.toString(16)}`);
    chk(m.rd(S.il_a) === INIT.a, `${name}: в il_a 0x${m.rd(S.il_a).toString(16)}, ждали прежнее A 0x${INIT.a.toString(16)}`);
    for (const q of ["b", "c", "d", "e", "h", "l"])
      chk(o[q] === INIT[q], `${name}: испорчен регистр ${q}`);
  }
}

console.log("--- inc/dec (IX+d): S,Z,P от результата, A и прочие регистры целы ---");
for (const X of ["X", "Y"]) {
  for (const [name, delta] of [[`z80_inc_${X}`, 1], [`z80_dec_${X}`, -1]]) {
    if (S[name] == null) continue;
    for (const v of [0x00, 0x01, 0x7f, 0x80, 0xff]) {
      prep(); m.wr(REC + DISP, v);
      const o = call(name, [DISP], { ...INIT, f: 0 });
      const exp = (v + delta) & 0xff;
      chk(m.rd(REC + DISP) === exp, `${name}: 0x${v.toString(16)} -> 0x${m.rd(REC + DISP).toString(16)}, ждали 0x${exp.toString(16)}`);
      chk(((o.f >> 3) & 1) === (exp === 0 ? 1 : 0), `${name}: Z неверен при результате 0x${exp.toString(16)}`);
      chk(((o.f >> 4) & 1) === ((exp & 0x80) ? 1 : 0), `${name}: S неверен при результате 0x${exp.toString(16)}`);
      for (const q of ["a", "b", "c", "d", "e", "h", "l"])
        chk(o[q] === INIT[q], `${name}: испорчен регистр ${q}`);
    }
  }
}

console.log(`\nпроверок: ${checked}, провалов: ${fails}`);
if (checked === 0) { console.log("ГЕЙТ НЕДЕЙСТВИТЕЛЕН: пустая выборка"); process.exit(2); }
console.log(fails ? "ГЕЙТ КРАСНЫЙ" : "ГЕЙТ ЗЕЛЁНЫЙ: все хелперы держат заявленный контракт");
process.exit(fails ? 1 : 0);
