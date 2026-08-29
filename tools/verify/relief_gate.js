// ГЕЙТ ПЕРЕНОСА РЕЛЬЕФА ЦЕЛЫМ КУСКОМ (-DEVICT).
//
// Что доказывается. Рельеф — 30 блоков по 64 Б, адресуемых АРИФМЕТИКОЙ от базы
// («база + n*64»). Под выселением блок n лежит в ломте n, и формула становится
// «база + n*256». Ассемблер такую ссылку не правит, значит правильность держится
// на трёх правках счёта адреса и на переносе курсора через границу ломтя. Все
// четыре места сверяются ПО РЕЗУЛЬТАТУ, против сборки БЕЗ выселения:
//
//   A. LA0F5 — ИСЧЕРПЫВАЮЩЕ: все 65536 сочетаний (строка, столбец) на спектре
//      уровней. Сверяется не адрес (он законно разный), а БАЙТ по этому адресу.
//      Это и есть «сверка чтений рельефа по всей карте».
//   B. TableStatics — результат цикла LA209, того самого, чей курсор выходит за
//      границу блока (замер relief_probe.js: 1284 чтения за границей на четырёх
//      уровнях). Таблица сверяется байт в байт.
//   D. ПОТОК БАЙТОВ ЦИКЛА LA209 — прямой замер переноса курсора через границу
//      ломтя: фильтр по PC, без ограничения на адрес.
//   C. ПОТОК НОМЕРОВ ТАЙЛОВ, прочитанных DrawGameScr через IY-хелперы, — третье
//      место правки. Сверяется последовательность прочитанных БАЙТОВ.
//
// Почему C сверяет поток чтений, а не картинку. Первая версия сравнивала
// видеопамять ниже зоны — и краснела 22 байтами. Замер на БАЗОВОМ дереве
// (55 ломтей, рельеф не тронут) дал по той же мере 83 байта расхождения, то
// есть мера ловила не рельеф, а разницу EVICT-сборки с безвыселенной вообще:
// у них разное число кадров на распаковку образа, а от счётчика кадров зависят
// фазы анимации и инкрементальные ползунки шкал. Мера была ШИРЕ явления
// (урок №9), и зелёной она не стала бы никогда.
//
// Негативные контроли (каждый бьёт по тому, что гейт МЕРИТ):
//   RELIEF_INJECT=1  — испортить один байт рельефа в ломте после раскладки;
//   RELIEF_TAB=1     — подсадить «особый» тайл в хвост каждого блока, куда
//                      смотрит цикл LA209: проверки B и D обязаны покраснеть;
//   RELIEF_NOWRAP=1  — вырезать перенос курсора (RELF_INC -> INC HL + NOP):
//                      ровно тот дефект, ради которого правка и делалась;
//   RELIEF_EMPTY=1   — обнулить выборку: гейт обязан покраснеть, а не «пройти».
//
//   node tools/verify/relief_gate.js
//   RELIEF_LEVELS=1,4 — уровни спектра (по умолчанию 1,2,3,4)
"use strict";
const fs = require("fs"), path = require("path");
const { make, readSym } = require("./harness.js");
const { reachGame } = require("./drive.js");
const ROOT = path.resolve(__dirname, "../..");
const B = process.env.BUILD_DIR || "build";
const EV = `${ROOT}/${B}/ev`, REF = `${ROOT}/${B}/gzref`;
for (const d of [EV, REF]) for (const f of ["scuba.rom", "scubacod1.sym"])
  if (!fs.existsSync(`${d}/${f}`)) {
    console.log(`нет ${d}/${f} — собери:\n` +
      `  DET=1 SRC=src8080 GEOM=1 ZONE=1 EVICT=1 OUT=${B}/ev ./tools/build.sh\n` +
      `  DET=1 SRC=src8080 GEOM=1 ZONE=1          OUT=${B}/gzref ./tools/build.sh`);
    process.exit(2); }

const INJECT = process.env.RELIEF_INJECT === "1";
const NOWRAP = process.env.RELIEF_NOWRAP === "1";
const EMPTY  = process.env.RELIEF_EMPTY === "1";
const LEVELS = EMPTY ? [] : (process.env.RELIEF_LEVELS || "1,2,3,4").split(",").map(Number);
const RET_SENTINEL = 0x0002;

let fail = 0, checks = 0;
const chk = (ok, msg) => { checks++; if (ok) console.log("  ok      " + msg);
                           else { fail++; console.log("  ПРОВАЛ  " + msg); } };

// Курсор без переноса: `inc l / jp nz,$+6 / inc h / ld l,192` -> `inc hl` + NOP.
// Патч кладётся в ОЗУ на входе в ZoneCopy, то есть после распаковки образа и до
// первого чтения рельефа (PrepareMiniMap идёт следом).
function patchNoWrap(m) {
  let n = 0;
  for (let a = 0x100; a < 0xA000; a++) {
    if (m.rd(a) === 0x2c && m.rd(a + 1) === 0xc2 && m.rd(a + 4) === 0x24 &&
        m.rd(a + 5) === 0x2e && m.rd(a + 6) === 0xc0 &&
        (m.rd(a + 2) | (m.rd(a + 3) << 8)) === ((a + 7) & 0xffff)) {
      m.wr(a, 0x23);                              // INX H
      for (let k = 1; k < 7; k++) m.wr(a + k, 0x00);
      n++;
    }
  }
  return n;
}

function boot(dir, level) {
  const rom = `${dir}/scuba.rom`, sym = `${dir}/scubacod1.sym`;
  const S = readSym(sym);
  const isEv = S.ZoneCopy != null;
  for (const n of ["LA0F5", "TableStatics", "z80_lda_Y", "LD9C0"])
    if (S[n] == null) { console.log(`нет метки ${n} в ${sym}`); process.exit(2); }
  // Диапазон рельефа: под выселением — страницы RELIEF_HI..0xFF, младшие
  // 192..255; без выселения — непрерывные 30 блоков от LA4DD.
  const inRelief = isEv
    ? (a => (a & 0xff00) >= S.RELIEF_HI * 256 && (a & 0xff) >= 192)
    : (a => a >= S.LA4DD && a < S.LA4DD + 30 * 64);
  // Читатели ТОЛЬКО DrawGameScr: тайл берётся через IY-хелперы. Фильтр по PC
  // обязателен — распаковщик панели читает свои же обратные ссылки в 0xF800 и
  // выше, то есть внутри диапазона рельефа, но к рельефу отношения не имеет.
  // (z80_bitY из фильтра убран 2026-08-30 вместе с самим хелпером: он читал
  // (IY+0) второй раз подряд, и в потоке каждый тайл шёл дважды.)
  const inDraw = pc => (pc >= S.z80_lda_Y && pc < S.z80_lda_Y + 48);
  // Читатели цикла LA209 — фильтр ТОЛЬКО по PC, без диапазона адресов: курсор
  // без переноса уходит из зоны вовсе (младшие 0..191), и фильтр по диапазону
  // такие чтения бы потерял, то есть не увидел бы ровно тот дефект, ради
  // которого перенос и делается.
  // ВАЖНО: memory.read зовётся и на ВЫБОРКЕ КОМАНДЫ. Первая версия фильтра
  // писала `pc >= LA209 && rd(pc) === 0x7e` — и ловила ровно выборку опкода
  // `LD A,(HL)`, то есть складывала в поток 64323 одинаковых байта 0x7E и
  // сравнивала их сама с собой. Гейт зеленел на любой подсадке (урок №8 в новом
  // обличье). Признак ДАННЫХ: адрес не совпадает с PC, а опкод лежит НА БАЙТ
  // НАЗАД — процессор уже сдвинул PC за него.
  // Выборка команды — это чтение по САМОМУ PC, её отсекаем первой же проверкой
  // (иначе в поток попадёт опкод следующей инструкции, и длина потока удвоится).
  const inLoop = (pc, m, a) => a !== pc && pc - 1 >= S.LA209 &&
                               pc - 1 <= S.LA278 + 8 && m.rd(pc - 1) === 0x7e;
  const tiles = [], loop = [];
  const g = reachGame(rom, sym, { cpu: "i8080", level, seed: 0x0167,
    preHook: (m, SS) => {
      const rd0 = m.memory.read.bind(m.memory);
      m.memory.read = (a, st) => { a &= 0xffff;
        if (!EMPTY) {
          const pc = m.cpu.pc & 0xffff;
          if (inRelief(a) && inDraw(pc)) tiles.push(rd0(a, st) & 0xff);
          if (inLoop(pc, m, a)) loop.push(rd0(a, st) & 0xff);
        }
        return rd0(a, st); };
      if (!isEv) return;
      let once = false;
      m.onPc(SS.ZoneCopy, () => {
        if (once) return; once = true;
        if (NOWRAP) {
          const n = patchNoWrap(m);
          if (n !== 3) { console.log(`  ПОДСАДКА НЕ СОСТОЯЛАСЬ: найдено ${n} мест RELF_INC вместо 3`);
                         process.exit(2); }
        }
      });
      if (INJECT) m.onPc(SS.ZoneDone, () => { m.wr(S.RELIEF_HI * 256 + 192 + 5, 0x7f); });
      // Подсадка в ХВОСТ каждого блока — туда, куда смотрит цикл LA209 (он
      // читает 16 тайлов со смещения 48). Значение $1C — «особый» тайл, с
      // которого и начинается запись в TableStatics: бьём ровно по тому, что
      // меряют проверки B и D.
      if (process.env.RELIEF_TAB === "1")
        m.onPc(SS.ZoneDone, () => { for (let p = S.RELIEF_HI; p < 256; p++)
                                      m.wr(p * 256 + 192 + 50, 0x1c); });
    }});
  return { g, S, tiles, loop };
}

// --- A: LA0F5 на полном переборе входов, сверяется БАЙТ по адресу -------------
function la0f5Bytes(g, S) {
  const m = g.m, cpu = m.cpu, out = new Uint8Array(65536);
  const save = { pc: cpu.pc, sp: cpu.sp };
  for (let hl = 0; hl < 65536; hl++) {
    m.wr(0x7EFE, RET_SENTINEL & 0xff); m.wr(0x7EFF, RET_SENTINEL >> 8);
    cpu.sp = 0x7EFE; cpu.pc = S.LA0F5;
    cpu.set_reg(4, hl >> 8); cpu.set_reg(5, hl & 0xff);
    let guard = 0;
    while ((cpu.pc & 0xffff) !== RET_SENTINEL && guard++ < 400) cpu.instruction();
    if (guard >= 400) { console.log(`  ПРОВАЛ  LA0F5 не вернулась на входе 0x${hl.toString(16)}`);
                        process.exit(1); }
    out[hl] = m.rd(((cpu.reg(4) << 8) | cpu.reg(5)) & 0xffff);
  }
  cpu.pc = save.pc; cpu.sp = save.sp;
  return out;
}

// --- B: таблица статических объектов -----------------------------------------
function tableStatics(g, S) {
  const m = g.m, a0 = S.TableStatics, out = [];
  for (let i = 0; i < 4096; i++) {
    const v = m.rd(a0 + i); out.push(v);
    if (i % 4 === 0 && v === 0x80) break;          // маркер конца списка
  }
  return Uint8Array.from(out);
}

const diffs = (a, b) => { let n = 0; const L = Math.max(a.length, b.length);
                          for (let i = 0; i < L; i++) if (a[i] !== b[i]) n++; return n; };

let totalA = 0, totalB = 0, totalC = 0, totalD = 0, samples = 0, tilesSeen = 0, loopSeen = 0;
for (const lvl of LEVELS) {
  const e = boot(EV, lvl), r = boot(REF, lvl);
  // поток тайлов набирается за постановку уровня и первые тики главного цикла
  // TableStatics снимается НА ПЕРВОМ ТИКЕ, а не в конце прогона. Замер: байт
  // +279 (за концом реальных записей уровня 4) — это счётчик, который тикает по
  // КАДРАМ, а сборки к одному тику приходят на разных кадрах. Снимок в конце
  // прогона краснел одним байтом одинаково у ЛЮБОЙ пары сборок, включая базовое
  // дерево без выселения рельефа вовсе. Мера была шире явления (урок №9).
  const snap = { };
  for (const [tag, x] of [["ev", e], ["ref", r]]) {
    let t = 0; x.g.m.onPc(x.S.LD9C0, () => { if (++t === 1) snap[tag] = tableStatics(x.g, x.S); });
    let q = 0; while (t < 120 && q < 400000) { x.g.m.step(); q++; }
    if (t < 120) { console.log(`  ПРОВАЛ  уровень ${lvl}: главный цикл не дал 120 тиков`);
                   process.exit(1); }
  }
  const a1 = la0f5Bytes(e.g, e.S), a2 = la0f5Bytes(r.g, r.S);
  const b1 = snap.ev, b2 = snap.ref;
  const dA = diffs(a1, a2), dB = diffs(b1, b2);
  const dC = e.tiles.length !== r.tiles.length ? Math.abs(e.tiles.length - r.tiles.length) + 1
                                               : diffs(e.tiles, r.tiles);
  const dD = e.loop.length !== r.loop.length ? Math.abs(e.loop.length - r.loop.length) + 1
                                             : diffs(e.loop, r.loop);
  console.log(`  уровень ${lvl}: LA0F5 расхождений ${dA} из 65536; ` +
              `TableStatics ${dB} из ${b2.length}; поток тайлов DrawGameScr ` +
              `${dC} из ${r.tiles.length} (у EVICT ${e.tiles.length}); ` +
              `поток цикла LA209 ${dD} из ${r.loop.length}`);
  totalA += dA; totalB += dB; totalC += dC; totalD += dD;
  samples++; tilesSeen += r.tiles.length; loopSeen += r.loop.length;
}

if (samples === 0) {
  console.log("  ПРОВАЛ  ПУСТАЯ ВЫБОРКА: ни одного уровня не прогнано");
  console.log("ГЕЙТ НЕДЕЙСТВИТЕЛЕН"); process.exit(2);
}
chk(totalA === 0, `A: чтения рельефа по всей карте совпали с безвыселенной сборкой ` +
    `(${samples} уровней x 65536 входов, расхождений ${totalA})`);
chk(totalB === 0, `B: TableStatics (результат цикла LA209) совпала байт в байт ` +
    `(расхождений ${totalB})`);
chk(tilesSeen > 0 && totalC === 0, `C: поток номеров тайлов DrawGameScr совпал ` +
    `(${tilesSeen} чтений, расхождений ${totalC})`);
chk(loopSeen > 0 && totalD === 0, `D: поток байтов, прочитанных циклом LA209, совпал ` +
    `(${loopSeen} чтений, расхождений ${totalD}) — это и есть перенос курсора через границу ломтя`);
console.log(fail ? `ГЕЙТ КРАСНЫЙ: ${fail} из ${checks}` : `ГЕЙТ ЗЕЛЁНЫЙ: все ${checks} проверки`);
process.exit(fail ? 1 : 0);
