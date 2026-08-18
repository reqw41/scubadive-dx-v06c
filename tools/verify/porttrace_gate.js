// ГЕЙТ ТРАССЫ ПОРТОВ ЗАСТАВКИ.
//
// Заставка дважды ломалась на живом железе при полностью зелёном наборе: слетали
// цвета и машина вставала. Байтовая сверка стартера это не ловила бы, если бы
// сломался ПОРЯДОК или МОМЕНТ обращений к портам — а для палитры (защёлка по
// цвету под лучом), ППА, скролла и каймы решают именно они.
//
// Эталон снят с образа 417305c6 (стартер эпохи f79785f), который владелец
// подтвердил на MiSTer. Любой дрейф порядка, значения или момента = КРАСНЫЙ.
// Красный тут НЕ значит «обнови эталон»: он значит, что путь заставки изменился и
// его надо проверить НА ЖЕЛЕЗЕ, а эталон пересоздавать только после подтверждения.
//
//   PORTTRACE_INJECT=1 — подсадить дефект, гейт обязан покраснеть
"use strict";
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const ROOT = path.resolve(__dirname, "../..");
const B = process.env.BUILD_DIR || "build";
const refP = `${ROOT}/tools/verify/ref/splash_porttrace_f79785f.txt`;
const rom = `${ROOT}/${B}/prod/scuba_splash.rom`;
if (!fs.existsSync(rom)) { console.log("нет образа " + rom); process.exit(2); }
const ref = fs.readFileSync(refP, "utf8").trim().split("\n");
let got = execFileSync("node", [`${ROOT}/tools/verify/porttrace.js`, rom, "10"],
                       { encoding: "utf8", maxBuffer: 1 << 24 }).trim().split("\n");
if (process.env.PORTTRACE_INJECT === "1" && got.length > 20) got[20] = got[20].replace(/=..$/, "=99");
if (got.length === 0 || (got.length === 1 && !got[0])) {
  console.log("  ПРОВАЛ  ПУСТАЯ ТРАССА"); console.log("ГЕЙТ НЕДЕЙСТВИТЕЛЕН"); process.exit(2);
}
let bad = -1;
for (let i = 0; i < Math.max(ref.length, got.length); i++)
  if (ref[i] !== got[i]) { bad = i; break; }
if (bad < 0) {
  console.log(`  ok      трасса портов бута заставки совпала с эталоном f79785f (${ref.length} обращений)`);
  console.log("ГЕЙТ ЗЕЛЁНЫЙ: все 1 проверки"); process.exit(0);
}
console.log(`  ПРОВАЛ  трасса портов разошлась с эталоном на записи №${bad}:`);
console.log(`            эталон: ${ref[bad] || "(конец)"}`);
console.log(`            собрано: ${got[bad] || "(конец)"}`);
console.log(`            всего записей: эталон ${ref.length}, собрано ${got.length}`);
console.log("ГЕЙТ КРАСНЫЙ: 1 из 1"); process.exit(1);
