// ПРОГОН НАШЕЙ КАССЕТЫ В vector06js БЕЗ БРАУЗЕРА.
//
//   node tools/cas/run_tape.js --wav build/cas/scuba_rom.wav --rom build/prod/scuba_splash.rom \
//        --seconds 520 --shots 5,300,500 --out build/cas/shots/tape
//
// Поднимает ядро vector06js со ШТАТНЫМ ПЗУ boots.bin, жмёт F1+СБР (загрузка с
// магнитофона), подаёт WAV на вход и крутит кадры. По ходу считает, сколько
// страниц образа уже легло в ОЗУ правильно; в конце сверяет ОЗУ с образом байт в
// байт и делает БЛК+СБР — игра обязана стартовать.
//
// Путь к эмулятору: $V06JS или ~/projects/vector06js.
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path'), zlib = require('zlib');
const ROOT = path.dirname(path.dirname(__dirname));
const V06JS = process.env.V06JS || path.join(process.env.HOME, 'projects', 'vector06js');
const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
const WAV = path.resolve(ROOT, args.wav || 'build/cas/scuba_rom.wav');
const ROM = path.resolve(ROOT, args.rom || 'build/prod/scuba_splash.rom');
const ORG = parseInt(args.org || '0x100');
const SECONDS = parseFloat(args.seconds || '520');
const SHOTS = (args.shots || '').split(',').filter(x => x.length).map(parseFloat);
const OUT = args.out ? path.resolve(ROOT, args.out) : null;
const IMAGE = fs.readFileSync(ROM);

function ctx2d() { return { createImageData: (w, h) => ({ data: new Uint8ClampedArray((w || 512) * (h || 256) * 4), width: w, height: h }),
  getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray((w || 512) * (h || 256) * 4), width: w, height: h }),
  putImageData() {}, drawImage() {}, fillRect() {}, clearRect() {}, scale() {}, setTransform() {} }; }
function canvas() { return { width: 512, height: 256, style: {}, getContext: () => ctx2d(), addEventListener() {} }; }
global.window = global;
if (!global.navigator) global.navigator = {};
global.document = { getElementById: () => canvas(), createElement: () => canvas() };
for (const f of ['i8080-js/i8080_trace.js', 'i8080-js/i8080_disasm.js', 'i8080-js/i8080.js',
                 'src/fili.js', 'src/ay.js', 'src/fd1793.js', 'src/fddimage.js', 'src/i8253.js',
                 'src/io.js', 'src/keyboard.js', 'src/memory.js', 'src/sound.js', 'src/tv.js',
                 'src/wavplayer.js'])
    vm.runInThisContext(fs.readFileSync(path.join(V06JS, f), 'utf8'), { filename: f });
const memory = new Memory(), keyboard = new Keyboard(), timer = new I8253(), ay = new AY();
const floppy = new (Floppy().FD1793)(), tape_player = new WavPlayer();
const io = new IO(keyboard, timer, memory, ay, floppy, tape_player);
const cpu = new I8080(memory, io), v06c = new Vector06c(cpu, memory, io, ay, tape_player);
const SCREEN_W = 512 + 64, SCREEN_H = 256 + 16 + 16;
v06c.bmp = new Uint32Array(SCREEN_W * SCREEN_H); v06c.Palette = io.Palette;
v06c.check_breakpoint = () => false; v06c.dbg = null; v06c.soundnik.soundStep = function () {};
const boot = new Uint8Array(fs.readFileSync(path.join(V06JS, 'boot/boots.bin')));
function reset(withBoot) { if (withBoot) memory.attach_boot(boot); else memory.detach_boot();
  cpu.pc = 0; cpu.sp = 0; cpu.iff = false;
  io.Timer.Write(3, 0x36); io.Timer.Write(3, 0x76); io.Timer.Write(3, 0xb6);
  ay.reset(); v06c.instr_time = 0; v06c.irq = false; if (v06c.filler) v06c.filler.reset(); }
function wavSamples(file) { const d = fs.readFileSync(file); let i = 12, rate = 0;
  while (i < d.length) { const cid = d.toString('ascii', i, i + 4), sz = d.readUInt32LE(i + 4);
    if (cid === 'fmt ') rate = d.readUInt32LE(i + 12);
    if (cid === 'data') return { sampleRate: rate, bitsPerSample: 8, dataSamples: new Uint8Array(d.subarray(i + 8, i + 8 + sz)) };
    i += 8 + sz + (sz & 1); } throw new Error('в WAV нет чанка data'); }
const RIDX = new Uint32Array(0x10000);
for (let a = 0; a < 0x10000; a++) RIDX[a] = memory.tobank(a);
const rd = a => memory.bytes[RIDX[a & 0xffff]];
const CRCT = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
function crc32(b) { let c = -1; for (let i = 0; i < b.length; i++) c = CRCT[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(t, d) { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t, 'ascii'), d]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, c]); }
function shot(file) { const w = SCREEN_W, h = SCREEN_H, rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) { const p = v06c.bmp[i] >>> 0;
    rgba[i * 4] = p & 0xFF; rgba[i * 4 + 1] = (p >> 8) & 0xFF; rgba[i * 4 + 2] = (p >> 16) & 0xFF; rgba[i * 4 + 3] = 0xFF; }
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])); }
// сколько страниц образа уже лежит в ОЗУ правильно
function pagesOk() { let ok = 0;
  for (let p = 0; p * 256 < IMAGE.length; p++) { let good = true;
    for (let i = 0; i < 256; i++) if (rd(ORG + p * 256 + i) !== IMAGE[p * 256 + i]) { good = false; break; }
    if (good) ok++; }
  return ok; }
const wav = wavSamples(WAV);
console.log(`лента ${path.basename(WAV)}: ${wav.dataSamples.length} сэмплов, ${wav.sampleRate} Гц, ${(wav.dataSamples.length / wav.sampleRate).toFixed(1)} с`);
console.log(`образ ${path.basename(ROM)}: ${IMAGE.length} Б (${Math.ceil(IMAGE.length / 256)} страниц) с 0x${ORG.toString(16)}`);
reset(true);
// F1 держим 100 кадров: ПЗУ опрашивает клавиши не сразу — сначала чистит ОЗУ
keyboard.applyKey(112, false);
for (let f = 0; f < 100; f++) v06c.oneInterrupt(true);
keyboard.applyKey(112, true);
tape_player.setwav(wav);
const FRAMES = Math.round(SECONDS * 50), shots = SHOTS.map(s => Math.round(s * 50));
let prev = -1;
for (let f = 0; f < FRAMES; f++) {
  v06c.oneInterrupt(true);
  if (f % 250 === 0) { const ok = pagesOk();
    if (ok !== prev) { console.log(`  ${(f / 50).toFixed(1).padStart(6)} с: страниц легло ${ok} из ${Math.ceil(IMAGE.length / 256)}`); prev = ok; } }
  if (shots.includes(f) && OUT) shot(OUT + '_' + Math.round(f / 50) + 's.png');
}
const ok = pagesOk(), total = Math.ceil(IMAGE.length / 256);
console.log(`ИТОГ ЗАГРУЗКИ: ${ok} страниц из ${total}${ok === total ? ' — ОБРАЗ В ОЗУ БАЙТ В БАЙТ' : ''}`);
if (ok !== total) { let first = -1;
  for (let p = 0; p * 256 < IMAGE.length && first < 0; p++)
    for (let i = 0; i < 256; i++) if (rd(ORG + p * 256 + i) !== IMAGE[p * 256 + i]) { first = ORG + p * 256 + i; break; }
  console.log(`  первое расхождение по адресу 0x${first.toString(16)}`); }
// БЛК+СБР: снять ПЗУ и стартовать с 0x0000 -> игра
reset(false); cpu.pc = ORG;
for (let f = 0; f < 200; f++) v06c.oneInterrupt(true);
if (OUT) shot(OUT + '_start.png');
console.log(`после старта: PC=0x${(cpu.pc & 0xffff).toString(16)}`);
process.exit(ok === total ? 0 : 1);
