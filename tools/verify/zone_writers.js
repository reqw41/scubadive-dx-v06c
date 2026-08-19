// ЗАМЕР ДЛЯ ЭТАПА 4: КТО ПИШЕТ В ЗОНУ НА ВСЁМ СПЕКТРЕ, ПО ФАЗАМ.
//
// Зачем. Раскладка ломтей сегодня зовётся ДВАЖДЫ за игру, потому что зону портят
// «полноэкранные писатели» — меню, чистки, распаковщик панели. Чтобы сделать её
// ОДНОКРАТНОЙ (и тем освободить упакованный источник сразу после бута), надо
// знать поимённо ВСЕХ таких писателей и последнего из них по времени: раскладка
// ставится ПОСЛЕ него.
//
// Спектр ведётся по фазам, а не по тикам: бут -> титул -> меню -> игра -> смерть
// -> game over -> меню -> игра. Смерть вызывается обнулением кислорода, а не
// ожиданием: ждать её на глаз — это прогон в десятки тысяч кадров.
//
//   node tools/verify/zone_writers.js [каталог сборки]
"use strict";
const path = require("path");
const { make, readSym } = require("./harness.js");
const ROOT = path.resolve(__dirname, "../..");
const B = process.env.BUILD_DIR || "build";
const dir = process.argv[2] || `${ROOT}/${B}/ev`;
const S = readSym(`${dir}/scubacod1.sym`);
for (const n of ["WaitAnyKey_1", "LEE2C", "START_GAME", "LD9C0", "OXYGEN", "LIVES"])
  if (S[n] == null) { console.log(`нет метки ${n}`); process.exit(2); }

const names = Object.entries(S).filter(([k, v]) => typeof v === "number" && v >= 0x100)
                               .sort((a, b) => a[1] - b[1]);
function nameOf(a) { let best = null;
  for (const [k, v] of names) { if (v <= a) best = [k, v]; else break; }
  return best ? (best[1] === a ? best[0] : `${best[0]}+${a - best[1]}`) : `pc${a.toString(16)}`; }

const m = make(dir + "/scuba.rom", { cpu: "i8080" });
let phase = "бут";
const log = new Map();                       // "фаза|писатель" -> {n, cols:Set}
const o = m.memory.write.bind(m.memory);
m.memory.write = (a, v, st) => { a &= 0xffff;
  if (a >= 0xA000 && (a & 0xff) >= 192) {    // зона: строки картинки 0..63
    const k = `${phase} | ${nameOf(m.cpu.pc & 0xffff)}`;
    let r = log.get(k); if (!r) log.set(k, r = { n: 0, cols: new Set() });
    r.n++; r.cols.add(`${(a & 0xE000).toString(16)}:${(a >> 8) & 0x1f}`);
  }
  return o(a, v, st); };

const step = n => { for (let i = 0; i < n; i++) m.step(); };
const press = (k, hold) => { m.key(k, true); step(hold || 6); m.key(k, false); step(2); };
const until = (addr, lim) => { let hit = false; const f = () => { hit = true; };
  m.onPc(addr, f); for (let i = 0; i < (lim || 2000) && !hit; i++) m.step();
  const arr = []; return hit; };

let ticks = 0; m.onPc(S.LD9C0, () => { ticks++; });

phase = "бут";            until(S.WaitAnyKey_1, 3000);
phase = "титул";          step(30);
press(13);                                          // ENTER -> меню
phase = "меню (первый раз)"; until(S.LEE2C, 600); step(60);
press(38, 10);                                      // UP -> старт
phase = "игра (уровень 1)"; until(S.START_GAME, 600);
{ let t0 = ticks; for (let i = 0; i < 3000 && ticks - t0 < 200; i++) m.step(); }
// СМЕРТЬ: обнуляем кислород и жизни — иначе спектр не доходит до game over вовсе
phase = "смерть";
m.wr(S.LIVES, 1);
{ let t0 = ticks; for (let i = 0; i < 6000 && ticks - t0 < 400; i++) {
    m.wr(S.OXYGEN, 0); m.wr(S.OXYGEN + 1, 0); m.step(); } }
phase = "game over / возврат"; step(400);
press(13); press(13);
phase = "меню (повторно)"; step(200);
press(38, 10);
phase = "игра (повторный вход)";
{ let t0 = ticks; for (let i = 0; i < 4000 && ticks - t0 < 200; i++) m.step(); }

console.log(`тиков главного цикла всего: ${ticks}`);
const rows = [...log.entries()].sort((a, b) => b[1].n - a[1].n);
if (!rows.length) { console.log("ПУСТАЯ ВЫБОРКА — в зону не писал никто, замер недействителен");
                    process.exit(2); }
console.log("записи в зону (плоскости 1..3, младшие 192..255), по фазам:");
for (const [k, r] of rows)
  console.log(`  ${String(r.n).padStart(7)}  ${k}   столбцов ${r.cols.size}` +
              (r.cols.size <= 8 ? `  [${[...r.cols].join(" ")}]` : "  ПОЛНОЭКРАННЫЙ"));
