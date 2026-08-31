"use strict";
// ГЕЙТ КРАСНОГО ЧЕРНИЛА (-DREDINK): доказывает, что второй проход по 0xE000
// НИЧЕГО НЕ ПОРТИТ и ничего за собой не оставляет.
//
// Красное существо кладёт в 0xE000 дельту своего байта, а не сохраняет фон в
// буфер. Значит проверять надо ровно два утверждения, и оба — сравнением с
// эталонным образом (тот же набор флагов, но без REDINK), тик в тик:
//
//   1. ПЕРВАЯ ПЛОСКОСТЬ НЕ ТРОНУТА. 0xC000..0xDFFF обязана быть байт в байт
//      как у эталона: тело LB500R повторяет LB500 командой в команду, и любое
//      расхождение здесь означает, что второй проход залез в первый.
//   2. ВО ВТОРОЙ ПЛОСКОСТИ ЛЕЖИТ ТОЛЬКО СПРАЙТ. Всякий бит, которым 0xE000
//      отличается от эталона, обязан стоять и в 0xC000 — там, где красное
//      существо нарисовано сейчас. Бит, отличный от эталона там, где в первой
//      плоскости пусто, — это НЕ СНЯТАЯ ДЕЛЬТА: след существа, которое уже
//      стёрли. Ровно так выглядела бы порча неба и каймы рельефа.
//
// Мера намеренно строгая в обе стороны: она поймает и лишние биты (мусор), и
// пропавшие (дельта сняла чужое и не вернула) — второе видно как бит эталона,
// которого у нас нет, при пустой первой плоскости.
//
//   node tools/verify/red_gate.js <romRed> <symRed> <romRef> <symRef> [тиков] [уровень]
// Оба образа собирать с DET=1: боевой ГПСЧ берёт случайность с ВИ53, и сцены
// разойдутся раньше, чем что-либо докажут.
const { reachGame, KEY } = require("./drive.js");
const [romR, symR, romF, symF] = process.argv.slice(2, 6);
const NT = parseInt(process.argv[6] || "600", 10);
const LVL = parseInt(process.argv[7] || "4", 10);
if (!romR || !symR || !romF || !symF) { console.error("нужны romRed symRed romRef symRef"); process.exit(2); }

const P1 = 0xc000, P2 = 0xe000, PLEN = 0x2000;

// СДВИГ НУМЕРАЦИИ ТИКОВ — не мелочь стенда, а обязательная поправка: образы
// разной скорости стартуют так, что «тик N» у них разные моменты игры (артефакт
// известен с 2026-08-27, state_cmp подбирает сдвиг сам). Снимки берутся не
// только на кратных 25 тиках, но и на соседних, чтобы сравнивать со сдвигом.
function snapshots(rom, sym, countRed) {
  const g = reachGame(rom, sym, { cpu: "i8080", level: LVL, seed: 0x0167 });
  const out = new Map(); let n = 0, red = 0;
  if (countRed && g.S.LB500R !== undefined) g.m.onPc(g.S.LB500R, () => { red++; });
  g.m.onPc(g.S.LD9C0, () => {
    n++;
    const r = n % 25;
    if (r > 1 && r < 24) return;
    const a = new Uint8Array(PLEN), b = new Uint8Array(PLEN);
    for (let i = 0; i < PLEN; i++) { a[i] = g.m.rd(P1 + i); b[i] = g.m.rd(P2 + i); }
    out.set(n, { tick: n, p1: a, p2: b });
  });
  g.m.key(KEY.UP, true);
  let guard = 0;
  while (n < NT && guard < 900000) { g.m.step(); guard++; }
  out.red = red;
  return out;
}

const R = snapshots(romR, symR, true);
const F = snapshots(romF, symF, false);

// выбор сдвига: тот, при котором первая плоскость (её мы не трогали вовсе)
// совпадает лучше всего
let OFF = 0, bestBad = Infinity;
for (const off of [0, -1, 1]) {
  let bad = 0, cmp = 0;
  for (const [t, r] of R) {
    if (t % 25) continue;
    const f = F.get(t + off); if (!f) continue;
    cmp++;
    for (let i = 0; i < PLEN; i++) if (r.p1[i] !== f.p1[i]) bad++;
  }
  if (cmp && bad < bestBad) { bestBad = bad; OFF = off; }
}

let p1bad = 0, ghost = 0, eaten = 0, sprite = 0, firstBad = null, N = 0;
for (const [t, r] of R) {
  if (t % 25) continue;
  const f = F.get(t + OFF); if (!f) continue;
  N++;
  for (let i = 0; i < PLEN; i++) {
    if (r.p1[i] !== f.p1[i]) { p1bad++; if (!firstBad) firstBad = `первая плоскость: тик ${r.tick}, адрес 0x${(P1 + i).toString(16)} наш ${r.p1[i]} эталон ${f.p1[i]}`; }
    const d = r.p2[i] ^ f.p2[i];
    if (!d) continue;
    const extra = d & ~r.p1[i] & 0xff;      // биты 0xE000, которым в 0xC000 ничего не соответствует
    const covered = d & r.p1[i] & 0xff;
    sprite += popcount(covered);
    if (extra) {
      const lost = extra & f.p2[i] & 0xff;  // бит был у эталона и пропал у нас
      if (lost) eaten += popcount(lost);
      const add = extra & ~f.p2[i] & 0xff;  // бит появился у нас на пустом месте
      if (add) ghost += popcount(add);
      if (!firstBad) firstBad = `вторая плоскость: тик ${r.tick}, адрес 0x${(P2 + i).toString(16)} наш ${r.p2[i]} эталон ${f.p2[i]}, первая плоскость ${r.p1[i]}`;
    }
  }
}
function popcount(x) { let n = 0; while (x) { n += x & 1; x >>= 1; } return n; }

const ok = p1bad === 0 && ghost === 0 && eaten === 0;
console.log(`ур.${LVL}, снимков ${N} (каждый 25-й тик из ${NT}, сдвиг нумерации ${OFF}), заходов в LB500R ${R.red}`);
console.log(`  первая плоскость расходится в ${p1bad} байтах`);
console.log(`  во второй плоскости пикселей спрайта ${sprite}, следов на пустом месте ${ghost}, съеденных чужих ${eaten}`);
if (firstBad) console.log(`  ${firstBad}`);
if (R.red === undefined || R.red === 0) { console.log("КРАСНЫЙ ТРАКТ НИ РАЗУ НЕ ИСПОЛНЯЛСЯ — гейт ничего не проверил"); process.exit(2); }
console.log(ok ? "ЗЕЛЁНЫЙ" : "КРАСНЫЙ");
process.exit(ok ? 0 : 1);
