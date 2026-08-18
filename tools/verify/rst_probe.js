// ПРОБА RST-ВЕКТОРОВ: можно ли занять байты нулевой страницы под однобайтовые
// вызовы (RST 1..6), не сломав картинку. Только замер, игровой код не трогает.
//
// Проверка «там сейчас нули» НЕДОСТАТОЧНА. Урок из King's Valley: таблица,
// положенная в 0x0039, съела вектор прерывания. Здесь опасность обратная —
// байты нулевой страницы ЧИТАЮТСЯ игрой как данные: перепись поймала, как на
// 18-19-м тике объект с нулевым указателем спрайта копирует 32 байта с адреса
// 0x0000 в спрайтовый буфер.
//
// Метод: ОТРАВЛЕНИЕ. Проверяемый диапазон забивается ядовитым байтом КАЖДЫЙ
// КАДР начиная с бута (крючок на входе в прерывание, 0x38), видимая
// видеопамять снимается каждый кадр и сверяется с чистым прогоном кадр в кадр.
// Диапазоны 0x0000..0x0003 (di / jp RestartInt) и 0x0038..0x003A (jp KEYINT)
// не травятся никогда: это живой код.
//
// ПОЧЕМУ С БУТА, А НЕ С ПЕРВОГО ТИКА. Первая версия травила с игрового тика и
// давала «не изменилось» ДАЖЕ на отравленном шрифте: за 400 тиков игры
// PrintChar не вызывается ни разу — весь текст (титул, меню, подписи HUD)
// печатается ДО первого тика. Такая проба меряет пустоту.
//
//   node tools/verify/rst_probe.js <rom> <sym1,sym2> [frames] [level] [poison]
"use strict";
const { reachGame } = require("./drive.js");
const { readSym } = require("./harness.js");

const rom = process.argv[2], symArg = process.argv[3];
const NF = parseInt(process.argv[4] || "900", 10);
const LVL = parseInt(process.argv[5] || "4", 10);
const POISON = parseInt(process.argv[6] || "0xA5", 16);
const symList = symArg.split(",");
const S = {};
for (const p of symList) Object.assign(S, readSym(p));

const VLO = 0xc000, VLEN = 0x4000;
const RANGES = [
  ["RST0 хвост", 0x04, 0x07],
  ["RST1", 0x08, 0x0f],
  ["RST2", 0x10, 0x17],
  ["RST3", 0x18, 0x1f],
  ["RST4", 0x20, 0x27],
  ["RST5", 0x28, 0x2f],
  ["RST6", 0x30, 0x37],
  ["RST7 хвост", 0x3b, 0x3f],
];
// САМОПРОВЕРКА. Без неё «картинка не изменилась» ничего не значит: ровно так же
// выглядит проба, которая просто не работает. Травим глиф 'P' — он печатается
// на титуле ("PRESS ENTER") ещё до первого игрового тика, расхождение ОБЯЗАНО
// быть. Травить ВЕСЬ шрифт нельзя: стенд тогда не доводит игру до старта и
// падает, а падение — не тот сигнал, который нужен от самопроверки.
if (S.ROM_CHARSET == null || S.ROM_CHARSET_END == null) {
  console.error("нет меток ROM_CHARSET/ROM_CHARSET_END — самопроверку не на чем строить"); process.exit(2);
}
const GP = S.ROM_CHARSET + (0x50 - 0x20) * 8;      // глиф 'P' — печатается на титуле ("PRESS ENTER")
RANGES.push(["САМОПРОВЕРКА глиф 'P'", GP, GP + 7]);

function run(lo, hi) {
  const out = [];
  const g = reachGame(rom, symList[0], { cpu: "i8080", level: LVL, seed: 0x0167, preHook: (m) => {
    m.onPc(0x38, () => {
      if (lo >= 0) for (let a = lo; a <= hi; a++) m.wr(a, POISON);
      if (out.length < NF) {
        const b = Buffer.alloc(VLEN);
        for (let a = 0; a < VLEN; a++) b[a] = m.rd(VLO + a);
        out.push(b);
      }
    });
  }});
  g.m.key(38, true);
  let guard = 0;
  while (out.length < NF && guard < 4000000) { g.m.step(); guard++; }
  return out;
}

const base = run(-1, -1);
if (base.length === 0) { console.log("ВЫБОРКА ПУСТА: ни одного снимка — замер недействителен"); process.exit(1); }
console.log(`=== ПРОБА RST  ${rom}  уровень ${LVL}, ${base.length} кадров с бута, яд 0x${POISON.toString(16)}`);
let selfOk = false;
const verdict = [];
for (const [name, lo, hi] of RANGES) {
  let p;
  try { p = run(lo, hi); }
  catch (e) {   // отравление сломало ход игры настолько, что стенд не довёл её до старта —
                // это тоже расхождение, и притом самое грубое
    if (name.startsWith("САМОПРОВЕРКА")) selfOk = true;
    console.log(`    ${name.padEnd(20)} 0x${lo.toString(16)}..0x${hi.toString(16)}: СТЕНД НЕ ДОВЁЛ ИГРУ ДО СТАРТА (${e.message}) — диапазон живой`);
    verdict.push([name, false]);
    continue;
  }
  const n = Math.min(base.length, p.length);
  let bad = -1, cnt = 0;
  for (let i = 0; i < n; i++) if (!base[i].equals(p[i])) { bad = i + 1; for (let a = 0; a < VLEN; a++) if (base[i][a] !== p[i][a]) cnt++; break; }
  const tag = `0x${lo.toString(16).padStart(2, "0")}..0x${hi.toString(16).padStart(2, "0")} (${hi - lo + 1} Б)`;
  if (bad < 0) { console.log(`    ${name.padEnd(20)} ${tag}: картинка НЕ ИЗМЕНИЛАСЬ за ${n} кадров`); verdict.push([name, true]); }
  else { if (name.startsWith("САМОПРОВЕРКА")) selfOk = true;
    console.log(`    ${name.padEnd(20)} ${tag}: РАСХОЖДЕНИЕ с кадра ${bad}, ${cnt} байт видеопамяти`); verdict.push([name, false]); }
}
if (!selfOk) {
  console.log("    ПРОВАЛ САМОПРОВЕРКИ: отравленный шрифт не изменил картинку — проба НЕ РАБОТАЕТ, " +
              "все её «не изменилось» выше недействительны.");
  process.exit(1);
}
console.log("    самопроверка пройдена: проба видит подсаженное изменение");
