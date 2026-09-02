"use strict";
// КАРТА РАСКРАСКИ СУЩЕСТВ + ЦЕНА ПЕРЕКРАСКИ. ТОЛЬКО ЗАМЕР, В ИГРУ НЕ ПРАВИТ.
//
// Чем отличается от sprite_sheet.js: тот рисует кадры и подписывает чернило
// ЖЁСТКО ПО ИМЕНИ («акула синяя»), то есть врёт, как только таблица синих
// меняется. Здесь чернило берётся ИЗ ОБРАЗА — из таблицы LB4F0_bluetab, по
// которой решает сам IsBlueIY, — и дополняется замером.
//
// ЗАЧЕМ ЗАМЕР. Перекрасить существо стоит по-разному в зависимости от того,
// ЧТО ЛЕЖИТ ПОД НИМ В ЧУЖОЙ ПЛОСКОСТИ:
//   * синее (уехать целиком в 0xE000) — save-under переезжает вместе с блитом,
//     цена ноль тактов, но над рельефом существо сливается с ним;
//   * красное (быть в ОБЕИХ плоскостях) — нужен второй проход. Если под
//     существом вторая плоскость ПУСТА, второй проход можно вести записью
//     (~40 тактов/байт, как в снятом BLUEWRITE) и стирать нулями — второй
//     буфер save-under не нужен. Если не пуста — либо второй буфер (+страница
//     пула на каждое живое существо этого типа), либо дыра в рельефе/небе.
// Мера и есть ответ: доля байт блита, у которых чужая плоскость непуста.
//
//   node tools/verify/inkmap.js <rom> <sym> [уровни=1,2,3,4] [тиков=3000] [сид=0x0167]
//   IM_JSON=file.json — выгрузить таблицу
const fs = require("fs"), path = require("path");
const { reachGame, KEY } = require("./drive.js");
const ROOT = path.resolve(__dirname, "../..");
const ROM = process.argv[2], SYM = process.argv[3];
const LEVELS = (process.argv[4] || "1,2,3,4").split(",").map(Number);
const NT = parseInt(process.argv[5] || "3000", 10);
const SEED = parseInt(process.argv[6] || "0x0167", 16);

// --- КТО ЕСТЬ КТО: имя типа берётся из шапки шаблона записи, дескриптор — из
// последнего DEFW шаблона («object record»). Один дескриптор может стоять у
// нескольких шаблонов (21/26/28 байт) — имя тогда одно, берётся первое.
const src = fs.readFileSync(path.join(ROOT, "src8080", "scubacodb.asm"), "utf8").split("\n");
const nameOfDesc = {}, sprOfDesc = {};
for (let i = 0; i < src.length; i++) {
  const t = /Record template for \d+-byte record - (.+)$/.exec(src[i]);
  if (!t) continue;
  // ОКНО ПОИСКА ДЕСКРИПТОРА — 24 СТРОКИ, А НЕ 12. Шаблон записи может быть
  // раздвинут врезкой условной компиляции: у круглой рыбы -DMIRROR добавляет
  // семь строк комментария и IFDEF, и `DEFW LC0B2 ; object record` уезжает на
  // тринадцатую строку. С окном в 12 строк тип молча терял имя и печатался как
  // «?6530» — перепись врала на самом массовом существе игры.
  const body = src.slice(i + 1, i + 24).join("\n");
  const d = /DEFW\s+(LC[0-9A-F]{3})\s*;\s*object record/.exec(body);
  const s = /DEFW\s+(\w+),\s*\w+\s*;\s*sprite address/.exec(body);
  if (!d) continue;
  if (!nameOfDesc[d[1]]) { nameOfDesc[d[1]] = t[1].trim(); sprOfDesc[d[1]] = s ? s[1] : "?"; }
}

const S = {};
for (const f of ["scubacod0.sym", "scubacod1.sym"]) {
  const p = path.join(path.dirname(SYM), f);
  if (!fs.existsSync(p)) continue;
  for (const l of fs.readFileSync(p, "latin1").split("\n")) {
    const m = /^(\S+?):?\s+EQU\s+(?:0x)?([0-9A-Fa-f]+)/.exec(l);
    if (m) S[m[1]] = parseInt(m[2], 16);
  }
}
// адрес -> имя метки дескриптора
const descByAddr = {};
for (const d of Object.keys(nameOfDesc)) if (S[d] !== undefined) descByAddr[S[d]] = d;

// --- ТАБЛИЦА СИНИХ ИЗ САМОГО ОБРАЗА -----------------------------------------
const bin = fs.readFileSync(path.join(path.dirname(SYM), "scubacod1.bin"));
const LO = S.SCUBACOD0_END;
const at = a => (a >= LO && a - LO < bin.length) ? bin[a - LO] : 0;
const blueDesc = new Set();
if (S.LB4F0_bluetab !== undefined)
  for (let i = 0; i < 6; i++) blueDesc.add(at(S.LB4F0_bluetab + 2 * i) | (at(S.LB4F0_bluetab + 2 * i + 1) << 8));

// --- СТАТИЧЕСКАЯ ПЕРЕПИСЬ: СКОЛЬКО СУЩЕСТВ КАЖДОГО ТИПА СТОИТ НА УРОВНЕ ------
// Стенд не умеет довести дайвера до групп IV/V (разбор — oracle.js, сценарий
// deep), поэтому «кого мы вообще красим» считается НЕ прохождением, а прямым
// чтением массивов записей сразу после постройки уровня. Тип записи — слово по
// смещению +$13 (в шаблоне это `DEFW LCxxx ; object record`), то самое, что
// тракт кладёт в IY.
const REC = { I: 21, II: 26, III: 26, IV: 26, V: 28 };
const perLevel = {};          // level -> {descAddr -> count}
for (const LVL of LEVELS) {
  const g = reachGame(ROM, SYM, { cpu: "i8080", level: LVL, seed: SEED });
  const m = g.m;
  const n = { I: m.rd(S.NumRecsI), II: m.rd(S.NumRecsII), III: m.rd(S.NumRecsIII),
              IV: m.rd(S.NumRecsIV), V: m.rd(S.NumRecsV) };
  const b = { I: S.LC4F0, II: m.rdw(S.RecsAddrII), III: m.rdw(S.RecsAddrIII), IV: m.rdw(S.RecsAddrIV) };
  b.V = (b.IV + 26 * n.IV) & 0xffff;
  const cnt = {};
  for (const k of ["I", "II", "III", "IV", "V"])
    for (let i = 0; i < n[k]; i++) {
      const a = (b[k] + REC[k] * i) & 0xffff;
      const d = m.rdw(a + 0x13);
      if (!descByAddr[d]) continue;
      cnt[d] = (cnt[d] || 0) + 1;
    }
  perLevel[LVL] = cnt;
}

// --- ЗАМЕР -------------------------------------------------------------------
const acc = new Map();   // desc-addr -> {bytes, oppNZ, relief, sky, water, plane1, ticks:Set}
function slot(a) {
  if (!acc.has(a)) acc.set(a, { bytes: 0, oppNZ: 0, relief: 0, sky: 0, water: 0, plane1: 0, upd: 0 });
  return acc.get(a);
}
for (const LVL of LEVELS) {
  const g = reachGame(ROM, SYM, { cpu: "i8080", level: LVL, seed: SEED });
  const m = g.m;
  let demo = false;
  m.onPc(S.LEEAD, () => { demo = true; });
  m.onPc(S.START_GAME, () => { demo = false; });
  m.onPc(S.LB500, () => {
    if (demo) return;
    const hl = m.cpu.hl() & 0xffff;
    const h = hl >> 8, l = hl & 0xff;
    const iy = m.rdw(S.z80_iy);
    const s = slot(iy);
    s.bytes++;
    if (h >= 0xE0) { s.plane1++; }
    // чужая плоскость: для жёлтого это 0xE000 (hl+0x2000), для синего 0xC000
    const opp = h >= 0xE0 ? m.rd(hl - 0x2000) : m.rd(hl + 0x2000);
    if (h < 0xE0 && opp) {           // что мешало бы писать в 0xE000 записью
      s.oppNZ++;
      if (l === 0xBF) s.water++; else if (l > 0xBF) s.sky++; else s.relief++;
    } else if (h >= 0xE0 && opp) s.oppNZ++;
  });
  // ПЛАВАНИЕ ПО ВОСЬМИ НАПРАВЛЕНИЯМ + ПОДСАДКА СТРОКИ МИНИ-КАРТЫ (приём из
  // сценария deep, oracle.js): без неё дайвер стенда с поверхности не уходит и
  // в замер попадают только те два типа, что живут у лодки.
  const ROW = process.env.IM_ROW === undefined ? null : parseInt(process.env.IM_ROW, 10);
  if (ROW !== null) m.onPc(S.LD9C0, () => { m.wr(S.L5B03 + 1, ROW); });
  const D = [[KEY.DOWN], [KEY.DOWN, KEY.RIGHT], [KEY.RIGHT], [KEY.UP, KEY.RIGHT],
             [KEY.UP], [KEY.UP, KEY.LEFT], [KEY.LEFT], [KEY.DOWN, KEY.LEFT]];
  const t0 = g.ticks; let guard = 0, di = 0, held = [];
  while (g.ticks - t0 < NT && guard < 2000000) {
    const phase = Math.floor((g.ticks - t0) / 120) % D.length;
    if (phase !== di || !held.length) {
      for (const k of held) m.key(k, false);
      di = phase; held = D[di]; for (const k of held) m.key(k, true);
    }
    // ПОДПИТКА. Без неё дайвер гибнет (кислород/существо), игра уходит в
    // game over, счётчик тиков встаёт — и прогон крутится вхолостую до guard.
    if ((guard & 255) === 0) { if (S.LIVES) m.wr(S.LIVES, 3); if (S.OXYGEN) { m.wr(S.OXYGEN, 0xff); m.wr(S.OXYGEN + 1, 0xff); } }
    m.step(); guard++;
  }
  for (const k of held) m.key(k, false);
  console.error(`  ур.${LVL}: тиков ${g.ticks - t0}, шагов ${guard}`);
}

const rows = [];
const seen = new Set([...acc.keys(), ...LEVELS.flatMap(L => Object.keys(perLevel[L]).map(Number))]);
for (const addr of seen) {
  const s = acc.get(addr) || { bytes: 0, oppNZ: 0, relief: 0, sky: 0, water: 0, plane1: 0 };
  const d = descByAddr[addr];
  rows.push({
    addr, desc: d || "?", name: d ? nameOfDesc[d] : "(не тип записи: " + addr.toString(16) + ")",
    spr: d ? sprOfDesc[d] : "—",
    ink: blueDesc.has(addr) ? 1 : 2,
    bytes: s.bytes, oppNZ: s.oppNZ, relief: s.relief, sky: s.sky, water: s.water,
    perLevel: Object.fromEntries(LEVELS.map(L => [L, perLevel[L][addr] || 0])),
  });
}
rows.sort((a, b) => b.bytes - a.bytes || b.desc.localeCompare(a.desc));
const total = rows.reduce((n, r) => n + r.bytes, 0);
console.log(`уровни ${LEVELS.join("/")} × ${NT} тиков, сид 0x${SEED.toString(16)}; байт блита всего ${total}`);
console.log("тип                        дескр  черн  записей на ур." + LEVELS.join("/") + "   байт блита   чужая плоскость непуста  рельеф/небо/вода");
for (const r of rows) {
  const pct = (100 * r.oppNZ / Math.max(1, r.bytes)).toFixed(1);
  const per = LEVELS.map(L => String(r.perLevel[L]).padStart(2)).join("/");
  console.log(
    `${r.name.padEnd(26)} ${r.desc.padEnd(6)} ${String(r.ink).padStart(3)}   ${per.padStart(14)}   ${String(r.bytes).padStart(8)}   ${String(r.oppNZ).padStart(8)} (${pct.padStart(5)}%)  ${String(r.relief).padStart(5)}/${String(r.sky).padStart(5)}/${String(r.water).padStart(4)}`);
}
if (process.env.IM_JSON) fs.writeFileSync(process.env.IM_JSON, JSON.stringify({ levels: LEVELS, ticks: NT, seed: SEED, rows }, null, 1));
