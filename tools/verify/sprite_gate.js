// ГЕЙТ КАДРОВ ДАЙВЕРА ПРИ ВЫСЕЛЕНИИ (-DEVICT).
//
// Зачем. Массив кадров героя однажды разъехался по ломтям поштучно, и НИ ОДИН
// гейт этого не увидел — дефект ушёл на железо (урок №22). Теперь массив
// переезжает ЦЕЛЫМ КУСКОМ (32 ломтя двумя рядами по 16), и проверять надо ровно
// то, что при этом может сломаться: попал ли байт кадра туда, куда его послала
// новая адресная арифметика.
//
// ПОЧЕМУ НЕ СВЕРКА ДВУХ СБОРОК. Прежняя версия сверяла поток байтов копировщика
// у EVICT-сборки и у безвыселенной. Мера оказалась ШИРЕ явления (урок №19): на
// дереве, где адресной правки нет вовсе, она даёт те же 26 расхождений из 5538 —
// сборки расходятся по числу кадров распаковки, а от счётчика кадров зависят
// фазы анимации. Такой гейт краснеет всегда и потому не значит ничего.
//
// ЧТО МЕРЯЕТСЯ ВМЕСТО ЭТОГО — ОРАКУЛ, ЗАМКНУТЫЙ НА ОДНУ СБОРКУ:
//   A. Каждое чтение кадров дайвера отображается ОБРАТНО в смещение исходного
//      массива (страница -> угол и половина, младший байт -> фаза и смещение), и
//      прочитанный байт обязан совпасть с эталонным массивом. Это прямая проверка
//      «данные легли туда, куда посылает арифметика», и от числа кадров она не
//      зависит вовсе.
//   B. Покрытие ТРОЙНОЕ: 64 сочетания угол*фаза прочитаны; тракт-ограничитель
//      LE848 исполнен хотя бы раз (с наблюдённым сбросом полей); прочитан и
//      второй спрайтовый массив («various sprites»).
//   C. Из МЁРТВОГО источника (SCUBADIVR_SRC, копия массива после кода) не читает
//      никто, кроме самой раскладки: иначе где-то осталась ссылка на старый
//      адрес, и выселение для этого пути не состоялось.
//   D. Массив «various sprites» НЕ ВЫСЕЛЕН — статическая проверка по
//      scubazone.asm. Именно его разнос по ломтям и стоил дефекта на железе, а
//      фильтр «нет ссылок в коде» защищает только ХВОСТ массива: его БАЗА
//      (SprDiverClimb) в коде названа и генератору не запрещена.
//
// Негативы (каждый обязан покраснить меру A):
//   SPRITE_TEAR=1   — не разложить один ломоть кадров вовсе (тот самый дефект);
//   SPRITE_INJECT=1 — испортить один байт в разложенном ломте;
//   SPRITE_SWAP=1   — поменять местами два ломтя (адресация уехала, данные целы);
//   SPRITE_EMPTY=1  — обнулить выборку: гейт обязан объявить себя недействительным;
//   SPRITE_DTEST=1  — подсадить имя существа в план: проверка D обязана покраснеть.
//
//   node tools/verify/sprite_gate.js
//   SPRITE_LEVELS=1,2,3,4   SPRITE_TICKS=700
"use strict";
const fs = require("fs"), path = require("path");
const { readSym } = require("./harness.js");
const { reachGame, swim } = require("./drive.js");
const ROOT = path.resolve(__dirname, "../..");
const B = process.env.BUILD_DIR || "build";
const EV = `${ROOT}/${B}/ev`, REF = `${ROOT}/${B}/gzref`;
for (const d of [EV, REF]) for (const f of ["scuba.rom", "scubacod1.sym"])
  if (!fs.existsSync(`${d}/${f}`)) {
    console.log(`нет ${d}/${f} — собери:\n` +
      `  DET=1 SRC=src8080 GEOM=1 ZONE=1 EVICT=1 OUT=${B}/ev ./tools/build.sh\n` +
      `  DET=1 SRC=src8080 GEOM=1 ZONE=1          OUT=${B}/gzref ./tools/build.sh`);
    process.exit(2); }

const INJECT = process.env.SPRITE_INJECT === "1";
const TEAR   = process.env.SPRITE_TEAR === "1";
const SWAP   = process.env.SPRITE_SWAP === "1";
const EMPTY  = process.env.SPRITE_EMPTY === "1";
const LEVELS = EMPTY ? [] : (process.env.SPRITE_LEVELS || "1,4").split(",").map(Number);
const TICKS  = Number(process.env.SPRITE_TICKS || 1800);

let fail = 0, checks = 0;
const chk = (ok, msg) => { checks++; if (ok) console.log("  ok      " + msg);
                           else { fail++; console.log("  ПРОВАЛ  " + msg); } };

const SE = readSym(`${EV}/scubacod1.sym`), SR = readSym(`${REF}/scubacod1.sym`);
for (const [S, n, d] of [[SE, "DIVER_A", EV], [SE, "DIVER_B", EV], [SE, "SCUBADIVR_SRC", EV],
                         [SE, "ZoneDone", EV], [SE, "LE848", EV], [SE, "LE1D2", EV], [SE, "LE19E", EV], [SE, "LE1F4", EV], [SE, "LE7E0", EV], [SE, "LE364", EV], [SE, "DIVER_A1", EV], [SE, "DIVER_A5", EV], [SE, "LIVES", EV],
                         [SE, "i80_ldir_1", EV], [SE, "LB3E9", EV], [SE, "LD9C0", EV],
                         [SE, "DiverObj", EV], [SE, "SprDiverClimb", EV], [SE, "SprDrowned", EV],
                         [SR, "SprDiver0", REF], [SR, "SprDrowned", REF]])
  if (S[n] == null) { console.log(`нет метки ${n} в ${d}/scubacod1.sym`); process.exit(2); }

const A_HI = SE.DIVER_A, B_HI = SE.DIVER_B, SRC = SE.SCUBADIVR_SRC;
const NANG = 16, ASIZE = NANG * 128;

// Обратное отображение «адрес в зоне -> смещение в исходном массиве».
// ДОСЛОВНЫЙ ДВОЙНИК арифметики scubacodc.asm: hi = ряд + 2*угол + (фаза>>1),
// lo = 192 + 32*(фаза&1). Расхождение двойника с кодом — это и есть то, что
// негативы обязаны показать.
function zoneToOffset(addr) {
  const p = (addr >> 8) & 0xff, l = addr & 0xff;
  if (l < 192) return null;
  let idx;
  if (p >= A_HI && p < A_HI + 16) idx = p - A_HI;
  else if (p >= B_HI && p < B_HI + 16) idx = 16 + (p - B_HI);
  else return null;
  const angle = idx >> 1, phase = (idx & 1) * 2 + (l >= 224 ? 1 : 0);
  return angle * 128 + phase * 32 + ((l - 192) & 31);
}

// --- эталон массива: снимается с БЕЗВЫСЕЛЕННОЙ сборки, из памяти после буста --
function refArray() {
  const g = reachGame(`${REF}/scuba.rom`, `${REF}/scubacod1.sym`,
    { cpu: "i8080", level: 1, seed: 0x0167 });
  const a = [];
  for (let i = 0; i < ASIZE; i++) a.push(g.m.rd(SR.SprDiver0 + i));
  return a;
}

// --- прогон EVICT-сборки ------------------------------------------------------
function run(level, ref) {
  const r = { bad: 0, seen: 0, combos: new Set(), le848: 0, le848reset: 0,
              various: 0, fromSrc: 0, srcOk: 0 };
  let want = 0, phase = "A";
  const g = reachGame(`${EV}/scuba.rom`, `${EV}/scubacod1.sym`,
    { cpu: "i8080", level, seed: 0x0167, preHook: (m, S) => {
      const D = S.DiverObj;
      // ПОДСАДКА С ВОЗВРАТОМ СОСТОЯНИЯ. Тракт расчёта кадра (LE1D2) открыт только
      // при DiverObj+$10 бит7=1, бит4=0, бит5=0, и в свободном плавании
      // исполняется единицы раз за тысячи тиков — перебор упирался не в
      // сочетания, а в число заходов. Держать эти биты ПОСТОЯННО нельзя: замер
      // показал, что игра встаёт (536 тиков и ноль отрисовок дайвера вместо
      // 1056). Поэтому флаги, угол и фаза ставятся на входе в объемлющий тракт
      // (LE19E) и возвращаются на его выходе (LE1F4): расчёт кадра исполняется
      // с нашими значениями, а игровое состояние остаётся своим.
      let sv = null;
      m.onPc(S.LE19E, () => {
        if (phase !== "A" || sv) return;
        sv = [m.rd(D + 0x10), m.rd(D + 0x06), m.rd(D + 0x17)];
        want = (want + 1) & 63;
        m.wr(D + 0x10, (sv[0] | 0x80) & ~0x30);
        m.wr(D + 0x06, (want >> 2) & 15);
        m.wr(D + 0x17, (sv[2] & 0xfc) | (want & 3));
      });
      m.onPc(S.LE1F4, () => {
        if (!sv) return;
        m.wr(D + 0x10, sv[0]); m.wr(D + 0x06, sv[1]); m.wr(D + 0x17, sv[2]);
        sv = null;
      });
      // ВХОД В LE848 ОТКРЫВАЕТСЯ НА ВХОДЕ В LE7E0, а не «раз в несколько тиков»:
      // условие — три бита одного байта (2 установлен, 3 и 1 сняты), и ставить
      // их вслепую по тикам значит гадать, попали ли мы в момент вызова. Замер
      // это и показал: подсадка по тикам давала то 4 захода, то ноль.
      // ДОРОГА К LE848 ВЫПИСАНА ЦЕЛИКОМ, а не угадана. Цепочка условий:
      //   LE364: $10 бит5 = 0 и бит7 = 0        -> LE767
      //   LE767: $26 бит0 = 1                   -> LE7E0
      //   LE7E0: $26 бит2 = 1                   -> LE837
      //   LE837: $26 бит3 = 0 и бит1 = 0        -> LE848
      // Подсадка ставит ровно эти биты на входе в LE364 — потому и работает, а
      // прежняя «раз в несколько тиков в геймплее» давала то 4 захода, то ноль.
      m.onPc(S.LE364, () => {
        if (phase !== "B") return;
        if (!r.armed) {   // указатель анимации — на угол 1, чтобы дойти до угла 5
          r.armed = 1;
          m.wr(D + 0x24, S.DIVER_A1 & 0xff); m.wr(D + 0x25, (S.DIVER_A1 >> 8) & 0xff);
        }
        m.wr(D + 0x10, m.rd(D + 0x10) & ~0xa0);
        m.wr(D + 0x26, (m.rd(D + 0x26) | 0x05) & ~0x0a);
      });
      // СБРОС ЛОВИТСЯ НЕ ПО PC, А ПО ОЖИДАНИЮ. Поля (IX+4),(IX+5),(IX+6) пишутся
      // ЧЕРЕЗ ХЕЛПЕР (rst 28h = z80_stn_X), то есть в момент записи PC стоит в
      // хелпере, а не в LE848 — фильтр по диапазону PC не срабатывал ни разу
      // (23 захода и ноль сбросов). Вместо него: на входе в LE848 считаем, ДОЛЖЕН
      // ли шаг привести ровно к ограничителю (H+2 == страница угла 5, L == 192), и
      // если должен — ждём все три записи. Это заодно ПРОВЕРКА АРИФМЕТИКИ: сброс
      // обязан случиться ровно на угле 5 и ни на каком другом.
      let pend = null;
      m.onPc(S.LE848, () => {
        r.le848++;
        const h = m.rd(D + 0x25), l = m.rd(D + 0x24);
        pend = (((h + 2) & 0xff) === ((S.DIVER_A5 >> 8) & 0xff) && l === (S.DIVER_A5 & 0xff))
               ? {} : null;
      });
      const mark = (k) => (a, v) => {
        if (!pend) return;
        pend[k] = 1;
        if (pend.a && pend.b && pend.c) { r.le848reset++; pend = null; }
      };
      m.onWrite(D + 0x04, (a, v) => { if (pend && v === 0) mark("a")(a, v); });
      m.onWrite(D + 0x05, (a, v) => { if (pend && v === 0) mark("b")(a, v); });
      m.onWrite(D + 0x06, (a, v) => { if (pend && v === 4) mark("c")(a, v); });
      // ПРИЗНАК ДАННЫХ, А НЕ ВЫБОРКИ КОМАНДЫ: адрес не равен PC (урок №21).
      const rd0 = m.memory.read.bind(m.memory);
      m.memory.read = (a, st) => { a &= 0xffff;
        const pc = m.cpu.pc & 0xffff;
        if (!EMPTY && a !== pc &&
            ((pc >= S.i80_ldir_1 && pc < S.i80_ldir_1 + 24) ||
             (pc >= S.LB3E9 && pc < S.LB3E9 + 24))) {
          r.copy = (r.copy||0)+1; if (a>=0xA000) r.hi=(r.hi||0)+1;
          const off = zoneToOffset(a);
          if (off !== null) {
            r.seen++;
            r.combos.add(off >> 5);
            if ((rd0(a, st) & 0xff) !== ref[off]) r.bad++;
          }
          // мёртвый источник: читать оттуда никто, кроме раскладки, не должен
          if (a >= SRC && a < SRC + ASIZE) r.fromSrc++;
          // второй спрайтовый массив — он НЕ выселяется и обязан читаться
          if (a >= S.SprDiverClimb && a < S.SprDiverClimb + 0xA0) r.various++;
        }
        return rd0(a, st); };
      // --- негативы: бьют по тому, что мерит A, и ПОСЛЕ раскладки -------------
      // ПОДСАДКА НАКЛАДЫВАЕТСЯ ПОСЛЕ КАЖДОЙ РАСКЛАДКИ, а не после первой:
      // ZoneCopy зовётся ДВАЖДЫ (второй раз после распаковки панели), и порча,
      // наложенная после первого вызова, была бы просто затёрта вторым — гейт
      // зеленел бы на заведомо сломанном образе (урок №2).
      m.onPc(S.ZoneDone, () => {
        if (INJECT) m.wr(A_HI * 256 + 192 + 7, 0x5a);
        if (TEAR) for (let i = 0; i < 64; i++) m.wr((A_HI + 3) * 256 + 192 + i, 0);
        if (SWAP) for (let i = 0; i < 64; i++) {
          const x = m.rd((A_HI + 4) * 256 + 192 + i), y = m.rd((A_HI + 5) * 256 + 192 + i);
          m.wr((A_HI + 4) * 256 + 192 + i, y); m.wr((A_HI + 5) * 256 + 192 + i, x);
        }
      });
    }});
  // источник обязан пережить раскладку целым — иначе эталон сверять не с чем
  for (let i = 0; i < ASIZE; i++) if (g.m.rd(SRC + i) === ref[i]) r.srcOk++;
  let t = 0; g.m.onPc(SE.LD9C0, () => {
    t++;
    // ТРИ ФАЗЫ В ОДНОМ ПРОГОНЕ, потому что подсадки мешают друг другу:
    //   A — перебор угол*фаза (тракт расчёта кадра);
    //   B — тракт-ограничитель LE848;
    //   C — гибель: только она гоняет ВТОРОЙ спрайтовый массив (замер: чтения
    //       «various sprites» удваиваются, 4587 -> 9075).
    phase = t * 2 < TICKS ? "A" : (t * 4 < TICKS * 3 ? "B" : "C");
    if (phase === "C" && (t & 63) === 0) {
      g.m.wr(SE.LIVES, 3);
      g.m.wr(SE.DiverObj + 0x10, g.m.rd(SE.DiverObj + 0x10) | 0x20);
    }
  });
  swim(g, { passes: 1, frames: 24, noDeath: true });
  // ПРЕДЕЛ ПО КАДРАМ, А НЕ ПО ФАНТАЗИИ: шаг стенда — это КАДР, и подсадка флагов
  // может остановить главный цикл. Прежний потолок в сотни тысяч кадров
  // превращал такой случай в зависание вместо честного провала.
  let q = 0, seen = -1, stall = 0;
  while (t < TICKS && q < 20000) {
    g.m.step(); q++;
    if ((q & 255) === 0) { if (t === seen) { stall++; if (stall > 4) break; } else { stall = 0; seen = t; } }
  }
  r.ticks = t; r.frames = q;
  // НЕДОБОР ТИКОВ — ЭТО КРАСНЫЙ, А НЕ «поменьше выборка». Прогон, упёршийся в
  // потолок кадров или вставший на месте, даёт усечённое покрытие, и молчание об
  // этом превращает гейт в генератор бодрых чисел.
  r.short = t < TICKS;
  return r;
}

// --- D. СТАТИЧЕСКАЯ ПРОВЕРКА: НАБОРЫ СПРАЙТОВ СУЩЕСТВ НЕ ВЫСЕЛЕНЫ ------------
// Это не «ещё одна аккуратность», а прямое следствие свидетельства с железа:
// образ 565c7cec дал мусор вместо ЧАСТИ врагов, и все шесть блоков того плана
// оказались спрайтами электрического угря. Их имена значатся РОВНО В ОДНОМ
// месте — в таблице записей существ (`DEFW ...  ; Electric eel`), поэтому
// фильтр «имени нет в коде» считал их названными, а фильтр «безымянный хвост в
// 128 Б» молчал: соседи тоже названы в таблице.
// Ломается оно потому, что указатель спрайта ШАГАЕТ через границу метки — замер
// creature_probe.js на круглой рыбе: указатель начинает в L8285 (16 Б по .sym), а
// следом читаются L8295 и L82A5, которых в таблице нет. Значит .sym-размер
// таблично названного блока ЗАНИЖЕН, и поблочное выселение внутри области рвёт
// анимацию.
// Проверка СТАТИЧЕСКАЯ и потому не зависит от того, доплыл ли сценарий до угря:
// динамическое покрытие всех тринадцати существ стоило бы дорого и всё равно
// осталось бы неполным (замер: сценарий видит 1-3 существа из 13).
const zsrc = fs.readFileSync(path.join(ROOT, "src8080", "scubazone.asm"), "utf8");
const codb = fs.readFileSync(path.join(ROOT, "src8080", "scubacodb.asm"), "utf8").split("\n");
const CREATURE = [];
for (const l of codb) {
  const m = l.match(/^\s*DEFW\s+((?:L[0-9A-Fa-f]{4}\s*,\s*)+L[0-9A-Fa-f]{4})\s*;\s*(.+?)\s*$/);
  if (!m) continue;
  const ls = m[1].split(/\s*,\s*/);
  if (ls.length === 4 || ls.length === 6) CREATURE.push(...ls);
}
if (!CREATURE.length) {
  console.log("  ПРОВАЛ  таблица наборов существ не разобрана — проверка D была бы тихо пустой");
  console.log("ГЕЙТ НЕДЕЙСТВИТЕЛЕН"); process.exit(2); }
const VARIOUS = ["SprDiverClimb", "SprDiverSit", "L9BCC", "L9BEC", "L9C0C"].concat(CREATURE);
// НЕГАТИВ ДЛЯ D: подсадить в разбираемый текст плана имя существа. Проверка
// обязана покраснеть — иначе она не проверяет ничего.
const zcheck = process.env.SPRITE_DTEST === "1" ? zsrc + "\n" + CREATURE[0] + "\tDEFB 0\n" : zsrc;
const evicted = VARIOUS.filter(n => new RegExp("^" + n + "\\b", "m").test(zcheck));

// --- прогон -------------------------------------------------------------------
const ref = EMPTY ? [] : refArray();
let tot = { bad: 0, seen: 0, le848: 0, le848reset: 0, various: 0, fromSrc: 0, srcBad: 0, short: 0 };
const combos = new Set();
for (const lvl of LEVELS) {
  const r = run(lvl, ref);
  for (const c of r.combos) combos.add(c);
  tot.bad += r.bad; tot.seen += r.seen; tot.le848 += r.le848;
  tot.le848reset += r.le848reset; tot.various += r.various; tot.fromSrc += r.fromSrc;
  tot.srcBad += ASIZE - r.srcOk; tot.short = (tot.short || 0) + (r.short ? 1 : 0);
  if (process.env.SPRITE_DBG) console.log(`  DBG copy=${r.copy||0} hi=${r.hi||0} src=${r.fromSrc} various=${r.various} le848=${r.le848} srcOk=${r.srcOk} frames=${r.frames}`);
  console.log(`  уровень ${lvl}: тиков ${r.ticks}, чтений кадров ${r.seen}, ` +
              `расхождений ${r.bad}, сочетаний ${r.combos.size}/64, LE848 ${r.le848}`);
}

// ПУСТАЯ ВЫБОРКА — ОТДЕЛЬНАЯ ПРОВЕРКА С ЧИСЛОМ (уроки №2, 8, 24).
if (!LEVELS.length || !tot.seen) {
  console.log("  ПРОВАЛ  ПУСТАЯ ВЫБОРКА: чтений кадров дайвера не снято");
  console.log("ГЕЙТ НЕДЕЙСТВИТЕЛЕН"); process.exit(2); }

chk(!tot.short, `сценарий доигран до конца на всех уровнях (усечённых прогонов ${tot.short})`);
chk(tot.bad === 0, `A: байт кадра совпал с эталоном по обратному отображению ` +
    `(${tot.seen} чтений, расхождений ${tot.bad})`);
chk(combos.size === 64, `B1: покрытие 64 сочетания угол*фаза (получено ${combos.size})`);
chk(tot.le848 >= 1 && tot.le848reset >= 1,
    `B2: тракт LE848 исполнен (${tot.le848} заходов, сбросов угла ${tot.le848reset})`);
chk(tot.various > 0, `B3: второй спрайтовый массив прочитан (${tot.various} чтений)`);
chk(tot.fromSrc === 0, `C: из мёртвого источника не читает никто (${tot.fromSrc} чтений)`);
chk(tot.srcBad === 0, `C2: источник пережил раскладку целым (${tot.srcBad} байт разошлось)`);
chk(evicted.length === 0, `D: ни один блок наборов спрайтов существ не выселен ` +
    `(проверено имён ${VARIOUS.length}, в плане: ${evicted.join(",") || "нет"})`);
console.log(fail ? `ГЕЙТ КРАСНЫЙ: ${fail} из ${checks}` : `ГЕЙТ ЗЕЛЁНЫЙ: все ${checks} проверки`);
process.exit(fail ? 1 : 0);
