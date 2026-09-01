"use strict";
// ГЕОМЕТРИЯ И ТРАКТ СТАЙКИ (Fish cloud, дескриптор LC132). ТОЛЬКО ЗАМЕР.
//
// Второй проход блита во вторую плоскость упирается в три вопроса, на которые
// нельзя ответить чтением исходника — все три решает РАНТАЙМ:
//   1) сколько байт занимает слот save-under стайки: (IY+$09)*(IY+$0A). Если он
//      <= 128, вторая половина страницы пула свободна и второй буфер бесплатен;
//   2) ходит ли стайка по ветке сдвига буфера LB547/LB57E/LB5A4 (биты 5/6
//      (IX+$13)). Если ходит — второй буфер надо сдвигать тем же порядком;
//   3) доходит ли до неё блит вообще (для гейта).
//
//   node tools/verify/cloudpass_probe.js <rom> <sym> [уровни] [тиков] [сид]
const path = require("path");
const { reachGame, KEY } = require("./drive.js");
const ROM = process.argv[2], SYM = process.argv[3];
const LEVELS = (process.argv[4] || "1,2,3,4").split(",").map(Number);
const NT = parseInt(process.argv[5] || "3000", 10);
const SEED = parseInt(process.argv[6] || "0x0167", 16);
const { readSym } = require("./harness.js");
const S = readSym(SYM);
for (const f of ["scubacod0.sym"]) {
  const p = path.join(path.dirname(SYM), f);
  try { Object.assign(S, readSym(p)); } catch (e) {}
}
const CLOUD = S.LC132;
if (CLOUD === undefined) { console.log("нет метки LC132"); process.exit(2); }

const tot = { draw: 0, erase: 0, bytes: 0, shiftH: 0, shiftV: 0 };
const geom = new Map();      // "recs*size" -> сколько раз
const flags = new Map();     // (IX+$13) -> сколько раз
for (const LVL of LEVELS) {
  const g = reachGame(ROM, SYM, { cpu: "i8080", level: LVL, seed: SEED });
  const m = g.m;
  let demo = false;
  m.onPc(S.LEEAD, () => { demo = true; });
  m.onPc(S.START_GAME, () => { demo = false; });
  const isCloud = () => m.rdw(S.z80_iy) === CLOUD;
  m.onPc(S.LB470, () => {
    if (demo || !isCloud()) return;
    const iy = m.rdw(S.z80_iy), ix = m.rdw(S.z80_ix);
    const f = m.rd(ix + 0x13);
    flags.set(f, (flags.get(f) || 0) + 1);
    if (f & 1) tot.draw++; else tot.erase++;
    const k = `${m.rd(iy + 0x09)}*${m.rd(iy + 0x0A)}`;
    geom.set(k, (geom.get(k) || 0) + 1);
  });
  m.onPc(S.LB500, () => { if (!demo && isCloud()) tot.bytes++; });
  if (S.LB547 !== undefined) m.onPc(S.LB547, () => { if (!demo && isCloud()) tot.shiftH++; });
  if (S.LB5A4 !== undefined) m.onPc(S.LB5A4, () => { if (!demo && isCloud()) tot.shiftV++; });

  const ROW = process.env.IM_ROW === undefined ? null : parseInt(process.env.IM_ROW, 10);
  if (ROW !== null) m.onPc(S.LD9C0, () => { m.wr(S.L5B03 + 1, ROW); });
  const D = [[KEY.DOWN], [KEY.DOWN, KEY.RIGHT], [KEY.RIGHT], [KEY.UP, KEY.RIGHT],
             [KEY.UP], [KEY.UP, KEY.LEFT], [KEY.LEFT], [KEY.DOWN, KEY.LEFT]];
  const t0 = g.ticks; let guard = 0, di = -1, held = [];
  while (g.ticks - t0 < NT && guard < 2000000) {
    const phase = Math.floor((g.ticks - t0) / 120) % D.length;
    if (phase !== di) {
      for (const k of held) m.key(k, false);
      di = phase; held = D[di]; for (const k of held) m.key(k, true);
    }
    if ((guard & 255) === 0) { if (S.LIVES) m.wr(S.LIVES, 3); if (S.OXYGEN) { m.wr(S.OXYGEN, 0xff); m.wr(S.OXYGEN + 1, 0xff); } }
    m.step(); guard++;
  }
  for (const k of held) m.key(k, false);
  console.error(`  ур.${LVL}: тиков ${g.ticks - t0}`);
}
console.log(`стайка: заходов в блит рисование ${tot.draw}, стирание ${tot.erase}, байт ${tot.bytes}`);
console.log(`сдвиг буфера: горизонт LB547 ${tot.shiftH}, вертикаль LB5A4 ${tot.shiftV}`);
console.log("геометрия слота (записей*размер):", [...geom].map(([k, v]) => {
  const [a, b] = k.split("*").map(Number); return `${k}=${a * b}Б x${v}`; }).join("  ") || "нет");
console.log("(IX+$13):", [...flags].map(([k, v]) => `0x${k.toString(16).padStart(2, "0")} x${v}`).join("  ") || "нет");
