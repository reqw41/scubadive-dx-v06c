// ГЕЙТ ДОМА ПУЛА: СТРАНИЦЫ 0xA0..0xAF ПРИНАДЛЕЖАТ БУФЕРАМ SAVE-UNDER, И ТОЛЬКО ИМ.
//
// Что здесь проверяется и почему именно это.
//
// Пул буферов save-under переехал со стоковых 0xB000..0xBFFF на 0xA000..0xAFFF:
// стоковые страницы под -DEVICT отданы ряду A кадров дайвера. Переезд опирается
// на два свойства, и оба обязаны проверяться, а не подразумеваться:
//
//   (1) 0xA03C..0xAFFC — УПАКОВАННЫЙ ИСТОЧНИК выселенных блоков, и раскладка
//       ZoneCopy однократна (признак ZoneLaid). После неё источник МЁРТВ. Если
//       бы он был жив (например, раскладка повторилась на второй игре), пул
//       затирал бы данные, которые ещё будут читаться;
//   (2) буфер занимает до 256 байт ((IY+$09)*(IY+$0A), у акулы и лодки ровно
//       256), поэтому ему выдана ПОЛНАЯ страница. Выход за неё — порча соседа.
//
// Меры, обе — «операции, начавшиеся в объекте», а не окна вокруг:
//   * сессия рисования открывается заходом в LB470 (известны IX, IY и база
//     буфера). ВСЕ записи сессии в 0xA000..0xAFFF обязаны лежать на странице её
//     буфера;
//   * ZoneCopy после первого игрового тика не исполняется НИ РАЗУ — это и есть
//     «источник мёртв», меренное операцией, а не окном по адресам;
//   * в 0xB000..0xBFFF за игру не должно быть записано ни байта: пул оттуда
//     ушёл, а кадры дайвера только читаются.
//
//   node tools/verify/zone_gate.js
//   ZONE_INJECT=1 — сбрасывать ZoneLaid: раскладка повторится и полезет читать
//                   источник. Гейт обязан покраснеть на чужом жильце.
//   ZONE_SLICE=1  — выдать буферу ломоть 64 Б вместо страницы (младший байт 192,
//                   вариант, отвергнутый разделом 36): акула вылезет на соседнюю
//                   страницу. Гейт обязан покраснеть.
//   ZONE_EMPTY=1  — обнулить выборку. Гейт обязан покраснеть.
"use strict";
const fs = require("fs"), path = require("path");
const { readSym } = require("./harness.js");
const { reachGame, swim } = require("./drive.js");
const ROOT = path.resolve(__dirname, "../..");
const B = process.env.BUILD_DIR || "build";
const DIR = process.env.ZONE_DIR || `${ROOT}/${B}/ev`;
for (const f of ["scuba.rom", "scubacod1.sym"])
  if (!fs.existsSync(`${DIR}/${f}`)) { console.log(`нет ${DIR}/${f} — собери DET=1 GEOM=1 ZONE=1 EVICT=1`); process.exit(2); }
const S = readSym(`${DIR}/scubacod1.sym`);
for (const n of ["LB470", "LB655_marked", "LD9C0", "ZoneLaid", "POOL_HI", "ZoneCopy"])
  if (S[n] == null) { console.log(`нет метки ${n} в .sym`); process.exit(2); }
const POOL_LO = S.POOL_HI * 256, POOL_END = POOL_LO + 0x1000;
const LEVELS = (process.env.ZONE_LEVELS || "1,4").split(",").map(Number);
const TICKS = Number(process.env.ZONE_TICKS || 700);
const INJECT = process.env.ZONE_INJECT === "1";
const SLICE = process.env.ZONE_SLICE === "1";
const EMPTY = process.env.ZONE_EMPTY === "1";
const GUARD = Number(process.env.ZONE_GUARD || 4000);

const names = Object.entries(S).sort((a, b) => b[1] - a[1]);
const near = (pc) => { const e = names.find(([, v]) => v <= pc); return e ? `${e[0]}+${pc - e[1]}` : "?"; };

let ticks = 0, sessions = 0, poolWrites = 0, outCount = 0, lateCopy = 0;
const out = [], strayB = [];

function run(level, seed) {
  let cur = null, live = false;
  const g = reachGame(`${DIR}/scuba.rom`, `${DIR}/scubacod1.sym`,
    { cpu: "i8080", level, seed, preHook: (m, SS) => {
      m.onPc(SS.LB470, () => {
        const ix = m.rd(SS.z80_ix) | (m.rd(SS.z80_ix + 1) << 8);
        cur = { page: m.rd(ix + 8), lo: m.rd(ix + 7) };
        if (live) sessions++;
      });
      // ПОДСАДКА «ЛОМОТЬ 64 Б»: младший байт буфера 192 вместо 0. Ставится на
      // самой выдаче, чтобы попасть в измеряемое окно, а не мимо него.
      if (SLICE) m.onPc(SS.LB655_marked, () => {
        const ix = m.rd(SS.z80_ix) | (m.rd(SS.z80_ix + 1) << 8);
        m.wr(ix + 7, 192);
      });
      const ow = m.memory.write.bind(m.memory), or = m.memory.read.bind(m.memory);
      m.memory.write = (a, v, st) => { a &= 0xffff;
        if (live && !EMPTY) {
          if (a >= POOL_LO && a < POOL_END) {
            const pg = a >> 8;
            // СТЕЙДЖИНГ-СТРАНИЦА (индекс 0, забронирован в LBEC7) законна всегда:
            // в неё собирают спрайт тракты LB3E5/LB466, к буферу существа они
            // отношения не имеют.
            if (pg === S.POOL_HI || (cur && pg === cur.page)) { poolWrites++; }
            else { outCount++;
              if (out.length < 8) out.push({ a, pc: m.cpu.pc & 0xffff, page: cur && cur.page, level }); }
          } else if (a >= 0xb000 && a < 0xc000) { if (strayB.length < 8) strayB.push({ a, pc: m.cpu.pc & 0xffff }); }
        }
        return ow(a, v, st); };
      // ИСТОЧНИК МЁРТВ = РАСКЛАДКА БОЛЬШЕ НЕ ИСПОЛНЯЕТСЯ. Мера — заход в
      // процедуру, а не обращения по адресам: окно по адресам пришлось бы
      // отличать от законных чтений буферов, и оно оказалось бы шире явления.
      m.onPc(SS.ZoneCopy, () => { if (live) lateCopy++; });
      m.onPc(SS.LD9C0, () => { live = true; });
    } });
  let t = 0;
  g.m.onPc(S.LD9C0, () => { t++; ticks++;
    // ПОВТОРНАЯ РАСКЛАДКА: признак сбрасывается каждый тик, и следующая
    // постановка уровня снова полезет читать источник в 0xA0xx.
    if (INJECT) g.m.wr(S.ZoneLaid, 0);
  });
  swim(g, { passes: 2, frames: 30 });
  // ПОТОЛОК В КАДРАХ, А НЕ В ФАНТАЗИИ. Подсаженный образ до нужного числа тиков
  // может не дойти вовсе (урок №25: негатив без потолка вешает весь набор).
  // Исчерпание потолка не беда: собранного к этому моменту хватает для вердикта,
  // а пустую выборку ловит отдельная проверка ниже.
  let q = 0; while (t < TICKS && q < GUARD) { g.m.step(); q++; }
}

for (const lvl of LEVELS) run(lvl, 0x0167);

let fail = 0, checks = 0;
const chk = (ok, msg) => { checks++; if (ok) console.log("  ok      " + msg);
                           else { fail++; console.log("  ПРОВАЛ  " + msg); } };
console.log(`ДОМ ПУЛА: ${DIR}, страницы 0x${S.POOL_HI.toString(16)}00..0x${(S.POOL_HI + 15).toString(16)}ff, ` +
            `уровни ${LEVELS.join(",")}, тиков ${ticks}`);
console.log(`  сессий рисования ${sessions}, записей в свою страницу ${poolWrites}, ` +
            `записей мимо ${outCount}, поздних раскладок ${lateCopy}`);
for (const o of out.slice(0, 6))
  console.log(`      мимо: 0x${o.a.toString(16)} из ${near(o.pc)} (буфер на странице 0x${(o.page || 0).toString(16)})`);
for (const s of strayB.slice(0, 4)) console.log(`      запись в 0xB000..0xBFFF: 0x${s.a.toString(16)} из ${near(s.pc)}`);
if (EMPTY || !ticks || !sessions || !poolWrites) {
  console.log(`  ПРОВАЛ  ПУСТАЯ ВЫБОРКА: тиков ${ticks}, сессий ${sessions}, записей ${poolWrites}`);
  console.log("ГЕЙТ НЕДЕЙСТВИТЕЛЕН"); process.exit(2); }
chk(outCount === 0, `ни одна запись буфера не вышла за свою страницу (мимо ${outCount})`);
chk(lateCopy === 0, `после первого тика раскладка не исполняется: заходов в ZoneCopy ${lateCopy} ` +
    `(источник в 0xA0xx мёртв, и пул волен его затирать)`);
chk(strayB.length === 0, `в 0xB000..0xBFFF за игру не записано ни байта (записей ${strayB.length})`);
console.log(fail ? `ГЕЙТ КРАСНЫЙ: ${fail} из ${checks}` : `ГЕЙТ ЗЕЛЁНЫЙ: все ${checks} проверки`);
process.exit(fail ? 1 : 0);
