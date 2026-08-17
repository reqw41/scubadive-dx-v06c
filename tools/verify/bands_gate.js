// ГЕЙТ ПОЛОСНОЙ ПАЛИТРЫ (диагностический образ).
//
// ЧЕСТНОЕ ПРЕДУПРЕЖДЕНИЕ, читать до того, как поверить зелёному.
// Стенд точно моделирует ТАКТЫ процессора, поэтому проверить, в какой растровой
// строке происходит запись слота и как она дрожит от кадра к кадру, он может.
// А вот САМУ ЗАЩЁЛКУ палитры (на MiSTer слот выбирается по цвету, который луч
// показывает в момент out 0x0C) стенд моделирует ИНАЧЕ, чем RTL. Поэтому:
//   зелёный гейт означает «записи стоят в нужных строках и не дышат»,
//   и НЕ означает «на экране появились полосы».
// Экранный результат подтверждает ТОЛЬКО владелец на железе. Ровно на этом месте
// я уже обжёгся с портами AY: гейт был зелёный, на MiSTer не работало.
//
//   node tools/verify/bands_gate.js [ожидаемые_строки через запятую]
"use strict";
const path = require("path");
const { make } = require("./harness.js");
const ROOT = path.resolve(__dirname, "../..");
const B = process.env.BUILD_DIR || "build";
const rom = `${ROOT}/${B}/prod/scuba_splash_bands.rom`;
const want = (process.argv[2] || "40,76,112,148,184,220").split(",").map(Number);

const m = make(rom, { cpu: "i8080" });
// записи в палитру: строка растра в момент out 0x0C, и что было в кайме (порт 2)
const frames = [];
let cur = null, border = 0;
const io = m.io, origOut = io.output.bind(io);
io.output = (p, v) => {
  p &= 0xff; v &= 0xff;
  if (p === 0x02) border = v & 0x0f;
  if (p === 0x0C && cur) cur.push({ line: m.v06c.filler ? m.v06c.filler.raster_line : -1, slot: border, val: v });
  return origOut(p, v);
};
for (let f = 0; f < 40; f++) { cur = []; m.step(); frames.push(cur); }

// первые кадры — палитра целиком (16 слотов по 8 записей), их пропускаем
const bandFrames = frames.filter(f => f.length > 0 && f.length <= 32);
let fail = 0, checks = 0;
const chk = (ok, msg) => { checks++; if (ok) console.log("  ok      " + msg);
                           else { fail++; console.log("  ПРОВАЛ  " + msg); } };

chk(bandFrames.length >= 10, `кадров с полосной записью: ${bandFrames.length} из ${frames.length}`);
if (bandFrames.length === 0) { console.log("ГЕЙТ КРАСНЫЙ: полосы не пишутся вовсе"); process.exit(1); }

const n = want.length;
chk(bandFrames.every(f => f.length === n),
    `в каждом кадре ровно ${n} записей (наблюдалось: ${[...new Set(bandFrames.map(f => f.length))].join(",")})`);

// позиции и джиттер по каждой полосе
console.log("  полоса: ожидали -> наблюдали (мин..макс по кадрам), джиттер");
let worst = 0;
for (let i = 0; i < n; i++) {
  const ls = bandFrames.map(f => (f[i] || {}).line).filter(x => x != null && x >= 0);
  if (!ls.length) { chk(false, `полоса ${i}: записей нет`); continue; }
  const mn = Math.min(...ls), mx = Math.max(...ls), j = mx - mn;
  if (j > worst) worst = j;
  console.log(`    ${String(i).padStart(2)}: ${String(want[i]).padStart(4)} -> ${String(mn).padStart(4)}..${String(mx).padStart(4)}, джиттер ${j} стр.`);
}
chk(worst <= 1, `джиттер границ не больше строки (худший: ${worst})`);
const slots = new Set(bandFrames[0].map(w => w.slot));
chk(slots.size === 1 && slots.has(1), `все записи адресованы слоту 1 (наблюдалось: ${[...slots].join(",")})`);

console.log(fail ? `ГЕЙТ КРАСНЫЙ: ${fail} из ${checks}` : `ГЕЙТ ЗЕЛЁНЫЙ: все ${checks} проверки (но экран подтверждает только железо, см. шапку)`);
process.exit(fail ? 1 : 0);
