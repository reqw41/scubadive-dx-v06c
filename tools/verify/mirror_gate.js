"use strict";
// ГЕЙТ ЗЕРКАЛЬНЫХ НАБОРОВ (-DMIRROR): картинка обязана совпасть со сборкой,
// которая хранит наборы «влево» целиком.
//
// ЗАЧЕМ ОТДЕЛЬНЫЙ ГЕЙТ. Правку принимали по прогонам в 400 тиков, и она
// считалась сошедшейся. На 800 тиках расходились ВСЕ четыре уровня: с 439-го
// тика дайвер поворачивался на набор из СКРЫТОЙ ПЛОСКОСТИ (0xA000..0xAFF8, туда
// его кадры кладёт -DHIDVRAM), у такого адреса бит 15 стоит сам собой, и тракт
// принимал его за признак зеркальности — дайвер рисовался отражённым.
// Отсюда два требования к гейту, и оба обязательны:
//   1) прогон ДЛИННЕЕ 500 тиков, иначе окно кончается до появления дефекта;
//   2) ОБЪЯВЛЕННОЕ ПОКРЫТИЕ: дайвер обязан хоть раз попасть в сборку кадра с
//      набором из скрытой плоскости. Не попал — гейт не проверил ничего и
//      краснеет, а не рапортует зелёным.
//
// СДВИГ НУМЕРАЦИИ ТИКОВ подбирается сам: сборки стартуют игру на разных кадрах
// (у 3-го уровня сдвиг -3), и сверка «тик в тик» без поправки даёт ложное
// расхождение в тысячи байт. Ровно на этом уже один раз построили неверный
// вывод, поэтому сдвиг здесь ищется, а не задаётся.
//
//   node tools/verify/mirror_gate.js <romБезЗеркал> <symБез> <romСЗеркалами> <symС> [тиков=800] [уровни=1,2,3,4]
// MG_EMPTY=1  — прогон в 200 тиков: покрытие не набирается, гейт обязан покраснеть.
// MG_INJECT=1 — вернуть прежний дефект (дайверу ставится признак зеркала), гейт
//               обязан покраснеть.
const { reachGame, KEY } = require("./drive.js");
const [romA, symA, romB, symB] = process.argv.slice(2, 6);
const EMPTY = process.env.MG_EMPTY === "1", INJECT = process.env.MG_INJECT === "1";
const NT = EMPTY ? 200 : parseInt(process.argv[6] || "800", 10);
const LEVELS = (process.argv[7] || "1,2,3,4").split(",").map(Number);
const VLO = 0xc000, VLEN = 0x4000;
const MIN_TICKS = 500;

function run(rom, sym, lvl, cov) {
  const g = reachGame(rom, sym, { cpu: "i8080", level: lvl, seed: 0x0167 });
  const m = g.m, S = g.S;
  const shots = [];
  if (cov && S.LB3E9 !== undefined && S.DiverObj !== undefined) {
    m.onPc(S.LB3E9, () => {
      const ix = m.rdw(S.z80_ix);
      if (ix !== S.DiverObj) return;
      if (m.rd(ix + 10) & 0x80) cov.diverHidden++;
    });
  }
  if (INJECT && S.LB3FA !== undefined && S.mir_on !== undefined && S.DiverObj !== undefined) {
    m.onPc(S.LB3FA, () => {
      const ix = m.rdw(S.z80_ix);
      if (ix === S.DiverObj && (m.rd(ix + 10) & 0x80)) m.wr(S.mir_on, 0x80);
    });
  }
  m.onPc(S.LD9C0, () => {
    if (shots.length >= NT) return;
    const b = Buffer.alloc(VLEN);
    for (let a = 0; a < VLEN; a++) b[a] = m.rd(VLO + a);
    shots.push(b);
  });
  m.key(KEY.UP, true);
  let guard = 0;
  while (shots.length < NT && guard < 3000000) { m.step(); guard++; }
  return shots;
}

let fail = 0;
const cov = { diverHidden: 0 };
for (const lvl of LEVELS) {
  const A = run(romA, symA, lvl, null), B = run(romB, symB, lvl, cov);
  let best = null;
  for (let off = -4; off <= 4; off++) {
    const a = off >= 0 ? A.slice(0, A.length - off) : A.slice(-off);
    const b = off >= 0 ? B.slice(off) : B.slice(0, B.length + off);
    const n = Math.min(a.length, b.length);
    let bad = -1;
    for (let i = 0; i < n && bad < 0; i++) if (!a[i].equals(b[i])) bad = i;
    const good = bad < 0 ? n : bad;
    if (!best || good > best.good) best = { off, good, bad, n, a, b };
  }
  if (best.n < MIN_TICKS) {
    console.log(`ПРОВАЛ  ур.${lvl}: снято ${best.n} тиков, а дефект появляется после 440-го — окно короче проверяемого`);
    fail = 1;
  } else if (best.bad >= 0) {
    let cnt = 0, bits = 0;
    const pc = x => { let c = 0; while (x) { c += x & 1; x >>= 1; } return c; };
    for (let j = 0; j < VLEN; j++) if (best.a[best.bad][j] !== best.b[best.bad][j]) { cnt++; bits += pc(best.a[best.bad][j] ^ best.b[best.bad][j]); }
    const j0 = (() => { for (let j = 0; j < VLEN; j++) if (best.a[best.bad][j] !== best.b[best.bad][j]) return j; })();
    const ad = VLO + j0;
    console.log(`КРАСНЫЙ ур.${lvl}: тик ${best.bad} (сдвиг ${best.off}) — ${cnt} байт, ${bits} пикселей;` +
                ` первый 0x${ad.toString(16)} столбец ${(ad >> 8) & 0x1f} строка растра ${255 - (ad & 0xff)}`);
    fail = 1;
  } else console.log(`ok      ур.${lvl}: ${best.n} тиков совпали байт в байт (сдвиг ${best.off})`);
}
console.log(`покрытие: дайвер собирался с набором из скрытой плоскости ${cov.diverHidden} раз`);
if (!cov.diverHidden) {
  console.log("ПРОВАЛ: тот самый случай в выборку не попал — гейт не проверил то, ради чего написан");
  fail = 1;
}
console.log(fail ? "ГЕЙТ КРАСНЫЙ" : "ГЕЙТ ЗЕЛЁНЫЙ");
process.exit(fail);
