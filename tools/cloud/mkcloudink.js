// ГЕНЕРАТОР РАСКРАСКИ ОБЛАКА РЫБ -> src8080/scubacloud.asm.
//
// Зачем офлайн. Разложить кадр на отдельных рыбок (связные группы пикселей) и
// раздать им чернила — работа для инструмента, а не для игры: на i8080 её негде
// и некогда делать. Игре достаются готовые маски.
//
// ЧТО СЧИТАЕТСЯ ОДНОЙ РЫБКОЙ: связная группа пикселей (8-связность) внутри
// кадра 24x24. В восьми кадрах облака их 116.
//
// ЦВЕТ ОСОБИ ДЕРЖИТСЯ МЕЖДУ ФАЗАМИ ВЗМАХА. Кадры набора — одна и та же стайка в
// движении; если раздавать чернила в каждом кадре заново, рыбки замигают всеми
// тремя цветами по три раза в секунду. Поэтому цвета назначаются в ПЕРВОМ кадре
// набора, а в остальных каждая рыбка наследует цвет ближайшей по центру и
// размеру особи опорного кадра.
//
// ФОРМАТ ВЫХОДНЫХ ДАННЫХ — упакованные маски. Кадр 24x24 = 72 байта; хранить
// две маски целиком (в первую плоскость и во вторую) стоило бы +576 байт, а под
// потолком 0xA000 их нет. Пустых строк в маске больше половины, поэтому:
//     3 байта  — битовая карта непустых строк (строка r -> бит r&7 байта r>>3)
//     далее    — по 3 байта на каждую непустую строку, сверху вниз
// Итог: +168 байт против нынешних кадров вместо +576.
//
//   node tools/cloud/mkcloudink.js [каталог_сборки] [выходной .asm]
"use strict";
const fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "../..");
const DIR = process.argv[2] || `${ROOT}/build/reddet`;
const OUT = process.argv[3] || `${ROOT}/src8080/scubacloud.asm`;

const S = {};
for (const f of ["scubacod0.sym", "scubacod1.sym"])
  for (const l of fs.readFileSync(`${DIR}/${f}`, "latin1").split("\n")) {
    const m = /^(\S+?):?\s+EQU\s+(?:0x)?([0-9A-Fa-f]+)/.exec(l);
    if (m) S[m[1]] = parseInt(m[2], 16);
  }
const bin = fs.readFileSync(`${DIR}/scubacod1.bin`);
const LO = S.SCUBACOD0_END;
const at = a => bin[a - LO];

const W = 3, ROWS = 24;
// Наборы кадров облака — из дескриптора LC132 (DEFW L7748,L7869,L7942,L7821).
// Длина набора — до байта $FF за последним кадром, как их читает сама игра.
const SETS = [["L7748", 3], ["L7869", 3], ["L7821", 1], ["L7942", 1]];

const grid = a => {
  const g = [];
  for (let r = 0; r < ROWS; r++) { g.push([]);
    for (let c = 0; c < W; c++) { const v = at(a + r * W + c);
      for (let b = 7; b >= 0; b--) g[r].push((v >> b) & 1); } }
  return g;
};
// правка формы: сплошной блок 4x2 -> силуэт рыбки. Возвращает список снятых точек.
function fixBlocks(g, tag, log) {
  for (const c of comps(g)) {
    const r0 = Math.min(...c.px.map(p => p[0])), r1 = Math.max(...c.px.map(p => p[0]));
    const x0 = Math.min(...c.px.map(p => p[1])), x1 = Math.max(...c.px.map(p => p[1]));
    if (r1 - r0 !== 1 || x1 - x0 !== 3 || c.px.length !== 8) continue;
    for (const [dr, dx] of BLOCK_FIX) {
      g[r0 + dr][x0 + dx] = 0;
      log.push({ tag, r: r0 + dr, x: x0 + dx });
    }
  }
}
function comps(g) {
  const lab = g.map(r => r.map(() => 0)); const out = [];
  for (let r = 0; r < ROWS; r++) for (let x = 0; x < W * 8; x++) {
    if (!g[r][x] || lab[r][x]) continue;
    const st = [[r, x]]; lab[r][x] = 1; const px = [];
    while (st.length) { const [y, z] = st.pop(); px.push([y, z]);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const ny = y + dy, nx = z + dx;
        if (ny < 0 || ny >= ROWS || nx < 0 || nx >= W * 8) continue;
        if (g[ny][nx] && !lab[ny][nx]) { lab[ny][nx] = 1; st.push([ny, nx]); } } }
    out.push({ px, n: px.length,
               cy: px.reduce((s, p) => s + p[0], 0) / px.length,
               cx: px.reduce((s, p) => s + p[1], 0) / px.length });
  }
  return out;
}

// СПЛОШНОЙ БЛОК 4x2 ПОЛУЧАЕТ СИЛУЭТ. В стайке шесть таких на восемь кадров: у
// автора это прямоугольник в восемь пикселей, и пока вся стая была одного цвета,
// он читался как рябь. В своём черниле он читается как кирпич. Два пикселя из
// восьми снимаются, и остаётся профиль рыбки — хвост слева, тело справа, как у
// крупных особей этого же кадра (они плывут вправо).
// ЭТО ОТСТУПЛЕНИЕ ОТ РИСУНКА АВТОРА, второе после выравнивания зеркал. Все
// изменённые пиксели печатаются поимённо и лежат в docs/art_changes.md.
const BLOCK_FIX = [[0, 1], [1, 0]];    // что снять из блока 4x2

// ЧЕРНИЛО ДАЮТ ТОЛЬКО ОСОБЯМ С СИЛУЭТОМ. Из 116 групп пикселей в восьми кадрах
// у 79 силуэта нет вовсе: точка, две точки, чёрточка в три пикселя — дальняя
// мелочь. Рыбку в двух пикселях не нарисовать, а в своём цвете такая мелочь
// превращает стаю в рябь из разноцветных точек. Порог — шесть пикселей: ровно
// столько остаётся у блока 4x2 после правки формы.
const INK_MIN_PX = 6;

const INK_Y = 2, INK_B = 1, INK_R = 3;
// КРУПНЫМ ОСОБЯМ ДАЮТСЯ ТОЛЬКО СИНЕЕ И КРАСНОЕ, жёлтое остаётся мелочи.
// Крупных особей в кадре четыре-пять; если пускать их по всем трём чернилам,
// цветными выходят две-три штуки на кадр, и стая читается как прежняя жёлтая
// с парой вкраплений. Жёлтый в кадре и так есть — его несут семь десятков
// точек и чёрточек, которые чернила не получают вовсе.
const CYCLE = [INK_B, INK_R];

// РАСКЛАДКА БЛОКА В ПАМЯТИ, как её читает сама игра: три кадра, $FF, кадр,
// три кадра, $FF, кадр. Смещения взяты из меток, а не назначены здесь.
const BLOCK_LO = S.L7748, BLOCK_HI = S.L798A;
const LAYOUT = [];   // {off, label|null}
{
  const marks = { [S.L7748 - BLOCK_LO]: "L7748", [S.L7821 - BLOCK_LO]: "L7821",
                  [S.L7869 - BLOCK_LO]: "L7869", [S.L7942 - BLOCK_LO]: "L7942" };
  let off = 0;
  while (off < BLOCK_HI - BLOCK_LO) {
    if (at(BLOCK_LO + off) === 0xFF && !(off in marks)) { LAYOUT.push({ off, ff: true }); off += 1; continue; }
    LAYOUT.push({ off, label: marks[off] || null });
    off += 72;
  }
}

const SHAPE_LOG = [], frameBits = new Map();
let inkTurn = 0;
const frames = [];
{
  const chains = [];   // цепочки для наследования цвета: кадры между метками
  let cur = null;
  for (const it of LAYOUT) {
    if (it.ff) { cur = null; continue; }
    if (it.label || !cur) { cur = []; chains.push(cur); }
    cur.push(it);
  }
  for (const chain of chains) {
    let anchor = null;
    for (const [i, it] of chain.entries()) {
      const a = BLOCK_LO + it.off;
      const g = grid(a);
      fixBlocks(g, `+${it.off}`, SHAPE_LOG);
      frameBits.set(it.off, g);
      const cs = comps(g);
      if (i === 0) {
        // Счётчик чернил СКВОЗНОЙ, а не свой у каждой цепочки: крупных особей в
        // кадре четыре-пять, и цикл, начинающийся заново, раздаёт первым двум
        // чернилам вдвое больше, чем третьему (было 18 жёлтых, 13 синих, 6
        // красных вместо ровной трети).
        cs.sort((p, q) => p.cy - q.cy || p.cx - q.cx);
        for (const c of cs) c.ink = c.n >= INK_MIN_PX ? CYCLE[inkTurn++ % CYCLE.length] : INK_Y;
        anchor = cs.filter(c => c.n >= INK_MIN_PX);
      } else {
        for (const c of cs) {
          if (c.n < INK_MIN_PX) { c.ink = INK_Y; continue; }
          let best = null, bd = Infinity;
          for (const p of anchor) {
            const d = (p.cy - c.cy) ** 2 + (p.cx - c.cx) ** 2 + Math.abs(p.n - c.n);
            if (d < bd) { bd = d; best = p; }
          }
          c.ink = best ? best.ink : INK_Y;
        }
      }
      frames.push({ off: it.off, addr: a, cs, name: "F" + it.off });
    }
  }
}

function masks(fr) {
  const A = Buffer.alloc(72), D = Buffer.alloc(72);
  for (const c of fr.cs) for (const [r, x] of c.px) {
    const byte = r * W + (x >> 3), bit = 1 << (7 - (x & 7));
    if (c.ink === INK_Y || c.ink === INK_R) A[byte] |= bit;
    if (c.ink === INK_B || c.ink === INK_R) D[byte] |= bit;
  }
  return { A, D };
}
// УПАКОВКА МАСКИ ВТОРОЙ ПЛОСКОСТИ. Два уровня, потому что пусты не только
// строки, но и байты внутри строки: карта строк (3 Б) -> для каждой непустой
// строки байт-маска её трёх байтов -> сами непустые байты. 263 Б против 576 Б
// у полной маски и 321 Б у одноуровневой.
function pack(buf) {
  const map = [0, 0, 0], body = [];
  for (let r = 0; r < ROWS; r++) {
    const b = [buf[r * W], buf[r * W + 1], buf[r * W + 2]];
    if (!(b[0] | b[1] | b[2])) continue;
    map[r >> 3] |= 1 << (r & 7);
    let m = 0;
    for (let i = 0; i < W; i++) if (b[i]) m |= 1 << i;
    body.push(m);
    for (let i = 0; i < W; i++) if (b[i]) body.push(b[i]);
  }
  return [...map, ...body];
}
const hex = b => "0" + b.toString(16).toUpperCase().padStart(2, "0") + "h";
const defb = arr => {
  const out = [];
  for (let i = 0; i < arr.length; i += 12) out.push("\tDEFB " + arr.slice(i, i + 12).map(hex).join(","));
  return out.join("\n");
};

// САМОПРОВЕРКА ГЕНЕРАТОРА. Разложение обязано быть точным: объединение масок —
// это исходный кадр байт в байт, ни одного пикселя не потеряно и не добавлено.
// Без этой проверки ошибка в разборе на рыбок вышла бы на экран дырами в стайке.
// Сверяться надо с ИСПРАВЛЕННЫМ кадром, а не с исходным: блоки 4x2 получили
// силуэт, и в этих шести местах рисунок автора намеренно другой. Всё остальное
// обязано сойтись бит в бит — иначе разбор на рыбок потерял пиксели.
for (const f of frames) {
  const { A, D } = masks(f);
  const g = frameBits.get(f.off);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < W; c++) {
    let want = 0;
    for (let b = 0; b < 8; b++) if (g[r][c * 8 + b]) want |= 1 << (7 - b);
    const got = A[r * W + c] | D[r * W + c];
    if (got !== want)
      throw new Error(`кадр +${f.off} строка ${r} байт ${c}: A|D=${got.toString(16)} против кадра ${want.toString(16)}`);
  }
}
// РАСПАКОВКА ТОЖЕ ПРОВЕРЯЕТСЯ ЗДЕСЬ, а не на стенде: формат пишет генератор, и
// если он разойдётся с распаковщиком в игре, это увидят как «рыбки не того
// цвета», а не как ошибку формата.
function unpack(p) {
  const out = Buffer.alloc(72);
  let k = 3;
  for (let r = 0; r < ROWS; r++) {
    if (!((p[r >> 3] >> (r & 7)) & 1)) continue;
    const m = p[k++];
    for (let i = 0; i < W; i++) if ((m >> i) & 1) out[r * W + i] = p[k++];
  }
  if (k !== p.length) throw new Error("распаковка не сошлась по длине");
  return out;
}
for (const f of frames) {
  const { D } = masks(f);
  const back = unpack(pack(D));
  if (!back.equals(D)) throw new Error(`кадр +${f.off}: распаковка не совпала с маской`);
}

const byOff = new Map(frames.map(f => [f.off, f]));
const cnt = { 1: 0, 2: 0, 3: 0 };
for (const f of frames) for (const c of f.cs) cnt[c.ink]++;

// --- 1. Блок кадров: вместо исходного кадра лежит маска A ---------------------
let fr_asm = `; СГЕНЕРИРОВАНО tools/cloud/mkcloudink.js — РУКАМИ НЕ ПРАВИТЬ.
; Кадры облака рыб под -DCLOUDINK: в блоке лежит НЕ исходный кадр, а его первая
; половина — маска A (жёлтые и красные рыбки, всё, что идёт в 0xC000). Синие
; рыбки из этого блока вычтены, их несёт упакованная маска D (scubacloud.asm).
; Размер блока и все метки те же байт в байт: логика анимации шагает по кадрам
; арифметикой (конец кадра = начало + 72, конец цепочки = $FF), и сдвинуть здесь
; хоть один байт — значит сломать её молча.
`;
for (const it of LAYOUT) {
  if (it.ff) { fr_asm += "\tDEFB 0FFh\t\t; конец цепочки кадров\n"; continue; }
  const f = byOff.get(it.off);
  const { A } = masks(f);
  const y = f.cs.filter(c => c.ink === 2).length, b = f.cs.filter(c => c.ink === 1).length, r = f.cs.filter(c => c.ink === 3).length;
  if (it.label) fr_asm += `${it.label}\t\t\t; рыбок ${f.cs.length}: жёлтых ${y}, синих ${b}, красных ${r}\n`;
  else fr_asm += `\t\t\t; +${it.off}: рыбок ${f.cs.length}: жёлтых ${y}, синих ${b}, красных ${r}\n`;
  fr_asm += defb([...A]) + "\n";
}
fs.writeFileSync(`${ROOT}/src8080/scubacloud_frames.asm`, fr_asm);

// --- 2. Упакованные маски D + таблица ----------------------------------------
let asm = `; СГЕНЕРИРОВАНО tools/cloud/mkcloudink.js — РУКАМИ НЕ ПРАВИТЬ.
; Раскраска облака рыб (-DCLOUDINK): каждая особь в стайке получает своё чернило.
; Кадр 24x24 разложен на связные группы пикселей — рыбок — и разделён надвое:
; в блоке кадров (scubacloud_frames.asm) лежит маска A, всё что идёт в 0xC000;
; здесь — упакованная маска D, всё что идёт в 0xE000. Жёлтая рыбка стоит только
; в A, синяя только в D, красная в обеих: индекс пикселя набирается битами
; плоскостей, и обе стоящие дают третье чернило.
; Цвет особи держится между фазами взмаха — в кадрах цепочки рыбка наследует
; чернило ближайшей особи опорного кадра. Иначе стайка мигала бы цветами при
; каждом обновлении.
	IFDEF CLOUDINK
; адрес кадра -> упакованная маска второй плоскости; ищется линейно при сборке
CloudInkTab:
`;
let total = 0;
const blocks = [];
for (const f of frames) {
  const { D } = masks(f);
  const pd = pack(D);
  total += pd.length;
  asm += `\tDEFW L7748${f.off ? "+" + f.off : ""}, CloudD_${f.off}\n`;
  blocks.push({ f, pd });
}
asm += `CLOUD_N\t\tEQU ${frames.length}\n\n`;
for (const b of blocks) {
  const y = b.f.cs.filter(c => c.ink === 2).length, s2 = b.f.cs.filter(c => c.ink === 1).length, r = b.f.cs.filter(c => c.ink === 3).length;
  asm += `; кадр +${b.f.off}: синих ${s2}, красных ${r} (жёлтых ${y} — их несёт блок кадров)\n`;
  asm += `CloudD_${b.f.off}:\n${defb(b.pd)}\n`;
}
asm += "\tENDIF\n";
fs.writeFileSync(OUT, asm);

console.log(`кадров ${frames.length}, особей ${cnt[1] + cnt[2] + cnt[3]} (жёлтых ${cnt[2]}, синих ${cnt[1]}, красных ${cnt[3]})`);
console.log(`чернило дано только особям от ${INK_MIN_PX} пикселей: ${cnt[1] + cnt[3]} цветных, остальные жёлтые`);
if (SHAPE_LOG.length) {
  console.log(`ПРАВКА ФОРМЫ (сплошной блок 4x2 -> силуэт), снято ${SHAPE_LOG.length} пикселей:`);
  for (const p of SHAPE_LOG) console.log(`  кадр ${p.tag}: строка ${String(p.r).padStart(2)}, пиксель ${p.x}`);
}
console.log(`упакованные маски D ${total} Б + таблица ${frames.length * 4} Б = ${total + frames.length * 4} Б сверх нынешних данных`);
console.log(`-> ${OUT}`);
console.log(`-> ${ROOT}/src8080/scubacloud_frames.asm`);
