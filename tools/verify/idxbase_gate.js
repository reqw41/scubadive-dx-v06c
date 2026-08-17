// СТОРОЖ БАЗЫ: в каждом месте, где трансляция заменила (IX+d)/(IY+d) прямым
// абсолютным адресом «по доказанной базе», проверяет на живом прогоне, что
// тень z80_ix/z80_iy действительно равна той базе.
//
// Зачем. План прямой адресации построен ПЕРЕПИСЬЮ (tools/verify/idxcensus.js):
// какие значения индексного регистра реально встречались в каждом месте. Это
// измерение, а не доказательство: сценарий, который не прошёл через нужную ветку,
// базу не покажет. Именно так и вышло — перепись видела в LB57E только LC0B2,
// а на 5553-м тике сценария long та же процедура работает с LC092, и наша сборка
// читала (LC0B2+$09)=2 вместо (LC092+$09)=4. Дальше по цепочке: CopyRecordsBck
// скопировала не то число записей -> байт буфера 0xB130 -> цветовая плоскость.
//
// Гейт обязан гоняться на ПОЛНОЙ длине всех сценариев: дефект вылез на 5553-м
// тике из 12000.
//
//   node tools/verify/idxbase_gate.js <rom> <sym> <lst> <plan.json> [сценарии...]
"use strict";
const fs = require("fs");
const { reachGame } = require("./drive.js");
const { readSym } = require("./harness.js");
const { SCENARIOS } = require("./oracle.js");

const rom = process.argv[2], sym = process.argv[3], lst = process.argv[4];
const only = process.argv.slice(5).filter(x => !x.startsWith("-"));
const S = readSym(sym);

// Места прямой адресации берём НЕ из плана, а прямо из нашего листинга: план
// лежал в build/, а тот в .gitignore — на свежем клоне его нет, и гейт молча
// проверял бы пустую выборку. Листинг — это то, что реально в образе.
// База -> какой регистр она изображает: DiverObj/LC4F0 — области записей (IX),
// LC092/LC0A2/LC0B2/LC11A — дескрипторы типов (IY).
const IXBASES = new Set(["DiverObj", "LC4F0"]);
const RE = /\(\s*(DiverObj|LC4F0|LC092|LC0A2|LC0B2|LC11A)\s*\+/;
const sites = [];
{
  const seen = new Set();
  for (const raw of fs.readFileSync(lst, "latin1").split("\n")) {
    const m = raw.match(/^\s*(\d+)[+]*\s+([0-9A-Fa-f]{4})\s+((?:[0-9A-Fa-f]{2}\s)+)\s*(.*)$/);
    if (!m) continue;
    const src = (m[4] || "").replace(/;.*$/, "").trim();
    if (!src) continue;
    const mm = src.match(RE);
    if (!mm) continue;
    // Отсеиваем АВТОРСКИЕ абсолютные чтения (LD A,(LC4F0+2) в LE6AB и т.п.):
    // они есть в пристинном src/ дословно и к индексным регистрам отношения не
    // имеют. Транслятор эмитит мнемонику строчными, автор писал прописными —
    // различие проверяемое и в этом исходнике устойчивое.
    if (/^[A-Z]/.test(src)) continue;
    const addr = parseInt(m[2], 16);
    if (seen.has(addr)) continue;
    seen.add(addr);
    const baseName = mm[1];
    if (S[baseName] == null) continue;
    sites.push({ addr, key: "0x" + addr.toString(16) + " " + src,
                 base: S[baseName], baseName,
                 reg: IXBASES.has(baseName) ? "ix" : "iy" });
  }
}
console.log(`мест прямой адресации в образе: ${sites.length}`);
if (sites.length === 0) { console.log("ГЕЙТ НЕДЕЙСТВИТЕЛЕН: пустая выборка"); process.exit(2); }

const bad = new Map();          // key -> Map(наблюдённая база -> счёт)
const hits = new Map();
const names = only.length ? only : Object.keys(SCENARIOS);
for (const name of names) {
  const sc = SCENARIOS[name];
  if (!sc) continue;
  const sched = [];
  for (const ph of sc.phases) for (let i = 0; i < ph.ticks; i++) sched.push(ph.keys || []);
  const preHook = (m, SS) => {
    for (const s of sites) {
      m.onPc(s.addr, () => {
        const cur = m.rdw(s.reg === "ix" ? SS.z80_ix : SS.z80_iy);
        hits.set(s.key, (hits.get(s.key) || 0) + 1);
        if (cur !== s.base) {
          if (!bad.has(s.key)) bad.set(s.key, new Map());
          const mm = bad.get(s.key);
          mm.set(cur, (mm.get(cur) || 0) + 1);
        }
      });
    }
    let held = [], n = 0;
    m.onPc(SS.LD9C0, () => {
      const keys = sched[n] || []; n++;
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
      m.wr(SS.KeyLine0, l0); m.wr(SS.KeyLine7, l7);
    });
  };
  const g = reachGame(rom, sym, { cpu: "i8080", level: sc.level, seed: sc.seed, preHook });
  let guard = 0, ticks = 0;
  g.m.onPc(g.S.LD9C0, () => { ticks++; });
  while (ticks < sched.length && guard < 600000) { g.m.step(); guard++; }
  console.log(`  сценарий ${name}: ${ticks} тиков`);
}

// имя ближайшей метки для наблюдённого значения
const labs = Object.entries(S).filter(([k, v]) => v >= 0x100 && v < 0xc000).sort((a, b) => a[1] - b[1]);
const nm = v => { let lo = 0, hi = labs.length - 1, x = null;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (labs[m][1] <= v) { x = labs[m]; lo = m + 1; } else hi = m - 1; }
  return x ? (x[1] === v ? x[0] : `${x[0]}+${v - x[1]}`) : "0x" + v.toString(16); };

const executed = [...hits.keys()].length;
console.log(`\nмест исполнено: ${executed} из ${sites.length}`);
if (bad.size === 0) {
  console.log(`ГЕЙТ ЗЕЛЁНЫЙ: во всех исполненных местах тень равна предполагаемой базе`);
  process.exit(0);
}
console.log(`ГЕЙТ КРАСНЫЙ: база НЕ СОВПАЛА в ${bad.size} местах:`);
for (const [key, mm] of bad) {
  const s = sites.find(x => x.key === key);
  const tot = [...mm.values()].reduce((a, b) => a + b, 0);
  console.log(`  ${key}  план=${s.baseName}  нарушений ${tot} из ${hits.get(key)}  реально: ` +
              [...mm.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
                .map(([v, c]) => `${nm(v)}×${c}`).join(", "));
}
process.exit(1);
