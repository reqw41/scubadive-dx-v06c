// ЦЕНА КУСКА В ОБРАЗЕ: сколько байт ROM освободит его удаление.
// ТОЛЬКО ЗАМЕР: ничего не правит, исходников не трогает, собирает во временный
// каталог.
//
// Зачем отдельный инструмент. Размер в ПАМЯТИ и размер в ОБРАЗЕ — разные числа,
// и для мёртвых блоков они расходятся на порядок: 161 байт нулей занимают в RAM
// ровно 161 байт, а в ZX0-потоке — единицы. Говорить «мусора N байт», не
// различая эти два числа, значит обещать владельцу возврат, которого не будет.
//
// Мера. Из scubacod1.bin вырезается указанный кусок, остаток жмётся тем же
// salvador -classic, что и сборка. Разница длин потоков и есть цена в образе.
// Сдвиг адресов при вырезании меняет сжатие на единицы байт — поэтому число
// печатается как оценка, а не как обещание.
//
//   node tools/verify/pack_cost.js [каталог] < список
// Список — строки «имя<таб>адрес<таб>длина» (адрес шестнадцатеричный с 0x).
"use strict";
const fs = require("fs"), path = require("path"), cp = require("child_process");
const ROOT = path.resolve(__dirname, "../..");
const DIR = process.argv[2] || `${ROOT}/build/prod_hw`;
const SALV = `${ROOT}/tools/bin/salvador`;
const TMP = fs.mkdtempSync("/tmp/packcost-");
const bin = fs.readFileSync(`${DIR}/scubacod1.bin`);
function readSymFile(f) {
  const S = {};
  for (const l of fs.readFileSync(f, "latin1").split("\n")) {
    const m = /^(\S+?):?\s+EQU\s+(?:0x)?([0-9A-Fa-f]+)/.exec(l);
    if (m) S[m[1]] = parseInt(m[2], 16);
  }
  return S;
}
const S = Object.assign({}, readSymFile(`${DIR}/scubacod0.sym`), readSymFile(`${DIR}/scubacod1.sym`));
const LO = S.SCUBACOD0_END;

function pack(buf, tag) {
  const src = `${TMP}/${tag}.bin`, dst = `${TMP}/${tag}.zx0`;
  fs.writeFileSync(src, buf);
  cp.execFileSync(SALV, ["-classic", src, dst], { stdio: "ignore" });
  return fs.statSync(dst).size;
}
const base = pack(bin, "base");
console.log(`базовый поток: ${base} Б из ${bin.length} Б памяти`);

const input = fs.readFileSync(0, "utf8").split("\n").filter(x => x.trim() && !x.startsWith("#"));
if (!input.length) { console.log("пустой список — мерить нечего"); process.exit(1); }
console.log("");
console.log("  кусок                                 в памяти   в образе");
let totMem = 0, totRom = 0;
for (const line of input) {
  const [nm, aS, lS] = line.split("\t");
  const a = parseInt(aS, 16), len = parseInt(lS, 10);
  if (!(a >= LO && a + len <= LO + bin.length)) { console.log(`  ${nm}: вне блока 1 — пропуск`); continue; }
  const cut = Buffer.concat([bin.subarray(0, a - LO), bin.subarray(a - LO + len)]);
  const sz = pack(cut, "c" + a.toString(16));
  totMem += len; totRom += base - sz;
  console.log(`  ${nm.padEnd(36)} ${String(len).padStart(6)} Б  ${String(base - sz).padStart(6)} Б`);
}
console.log(`  ${"ИТОГО".padEnd(36)} ${String(totMem).padStart(6)} Б  ${String(totRom).padStart(6)} Б`);
fs.rmSync(TMP, { recursive: true, force: true });
