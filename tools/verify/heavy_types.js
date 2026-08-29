"use strict";
// В тяжёлых тиках (дольше кадра, без смены экрана): байты блита по типам существ
const { reachGame, KEY } = require("./drive.js");
const [rom, sym] = process.argv.slice(2, 4); const LVL = parseInt(process.argv[4] || "4", 10), NT = parseInt(process.argv[5] || "6000", 10);
const g = reachGame(rom, sym, { cpu: "i8080", level: LVL, seed: 0x0167 }); const m = g.m, S = g.S;
const names = {}; for (const n of ['LC092','LC0A2','LC0B2','LC0CE','LC0EA','LC102','LC11A','LC132','LC14A','LC166','LC182','LC19E','LC1BA','LC1D6','LC1F2']) names[S[n]] = n;
const lbl = { LC092: 'лодка', LC0A2: 'медуза', LC0B2: 'круглая рыба', LC0CE: 'круглая рыба верт', LC0EA: 'РЫБА(синяя)', LC102: 'АКУЛА(синяя)', LC11A: 'длинная рыба', LC132: 'стая', LC14A: 'малый кальмар', LC166: 'малый кальмар верт', LC182: 'угорь(синий)', LC19E: 'угорь верт(синий)', LC1BA: 'змея(синяя)', LC1D6: 'змея верт(синяя)', LC1F2: 'КАЛЬМАР' };
let acc = 0, prevPc = -1, on = false, draw = false; let cur = new Map(); const heavy = new Map(), all = new Map(); let nHeavy = 0, n = 0;
const cb = m.v06c.check_breakpoint; m.v06c.check_breakpoint = () => { const r = cb(); if (on && prevPc >= 0) acc += m.cpu.vcycles || 0; prevPc = m.cpu.pc & 0xffff; return r; };
m.onPc(S.LB500, () => { const ty = names[m.rdw(S.z80_iy)] || '?'; cur.set(ty, (cur.get(ty) || 0) + 1); });
if (S.LB500_blue) m.onPc(S.LB500_blue, () => { const ty = names[m.rdw(S.z80_iy)] || '?'; cur.set(ty, (cur.get(ty) || 0) + 1); });
// BOATFAST: столбец лодки идёт мимо LB500 — строка из 8 байт одним заходом
if (S.BoatCol_row) m.onPc(S.BoatCol_row, () => { const ty = names[m.rdw(S.z80_iy)] || '?'; cur.set(ty, (cur.get(ty) || 0) + 8); });
m.onPc(S.DrawGameScr, () => { draw = true; });
m.onPc(S.LD9C0, () => { if (on) { n++; for (const [k, v] of cur) all.set(k, (all.get(k) || 0) + v); if (!draw && acc > 59904) { nHeavy++; for (const [k, v] of cur) heavy.set(k, (heavy.get(k) || 0) + v); } } cur = new Map(); acc = 0; draw = false; });
on = true; m.key(KEY.UP, true); let guard = 0; while (n < NT && guard < 2500000) { m.step(); guard++; }
const fmt = mp => [...mp.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${lbl[k] || k}:${v}`).join(' ');
console.log(`ур.${LVL}, тиков ${n}, тяжёлых ${nHeavy}\n  байты блита в тяжёлых тиках: ${fmt(heavy)}\n  байты блита за всё время:    ${fmt(all)}`);
