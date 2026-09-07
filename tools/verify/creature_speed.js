"use strict";
// СКОРОСТЬ СУЩЕСТВ И ДАЙВЕРА В НАШЕМ ПОРТЕ — та же мера, что creature_speed.lua
// для ZX: записи группы I (LC4F0, NumRecsI, 21 байт: col,row,sx,sy → пиксели) и
// DiverObj (+$13/$14 значение, +$15/$16 сдвиг), окна по 5 с (250 кадров), тот же
// ввод: газ 250 кадров из 400, поворот на кадрах 120..170.
//   node tools/verify/creature_speed.js <rom> <sym> [level=1] [windows=6]
const { reachGame, KEY } = require("./drive.js");
const [rom, sym] = process.argv.slice(2, 4);
const LVL = parseInt(process.argv[4] || "1", 10), WINS = parseInt(process.argv[5] || "6", 10);
const g = reachGame(rom, sym, { cpu: process.env.CPU || "i8080", level: LVL, seed: 0x0167 });
const m = g.m, S = g.S, D = S.DiverObj;
const f0 = m.frame; let prev = new Map(), prevd = null, win = 0, wstart = null;
let acc = { cpx: 0, cev: 0, cmov: new Set(), dpx: 0, dev: 0, dcell: 0, frames: 0, ch: {}, dh: {}, ty: {} };
for (let f = 0; win < WINS && f < 20000; f++) {
  const ph = f % 400; if (!process.env.IDLE) { m.key(KEY.UP, ph < 250); m.key(KEY.RIGHT, ph >= 120 && ph < 170); } // IDLE=1: дайвер стоит у лодки
  m.step();
  if (f < 250) continue;
  const n = m.rd(S.NumRecsI);
  for (let i = 0; i < n; i++) {
    const b = S.LC4F0 + i * 21, x = m.rd(b) * 8 + m.rd(b + 2), y = m.rd(b + 1) * 8 + m.rd(b + 3);
    const p = prev.get(i);
    if (p && wstart !== null) { const d = Math.abs(x - p[0]) + Math.abs(y - p[1]); if (d > 0 && d < 64) { acc.cpx += d; acc.cev++; acc.cmov.add(i); acc.ch[d] = (acc.ch[d] || 0) + 1; const ty = (m.rd(b + 0x0A)).toString(16); const T = acc.ty[ty] = acc.ty[ty] || { px: 0, ev: 0, ids: new Set() }; T.px += d; T.ev++; T.ids.add(i); } }
    prev.set(i, [x, y]);
  }
  const dx = m.rd(D + 0x13) * 8 + m.rd(D + 0x15), dy = m.rd(D + 0x14) * 8 + m.rd(D + 0x16), dc = m.rd(D + 1) * 256 + m.rd(D + 2);
  if (prevd && wstart !== null) { const d = Math.abs(dx - prevd[0]) + Math.abs(dy - prevd[1]); if (d > 0 && d < 64) { acc.dpx += d; acc.dev++; acc.dh[d] = (acc.dh[d] || 0) + 1; } if (dc !== prevd[2]) acc.dcell++; }
  prevd = [dx, dy, dc];
  if (wstart === null) { wstart = f; continue; }
  acc.frames++;
  if (f - wstart >= 250) {
    win++; const nm = acc.cmov.size, s = acc.frames / 50;
    console.log(`окно ${win}: существ гр.I ${n}, двигались ${nm}: ${(acc.cpx / s).toFixed(1)} px/с всего, ${(nm ? acc.cpx / s / nm : 0).toFixed(1)} px/с на существо, ${(nm ? acc.cev / s / nm : 0).toFixed(1)} шагов/с на существо | дайвер ${(acc.dpx / s).toFixed(1)} px/с, ${(acc.dev / s).toFixed(1)} шагов/с, клетка ${(acc.dcell / s).toFixed(1)} смен/с`);
    const hist = h => Object.entries(h).map(([k, v]) => k + "px:" + v).join(" ");
    console.log("   шаги существ по длине: " + hist(acc.ch) + " | шаги дайвера: " + hist(acc.dh));
    console.log("   по типам (страница спрайта): " + Object.entries(acc.ty).map(([k, T]) => `${k}: ${T.ids.size} шт, ${(T.px / s / T.ids.size).toFixed(1)} px/с, ${(T.ev / s / T.ids.size).toFixed(1)} шаг/с`).join(" | "));
    wstart = f; acc = { cpx: 0, cev: 0, cmov: new Set(), dpx: 0, dev: 0, dcell: 0, frames: 0, ch: {}, dh: {}, ty: {} };
  }
}
