// РАЗБОР ПЕРЕПИСИ: классификация каждого куска образа.
// Читает счётчики от tools/verify/mem_audit.js и листинг сборки. Ничего не гоняет.
//
// ПРАВИЛА ВЫВОДА (соблюдать буквально):
//   * «МЁРТВ» ставится ТОЛЬКО при двух признаках сразу: не исполнялся/не читался
//     ни в одной сцене спектра И статически недостижим (нет символической ссылки
//     из кода). Признаки печатаются РАЗДЕЛЬНО, чтобы «холодно» не читалось как
//     «мертво».
//   * Статический скан слов даёт ~67 % ложных совпадений в 44 КБ, поэтому им
//     можно только ОТВЕРГАТЬ («ссылка найдена — блок не мёртв»), но не
//     подтверждать. Помечено как «скан: чисто/грязно».
//   * Транспортные чтения (перенос образа бутом и dzx0) в живость не идут —
//     они дают чтение КАЖДОГО байта образа (см. шапку mem_audit.js).
//
//   node tools/verify/mem_audit_report.js [каталог_сборки] [counters.bin]
//   MR_ALL=1 — печатать все блоки, а не только мёртвые
"use strict";
const fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "../..");
const DIR = process.argv[2] || `${ROOT}/build/prod_hw`;
const CNT = process.argv[3] || `${ROOT}/build/audit/counters.bin`;
if (!fs.existsSync(CNT)) { console.log(`нет ${CNT} — сначала node tools/verify/mem_audit.js`); process.exit(2); }

const raw = fs.readFileSync(CNT);
const N = 0x10000;
const arr = i => { const a = new Uint32Array(N); for (let k = 0; k < N; k++) a[k] = raw.readUInt32LE((i * N + k) * 4); return a; };
const EXEC = arr(0), RDAT = arr(1), WDAT = arr(2), RSTK = arr(3), WSTK = arr(4),
      EXEC_PRE = arr(5), RDAT_PRE = arr(6), RDAT_MOVE = arr(7), WDAT_MOVE = arr(8);

function readSymFile(f) {
  const S = {};
  for (const l of fs.readFileSync(f, "latin1").split("\n")) {
    const m = /^(\S+?):?\s+EQU\s+(?:0x)?([0-9A-Fa-f]+)/.exec(l);
    if (m) S[m[1]] = parseInt(m[2], 16);
  }
  return S;
}
const S = Object.assign({}, readSymFile(`${DIR}/scubacod0.sym`), readSymFile(`${DIR}/scubacod1.sym`));
const cod1 = fs.readFileSync(`${DIR}/scubacod1.bin`);
const cod0 = fs.readFileSync(`${DIR}/scubacod0.bin`);
const COD1_LO = S.SCUBACOD0_END, COD1_HI = S.SCUBAZONE_END;
const img = new Uint8Array(N);                 // образ в памяти после распаковки
for (let i = 0; i < cod0.length; i++) img[0x100 + i] = cod0[i];
for (let i = 0; i < cod1.length; i++) img[COD1_LO + i] = cod1[i];

// ---- разбор листинга: где инструкции, где директивы данных ------------------
const insnLen = new Map();            // addr -> длина инструкции по листингу
const isData = new Uint8Array(N);     // байт объявлен директивой данных
const emitted = new Uint8Array(N);    // байт вообще выпущен ассемблером
for (const f of ["scubacod0.lst", "scubacod1.lst"]) {
  const lines = fs.readFileSync(`${DIR}/${f}`, "latin1").split("\n");
  for (const line of lines) {
    const m = /^\s*\d+[+]*\s*([0-9A-F]{4})\s+((?:[0-9A-F]{2} )*[0-9A-F]{2})(?:\s|\.|$)/.exec(line);
    if (!m) continue;
    const a = parseInt(m[1], 16), n = m[2].trim().split(/\s+/).length;
    const dat = /\b(DEFB|DEFW|DEFM|DEFS|DB|DW|DS|ABYTE|BYTE)\b/i.test(line);
    for (let i = 0; i < n; i++) { emitted[(a + i) & 0xffff] = 1; if (dat) isData[(a + i) & 0xffff] = 1; }
    if (!dat && !insnLen.has(a)) insnLen.set(a, n);
  }
}

// ---- блоки: между соседними метками .sym -----------------------------------
const labs = Object.entries(S)
  .filter(([k, v]) => v >= 0x100 && v < COD1_HI && !/^(CHEAT_|TILE_|SCUBAZONE_N|.*_HI$|.*_EQU$)/.test(k))
  .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
const blocks = [];
for (let i = 0; i < labs.length; i++) {
  const [name, a] = labs[i];
  let end = i + 1 < labs.length ? labs[i + 1][1] : COD1_HI;
  if (end <= a) continue;                        // совпавшие метки
  if (a >= 0x327 && a < COD1_LO) continue;       // мусорные EQU-константы
  blocks.push({ name, a, end, size: end - a });
}

// ---- статический скан ссылок (только ОТВЕРГАТЬ) ----------------------------
// Слово-адрес блока где-нибудь в образе. Совпадение НЕ доказывает ссылку —
// в 44 КБ случайное совпадение двухбайтового слова вероятно (~67 % по замеру
// раздела «фильтр адресов-значений» exec_census.js). Годится ровно на одно:
// снять подозрение с блока, у которого ссылка ЕСТЬ.
const wordSeen = new Set();
for (let a = COD1_LO; a < COD1_HI - 1; a++) wordSeen.add(img[a] | (img[a + 1] << 8));
for (let a = 0x100; a < 0x327 - 1; a++) wordSeen.add(img[a] | (img[a + 1] << 8));

// ---- имена кусков из исходника ---------------------------------------------
// Метка .sym говорит «L6A26», а владельцу нужно «спрайт акулы». Имя берётся из
// исходника: собственный комментарий строки метки, а если его нет — ближайший
// заголовок-комментарий выше (`; Shark sprites; width 7 height 3 chars`).
const NAME = new Map();
for (const f of ["scubasprt.asm", "scubacodb.asm", "scubacodc.asm", "scubacoda.asm",
                 "scubai80.asm", "scubadivr.asm", "scubarelb.asm", "scubarelf.asm",
                 "scubammap.asm", "scubazone.asm", "scubasymb.asm", "scubacod1.asm",
                 "scubacod0.asm"]) {
  const p = `${ROOT}/src8080/${f}`;
  if (!fs.existsSync(p)) continue;
  let head = "";
  for (const l of fs.readFileSync(p, "utf8").split("\n")) {
    const hm = /^;\s*(.+?)\s*$/.exec(l);
    if (hm) { if (hm[1].length > 3 && !/^-+$/.test(hm[1])) head = hm[1]; continue; }
    const lm = /^([A-Za-z_][A-Za-z0-9_]*)\b/.exec(l);
    if (!lm) continue;
    const own = (/;\s*(.+?)\s*$/.exec(l) || [])[1];
    NAME.set(lm[1], { file: f, head, own: own || "" });
  }
}
const nameOf = b => {
  const n = NAME.get(b.name);
  if (!n) return "";
  return (n.own || n.head || "").slice(0, 52) + "  [" + n.file.replace("scuba", "").replace(".asm", "") + "]";
};

const hx = a => "0x" + a.toString(16).toUpperCase().padStart(4, "0");
const sum = (A, a, b) => { let s = 0; for (let i = a; i < b; i++) s += A[i]; return s; };
const cnt = (A, a, b) => { let s = 0; for (let i = a; i < b; i++) if (A[i]) s++; return s; };

for (const b of blocks) {
  b.execB = cnt(EXEC, b.a, b.end);
  b.preB  = cnt(EXEC_PRE, b.a, b.end);
  b.rd    = sum(RDAT, b.a, b.end);
  b.rdPre = sum(RDAT_PRE, b.a, b.end);
  b.wr    = sum(WDAT, b.a, b.end);
  b.move  = sum(RDAT_MOVE, b.a, b.end);
  b.dataB = cnt(isData, b.a, b.end);
  b.kind  = b.dataB > b.size / 2 ? "данные" : (b.execB || insnLen.has(b.a) ? "код" : "?");
  b.ref   = wordSeen.has(b.a);
  b.live  = b.execB > 0 || b.rd > 0 || b.wr > 0;
  b.dead  = !b.live && !b.ref;                   // ОБА признака
}

// ---- МАССИВЫ: единица, о которой можно говорить «мусор» ---------------------
// Отдельный кадр анимации НЕЛЬЗЯ объявлять мёртвым по непопаданию в спектр.
// Кадры адресуются АРИФМЕТИКОЙ ОТ БАЗЫ (класс связей №5, уроки №13 и №22):
// имени у кадра нет ни в одной ссылке, а адрес считается как база + номер*шаг.
// Первый разбор именно так и выдал «мёртвыми» 24 кадра рыб, кальмаров и змеек
// вперемешку с живыми соседями — вывод, опровергаемый одним взглядом на то, что
// соседний кадр того же существа живёхонек.
// Поэтому единица классификации — МАССИВ: подряд идущие блоки одного файла под
// одним заголовком-комментарием исходника («; Fish sprites; width 6 height 3»).
// Массив мёртв, только если НИ ОДИН его блок не тронут за весь спектр.
const arrays = [];
{
  const byAddr = blocks.slice().sort((x, y) => x.a - y.a);
  for (const b of byAddr) {
    const n = NAME.get(b.name) || { file: "?", head: "" };
    const last = arrays[arrays.length - 1];
    if (last && last.file === n.file && last.head === n.head && last.end === b.a) {
      last.end = b.end; last.parts.push(b);
    } else arrays.push({ file: n.file, head: n.head, a: b.a, end: b.end, parts: [b] });
  }
  for (const g of arrays) {
    g.size = g.end - g.a;
    g.live = g.parts.some(b => b.live);
    g.ref  = g.parts.some(b => b.ref);
    g.dead = !g.live && !g.ref;
    g.coldFrames = g.parts.filter(b => !b.live).reduce((s, b) => s + b.size, 0);
    g.kind = g.parts[0].kind;
  }
}
const deadArr = arrays.filter(g => g.dead).sort((x, y) => y.size - x.size);
const coldArr = arrays.filter(g => !g.live && g.ref).sort((x, y) => y.size - x.size);
const partial = arrays.filter(g => g.live && g.coldFrames > 0).sort((x, y) => y.coldFrames - x.coldFrames);

const dead = blocks.filter(b => b.dead).sort((x, y) => y.size - x.size);
const cold = blocks.filter(b => !b.live && b.ref).sort((x, y) => y.size - x.size);
const deadSz = dead.reduce((s, b) => s + b.size, 0);
const coldSz = cold.reduce((s, b) => s + b.size, 0);

console.log(`ПЕРЕПИСЬ: ${CNT}`);
console.log(`блоков (по меткам .sym) ${blocks.length}; живых ${blocks.filter(b => b.live).length}`);
console.log(`МЁРТВЫЕ (не тронуты НИ РАЗУ и скан ссылок чист): ${dead.length} блоков, ${deadSz} Б`);
console.log(`ХОЛОДНЫЕ (не тронуты, но скан ссылок ГРЯЗЕН — вина не доказана): ${cold.length} блоков, ${coldSz} Б`);
console.log("");
console.log("--- МЁРТВЫЕ МАССИВЫ (ни один блок не тронут, ссылок на массив нет) ---");
console.log(`  всего ${deadArr.length}, ${deadArr.reduce((s, g) => s + g.size, 0)} Б`);
for (const g of deadArr.slice(0, 40))
  console.log(`  ${hx(g.a)}..${hx(g.end)} ${String(g.size).padStart(5)} Б  ${g.kind.padEnd(6)} ` +
              `${g.parts.length} блок(ов)  ${(g.head || g.parts[0].name).slice(0, 60)} [${g.file}]`);
console.log("");
console.log("--- ХОЛОДНЫЕ МАССИВЫ (не тронуты, но скан ссылок грязен) ---");
console.log(`  всего ${coldArr.length}, ${coldArr.reduce((s, g) => s + g.size, 0)} Б`);
for (const g of coldArr.slice(0, 25))
  console.log(`  ${hx(g.a)}..${hx(g.end)} ${String(g.size).padStart(5)} Б  ${g.kind.padEnd(6)} ` +
              `${(g.head || g.parts[0].name).slice(0, 60)} [${g.file}]`);
console.log("");
console.log("--- ЖИВЫЕ МАССИВЫ С НЕПОКРЫТЫМИ КУСКАМИ (это НЕ мусор: непокрытие спектром) ---");
console.log(`  всего ${partial.length} массивов, непокрыто ${partial.reduce((s, g) => s + g.coldFrames, 0)} Б`);
for (const g of partial.slice(0, 15))
  console.log(`  ${hx(g.a)} ${String(g.size).padStart(5)} Б, непокрыто ${String(g.coldFrames).padStart(5)} Б  ` +
              `${(g.head || g.parts[0].name).slice(0, 58)} [${g.file}]`);
console.log("");
console.log("--- МЁРТВЫЕ ОТДЕЛЬНЫЕ БЛОКИ (справочно; кадры массивов сюда попадать не должны) ---");
console.log("  адрес   размер  вид     имя");
for (const b of dead.slice(0, 60))
  console.log(`  ${hx(b.a)}  ${String(b.size).padStart(5)}  ${b.kind.padEnd(6)}  ${b.name.padEnd(14)} ${nameOf(b)}`);
console.log("");
console.log("--- ХОЛОДНЫЕ, топ-30 (нужна отдельная проверка ссылки) ---");
for (const b of cold.slice(0, 30))
  console.log(`  ${hx(b.a)}  ${String(b.size).padStart(5)}  ${b.kind.padEnd(6)}  ${b.name.padEnd(14)} ${nameOf(b)}`);

// ---- по секциям ------------------------------------------------------------
const SECT = [
  ["бут (блок 0)",              0x100, S.SCUBACOD0_END],
  ["старт cod1 / строки меню",  COD1_LO, S.ROM_CHARSET],
  ["шрифт ROM_CHARSET",         S.ROM_CHARSET, S.ROM_CHARSET_END],
  ["переменные игры",           S.ROM_CHARSET_END, S.MiniMap],
  ["MiniMap",                   S.MiniMap, S.SCRATTR],
  ["SCRATTR",                   S.SCRATTR, 0x1000],
  ["спрайты и таблицы",         0x1000, 0x7E6B],
  ["код игры",                  0x7E6B, S.SCUBAPANL_ZX0],
  ["поток панели ZX0",          S.SCUBAPANL_ZX0, S.SCUBACOD1_ENDA],
  ["библиотека рекомпиляции",   S.SCUBACOD1_ENDA, S.SCUBACOD1_END],
  ["ZoneCopy",                  S.SCUBACOD1_END, S.SCUBARELF_SRC],
  ["источник рельефа",          S.SCUBARELF_SRC, S.SCUBARELF_END],
  ["источник кадров дайвера",   S.SCUBADIVR_SRC, S.SCUBADIVR_END],
  ["источник ломтя зоны",       S.SCUBAZONE_SRC, S.SCUBAZONE_END],
];
console.log("");
console.log("--- ПО СЕКЦИЯМ: живо / нетронуто ---");
console.log("  секция                        размер   исполн.  чит.байт  зап.байт  НЕТРОНУТО");
for (const [nm, a, b] of SECT) {
  if (a == null || b == null) continue;
  let e = 0, r = 0, w = 0, untouched = 0;
  for (let x = a; x < b; x++) {
    if (EXEC[x]) e++;
    if (RDAT[x]) r++;
    if (WDAT[x]) w++;
    if (!EXEC[x] && !RDAT[x] && !WDAT[x]) untouched++;
  }
  console.log(`  ${nm.padEnd(28)} ${String(b - a).padStart(6)}  ${String(e).padStart(7)}  ` +
              `${String(r).padStart(8)}  ${String(w).padStart(8)}  ${String(untouched).padStart(8)}`);
}

// ---- дубликаты байт в байт --------------------------------------------------
// Ищем повторяющиеся куски внутри образа в памяти: окно хешируется, совпадение
// проверяется побайтно и жадно расширяется в обе стороны.
// ФИЛЬТР ОДНООБРАЗИЯ ОБЯЗАТЕЛЕН. Без него первый разбор объявил «содержательным
// дубликатом» 419 байт мини-карты, совпавших с началом рельефа: там 64 нуля,
// потом длинный ряд единиц — всего ДВА разных значения на 419 байт. Такое
// совпадение не значит ничего (и ZX0 давит его почти в ноль), поэтому кусок
// засчитывается дубликатом, только если в нём не меньше MINVAL разных байт и ни
// одно значение не занимает больше 70 %.
const MINDUP = +(process.env.MR_MINDUP || 64);
const MINVAL = +(process.env.MR_MINVAL || 8);
{
  const varied = (p, n) => {
    const h = new Map();
    for (let i = 0; i < n; i++) h.set(img[p + i], (h.get(img[p + i]) || 0) + 1);
    if (h.size < MINVAL) return false;
    let mx = 0; for (const v of h.values()) if (v > mx) mx = v;
    return mx <= n * 0.7;
  };
  const seen = new Map();
  const found = [];
  const taken = new Uint8Array(N);
  for (let a = 0x100; a + MINDUP <= COD1_HI; a++) {
    if (!emitted[a]) continue;
    const k = Buffer.from(img.subarray(a, a + MINDUP)).toString("latin1");
    if (!seen.has(k)) { seen.set(k, a); continue; }
    if (taken[a]) continue;
    const p = seen.get(k);
    let n = MINDUP;
    while (a + n < COD1_HI && img[p + n] === img[a + n]) n++;
    if (!varied(p, n)) continue;
    for (let i = 0; i < n; i++) taken[a + i] = 1;
    found.push([p, a, n]);
  }
  found.sort((x, y) => y[2] - x[2]);
  console.log("");
  console.log(`--- ДУБЛИКАТЫ БАЙТ В БАЙТ (>= ${MINDUP} Б, не меньше ${MINVAL} разных значений) ---`);
  if (!found.length) console.log("  нет ни одного");
  let dupTot = 0;
  for (const [p, q, n] of found.slice(0, 25)) { dupTot += n; console.log(`  ${hx(p)} == ${hx(q)}  ${n} Б`); }
  console.log(`  всего дубликатов ${found.length}, суммарно ${found.reduce((s, x) => s + x[2], 0)} Б`);
}

// ---- зона VRAM --------------------------------------------------------------
// Ломоть = младшие 192..255 страницы-столбца. Свободные ломти считаются по
// раскладке, а не по записям: ломоть, в который никто не пишет, всё равно занят,
// если в нём лежат разложенные данные.
{
  const R = S.RELIEF_HI, A = S.DIVER_A, Bb = S.DIVER_B, D0 = S.ZN_DATA0, PH = S.POOL_HI;
  const own = new Map();
  for (let p = PH; p <= PH + 15; p++) own.set(p, "буфер пула (страница целиком)");
  for (let p = A; p < A + 16; p++) own.set(p, "кадры дайвера, ряд A");
  for (let p = Bb; p < Bb + 16; p++) own.set(p, "кадры дайвера, ряд B");
  for (let p = R; p <= 0xff; p++) own.set(p, "рельеф");
  const zn = S.SCUBAZONE_N != null ? S.SCUBAZONE_N : 1;
  for (let p = D0; p < D0 + zn; p++) own.set(p, "ломоть данных (SprExplosion)");
  console.log("");
  console.log("--- ЗОНА VRAM: страницы-столбцы 0xB0..0xFF (по 64 Б ломтя каждая) ---");
  let free = [], used = new Map();
  for (let p = 0xb0; p <= 0xff; p++) {
    const o = own.get(p);
    if (o) used.set(o, (used.get(o) || 0) + 1); else free.push(p);
  }
  for (const [k, v] of used) console.log(`  ${k.padEnd(32)} ${v} страниц = ${v * 64} Б ломтей`);
  console.log(`  СВОБОДНО ${free.length} страниц = ${free.length * 64} Б`);
  const rr = [];
  for (const p of free) { const l = rr[rr.length - 1]; if (l && l[1] + 1 === p) l[1] = p; else rr.push([p, p]); }
  console.log(`  свободные диапазоны: ${rr.map(([x, y]) => x === y ? hx(x * 256 + 192)
                : `${hx(x * 256 + 192)}..${hx(y * 256 + 192)}`).join(", ")}`);
  // и отдельно — сколько байт в этих ломтях реально трогали за спектр
  let touched = 0;
  for (const p of free) for (let l = 192; l < 256; l++) if (WDAT[p * 256 + l]) touched++;
  console.log(`  из свободных ломтей чужие записи задели ${touched} Б за весь спектр`);
}
