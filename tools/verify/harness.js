// Общая обвязка эмулятора Вектора-06Ц для Scuba Dive.
// Один и тот же стенд гоняет ДВЕ сборки:
//   cpu:"z80"   — оригинальный порт nzeemin (эталон/оракул),
//   cpu:"i8080" — нашу рекомпиляцию.
// Железо (видео, i8253, порты, клавиатура) в обоих случаях одно и то же —
// vector06js, поэтому расхождение может быть только в коде игры.
//
// Заимствовано из ~/projects/kvalley-v06c/tools/verify/beam_harness.js и
// legacy/tools/z80vector.js (обвязка vm-контекста, патченное Z80-ядро).
"use strict";
const fs = require("fs"), vm = require("vm"), path = require("path"), zlib = require("zlib");

// Ядро эмулятора — вложенная копия (tools/verify/vendor/, см. NOTICE.md);
// свой клон — через переменные окружения V06JS / Z80SRC.
const V06JS = process.env.V06JS || path.join(__dirname, "vendor", "vector06js");
const Z80SRC = process.env.Z80SRC || path.join(__dirname, "vendor", "Z80_v06.js");

const FRAME_CYCLES = 59904;   // такты Вектора в кадре (312 строк * 768 пикселей / 4)

function makeCtx() {
  const g = {};
  g.window = g;
  g.document = { createElement: () => fc(), getElementById: () => fc() };
  function fcx() {
    return { createImageData: (w, h) => ({ data: new Uint8ClampedArray((w || 1) * (h || 1) * 4), width: w, height: h }),
             putImageData: () => {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }), drawImage: () => {},
             fillRect: () => {}, save: () => {}, restore: () => {}, scale: () => {}, setTransform: () => {} };
  }
  function fc() { return { width: 0, height: 0, style: {}, getContext: () => fcx() }; }
  g.requestAnimationFrame = () => 0; g.setTimeout = () => 0; g.print = () => 0;
  g.console = { log() {}, debug() {}, warn() {}, error() {}, info() {} };
  return vm.createContext(g);
}

// Разбор .sym от sjasmplus: "NAME: EQU 0x0000ABCD"
function readSym(symPath) {
  const L = {};
  for (const line of fs.readFileSync(symPath, "latin1").split("\n")) {
    const m = line.match(/^(\S+):\s+EQU\s+0x([0-9A-Fa-f]+)\s*$/i);
    if (m) L[m[1]] = parseInt(m[2], 16) & 0xffff;
  }
  return L;
}

function make(romPath, opts) {
  opts = opts || {};
  const cpuKind = opts.cpu || "i8080";
  const ctx = makeCtx();
  const files = ["src/fili.js", "src/ay.js", "src/fd1793.js", "src/fddimage.js", "src/i8253.js",
                 "src/io.js", "src/keyboard.js", "src/memory.js", "src/sound.js", "src/tv.js"];
  if (cpuKind === "i8080") files.unshift("i8080-js/i8080_trace.js", "i8080-js/i8080_disasm.js", "i8080-js/i8080.js");
  for (const f of files) vm.runInContext(fs.readFileSync(V06JS + "/" + f, "utf8"), ctx, { filename: f });

  const memory = new ctx.Memory(), keyboard = new ctx.Keyboard(), timer = new ctx.I8253(),
        ay = new ctx.AY(), floppy = new (ctx.Floppy().FD1793)();
  const io = new ctx.IO(keyboard, timer, memory, ay, floppy);
  io.Palette = new Array(16).fill(0xff000000);

  let cpu;
  if (cpuKind === "i8080") {
    cpu = new ctx.I8080(memory, io);
  } else {
    const Z80 = require(Z80SRC);
    cpu = new Z80({
      mem_read: a => memory.read(a & 0xffff, false),
      mem_write: (a, v) => memory.write(a & 0xffff, v & 0xff, false),
      io_read: p => io.input(p & 0xff),
      io_write: (p, v) => io.output(p & 0xff, v & 0xff),
    });
  }
  const tape = { advance: () => {}, sample: 0, reset: () => {} };
  const v06c = new ctx.Vector06c(cpu, memory, io, ay, tape);
  const W = 576, H = 288;
  v06c.bmp = new Uint32Array(W * H);
  v06c.displayFrame = () => {};
  v06c.check_breakpoint = () => false;
  v06c.dbg = null;

  // Образ .rom Вектора грузится с 0x0100 (формат как у Z80-версии).
  // opts.ramFill: чем набить ОСТАЛЬНУЮ память до загрузки образа. Эмулятор по
  // умолчанию обнуляет RAM, а на железе там мусор — прогон с 0xFF/случайным
  // мусором ловит зависимости от нулей, которых на Векторе никто не гарантирует.
  const img = new Uint8Array(fs.readFileSync(romPath));
  memory.init_from_array(img.subarray(0, 0x10000 - 0x100), 0x100);
  // ЗАМЕРЕНО: Memory.init_from_array СНАЧАЛА обнуляет всю память и только потом
  // кладёт образ (vector06js/src/memory.js). Пока набивка стояла ДО загрузки,
  // опция ramFill была мертва: гейт с ней мерил чистые нули и зеленел, даже когда
  // проверяемая чистка экрана была выключена подсадкой. Поэтому набиваем ПОСЛЕ
  // загрузки и только там, куда образ не лёг.
  if (opts.ramFill != null) {
    let seed = 0x1234;
    const lo = 0x100, hi = Math.min(0x10000, 0x100 + img.length);
    for (let a = 0; a < 0x10000; a++) {
      if (a >= lo && a < hi) continue;
      let v = opts.ramFill;
      if (v === "rnd") { seed = (seed * 1103515245 + 12345) & 0x7fffffff; v = (seed >> 16) & 0xff; }
      memory.bytes[memory.tobank(a)] = v & 0xff;
    }
  }
  memory.detach_boot && memory.detach_boot();
  cpu.pc = 0x100; cpu.sp = 0x0100; cpu.iff = false;

  const rd = a => memory.bytes[memory.tobank(a & 0xffff)];
  const rdw = a => rd(a) | (rd(a + 1) << 8);
  const wr = (a, v) => { memory.bytes[memory.tobank(a & 0xffff)] = v & 0xff; };

  const key = (code, down) => {
    const e = { which: code, keyCode: code, preventDefault() {}, stopPropagation() {} };
    if (down) keyboard.keyDown(e); else keyboard.keyUp(e);
  };

  // ---- крючки по PC ------------------------------------------------------
  // check_breakpoint зовётся эмулятором ПЕРЕД каждой инструкцией, cpu.pc уже
  // указывает на неё — это и есть наш общий крючок (профиль + точки сценария).
  const pcHooks = new Map();          // addr -> [fn,...]
  let profile = null;                 // Uint32Array(65536) счётчик исполнений
  let instrCount = 0;
  v06c.check_breakpoint = () => {
    const pc = cpu.pc & 0xffff;
    instrCount++;
    if (profile) profile[pc]++;
    const h = pcHooks.get(pc);
    if (h) for (const f of h) f(pc, cpu);
    return false;
  };
  const onPc = (addr, fn) => {
    addr &= 0xffff;
    if (!pcHooks.has(addr)) pcHooks.set(addr, []);
    pcHooks.get(addr).push(fn);
  };
  const profileOn = () => { profile = new Uint32Array(0x10000); };
  const profileGet = () => profile;

  // Сторож записи по адресу: обёртка вокруг Memory.write. Оба ядра пишут через
  // неё (i8080 — memory_write_byte, Z80 — обёртка mem_write в make()).
  const watches = new Map();          // addr -> fn(addr, val, pc)
  const origWrite = memory.write.bind(memory);
  memory.write = (a, v, st) => {
    const w = watches.get(a & 0xffff);
    if (w) w(a & 0xffff, v & 0xff, cpu.pc & 0xffff);
    return origWrite(a, v, st);
  };
  const onWrite = (addr, fn) => { watches.set(addr & 0xffff, fn); };

  let frame = 0;
  const step = () => { v06c.oneInterrupt(true); frame++; };
  const run = n => { for (let i = 0; i < n; i++) step(); };
  // Прогон до попадания PC в адрес: единственный способ синхронизировать две
  // сборки, идущие с РАЗНОЙ скоростью (в кадрах они не совпадут никогда).
  const runUntilPc = (addr, maxFrames) => {
    let hit = false;
    const off = () => { hit = true; };
    onPc(addr, off);
    const lim = maxFrames || 2000;
    for (let i = 0; i < lim && !hit; i++) step();
    const arr = pcHooks.get(addr & 0xffff);
    arr.splice(arr.indexOf(off), 1);
    if (!hit) throw new Error("PC не дошёл до 0x" + (addr & 0xffff).toString(16) + " за " + lim + " кадров");
    return frame;
  };

  return { ctx, memory, io, keyboard, timer, ay, cpu, v06c, rd, rdw, wr, key, step, run,
           onPc, runUntilPc, onWrite, profileOn, profileGet, get instrCount() { return instrCount; },
           get frame() { return frame; }, W, H, FRAME_CYCLES };
}

module.exports = { make, readSym, FRAME_CYCLES, V06JS };
