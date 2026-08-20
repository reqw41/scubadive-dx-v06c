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
// ТО ЖЕ САМОЕ ПРО ЗАПИСИ, и это не симметрия ради красоты. Распаковщик dzx0
// ПИШЕТ распакованный блок 1 по его рабочим адресам — то есть кладёт весь образ
// в память. Считая эти записи, мера объявляет «записанным» каждый байт образа:
// первый разбор дал 64 758 записанных байт (весь образ плюс видеопамять) и ноль
// мёртвых блоков из 1115. Записи транспорта — это укладка образа, а не работа
// игры с данными.
const WDAT_MOVE = new Uint32Array(0x10000);
const TRANSPORT = [];               // [lo, hi) диапазоны PC, чьи чтения — транспорт
if (S.Init_1 != null && S.RestartInt != null) TRANSPORT.push([S.Init_1, S.RestartInt]);
if (S.dzx0 != null && S.snd_start != null) TRANSPORT.push([S.dzx0, S.snd_start]);
if (TRANSPORT.length !== 2) { console.log("не нашлись границы транспорта в .sym — замер недействителен"); process.exit(2); }
// ОКНО ТРАНСПОРТА ЗАКРЫВАЕТСЯ ВХОДОМ В БЛОК 1, и это не мелочь: dzx0 работает
// ДВАЖДЫ — на буте (перенос образа) и позже, когда меню распаковывает битмап
// боковой панели. Фильтр «PC внутри dzx0» без окна списывал в транспорт и
// вторую работу тоже: поток панели выходил с нулём чтений и попадал в холодные,
// хотя панель рисуется на каждом входе в меню.
let bootOver = false;
const isMove = pc => !bootOver &&
                     ((pc >= TRANSPORT[0][0] && pc < TRANSPORT[0][1]) ||
                      (pc >= TRANSPORT[1][0] && pc < TRANSPORT[1][1]));
let minSp = 0x10000;

// Ставит перепись на стенд. Возвращает функцию-выключатель окна «до раскладки».
function instrument(m, preFlagRef) {
  let curPc = 0, curLen = 1;
  const curPcW = { pc: 0 };            // тот же PC, видимый обёртке записи
  bootOver = false;
  m.onPc(S.SCUBACOD0_END, () => { bootOver = true; });   // бут отдал управление блоку 1
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
    if (st) WSTK[ad]++;
    else if (isMove(curPcW.pc)) WDAT_MOVE[ad]++;
    else WDAT[ad]++;
    return origWrite(a, v, st);
  };
  const origCb = m.v06c.check_breakpoint;
  m.v06c.check_breakpoint = () => {
    const pc = m.cpu.pc & 0xffff;
    const len = ILEN[origRead(pc, false) & 0xff];
    curPc = pc; curLen = len; curPcW.pc = pc;
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
  let menu = 0, attract = 0, drawn = 0;
  if (S.LEE2C != null) m.onPc(S.LEE2C, () => { menu++; });
  // ДЕМО-РЕЖИМ МЕНЮ (attract) ВКЛЮЧАЕТСЯ НЕ РАНЬШЕ 0x400 КАДРОВ ОТ БУТА
  // (LEEAD: `LD A,(FRAMES+1) / CP 4`), то есть примерно через 20 секунд. Первая
  // версия сцены жила 640 кадров и до демо не доходила вовсе.
  // ВНИМАНИЕ: демо ВХОДИТ, но НЕ ДОХОДИТ до отрисовки — боевой образ виснет в
  // LB1D4 (см. tools/verify/attract_probe.js). Поэтому свидетелем взят ВХОД в
  // демо, а всё, что за точкой зависания, спектром НЕ ПОКРЫТО, и вывод «мёртв»
  // для тех тел недействителен. Ровно так это и записано в отчёте.
  for (let i = 0; i < 400 && !menu; i++) m.step();
  for (const k of [KEY.D1, KEY.D2, KEY.D3, KEY.D4, KEY.D1]) {
    m.key(k, true); m.run(6); m.key(k, false); m.run(40);
  }
  if (S.LA193 != null) m.onPc(S.LA193, () => { attract++; });
  if (S.DrawGameScr != null) m.onPc(S.DrawGameScr, () => { drawn++; });
  // ЖДЁМ ДОЛЬШЕ ПОРОГА С ЗАПАСОМ. Порог демо — кадр 1024 (FRAMES+1 == 4), а от
  // входа в демо до первой отрисовки проходит ещё построение лабиринта под DI.
  // На 1200 кадрах сцена успевала ВОЙТИ в демо, но не увидеть отрисовки, и
  // свидетель печатал «ЗАВИСАНИЕ» на здоровом образе — то есть расходился с
  // attract_gate и attract_probe на том же файле. Два измерения не должны
  // расходиться (урок №5): здесь была виновата длина окна, а не образ.
  m.run(2600);
  witness["бут+меню"] = `заходов в экран меню ${menu}, входов в демо ${attract}, ` +
                        `отрисовок экрана демо ${drawn}`;
  return menu > 0 && attract > 0 && drawn > 0;
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

// --- (4б) ОСЬМИНОГ ----------------------------------------------------------
// Осьминог рождается там, где блок мини-карты равен $1C, и только при отрисовке
// экрана. Довести туда автопилот не удаётся, поэтому мини-карта засевается
// блоками $1C — рецепт из рабочего tools/verify/octopus_gate.js. Без этой сцены
// фазы 2..4 осьминога и процедура DrawOctopusSprite не исполняются НИ РАЗУ, и
// перепись объявила бы их мёртвыми при живом коде (урок №24: спектр обязан
// содержать сценарий, где действует проверяемое).
scenes["осьминог"] = () => {
  const ref = { pre: true };
  const g = reachGame(rom, sym1, { cpu: "i8080", level: 4, seed: 0x0167,
    preHook: (m, SS) => {
      instrument(m, ref);
      m.onPc(SS.LD9C0, () => { ref.pre = false; });
      m.onPc(SS.PrepareGame, () => { m.wr(SS.L5B03, 11); m.wr(SS.L5B03 + 1, 4); });
    } });
  const m = g.m;
  let t = 0, present = 0;
  const phases = new Set();
  m.onPc(S.LD9C0, () => {
    t++;
    if (t === 40) for (let r = 0; r < 8; r++) for (let c = 0; c < 32; c++) m.wr(S.MiniMap + r * 32 + c, 0x1C);
    if (m.rd(S.L9C50)) { present++; phases.add(m.rd(S.L9C55)); }
  });
  m.key(KEY.UP, true);
  let q = 0; while (t < 1500 && q < 2500) { m.step(); q++; }
  m.key(KEY.UP, false);
  witness["осьминог"] = `тиков ${t}, осьминог на экране ${present} тиков, фаз ${phases.size}`;
  return present > 0 && phases.size > 1;
};

// --- (4в) ВСЕ СУЩЕСТВА РЯДОМ С ДАЙВЕРОМ -------------------------------------
// Тот же приём, что и в сцене акулы, но координаты подсаживаются ВСЕМ записям
// групп II/III/IV, а не только акульим. Смысл — покрытие: вертикальные варианты
// (змейка, кальмарик, круглая рыба) на обычном маршруте не встречаются вовсе, и
// их спрайтовые массивы уходили в «холодные» не потому, что они мусор, а потому
// что сцена до них не доводит. Сцена искусственная и заявлена таковой: она
// доказывает ЖИВОСТЬ массивов, а не воспроизводит игру.
scenes["все существа"] = () => {
  const ref = { pre: true };
  let drawnAt = null;
  const g = reachGame(rom, sym1, { cpu: "i8080", level: 4, seed: 0x2B1D,
    preHook: (m, SS) => {
      instrument(m, ref);
      m.onPc(SS.LD9C0, () => { ref.pre = false; });
      if (SS.LB655_marked != null) m.onPc(SS.LB655_marked, () => {
        const ix = m.rd(SS.z80_ix) | (m.rd(SS.z80_ix + 1) << 8);
        const iy = m.rd(ix + 0x13) | (m.rd(ix + 0x14) << 8);
        if (iy === SS.LC0A2 || iy === SS.LC0B2) drawnAt = [m.rd(ix), m.rd(ix + 1)];
      });
    } });
  const m = g.m;
  let t = 0, moved = 0;
  m.onPc(S.LD9C0, () => {
    t++;
    if (t % 20 || !drawnAt) return;
    for (const nm of ["RecsAddrII", "RecsAddrIII", "RecsAddrIV"]) {
      const p = S[nm]; if (p == null) continue;
      const b = m.rd(p) | (m.rd(p + 1) << 8);
      for (let k = 0; k < 12; k++) {
        const r = b + k * 26;
        m.wr(r, drawnAt[0]); m.wr(r + 1, drawnAt[1]); moved++;
      }
    }
  });
  swim(g, { passes: 1, frames: 20, noDeath: true });
  let q = 0; while (t < 1500 && q < 2500) { m.step(); q++; }
  witness["все существа"] = `тиков ${t}, подсадок координат ${moved}`;
  return moved > 0 && t > 500;
};

// --- (4г) ПОДБОР ПРЕДМЕТОВ --------------------------------------------------
// Кислород, сундук, ракушки. Тракты LE4C3/LE553/LE578 (сундук, ракушка, счёт
// HELD) на обычном маршруте не исполняются НИ РАЗУ — 207+93+35 Б кода уходили в
// «холодные». Подбор решается сравнением строки/столбца дайвера с записью
// таблицы объектов на экране LB07D (4 байта: указатель, столбец, строка), и
// сравнение это делает LE476, получая строку/столбец в H/L. Поэтому в момент
// входа в LE476 столбец и строка ВСЕХ записей ставятся равными H/L: подбор
// срабатывает, если объект на экране вообще есть.
scenes["предметы"] = () => {
  let entries = 0, chest = 0, oxy = 0, shell = 0, tt = 0;
  // ЧЕТЫРЕ УРОВНЯ, А НЕ ОДИН: на первом в таблице объектов экрана встречаются
  // только ракушки (замер: сундук 0, кислород 0 за 2098 тиков), и вывод «тракт
  // сундука мёртв» был бы утверждением о составе одного уровня, а не о коде.
  // ДВА ЗАХОДА, И ОБА ОБЯЗАТЕЛЬНЫ. Без подсадки признака в выборку попадают
  // только ракушки — единственный предмет, который встречается на маршруте
  // по-настоящему. С подсадкой ракушки, наоборот, вытесняются (тракт берёт
  // ПЕРВЫЙ совпавший объект). Поэтому сначала честный проход по четырём
  // уровням, потом проход с подсадкой признаков кислорода и сундука.
  for (const level of [1, 2, 3, 4]) tt += one(level, false);
  for (const level of [1, 4]) tt += one(level, true);
  witness["предметы"] = `тиков ${tt}, записей в LB07D ${entries}, сундук ${chest}, кислород ${oxy}, ракушка ${shell}`;
  return entries > 0 && chest > 0 && oxy > 0 && shell > 0;

  function one(level, inject) {
  const ref = { pre: true };
  let phase = 0; const orig = new Map();
  const g = reachGame(rom, sym1, { cpu: "i8080", level, seed: 0x0167,
    preHook: (m, SS) => {
      instrument(m, ref);
      m.onPc(SS.LD9C0, () => { ref.pre = false; });
      m.onPc(SS.LE476, () => {
        phase++;
        const hl = m.cpu.hl() & 0xffff, H = hl >> 8, L = hl & 0xff;
        for (let k = 0; k < 11; k++) {
          const e = SS.LB07D + k * 4;
          if (m.rd(e + 1) === 0xff) break;
          entries++;
          m.wr(e + 2, L); m.wr(e + 3, H);
          // ПРИЗНАК ПРЕДМЕТА ПОДСАЖИВАЕТСЯ ЯВНО. На всех четырёх уровнях в
          // таблице объектов экрана попадались только ракушки (замер: сундук 0,
          // кислород 0 за 5007 тиков), а кислород и сундук рождаются лишь на
          // особых блоках мини-карты. Флаг записи TableStatics — байт #0, где
          // бит 5 = кислород, бит 6 = сундук (шапка таблицы в scubacodb.asm);
          // ставим их по очереди. Сцена этим объявляется ИСКУССТВЕННОЙ: она
          // доказывает, что тракты исполнимы и куда ведут, а не воспроизводит
          // игру.
          // Три состояния ПО ВЫЗОВАМ, а не по номеру записи: тракт разбирает
          // таблицу и берёт ПЕРВЫЙ совпавший объект, поэтому раскладка признаков
          // внутри одного прохода не даёт разнообразия — замер это и показал
          // (сначала сундук 93 и кислород 0, потом наоборот). Крутим признак
          // всей таблицы от вызова к вызову: кислород, сундук, нетронутый флаг
          // (ракушка).
          // ПОДСАДКА ОБРАТИМАЯ: исходный флаг запоминается при первой встрече и
          // возвращается на третьей фазе. Без возврата ракушки исчезали из
          // выборки навсегда (замер: ракушка 0), потому что подсадка затирала
          // настоящий флаг записи $0A.
          const rec = m.rd(e) | (m.rd(e + 1) << 8);
          if (inject && rec > 0x1000 && rec < 0xA000) {
            if (!orig.has(rec)) orig.set(rec, m.rd(rec));
            m.wr(rec, (phase % 3) === 0 ? 0x20 : (phase % 3) === 1 ? 0x40 : orig.get(rec));
          }

        }
      });
      if (SS.LE4C3 != null) m.onPc(SS.LE4C3, () => { chest++; });
      if (SS.LE4A5 != null) m.onPc(SS.LE4A5, () => { oxy++; });
      if (SS.LE578 != null) m.onPc(SS.LE578, () => { shell++; });
    } });
  let t = 0; g.m.onPc(S.LD9C0, () => { t++; });
  swim(g, { passes: 1, frames: 25, noDeath: true });
  let q = 0; while (t < 1200 && q < 1800) { g.m.step(); q++; }
  return t;
  }
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
const buf = Buffer.alloc(0x10000 * 4 * 9);
const put = (arr, i) => { for (let a = 0; a < 0x10000; a++) buf.writeUInt32LE(Math.min(arr[a], 0xffffffff), (i * 0x10000 + a) * 4); };
put(EXEC, 0); put(RDAT, 1); put(WDAT, 2); put(RSTK, 3); put(WSTK, 4);
put(EXEC_PRE, 5); put(RDAT_PRE, 6); put(RDAT_MOVE, 7); put(WDAT_MOVE, 8);
fs.writeFileSync(OUT, buf);
let e = 0, r = 0, w = 0;
for (let a = 0; a < 0x10000; a++) { if (EXEC[a]) e++; if (RDAT[a]) r++; if (WDAT[a]) w++; }
console.log(`счётчики -> ${OUT}`);
console.log(`  исполнялось байт ${e}, читалось как данные ${r}, записывалось ${w}; минимум SP 0x${minSp.toString(16)}`);
