"use strict";
// ЦВЕТ ОСЬМИНОГА: ЖЁЛТЫЙ, то есть биты только в первой плоскости (0xC000).
// Проверка не по снимку экрана (вокруг осьминога риф, а он под -DDITHER сам
// кладёт вкрапления во вторую плоскость), а по АДРЕСАМ ЗАПИСЕЙ: сторож стоит на
// всей видимой видеопамяти, а окно «сейчас рисуется осьминог» открывается на
// входе в DrawOctopusSprite и закрывается на L9D38 — метке сразу за вызовом.
// Окно задаётся НЕ меткой возврата, а самим PC записи: L9D38 (метка сразу за
// вызовом) закрывает его не всегда — на 7 входов пришлось 2 выхода, и сторож
// приписывал осьминогу всю очистку поля, 65 тысяч байт.
// Красный осьминог (до 2026-09-14) слал во вторую плоскость дельту — такая
// сборка обязана дать КРАСНЫЙ, это и есть негативный контроль:
//   node tools/verify/octink_gate.js build/prod/scuba.rom build/prod/scubacod1.sym
const R = __dirname;
const { reachGame } = require(R + "/drive.js");
const rom = process.argv[2], sym = process.argv[3], cpu = process.argv[4] || "i8080";
const LVL = +(process.argv[5] || 4), NT = +(process.argv[6] || 600);
const ROW = 4, COL = 11;
const g = reachGame(rom, sym, { cpu, level: LVL, seed: 0x0167, preHook: (mm, SS) => {
  mm.onPc(SS.PrepareGame, () => { mm.wr(SS.L5B03, COL); mm.wr(SS.L5B03 + 1, ROW); }); } });
const m = g.m, S = g.S;
let t = 0, draws = 0, c0 = 0, e0 = 0; const hi = new Map();
const BODY0 = S.DrawOctopusSprite, BODY1 = S.LB392;   // тело осьминога целиком
m.onPc(S.DrawOctopusSprite, () => { draws++; });
for (let a = 0xC000; a <= 0xFFFF; a++) m.onWrite(a, (addr, v, pc) => {
  if (pc < BODY0 || pc >= BODY1) return;
  if (addr >= 0xE000) { e0++; hi.set(addr >> 8, (hi.get(addr >> 8) || 0) + 1); } else c0++; });
// Осьминог родится только там, где блок мини-карты равен $1C, и только на
// перерисовке экрана — засеваем полосу, как в octopus_gate.
m.onPc(S.LD9C0, () => { t++;
  if (t === 40) for (let r = 0; r < 8; r++) for (let c = 0; c < 32; c++) m.wr(S.MiniMap + r * 32 + c, 0x1C); });
m.key(38, true);                       // вверх: дайвер идёт, экран перерисовывается
let gd = 0; while (t < NT && gd < 600000) { m.step(); gd++; }
// САМОПРОВЕРКА: OCTINK_INJECT=1 объявляет второй плоскостью первую — вердикт
// обязан покраснеть. Без неё зелёный ничего не значит: он же зелёный и когда
// осьминог не нарисовался ни разу (этот случай ловит draws > 0).
if (process.env.OCTINK_INJECT) { e0 += c0; }
const ok = draws > 0 && e0 === 0;
console.log(`${ok ? "зелёный" : "КРАСНЫЙ"}: отрисовок осьминога ${draws}; байт в 0xC000 ${c0}, во второй плоскости 0xE000 ${e0}`);
if (!draws) console.log("  осьминог так и не нарисовался — проверять нечего");
if (e0) console.log("  столбцы второй плоскости:", [...hi].sort((a,b)=>a[0]-b[0]).map(([h,n])=>`${h.toString(16)}:${n}`).join(" "));

process.exit(ok ? 0 : 1);
