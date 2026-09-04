// ГЕЙТ ПРАВКИ im 1: проверяет ровно две вещи — что она есть и что кроме неё
// ничего не сдвинулось.
//  1) в буте Z80-версии стоит ED 56 (im 1) сразу за DI, до первого ei;
//  2) бут i8080-ветки НЕ содержит ED-опкодов (у i8080 режимов прерываний нет);
//  3) прерывание по-прежнему приходит: счётчик FRAMES растёт на обеих сборках;
//  4) обе сборки доходят до игрового цикла.
//   node tools/verify/im1_gate.js
"use strict";
const fs = require("fs");
const path = require("path");
const { make, readSym } = require("./harness.js");
const ROOT = path.resolve(__dirname, "../..");

let fail = 0, checks = 0;
const chk = (ok, msg) => { checks++; if (ok) console.log("  ok      " + msg); else { fail++; console.log("  ПРОВАЛ  " + msg); } };

const z80boot = fs.readFileSync(ROOT + "/build/src/scubacod0.bin");
chk(z80boot[0] === 0xf3 && z80boot[1] === 0xed && z80boot[2] === 0x56,
    `Z80-бут: DI, затем ED 56 (im 1) — байты ${[...z80boot.slice(0,3)].map(b=>b.toString(16)).join(" ")}`);

// ОПКОДЫ, А НЕ БАЙТЫ. Проверка `bin.includes(0xed)` ловила и операнды: как только
// переменная бута легла на адрес $01ED, `ld (KeyLine7),A` = 32 ED 01 красил гейт
// (2026-09-04, после добавления KeyLine6 для паузы). Поэтому идём по листингу и
// смотрим только ПЕРВЫЙ байт каждой строки кода; строки данных (db/dw/…) пропускаем.
const lst = fs.readFileSync(ROOT + "/build/src8080/scubacod0.lst", "utf8").split("\n");
const edLines = [];
let codeLines = 0;
for (const line of lst) {
  const mm = /^\s*\d+\s+([0-9A-F]{4})\s+([0-9A-F]{2})(?: [0-9A-F]{2})*\s+(\S.*)?$/.exec(line);
  if (!mm) continue;
  let src = (mm[3] || "").replace(/^[A-Za-z_.$][\w.$]*:?\s+/, m => /^(db|dw|defb|defw|defs|ds|byte|word|abyte)\b/i.test(m) ? m : "");
  if (/^(db|dw|defb|defw|defs|ds|byte|word|abyte)\b/i.test(src)) continue;
  codeLines++;
  if (mm[2] === "ED") edLines.push(line.trim());
}
chk(codeLines > 100, `листинг бута i8080 разобран: строк кода ${codeLines}`);
chk(edLines.length === 0, "бут i8080-ветки не содержит ED-опкодов (режимов прерываний у i8080 нет)" + (edLines.length ? ": " + edLines.join(" | ") : ""));

for (const [tag, dir, cpu] of [["Z80-версия", "src", "z80"], ["i8080-ветка", "src8080", "i8080"]]) {
  const S0 = readSym(`${ROOT}/build/${dir}/scubacod0.sym`);
  const S1 = readSym(`${ROOT}/build/${dir}/scubacod1.sym`);
  const m = make(`${ROOT}/build/${dir}/scuba.rom`, { cpu });
  let title = -1;
  m.onPc(S1.WaitAnyKey_1, () => { if (title < 0) title = m.frame; });
  for (let f = 0; f < 3000 && title < 0; f++) m.step();
  chk(title >= 0, `${tag}: титул достигнут (кадр ${title})`);
  const f0 = m.rd(S0.FRAMES) | (m.rd(S0.FRAMES + 1) << 8);
  m.run(30);
  const f1 = m.rd(S0.FRAMES) | (m.rd(S0.FRAMES + 1) << 8);
  chk(f1 - f0 >= 25, `${tag}: прерывание приходит — FRAMES ${f0} -> ${f1} за 30 кадров`);
  m.key(13, true); m.run(4); m.key(13, false);
  let started = -1;
  m.onPc(S1.START_GAME, () => { if (started < 0) started = m.frame; });
  m.runUntilPc(S1.LEE2C, 600);
  m.key(38, true);
  for (let f = 0; f < 600 && started < 0; f++) m.step();
  m.key(38, false);
  chk(started >= 0, `${tag}: игра стартует (кадр ${started})`);
}
if (checks === 0) { console.log("ГЕЙТ НЕДЕЙСТВИТЕЛЕН: пустая выборка"); process.exit(2); }
console.log(fail ? `ГЕЙТ КРАСНЫЙ: ${fail} из ${checks}` : `ГЕЙТ ЗЕЛЁНЫЙ: все ${checks} проверки`);
process.exit(fail ? 1 : 0);
