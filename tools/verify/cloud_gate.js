"use strict";
// ГЕЙТ РАСКРАСКИ СТАЙКИ (-DCLOUDINK): проверяет разворот упакованной маски
// второй плоскости — прямым вызовом подпрограммы, а не прохождением игры.
//
// Почему не сценой: стайка живёт в группах, до которых стенд дайвера не доводит
// (разбор — oracle.js, сценарий deep). Ждать её на экране значит не проверять
// вовсе. Здесь CloudUnpack вызывается как обычная процедура: HL = упакованная
// маска из CloudInkTab, DE = свободная область, нулевой сдвиг и нулевой префикс;
// результат сверяется с распаковкой того же формата на стороне стенда.
//
// Что это ловит: расхождение формата между генератором и игрой — самую вероятную
// ошибку, потому что формат придуман нами и живёт в двух местах сразу.
//
//   node tools/verify/cloud_gate.js <rom> <sym>
const fs = require("fs"), path = require("path");
const { reachGame } = require("./drive.js");
const [ROM, SYM] = process.argv.slice(2, 4);
if (!ROM) { console.error("нужны rom sym"); process.exit(2); }

const g = reachGame(ROM, SYM, { cpu: "i8080", level: 4, seed: 0x0167 });
const m = g.m, S = g.S;
if (S.CloudUnpack === undefined) { console.log("образ собран без CLOUDINK — проверять нечего"); process.exit(2); }

const W = 3, ROWS = 24;
const N = 8;                                  // кадров в таблице
const TAB = S.CloudInkTab;
const SCRATCH = 0x0200;                       // свободная область под результат

// эталон: распаковка формата на стороне стенда
function unpack(addr) {
  const out = new Uint8Array(72);
  let k = addr + 3;
  for (let r = 0; r < ROWS; r++) {
    if (!((m.rd(addr + (r >> 3)) >> (r & 7)) & 1)) continue;
    const bm = m.rd(k++);
    for (let c = 0; c < W; c++) if ((bm >> c) & 1) out[r * W + c] = m.rd(k++);
  }
  return out;
}

let bad = 0, checked = 0, hooked = false;
for (let i = 0; i < N; i++) {
  const packed = m.rdw(TAB + i * 4 + 2);
  const want = unpack(packed);

  // нулевой сдвиг: цепочка поворотов сразу возвращает, маска младших битов $FF
  m.wr(S.CU_rot + 1, S.SH_rot0 & 0xff);
  m.wr(S.CU_rot + 2, (S.SH_rot0 >> 8) & 0xff);
  m.wr(S.CU_lo + 1, 0xFF);
  if (S.CU_lo2 !== undefined) m.wr(S.CU_lo2 + 1, 0xFF);
  m.wr(S.cl_pref, 0);
  for (let j = 0; j < 128; j++) m.wr(SCRATCH + j, 0xAA);   // мусор, чтобы видеть незаписанное

  // вызов: адрес возврата — ловушка, крутим до неё
// ВОЗВРАТ ЛОВИТСЯ КРЮЧКОМ, А НЕ СРАВНЕНИЕМ PC В ЦИКЛЕ: m.step() прокручивает
// эмулятор кусками, а не по одной команде, и точку возврата такой цикл
// проскакивает. Прерывания на время вызова закрыты — иначе ISR уводит PC.
  const RET = 0x0080;
  let returned = false;
  if (!hooked) { m.onPc(RET, () => { returned = true; }); hooked = true; }
  m.cpu.iff = false;
  m.cpu.sp = (m.cpu.sp - 2) & 0xffff;
  m.wr(m.cpu.sp, RET & 0xff); m.wr(m.cpu.sp + 1, RET >> 8);
  // регистры ставятся через пары: h/l и d/e — у ядра hl() и rp() это функции
  m.cpu.regs[4] = (packed >> 8) & 0xff; m.cpu.regs[5] = packed & 0xff;
  m.cpu.regs[2] = (SCRATCH >> 8) & 0xff; m.cpu.regs[3] = SCRATCH & 0xff;
  m.cpu.pc = S.CloudUnpack;
  let guard = 0;
  while (!returned && guard < 20000) { m.step(); guard++; }
  if (!returned) { console.log(`кадр ${i}: подпрограмма не вернулась`); bad++; continue; }
  returned = false;

  // сверка: (w+1) байт на строку, кадр начинается с нулевого префикса
  let miss = 0;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < W; c++)
    if (m.rd(SCRATCH + r * (W + 1) + c) !== want[r * W + c]) miss++;
  checked++;
  if (miss) { bad++; console.log(`кадр ${i}: не сошлось ${miss} байт из ${ROWS * W}`); }
}
console.log(`проверено кадров ${checked}, с расхождением ${bad}`);
console.log(bad ? "КРАСНЫЙ" : "ЗЕЛЁНЫЙ: маска второй плоскости разворачивается точно");
process.exit(bad ? 1 : 0);
