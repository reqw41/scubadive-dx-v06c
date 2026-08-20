// ИМЕНОВАННАЯ ПЕРЕПИСЬ ГРАФИКИ: что лежит в 0x1000..0x7E6B и зачем.
// ТОЛЬКО ЗАМЕР И РАЗБОР. Ничего не правит.
//
// Строка отчёта — НАБОР (заголовок-комментарий исходника), а не отдельный кадр:
// кадр адресуется арифметикой от базы, собственной ссылки у него нет, и судить
// его отдельно нельзя (уроки №13 и №22).
//
// ЧТО СЧИТАЕТСЯ:
//   * имя — из комментария-заголовка исходника и из таблицы наборов существ
//     (`DEFW L8133,L8012,... ; Snake fish vertical`), то есть из дизасма автора;
//   * геометрия — по расстоянию между метками внутри набора;
//   * чтения — из счётчиков переписи (tools/verify/mem_audit.js), если они есть;
//   * ДУБЛИКАТЫ — полное совпадение кадров байт в байт;
//   * ЗЕРКАЛА — совпадение кадра с преобразованием другого: отражение по
//     горизонтали (реверс битов в байте + реверс байтов в строке) и по вертикали
//     (реверс порядка строк). Повороты автор делал офлайн (SpriteRotate), и если
//     кадр оказался отражением соседа, его можно не хранить;
//   * ПУСТЫЕ кадры и доля нулей.
//
// ОГОВОРКА ПРО ЗЕРКАЛА. Совпадение проверяется на ЦЕЛЫХ кадрах при ПРЕДПОЛОЖЕНИИ
// о ширине строки в байтах. Ширина берётся из комментария автора, а если его нет
// — перебираются все делители размера кадра. Поэтому «зеркал не найдено» здесь
// значит «не найдено при переборе ширин», а не «их нет».
//
//   node tools/verify/gfx_inventory.js [каталог] [counters.bin]
"use strict";
const fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "../..");
const DIR = process.argv[2] || `${ROOT}/build/audit`;
const CNT = process.argv[3] || `${ROOT}/build/audit/counters.bin`;

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
const LO = S.SCUBACOD0_END;
const byteAt = a => cod1[a - LO];
const bytes = (a, n) => cod1.subarray(a - LO, a - LO + n);

// --- счётчики чтений (необязательны) -----------------------------------------
let RDAT = null;
if (fs.existsSync(CNT) && fs.statSync(CNT).size >= 0x10000 * 4 * 2) {
  const raw = fs.readFileSync(CNT);
  RDAT = new Uint32Array(0x10000);
  for (let k = 0; k < 0x10000; k++) RDAT[k] = raw.readUInt32LE((1 * 0x10000 + k) * 4);
}

// --- разбор исходника: заголовки наборов и метки с подписями ------------------
const src = fs.readFileSync(`${ROOT}/src8080/scubasprt.asm`, "utf8").split("\n");
const codb = fs.readFileSync(`${ROOT}/src8080/scubacodb.asm`, "utf8").split("\n");

const sets = [];                      // {head, labels:[{name,own}]}
{
  let head = "без заголовка", cur = null;
  for (const l of src) {
    const hm = /^;\s*(.+?)\s*$/.exec(l);
    if (hm) { if (hm[1].length > 5) { head = hm[1]; cur = null; } continue; }
    const lm = /^(L[0-9A-Fa-f]{4}|Spr[A-Za-z0-9_]*)\b/.exec(l);
    if (!lm || S[lm[1]] == null) continue;
    const own = (/;\s*(.+?)\s*$/.exec(l) || [])[1] || "";
    if (!cur || cur.head !== head) { cur = { head, labels: [] }; sets.push(cur); }
    cur.labels.push({ name: lm[1], own, a: S[lm[1]] });
  }
}
// принадлежность набора существу — из таблицы наборов (там человеческие имена)
const OWNER = new Map();
for (const l of codb) {
  const m = l.match(/^\s*DEFW\s+((?:L[0-9A-Fa-f]{4}\s*,\s*)+L[0-9A-Fa-f]{4})\s*;\s*(.+?)\s*$/);
  if (!m) continue;
  const ls = m[1].split(/\s*,\s*/);
  if (ls.length !== 4 && ls.length !== 6) continue;
  for (const n of ls) if (S[n] != null) OWNER.set(S[n], m[2]);
}

// --- границы кадров: следующая метка .sym ------------------------------------
const addrs = [...new Set(Object.values(S))].sort((a, b) => a - b);
const nextAddr = a => { let lo = 0, hi = addrs.length - 1, r = null;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (addrs[m] > a) { r = addrs[m]; hi = m - 1; } else lo = m + 1; }
  return r; };

// --- преобразования кадра -----------------------------------------------------
const REV = new Uint8Array(256);
for (let i = 0; i < 256; i++) { let v = 0; for (let b = 0; b < 8; b++) if (i & (1 << b)) v |= 128 >> b; REV[i] = v; }
function flipH(buf, w) {                     // отражение по горизонтали
  const out = Buffer.alloc(buf.length);
  for (let r = 0; r * w < buf.length; r++)
    for (let c = 0; c < w; c++) out[r * w + c] = REV[buf[r * w + (w - 1 - c)]];
  return out;
}
function flipV(buf, w) {                     // отражение по вертикали
  const out = Buffer.alloc(buf.length);
  const rows = buf.length / w;
  for (let r = 0; r < rows; r++) buf.copy(out, (rows - 1 - r) * w, r * w, r * w + w);
  return out;
}
const divisors = n => { const d = []; for (let i = 1; i <= 8; i++) if (n % i === 0) d.push(i); return d; };

// --- сборка отчёта ------------------------------------------------------------
const rows = [];
for (const st of sets) {
  const a0 = st.labels[0].a;
  const last = st.labels[st.labels.length - 1];
  const end = nextAddr(last.a) || (last.a + 8);
  const size = end - a0;
  if (size <= 0 || a0 < 0x1000 || a0 > 0x7E6B) continue;
  let reads = 0, zeroB = 0;
  for (let x = a0; x < end; x++) { if (RDAT) reads += RDAT[x]; if (byteAt(x) === 0) zeroB++; }
  const frames = st.labels.map((l, i) => {
    const e = i + 1 < st.labels.length ? st.labels[i + 1].a : end;
    return { name: l.name, own: l.own, a: l.a, size: e - l.a };
  });
  rows.push({ head: st.head, owner: OWNER.get(a0) || "", a0, end, size, frames, reads, zeroB });
}

const hx = a => "0x" + a.toString(16).toUpperCase().padStart(4, "0");
console.log(`ПЕРЕПИСЬ ГРАФИКИ: ${DIR}` + (RDAT ? "  (с чтениями из counters.bin)" : "  (БЕЗ чтений: counters.bin нет)"));
console.log("");
console.log("  адрес   размер кадров  Б/кадр  нулей  чтений    имя");
let tot = 0, totDead = 0;
for (const r of rows) {
  tot += r.size;
  const per = r.frames.length ? Math.round(r.size / r.frames.length) : 0;
  console.log(`  ${hx(r.a0)} ${String(r.size).padStart(6)} ${String(r.frames.length).padStart(6)} ` +
              `${String(per).padStart(7)} ${String(Math.round(100 * r.zeroB / r.size)).padStart(4)}% ` +
              `${String(r.reads).padStart(8)}   ${(r.owner ? r.owner + " / " : "") + r.head}`);
  if (RDAT && r.reads === 0) totDead += r.size;
}
console.log(`  ВСЕГО в наборах ${tot} Б` + (RDAT ? `; наборов с НУЛЁМ чтений: ${totDead} Б` : ""));

// --- дубликаты и зеркала между кадрами ---------------------------------------
const all = [];
for (const r of rows) for (const f of r.frames)
  if (f.size >= 16 && f.size <= 256) all.push({ ...f, set: r.owner || r.head });
const key = f => bytes(f.a, f.size).toString("latin1");
const seen = new Map(), dups = [];
for (const f of all) {
  const k = f.size + ":" + key(f);
  if (seen.has(k)) dups.push([seen.get(k), f]); else seen.set(k, f);
}
console.log("");
console.log(`--- ДУБЛИКАТЫ КАДРОВ БАЙТ В БАЙТ: ${dups.length} пар, ${dups.reduce((s, d) => s + d[1].size, 0)} Б ---`);
for (const [a, b] of dups.slice(0, 20))
  console.log(`  ${hx(b.a)} (${b.own || b.name}, ${b.set}) == ${hx(a.a)} (${a.own || a.name}) — ${b.size} Б`);

let mirrors = 0, mirrorB = 0;
const shown = [];
for (let i = 0; i < all.length; i++) {
  const f = all[i], bf = bytes(f.a, f.size);
  if (bf.every(x => x === 0)) continue;
  for (const w of divisors(f.size)) {
    if (f.size / w < 4) continue;
    const h = flipH(bf, w).toString("latin1"), v = flipV(bf, w).toString("latin1");
    const kh = seen.get(f.size + ":" + h), kv = seen.get(f.size + ":" + v);
    // ПАРУ СЧИТАЕМ ОДИН РАЗ. Отражение симметрично: если A — зеркало B, то и B —
    // зеркало A, и наивный счётчик даёт ровно вдвое больше (первый заход выдал
    // 98 кадров и 5024 Б там, где хранить не надо только половину). Оставляем
    // тот кадр, что лежит НИЖЕ, второй объявляем возвратным.
    if (kh && kh.a < f.a) { mirrors++; mirrorB += f.size;
      if (shown.length < 20) shown.push(`  ${hx(f.a)} (${f.own || f.name}) = ГОРИЗОНТАЛЬНОЕ отражение ${hx(kh.a)} (${kh.own || kh.name}) при ширине ${w} Б`); break; }
    if (kv && kv.a < f.a) { mirrors++; mirrorB += f.size;
      if (shown.length < 20) shown.push(`  ${hx(f.a)} (${f.own || f.name}) = ВЕРТИКАЛЬНОЕ отражение ${hx(kv.a)} (${kv.own || kv.name}) при ширине ${w} Б`); break; }
  }
}
console.log("");
console.log(`--- ЗЕРКАЛА: ${mirrors} кадров, ${mirrorB} Б ---`);
for (const l of shown) console.log(l);
if (!mirrors) console.log("  ни одного при переборе ширин 1..8 Б — повороты автора не сводятся к отражению");

// --- пустые кадры -------------------------------------------------------------
const empties = all.filter(f => bytes(f.a, f.size).every(x => x === 0));
console.log("");
console.log(`--- ПУСТЫЕ КАДРЫ (все байты нулевые): ${empties.length}, ${empties.reduce((s, f) => s + f.size, 0)} Б ---`);
for (const f of empties.slice(0, 12)) console.log(`  ${hx(f.a)} ${f.own || f.name} — ${f.size} Б`);

// --- эскиз кадра --------------------------------------------------------------
// Печатает картинку по указанным адресу/ширине/высоте: единственный честный
// способ назвать безымянный набор.
if (process.env.GFX_DRAW) {
  const [aS, wS, hS] = process.env.GFX_DRAW.split(",");
  const a = parseInt(aS, 16), w = +wS, h = +hS;
  console.log("");
  console.log(`--- ЭСКИЗ ${hx(a)}, ширина ${w} Б, высота ${h} строк ---`);
  for (let r = 0; r < h; r++) {
    let s = "  ";
    for (let c = 0; c < w; c++) {
      const b = byteAt(a + r * w + c);
      for (let k = 7; k >= 0; k--) s += (b >> k) & 1 ? "#" : ".";
    }
    console.log(s);
  }
}
