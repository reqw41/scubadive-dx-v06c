// ГЕЙТ RST-ВЕКТОРОВ. Три вектора отданы под однобайтные вызовы хелперов:
//   0x20 -> z80_sta_X, 0x28 -> z80_stn_X, 0x30 -> z80_setX
// Это экономит 2 байта на каждой из 126 площадок вызова.
//
// ЗАЧЕМ ОТДЕЛЬНЫЙ ГЕЙТ. В соседнем проекте (King's Valley) таблица, положенная в
// 0x0039, съела вектор прерывания — дефект вылез далеко от места правки и стоил
// дорого. Здесь та же ловушка: нулевая страница делится между RST-векторами и
// СТЕКОМ (SP ставится в 0x0100 и растёт вниз). Поэтому проверяем три вещи:
//   1) вектора действительно установлены и указывают на нужные хелперы;
//   2) в 0x20..0x37 за прогон НИКТО не пишет после установки;
//   3) стек НИ РАЗУ не опускается до 0x37 — иначе он затрёт вектора.
//
// Негативные контроли:
//   RST_INJECT=1 — испортить байт вектора после установки, гейт обязан покраснеть
//   RST_EMPTY=1  — обнулить выборку, гейт обязан покраснеть
//
//   node tools/verify/rst_gate.js
"use strict";
const path = require("path");
const { readSym } = require("./harness.js");
const { reachGame } = require("./drive.js");
const ROOT = path.resolve(__dirname, "../..");
const B = process.env.BUILD_DIR || "build";
const INJECT = process.env.RST_INJECT === "1";
const EMPTY = process.env.RST_EMPTY === "1";

const rom = `${ROOT}/${B}/prod/scuba.rom`, sym = `${ROOT}/${B}/prod/scubacod1.sym`;
const S = readSym(sym);
const VECT = [[0x20, "z80_sta_X"], [0x28, "z80_stn_X"], [0x30, "z80_setX"]];
for (const [, n] of VECT) if (S[n] == null) { console.log("нет метки " + n); process.exit(2); }

let fail = 0, checks = 0;
const chk = (ok, msg) => { checks++; if (ok) console.log("  ok      " + msg);
                           else { fail++; console.log("  ПРОВАЛ  " + msg); } };

const g = reachGame(rom, sym, { cpu: "i8080", level: 4, seed: 0x0167 });
const m = g.m;

// сторож записи по всей области векторов и водяной знак стека
const writes = [];
let minSp = 0xffff;
const orig = m.memory.write.bind(m.memory);
m.memory.write = (a, v, st) => { a &= 0xffff;
  if (a >= 0x20 && a <= 0x37) writes.push(a);
  return orig(a, v, st); };
let ticks = 0;
m.onPc(S.LD9C0, () => { ticks++; });
const origCb = m.v06c.check_breakpoint;
m.v06c.check_breakpoint = () => { const r = origCb();
  const sp = m.cpu.sp & 0xffff; if (sp < minSp) minSp = sp; return r; };

m.key(38, true);
let guard = 0;
while (ticks < 1200 && guard < 400000) { m.step(); guard++; }

if (EMPTY || ticks === 0) {
  console.log(`  ПРОВАЛ  ПУСТАЯ ВЫБОРКА: игровых тиков ${EMPTY ? 0 : ticks}`);
  console.log("ГЕЙТ НЕДЕЙСТВИТЕЛЕН");
  process.exit(2);
}

if (INJECT) m.wr(0x21, m.rd(0x21) ^ 0xff);

// 1. вектора установлены и ведут куда надо
for (const [addr, name] of VECT) {
  const op = m.rd(addr), dst = m.rdw(addr + 1);
  chk(op === 0xC3 && dst === S[name],
      `вектор 0x${addr.toString(16)}: jp 0x${dst.toString(16)} -> ожидали ${name} ` +
      `(0x${S[name].toString(16)}), опкод 0x${op.toString(16)}`);
}
// 2. после установки в область векторов никто не пишет
chk(writes.length === 0,
    `записей в 0x20..0x37 за ${ticks} тиков: ${writes.length}` +
    (writes.length ? ` (адреса ${[...new Set(writes)].map(a => "0x" + a.toString(16)).join(",")})` : ""));
// 3. стек не достаёт до векторов
chk(minSp > 0x37,
    `минимальный SP за прогон 0x${minSp.toString(16)}; вектора кончаются на 0x37, ` +
    `запас ${minSp - 0x37} байт`);

console.log(fail ? `ГЕЙТ КРАСНЫЙ: ${fail} из ${checks}` : `ГЕЙТ ЗЕЛЁНЫЙ: все ${checks} проверки`);
process.exit(fail ? 1 : 0);
