// ГЕЙТ БОНУСНОЙ ЖИЗНИ: подсветка цифры LIVES в HUD обязана ПЕРЕЕХАТЬ.
//
// Зачем. В LE9B0 («plus one live») стояло `;TODO: UpdateLives`: жизнь
// прибавлялась, а подсвеченной оставалась старая цифра — до следующей смерти,
// когда PrepareGame перерисовывала панель заново. То есть HUD врал всю партию,
// и заметить это по state_cmp/lockstep нельзя: игровые переменные верны,
// расходится только картинка.
//
// ЧТО МЕРЯЕТСЯ. Четыре клетки строки "1 2 3 4" под подписью LIVES: подсветка —
// сплошная заливка 8 байт в плоскости 0xE000 (её кладёт HighlightChar/UpdateLives),
// адрес клетки считается как в игре: столбец $16+HUDX+(k-1)*2, строка LIVES_ROW,
// hi = 0xC0+столбец с переворотом плоскости, lo = 255-8*строка.
// Обе константы берутся из .sym, а не вписаны числом.
//
// СЦЕНА. Бонусная жизнь выдаётся, когда (IX+$1A) доходит до $46 при снятом бите 5
// в (IX+$26) (scubacodc.asm, рядом с `CALL Z,LE9B0`). Стенд подсаживает $45 и
// снимает бит на каждом кадре, пока LE9B0 не сработает, — то есть проходит
// НАСТОЯЩИЙ тракт игры, а не зовёт UpdateLives напрямую.
//
// НЕГАТИВЫ (обязаны краснеть):
//   LIVES_EMPTY=1   — не дать бонусу случиться: сверять нечего;
//   LIVES_NOCALL=1  — сделать UpdateLives пустой (немедленный возврат) у ОБОИХ
//                     вызывающих: гаснет и подсветка от PrepareGame, и переезд
//                     по бонусу — то есть ровно поведение, бывшее до правки
//                     (`;TODO: UpdateLives`), только заодно и без старой копии
//                     в PrepareGame.
//
//   node tools/verify/lives_gate.js [каталог сборки=build/wnew]
"use strict";
const fs = require("fs"), path = require("path");
const { readSym } = require("./harness.js");
const { reachGame, KEY } = require("./drive.js");

const ROOT = path.resolve(__dirname, "../..");
const DIR = process.argv[2] || `${ROOT}/build/wnew`;
for (const f of ["scuba.rom", "scubacod1.sym"])
  if (!fs.existsSync(`${DIR}/${f}`)) { console.log(`нет ${DIR}/${f}`); process.exit(2); }
const S = readSym(`${DIR}/scubacod1.sym`);
for (const n of ["LIVES", "LIVES_ROW", "HUDX", "DiverObj", "LE9B0", "UpdateLives"])
  if (S[n] == null) { console.log(`нет метки ${n} в .sym — гейт не на чем строить`); process.exit(2); }

const EMPTY = process.env.LIVES_EMPTY === "1";
const NOCALL = process.env.LIVES_NOCALL === "1";

// Адрес верхнего байта клетки цифры k (1..4) в плоскости подсветки.
function cell(k) {
  const col = 0x16 + S.HUDX + (k - 1) * 2;
  const lo = (255 - 8 * S.LIVES_ROW) & 0xff;
  return ((0xe0 + col) << 8) | lo;          // 0xC0+col с переворотом плоскости
}
// Сколько из восьми байт клетки залито (255 = подсвечена, 0 = погашена).
function lit(m, k) {
  const a = cell(k); let n = 0;
  for (let i = 0; i < 8; i++) if (m.rd(a - i) === 0xff) n++;
  return n;
}
const row = m => [1, 2, 3, 4].map(k => `${k}:${lit(m, k)}/8`).join("  ");

let bonus = 0;
const g = reachGame(`${DIR}/scuba.rom`, `${DIR}/scubacod1.sym`, {
  cpu: "i8080", level: 1, seed: 0x0167,
  preHook: (m, Sy) => {
    m.onPc(Sy.LE9B0, () => { bonus++; });
    if (NOCALL) {                            // подсадка: вернуть поведение с ;TODO
      m.onPc(Sy.UpdateLives, () => { m.cpu.pc = m.rd(m.cpu.sp) | (m.rd(m.cpu.sp + 1) << 8); m.cpu.sp = (m.cpu.sp + 2) & 0xffff; });
    }
  },
});

const before = { lives: g.m.rd(S.LIVES), cells: [1, 2, 3, 4].map(k => lit(g.m, k)) };
console.log(`до бонуса:    LIVES=${before.lives}  клетки ${row(g.m)}`);

if (!EMPTY) {
  g.m.key(KEY.UP, true);
  for (let i = 0; i < 4000 && !bonus; i++) {
    // $45 -> inc -> $46 в тракте «строка вниз»; бит 5 в +$26 запрещает бонус
    g.m.wr(S.DiverObj + 0x1a, 0x45);
    g.m.wr(S.DiverObj + 0x26, g.m.rd(S.DiverObj + 0x26) & ~0x20);
    g.m.step();
  }
  g.m.key(KEY.UP, false);
  for (let i = 0; i < 40; i++) g.m.step();
}
const after = { lives: g.m.rd(S.LIVES), cells: [1, 2, 3, 4].map(k => lit(g.m, k)) };
console.log(`после бонуса: LIVES=${after.lives}  клетки ${row(g.m)}  (заходов в LE9B0 ${bonus})`);

let fail = 0;
const ok = (c, t) => { console.log(`  ${c ? "ok    " : "ПРОВАЛ"}  ${t}`); if (!c) fail++; };
ok(bonus > 0, `бонусная жизнь сработала: заходов в LE9B0 ${bonus} (нужно >0)`);
ok(after.lives === before.lives + 1, `LIVES вырос на 1: ${before.lives} -> ${after.lives}`);
ok(before.cells[before.lives - 1] === 8, `до бонуса подсвечена цифра ${before.lives}: залито ${before.cells[before.lives - 1]}/8`);
ok(after.cells[after.lives - 1] === 8, `после бонуса подсвечена цифра ${after.lives}: залито ${after.cells[after.lives - 1]}/8`);
ok(after.cells[before.lives - 1] === 0, `со старой цифры ${before.lives} подсветка снята: залито ${after.cells[before.lives - 1]}/8`);
ok(after.cells.filter(n => n === 8).length === 1, `горит ровно одна цифра: ${after.cells.filter(n => n === 8).length}`);

console.log(fail ? `ГЕЙТ КРАСНЫЙ: провалов ${fail}` : "ГЕЙТ ЗЕЛЁНЫЙ: все 6 проверки");
process.exit(fail ? 1 : 0);
