// i8080_run.js — прогон распаковщика на модели i8080 (ядро A. Дёмина из
// vector06js/i8080-js, оно же используется в остальных стендах проекта).
// Не самостоятельный инструмент: запускается из tools/cas/check_lz.py, конфиг в JSON.
//
// Стенд СТОРОЖЕВОЙ: каждое чтение и каждая запись проверяются по списку разрешённых
// областей. Распаковщику позволено писать только в приёмник (и в свою ячейку длины),
// читать — только код, сжатый блок, приёмник и стек. Выход за сжатый блок ловится
// именно здесь: за ним лежит область, которой нет ни в одном разрешённом диапазоне.
'use strict';
const fs = require('fs');

const cfg = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
(0, eval)(fs.readFileSync(cfg.core, 'utf8'));
const Cpu = globalThis.I8080;

const mem = new Uint8Array(0x10000);
const wrote = new Uint8Array(cfg.dstLen);      // покрытие приёмника
const viol = [];
let reads = 0, writes = 0, lzHigh = 0;

function inRange(a, lo, len) { return a >= lo && a < lo + len; }

function readOk(a, stack) {
  if (stack) return inRange(a, cfg.spLow, cfg.sp - cfg.spLow + 2);
  if (inRange(a, cfg.codeStart, cfg.codeLen)) return true;
  if (inRange(a, cfg.lzStart, cfg.lzLen)) {
    const off = a - cfg.lzStart + 1; if (off > lzHigh) lzHigh = off; return true;
  }
  if (inRange(a, cfg.dstStart, cfg.dstLen)) return true;
  return false;
}
function writeOk(a, stack) {
  if (stack) return inRange(a, cfg.spLow, cfg.sp - cfg.spLow + 2);
  if (inRange(a, cfg.dstStart, cfg.dstLen)) return true;
  if (inRange(a, cfg.varStart, cfg.varLen)) return true;   // ячейка длины матча
  return false;
}

const memory = {
  read(addr, stackrq) {
    reads++;
    if (!readOk(addr, stackrq) && viol.length < 8)
      viol.push({ kind: 'read', addr, pc: cpu.pc });
    return mem[addr];
  },
  write(addr, w8, stackrq) {
    writes++;
    if (!writeOk(addr, stackrq) && viol.length < 8)
      viol.push({ kind: 'write', addr, pc: cpu.pc });
    else if (!stackrq && inRange(addr, cfg.dstStart, cfg.dstLen))
      wrote[addr - cfg.dstStart] = 1;
    mem[addr] = w8;
  },
};
const io = { input() { return 0xff; }, output() {}, interrupt() {} };

const cpu = new Cpu(memory, io);

// --- САМОПРОВЕРКА ЯДРА на заведомо известных значениях (иначе такты и результат
// нечем поверить). Проверяем как раз то, на чём стоит формат: add a,a/adc a,a как
// сдвиг с переносом, add hl,hl, sbc a,r, ret nc и такты команд копирования.
function selfTest() {
  const cases = [
    // код, начальные регистры, ожидание
    { name: 'add a,a перенос+ноль', code: [0x87], set: { a: 0x80 },
      exp: { a: 0x00, cf: 1 }, cy: 4 },
    { name: 'adc a,a вдвигает сторож', code: [0x37, 0x8f], set: { a: 0x5a },
      exp: { a: 0xb5, cf: 0 }, cy: 4 + 4 },
    { name: 'add hl,hl перенос', code: [0x29], set: { h: 0x80, l: 0x00 },
      exp: { h: 0x00, l: 0x00, cf: 1 }, cy: 10 },
    { name: 'sub l / sbc a,h заём', code: [0x95, 0x9c], set: { a: 0x00, l: 0x01, h: 0x00 },
      // 0x00-0x01 = 0xFF с заёмом, затем 0xFF-0x00-заём = 0xFE уже без заёма
      exp: { a: 0xfe, cf: 0 }, cy: 4 + 4 },
    { name: 'такты ld a,(hl)/inc hl/ld (bc),a/inc bc/dec e',
      code: [0x7e, 0x23, 0x02, 0x03, 0x1d], set: { h: 0x90, l: 0x00, b: 0x91, c: 0x00, e: 2 },
      exp: { e: 1 }, cy: 7 + 5 + 7 + 5 + 5 },
  ];
  for (const t of cases) {
    for (let i = 0; i < t.code.length; i++) mem[0x9000 + i] = t.code[i];
    const c = new Cpu({ read: (a) => mem[a], write: (a, v) => { mem[a] = v; } }, io);
    c.pc = 0x9000;
    for (const k in t.set) c['set_' + k](t.set[k]);
    let cy = 0;
    for (let i = 0; i < t.code.length; i++) cy += c.instruction();
    for (const k in t.exp) {
      const got = k === 'cf' ? (c.cf ? 1 : 0) : c[k]();
      if (got !== t.exp[k])
        throw new Error(`самопроверка ядра «${t.name}»: ${k}=${got}, ждали ${t.exp[k]}`);
    }
    if (cy !== t.cy)
      throw new Error(`самопроверка ядра «${t.name}»: ${cy} тактов, ждали ${t.cy}`);
  }
  mem.fill(0);
}
selfTest();

// --- загрузка ---
const code = fs.readFileSync(cfg.codeFile);
mem.set(code, cfg.codeStart);
const lz = fs.readFileSync(cfg.lzFile);
mem.set(lz, cfg.lzStart);
mem.fill(0xA5, cfg.dstStart, cfg.dstStart + cfg.dstLen);   // мусор в приёмнике

cpu.pc = cfg.entry;
cpu.sp = cfg.sp;
cpu.set_h(cfg.lzStart >> 8); cpu.set_l(cfg.lzStart & 0xff);
cpu.set_d(cfg.dstStart >> 8); cpu.set_e(cfg.dstStart & 0xff);
// адрес возврата 0x0000 — по нему и останавливаемся
mem[cfg.sp - 1] = 0; mem[cfg.sp - 2] = 0; cpu.sp = cfg.sp - 2;

let cycles = 0, instr = 0;
const LIMIT = cfg.limit || 50e6;
while (cpu.pc !== 0) {
  cycles += cpu.instruction();
  if (++instr > LIMIT) break;
}

fs.writeFileSync(cfg.outFile, Buffer.from(mem.subarray(cfg.dstStart, cfg.dstStart + cfg.dstLen)));
let covered = 0;
for (let i = 0; i < wrote.length; i++) covered += wrote[i];
console.log(JSON.stringify({
  cycles, instr, reads, writes, covered, viol,
  lzUsed: lzHigh, lzLen: cfg.lzLen,
  finished: cpu.pc === 0, sp: cpu.sp, spExpected: cfg.sp,
}));
