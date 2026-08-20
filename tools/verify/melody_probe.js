// КАКИЕ МЕЛОДИИ ЗВУЧАТ ЗА СЕАНС И В КАКОЙ ФАЗЕ.
//
// Вопрос владельца: «а стартовая мелодия ZX Spectrum осталась?»
//
// Мера двойная и в одном прогоне:
//   1) ЗАЯВКА — заход в PlayMelody с адресом таблицы в HL. Адрес сверяется с
//      метками таблиц (LE604/LE60B/LE61C/LE629/LE630/LE632/LE634/LE638/LEDD5),
//      то есть мелодия названа по имени, а не угадана по нотам;
//   2) ЗВУК — записи делителя в порт 0x09 драйвером ВИ53. Заявка без записей в
//      порт означала бы «мелодию отдали, но она не зазвучала».
// Обе привязаны к ФАЗЕ: бут -> меню -> игра -> гибель -> game over. Фаза
// определяется попаданиями PC в метки, а не временем.
//
//   node tools/verify/melody_probe.js [путь_к_сборке]
"use strict";
const fs = require("fs"), path = require("path");
const { readSym, make } = require("./harness.js");
const ROOT = path.resolve(__dirname, "../..");
const B = process.env.BUILD_DIR || "build";
const DIR = process.argv[2] || `${ROOT}/${B}/prod_hw`;
for (const f of ["scuba.rom", "scubacod1.sym"])
  if (!fs.existsSync(`${DIR}/${f}`)) { console.log(`нет ${DIR}/${f}`); process.exit(2); }
const S = readSym(`${DIR}/scubacod1.sym`);
const TABLES = ["LE604", "LE60B", "LE61C", "LE629", "LE630", "LE632", "LE634", "LE638", "LEDD5"];
const byAddr = new Map();
for (const t of TABLES) if (S[t] != null) byAddr.set(S[t], t);
const WHAT = { LE604: "удар о рельеф/утопление", LE60B: "подбор предмета",
               LE61C: "взрыв дайвера", LE629: "мало кислорода", LE630: "короткий писк",
               LE632: "короткий писк", LE634: "короткий писк", LE638: "длинная (бонус?)",
               LEDD5: "СТАРТОВАЯ (ZX: игралась 10 раз на экране меню)" };

const m = make(`${DIR}/scuba.rom`, { cpu: "i8080" });
let phase = "бут";
const asked = [], sound = new Map();
let lo = null;
const io = m.io, origOut = io.output.bind(io);
io.output = (port, v) => {
  if ((port & 0xff) === 0x09) {
    if (lo === null) lo = v & 0xff;
    else { const d = lo | ((v & 0xff) << 8); lo = null;
      const k = phase; const e = sound.get(k) || { n: 0, div: [] };
      e.n++; if (e.div.length < 6) e.div.push(d); sound.set(k, e); }
  }
  return origOut(port, v);
};
if (S.PlayMelody != null) m.onPc(S.PlayMelody, () => {
  const hl = m.cpu.hl() & 0xffff;
  asked.push({ phase, hl, name: byAddr.get(hl) || "0x" + hl.toString(16) });
});
for (const [lbl, ph] of [["LEDFE", "меню"], ["START_GAME", "старт игры"], ["LD9C0", "игра"],
                         ["DiverExplosion", "гибель"], ["LDA33", "game over"]])
  if (S[lbl] != null) m.onPc(S[lbl], () => { if (phase !== ph) phase = ph; });

// --- прогон: бут -> меню -> игра -> гибель -> game over
let seenMenu = false;
m.onPc(S.LEE2C, () => { seenMenu = true; });
for (let i = 0; i < 3000 && !seenMenu; i++) m.step();
const menuFrames = 400;                       // постоять в меню, послушать
for (let i = 0; i < menuFrames; i++) m.step();
m.key(38, true); m.run(4); m.key(38, false);  // «газ» — старт игры
let inGame = false, ticks = 0, overSeen = 0, boomSeen = 0;
m.onPc(S.LD9C0, () => { inGame = true; ticks++; });
if (S.LDA33 != null) m.onPc(S.LDA33, () => { overSeen++; });
if (S.DiverExplosion != null) m.onPc(S.DiverExplosion, () => { boomSeen++; });
for (let i = 0; i < 1500 && !inGame; i++) m.step();
for (let i = 0; i < 300; i++) m.step();
// ГИБЕЛЬ ТЕМ ЖЕ ПРИЁМОМ, ЧТО И В ГЕЙТАХ: агония включается битом 5 в
// DiverObj+$10. Писать OXYGEN бесполезно — игра пересчитывает его каждый тик из
// своего значения и подсадку затирает (проверено: ни одной ноты).
// Плавание перед гибелью: дайвер должен уйти от лодки, иначе тонуть негде.
for (let i = 0; i < 120; i++) { m.key(40, true); m.step(); }
m.key(40, false);
if (S.LIVES != null) m.wr(S.LIVES, 1);
for (let i = 0; i < 3000; i++) {
  if ((i & 63) === 0 && S.DiverObj != null) m.wr(S.DiverObj + 0x10, m.rd(S.DiverObj + 0x10) | 0x20);
  m.step();
}
for (let i = 0; i < 800; i++) m.step();

console.log(`МЕЛОДИИ: ${DIR}`);
console.log(`  меню достигнуто: ${seenMenu}, игра достигнута: ${inGame}, ` +
            `игровых тиков ${ticks}, LIVES на конце ${S.LIVES != null ? m.rd(S.LIVES) : "?"}, ` +
            `game over ${overSeen}, взрывов ${boomSeen}, фаза на конце «${phase}»`);
const byPhase = new Map();
for (const a of asked) {
  const k = `${a.phase} :: ${a.name}`;
  byPhase.set(k, (byPhase.get(k) || 0) + 1);
}
console.log("  ЗАЯВКИ (заход в PlayMelody):");
if (!byPhase.size) console.log("      ни одной");
for (const [k, n] of byPhase) {
  const nm = k.split(" :: ")[1];
  console.log(`      ${k.padEnd(46)} x${n}   ${WHAT[nm] || ""}`);
}
console.log("  ЗВУК (пары байт делителя в порт 0x09) по фазам:");
for (const [k, e] of sound)
  console.log(`      ${k.padEnd(14)} записей ${String(e.n).padStart(4)}, первые делители ` +
              e.div.join(", "));
// СТАРТОВАЯ МЕЛОДИЯ ОТДЕЛЬНО
const started = asked.filter(a => a.name === "LEDD5");
console.log("");
console.log(`  СТАРТОВАЯ (LEDD5): заявок ${started.length}` +
            (started.length ? `, фазы: ${[...new Set(started.map(a => a.phase))].join(", ")}` : ""));
if (S.LEDD5 != null) {
  const bytes = [];
  for (let i = 0; i < 12; i++) bytes.push(m.rd(S.LEDD5 + i));
  console.log(`      таблица жива по 0x${S.LEDD5.toString(16)}: ` +
              bytes.map(b => "0x" + b.toString(16).padStart(2, "0")).join(" "));
}
