"use strict";
// ГЕЙТ ШТОРКИ (-DCURTAIN): экран, собранный полосами, обязан совпасть с экраном,
// собранным блоками, БАЙТ В БАЙТ — во всех четырёх направлениях шторки.
//
// ПОЧЕМУ ПЕРЕРИСОВКУ ПРИХОДИТСЯ ЗАВОДИТЬ РУКАМИ. Смена экрана в игре случается,
// когда дайвер пересекает границу окна, а автопилот стенда до границы не
// доходит ВООБЩЕ: строка мини-карты не растёт (замер в oracle.js у сценария
// deep — 6000 тиков «с газом» дают максимум строку 0), вбок окно тоже стоит.
// За 700 тиков свободного плавания DrawGameScr зовётся ОДИН раз — на старте.
// Поэтому гейт вызывает перерисовку сам: в начале тика в CPU кладётся положение
// экрана, ставится направление шторки и делается call DrawGameScr с возвратом в
// ту же точку главного цикла. Игровое состояние при этом не трогается —
// DrawGameScr только рисует, а подсаженное (L5B03) возвращается на место сразу
// после возврата.
//
// Направление перебирается по кругу 0..3, положение экрана — по строкам 0..2 и
// разным столбцам карты: так одна и та же картинка собирается всеми четырьмя
// обходами, и сверка ловит именно ошибку обхода, а не случайное совпадение.
//
//   node tools/verify/curtain_gate.js <romБлок> <symБлок> <romШторка> <symШторка> [тиков] [уровни]
// CT_EMPTY=1  — перерисовку не заводить: сверять будет нечего, гейт обязан
//               покраснеть, а не отрапортовать зелёным.
// CT_INJECT=1 — базе блоков рельефа в шторке подсаживается сдвиг: обходы берут
//               не те тайлы, и гейт обязан покраснеть.
const path = require("path");
const { reachGame, KEY } = require("./drive.js");
const [romA, symA, romB, symB] = process.argv.slice(2, 6);
const NT = parseInt(process.argv[6] || "600", 10);
const LEVELS = (process.argv[7] || "1,4").split(",").map(Number);
const EMPTY = process.env.CT_EMPTY === "1", INJECT = process.env.CT_INJECT === "1";
const EVERY = 40;
const VLO = 0xc000, VLEN = 0x4000;
const DIRNAME = ["вниз", "вверх", "вправо", "влево"];

function run(rom, sym, lvl, dirs) {
  const g = reachGame(rom, sym, { cpu: "i8080", level: lvl, seed: 0x0167 });
  const m = g.m, S = g.S;
  const shots = [];
  let tick = 0, forceN = 0, inForce = false, saved = 0;
  let octo = 0;
  m.onPc(S.LD9C0, () => {
    if (inForce) {                      // вернулись из принудительной перерисовки
      inForce = false;
      if (m.rd(S.L9C50)) octo++;        // на этом экране был блок $1C
      // Снимок берётся ШИРЕ ВИДЕОПАМЯТИ. Перерисовка пишет ещё и SCRATTR —
      // карту занятости клеток, по которой ходит вся игровая логика (существа
      // метят клетки, дайвер спрашивает «под ногами рельеф?»). Она лежит в коде,
      // а не в 0xC000..0xFFFF, и сверка одной видеопамяти её бы не заметила.
      // Адрес SCRATTR у сборок РАЗНЫЙ (код разной длины) — потому и берётся из
      // .sym каждой, а сравнивается содержимое.
      const b = Buffer.alloc(VLEN + 0x300 + 4);
      for (let a = 0; a < VLEN; a++) b[a] = m.rd(VLO + a);
      for (let a = 0; a < 0x300; a++) b[VLEN + a] = m.rd(S.SCRATTR + a);
      b[VLEN + 0x300] = m.rd(S.L9C50);
      b[VLEN + 0x301] = m.rd(S.L9C51);
      b[VLEN + 0x302] = m.rd(S.L9C51 + 1);
      // L9C53 СРАВНИВАЕТСЯ НЕ ЧИСЛОМ, А СМЫСЛОМ: перерисовка кладёт туда адрес
      // пустого спрайта LA41B, а он у сборок РАЗНЫЙ — код разной длины. Сырое
      // сравнение краснело бы всегда (0xaf против 0x82) и не значило бы ничего.
      b[VLEN + 0x303] = m.rdw(S.L9C53) === S.LA41B ? 0 : 1;
      shots.push(b);
      m.wr(S.L5B03, saved & 0xff);
      m.wr(S.L5B03 + 1, (saved >> 8) & 0xff);
      return;
    }
    tick++;
    if (EMPTY || tick % EVERY) return;
    saved = m.rdw(S.L5B03);
    const k = forceN++;
    const row = k % 3, col = (k * 5) & 0x1f;
    m.wr(S.L5B03, col);
    m.wr(S.L5B03 + 1, row);
    if (S.cu_dir !== undefined) { m.wr(S.cu_dir, k & 3); if (dirs) dirs.add(k & 3); }
    if (INJECT && S.cu_blkbase !== undefined) m.wr(S.cu_blkbase + 1, (m.rd(S.cu_blkbase + 1) + 1) & 0xff);
    m.cpu.set_h(row);
    m.cpu.set_l(col);
    inForce = true;
    m.cpu.call(S.DrawGameScr);          // возврат придёт в эту же точку цикла
  });
  const D = [[KEY.DOWN], [KEY.RIGHT], [KEY.UP], [KEY.LEFT]];
  const t0 = g.ticks; let guard = 0, held = [], di = -1;
  while (g.ticks - t0 < NT && guard < 2000000) {
    const ph = Math.floor((g.ticks - t0) / 70) % D.length;
    if (ph !== di) { for (const k of held) m.key(k, false); di = ph; held = D[di]; for (const k of held) m.key(k, true); }
    if ((guard & 255) === 0) { if (S.LIVES) m.wr(S.LIVES, 3); if (S.OXYGEN) { m.wr(S.OXYGEN, 0xff); m.wr(S.OXYGEN + 1, 0xff); } }
    m.step(); guard++;
  }
  for (const k of held) m.key(k, false);
  shots.octo = octo;
  return shots;
}

let fail = 0, total = 0, octoTotal = 0;
const dirs = new Set();
for (const lvl of LEVELS) {
  const a = run(romA, symA, lvl, null), b = run(romB, symB, lvl, dirs);
  const n = Math.min(a.length, b.length);
  let bad = -1, cnt = 0;
  for (let i = 0; i < n && bad < 0; i++) if (!a[i].equals(b[i])) { bad = i;
    for (let j = 0; j < a[i].length; j++) if (a[i][j] !== b[i][j]) cnt++; }
  total += n;
  if (n === 0) { console.log(`КРАСНЫЙ ур.${lvl}: перерисовок не было — сверять нечего`); fail = 1; }
  else if (bad >= 0) {
    const first = (() => { for (let j = 0; j < a[bad].length; j++) if (a[bad][j] !== b[bad][j]) return j; })();
    const where = first < VLEN ? `экран 0x${(VLO + first).toString(16)}, ${blk(a[bad], b[bad])}`
                : first < VLEN + 0x300 ? `SCRATTR: строка ${(first - VLEN) >> 5}, столбец ${(first - VLEN) & 31}`
                : "состояние осьминога (L9C50/L9C51/L9C53)";
    console.log(`КРАСНЫЙ ур.${lvl}: перерисовка ${bad} (направление ${DIRNAME[bad % 4]}) — ${cnt} байт; первый: ${where}`);
    console.log(`  блочный=0x${a[bad][first].toString(16)} шторка=0x${b[bad][first].toString(16)}`);
    fail = 1;
  } else console.log(`ok      ур.${lvl}: ${n} перерисовок совпали байт в байт, из них с осьминогом на экране ${b.octo}`);
  octoTotal += b.octo;
}
function blk(A, B) {                     // грубая локализация: столбец/строка растра
  for (let j = 0; j < VLEN; j++) if (A[j] !== B[j]) {
    const a = VLO + j, col = (a >> 8) & 0x1f, row = 255 - (a & 0xff);
    return `столбец ${col}, строка растра ${row}, знакоместо ${(row >> 3)}`;
  }
  return "?";
}
const seen = [...dirs].sort();
console.log(`перерисовок сверено ${total}; направления шторки: ` +
            (seen.length ? seen.map(d => `${d} (${DIRNAME[d]})`).join(", ") : "ни одного"));
if (seen.length < 4) { console.log(`ПРОВАЛ: пройдено ${seen.length} направлений из 4 — боковой обход не проверен`); fail = 1; }
// ПОКРЫТИЕ ОБЪЯВЛЯЕТСЯ, А НЕ ПОДРАЗУМЕВАЕТСЯ. Отдельный проход по блокам ищет
// место осьминога ($1C): если в выборке такого блока не было, обход проверен,
// а поиск — нет, и молчать об этом нельзя.
console.log(`экранов с блоком осьминога: ${octoTotal}`);
if (!octoTotal) { console.log("ПРОВАЛ: блок $1C в выборке не встретился — поиск осьминога не проверен"); fail = 1; }
console.log(fail ? "ГЕЙТ КРАСНЫЙ" : "ГЕЙТ ЗЕЛЁНЫЙ");
process.exit(fail);
