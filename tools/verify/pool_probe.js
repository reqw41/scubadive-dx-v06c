// ЗАМЕР ПУЛА save-under ДЛЯ ЭТАПА 4: чей след 256 Б и во что обойдётся правка.
//
// Устройство тракта (scubacodb.asm, прочитано и подтверждено замером):
//   * буфер выдаёт распределитель LB655: индекс k -> старший байт адреса; под
//     -DZONE индексы 0 и 1 получают ПОЛНУЮ страницу 0xB000/0xB100, индексы
//     2..15 — ломоть 48 Б в плоскости 0xC000 (младший байт 208);
//   * РАЗМЕР буфера задаёт не распределитель, а спрайт: чистка LB48D/LB48E
//     пишет C строк по L байт, где C = (IY+$09), L = (IY+$0A). Это и есть
//     честный след, а не «сколько влезло в страницу»;
//   * рисование LB500 ходит по буферу инкрементом DE внутри строки, между
//     пиксельными строками DE += (IY+$0F).
//
// Считается:
//   1. каждая выдача: индекс пула, база, C x L = след, адрес спрайта;
//   2. фактический максимум смещения, ЗАПИСАННЫЙ в буфер за прогон;
//   3. частоты для сметы правки — в пересчёте на тик: инкременты DE внутри
//      строки, переходы на новую пиксельную строку, байты чистки.
//
//   node tools/verify/pool_probe.js [каталог сборки]
//   POOL_LEVELS=1,2,3,4   POOL_TICKS=1500
"use strict";
const fs = require("fs"), path = require("path");
const { readSym } = require("./harness.js");
const { reachGame } = require("./drive.js");
const ROOT = path.resolve(__dirname, "../..");
const B = process.env.BUILD_DIR || "build";
const dir = process.argv[2] || `${ROOT}/${B}/zone`;
const S = readSym(`${dir}/scubacod1.sym`);
for (const n of ["LB48D", "LB48E", "LB500", "LB4FB", "LB4A2", "z80_ix", "LD9C0"])
  if (S[n] == null) { console.log(`нет метки ${n} в ${dir}`); process.exit(2); }
const LEVELS = (process.env.POOL_LEVELS || "1,2,3,4").split(",").map(Number);
const TICKS = Number(process.env.POOL_TICKS || 1500);

const names = Object.entries(S).filter(([k, v]) => typeof v === "number")
                               .sort((a, b) => a[1] - b[1]);
function nameOf(a) {
  let lo = 0, hi = names.length - 1, best = null;
  while (lo <= hi) { const mid = (lo + hi) >> 1;
    if (names[mid][1] <= a) { best = names[mid]; lo = mid + 1; } else hi = mid - 1; }
  return best ? (best[1] === a ? best[0] : `${best[0]}+${a - best[1]}`) : "?";
}
// комментарий у метки в исходнике — им спрайты и подписаны у автора
const cmt = {};
for (const f of ["scubasprt.asm", "scubacodb.asm", "scubacodc.asm"]) {
  const p = path.join(ROOT, "src8080", f);
  if (!fs.existsSync(p)) continue;
  for (const l of fs.readFileSync(p, "utf8").split("\n")) {
    const m = l.match(/^([A-Za-z_][A-Za-z0-9_]*)\b.*?;\s*(.+?)\s*$/);
    if (m && !cmt[m[1]]) cmt[m[1]] = m[2];
  }
}

const R = (cpu, i) => cpu.reg(i);           // 0=B 1=C 2=D 3=E 4=H 5=L
const world = new Map();                    // "idx:size" -> сведения по всем уровням
let gTicks = 0, gInner = 0, gRows = 0, gClear = 0;

for (const lvl of LEVELS) {
  const bufs = new Map();                   // база -> {idx,w,h,size,maxOff,spr}
  let ticks = 0, inner = 0, rows = 0, clear = 0, curBase = null;
  const g = reachGame(`${dir}/scuba.rom`, `${dir}/scubacod1.sym`,
    { cpu: "i8080", level: lvl, seed: 0x0167, preHook: (m, SS) => {
      const ixBuf = () => { const ix = m.rdw(SS.z80_ix);
                            return m.rd(ix + 7) | (m.rd(ix + 8) << 8); };
      // ВЫДАЧА: LB48D — ВНЕШНИЙ цикл чистки, он проходит C раз, и DE на каждом
      // проходе стоит в начале ОЧЕРЕДНОЙ строки. Первый проход узнаётся по
      // совпадению DE с базой из самой записи объекта (IX+7/IX+8), а не по
      // «самому большому C»: так признак не зависит от порядка сцен.
      m.onPc(SS.LB48D, (pc, cpu) => {
        const de = (R(cpu, 2) << 8) | R(cpu, 3), base = ixBuf();
        if (de !== base) return;                       // не первая строка
        const c = R(cpu, 1), l = R(cpu, 5);
        const old = bufs.get(base);
        bufs.set(base, { idx: (base >> 8) & 0x0f, w: l, h: c, size: c * l,
                         maxOff: old ? old.maxOff : -1, spr: old ? old.spr : 0,
                         n: (old ? old.n : 0) + 1 });
      });
      m.onPc(SS.LB4A2, (pc, cpu) => {
        const rec = bufs.get(ixBuf());
        if (rec && !rec.spr) rec.spr = (R(cpu, 4) << 8) | R(cpu, 5);
      });
      const wr = (cpu) => {
        const a = ((R(cpu, 2) << 8) | R(cpu, 3)) & 0xffff;
        for (const [base, r] of bufs)
          if (a >= base && a < base + Math.max(r.size, 1)) {
            const off = a - base; if (off > r.maxOff) r.maxOff = off; return; }
      };
      m.onPc(SS.LB48E, (pc, cpu) => { clear++; wr(cpu); });
      m.onPc(SS.LB500 + 11, (pc, cpu) => { inner++; wr(cpu); });
      m.onPc(SS.LB4FB, () => { rows++; });
      m.onPc(SS.LD9C0, () => { ticks++; });
    }});
  let q = 0; while (ticks < TICKS && q < 900000) { g.m.step(); q++; }
  console.log(`\n=== уровень ${lvl}: ${ticks} тиков, ${dir}`);
  for (const [base, r] of [...bufs.entries()].sort((a, b) => b[1].size - a[1].size)) {
    const nm = nameOf(r.spr);
    console.log(`  индекс ${r.idx}  база $${base.toString(16).toUpperCase()}  ` +
                `след ${r.h} x ${r.w} = ${String(r.size).padStart(3)} Б  ` +
                `записано до ${String(r.maxOff).padStart(3)}  ` +
                `спрайт ${nm}${cmt[nm] ? " (" + cmt[nm] + ")" : ""}`);
    const k = `${r.idx}`;
    const cur = world.get(k);
    if (!cur || cur.size < r.size) world.set(k, { ...r, lvl });
  }
  console.log(`  НА ТИК: записей в буфер ${(inner / ticks).toFixed(2)}, ` +
              `пиксельных строк ${(rows / ticks).toFixed(2)}, ` +
              `байт чистки ${(clear / ticks).toFixed(2)}`);
  gTicks += ticks; gInner += inner; gRows += rows; gClear += clear;
}

console.log(`\n=== СВОД (${gTicks} тиков, уровни ${LEVELS.join(",")})`);
const all = [...world.values()].sort((a, b) => b.size - a.size);
for (const r of all)
  console.log(`  индекс ${r.idx}: максимальный след ${r.h} x ${r.w} = ${r.size} Б ` +
              `(уровень ${r.lvl}), записано до ${r.maxOff}`);
console.log(`  следов > 64 Б: ${all.filter(r => r.size > 64).length} из ${all.length}; ` +
            `> 48 Б: ${all.filter(r => r.size > 48).length}`);
console.log(`  НА ТИК ВСЕГО: записей в буфер ${(gInner / gTicks).toFixed(2)}, ` +
            `пиксельных строк ${(gRows / gTicks).toFixed(2)}, ` +
            `байт чистки ${(gClear / gTicks).toFixed(2)}`);
if (!gTicks || !gInner) { console.log("ПУСТАЯ ВЫБОРКА — замер недействителен"); process.exit(2); }
