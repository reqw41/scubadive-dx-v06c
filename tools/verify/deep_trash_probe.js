"use strict";
// МУСОР НА ГЛУБИНЕ. Владелец 2026-09-15: «на заставке этого нет, а на глубине
// кальмар, который двигался по сложной траектории, выдал мусор»; на кадре —
// красно-коралловое пятно на пустой воде.
//
// Критерий: знакоместо, у которого карта занятости SCRATTR говорит «вода» (06),
// чернила есть, и его не накрывает ни один живой след блита. Принадлежность
// берётся у самого блита (LB4C4: экранные столбец (IY+2), строка (IY+3),
// обрезанная ширина из регистра B, высота (IY+9)) и живёт до следующей
// отрисовки этого же существа; отдельно учтён дайвер — он идёт своим трактом.
//
// ⚠ ГЛУБИНУ ЗАДАЁМ ПРИНУДИТЕЛЬНО: автопилот туда не уходит, за 6000 тиков окно
// возвращается на верхний ряд карты. Позиция ставится ДО PrepareGame — там
// рисуется экран и раскладываются существа, после уже поздно.
//   node tools/verify/deep_trash_probe.js <rom> <sym> [тиков] [порог замеров]
//   ROW=4 COL=11 LVL=4 — где стоит окно карты; SHOT=file.png — снимок худшего кадра
const fs = require("fs"), zlib = require("zlib");
const { reachGame, KEY } = require("./drive.js");
const [rom, sym] = process.argv.slice(2, 4);
const NT = parseInt(process.argv[4] || "6000", 10), HOLD = parseInt(process.argv[5] || "3", 10);
const ROW = parseInt(process.env.ROW || "4", 10), COL = parseInt(process.env.COL || "11", 10);
const g = reachGame(rom, sym, { cpu: process.env.CPU || "i8080", level: parseInt(process.env.LVL || "4", 10), seed: 0x0167,
  preHook: (mm, SS) => { mm.onPc(SS.PrepareGame, () => { mm.wr(SS.L5B03, COL); mm.wr(SS.L5B03 + 1, ROW); }); } });
const m = g.m, S = g.S, w = a => m.rd(a) | (m.rd(a + 1) << 8);
// РЕГИСТР B У ДВУХ ЯДЕР ЧИТАЕТСЯ ПО-РАЗНОМУ: у i8080 есть m.cpu.b(), у Z80 —
// только getState(). Без этого замер на эталоне падал (TypeError m.cpu.b).
const regB = () => (m.cpu.b ? m.cpu.b() : m.cpu.getState().b);
const attr = (r, c) => { const a = ((r >> 3) | (r << 5)) & 0xff;
  return m.rd((((a & 0x1f) + (S.SCRATTR >> 8)) << 8) | ((a & 0xE0) | (c & 0x1f))); };
const ink = (r, c) => { for (let i = 0; i < 8; i++) { const lo = (255 - (r * 8 + i)) & 0xff;
  if (m.rd(0xC000 + c * 256 + lo) || m.rd(0xE000 + c * 256 + lo)) return true; } return false; };
const TYPE = {}; for (const [n, a] of Object.entries(S)) if (/^LC[0-9A-F]{3}$/.test(n)) TYPE[a] = n;
let ticks = 0, samples = 0, scrKey = "", settle = 0, base = null;
const wlog = [];
let drawn = [];
const lastFoot = new Map(), streak = new Map(), worst = new Map(), worstT = new Map(), owner = new Map();
const seenTypes = new Map();
const idx = () => (S.z80_iy != null && m.cpu.b) ? [w(S.z80_iy), w(S.z80_ix)]
  : (() => { const st = m.cpu.getState(); return [st.iy & 0xffff, st.ix & 0xffff]; })();
m.onPc(S.LB4C4, () => { const [iy, ix] = idx();
  const tn = TYPE[w(ix + 19)] || "?"; seenTypes.set(tn, (seenTypes.get(tn) || 0) + 1);
  drawn.push({ col: m.rd(iy + 2), row: m.rd(iy + 3), w: regB(), h: m.rd(iy + 9) || 1, ix,
               тип: TYPE[w(ix + 19)] || "?" }); });
m.onPc(S.LD9C0, () => { ticks++;
  for (const d of drawn) lastFoot.set(d.ix, d);
  drawn = [];
  const cover = new Map();
  { const dr = m.rd(S.DiverObj + 1), dc = m.rd(S.DiverObj);
    for (let r = dr - 2; r <= dr + 4; r++) for (let c = dc - 2; c <= dc + 4; c++) cover.set(r + "," + c, "дайвер"); }
  for (const d of lastFoot.values()) for (let r = d.row - 1; r <= d.row + d.h; r++) for (let c = d.col - 1; c <= d.col + d.w; c++)
    cover.set(r + "," + c, d.тип);
  if (ticks % 10) return;
  const key = m.rd(S.L5B03) + "," + m.rd(S.L5B03 + 1);
  if (key !== scrKey) { scrKey = key; settle = 4; base = null; streak.clear(); return; }
  if (settle > 0) { settle--; return; }
  // БАЗА — СНИМОК СРАЗУ ПОСЛЕ ПЕРЕРИСОВКИ ЭКРАНА. Без неё в «мусор» попадает
  // синяя статика (водоросли и ракушки над рифом): карта занятости зовёт эти
  // клетки водой, а чернила в них стоят законно и держатся весь экран — 24 такие
  // клетки и дал первый замер у большого кальмара.
  // Цена: мусор, появившийся ВО ВРЕМЯ перерисовки экрана, этот зонд не увидит.
  if (!base) { base = new Set();
    for (let r = 0; r < 24; r++) for (let c = 0; c < 32; c++) if (ink(r, c)) base.add(r + "," + c);
    return; }
  samples++;
  const top = m.rd(S.L5B03 + 1) === 0;
  for (let r = 0; r < 24; r++) for (let c = 0; c < 32; c++) { const k = r + "," + c;
    if (top && r <= 8) { streak.delete(k); continue; }       // небо и линия воды
    if (!ink(r, c) || attr(r, c) !== 6 || cover.has(k) || base.has(k)) { streak.delete(k); continue; }
    const s = (streak.get(k) || 0) + 1; streak.set(k, s);
    if (s > (worst.get(k) || 0)) { worst.set(k, s); worstT.set(k, ticks); owner.set(k, [...new Set([...lastFoot.values()].map(d => d.тип))].join("/")); } } });
// --- КТО ПИСАЛ В СПОРНУЮ КЛЕТКУ (WATCH=строка,столбец) ---------------------
// Сторож записи на все 16 байт знакоместа, обе плоскости; в журнале — тик,
// плоскость, значение и ближайшая метка по PC. Так видно, какая процедура
// оставила чернила и кто их не убрал.
if (process.env.WATCH) {
  const [wr, wc] = process.env.WATCH.split(",").map(Number);
  const nm = Object.entries(S).filter(([, a]) => typeof a === "number" && a > 0x300).sort((a, b) => a[1] - b[1]);
  const near = pc => { let best = "?"; for (const [n, a] of nm) { if (a > pc) break; best = `${n}+${pc - a}`; } return best; };
  for (let i = 0; i < 8; i++) { const lo = (255 - (wr * 8 + i)) & 0xff;
    for (const pl of [0xC000, 0xE000]) m.onWrite(pl + wc * 256 + lo, (a, v, pc) =>
      wlog.push(`тик ${ticks} ${pl === 0xC000 ? "C" : "E"} пикс.строка ${wr * 8 + i} := ${v.toString(16).padStart(2, "0")} из ${near(pc)}`)); }
}
if (S.god_on) m.wr(S.god_on, 1);
// --- ПЕРЕВОЗИМ ЭКРАН К КАЛЬМАРУ (SQUID=<метка типа>) -----------------------
// Гонять дайвера бесполезно: за 6000 тиков большой кальмар (LC1F2) не показался
// ни разу, а мелкий — девять отрисовок. Приём тот же, что в swim_gate: находим
// запись нужного типа, ставим окно карты на её клетку и принудительно
// перерисовываем экран через DrawGameScr.
if (process.env.SQUID) {
  const want = S[process.env.SQUID];
  const b4 = w(S.RecsAddrIV), n4 = m.rd(S.NumRecsIV);
  const gs = [[S.LC4F0, 21, m.rd(S.NumRecsI)], [w(S.RecsAddrII), 26, m.rd(S.NumRecsII)],
    [w(S.RecsAddrIII), 26, m.rd(S.NumRecsIII)], [b4, 26, n4], [b4 + 26 * n4, 28, m.rd(S.NumRecsV)]];
  let rec = null;
  for (const [base, sz, n] of gs) { if (base < 0x300 || n > 200) continue;
    for (let i = 0; i < n; i++) { const r = base + i * sz; if (w(r + 19) === want) { rec = r; break; } }
    if (rec) break; }
  if (!rec) { console.log(`  ${process.env.SQUID} на уровне нет — выборка пуста, вывод делать нельзя`); process.exit(2); }
  const scol = Math.max(0, Math.min(31, (m.rd(rec) >> 3) - 1)), srow = Math.max(0, Math.min(31, m.rd(rec + 1) >> 3));
  m.wr(S.L5B03, scol); m.wr(S.L5B03 + 1, srow);
  if (m.cpu.set_h) { m.cpu.set_h(srow); m.cpu.set_l(scol); }
  else { const st = m.cpu.getState(); st.h = srow; st.l = scol; m.cpu.setState(st); }
  const sp = (m.cpu.sp - 2) & 0xffff; m.wr(sp, S.LD9C0 & 0xff); m.wr(sp + 1, S.LD9C0 >> 8);
  m.cpu.sp = sp; m.cpu.pc = S.DrawGameScr;
  for (let i = 0; i < 6000 && (m.cpu.pc & 0xffff) !== S.LD9C0; i++) m.step();
  console.log(`  окно перевезено к ${process.env.SQUID}: столбец ${scol}, ряд ${srow}`);
}
let guard = 0, rng = 0x2545F491, dir = 0;
const nxt = () => { rng ^= rng << 13; rng ^= rng >>> 17; rng ^= rng << 5; return rng >>> 0; };
const KEYS = [KEY.UP, KEY.DOWN, KEY.LEFT, KEY.RIGHT];
while (ticks < NT && guard++ < 3000000) {
  if (guard % 200 === 0) dir = nxt() & 3;
  for (let i = 0; i < 4; i++) m.key(KEYS[i], i === dir);
  m.step(); }
// СНИМОК КОНЦА ПРОГОНА (SHOT=file.png) — чтобы мусор было видно глазами.
if (process.env.SHOT) { const S0 = require("./harness.js").readSym(rom.replace(/scuba[^/]*\.rom$/, "scubacod0.sym"));
  const vc = p2 => [(p2 & 7) * 36, ((p2 >> 3) & 7) * 36, ((p2 >> 6) & 3) * 85];
  const PAL = [0, 1, 2, 3].map(i => vc(m.rd(S0.PaletteGame + i)));
  const crcT = (() => { const tt = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; tt[n] = c; } return tt; })();
  const crc = b => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 0xff] ^ (c >>> 8); return c ^ 0xffffffff; };
  const ch2 = (t2, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const tt = Buffer.concat([Buffer.from(t2), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(tt) >>> 0); return Buffer.concat([l, tt, c]); };
  const w0 = 256, h0 = 256, sc = 2, rgb = Buffer.alloc(w0 * h0 * 3);
  for (let y = 0; y < h0; y++) { const lo = 255 - y;
    for (let x = 0; x < w0; x++) { const col = x >> 3, bit = 7 - (x & 7);
      const a = m.rd(0xC000 + col * 256 + lo), b = m.rd(0xE000 + col * 256 + lo);
      const c = PAL[(((a >> bit) & 1) << 1) | ((b >> bit) & 1)], o = (y * w0 + x) * 3;
      rgb[o] = c[0]; rgb[o + 1] = c[1]; rgb[o + 2] = c[2]; } }
  const W = w0 * sc, H = h0 * sc, big = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const s2 = ((y / sc | 0) * w0 + (x / sc | 0)) * 3, d = (y * W + x) * 3;
    big[d] = rgb[s2]; big[d + 1] = rgb[s2 + 1]; big[d + 2] = rgb[s2 + 2]; }
  const raw = Buffer.alloc(H * (W * 3 + 1));
  for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; big.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3); }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(H, 4); ih[8] = 8; ih[9] = 2;
  fs.writeFileSync(process.env.SHOT, Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), ch2("IHDR", ih), ch2("IDAT", zlib.deflateSync(raw)), ch2("IEND", Buffer.alloc(0))]));
  console.log("  снимок:", process.env.SHOT); }
if (process.env.WATCH) {
  const from = parseInt(process.env.WFROM || "0", 10), to = parseInt(process.env.WTO || "999999", 10);
  const sel = wlog.filter(l => { const t2 = parseInt(l.split(" ")[1], 10); return t2 >= from && t2 <= to; });
  console.log(`  журнал записей в клетку ${process.env.WATCH}: всего ${wlog.length}, в окне ${from}..${to} — ${sel.length}`);
  for (const l of sel.slice(0, 40)) console.log("    " + l);
}
const bad = [...worst.entries()].filter(([, s]) => s >= HOLD).sort((a, b) => b[1] - a[1]);
const NAMES = { LC092: "лодка", LC0A2: "медуза", LC0B2: "круглая рыба гор.", LC0CE: "круглая рыба верт.",
  LC0EA: "рыба", LC102: "акула", LC11A: "длинная рыба", LC132: "стайка рыб", LC14A: "мелкий кальмар гор.",
  LC166: "мелкий кальмар верт.", LC182: "угорь гор.", LC19E: "угорь верт.",
  LC1BA: "змейка гор.", LC1D6: "змейка верт.", LC1F2: "кальмар" };
console.log("  в выборке были:", [...seenTypes].sort((a,b)=>b[1]-a[1]).map(([k,n])=>`${NAMES[k]||k}:${n}`).join(", ") || "НИКОГО — выборка пуста");
console.log(`ряд карты ${ROW}: тиков ${ticks}, замеров ${samples}, порог ${HOLD}: клеток с чернилами на воде ${bad.length}`);
for (const [k, s] of bad.slice(0, 10))
  console.log(`  клетка ${k}: ${s} замеров подряд, конец на тике ${worstT.get(k)}; живые типы: ${owner.get(k)}`);
