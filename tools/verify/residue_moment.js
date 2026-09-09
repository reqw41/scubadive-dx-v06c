"use strict";
// МОМЕНТ РОЖДЕНИЯ ОСТАТКА, тик в тик. Следим за одной клеткой и за существом,
// которое её накрывало: печатаем положение В ПИКСЕЛЯХ и ширину строки блита
// (IY+$0E) на каждом тике вокруг события. Вопрос: шагает ли существо дальше
// запаса слота (байт по горизонтали) — тогда хвост не стирается.
const { reachGame, KEY } = require("./drive.js");
const [rom, sym] = process.argv.slice(2, 4);
const g = reachGame(rom, sym, { cpu: "i8080", level: 4, seed: 0x0167 });
const m = g.m, S = g.S, w = a => m.rd(a) | (m.rd(a + 1) << 8);
const ink = (r, c) => { for (let i = 0; i < 8; i++) { const lo = (255 - (r * 8 + i)) & 0xff;
  if (m.rd(0xC000 + c * 256 + lo) || m.rd(0xE000 + c * 256 + lo)) return true; } return false; };
const b4 = w(S.RecsAddrIV), n4 = m.rd(S.NumRecsIV);
const GS = [[S.LC4F0, 21, m.rd(S.NumRecsI)], [w(S.RecsAddrII), 26, m.rd(S.NumRecsII)],
  [w(S.RecsAddrIII), 26, m.rd(S.NumRecsIII)], [b4, 26, n4], [b4 + 26 * n4, 28, m.rd(S.NumRecsV)]];
// круглые рыбы — на них поймался остаток
const FISH = [];
for (const [bs, sz, n] of GS) { if (bs < 0x300 || n > 200) continue;
  for (let i = 0; i < n; i++) { const r = bs + i * sz; if (w(r + 19) === S.LC0B2) FISH.push(r); } }
console.log(`круглых рыб: ${FISH.length}; ширина/высота типа: +6=${m.rd(S.LC0B2+6)} +7=${m.rd(S.LC0B2+7)} +8=${m.rd(S.LC0B2+8)} +9=${m.rd(S.LC0B2+9)} +0E=${m.rd(S.LC0B2+0x0e)}`);
let ticks = 0; const hist = new Map(); let done = 0; const H = new Map();
m.onPc(S.LD9C0, () => { ticks++;
  for (const r of FISH) {
    const px = m.rd(r) * 8 + m.rd(r + 2), py = m.rd(r + 1) * 8 + m.rd(r + 3), buf = w(r + 7);
    const h = hist.get(r) || []; h.push({ t: ticks, px, py, buf: buf.toString(16) }); if (h.length > 6) h.shift(); hist.set(r, h);
    // клетка справа от рыбы: если там чернила, а рыба ушла левее на >8 px — это хвост
    if (h.length >= 2 && done < 6) { const prev = h[h.length - 2];
      const step = px - prev.px;
      // ГИСТОГРАММА ЧИСТО ГОРИЗОНТАЛЬНОГО ШАГА + Δ ВРЕМЕНИ В ЭТОТ ТИК.
      // Подозрение: крупный шаг — побочный эффект TIMEBASE (при Δ=4 мир за тик
      // продвигается вчетверо), а запас слота save-under рассчитан на байт.
      if (step !== 0 && Math.abs(step) < 64) { const d = S.tb_delta ? m.rd(S.tb_delta) : -1;
        const k = Math.abs(step) + "px@Δ" + d; H.set(k, (H.get(k) || 0) + 1); } }
  } });
let row0 = m.rd(S.L5B03 + 1), chk = 0, rot = -1, guard = 0;
while (ticks < 1200 && guard++ < 900000) { const row = m.rd(S.L5B03 + 1);
  m.key(KEY.UP, true); m.key(KEY.RIGHT, rot >= 0 && guard < rot); m.step();
  if (guard - chk >= 60) { if (row <= row0) rot = guard + 25; row0 = row; chk = guard; } }
console.log(`тиков ${ticks}`);
const rows = [...H.entries()].sort((a,b)=>b[1]-a[1]);
console.log("шаг по горизонтали за тик (px) при данной Δ:");
for (const [k,v] of rows.slice(0,12)) console.log(`  ${k}: ${v} раз`);
