// ГЕЙТ ШКАЛ ПАНЕЛИ: ПОЛЗУНОК ГЛУБИНЫ СТОИТ ТАМ, ГДЕ ГЛУБИНА, И ОН ОДИН.
//
// Дефект с железа (наблюдение владельца 2): при ПЕРВОМ старте индикатор глубины
// показывает не то. Причина найдена и померена: в PrepareGame стоял вызов
// UpdateDepth1, который берёт глубину ИЗ РЕГИСТРА A, а к этому месту в A лежал
// остаток от ZoneCopy (первая игра) или 0xFF из проверки признака ZoneLaid
// (следующие). Замер до правки: LDE55 = 0xDB07 при базе 0xDB83, то есть ползунок
// на 125 пикселей ниже верха шкалы, при истинной глубине НОЛЬ.
//
// Второй дефект того же места: ползунки сбрасывались в базу на каждой постановке
// уровня «потому что панель только что распакована». Панель распаковывается ОДИН
// РАЗ за жизнь образа (PanelDrawn), поэтому на второй игре старый ползунок
// остаётся на экране, а стереть его нечем — адрес затёрт.
//
// Меры (никаких окон, только адреса самой шкалы):
//   A. на первом игровом тике LDE55 = GAUGE_DEPTH - 4*строка мини-карты;
//   B. в столбце шкалы глубины РОВНО ОДНА группа байт 0xFF, и она лежит по
//      адресу из LDE55 (ползунок один, старых следов нет);
//   C. то же самое после «глубина изменилась -> гибель -> новая игра».
//
//   node tools/verify/gauge_gate.js
//   GAUGE_INJECT=1 — вернуть вызов UpdateDepth1 (глубина из мусора в A);
//   GAUGE_STALE=1  — сбрасывать LDE55 в базу перед вызовом, как было: после
//                    смены глубины и новой игры на экране останутся ДВА ползунка;
//   GAUGE_EMPTY=1  — обнулить выборку.
"use strict";
const fs = require("fs"), path = require("path");
const { readSym } = require("./harness.js");
const { reachGame, swim } = require("./drive.js");
const ROOT = path.resolve(__dirname, "../..");
const B = process.env.BUILD_DIR || "build";
const DIR = process.env.GAUGE_DIR || `${ROOT}/${B}/ev`;
for (const f of ["scuba.rom", "scubacod1.sym"])
  if (!fs.existsSync(`${DIR}/${f}`)) { console.log(`нет ${DIR}/${f}`); process.exit(2); }
const S = readSym(`${DIR}/scubacod1.sym`);
for (const n of ["GaugeInit", "UpdateDepth", "UpdateDepth1", "LDE55", "GAUGE_DEPTH", "L5B03", "LD9C0"])
  if (S[n] == null) { console.log(`нет метки ${n} в .sym`); process.exit(2); }
const INJECT = process.env.GAUGE_INJECT === "1";
const STALE = process.env.GAUGE_STALE === "1";
const EMPTY = process.env.GAUGE_EMPTY === "1";
const ROW2 = Number(process.env.GAUGE_ROW || 9);   // глубина, на которую уводим

let fail = 0, checks = 0;
const chk = (ok, msg) => { checks++; if (ok) console.log("  ok      " + msg);
                           else { fail++; console.log("  ПРОВАЛ  " + msg); } };

const g = reachGame(`${DIR}/scuba.rom`, `${DIR}/scubacod1.sym`,
  { cpu: "i8080", level: 1, seed: 0x0167, preHook: (m, SS) => {
    // ПОДСАДКИ — НА САМОМ ВЫЗОВЕ, то есть внутри измеряемого события.
    if (INJECT) m.onPc(SS.GaugeInit, () => {
      m.wr(SS.GaugeInit + 1, SS.UpdateDepth1 & 0xff); m.wr(SS.GaugeInit + 2, SS.UpdateDepth1 >> 8); });
    if (STALE) m.onPc(SS.GaugeInit, () => {
      m.wr(SS.LDE55, SS.GAUGE_DEPTH & 0xff); m.wr(SS.LDE55 + 1, SS.GAUGE_DEPTH >> 8); });
  } });
const rd16 = (a) => g.m.rd(a) | (g.m.rd(a + 1) << 8);
// Группы 0xFF в столбце шкалы: ползунок рисуется четырьмя байтами 0xFF, и в
// столбце глубины больше их взяться неоткуда — битмап панели там пуст (замер).
function groups() {
  const hi = S.GAUGE_DEPTH >> 8, lo1 = S.GAUGE_DEPTH & 0xff;
  const out = []; let cur = null;
  for (let lo = lo1 - 127; lo <= lo1 + 3; lo++) {
    const v = EMPTY ? 0 : g.m.rd(hi * 256 + lo);
    if (v === 0xff) { if (!cur) { cur = { a: hi * 256 + lo, n: 0 }; out.push(cur); } cur.n++; }
    else cur = null;
  }
  return out;
}
const want = () => (S.GAUGE_DEPTH - ((g.m.rd(S.L5B03 + 1) * 4) & 0x7f)) & 0xffff;

let t = 0; g.m.onPc(S.LD9C0, () => { t++; });
for (let i = 0; i < 300 && t < 2; i++) g.m.step();
const a1 = rd16(S.LDE55), w1 = want(), g1 = groups();
console.log(`ШКАЛЫ: ${DIR}, база 0x${S.GAUGE_DEPTH.toString(16)}`);
console.log(`  первый старт: строка мини-карты ${g.m.rd(S.L5B03 + 1)}, LDE55 0x${a1.toString(16)}, ` +
            `ждём 0x${w1.toString(16)}, групп 0xFF ${g1.length} ` + g1.map(r => `[0x${r.a.toString(16)} x${r.n}]`).join(" "));
if (EMPTY || !t) { console.log(`  ПРОВАЛ  ПУСТАЯ ВЫБОРКА: тиков ${t}, групп ${g1.length}`);
  console.log("ГЕЙТ НЕДЕЙСТВИТЕЛЕН"); process.exit(2); }
chk(a1 === w1, `на первом старте ползунок глубины по истинной глубине: 0x${a1.toString(16)} против 0x${w1.toString(16)}`);
chk(g1.length === 1, `на первом старте ползунок один (групп ${g1.length})`);
chk(g1.length === 1 && g1[0].a >= a1 - 1 && g1[0].a <= a1 + 2,
    `группа стоит по адресу из LDE55 (0x${(g1[0] || {}).a?.toString(16)} при LDE55 0x${a1.toString(16)})`);
// --- ГЛУБИНА МЕНЯЕТСЯ, ПОТОМ ГИБЕЛЬ И НОВАЯ ИГРА.
// Сверять положение ползунка с ТЕКУЩЕЙ строкой мини-карты нельзя: шкала
// обновляется не каждый тик, а на смене экрана, и «текущая строка» — мера шире
// явления. Правильная опора — строка, которую прочитал САМ UpdateDepth: её и
// запоминаем на входе в него, а сверяем после его работы.
let lastRow = g.m.rd(S.L5B03 + 1), calls = 0, badCall = 0, firstBad = null;
let pending = null, forced = 0;
// СЦЕНА ОБЯЗАНА СДВИНУТЬ ПОЛЗУНОК, иначе проверка «старого следа нет» проверяет
// пустоту: сценарий плавания держит дайвера на одном экране мини-карты, и шкала
// честно стоит на нуле всю игру. Глубина подсаживается ЧЕРЕЗ СОБСТВЕННЫЙ ТРАКТ
// шкалы — строка мини-карты пишется на входе в UpdateDepth, ровно перед её
// чтением, и дальше всё делает сама игра. Это часть СЦЕНЫ, а не подсадка
// дефекта: она стоит во всех режимах, включая штатный.
g.m.onPc(S.UpdateDepth, () => {
  if (forced < 1) { g.m.wr(S.L5B03 + 1, ROW2); forced++; }
  pending = g.m.rd(S.L5B03 + 1); calls++; });
g.m.onPc(S.LD9C0, () => {
  if (pending === null) return;
  lastRow = pending; pending = null;
  const wantA = (S.GAUGE_DEPTH - ((lastRow * 4) & 0x7f)) & 0xffff;
  if (rd16(S.LDE55) !== wantA) { badCall++; if (!firstBad) firstBad = { lastRow, got: rd16(S.LDE55), wantA }; }
});
swim(g, { passes: 1, frames: 20 });                  // плавание, гибель, возрождение
const a3 = rd16(S.LDE55), w3 = (S.GAUGE_DEPTH - ((lastRow * 4) & 0x7f)) & 0xffff, g3 = groups();
console.log(`  после плавания и гибели: заходов в UpdateDepth ${calls}, строка последнего ` +
            `обновления ${lastRow}, LDE55 0x${a3.toString(16)}, ждём 0x${w3.toString(16)}, ` +
            `групп ${g3.length} ` + g3.map(r => `[0x${r.a.toString(16)} x${r.n}]`).join(" "));
if (firstBad) console.log(`      первое расхождение: строка ${firstBad.lastRow}, ` +
  `LDE55 0x${firstBad.got.toString(16)}, ждём 0x${firstBad.wantA.toString(16)}`);
chk(calls > 0, `шкала глубины вообще обновлялась: заходов ${calls}`);
chk(badCall === 0, `после каждого обновления ползунок стоит по прочитанной глубине (расхождений ${badCall})`);
chk(g3.length === 1, `после гибели и новой игры ползунок ОДИН, старого следа нет (групп ${g3.length})`);
chk(a3 === w3, `после новой игры ползунок по последней прочитанной глубине: ` +
    `0x${a3.toString(16)} против 0x${w3.toString(16)}`);
console.log(fail ? `ГЕЙТ КРАСНЫЙ: ${fail} из ${checks}` : `ГЕЙТ ЗЕЛЁНЫЙ: все ${checks} проверки`);
process.exit(fail ? 1 : 0);
