"use strict";
// ПЕРЕПИСЬ ЗЕРКАЛЬНЫХ НАБОРОВ КАДРОВ. Только замер, ничего не правит.
//
// Зачем. Под потолком 0xA000 тесно для любой правки, и вопрос «где взять двести
// байт» встаёт каждый раз. Самый крупный неиспользованный резерв игры — кадры,
// которые ХРАНЯТСЯ ДВАЖДЫ: набор для движения влево есть зеркало набора для
// движения вправо. Их можно не хранить, а получать отражением при сборке кадра.
//
// Чем это отличается от раздела «ЗЕРКАЛА» в gfx_inventory: там сравниваются
// ОТДЕЛЬНЫЕ КАДРЫ, и совпавшие вразнобой кадры внутри набора освободить нельзя —
// кадры адресуются арифметикой (шаг = размер кадра), выкинуть один из середины
// значит сломать анимацию молча. Освободить можно только НАБОР ЦЕЛИКОМ, и
// считать надо его.
//
// МЕРА ТЕРПИМАЯ К МЕЛОЧАМ, И ЭТО ГЛАВНОЕ. Наборы совпадают не байт в байт:
// у автора в паре мест подрисовано вручную. Поэтому считается не «зеркало или
// нет», а СКОЛЬКО БАЙТ И ПИКСЕЛЕЙ расходится: набор, отличающийся одним
// пикселем, — это освобождённый килобайт и одна заплатка, а не отказ.
//
//   node tools/verify/mirror_census.js [каталог_сборки]
"use strict";
const fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "../..");
const DIR = process.argv[2] || `${ROOT}/build/prod`;
const S = {};
for (const f of ["scubacod0.sym", "scubacod1.sym"])
  for (const l of fs.readFileSync(`${DIR}/${f}`, "latin1").split("\n")) {
    const m = /^(\S+?):?\s+EQU\s+(?:0x)?([0-9A-Fa-f]+)/.exec(l);
    if (m) S[m[1]] = parseInt(m[2], 16);
  }
const bin = fs.readFileSync(`${DIR}/scubacod1.bin`);
const LO = S.SCUBACOD0_END;
const at = a => (a >= LO && a - LO < bin.length) ? bin[a - LO] : 0xFF;
const revb = b => { let r = 0; for (let i = 0; i < 8; i++) if ((b >> i) & 1) r |= 1 << (7 - i); return r; };
const pc = b => { let n = 0; while (b) { n += b & 1; b >>= 1; } return n; };

// типы и их наборы — из таблицы дескрипторов в исходнике автора
const src = fs.readFileSync(path.join(ROOT, "src8080", "scubacodb.asm"), "utf8").split("\n");
const types = [];
for (let i = 0; i < src.length; i++) {
  const m = /^(LC[0-9A-F]{3})\s+DEFW /.exec(src[i]);
  if (!m) continue;
  const t = /DEFW\s+([\w,\s]+?)\s*;\s*(.+)$/.exec(src[i + 1] || "");
  if (!t || S[m[1]] === undefined) continue;
  const d = S[m[1]];
  types.push({ desc: m[1], name: t[2].trim(), ptrs: t[1].split(/\s*,\s*/),
               w: at(d + 6), rows: at(d + 0x0b) });
}
// длина набора: кадры подряд до байта $FF
function setLen(p, sz) { const a = S[p]; let n = 0; while (n < 16 && at(a + n * sz) !== 0xFF) n++; return n; }

let saved = 0, patches = 0, pixels = 0;
const rows = [];
for (const T of types) {
  const sz = T.w * T.rows;
  if (!sz) continue;
  const seen = new Set();
  for (let i = 0; i < T.ptrs.length; i++) for (let j = i + 1; j < T.ptrs.length; j++) {
    const A = S[T.ptrs[i]], B = S[T.ptrs[j]];
    if (A === undefined || B === undefined) continue;
    const nA = setLen(T.ptrs[i], sz), nB = setLen(T.ptrs[j], sz);
    if (!nA || nA !== nB) continue;
    if (seen.has(T.ptrs[j]) || seen.has(T.ptrs[i])) continue;
    const diffs = [];
    for (let f = 0; f < nA; f++) for (let r = 0; r < T.rows; r++) for (let c = 0; c < T.w; c++) {
      const x = at(A + f * sz + r * T.w + c), y = revb(at(B + f * sz + r * T.w + (T.w - 1 - c)));
      if (x !== y) diffs.push({ f, r, c, px: pc(x ^ y), was: y, now: x });
    }
    // порог: набор в 100+ байт стоит освобождать, если расходится единицами байт
    if (diffs.length * 16 > nA * sz) continue;
    seen.add(T.ptrs[j]);
    const px = diffs.reduce((s, d) => s + d.px, 0);
    saved += nA * sz; patches += diffs.length; pixels += px;
    rows.push({ name: T.name, keep: T.ptrs[i], drop: T.ptrs[j], n: nA, bytes: nA * sz,
                diffs: diffs.length, px, list: diffs });
  }
}
console.log(`ПЕРЕПИСЬ ЗЕРКАЛЬНЫХ НАБОРОВ: ${DIR}`);
console.log("тип                        оставить  выкинуть  кадров   байт  заплаток  пикселей");
for (const r of rows)
  console.log(`${r.name.padEnd(26)} ${r.keep.padEnd(9)} ${r.drop.padEnd(9)} ${String(r.n).padStart(5)} ${String(r.bytes).padStart(6)} ${String(r.diffs).padStart(9)} ${String(r.px).padStart(9)}`);
console.log(`\nосвобождается ${saved} Б; расходится ${patches} байт (${pixels} пикселей)`);
// РЕШЕНИЕ ВЛАДЕЛЬЦА 2026-09-01: заплатки не хранить, выравнивать зеркалом.
// Поэтому список расхождений печатается ПОИМЁННО и в исходных координатах —
// это единственная запись о том, что именно мы изменили в рисунке автора, и по
// ней правку можно отыграть назад в любой день. Без такого списка «мы поменяли
// шестнадцать пикселей» через месяц означало бы «мы не знаем, где».
if (process.env.MC_DIFFS !== "0") {
  console.log("\nЧТО ИМЕННО РАЗОЙДЁТСЯ ПОСЛЕ ВЫРАВНИВАНИЯ (набор, кадр, строка, байт: было -> станет):");
  for (const r of rows) for (const d of r.list)
    console.log(`  ${r.name.padEnd(24)} ${r.drop} кадр ${d.f} строка ${String(d.r).padStart(2)} байт ${d.c}:` +
                ` ${"0" + d.was.toString(16).toUpperCase().padStart(2, "0")}h -> ${"0" + d.now.toString(16).toUpperCase().padStart(2, "0")}h  (${d.px} px)`);
}
