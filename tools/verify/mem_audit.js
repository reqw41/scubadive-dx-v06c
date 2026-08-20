// ПЕРЕПИСЬ ВСЕХ 64 КБ: кто исполнялся, кто читался, кто записывался.
// ТОЛЬКО ЗАМЕР. Ничего не правит, образ не пересобирает.
//
// Итог складывается в двоичный файл счётчиков (по 4 массива на 65536 адресов),
// который потом разбирает tools/verify/mem_audit_report.js. Разделение нарочное:
// прогон спектра стоит минуты, а классификацию хочется переигрывать.
//
// ЧТО СЧИТАЕТСЯ
//   EXEC[a] — байт a входил в исполненную инструкцию (не «PC равнялся a», а
//             именно вхождение в тело инструкции: иначе операнды считались бы
//             неисполненными и всякая ld hl,nn выглядела бы мёртвой на 2/3).
//   RDAT[a] — чтений байта КАК ДАННЫХ. Выборка команды отделяется по окну
//             [PC, PC+len) текущей инструкции (урок №21 tool_defects:
//             memory.read зовётся и на выборке команды). Длина берётся из
//             таблицы i8080, а не угадывается.
//   WDAT[a] — записей (не стековых).
//   RSTK/WSTK — стековые обращения (флаг stackrq ядра).
//
// СПЕКТР СЦЕН обязан содержать сценарий, где действует проверяемое (урок №24).
// Поэтому здесь не «прогон подольше», а поимённый список фаз, и у КАЖДОЙ есть
// свидетель — число, которое обязано быть ненулевым. Пустая выборка = провал
// всего замера, а не тихий пропуск фазы.
//
//   node tools/verify/mem_audit.js [каталог_сборки]
//   MA_OUT=файл.bin   — куда сложить счётчики (по умолчанию build/audit/counters.bin)
//   MA_SCENES=a,b,c   — сузить список сцен (для отладки самого стенда)
"use strict";
const fs = require("fs"), path = require("path");
const { make, readSym } = require("./harness.js");
const { reachGame, swim, KEY } = require("./drive.js");
const ROOT = path.resolve(__dirname, "../..");
const DIR = process.argv[2] || `${ROOT}/build/prod_hw`;
const OUT = process.env.MA_OUT || `${ROOT}/build/audit/counters.bin`;
const rom = `${DIR}/scuba.rom`, sym1 = `${DIR}/scubacod1.sym`, sym0 = `${DIR}/scubacod0.sym`;
for (const f of [rom, sym1, sym0]) if (!fs.existsSync(f)) { console.log(`нет ${f}`); process.exit(2); }
const S = Object.assign({}, readSym(sym0), readSym(sym1));

// ---- длины инструкций i8080 (как в reserves_census.js) ----------------------
const ILEN = new Uint8Array(256).fill(1);
for (const o of [0x01,0x11,0x21,0x31,0x22,0x2a,0x32,0x3a,
                 0xc3,0xcb,0xcd,0xdd,0xed,0xfd,
                 0xc2,0xca,0xd2,0xda,0xe2,0xea,0xf2,0xfa,
                 0xc4,0xcc,0xd4,0xdc,0xe4,0xec,0xf4,0xfc]) ILEN[o] = 3;
for (const o of [0x06,0x0e,0x16,0x1e,0x26,0x2e,0x36,0x3e,
                 0xc6,0xce,0xd6,0xde,0xe6,0xee,0xf6,0xfe,0xd3,0xdb]) ILEN[o] = 2;

const EXEC = new Uint32Array(0x10000);
const RDAT = new Uint32Array(0x10000);
const WDAT = new Uint32Array(0x10000);
const RSTK = new Uint32Array(0x10000);
const WSTK = new Uint32Array(0x10000);
// Окно ДО РАСКЛАДКИ ломтей: бут, меню, первый заход в Game. Кодовое тело,
// холодное в геймплее, может быть горячим в буте (урок №14), и данные тоже:
// distinguishing нужен отдельный массив, иначе «мёртвое в игре» примут за
// мёртвое вообще.
const EXEC_PRE = new Uint32Array(0x10000);
const RDAT_PRE = new Uint32Array(0x10000);
// ЧТЕНИЯ ТРАНСПОРТА СЧИТАЮТСЯ ОТДЕЛЬНО, И ЭТО НЕ ПРИДИРКА. Бут переносит весь
// упакованный блок 1 из образа в 0xC000-LZSIZE1 (цикл Init_1), а потом dzx0
// прочитывает его целиком при распаковке. В итоге КАЖДЫЙ байт образа получает
// чтение, и мера «блок никто не читает» становится тождественно ложной: первый
// же прогон дал 44 813 «прочитанных» байт на одном только буте, то есть ровно
// размер образа — а число, равное размеру окна, само по себе улика против меры
// (урок №29). Транспорт — это перенос, а не употребление, и в «живость» блока
// он не засчитывается.
const RDAT_MOVE = new Uint32Array(0x10000);
const TRANSPORT = [];               // [lo, hi) диапазоны PC, чьи чтения — транспорт
if (S.Init_1 != null && S.RestartInt != null) TRANSPORT.push([S.Init_1, S.RestartInt]);
if (S.dzx0 != null && S.snd_start != null) TRANSPORT.push([S.dzx0, S.snd_start]);
if (TRANSPORT.length !== 2) { console.log("не нашлись границы транспорта в .sym — замер недействителен"); process.exit(2); }
const isMove = pc => (pc >= TRANSPORT[0][0] && pc < TRANSPORT[0][1]) ||
                     (pc >= TRANSPORT[1][0] && pc < TRANSPORT[1][1]);
let minSp = 0x10000;

// Ставит перепись на стенд. Возвращает функцию-выключатель окна «до раскладки».
function instrument(m, preFlagRef) {
  let curPc = 0, curLen = 1;
  const origRead = m.memory.read.bind(m.memory);
  m.memory.read = (a, st) => {
    const ad = a & 0xffff;
    if (st) RSTK[ad]++;
    else if (!(ad >= curPc && ad < curPc + curLen)) {
      if (isMove(curPc)) RDAT_MOVE[ad]++;
      else { RDAT[ad]++; if (preFlagRef.pre) RDAT_PRE[ad]++; }
    }
    return origRead(a, st);
  };
  const origWrite = m.memory.write.bind(m.memory);
  m.memory.write = (a, v, st) => {
    const ad = a & 0xffff;
    if (st) WSTK[ad]++; else WDAT[ad]++;
    return origWrite(a, v, st);
  };
  const origCb = m.v06c.check_breakpoint;
  m.v06c.check_breakpoint = () => {
    const pc = m.cpu.pc & 0xffff;
    const len = ILEN[origRead(pc, false) & 0xff];
    curPc = pc; curLen = len;
    for (let i = 0; i < len; i++) {
      EXEC[(pc + i) & 0xffff]++;
      if (preFlagRef.pre) EXEC_PRE[(pc + i) & 0xffff]++;
    }
    const sp = m.cpu.sp & 0xffff;
    if (sp < minSp) minSp = sp;
    return origCb();
  };
}

// Общий preHook: вешает перепись ДО бута. Крючки ставятся здесь, а не после
// reachGame, потому что бут и меню исполняются внутри reachGame — перепись,
// начатая позже, их не увидит вовсе.
function pre(ref) {
  return (m, SS) => {
    instrument(m, ref);
    // окно «до раскладки» закрывается ПЕРВЫМ ТИКОМ главного цикла, а не входом
    // в Game: между ними работают ZoneCopy, постановка уровня и прерывание.
    m.onPc(SS.LD9C0, () => { ref.pre = false; });
  };
}

const witness = {};                 // имя сцены -> свидетель (число, обязано быть > 0)
const scenes = {};

// --- (1) БУТ И МЕНЮ: без входа в игру ---------------------------------------
// Отдельная сцена нужна потому, что reachGame проскакивает меню за считанные
// кадры. Здесь меню живёт долго: перебираются все четыре уровня, жмётся ENTER,
// крутится ожидание. Без этой фазы «строки меню мертвы» было бы утверждением о
// пустой выборке.
scenes["бут+меню"] = () => {
  const ref = { pre: true };
  const m = make(rom, { cpu: "i8080" });
  instrument(m, ref);
  let menu = 0;
  if (S.LEE2C != null) m.onPc(S.LEE2C, () => { menu++; });
  for (let i = 0; i < 400 && !menu; i++) m.step();
  for (const k of [KEY.D1, KEY.D2, KEY.D3, KEY.D4, KEY.D1]) {
    m.key(k, true); m.run(6); m.key(k, false); m.run(40);
  }
  m.run(200);
  witness["бут+меню"] = `заходов в экран меню ${menu}`;
  return menu > 0;
};

// --- (2) ЗАПЛЫВ ПО ВОСЬМИ НАПРАВЛЕНИЯМ + ГИБЕЛЬ ------------------------------
scenes["заплыв+гибель"] = () => {
  const ref = { pre: true };
  const g = reachGame(rom, sym1, { cpu: "i8080", level: 1, seed: 0x0167, preHook: pre(ref) });
  let t = 0, deaths = 0;
  g.m.onPc(S.LD9C0, () => { t++; });
  if (S.LE848 != null) g.m.onPc(S.LE848, () => { deaths++; });
  swim(g, { passes: 2, frames: 40 });
  // БЮДЖЕТ СЧИТАЕТСЯ В КАДРАХ, А НЕ В «ПОКА НЕ НАБЕРЁТСЯ ТИКОВ». После гибели
  // и перехода в game over главный цикл LD9C0 больше не крутится, тиков не
  // прибавляется — и цикл «пока t < N» вырождается в холостой прогон на весь
  // предохранитель (первый заход простоял 16 минут на одной сцене).
  let q = 0; while (t < 2500 && q < 3000) { g.m.step(); q++; }
  witness["заплыв+гибель"] = `тиков ${t}, заходов в ограничитель анимации LE848 ${deaths}`;
  return t > 1000;
};

// --- (3) ДНО: спуск до упора и смерть у кромки ------------------------------
scenes["дно+смерть"] = () => {
  const ref = { pre: true };
  const g = reachGame(rom, sym1, { cpu: "i8080", level: 1, seed: 0x0167, preHook: pre(ref) });
  const D = S.DiverObj, m = g.m;
  let t = 0; m.onPc(S.LD9C0, () => { t++; });
  const step = n => { for (let i = 0; i < n; i++) m.step(); };
  const hold = (k, f) => { m.key(k, true); step(f); m.key(k, false); step(4); };
  // КЛАВИША ПОГРУЖЕНИЯ — «ВВЕРХ» (урок раздела 33.20 плана): DOWN не двигает
  // дайвера ни на пиксель, и «смерть на дне» была бы смертью у лодки.
  swim(g, { passes: 1, frames: 20, noDeath: true });
  let deepest = m.rd(D + 0x14), stall = 0;
  for (let i = 0; i < 14 && stall < 3; i++) {
    hold(KEY.UP, 90);
    const y = m.rd(D + 0x14);
    if (y > deepest) { deepest = y; stall = 0; } else stall++;
  }
  const rowBottom = m.rd(D + 0x14);
  for (let d = 0; d < 3; d++) {
    m.wr(S.LIVES, 3);
    for (let i = 0; i < 700; i++) {
      if ((i & 31) === 0) m.wr(D + 0x10, m.rd(D + 0x10) | 0x20);
      if (i === 0) m.key(KEY.UP, true);
      m.step();
    }
    m.key(KEY.UP, false); step(4);
    hold(KEY.UP, 120);
  }
  witness["дно+смерть"] = `тиков ${t}, строка дайвера на дне ${rowBottom} (максимум ${deepest})`;
  return t > 500 && rowBottom > 30;
};

// --- (4) СПАВН АКУЛЫ --------------------------------------------------------
// Возить дайвера через карту до акулы не выходит (раздел 33.25 плана), поэтому
// координаты акул подсаживаются к координатам того, кого РЕАЛЬНО рисуют —
// приём из pool_overflow_gate.js. Свидетель — чтения спрайтов акулы.
scenes["акула"] = () => {
  const ref = { pre: true };
  let sharkReads = 0, drawnAt = null;
  // АДРЕСА СПРАЙТОВ АКУЛЫ БЕРУТСЯ ИЗ ТАБЛИЦЫ ЗАПИСЕЙ ИСХОДНИКА, а не из имён
  // .sym: спрайты названы только в комментарии (`DEFW L70B7,... ; Shark`),
  // а метки у них безымянные L-адреса. Первый заход искал метки /^Shark/ —
  // их нет ни одной, и свидетель выходил тождественным нулём: сцена
  // объявлялась пустой не потому, что акулы нет, а потому что мера слепа.
  const SHARK = [];
  const codb = fs.readFileSync(`${ROOT}/src8080/scubacodb.asm`, "utf8").split("\n");
  for (const l of codb) {
    const mm = l.match(/^\s*DEFW\s+((?:L[0-9A-Fa-f]{4}\s*,\s*)+L[0-9A-Fa-f]{4})\s*;\s*(.+?)\s*$/);
    if (!mm || !/shark/i.test(mm[2])) continue;
    for (const n of mm[1].split(/\s*,\s*/)) if (S[n] != null) SHARK.push(S[n]);
  }
  if (!SHARK.length) { console.log("не найдены спрайты акулы в исходнике — сцена недействительна"); return false; }
  const g = reachGame(rom, sym1, { cpu: "i8080", level: 4, seed: 0x0167,
    preHook: (m, SS) => {
      instrument(m, ref);
      m.onPc(SS.LD9C0, () => { ref.pre = false; });
      // КООРДИНАТЫ БЕРУТСЯ У МЕДУЗЫ/КРУГЛОЙ РЫБЫ (шаблоны LC0A2/LC0B2), а НЕ у
      // первого попавшегося рисуемого. Первый заход брал любого — и попадал на
      // ЛОДКУ, которая стоит на поверхности далеко от дайвера: акулу подсаживали
      // туда, где её никто не увидит, и свидетель выходил ноль. Рецепт взят из
      // рабочего гейта tools/verify/pool_overflow_gate.js.
      if (SS.LB655_marked != null) m.onPc(SS.LB655_marked, () => {
        const ix = m.rd(SS.z80_ix) | (m.rd(SS.z80_ix + 1) << 8);
        const iy = m.rd(ix + 0x13) | (m.rd(ix + 0x14) << 8);
        if (iy === SS.LC0A2 || iy === SS.LC0B2) drawnAt = [m.rd(ix), m.rd(ix + 1)];
      });
      if (SS.i80_ldir_1 != null) m.onPc(SS.i80_ldir_1, () => {
        const hl = m.cpu.hl() & 0xffff;
        for (const a of SHARK) if (hl >= a && hl - a < 512) { sharkReads++; break; }
      });
    } });
  const m = g.m;
  let t = 0;
  m.onPc(S.LD9C0, () => {
    t++;
    if (t % 30 || !drawnAt) return;
    for (const nm of ["RecsAddrII", "RecsAddrIII", "RecsAddrIV"]) {
      const p = S[nm]; if (p == null) continue;
      const b = m.rd(p) | (m.rd(p + 1) << 8);
      for (let k = 0; k < 8; k++) {
        const r = b + k * 26;
        if ((m.rd(r + 19) | (m.rd(r + 20) << 8)) === S.LC102) { m.wr(r, drawnAt[0]); m.wr(r + 1, drawnAt[1]); }
      }
    }
  });
  swim(g, { passes: 1, frames: 20, noDeath: true });
  let q = 0; while (t < 1500 && q < 2500) { m.step(); q++; }
  witness["акула"] = `тиков ${t}, чтений спрайтов акулы ${sharkReads}`;
  return sharkReads > 0;
};

// --- (5) УРОВНИ 2,3,4 НА ГЛУБИНЕ -------------------------------------------
for (const [nm, lvl, row] of [["уровень 2", 2, null], ["уровень 3", 3, null],
                              ["уровень 4 глубина", 4, 9], ["уровень 1 глубина", 1, 9]])
  scenes[nm] = () => {
    const ref = { pre: true };
    const g = reachGame(rom, sym1, { cpu: "i8080", level: lvl, seed: 0x0167, preHook: pre(ref) });
    let t = 0;
    g.m.onPc(S.LD9C0, () => { t++; if (row !== null) g.m.wr(S.L5B03 + 1, row); });
    swim(g, { passes: 1, frames: 30, noDeath: true });
    let q = 0; while (t < 1200 && q < 2000) { g.m.step(); q++; }
    witness[nm] = `тиков ${t}`;
    return t > 500;
  };

// --- (6) КОНЕЦ ПАРТИИ И ВОЗВРАТ В МЕНЮ --------------------------------------
// Обязательная фаза: только здесь мог бы ожить распаковщик dzx0 (перерисовка
// картинки), таблица рекордов и печать «GAME OVER». Без неё вывод «dzx0 мёртв»
// был бы утверждением о неполной выборке.
scenes["game over"] = () => {
  const ref = { pre: true };
  const g = reachGame(rom, sym1, { cpu: "i8080", level: 1, seed: 0x0167, preHook: pre(ref) });
  const m = g.m;
  let t = 0, go = 0, menu = 0;
  m.onPc(S.LD9C0, () => { t++; });
  if (S.LEA7A != null) m.onPc(S.LEA7A, () => { go++; });
  if (S.LEE2C != null) m.onPc(S.LEE2C, () => { menu++; });
  swim(g, { passes: 1, frames: 20, noDeath: true });
  m.wr(S.SCORE, 0x99); m.wr(S.SCORE + 1, 0x99);    // рекорд: тракт HISCORE
  // ГИБЕЛЬ ВЫЗЫВАЕТСЯ БИТОМ АГОНИИ, А НЕ ОБНУЛЕНИЕМ КИСЛОРОДА. Первый заход
  // ставил OXYGEN=0 и ждал 6000 кадров: конец партии не наступил ни разу
  // (10 989 тиков, LEA7A ноль). Механика гибели в проекте одна и проверенная —
  // бит 5 в DiverObj+$10, как в swim() и bottom_probe.js; LIVES=1 превращает
  // очередную гибель в конец партии (LDA1E: `CP $01 / jp Z,LDA33`).
  m.wr(S.LIVES, 1);
  for (let i = 0; i < 4000 && !go; i++) {
    if ((i & 31) === 0) { m.wr(S.LIVES, 1); m.wr(S.DiverObj + 0x10, m.rd(S.DiverObj + 0x10) | 0x20); }
    m.step();
  }
  for (let i = 0; i < 600; i++) m.step();
  // из меню — снова в игру, чтобы вторая постановка уровня тоже попала в выборку
  m.key(KEY.UP, true); m.run(20); m.key(KEY.UP, false); m.run(300);
  witness["game over"] = `тиков ${t}, заходов в конец партии ${go}, возвратов в меню ${menu}`;
  return go > 0 && menu > 0;
};

// ---- прогон ----------------------------------------------------------------
const only = process.env.MA_SCENES ? new Set(process.env.MA_SCENES.split(",")) : null;
let bad = 0;
for (const [nm, fn] of Object.entries(scenes)) {
  if (only && !only.has(nm)) continue;
  const t0 = Date.now();
  let ok = false, err = null;
  try { ok = fn(); } catch (e) { err = e; }
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`  ${ok ? "ok    " : "ПУСТО "} ${nm.padEnd(20)} ${witness[nm] || (err && err.message) || "—"}  [${dt} с]`);
  if (!ok) bad++;
}
if (bad) {
  console.log(`ПУСТАЯ ВЫБОРКА в ${bad} сценах — вывод «мёртв» по этому прогону недействителен`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
const buf = Buffer.alloc(0x10000 * 4 * 8);
const put = (arr, i) => { for (let a = 0; a < 0x10000; a++) buf.writeUInt32LE(Math.min(arr[a], 0xffffffff), (i * 0x10000 + a) * 4); };
put(EXEC, 0); put(RDAT, 1); put(WDAT, 2); put(RSTK, 3); put(WSTK, 4);
put(EXEC_PRE, 5); put(RDAT_PRE, 6); put(RDAT_MOVE, 7);
fs.writeFileSync(OUT, buf);
let e = 0, r = 0, w = 0;
for (let a = 0; a < 0x10000; a++) { if (EXEC[a]) e++; if (RDAT[a]) r++; if (WDAT[a]) w++; }
console.log(`счётчики -> ${OUT}`);
console.log(`  исполнялось байт ${e}, читалось как данные ${r}, записывалось ${w}; минимум SP 0x${minSp.toString(16)}`);
