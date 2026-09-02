"use strict";
// УБИРАЕТ ЛИ СТАЙКА ЗА СОБОЙ ВО ВТОРОЙ ПЛОСКОСТИ.
//
// Три простых признака оказались ложными и стоят того, чтобы их назвать:
//  * «синих пикселей стало больше» — фон и так синий (небо, градиент, ватерлиния);
//  * «последний писатель — стайка» — при ПРАВИЛЬНОМ восстановлении она тоже
//    последний писатель: возвращает на место чужие биты, которые сохранила;
//  * «сравнить с прогоном, где второй проход выключен» — сцены расходятся:
//    синие пиксели стайки видит проверка столкновения дайвера (LE233 при
//    взведённом blue_on), и партия идёт иначе. Гейт обязан это заметить и
//    объявить себя недействительным, а не сравнивать разные партии.
//
// Здесь проверка идёт В ОДНОМ ПРОГОНЕ и ровно по определению save-under:
//   1) перед отрисовкой стайки снимается вся плоскость 0xE000;
//   2) запоминаются адреса, которые стайка в этой отрисовке тронула;
//   3) на следующем заходе её блит принудительно переводится в СТИРАНИЕ;
//   4) после стирания каждый тронутый адрес обязан вернуться к снятому значению
//      — кроме тех, куда между делом писал кто-то другой (их адреса тоже
//      отслеживаются, и они из проверки исключаются, а их число печатается).
//
//   node tools/verify/cloud_resid_gate.js <rom> <sym> [уровень=4] [тиков=900]
// CR_DY=-6 — держать стайку выше дайвера, у ватерлинии и неба (там, где вторая
//            плоскость не пуста и где владелец видел след).
const { reachGame, KEY } = require("./drive.js");
const [rom, sym] = process.argv.slice(2, 4);
const LVL = parseInt(process.argv[4] || "4", 10), NT = parseInt(process.argv[5] || "900", 10);
const DY = parseInt(process.env.CR_DY || "-6", 10);
const REC = { I: 21, II: 26, III: 26, IV: 26, V: 28 };

const g = reachGame(rom, sym, { cpu: "i8080", level: LVL, seed: 0x0167 });
const m = g.m, S = g.S;
for (const n of ["LB470", "LB53A", "LC132", "z80_ix", "z80_iy", "LB500C", "LB500_tail"])
  if (S[n] === undefined) { console.log("нет метки " + n + " — образ без -DCLOUDINK?"); process.exit(2); }

const n = { I: m.rd(S.NumRecsI), II: m.rd(S.NumRecsII), III: m.rd(S.NumRecsIII), IV: m.rd(S.NumRecsIV), V: m.rd(S.NumRecsV) };
const b = { I: S.LC4F0, II: m.rdw(S.RecsAddrII), III: m.rdw(S.RecsAddrIII), IV: m.rdw(S.RecsAddrIV) };
b.V = (b.IV + 26 * n.IV) & 0xffff;
const recs = [];
for (const k of ["I", "II", "III", "IV", "V"])
  for (let i = 0; i < n[k]; i++) { const a = (b[k] + REC[k] * i) & 0xffff; if (m.rdw(a + 0x13) === S.LC132) recs.push(a); }
if (!recs.length) { console.log("на уровне нет записей стайки"); process.exit(2); }

// стайка сейчас в блите? (её тело — LB500C, туда никто больше не заходит)
let inCloud = false;
const touched = new Map();       // адрес -> значение ДО первого касания стайкой
const foreign = new Set();
let snap = null, snap1 = null;
// ОБЯЗАТЕЛЬНЫЙ КОНТРОЛЬ: то же самое для ПЕРВОЙ плоскости. Если и она не
// возвращается, виноват не второй проход, а сама постановка опыта —
// принудительное стирание случается на НОВОМ месте существа, и буфер там уже
// не тот. Без этого контроля гейт обвинял бы раскраску в чужом.
const touched1 = new Map(), foreign1 = new Set();
for (let a = 0xE000; a < 0x10000; a++) m.onWrite(a, (addr, v, pc) => {
  if (inCloud) { if (!touched.has(addr)) touched.set(addr, snap ? snap[addr - 0xE000] : m.rd(addr)); }
  else if (touched.has(addr)) foreign.add(addr);
});
for (let a = 0xC000; a < 0xE000; a++) m.onWrite(a, (addr, v, pc) => {
  if (inCloud) { if (!touched1.has(addr)) touched1.set(addr, snap1 ? snap1[addr - 0xC000] : m.rd(addr)); }
  else if (touched1.has(addr)) foreign1.add(addr);
});
m.onPc(S.LB500C, () => { inCloud = true; });
m.onPc(S.LB500_tail, () => { inCloud = false; });

let t = 0, phase = 0, checks = 0, resid = [], skipped = 0, draws = 0, erases = 0, tot1 = 0, tot2 = 0;
m.onPc(S.LB470, () => {
  if (m.rdw(S.z80_iy) !== S.LC132) return;
  const ix = m.rdw(S.z80_ix);
  if (phase === 0) {                       // готовим: снимаем плоскость 2 и чистим учёт
    if (!(m.rd(ix + 13) & 1)) return;      // ждём именно отрисовку
    snap = Buffer.alloc(0x2000); snap1 = Buffer.alloc(0x2000);
    for (let i = 0; i < 0x2000; i++) { snap[i] = m.rd(0xE000 + i); snap1[i] = m.rd(0xC000 + i); }
    touched.clear(); foreign.clear(); touched1.clear(); foreign1.clear();
    phase = 1; draws++;
    return;
  }
  if (phase === 1) {                       // следующий заход переводим в стирание
    m.wr(ix + 13, m.rd(ix + 13) & 0xfe);
    phase = 2; erases++;
  }
});
m.onPc(S.LB53A, () => {
  if (phase !== 2 || m.rdw(S.z80_iy) !== S.LC132) return;
  phase = 0;
  let bad = 0, first = null, bad1 = 0;
  for (const [addr, was] of touched1) { if (foreign1.has(addr)) continue; if (m.rd(addr) !== was) bad1++; }
  tot1 += bad1; tot2 += 0;
  for (const [addr, was] of touched) {
    if (foreign.has(addr)) { skipped++; continue; }
    checks++;
    const now = m.rd(addr);
    if (now !== was) { bad++; if (!first) first = `0x${addr.toString(16)} стлб ${(addr >> 8) & 0x1f} стр ${255 - (addr & 0xff)}: было ${was.toString(16)}, стало ${now.toString(16)}`; }
  }
  tot2 += bad;
  if (bad && resid.length < 3) {
    const list = [];
    for (const [addr, was] of touched) {
      if (foreign.has(addr)) continue;
      const now = m.rd(addr);
      if (now !== was) list.push(`      0x${addr.toString(16)} стлб ${(addr >> 8) & 0x1f} стр ${255 - (addr & 0xff)}: ${was.toString(16)} -> ${now.toString(16)}`);
    }
    const cols = [...new Set([...touched.keys()].map(a => (a >> 8) & 0x1f))].sort((x, y) => x - y);
    resid.push(`${bad} байт из ${touched.size} не вернулись; стайка трогала столбцы ${cols.join(",")}\n` + list.join("\n"));
  }
});

m.onPc(S.LD9C0, () => {
  t++;
  const c = m.rd(S.LE33B), r = m.rd(S.LE33C);
  for (const a of recs) { m.wr(a, (c + 4) & 0xff); m.wr(a + 1, (r + DY) & 0xff); }
});
const D = [[KEY.DOWN], [KEY.RIGHT], [KEY.UP], [KEY.LEFT]];
const t0 = g.ticks; let guard = 0, held = [], di = -1;
while (g.ticks - t0 < NT && guard < 2000000) {
  const ph = Math.floor((g.ticks - t0) / 60) % 4;
  if (ph !== di) { for (const k of held) m.key(k, false); di = ph; held = D[di]; for (const k of held) m.key(k, true); }
  if ((guard & 255) === 0) { m.wr(S.LIVES, 3); m.wr(S.OXYGEN, 0xff); m.wr(S.OXYGEN + 1, 0xff); }
  m.step(); guard++;
}
console.log(`уровень ${LVL}, стайка ${DY} строк от дайвера: пар «отрисовка-стирание» ${erases}, сверено адресов ${checks}, исключено чужих ${skipped}`);
console.log(`НЕ ВЕРНУЛОСЬ БАЙТ: вторая плоскость ${tot2}, ПЕРВАЯ (контроль) ${tot1}`);
if (tot1) { console.log("ГЕЙТ НЕДЕЙСТВИТЕЛЕН: первая плоскость тоже не возвращается — виновата постановка опыта, а не второй проход"); process.exit(2); }
if (!checks) { console.log("ПРОВАЛ: сверять нечего — тракт стайки не отработал"); process.exit(2); }
if (resid.length) { console.log("КРАСНЫЙ: стайка не убрала за собой во второй плоскости:"); for (const s of resid) console.log("  " + s); process.exit(1); }
console.log("ГЕЙТ ЗЕЛЁНЫЙ: после стирания вторая плоскость вернулась к прежнему виду");
