// ПЕРЕПИСЬ СКРЫТЫХ РЕЗЕРВОВ ПАМЯТИ. Только замер, ничего не меняет.
//
// Считает ПОСЛЕ входа в игру (бут уже отработал) по четырём зонам:
//   (1) БУТ  0x0100..0x0322 — что исполняется/читается, что мертво;
//   (2) БУФЕРЫ 0xB000..0xBFFF — водяные знаки: самый низкий и самый высокий
//       реально тронутый адрес;
//   (3) НУЛЕВАЯ СТРАНИЦА 0x0000..0x00FF — кто читает, кто пишет (PC -> метка);
//   (4) СТЕК — минимальный SP за прогон (он же самый глубокий записанный байт).
//
// Классификация чтений: адрес внутри [PC, PC+len) текущей инструкции — это
// ВЫБОРКА КОДА, всё остальное — ЧТЕНИЕ ДАННЫХ. Длина инструкции берётся из
// таблицы i8080 (см. ILEN ниже), а не угадывается.
//
// Стековые обращения отделяются по флагу stackrq, который ядро i8080 передаёт
// в memory.read/write для push/pop/call/ret.
//
//   node tools/verify/reserves_census.js <rom> <sym1[,sym2]> [ticks] [level] [deepRow]
// Метки нужны ОБЕИХ половин: игровые (scubacod1.sym) и бутовые (scubacod0.sym),
// иначе PC в буте не к чему привязать. Перечислять через запятую.
// deepRow: если задан (1..15), КАЖДЫЙ ТИК принудительно ставится строка
// мини-карты L5B03+1 — приём из scratchpad/deep.js, без него автопилот стенда
// до глубоких сцен не доходит и глубокие ветки не мерятся ВООБЩЕ.
"use strict";
const { reachGame } = require("./drive.js");
const { readSym } = require("./harness.js");

const rom = process.argv[2], sym = process.argv[3];
const NT = parseInt(process.argv[4] || "3000", 10);
const LVL = parseInt(process.argv[5] || "4", 10);
const DEEP = process.argv[6] != null ? parseInt(process.argv[6], 10) : null;
if (!rom || !sym) { console.error("нужны rom и sym"); process.exit(2); }

// ---- длины инструкций i8080 ------------------------------------------------
const ILEN = new Uint8Array(256).fill(1);
for (const o of [0x01,0x11,0x21,0x31,0x22,0x2a,0x32,0x3a,
                 0xc3,0xcb,0xcd,0xdd,0xed,0xfd,
                 0xc2,0xca,0xd2,0xda,0xe2,0xea,0xf2,0xfa,
                 0xc4,0xcc,0xd4,0xdc,0xe4,0xec,0xf4,0xfc]) ILEN[o] = 3;
for (const o of [0x06,0x0e,0x16,0x1e,0x26,0x2e,0x36,0x3e,
                 0xc6,0xce,0xd6,0xde,0xe6,0xee,0xf6,0xfe,0xd3,0xdb]) ILEN[o] = 2;

const symList = sym.split(",");
const S = {};
for (const p of symList) Object.assign(S, readSym(p));
const labs = Object.entries(S).filter(([k, v]) => v >= 0 && v < 0x10000)
                   .sort((a, b) => a[1] - b[1]);
function lab(a) {
  let lo = 0, hi = labs.length - 1, x = null;
  while (lo <= hi) { const m = (lo + hi) >> 1;
    if (labs[m][1] <= a) { x = labs[m]; lo = m + 1; } else hi = m - 1; }
  if (!x) return "?";
  const d = a - x[1];
  return d ? `${x[0]}+${d}` : x[0];
}

// стенд ведёт игру по ИГРОВЫМ меткам — первым в списке обязан идти scubacod1.sym
const g = reachGame(rom, symList[0], { cpu: "i8080", level: LVL, seed: 0x0167 });
const m = g.m;

// ---- накопители ------------------------------------------------------------
const EXEC = new Uint8Array(0x10000);     // байт входит в исполненную инструкцию
const RDAT = new Uint32Array(0x10000);    // чтений как ДАННЫХ
const WDAT = new Uint32Array(0x10000);    // записей (не стековых)
const RSTK = new Uint32Array(0x10000);    // стековых чтений
const WSTK = new Uint32Array(0x10000);    // стековых записей
const who = new Map();                    // "R@addr"/"W@addr" -> Map(pcLabel -> n)
let minSp = 0x10000, minStkWrite = 0x10000;
let bufLo = 0x10000, bufHi = -1;
let on = false, curPc = 0, curLen = 1;
let instr = 0;

let curTick = 0;
const firstTick = new Map();              // "R@addr"/"W@addr" -> тик первого попадания
function note(kind, addr, pc) {
  if (addr > 0xff && !(addr >= 0xb000 && addr <= 0xbfff)) return; // атрибутируем только ZP и буферы
  const k = kind + "@" + addr;
  let mm = who.get(k); if (!mm) { mm = new Map(); who.set(k, mm); firstTick.set(k, curTick); }
  const L = lab(pc);
  mm.set(L, (mm.get(L) || 0) + 1);
}

const origRead = m.memory.read.bind(m.memory);
m.memory.read = (a, st) => {
  if (on) {
    const ad = a & 0xffff;
    const fetch = !st && ad >= curPc && ad < curPc + curLen;
    if (st) { RSTK[ad]++; }
    else if (!fetch) {
      RDAT[ad]++;
      if (ad <= 0xff || (ad >= 0xb000 && ad <= 0xbfff)) note("R", ad, curPc);
      if (ad >= 0xb000 && ad <= 0xbfff) { if (ad < bufLo) bufLo = ad; if (ad > bufHi) bufHi = ad; }
    }
  }
  return origRead(a, st);
};
// Сторож записи ставится обёрткой вокруг memory.write — как в harness.js,
// но harness уже подменил её своей (диспетчер onWrite), поэтому оборачиваем ТЕКУЩУЮ.
const origWrite = m.memory.write.bind(m.memory);
m.memory.write = (a, v, st) => {
  if (on) {
    const ad = a & 0xffff;
    if (st) { WSTK[ad]++; if (ad < minStkWrite) minStkWrite = ad; }
    else {
      WDAT[ad]++;
      if (ad <= 0xff || (ad >= 0xb000 && ad <= 0xbfff)) note("W", ad, curPc);
      if (ad >= 0xb000 && ad <= 0xbfff) { if (ad < bufLo) bufLo = ad; if (ad > bufHi) bufHi = ad; }
    }
  }
  return origWrite(a, v, st);
};

// диспетчер крючков стенда ОБОРАЧИВАЕМ, не подменяем
const origCb = m.v06c.check_breakpoint;
m.v06c.check_breakpoint = () => {
  const r = origCb();
  if (on) {
    const pc = m.cpu.pc & 0xffff;
    const op = origRead(pc, false) & 0xff;
    const len = ILEN[op];
    curPc = pc; curLen = len;
    for (let i = 0; i < len; i++) EXEC[(pc + i) & 0xffff] = 1;
    const sp = m.cpu.sp & 0xffff;
    if (sp < minSp) minSp = sp;
    instr++;
  }
  return r;
};

let ticks = 0;
m.onPc(S.LD9C0, () => { ticks++; curTick = ticks; if (DEEP != null) m.wr(S.L5B03 + 1, DEEP); });
// Конец партии и возврат в меню — ОБЯЗАТЕЛЬНАЯ фаза: именно там мог бы ожить
// распаковщик dzx0 (перерисовка титульной картинки) и палитра. Без этой фазы
// «dzx0 мёртв» было бы утверждением о неполной выборке.
let goReached = 0, menuReached = 0;
if (S.LEA7A != null) m.onPc(S.LEA7A, () => { goReached++; });
if (S.LEE2C != null) m.onPc(S.LEE2C, () => { menuReached++; });

// Скриптованный ввод: держим «разгон» (клавиша 38 = Up), иначе сцена статична.
m.key(38, true);
on = true;
const f0 = m.frame;
let guard = 0;
while (ticks < NT && guard < 4000000) { m.step(); guard++; }
m.key(38, false);
m.wr(S.OXYGEN, 0); m.wr(S.OXYGEN + 1, 0); m.wr(S.LIVES, 1);   // добить партию
for (let i = 0; i < 4000; i++) m.step();
on = false;
const frames = m.frame - f0;

// ---- вывод -----------------------------------------------------------------
function ranges(lo, hi, pred) {           // список непрерывных диапазонов, где pred(a)
  const out = []; let s = -1;
  for (let a = lo; a <= hi + 1; a++) {
    const p = a <= hi && pred(a);
    if (p && s < 0) s = a;
    if (!p && s >= 0) { out.push([s, a - 1]); s = -1; }
  }
  return out;
}
const hex = (a, n) => "0x" + a.toString(16).toUpperCase().padStart(n || 4, "0");

console.log(`=== ПЕРЕПИСЬ РЕЗЕРВОВ  rom=${rom}`);
console.log(`    уровень=${LVL} тиков=${ticks} кадров=${frames} инструкций=${instr}` +
            (DEEP != null ? `  строка мини-карты принудительно ${DEEP}` : "  (глубина НЕ форсирована)"));
console.log(`    фаза конца партии: ${goReached ? `достигнута (${goReached}), возвратов в меню ${menuReached}`
                                                : "НЕ ДОСТИГНУТА — выборка по этой фазе ПУСТА"}`);
if (ticks === 0) { console.log("ВЫБОРКА ПУСТА: ни одного игрового тика — замер недействителен"); process.exit(1); }

// (1) БУТ
const B0 = 0x0100, B1 = 0x0322;
const dead = ranges(B0, B1, a => !EXEC[a] && !RDAT[a] && !WDAT[a] && !RSTK[a] && !WSTK[a]);
const deadN = dead.reduce((s, [x, y]) => s + y - x + 1, 0);
console.log(`\n--- (1) БУТ ${hex(B0)}..${hex(B1)} (${B1 - B0 + 1} Б) ---`);
console.log(`    живых (исполнено/прочитано/записано): ${B1 - B0 + 1 - deadN} Б; мёртвых: ${deadN} Б`);
if (!dead.length) console.log("    МЁРТВЫХ ДИАПАЗОНОВ НЕТ — выборка не пуста, но кандидатов ноль");
for (const [x, y] of dead)
  console.log(`    МЁРТВО ${hex(x)}..${hex(y)}  ${String(y - x + 1).padStart(4)} Б  ${lab(x)} .. ${lab(y)}`);
const alive = ranges(B0, B1, a => EXEC[a] || RDAT[a] || WDAT[a]);
console.log("    живые диапазоны:");
for (const [x, y] of alive) {
  let e = 0, r = 0, w = 0;
  for (let a = x; a <= y; a++) { if (EXEC[a]) e++; r += RDAT[a]; w += WDAT[a]; }
  console.log(`      ${hex(x)}..${hex(y)} ${String(y - x + 1).padStart(4)} Б  исп.байт=${e} чт.данных=${r} зап=${w}  ${lab(x)}`);
}

// (2) БУФЕРЫ
console.log(`\n--- (2) БУФЕРЫ 0xB000..0xBFFF ---`);
if (bufHi < 0) {
  console.log("    ВЫБОРКА ПУСТА: ни одного обращения в 0xB000..0xBFFF за прогон");
} else {
  let touched = 0;
  for (let a = 0xb000; a <= 0xbfff; a++) if (RDAT[a] || WDAT[a]) touched++;
  console.log(`    водяные знаки: НИЖЕ всего ${hex(bufLo)}, ВЫШЕ всего ${hex(bufHi)}`);
  console.log(`    занятая протяжённость ${bufHi - bufLo + 1} Б, реально тронуто байт ${touched}`);
  console.log(`    ниже ${hex(bufLo)} не тронуто ничего => потолок кода можно поднять до ${hex(bufLo)} (+${bufLo - 0xb000} Б)`);
  const tr = ranges(0xb000, 0xbfff, a => RDAT[a] || WDAT[a]);
  for (const [x, y] of tr) console.log(`      тронуто ${hex(x)}..${hex(y)}  ${y - x + 1} Б`);
  const k = "W@" + bufLo, k2 = "R@" + bufLo;
  for (const kk of [k, k2]) if (who.has(kk))
    console.log(`      ${kk[0] === "W" ? "пишут" : "читают"} самый низкий ${hex(bufLo)}: ` +
      [...who.get(kk).entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([l, n]) => `${l}(${n})`).join(" "));
}

// (3) НУЛЕВАЯ СТРАНИЦА
console.log(`\n--- (3) НУЛЕВАЯ СТРАНИЦА 0x0000..0x00FF (без стековых обращений) ---`);
const zpUsed = ranges(0, 0xff, a => RDAT[a] || WDAT[a] || EXEC[a]);
if (!zpUsed.length) console.log("    нет НИ ОДНОГО неспекового обращения в нулевую страницу");
for (const [x, y] of zpUsed) {
  for (let a = x; a <= y; a++) {
    const parts = [];
    if (EXEC[a]) parts.push("ИСП");
    if (RDAT[a]) parts.push(`чт=${RDAT[a]} (1-й тик ${firstTick.get("R@" + a)}) <- ` + [...who.get("R@" + a).entries()].sort((p, q) => q[1] - p[1]).slice(0, 4).map(([l, n]) => `${l}(${n})`).join(","));
    if (WDAT[a]) parts.push(`зап=${WDAT[a]} (1-й тик ${firstTick.get("W@" + a)}) <- ` + [...who.get("W@" + a).entries()].sort((p, q) => q[1] - p[1]).slice(0, 4).map(([l, n]) => `${l}(${n})`).join(","));
    console.log(`    ${hex(a)}  ${parts.join("  ")}`);
  }
}
console.log("    RST-векторы (неспековые обращения):");
for (const v of [0x00, 0x08, 0x10, 0x18, 0x20, 0x28, 0x30, 0x38]) {
  const s = [];
  for (let a = v; a < v + 8; a++) {
    const tag = (EXEC[a] ? "E" : "") + (RDAT[a] ? "R" : "") + (WDAT[a] ? "W" : "") +
                (RSTK[a] || WSTK[a] ? "s" : "");
    s.push(tag || ".");
  }
  console.log(`      RST ${v >> 3} = ${hex(v)}: [${s.join(" ")}]  (E=исполнялось R=чтение данных W=запись s=стек)`);
}

// (4) СТЕК
console.log(`\n--- (4) СТЕК ---`);
console.log(`    минимальный SP за прогон: ${hex(minSp)}  (запас до 0x0000: ${minSp} Б)`);
console.log(`    самый глубокий байт, записанный стеком: ${hex(minStkWrite)}`);
const stkTouched = ranges(0, 0x1ff, a => RSTK[a] || WSTK[a]);
for (const [x, y] of stkTouched) console.log(`      стек трогал ${hex(x)}..${hex(y)}  ${y - x + 1} Б`);
if (!stkTouched.length) console.log("      ВЫБОРКА ПУСТА: стековых обращений не зафиксировано");
console.log(`    стек НИКОГДА не опускался ниже ${hex(minStkWrite)}; свободно снизу ${minStkWrite} Б`);
