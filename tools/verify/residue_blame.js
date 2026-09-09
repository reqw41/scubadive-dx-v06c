"use strict";
// КТО ОСТАВИЛ ОСТАТОК. residue_probe находит брошенные чернила; здесь ищем
// виновника: для каждой клетки помним, КТО её накрывал в прошлые замеры, и когда
// клетка становится «ничьей с чернилами», печатаем последнего хозяина и то, что
// с ним случилось — ушёл ли за экран, освободил ли буфер, прыгнул ли дальше
// запаса слота (слот шире кадра на байт и на восемь строк, всё что дальше —
// стирается только повторным накрытием).
//   node tools/verify/residue_blame.js <rom> <sym> [уровень=4] [тиков=2000]
const { reachGame, KEY } = require("./drive.js");
const [rom, sym] = process.argv.slice(2, 4);
const LVL = parseInt(process.argv[4] || "4", 10), NT = parseInt(process.argv[5] || "2000", 10);
const g = reachGame(rom, sym, { cpu: process.env.CPU || "i8080", level: LVL, seed: 0x0167 });
const m = g.m, S = g.S, w = a => m.rd(a) | (m.rd(a + 1) << 8);
const attr = (r, c) => { const a = ((r >> 3) | (r << 5)) & 0xff;
  return m.rd((((a & 0x1f) + (S.SCRATTR >> 8)) << 8) | ((a & 0xE0) | (c & 0x1f))); };
const ink = (r, c) => { for (let i = 0; i < 8; i++) { const lo = (255 - (r * 8 + i)) & 0xff;
  if (m.rd(0xC000 + c * 256 + lo) || m.rd(0xE000 + c * 256 + lo)) return true; } return false; };
const b4 = w(S.RecsAddrIV), n4 = m.rd(S.NumRecsIV);
const GS = [[S.LC4F0, 21, m.rd(S.NumRecsI)], [w(S.RecsAddrII), 26, m.rd(S.NumRecsII)],
  [w(S.RecsAddrIII), 26, m.rd(S.NumRecsIII)], [b4, 26, n4], [b4 + 26 * n4, 28, m.rd(S.NumRecsV)]];
const D = S.DiverObj;
const TYPE = {}; for (const [n, a] of Object.entries(S)) if (/^LC[0-9A-F]{3}$/.test(n)) TYPE[a] = n;
let ticks = 0, scrKey = "", settle = 0, base = null, samples = 0;
const owner = new Map();          // клетка -> {rec, клетка, буфер, тип} на прошлом замере
const prevRec = new Map();        // запись -> её состояние на прошлом замере
const blame = [];
m.onPc(S.LD9C0, () => { ticks++; if (ticks % 5) return;
  const key = m.rd(S.L5B03) + "," + m.rd(S.L5B03 + 1);
  if (key !== scrKey) { scrKey = key; base = null; settle = 3; owner.clear(); return; }
  if (settle > 0) { settle--; return; }
  if (!base) { base = new Set();
    for (let r = 0; r < 24; r++) for (let c = 0; c < 32; c++) if (ink(r, c)) base.add(r + "," + c);
    return; }
  samples++;
  // кто кого накрывает сейчас
  const now = new Map(), state = new Map();
  const cover = (r, c, rad, id) => { for (let dr = -rad; dr <= rad; dr++) for (let dc = -rad; dc <= rad; dc++) now.set((r + dr) + "," + (c + dc), id); };
  cover(m.rd(D + 1), m.rd(D), 3, "дайвер");
  for (const [bs, sz, n] of GS) { if (bs < 0x300 || n > 200) continue;
    for (let i = 0; i < n; i++) { const r = bs + i * sz, buf = w(r + 7);
      const st = { клетка: [m.rd(r), m.rd(r + 1)], буфер: buf, тип: TYPE[w(r + 19)] || "?" };
      state.set(r, st);
      if (buf) cover(m.rd(r + 1), m.rd(r), 3, r); } }
  for (let i = 0; i < 48; i++) { const e = S.LB07D + i * 4;
    if (m.rd(e) | m.rd(e + 1)) cover(m.rd(e + 3), m.rd(e + 2), 2, "предмет"); }
  // клетки, ставшие ничьими с чернилами
  for (let r = 0; r < 24; r++) for (let c = 0; c < 32; c++) { const k = r + "," + c;
    if (!ink(r, c) || attr(r, c) === 2 || now.has(k) || base.has(k)) continue;
    const was = owner.get(k);
    if (was === undefined || blame.length >= 12) continue;
    if (was === "дайвер" || was === "предмет") { blame.push({ клетка: k, хозяин: was }); continue; }
    const before = prevRec.get(was), after = state.get(was);
    if (!before || !after) continue;
    const dx = after.клетка[0] - before.клетка[0], dy = after.клетка[1] - before.клетка[1];
    blame.push({ клетка: k, запись: was.toString(16), тип: after.тип,
      было: `клетка ${before.клетка} буфер ${before.буфер.toString(16)}`,
      стало: `клетка ${after.клетка} буфер ${after.буфер.toString(16)}`,
      шаг: [dx, dy], буфер_освобождён: before.буфер !== 0 && after.буфер === 0 });
  }
  owner.clear(); for (const [k, v] of now) owner.set(k, v);
  prevRec.clear(); for (const [k, v] of state) prevRec.set(k, v);
});
let row0 = m.rd(S.L5B03 + 1), chk = 0, rot = -1, guard = 0;
while (ticks < NT && guard++ < 900000) { const row = m.rd(S.L5B03 + 1);
  m.key(KEY.UP, true); m.key(KEY.RIGHT, rot >= 0 && guard < rot); m.step();
  if (guard - chk >= 60) { if (row <= row0) rot = guard + 25; row0 = row; chk = guard; } }
console.log(`уровень ${LVL}: тиков ${ticks}, замеров ${samples}, случаев поймано ${blame.length}`);
for (const b of blame) console.log("  " + JSON.stringify(b));
