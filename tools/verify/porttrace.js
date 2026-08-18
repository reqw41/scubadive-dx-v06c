// ТРАССА ПОРТОВ. Записывает КАЖДЫЙ вывод в порт: номер кадра, такт внутри кадра,
// растровую строку, порт и значение.
//
// Зачем. Заставка дважды ломалась на живом железе при зелёном наборе гейтов:
// слетали цвета и машина вставала. Стенд рисует картинку правильно в обоих
// случаях, поэтому «посмотреть глазами» тут бесполезно. Но ПОРЯДОК И МОМЕНТ
// обращений к портам стенд моделирует точно — и именно они решают всё для
// палитры (защёлка по цвету под лучом), ППА (режим видео), скролла (защёлкивается
// в начале картинки) и каймы. Значит трасса портов — то, что видно стенду и при
// этом объясняет поведение железа.
//
//   node tools/verify/porttrace.js <rom.rom> [кадров=10] > trace.txt
//
// Формат строки: кадр:такт:строка порт=значение
// Такт считается от входа в кадр, строка = такт/192 (192 такта на растровую
// строку, 312 строк в кадре).
"use strict";
const { make } = require("./harness.js");

const rom = process.argv[2];
const FRAMES = parseInt(process.argv[3] || "10", 10);
if (!rom) { console.log("нужен путь к .rom"); process.exit(2); }

const m = make(rom, { cpu: "i8080" });
let acc = 0, frameStart = 0, frame = 0;
const origCb = m.v06c.check_breakpoint;
m.v06c.check_breakpoint = () => { const r = origCb(); acc += (m.cpu.vcycles || 0); return r; };

const out = [];
const io = m.io, origOut = io.output.bind(io);
io.output = (p, v) => {
  const c = acc - frameStart;
  out.push(`${frame}:${String(c).padStart(5)}:${String(Math.floor(c / 192)).padStart(3)} ` +
           `${(p & 0xff).toString(16).padStart(2, "0")}=${(v & 0xff).toString(16).padStart(2, "0")}`);
  return origOut(p, v);
};

// PORTTRACE_KEY_AT=N — нажать клавишу на кадре N, чтобы заставка отдала управление
// игре и в трассу попал ЕЁ бут. Без этого 200 кадров — всё ещё заставка, и трассы
// двух образов с разными играми совпадают просто потому, что игра не запускалась.
const KEY_AT = parseInt(process.env.PORTTRACE_KEY_AT || "0", 10);
for (frame = 0; frame < FRAMES; frame++) {
  frameStart = acc;
  if (KEY_AT && frame === KEY_AT) m.key(13, true);
  if (KEY_AT && frame === KEY_AT + 6) m.key(13, false);
  m.step();
}
if (out.length === 0) { console.log("ПУСТАЯ ТРАССА: ни одного обращения к порту"); process.exit(2); }
console.log(out.join("\n"));
