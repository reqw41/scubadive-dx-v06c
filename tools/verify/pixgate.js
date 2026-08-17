// ПИКСЕЛЬ-ГЕЙТ: покадровая (по игровым тикам) сверка ВИДЕОПАМЯТИ нашей
// i8080-сборки с эталонной Z80. Допуск НОЛЬ.
//
// Зачем отдельно от lockstep: lockstep сверяет игровые ПЕРЕМЕННЫЕ и был зелёным
// на 20601 тике, а на железе не рисовались раковины и герой. Значит логика жива,
// сломан рисующий путь — переменными его не поймать, нужен байт видеопамяти.
//
// ЧТО СРАВНИВАЕМ. У Вектора четыре плоскости: 0x8000, 0xA000, 0xC000, 0xE000.
// Палитра игры (scubacod0.asm PaletteGame) — четыре ОДИНАКОВЫХ четвёрки, значит
// старшие два бита индекса цвета не влияют: плоскости 0x8000 и 0xA000 НЕВИДИМЫ и
// used как обычная память (в них лежит код, и у сборок он законно разный).
// Видимы только 0xC000-0xDFFF (текст) и 0xE000-0xFFFF (игровое поле) — их и
// сверяем, 16384 байта.
//
// ОСЬ ВРЕМЕНИ — игровой тик (LD9C0), как в lockstep: сборки идут с разной
// скоростью, «кадр N» у них означает разные моменты игры.
//
//   node tools/verify/pixgate.js [сценарий...]
//   PIXGATE_TICKS=N     ограничить длину
//   PIXGATE_EVERY=N     сверять каждый N-й тик (по умолчанию 1)
//   PIXGATE_INJECT=1    негативный контроль: подсадить один изменённый байт
//   PIXGATE_EMPTY=1     негативный контроль: пустая выборка должна ПРОВАЛИТЬ
//   PIXGATE_PNG=dir     сложить PNG первого расхождения (эталон/наш/разница)
"use strict";
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { reachGame, stateReader } = require("./drive.js");
const { SCENARIOS } = require("./oracle.js");

const ROOT = path.resolve(__dirname, "../..");
const B = process.env.BUILD_DIR || "build";
const REF = { rom: ROOT + "/" + B + "/src_ref/scuba.rom", sym: ROOT + "/" + B + "/src_ref/scubacod1.sym", cpu: "z80" };
const OUR = { rom: ROOT + "/" + B + "/src8080/scuba.rom", sym: ROOT + "/" + B + "/src8080/scubacod1.sym", cpu: "i8080" };

const VLO = 0xc000, VHI = 0x10000, VLEN = VHI - VLO;   // видимые плоскости
const MAXTICKS = parseInt(process.env.PIXGATE_TICKS || "0", 10);
const EVERY = parseInt(process.env.PIXGATE_EVERY || "1", 10);
const INJECT = process.env.PIXGATE_INJECT === "1";
const EMPTY = process.env.PIXGATE_EMPTY === "1";
const PNGDIR = process.env.PIXGATE_PNG || "";

// сценарий «первый экран»: ничего не нажимаем, смотрим стартовую сцену
SCENARIOS.screen0 = { level: 1, seed: 0x0167, phases: [{ ticks: 600, keys: [] }] };

function runOne(build, sc, inject) {
  const snaps = [];
  const sched = [];
  for (const ph of sc.phases) for (let i = 0; i < ph.ticks; i++) sched.push(ph.keys || []);
  const total = MAXTICKS ? Math.min(sched.length, MAXTICKS) : sched.length;

  const preHook = (m, S) => {
    const KL0 = S.KeyLine0, KL7 = S.KeyLine7, JOE = S.JoystickE;
    if (JOE == null) throw new Error("нет метки JoystickE в .sym");
    let held = [], n = 0;
    m.onPc(S.LD9C0, () => {
      if (n % EVERY === 0) {
        const b = Buffer.alloc(VLEN);
        for (let a = 0; a < VLEN; a++) b[a] = m.rd(VLO + a);
        if (inject && snaps.length === 30) b[0x1234] ^= 0x40;   // подсадка дефекта
        snaps.push(b);
      }
      const keys = sched[n] || [];
      n++;
      for (const k of held) if (!keys.includes(k)) m.key(k, false);
      for (const k of keys) if (!held.includes(k)) m.key(k, true);
      held = keys.slice();
      let l0 = 0xff, l7 = 0xff;
      for (const k of keys) {
        if (k === 37) l0 &= ~0x10; else if (k === 39) l0 &= ~0x40;
        else if (k === 38) l0 &= ~0x20; else if (k === 40) l0 &= ~0x80;
        else if (k === 13) l0 &= ~0x04; else if (k === 9) l0 &= ~0x01;
        else if (k === 32) l7 &= ~0x80;
      }
      m.wr(KL0, l0 & 0xff); m.wr(KL7, l7 & 0xff);
      // JoystickE — ЧЕТВЁРТАЯ строка, которую читает DecodeKeyboard (теневая
      // копия порта 0x0E). Её тоже надо освежать потиково, и берём мы её не из
      // выдуманной раскладки, а прямо с порта — ровно то же значение, что
      // положит туда KEYINT, только не раз в кадр, а раз в тик.
      // Зачем: игра обновляет ячейку ТОЛЬКО в прерывании, то есть раз в КАДР, а
      // кадров на тик у сборок разное число — у эталона ~0.54, у нашей ~0.94.
      // ЗАМЕРЕНО на сценарии turn: отпускание RIGHT на тике 450 доезжало до
      // JoystickE у нашей сборки к тику 451, а у эталона только к 454, и эталон
      // докручивал угол на один шаг лишний. Гейт краснел на РАЗНИЦЕ СКОРОСТИ, а
      // не логики. KeyLine0/KeyLine7 прибивались с самого начала, а джойстиковую
      // строку завели позже (порт 0x0E, ld b,3 -> ld b,4) и прибить забыли.
      // Раскладку НЕ повторяем руками: эмулятор вешает на порт и клавиши, не
      // только стрелки (пробел приходит как Fire1), и выдуманная раскладка
      // разошлась бы с матрицей.
      m.wr(JOE, m.io.input(0x0e) & 0xff);
    });
  };
  const g = reachGame(build.rom, build.sym,
                      { cpu: build.cpu, level: sc.level, seed: sc.seed, preHook });
  // явный таймаут, см. тот же комментарий в lockstep.js
  const DEADLINE = (parseInt(process.env.PIXGATE_TIMEOUT || "180", 10)) * 1000;
  const t0 = Date.now();
  let guard = 0;
  const want = Math.ceil(total / EVERY);
  while (snaps.length < want && guard < 600000) {
    g.m.step(); guard++;
    if ((guard & 63) === 0 && Date.now() - t0 > DEADLINE)   // раз в 64 кадра: при 1023 проверка успевала сработать не всегда
      throw new Error(`ТАЙМАУТ ${DEADLINE / 1000} с: снято ${snaps.length} снимков из ${want}, ` +
                      `кадров ${g.m.frame}, PC=0x${(g.m.cpu.pc & 0xffff).toString(16)} — сборка встала`);
  }
  return { snaps, frames: g.m.frame };
}

// --- PNG видимых плоскостей (для приложения к отчёту) ------------------------
const crcT = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
function crc(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 0xff] ^ (c >>> 8); return c ^ 0xffffffff; }
function chunk(t, d) { const l = Buffer.alloc(4); l.writeUInt32BE(d.length);
  const tt = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(tt) >>> 0); return Buffer.concat([l, tt, c]); }
// Цвета из PaletteGame: 0=чёрный, 1=жёлтый(0xDB), 2=синий(0xBF), 3=красный(0x07).
// Байт палитры Вектора: биты 7-6 = синий, 5-3 = зелёный, 2-0 = красный.
function vecColor(p) { const b = ((p >> 6) & 3) * 85, g = ((p >> 3) & 7) * 36, r = (p & 7) * 36; return [r, g, b]; }
const PAL = [0x00, 0xDB, 0xBF, 0x07].map(vecColor);
function pngFromVram(buf, out) {
  const W = 256, H = 256;
  const rgb = Buffer.alloc(W * H * 3);
  // ВЕРТИКАЛЬНАЯ АДРЕСАЦИЯ. Экранная строка y читается из lo = 255 - y.
  // Откуда известно: (1) игра держит регистр скролла (порт 3) в 0xFF, а
  // развёртка защёлкивает его как fb_row в НАЧАЛЕ картинки и дальше убавляет
  // (vector06js/src/tv.js: fb_row = IO.ScrollStart() на растровой строке 22+18,
  // потом fb_row -= 1); (2) упаковщик заставки tools/splash/pack_screen.py, чей
  // вывод ПРОВЕРЕН НА ЖЕЛЕЗЕ, кладёт строку y в `col*256 + (255 - y)`.
  // Раньше здесь стояло (31 - r) & 255 — картинка выходила повёрнутой на 32
  // строки, и по такому рендеру геометрию читать нельзя. На сами гейты это не
  // влияло (они сверяют байты), но именно этот рендер один раз завёл в ошибку.
  for (let r = 0; r < H; r++) {
    const lo = (255 - r) & 255;
    for (let col = 0; col < 32; col++) {
      const p2 = buf[(0xc000 - VLO) + col * 256 + lo];   // плоскость 0xC000
      const p3 = buf[(0xe000 - VLO) + col * 256 + lo];   // плоскость 0xE000
      for (let bit = 7; bit >= 0; bit--) {
        const idx = (((p2 >> bit) & 1) << 1) | ((p3 >> bit) & 1);
        const c = PAL[idx];
        const x = col * 8 + (7 - bit), o = (r * W + x) * 3;
        rgb[o] = c[0]; rgb[o + 1] = c[1]; rgb[o + 2] = c[2];
      }
    }
  }
  const raw = Buffer.alloc(H * (W * 3 + 1));
  for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; rgb.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
}

const names = process.argv.slice(2).filter(x => !x.startsWith("-"));
const list = names.length ? names : ["screen0", ...Object.keys(SCENARIOS).filter(n => n !== "screen0")];
let fails = 0, compared = 0;
for (const name of list) {
  const sc = SCENARIOS[name];
  if (!sc) { console.log(`нет сценария ${name}`); fails++; continue; }
  const t0 = Date.now();
  const a = runOne(REF, sc, false);
  const b = runOne(OUR, sc, INJECT);
  if (EMPTY) { a.snaps = []; b.snaps = []; }
  const n = Math.min(a.snaps.length, b.snaps.length);
  if (n === 0) {
    console.log(`КРАСНЫЙ  ${name.padEnd(8)} ПУСТАЯ ВЫБОРКА: ни одного снимка видеопамяти`);
    fails++; continue;
  }
  let bad = -1, diffs = 0, first = -1;
  for (let i = 0; i < n; i++) {
    if (a.snaps[i].equals(b.snaps[i])) continue;
    bad = i;
    for (let k = 0; k < VLEN; k++) if (a.snaps[i][k] !== b.snaps[i][k]) { diffs++; if (first < 0) first = k; }
    break;
  }
  compared += n;
  if (bad < 0) {
    console.log(`ЗЕЛЁНЫЙ  ${name.padEnd(8)} ${String(n).padStart(5)} снимков видеопамяти совпали байт в байт; ${((Date.now() - t0) / 1000).toFixed(1)}с`);
  } else {
    fails++;
    const tick = bad * EVERY;
    const addr = VLO + first;
    const plane = addr >= 0xe000 ? "0xE000 (игровое поле)" : "0xC000 (текст)";
    const col = ((addr - (addr >= 0xe000 ? 0xe000 : 0xc000)) >> 8);
    const lo = addr & 0xff, row = (31 - lo) & 255;
    console.log(`КРАСНЫЙ  ${name.padEnd(8)} первое расхождение на тике ${tick}`);
    console.log(`  расходящихся байт в кадре: ${diffs} из ${VLEN}`);
    console.log(`  первый: 0x${addr.toString(16)} плоскость ${plane}, знакоместо-колонка ${col}, строка растра ${row}`);
    console.log(`  эталон=0x${a.snaps[bad][first].toString(16).padStart(2, "0")} наш=0x${b.snaps[bad][first].toString(16).padStart(2, "0")}`);
    // ещё несколько расхождений для картины
    let shown = 0;
    for (let k = first; k < VLEN && shown < 6; k++) {
      if (a.snaps[bad][k] === b.snaps[bad][k]) continue;
      const ad = VLO + k;
      console.log(`    0x${ad.toString(16)}: эталон=0x${a.snaps[bad][k].toString(16).padStart(2, "0")} наш=0x${b.snaps[bad][k].toString(16).padStart(2, "0")}`);
      shown++;
    }
    if (PNGDIR) {
      fs.mkdirSync(PNGDIR, { recursive: true });
      pngFromVram(a.snaps[bad], `${PNGDIR}/${name}_t${tick}_ref.png`);
      pngFromVram(b.snaps[bad], `${PNGDIR}/${name}_t${tick}_our.png`);
      console.log(`  PNG: ${PNGDIR}/${name}_t${tick}_{ref,our}.png`);
    }
  }
}
console.log(`\nитог: сценариев ${list.length}, красных ${fails}, сверено снимков ${compared}`);
if (compared === 0 && fails === 0) { console.log("ГЕЙТ НЕДЕЙСТВИТЕЛЕН: выборка пуста, а он молчит"); process.exit(2); }
process.exit(fails ? 1 : 0);
