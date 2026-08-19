// ЗАМЕР ЧИТАТЕЛЕЙ СПРАЙТОВ СУЩЕСТВ: не вылезает ли чтение за СВОЙ блок.
//
// Зачем. Владелец увидел на железе мусор вместо ЧАСТИ врагов. В корпусе
// выселения осталось пять ломтей данных, и все шесть блоков в них названы РОВНО
// В ОДНОМ МЕСТЕ — в таблице записей существ (`DEFW ...  ; Electric eel`).
// Фильтр «имени нет в коде» такую ссылку считает ссылкой и блок пропускает, а
// фильтр «безымянный хвост в 128 Б» молчит, потому что СОСЕДИ этих блоков тоже
// названы в таблице. Значит вопрос ровно один и он замеряемый: читается ли блок
// строго в своих границах или чтение уходит за них — как ушло когда-то за
// SprDiverSit на 127 байт при кадре в 32 (урок №22).
//
// Мера. Крючок на теле цикла копии `i80_ldir_1` даёт КАЖДУЮ итерацию, а счётчик
// BC делит поток на ОПЕРАЦИИ (без этого две смежные копии склеиваются в одну
// «серию» и дают ложное пересечение — та же ошибка меры, что в уроке №18).
// Для каждой операции известны начало и длина; блок ищется по .sym, размер —
// до следующей метки. Печатается, у кого чтение вышло за свой блок и насколько.
//
//   node tools/verify/creature_probe.js [каталог]
//   CP_LEVELS=1,2,3,4  CP_TICKS=1500
"use strict";
const fs = require("fs"), path = require("path");
const { readSym } = require("./harness.js");
const { reachGame, swim } = require("./drive.js");
const ROOT = path.resolve(__dirname, "../..");
const DIR = process.argv[2] || `${ROOT}/build/gzref`;
for (const f of ["scuba.rom", "scubacod1.sym"])
  if (!fs.existsSync(`${DIR}/${f}`)) { console.log(`нет ${DIR}/${f}`); process.exit(2); }
const S = readSym(`${DIR}/scubacod1.sym`);
const LEVELS = (process.env.CP_LEVELS || "1,2,3,4").split(",").map(Number);
const TICKS = Number(process.env.CP_TICKS || 1500);

// --- КТО ТАКИЕ БЛОКИ СУЩЕСТВ: список берётся из таблицы записей, а не из головы.
// Строки вида `\tDEFW L8285,L8254,...\t; Round fish` идут следом за записью LCxxx.
const codb = fs.readFileSync(path.join(ROOT, "src8080", "scubacodb.asm"), "utf8").split("\n");
const creatures = [];                       // {name, labels:[...]}
for (const l of codb) {
  const m = l.match(/^\s*DEFW\s+((?:L[0-9A-Fa-f]{4}\s*,\s*)+L[0-9A-Fa-f]{4})\s*;\s*(.+?)\s*$/);
  // НАБОР СПРАЙТОВ СУЩЕСТВА — это РОВНО 4 или 6 указателей. Без этого условия в
  // список попадала строка-описание полей записи («; sprite address»), и все
  // чтения выше её адреса приписывались ей: глубина «за блок» выходила 3833 Б,
  // то есть мера врала, а не игра.
  if (m) { const ls = m[1].split(/\s*,\s*/);
           if (ls.length === 4 || ls.length === 6) creatures.push({ name: m[2], labels: ls }); }
}
if (!creatures.length) { console.log("таблица записей существ не разобрана — мерить нечего"); process.exit(2); }

// размеры блоков — по СОСЕДНЕЙ метке в .sym (ровно так их считает генератор)
const byAddr = Object.entries(S).map(([k, v]) => [v, k]).sort((a, b) => a[0] - b[0]);
const sizeOf = {}, nextOf = {};
for (let i = 0; i < byAddr.length - 1; i++) {
  sizeOf[byAddr[i][1]] = byAddr[i + 1][0] - byAddr[i][0];
  nextOf[byAddr[i][1]] = byAddr[i + 1][1];
}
// БЛОК — ЭТО МЕТКА .sym, а не «набор существа»: ровно так их видит генератор,
// и ровно по этим границам он режет. Поэтому вселенная блоков — ВСЕ метки в окне
// данных, а принадлежность таблице существ лишь помечается.
const OWNER = {};
for (const c of creatures) for (const n of c.labels) OWNER[n] = c.name;
const blocks = [];                          // {name, creature, a0, size}
for (const [a, n] of byAddr) {
  if (a < 0x1000 || a >= 0x8E90) continue;
  blocks.push({ name: n, creature: OWNER[n] || "", a0: a, size: sizeOf[n] || 0 });
}
const findBlock = (a) => {
  let lo = 0, hi = blocks.length - 1, r = null;
  while (lo <= hi) { const m = (lo + hi) >> 1;
    if (blocks[m].a0 <= a) { r = blocks[m]; lo = m + 1; } else hi = m - 1; }
  return r;
};

const stat = new Map();                     // имя блока -> {reads, ops, over, maxOver}
const touched = new Set();
for (const lvl of LEVELS) {
  let prevBc = -1, opStart = null, opLen = 0;
  const flush = () => {
    if (opStart === null) return;
    const b = findBlock(opStart);
    if (b) {
      const off = opStart - b.a0, end = off + opLen;
      const s = stat.get(b.name) || { reads: 0, ops: 0, over: 0, maxOver: 0, b };
      s.reads += opLen; s.ops++;
      if (end > b.size) { s.over++; s.maxOver = Math.max(s.maxOver, end - b.size); }
      stat.set(b.name, s);
      touched.add(b.creature);
    }
    opStart = null; opLen = 0;
  };
  const g = reachGame(`${DIR}/scuba.rom`, `${DIR}/scubacod1.sym`,
    { cpu: "i8080", level: lvl, seed: 0x0167, preHook: (m, SS) => {
      m.onPc(SS.i80_ldir_1, () => {
        const hl = m.cpu.hl() & 0xffff, bc = m.cpu.rp(0) & 0xffff;
        if (bc !== ((prevBc - 1) & 0xffff)) { flush(); opStart = hl; opLen = 0; }
        prevBc = bc; opLen++;
      });
    }});
  let t = 0; g.m.onPc(S.LD9C0, () => { t++; });
  swim(g, { passes: 1, frames: 24, noDeath: true });
  let q = 0; while (t < TICKS && q < 20000) { g.m.step(); q++; }
  flush();
  console.log(`уровень ${lvl}: тиков ${t}`);
}

// ПЛАН ВЫСЕЛЕНИЯ — вторая пометка: интересуют прежде всего блоки, которые мы
// реально разносим по ломтям.
const zsrc = fs.existsSync(path.join(ROOT, "src8080", "scubazone.asm"))
  ? fs.readFileSync(path.join(ROOT, "src8080", "scubazone.asm"), "utf8") : "";
const EVICTED = new Set((zsrc.match(/^[A-Za-z_][A-Za-z0-9_]*/gm) || []));
const rows = [...stat.values()]
  .filter(s => s.over > 0 || s.b.creature || EVICTED.has(s.b.name))
  .sort((a, b) => b.over - a.over || b.reads - a.reads);
console.log("\nблок      существо                     размер  операций  чтений  ЗА БЛОК  глубина  в плане");
for (const s of rows)
  console.log(`${s.b.name.padEnd(9)} ${s.b.creature.padEnd(28)} ${String(s.b.size).padStart(6)} ` +
              `${String(s.ops).padStart(9)} ${String(s.reads).padStart(7)} ` +
              `${String(s.over).padStart(8)} ${String(s.maxOver).padStart(8)}` +
              `${EVICTED.has(s.b.name) ? "   ДА" : ""}`);
const bad = rows.filter(s => s.over > 0);
console.log(`\nблоков наблюдалось ВСЕГО ${stat.size} из ${blocks.length}; в таблице/плане ${rows.length}; ` +
            `существ в выборке ${[...touched].filter(Boolean).length} из ${creatures.length}`);
// САМЫЕ ЧИТАЕМЫЕ БЛОКИ БЕЗ ВСЯКИХ ФИЛЬТРОВ: если спрайты существ читаются НЕ там,
// где мы их ищем, это видно сразу и без гипотез.
const top = [...stat.values()].sort((a, b) => b.reads - a.reads).slice(0, 12);
console.log("\nсамые читаемые блоки (без фильтра):");
for (const s of top)
  console.log(`  ${s.b.name.padEnd(9)} ${String(s.b.size).padStart(5)} Б  операций ${String(s.ops).padStart(6)} ` +
              `чтений ${String(s.reads).padStart(7)}  за блок ${s.over}  ${s.b.creature}`);
console.log(bad.length
  ? `ЧТЕНИЕ ВЫХОДИТ ЗА БЛОК у ${bad.length} блоков, максимум ${Math.max(...bad.map(s => s.maxOver))} Б`
  : "чтения за границы своих блоков НЕ выходят ни разу");
const unseen = creatures.filter(c => !touched.has(c.name)).map(c => c.name);
if (unseen.length) console.log(`НЕ НАБЛЮДАЛИСЬ (выборка неполна): ${unseen.join("; ")}`);
