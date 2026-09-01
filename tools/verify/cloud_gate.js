"use strict";
// ГЕЙТ ТРЁХЦВЕТНОЙ СТАЙКИ (-DCLOUDINK). Проверяет ТРАКТ, а не картинку.
//
// Стайку стенд сам на экран не выводит: она живёт в группах, до которых дайвера
// довести нечем (разбор — oracle.js, сценарий deep). Поэтому записи стайки
// ПОДСАЖИВАЮТСЯ к дайверу: каждый тик их мировые координаты ставятся рядом с
// его собственными, а поправка подбирается обратной связью по фактическому
// экранному столбцу — иначе стайка липнет к краю поля и обрезается до одного
// байта, и тракт проверяется вхолостую.
//
// ЧТО СВЕРЯЕТСЯ. Тело LB500C обязано выполнить save-under-обмен НЕЗАВИСИМО в
// каждой плоскости. На каждом байте до и после снимаются шесть чисел (экран,
// буфер, маска — по плоскости) и сверяются тождества самого приёма:
//     t = буфер ^ экран;  экран' = маска | t;  буфер' = маска & ~t
// Вторая плоскость считается по СВОИМ маске и буферу (+80h), при стирании
// смещение маски обнулено — и это тоже проверяется: операнд cl_mx1 обязан быть
// 80h при рисовании и 0 при стирании.
// Плюс перепись чернил под стайкой: если раскраска работает, в её рамке видны
// все три индекса (только 0xC000, только 0xE000, обе).
//
// НЕГАТИВНЫЕ КОНТРОЛИ (правило «гейт обязан падать на пустой выборке»):
//   CG_EMPTY=1  — подсадку не делать: стайка на экран не попадёт, и гейт обязан
//                 сказать, что не проверил НИЧЕГО, а не отрапортовать зелёным;
//   CG_INJECT=1 — операнд смещения экрана второй плоскости обнуляется, обе
//                 плоскости пишут в 0xC000; гейт обязан покраснеть.
//
//   node tools/verify/cloud_gate.js <rom> <sym> [уровень=4] [тиков=600]
const path = require("path");
const { reachGame, KEY } = require("./drive.js");
const { readSym } = require("./harness.js");
const ROM = process.argv[2], SYM = process.argv[3];
const LVL = parseInt(process.argv[4] || "4", 10), NT = parseInt(process.argv[5] || "600", 10);
const S = readSym(SYM);
try { Object.assign(S, readSym(path.join(path.dirname(SYM), "scubacod0.sym"))); } catch (e) {}
for (const n of ["LB500C", "LB500_tail", "LB470", "LB53A", "LC132", "z80_iy", "z80_ix", "cl_mx1"])
  if (S[n] === undefined) { console.log("нет метки " + n + " — образ собран без -DCLOUDINK?"); process.exit(2); }

const REC = { I: 21, II: 26, III: 26, IV: 26, V: 28 };
const g = reachGame(ROM, SYM, { cpu: "i8080", level: LVL, seed: 0x167 });
const m = g.m;
const n = { I: m.rd(S.NumRecsI), II: m.rd(S.NumRecsII), III: m.rd(S.NumRecsIII), IV: m.rd(S.NumRecsIV), V: m.rd(S.NumRecsV) };
const b = { I: S.LC4F0, II: m.rdw(S.RecsAddrII), III: m.rdw(S.RecsAddrIII), IV: m.rdw(S.RecsAddrIV) };
b.V = (b.IV + 26 * n.IV) & 0xffff;
const recs = [];
for (const k of ["I", "II", "III", "IV", "V"])
  for (let i = 0; i < n[k]; i++) { const a = (b[k] + REC[k] * i) & 0xffff; if (m.rdw(a + 0x13) === S.LC132) recs.push(a); }
if (!recs.length) { console.log("на уровне нет записей стайки"); process.exit(2); }

let bad = [], bytes = 0, draws = 0, erases = 0, pend = null, dx = 4, lastCol = null;
let curDraw = false, tailSeen = 0, shots = 0, before = null;
const ink = [0, 0, 0, 0];        // 0 — пусто, 1 — только 0xE000, 2 — только 0xC000, 3 — обе
// снимок поля целиком: чернила считаются ТОЛЬКО по изменившимся пикселям, иначе
// в перепись попадут синяя акула и змеевидные рыбы, и «синие есть» ничего не докажет
function field() { const a = new Uint8Array(64 * 256); for (let c = 0; c < 32; c++) for (let r = 0; r < 256; r++)
  { a[c * 256 + r] = m.rd(0xC000 + c * 256 + r); a[8192 + c * 256 + r] = m.rd(0xE000 + c * 256 + r); } return a; }
const isC = () => m.rdw(S.z80_iy) === S.LC132;

function snap() {
  const hl = m.cpu.hl() & 0xffff, de = m.cpu.de() & 0xffff, bc = m.cpu.bc() & 0xffff;
  const bias = m.rd(S.cl_mx1 + 1);
  const hl2 = hl ^ 0x2000, de2 = de ^ 0x0080, bc2 = (bc & 0xff00) | ((bc & 0xff) ^ bias);
  return { hl, de, bc, hl2, de2, bc2, bias,
           s1: m.rd(hl), b1: m.rd(de), m1: m.rd(bc),
           s2: m.rd(hl2), b2: m.rd(de2), m2: m.rd(bc2) };
}
function verify(p) {
  if (!p || bad.length > 8) return;
  const chk = (tag, s, bu, mask, sa, ba) => {
    const t = bu ^ s, S1 = (mask | t) & 0xff, B1 = (mask & ~t) & 0xff;
    if (sa !== S1 || ba !== B1)
      bad.push(`${tag}: экран ${s.toString(16)}->${sa.toString(16)} (ждали ${S1.toString(16)}), ` +
               `буфер ${bu.toString(16)}->${ba.toString(16)} (ждали ${B1.toString(16)}), маска ${mask.toString(16)}`);
  };
  chk("0xC000", p.s1, p.b1, p.m1, m.rd(p.hl), m.rd(p.de));
  chk("0xE000", p.s2, p.b2, p.m2, m.rd(p.hl2), m.rd(p.de2));
}

m.onPc(S.LB500C, () => { verify(pend); pend = snap(); bytes++; });
m.onPc(S.LB500_tail, () => { if (pend) { verify(pend); pend = null; } });
// ПУТЬ СТИРАНИЯ ПРИХОДИТСЯ ЗАВОДИТЬ РУКАМИ. Замер (/tmp — cl_erase) показал: за
// 800 тиков блит не зовётся с пустой маской НИ РАЗУ ни для одного типа — обмен
// save-under снимает прошлый кадр и кладёт новый одним проходом, а полное
// стирание нужно лишь при уходе существа. Но код этого пути есть, и проверять
// его надо: раз в 37 отрисовок бит 0 (IX+13) снимается на время одного вызова
// и возвращается на месте — блит идёт по пустой маске, а тождества обмена и
// операнд смещения маски сверяются тем же порядком, что и при рисовании.
let forced = false;
m.onPc(S.LB470, () => {
  if (!isC()) return;
  const ix = m.rdw(S.z80_ix);
  forced = false;
  if ((draws + erases) % 37 === 36 && (m.rd(ix + 13) & 1)) { m.wr(ix + 13, m.rd(ix + 13) & 0xfe); forced = true; }
  curDraw = (m.rd(ix + 13) & 1) !== 0;
  if (curDraw) draws++; else erases++;
  tailSeen = 0;
  before = (curDraw && shots < 5) ? field() : null;
});
// LB53A_1 — точка ПОСЛЕ восстановления z80_ix из стека: только здесь (IX+13)
// снова смотрит в запись существа, а не в тень указателя маски. У стайки сюда
// заходят дважды (по буферу на плоскость), поэтому считаем первый заход.
m.onPc(S.LB53A_1 !== undefined ? S.LB53A_1 : S.LB53A, () => {
  if (!isC()) return;
  if (tailSeen++) return;
  if (forced) { const ix = m.rdw(S.z80_ix); m.wr(ix + 13, m.rd(ix + 13) | 1); }
  const bias = m.rd(S.cl_mx1 + 1), want = curDraw ? 0x80 : 0x00;
  if (bias !== want && bad.length <= 8)
    bad.push(`смещение маски ${bias.toString(16)} при ${curDraw ? "рисовании" : "стирании"} (ждали ${want.toString(16)})`);
  lastCol = m.rd(m.rdw(S.z80_iy) + 2);
  if (before) {
    const after = field(); shots++;
    for (let c = 0; c < 32; c++) for (let r = 0; r < 256; r++) {
      const i = c * 256 + r, j = 8192 + i;
      const ch = (before[i] ^ after[i]) | (before[j] ^ after[j]);
      if (!ch) continue;
      for (let bit = 0; bit < 8; bit++) {
        if (!((ch >> bit) & 1)) continue;
        ink[((after[i] >> bit) & 1) * 2 + ((after[j] >> bit) & 1)]++;
      }
    }
    before = null;
  }
});
// подсадка: держим стайку в середине поля
const EMPTY = process.env.CG_EMPTY === "1", INJECT = process.env.CG_INJECT === "1";
let tick = 0;
m.onPc(S.LD9C0, () => {
  tick++;
  if (INJECT && S.cl_sx1 !== undefined) m.wr(S.cl_sx1 + 1, 0);
  if (EMPTY) return;
  if (lastCol !== null) { const e = 14 - lastCol; dx = (dx + (e > 0 ? 1 : e < 0 ? -1 : 0)) & 0xff; lastCol = null; }
  // раз в полтораста тиков стайку отпускаем на четверть карты: она уходит с
  // экрана, и тракт проходит СТИРАНИЕ — иначе гейт проверял бы только рисование
  if ((tick % 150) >= 120) return;
  const c = m.rd(S.LE33B), r = m.rd(S.LE33C);
  for (const a of recs) { m.wr(a, (c + dx) & 0xff); m.wr(a + 1, r & 0xff); }
});

const D = [[KEY.DOWN], [KEY.RIGHT], [KEY.UP], [KEY.LEFT]];
const t0 = g.ticks; let guard = 0, held = [], di = -1;
// Расхождений хватит восьми: дальше прогон только тратит время. С подсаженным
// дефектом (CG_INJECT) экран рушится, игра встаёт, счётчик тиков замирает — и
// без этого выхода гейт молотил бы до сторожевого предела шагов.
while (g.ticks - t0 < NT && guard < 2000000 && bad.length <= 8) {
  const ph = Math.floor((g.ticks - t0) / 60) % 4;
  if (ph !== di) { for (const k of held) m.key(k, false); di = ph; held = D[di]; for (const k of held) m.key(k, true); }
  if ((guard & 255) === 0) { m.wr(S.LIVES, 3); m.wr(S.OXYGEN, 0xff); m.wr(S.OXYGEN + 1, 0xff); }
  m.step(); guard++;
}
const tot = ink[1] + ink[2] + ink[3];
console.log(`заходов в блит стайки: рисование ${draws}, стирание ${erases}; байт через LB500C ${bytes}`);
console.log(`изменённых пикселей за ${shots} снимков: синих ${ink[1]}, жёлтых ${ink[2]}, красных ${ink[3]}, погашено ${ink[0]} (цветных всего ${tot})`);
if (!bytes) { console.log("ТРАКТ НЕ ПРОЙДЕН НИ РАЗУ — гейт ничего не проверил"); process.exit(2); }
if (bad.length) { console.log("РАСХОЖДЕНИЯ:"); for (const s of bad.slice(0, 8)) console.log("  " + s); process.exit(1); }
if (!ink[1] || !ink[3]) { console.log("СТАЙКА НЕ РАСКРАШЕНА: нет синих или красных пикселей"); process.exit(1); }
console.log("ОК");
