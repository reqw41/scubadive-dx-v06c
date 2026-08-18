// ПИК ЗАНЯТОСТИ ПУЛА СПРАЙТОВЫХ БУФЕРОВ 0xB000..0xBFFF. Только замер.
//
// КАК УСТРОЕН ПУЛ (прочитано в коде, подтверждено прогоном).
// LB676 — карта из 16 байт, по байту на слот; бит 7 = слот занят.
// LBEC7 инициализирует её как $80,0,0,...,0 — слот 0 занят ВСЕГДА (это
// «статический» буфер, его адрес лежит в LB7B9 = $B000).
// LB646/LB655 выдают слот: ищут первый свободный байт, индекс 0..15,
//   AND $0F / OR $B0  ->  СТАРШИЙ БАЙТ адреса буфера = $B0+индекс.
// То есть буфер слота k — ровно страница $B0+k, 256 байт, и вся область
// 0xB000..0xBFFF — это 16 таких страниц. Никакого «базового адреса» в коде нет:
// поэтому перенос одной константы $B000 в LB7B9/LBEC7 область НЕ двигает —
// проверено сборкой с BUFBASE=$B800, пул остался на $B1xx..$B6xx.
//
// Меряем ПИК одновременно занятых слотов: сколько байт карты LB676 имеют бит 7.
// Снимаем на каждой инструкции (а не раз в тик) — иначе пик между вызовами
// теряется.
//
//   node tools/verify/poolwater.js <rom> <sym1,sym2> [ticks] [level] [row|-] [seed]
"use strict";
const { reachGame } = require("./drive.js");
const { readSym } = require("./harness.js");

const rom = process.argv[2], symArg = process.argv[3];
const NT = parseInt(process.argv[4] || "1500", 10);
const LVL = parseInt(process.argv[5] || "4", 10);
const ROWa = process.argv[6] || "-";
const ROW = ROWa === "-" ? null : parseInt(ROWa, 10);
const SEED = parseInt(process.argv[7] || "167", 16);

const symList = symArg.split(",");
const S = {};
for (const p of symList) Object.assign(S, readSym(p));
const MAP = S.LB676;
if (MAP == null) { console.error("нет метки LB676 — мерить нечего"); process.exit(2); }

const g = reachGame(rom, symList[0], { cpu: "i8080", level: LVL, seed: SEED });
const m = g.m;

let peak = 0, peakMaskHi = 0, samples = 0;
// страницы, реально тронутые как буфер (по записям/чтениям в 0xB000..0xBFFF)
const page = new Uint32Array(16);
const origWrite = m.memory.write.bind(m.memory);
const origRead = m.memory.read.bind(m.memory);
let on = false, curPc = 0, curLen = 1;
m.memory.write = (a, v, st) => {
  if (on && !st) { const ad = a & 0xffff; if (ad >= 0xb000 && ad <= 0xbfff) page[(ad >> 8) & 15]++; }
  return origWrite(a, v, st);
};
m.memory.read = (a, st) => {
  if (on && !st) { const ad = a & 0xffff;
    if (ad >= 0xb000 && ad <= 0xbfff && !(ad >= curPc && ad < curPc + curLen)) page[(ad >> 8) & 15]++; }
  return origRead(a, st);
};
const ILEN = new Uint8Array(256).fill(1);
for (const o of [0x01,0x11,0x21,0x31,0x22,0x2a,0x32,0x3a,0xc3,0xcb,0xcd,0xdd,0xed,0xfd,
                 0xc2,0xca,0xd2,0xda,0xe2,0xea,0xf2,0xfa,0xc4,0xcc,0xd4,0xdc,0xe4,0xec,0xf4,0xfc]) ILEN[o] = 3;
for (const o of [0x06,0x0e,0x16,0x1e,0x26,0x2e,0x36,0x3e,0xc6,0xce,0xd6,0xde,0xe6,0xee,0xf6,0xfe,0xd3,0xdb]) ILEN[o] = 2;

const origCb = m.v06c.check_breakpoint;
m.v06c.check_breakpoint = () => {
  const r = origCb();
  if (on) {
    curPc = m.cpu.pc & 0xffff; curLen = ILEN[origRead(curPc, false) & 0xff];
    let n = 0, mask = 0;
    for (let i = 0; i < 16; i++) if (origRead(MAP + i, false) & 0x80) { n++; mask |= 1 << i; }
    samples++;
    if (n > peak) { peak = n; peakMaskHi = mask; }
  }
  return r;
};

let ticks = 0;
m.onPc(S.LD9C0, () => { ticks++; if (ROW != null) m.wr(S.L5B03 + 1, ROW); });
m.key(38, true);
on = true;
let guard = 0;
while (ticks < NT && guard < 4000000) { m.step(); guard++; }
on = false;

if (ticks === 0 || samples === 0) { console.log("ВЫБОРКА ПУСТА: тиков нет"); process.exit(1); }
const used = [];
for (let i = 0; i < 16; i++) if (page[i]) used.push("B" + i.toString(16).toUpperCase());
console.log(`L${LVL} row=${ROWa} seed=${SEED.toString(16)} тиков=${ticks}: ПИК занятых слотов ${peak}/16` +
  ` (маска ${peakMaskHi.toString(2).padStart(16, "0").split("").reverse().join("")})` +
  `  страницы с обращениями: ${used.length ? used.join(",") : "НЕТ НИ ОДНОЙ"}`);
