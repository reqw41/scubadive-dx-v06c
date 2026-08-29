// ЦИКЛ ПОКРАСКИ КЛЕТОК СУЩЕСТВОМ (LB70F/LB71B): чего он стоит и почему адрес
// атрибута НЕЛЬЗЯ вести линейно.
//
// Предложение, ради которого написан пробник: считать адрес атрибута один раз в
// LB70F (call GetScrAttrAddr), держать его в DE и на каждом столбце делать
// `inx d` — вместо `PUSH HL / CALL GetScrAttrAddr / ... / POP HL` внутри цикла.
//
// ПРЕДЛОЖЕНИЕ ОТВЕРГНУТО ЗАМЕРОМ. Столбец в цикле идёт через `INC L`, то есть по
// МЛАДШЕМУ БАЙТУ, и у существа, заехавшего за левый край поля, L стартует с
// 254..255. Тогда внутри одного захода L переваливает через край байта: 255 ->
// 0, 1, и эти столбцы СНОВА ПОПАДАЮТ В ДИАПАЗОН, то есть до GetScrAttrAddr
// доходят. Линейный адрес к этому моменту ушёл на 256 байт вперёд — это ровно
// восемь знакоместных строк SCRATTR. Пробник печатает, сколько таких обращений.
//
// ЦЕНА ВОПРОСА тоже мерится здесь: доля тактов, которую съедает LB70F целиком и
// GetScrAttrAddr внутри неё. Она мала (десятые доли процента), а точный вариант
// (считать НАЧАЛО СТРОКИ один раз, а столбец прибавлять на месте — переноса там
// быть не может: (row&7)*32 + col <= 255) большую часть выигрыша съел бы
// обратно: заходов в LB70F БОЛЬШЕ, чем столбцов в диапазоне (существа чаще
// стоят за краем поля, чем внутри него), а установка начала строки платится за
// каждый заход.
//
//   node tools/verify/attrloop_probe.js <rom> <sym> [level=4] [ticks=3000]
"use strict";
const { reachGame, KEY } = require("./drive.js");
const [rom, sym] = process.argv.slice(2, 4);
const LVL = parseInt(process.argv[4] || "4", 10), NT = parseInt(process.argv[5] || "3000", 10);
if (!rom || !sym) { console.error("нужны rom sym"); process.exit(2); }

let calls = 0, inRange = 0, outRange = 0, hits = 0, wrongLin = 0;
let accLB = 0, accG = 0, total = 0;
let on = false, sp0 = 0, gon = false, gsp = 0, prev = -1, H0 = -1, L0 = -1;
const ex = [];

const g = reachGame(rom, sym, { cpu: "i8080", level: LVL, seed: 0x0167, preHook: (m, S) => {
  for (const n of ["LB70F", "LB71B", "LB731", "GetScrAttrAddr", "SCRATTR", "z80_iy"])
    if (S[n] == null) { console.log("нет метки " + n); process.exit(2); }
  const cb = m.v06c.check_breakpoint;
  m.v06c.check_breakpoint = () => {
    const r = cb(); const pc = m.cpu.pc & 0xffff, c = m.cpu.vcycles || 0;
    if (prev >= 0) { total += c; if (on) accLB += c; if (gon) accG += c; }
    if (on && (m.cpu.sp & 0xffff) > sp0) on = false;
    if (gon && (m.cpu.sp & 0xffff) > gsp) gon = false;
    if (!on && pc === S.LB70F) {
      on = true; sp0 = m.cpu.sp & 0xffff;
      H0 = m.cpu.reg(4) & 0xff; L0 = m.cpu.reg(5) & 0xff;
      calls++;
      const w = m.rd((m.rdw(S.z80_iy) + 7) & 0xffff);
      for (let k = 0; k < w; k++) { const col = (L0 + k) & 0xff;
        if ((col & 0xe0) !== 0) outRange++; else inRange++; }
    }
    if (on && pc === S.GetScrAttrAddr) {
      const sp = m.cpu.sp & 0xffff, ret = m.rd(sp) | (m.rd((sp + 1) & 0xffff) << 8);
      if (ret > S.LB71B && ret <= S.LB731) {        // именно вызов из цикла столбцов
        if (!gon) { gon = true; gsp = sp; }
        const H = m.cpu.reg(4) & 0xff, L = m.cpu.reg(5) & 0xff;
        hits++;
        const real = S.SCRATTR + H * 32 + L;
        const lin = S.SCRATTR + H0 * 32 + L0 + ((L - L0) & 0xff);
        if (real !== lin) { wrongLin++;
          if (ex.length < 3) ex.push(`H=${H} L:${L0}->${L} настоящий 0x${real.toString(16)} / линейный 0x${lin.toString(16)}`); }
      }
    }
    prev = pc; return r;
  };
}});

const m = g.m; m.key(KEY.UP, true);
const t0 = g.ticks; let guard = 0;
while (g.ticks - t0 < NT && guard < 3000000) { m.step(); guard++; }

console.log(`ур.${LVL} ${NT} тиков: заходов в LB70F ${calls}; столбцов в диапазоне ${inRange}, вне ${outRange}`);
console.log(`  обращений к GetScrAttrAddr из цикла ${hits}; ЛИНЕЙНЫЙ адрес разошёлся бы ${wrongLin}` +
            (ex.length ? ` — ${ex.join("; ")}` : ""));
console.log(`  тактов всего ${total}; LB70F ${accLB} (${(100 * accLB / total).toFixed(2)} %), ` +
            `из них GetScrAttrAddr ${accG} (${(100 * accG / total).toFixed(2)} %)`);
