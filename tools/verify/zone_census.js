// ПЕРЕПИСЬ ПЕРЕСЕЛЕНЦЕВ В ВЕРХНЮЮ ЗОНУ.
// Для каждой метки кода: размер (до следующей метки) и ЧАСТОТА ВЫЗОВОВ на
// игровой тик. Ломтик зоны — 64 байта, поэтому тело до 61 Б переезжает целиком
// (61 = 64 минус 3 байта на шов jp, если тело придётся резать).
//   node tools/verify/zone_census.js <rom> <sym> [тиков=400] [уровень=4]
"use strict";
const { readSym } = require("./harness.js");
const { reachGame } = require("./drive.js");
const rom = process.argv[2], sym = process.argv[3];
const NT = parseInt(process.argv[4] || "400", 10), LVL = parseInt(process.argv[5] || "4", 10);
const S = readSym(sym);
const labs = Object.entries(S).filter(([k, v]) => v >= 0x100 && v < 0xC000).sort((a, b) => a[1] - b[1]);
const size = new Map();
for (let i = 0; i < labs.length - 1; i++) size.set(labs[i][0], labs[i + 1][1] - labs[i][1]);

const g = reachGame(rom, sym, { cpu: "i8080", level: LVL, seed: 0x0167 });
const cnt = new Uint32Array(0x10000), cyc = new Float64Array(0x10000);
let ticks = 0, prev = -1, on = false;
const origCb = g.m.v06c.check_breakpoint;
g.m.v06c.check_breakpoint = () => {
  const r = origCb();
  if (on && prev >= 0) cyc[prev] += g.m.cpu.vcycles || 0;
  prev = g.m.cpu.pc & 0xffff;
  if (on) cnt[prev]++;
  return r;
};
g.m.onPc(S.LD9C0, () => { ticks++; });
on = true;
let guard = 0; while (ticks < NT && guard < 300000) { g.m.step(); guard++; }

// область кода (после спрайтов) — оттуда и переселяем
const CODE0 = 0x8E73;
const rows = [];
for (const [name, addr] of labs) {
  const sz = size.get(name); if (sz == null || sz <= 0) continue;
  if (addr < CODE0) continue;               // ниже — спрайты и данные
  rows.push({ name, addr, sz, calls: cnt[addr] / ticks, cyc: cyc[addr] / ticks });
}
const fit = rows.filter(r => r.sz <= 61);
const sum = a => a.reduce((x, y) => x + y, 0);
console.log(`=== перепись кода 0x${CODE0.toString(16)}..0xAF79, ${ticks} тиков, уровень ${LVL}`);
console.log(`меток всего ${rows.length}, суммарно ${sum(rows.map(r => r.sz))} Б`);
console.log(`из них тела <=61 Б: ${fit.length} штук, ${sum(fit.map(r => r.sz))} Б`);
const hot = fit.filter(r => r.calls >= 1), warm = fit.filter(r => r.calls > 0 && r.calls < 1), cold = fit.filter(r => r.calls === 0);
console.log(`  ГОРЯЧИЕ (>=1 вызова на тик):  ${hot.length} шт, ${sum(hot.map(r => r.sz))} Б`);
console.log(`  ТЁПЛЫЕ  (<1 вызова на тик):   ${warm.length} шт, ${sum(warm.map(r => r.sz))} Б`);
console.log(`  ХОЛОДНЫЕ (ни разу за прогон): ${cold.length} шт, ${sum(cold.map(r => r.sz))} Б`);
console.log(`\n--- ТОП-20 ГОРЯЧИХ <=61 Б (этих лучше не трогать; шов стоит 10 тактов на вызов)`);
for (const r of hot.sort((a, b) => b.calls - a.calls).slice(0, 20))
  console.log(`  0x${r.addr.toString(16)} ${r.name.padEnd(18)} ${String(r.sz).padStart(3)} Б  ${r.calls.toFixed(2).padStart(8)} выз/тик  ${Math.round(r.cyc)} тактов/тик`);
console.log(`\n--- КРУПНЕЙШИЕ ХОЛОДНЫЕ <=61 Б (идеальные переселенцы, цена ноль)`);
for (const r of cold.sort((a, b) => b.sz - a.sz).slice(0, 20))
  console.log(`  0x${r.addr.toString(16)} ${r.name.padEnd(18)} ${String(r.sz).padStart(3)} Б`);
console.log(`\n--- КРУПНЕЙШИЕ ТЁПЛЫЕ <=61 Б`);
for (const r of warm.sort((a, b) => b.sz - a.sz).slice(0, 15))
  console.log(`  0x${r.addr.toString(16)} ${r.name.padEnd(18)} ${String(r.sz).padStart(3)} Б  ${r.calls.toFixed(3)} выз/тик`);
// сколько байт наберётся из холодных+тёплых, если селить по убыванию размера
const movable = [...cold, ...warm].sort((a, b) => b.sz - a.sz);
let acc = 0, n = 0; for (const r of movable) { acc += r.sz; n++; }
console.log(`\nИТОГО переселяемо без цены (холодные+тёплые, <=61 Б): ${n} тел, ${acc} Б`);
console.log(`Ломтиков 64 Б нужно: ${movable.reduce((s, r) => s + 1, 0)} (по одному на тело), то есть ${movable.length * 64} Б зоны`);

// --- РАСКЛАДКА ПО ЛОМТИКАМ 64 Б (first-fit decreasing) ---------------------
// Задача: набрать РОВНО столько байт, чтобы конец кода опустился ниже 0xA000,
// и посчитать, сколько ломтиков это займёт на самом деле, а не на глазок.
const NEED = (S.SCUBACOD1_END || 0xAF79) - 0xA000;
const pool = [...cold, ...warm].sort((a, b) => b.sz - a.sz);
let taken = [], acc2 = 0;
for (const r of pool) { if (acc2 >= NEED) break; taken.push(r); acc2 += r.sz; }
const bins = [];
for (const r of taken.slice().sort((a, b) => b.sz - a.sz)) {
  let b = bins.find(x => x.free >= r.sz);
  if (!b) { b = { free: 64, items: [] }; bins.push(b); }
  b.free -= r.sz; b.items.push(r.name);
}
console.log(`\n=== РАСКЛАДКА ПО ЛОМТИКАМ`);
console.log(`нужно выселить: ${NEED} Б (0x${(S.SCUBACOD1_END||0xAF79).toString(16)} - 0xA000)`);
console.log(`взято тел: ${taken.length}, суммарно ${acc2} Б (из них холодных ${taken.filter(r=>r.calls===0).length})`);
console.log(`ломтиков 64 Б занято: ${bins.length}, то есть ${bins.length*64} Б зоны, потери на упаковку ${bins.length*64-acc2} Б (${(100*(bins.length*64-acc2)/(bins.length*64)).toFixed(1)}%)`);
const hotMoved = taken.filter(r => r.calls > 0);
console.log(`из них ТЁПЛЫХ (есть вызовы): ${hotMoved.length} тел, ${sum(hotMoved.map(r=>r.sz))} Б, суммарно ${hotMoved.reduce((s,r)=>s+r.calls,0).toFixed(2)} вызовов на тик`);
console.log(`цена шва, если каждое переселённое тело получит jp обратно (10 тактов на вызов): ${Math.round(hotMoved.reduce((s,r)=>s+r.calls,0)*10)} тактов на тик = ${(100*hotMoved.reduce((s,r)=>s+r.calls,0)*10/36533).toFixed(3)}% тика`);
