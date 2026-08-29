"use strict";
// Что лежит под синими спрайтами: на каждом байте блита LB500 в плоскости 0xE000
// считаем t = буфер XOR экран (фон под старым кадром) и классифицируем.
const { reachGame, KEY } = require("./drive.js");
const [rom, sym] = process.argv.slice(2, 4); const LVL = parseInt(process.argv[4] || "4", 10), NT = parseInt(process.argv[5] || "3000", 10), SEED = parseInt(process.argv[6] || "0x0167", 16);
const g = reachGame(rom, sym, { cpu: "i8080", level: LVL, seed: SEED }); const m = g.m, S = g.S; let demo = false, demoBg = 0; m.onPc(S.LEEAD, () => { demo = true; }); m.onPc(S.START_GAME, () => { demo = false; });
let blue = 0, blueBg = 0, relief = 0, water = 0, sky = 0, other = 0, yellow = 0, yellowBg = 0; const bgTicks = new Set(), byType = new Map(); const names = {}; for (const n of ['LC0EA','LC102','LC182','LC19E','LC1BA','LC1D6']) names[S[n]] = n;
m.onPc(S.LB500, () => { const hl = m.cpu.hl() & 0xffff, de = m.cpu.rp(1) & 0xffff; const h = hl >> 8, l = hl & 0xff;
  const scr = m.rd(hl), buf = m.rd(de), t = scr ^ buf;
  if (h >= 0xE0) { if (demo) { if (t) demoBg++; return; } blue++; if (t) { blueBg++; bgTicks.add(g.ticks); const c = m.rd(hl - 0x2000); if (l === 0xBF) water++; else if (l > 0xBF) sky++; else if (c & t) relief++; else other++; const ty = names[m.rdw(S.z80_iy)] || 'iy'+m.rdw(S.z80_iy).toString(16); byType.set(ty, (byType.get(ty) || 0) + 1); } }
  else { yellow++; if (t) yellowBg++; } });
m.key(KEY.UP, true); const t0 = g.ticks; let guard = 0; while (g.ticks - t0 < NT && guard < 900000) { m.step(); guard++; }
console.log(`ур.${LVL}, ${g.ticks - t0} тиков: байт блита в синей плоскости ${blue}, из них с непустым фоном ${blueBg} (${(100 * blueBg / Math.max(1, blue)).toFixed(1)}%): рельеф/красное ${relief}, ватерлиния ${water}, небо ${sky}, другое синее ${other}; по типам ${[...byType.entries()].map(([k,v])=>k+':'+v).join(' ')}; в аттракт-демо байт с фоном ${demoBg} (не считаны); тиков с фоном ${bgTicks.size} [${[...bgTicks].slice(0,40).join(',')}]. Для сравнения жёлтая плоскость: ${yellow} байт, с фоном ${yellowBg}`);
