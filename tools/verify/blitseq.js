"use strict";
// СВЕРКА ПОСЛЕДОВАТЕЛЬНОСТИ БЛИТОВ ДВУХ ОБРАЗОВ, а не конечной картинки.
//
// Зачем. Когда данные и записи совпадают, а картинка расходится, виноват ПОРЯДОК:
// кто, когда и куда рисовал. Конечный кадр этого не показывает — он показывает
// только сумму. Здесь пишется журнал каждого блита (тик, запись, тип, позиция,
// ширина, признак зеркала) и сравнивается запись в запись до первого расхождения.
//
// Мера намеренно не трогает пиксели: если журналы совпали, а картинка нет —
// значит дело в содержимом масок, и искать надо там; если журналы разошлись —
// видно ровно тот блит, с которого началось.
//
//   node tools/verify/blitseq.js <romA> <symA> <romB> <symB> [тиков] [уровень]
const fs = require("fs"), path = require("path");
const { reachGame, KEY } = require("./drive.js");
const [ra, sa, rb, sb] = process.argv.slice(2, 6);
const NT = parseInt(process.argv[6] || "40", 10);
const LVL = parseInt(process.argv[7] || "2", 10);
if (!rb) { console.error("нужны romA symA romB symB"); process.exit(2); }

function log(rom, sym, ticks) {
  const g = reachGame(rom, sym, { cpu: "i8080", level: LVL, seed: 0x0167 });
  const m = g.m, S = g.S, out = [];
  let stop = false;
  m.onPc(S.LD9C0, () => { if (g.ticks > ticks) stop = true; });
  m.onPc(S.LB470, () => {
    if (stop) return;
    const ix = m.rdw(S.z80_ix), iy = m.rdw(S.z80_iy);
    out.push({
      t: g.ticks,
      rec: ix,                       // адрес записи существа
      desc: m.rdw(ix + 0x13),        // тип
      col: m.rd(ix + 2), row: m.rd(ix + 3),
      frame: m.rdw(ix + 11),
      set: m.rdw(ix + 9),
      mir: S.mir_on !== undefined ? m.rd(S.mir_on) : -1,
    });
  });
  m.key(KEY.UP, true);
  let guard = 0;
  while (!stop && guard < 400000) { m.step(); guard++; }
  return out;
}

const A = log(ra, sa, NT), B = log(rb, sb, NT);
console.log(`блитов: ${A.length} против ${B.length} за ${NT} тиков (уровень ${LVL})`);
// сравниваем то, что обязано совпадать: тик, позиция, фаза кадра относительно набора
const n = Math.min(A.length, B.length);
let bad = 0, shown = 0;
for (let i = 0; i < n; i++) {
  const a = A[i], b = B[i];
  const same = a.t === b.t && a.col === b.col && a.row === b.row
            && ((a.frame - a.set) & 0x7fff) === ((b.frame - b.set) & 0x7fff);
  if (same) continue;
  bad++;
  if (shown++ < 6)
    console.log(`  блит #${i}: тик ${a.t}/${b.t}  позиция (${a.col},${a.row})/(${b.col},${b.row})` +
                `  фаза +${(a.frame - a.set) & 0x7fff}/+${(b.frame - b.set) & 0x7fff}` +
                `  зеркало ${b.mir}`);
}
console.log(bad ? `расходится блитов: ${bad} из ${n}` : "ПОСЛЕДОВАТЕЛЬНОСТЬ БЛИТОВ СОВПАЛА");
