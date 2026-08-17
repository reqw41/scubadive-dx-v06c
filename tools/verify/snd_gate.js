// ГЕЙТ ЗВУКА: расчётная сверка частот. Драйвер ВИ53 пересчитывает параметры
// ZX-бипера в делитель счётчика; здесь мы ловим КАЖДУЮ запись в порт 09h,
// собираем из пары байт делитель, переводим обратно в герцы (тактовая ВИ53
// 1.5 МГц) и сравниваем с частотой, которую задавала таблица мелодии:
//   f = 437500/(X+30.125), где X — второй-третий байты тройки.
// Гейт красный, если хоть одна нота ушла больше чем на 1% или если выборка
// пуста (мелодий не сыграно — значит проверять было нечего).
//   node tools/verify/snd_gate.js <rom> <sym>
"use strict";
const { reachGame, KEY } = require("./drive.js");
const { readSym } = require("./harness.js");

const rom = process.argv[2], sym = process.argv[3];
const S = readSym(sym);
const CLK = 1500000;             // тактовая ВИ53 на Векторе-06Ц

// ожидаемые ноты: разбираем таблицы мелодий прямо из памяти по меткам
const MELODIES = ["LE604", "LE60B", "LE61C", "LE629", "LE630", "LE632", "LE634",
                  "LE638", "LEDD5"];

// перехват портов вешаем ДО бута: мелодия старта игры (LEDD5) звучит ещё
// внутри reachGame, и гейт, начатый после него, её бы не увидел
const writes = [];
let lo = null, ctrl = null;
const g = reachGame(rom, sym, { cpu: "i8080", level: 1, seed: 0x0167, preHook: (m) => {
  const io = m.io;
  const origOut = io.output.bind(io);
  io.output = (port, v) => {
    if ((port & 0xff) === 0x08) { ctrl = v & 0xff; lo = null; }
    if ((port & 0xff) === 0x09) {
      if (lo === null) lo = v & 0xff;
      else { writes.push({ n: lo | ((v & 0xff) << 8), ctrl }); lo = null; }
    }
    return origOut(port, v);
  };
} });

// ожидаемые частоты всех нот всех мелодий (для сверки «попал ли делитель»)
const expect = [];
for (const m of MELODIES) {
  let a = S[m];
  if (a == null) continue;
  for (let i = 0; i < 24; i++) {
    const p = g.m.rd(a);
    if (p === 0xff) break;
    const X = g.m.rdw(a + 1);
    expect.push({ mel: m, passes: p, X, f: 437500 / (X + 30.125) });
    a += 3;
  }
}

// гоняем игру: старт игры уже играет LEDD5, дальше ныряем — по дороге звучат
// подбор/столкновение/смерть
g.m.key(KEY.UP, true);
let guard = 0;
const t0 = g.ticks;
while (g.ticks - t0 < 2500 && guard < 40000) { g.m.step(); guard++; }
g.m.key(KEY.UP, false);

console.log(`нот в таблицах мелодий: ${expect.length}`);
console.log(`записей делителя в порт 09h за прогон: ${writes.length}`);
if (writes.length === 0) {
  console.log("ГЕЙТ КРАСНЫЙ: ни одной ноты не сыграно — сверять нечего (пустая выборка)");
  process.exit(1);
}
let bad = 0, shown = 0, silence = 0, notes = 0;
const seen = new Set();
for (const w of writes) {
  // B0 = режим 0 с нулевым счётом — это ТИШИНА (snd_stop), а не нота
  if (w.ctrl === 0xb0) { silence++; continue; }
  if (w.ctrl !== 0xb6) { console.log(`  управляющее слово ${w.ctrl.toString(16)} вместо B6 (канал 2, режим 3) и не B0 (тишина)`); bad++; continue; }
  if (w.n === 0) { console.log("  ДЕЛИТЕЛЬ 0 в режиме 3 — на MiSTer счётчик не стартует!"); bad++; continue; }
  const f = CLK / w.n;
  // ищем ближайшую ожидаемую ноту
  let best = null;
  for (const e of expect) {
    const d = Math.abs(e.f - f) / e.f;
    if (!best || d < best.d) best = { d, e };
  }
  const key = w.n;
  if (best.d > 0.01) { bad++; if (shown++ < 10) console.log(`  делитель ${w.n} = ${f.toFixed(1)} Гц: ближайшая нота таблицы ${best.e.f.toFixed(1)} Гц, разбег ${(100 * best.d).toFixed(2)}%`); }
  else if (!seen.has(key)) {
    seen.add(key);
    console.log(`  ok  делитель ${String(w.n).padStart(5)} -> ${f.toFixed(1).padStart(7)} Гц; таблица (${best.e.mel}, X=${best.e.X}) ${best.e.f.toFixed(1)} Гц; разбег ${(100 * best.d).toFixed(2)}%`);
  }
}
notes = writes.length - silence;
if (notes === 0) { console.log("ГЕЙТ КРАСНЫЙ: сыграно 0 нот, только тишина — пустая выборка"); process.exit(1); }
console.log(bad ? `ГЕЙТ КРАСНЫЙ: ${bad} нот мимо (порог 1%) из ${notes}` : `ГЕЙТ ЗЕЛЁНЫЙ: все ${notes} нот в пределах 1% от таблицы (+${silence} команд тишины)`);
process.exit(bad ? 1 : 0);
