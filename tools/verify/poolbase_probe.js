// ЖИВА ЛИ ОБЛАСТЬ 0xA000..0xAFFF ВО ВРЕМЯ ИГРЫ (-DEVICT).
//
// Вопрос. Под -DEVICT код кончается на 0x9FE9, а 0xA03C..0xAFFC занимает
// УПАКОВАННЫЙ источник выселенных блоков (рельеф, кадры дайвера, ломти данных).
// Раскладка ZoneCopy однократна (признак ZoneLaid), и после неё источник, по
// замыслу, МЁРТВ. Если это так, все 16 страниц 0xA0..0xAF свободны целиком, и
// пул буферов save-under может вернуться к стоковой раскладке «индекс -> полная
// страница 256 Б» вместо ломтей и четвёрок.
//
// Мера. С ПЕРВОГО игрового тика (LD9C0) считаются ВСЕ чтения и записи в
// 0xA000..0xAFFF с разбивкой по PC. Опасны именно ЧТЕНИЯ: они означают, что
// кто-то ещё зависит от лежащих там данных. Записи (кроме пула) означали бы
// чужого жильца. Сцена включает гибели и перезапуск игры — именно там повторная
// раскладка и всплыла бы.
//
//   node tools/verify/poolbase_probe.js
//   PB_DIR=build/ev  PB_LEVELS=1,4  PB_TICKS=1500
"use strict";
const fs = require("fs"), path = require("path");
const { readSym } = require("./harness.js");
const { reachGame, swim } = require("./drive.js");
const ROOT = path.resolve(__dirname, "../..");
const B = process.env.BUILD_DIR || "build";
const DIR = process.env.PB_DIR || `${ROOT}/${B}/ev`;
for (const f of ["scuba.rom", "scubacod1.sym"])
  if (!fs.existsSync(`${DIR}/${f}`)) { console.log(`нет ${DIR}/${f}`); process.exit(2); }
const S = readSym(`${DIR}/scubacod1.sym`);
const LEVELS = (process.env.PB_LEVELS || "1,4").split(",").map(Number);
const SEEDS = (process.env.PB_SEEDS || "0x0167,0x2B1D").split(",").map(Number);
const TICKS = Number(process.env.PB_TICKS || 1500);
const LO = 0xa000, HI = 0xb000;

const names = Object.entries(S).sort((a, b) => b[1] - a[1]);
const near = (pc) => { const e = names.find(([, v]) => v <= pc); return e ? `${e[0]}+${pc - e[1]}` : "?"; };

const rd = new Map(), wr = new Map();
let ticks = 0, deaths = 0;
const bump = (m, pc, a) => { const k = near(pc); const e = m.get(k) || { n: 0, lo: 0xffff, hi: 0 };
  e.n++; e.lo = Math.min(e.lo, a); e.hi = Math.max(e.hi, a); m.set(k, e); };

function run(level, seed) {
  let live = false;
  const g = reachGame(`${DIR}/scuba.rom`, `${DIR}/scubacod1.sym`,
    { cpu: "i8080", level, seed, preHook: (m, SS) => {
      const ow = m.memory.write.bind(m.memory), or = m.memory.read.bind(m.memory);
      m.memory.write = (a, v, st) => { a &= 0xffff;
        if (live && a >= LO && a < HI) bump(wr, m.cpu.pc & 0xffff, a);
        return ow(a, v, st); };
      // ЧТЕНИЕ ЗОВЁТСЯ И НА ВЫБОРКЕ КОМАНДЫ (урок №21): PC внутри окна отсекаем,
      // иначе исполнение кода в окне засчиталось бы как «данные живы».
      m.memory.read = (a, st) => { a &= 0xffff;
        const pc = m.cpu.pc & 0xffff;
        if (live && a >= LO && a < HI && !(pc >= LO && pc < HI)) bump(rd, pc, a);
        return or(a, st); };
      m.onPc(SS.LD9C0, () => { live = true; });
    } });
  let t = 0; g.m.onPc(S.LD9C0, () => { t++; });
  // Сцена со смертью и продолжением: именно перезапуск игры и позвал бы
  // раскладку во второй раз.
  swim(g, { passes: 2, frames: 30 });
  let q = 0; while (t < TICKS && q < 4e7) { g.m.step(); q++; }
  ticks += t;
}

for (const lvl of LEVELS) for (const sd of SEEDS) run(lvl, sd);

console.log(`ОБЛАСТЬ 0xA000..0xAFFF В ИГРЕ: ${DIR}, уровни ${LEVELS.join(",")}, тиков ${ticks}`);
const dump = (m, what) => {
  const tot = [...m.values()].reduce((s, e) => s + e.n, 0);
  console.log(`  ${what}: ${tot} (разных PC ${m.size})`);
  for (const [k, e] of [...m.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 12))
    console.log(`      ${k.padEnd(22)} ${String(e.n).padStart(7)}  0x${e.lo.toString(16)}..0x${e.hi.toString(16)}`);
  return tot;
};
dump(rd, "ЧТЕНИЙ");
dump(wr, "ЗАПИСЕЙ");
if (!ticks) { console.log("ПУСТАЯ ВЫБОРКА"); process.exit(2); }
// СВОИ ТРАКТЫ ПУЛА НЕ В СЧЁТ. Буферы save-under уже живут в 0xA0..0xAF
// (четвёрки ломтей), и их собственные чтение/запись — не признак живого
// источника. Чужой жилец — это ЛЮБОЙ ДРУГОЙ PC.
const own = (k) => /^(LB48E|LB500|LB3A0)\b/.test(k) || k.startsWith("LB48E+") || k.startsWith("LB500+");
const alien = [...rd.keys(), ...wr.keys()].filter(k => !own(k));
console.log(alien.length === 0
  ? "ЧУЖИХ ОБРАЩЕНИЙ НЕТ: источник мёртв, страницы 0xA0..0xAF свободны целиком"
  : `ЧУЖИЕ ОБРАЩЕНИЯ (${alien.length} PC): ${alien.join(", ")} — область ещё жива`);
