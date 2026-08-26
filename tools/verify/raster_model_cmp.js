// СРАВНЕНИЕ МОДЕЛЕЙ ЗАЩЁЛКИ ПАЛИТРЫ НА ЖИВЫХ РАСТРОВЫХ ЗАЛПАХ.
//
// Обе модели защёлкивают слот тем цветом, что луч показывает в момент out 0x0C,
// но РАЗНОСЯТ порты по-разному:
//   vector06js (src/tv.js): commit_time = (instr_time-5)*4+4, палитра на 20 clk
//                           раньше, растр смещён на -24 точки в PixelFiller.fill;
//   Emu80 v4 (src/Vector.cpp): у каждого порта своя КАЛИБРОВАННАЯ задержка —
//                           палитра advanceTo(now + 27 px), кайма и прокрутка
//                           +48, запись в видеопамять +40.
// Числа Emu80 из формул не выводятся, их снимали с живой машины; поэтому вопрос
// «в какой строке на самом деле защёлкивается залп» стоит задать обеим.
//
// Патч НЕ ТРОГАЕТ ~/projects/vector06js: подменяется чтение файла в этом
// процессе, поэтому работает штатный reachGame со всей его доводкой до игры.
//   MODEL=emu80 node tools/verify/raster_model_cmp.js <каталог сборки>
"use strict";
const fs = require("fs"), path = require("path");
const MODEL = process.env.MODEL || "ours";
if (MODEL === "emu80") {
  const orig = fs.readFileSync;
  fs.readFileSync = function (p, ...rest) {
    const out = orig.call(this, p, ...rest);
    if (typeof p === "string" && p.endsWith("src/tv.js")) {
      return String(out)
        // разнос палитры и каймы: 21 точка вместо 10 (у нас пиксель = 2 clk)
        .replace("this.commit_time_pal = this.commit_time - 20;",
                 "this.commit_time_pal = this.commit_time - 42;")
        // общий сдвиг растра: у Emu80 палитра действует через +27 точек
        .replace("const rpixel = this.raster_pixel - 24;",
                 "const rpixel = this.raster_pixel - 27;");
    }
    return out;
  };
}
const ROOT = path.resolve(__dirname, "../..");
const dir = process.argv[2] || "build/rast/raster";
const { reachGame } = require("./drive.js");
const { readSym } = require("./harness.js");

const S = readSym(`${ROOT}/${dir}/scubacod1.sym`);
const hits = [];
let armed = false;
const preHook = (m, SS) => {
  m.onPc(SS.START_GAME, () => { armed = true; });   // загрузочная палитра позади
// ЛОВИМ САМУ ЗАЩЁЛКУ, А НЕ ЗАПИСЬ. Первый заход перехватывал io.output и обе
// модели давали одно и то же — потому что задержка применяется ПОЗЖЕ, внутри
// PixelFiller.fill, когда вызывается IO.commit_palette(index). Момент этого
// вызова и есть то, что модели разносят.
  const origCommit = m.io.commit_palette.bind(m.io);
  m.io.commit_palette = (index) => {
    if (armed) { const f = m.v06c.filler; if (f) hits.push(f.raster_line + f.raster_pixel / 768); }
    return origCommit(index);
  };
};
const g = reachGame(`${ROOT}/${dir}/scuba.rom`, `${ROOT}/${dir}/scubacod1.sym`,
                    { cpu: "i8080", level: 4, seed: 359, preHook });
for (let i = 0; i < 300; i++) g.m.step();

if (!hits.length) { console.log(`${MODEL}: залпов не поймано`); process.exit(1); }
// группируем по строкам: залпы идут пачками по 4 записи
const groups = [];
for (const l of hits) {
  const g2 = groups.find(x => Math.abs(x.sum / x.n - l) <= 3);
  if (g2) { g2.sum += l; g2.n++; } else groups.push({ sum: l, n: 1 });
}
groups.sort((a, b) => a.sum / a.n - b.sum / b.n);
console.log(`${MODEL}: записей ${hits.length}, залпы в строках: ` +
  groups.map(x => `${(x.sum / x.n).toFixed(2)} (x${x.n})`).join(", "));
