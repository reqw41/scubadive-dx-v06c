// СВЕРКА ДВУХ НАШИХ ОБРАЗОВ ПО ВИДЕОПАМЯТИ, тик в тик. Инструмент разведки:
// нужен, чтобы доказать, что правка ПЕРЕНОСА (например, база буферов $B000 ->
// другая) поведение не меняет ВООБЩЕ. pixgate сверяет нас с Z80-эталоном и
// умеет только пару build/src_ref + build/src8080; здесь сверяются два
// произвольных i8080-образа.
//
// Сверяются только ВИДИМЫЕ плоскости 0xC000..0xFFFF (палитра игры — четыре
// одинаковые четвёрки, плоскости 0x8000/0xA000 невидимы и в них лежит код).
//
//   node tools/verify/romdiff_pix.js <romA> <symA> <romB> <symB> [ticks] [level] [row|-]
// Оба образа обязаны быть собраны с DET=1, иначе сравнивать нечего: боевой
// генератор берёт случайность со свободно бегущего ВИ53 и сцены разойдутся.
"use strict";
const { reachGame } = require("./drive.js");

const [romA, symA, romB, symB] = process.argv.slice(2, 6);
const NT = parseInt(process.argv[6] || "600", 10);
const LVL = parseInt(process.argv[7] || "4", 10);
const ROWa = process.argv[8] || "-";
const ROW = ROWa === "-" ? null : parseInt(ROWa, 10);
if (!romA || !symA || !romB || !symB) { console.error("нужны romA symA romB symB"); process.exit(2); }

const VLO = 0xc000, VLEN = 0x4000;

function snapshots(rom, sym) {
  const g = reachGame(rom, sym, { cpu: "i8080", level: LVL, seed: 0x0167 });
  const out = [];
  let n = 0;
  g.m.onPc(g.S.LD9C0, () => {
    n++;
    if (ROW != null) g.m.wr(g.S.L5B03 + 1, ROW);
    if (out.length < NT) {
      const b = Buffer.alloc(VLEN);
      for (let a = 0; a < VLEN; a++) b[a] = g.m.rd(VLO + a);
      out.push(b);
    }
  });
  g.m.key(38, true);
  let guard = 0;
  while (out.length < NT && guard < 4000000) { g.m.step(); guard++; }
  return out;
}

const A0 = snapshots(romA, symA), B0 = snapshots(romB, symB);
// ROMDIFF_OFF=k: снимок A[t] сравнивается с B[t+k] — стенд стартует игру по кадрам,
// и у образов разной скорости нумерация тиков расходится на 1..3 (см. state_cmp)
const OFF = parseInt(process.env.ROMDIFF_OFF || "0", 10);
const A = OFF >= 0 ? A0.slice(0, A0.length - OFF) : A0.slice(-OFF), B = OFF >= 0 ? B0.slice(OFF) : B0.slice(0, B0.length + OFF);
const n = Math.min(A.length, B.length);
if (n === 0) { console.log("ПРОВАЛ: ВЫБОРКА ПУСТА — ни одного снимка"); process.exit(1); }
for (let i = 0; i < n; i++) {
  if (!A[i].equals(B[i])) {
    let d = 0, first = -1;
    for (let a = 0; a < VLEN; a++) if (A[i][a] !== B[i][a]) { d++; if (first < 0) first = a; }
    console.log(`ПРОВАЛ: тик ${i + 1}: расходится ${d} байт, первый 0x${(VLO + first).toString(16)}`);
    process.exit(1);
  }
}
console.log(`ok: ${n} тиков (уровень ${LVL}, строка ${ROWa}) — видеопамять 0xC000..0xFFFF совпадает БАЙТ В БАЙТ`);
