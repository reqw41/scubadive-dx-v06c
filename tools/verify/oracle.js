// Z80-ОРАКУЛ: потиковый лог игровых переменных оригинального порта nzeemin.
// Это эталон для lockstep-гейта: наша i8080-сборка обязана дать тот же лог.
//
// Время меряется ИГРОВЫМИ ТИКАМИ (итерация главного цикла LD9C0), а не кадрами:
// сборки идут с разной скоростью, в кадрах они не совпадут никогда.
// Сид RANDOM фиксируется стендом на входе в START_GAME — иначе он берётся из
// счётчика кадров (Start: LD HL,(FRAMES) / LD (RANDOM),HL) и у сборок разный.
//
//   node tools/verify/oracle.js <rom> <sym> <outdir> [cpu=z80]
"use strict";
const fs = require("fs");
const path = require("path");
const { reachGame, KEY, VARS } = require("./drive.js");

// Сценарии: имя -> {level, seed, row?, phases:[{ticks, keys}]}
// row (необязательное) — принудительная строка экрана на мини-карте (L5B03+1),
// ставится КАЖДЫЙ ТИК и одинаково у обеих сборок; см. сценарий deep ниже.
const SCENARIOS = {
  // покой у лодки: спавн существ, счётчики, ничего не нажато
  idle:    { level: 1, seed: 0x0167, phases: [{ ticks: 1200, keys: [] }] },
  // заплыв вниз: разгон, погружение, встречи
  dive:    { level: 1, seed: 0x0167, phases: [{ ticks: 2000, keys: [KEY.UP] }] },
  // поворот: таблица углов AngleToDXDY, смена спрайта, предсдвиги (RRD-путь)
  turn:    { level: 1, seed: 0x0167, phases: [
              { ticks: 150, keys: [KEY.LEFT] }, { ticks: 150, keys: [] },
              { ticks: 150, keys: [KEY.RIGHT] }, { ticks: 250, keys: [] },
              { ticks: 300, keys: [KEY.UP] }] },
  // тормоз: Decelerate
  brake:   { level: 1, seed: 0x0167, phases: [
              { ticks: 300, keys: [KEY.UP] }, { ticks: 300, keys: [KEY.SPACE] },
              { ticks: 300, keys: [] }] },
  // 4-й уровень: максимум существ — худшая сцена по нагрузке
  level4:  { level: 4, seed: 0x0167, phases: [{ ticks: 2000, keys: [KEY.UP] }] },
  // другой сид: проверяет, что расхождения не «повезло на одном сиде»
  seed2:   { level: 2, seed: 0x4E35, phases: [{ ticks: 1500, keys: [KEY.UP] }] },
  // долгий заплыв до потери жизней/game over
  long:    { level: 1, seed: 0x0167, phases: [{ ticks: 12000, keys: [KEY.UP] }] },
  // ГЛУБИНА: единственный сценарий, где работает ВЕРТИКАЛЬНЫЙ ХОДОК (LB972).
  //
  // Зачем понадобился отдельный сценарий. Диспетчер LBDEA выбирает, какие группы
  // существ обсчитывать, ПО СТРОКЕ ЭКРАНА на мини-карте: строки 0..6 — только
  // группы I..III (горизонтальные, LB885/LB89F), строки 7..9 — группа IV через
  // такт, строки 10+ — группа IV каждый тик. Группа IV и есть вертикальные
  // ходоки. Автопилот стенда до этих строк не добирается ВООБЩЕ: замер — 6000
  // тиков с «газом» и полный swim дают максимум строки 0, то есть LC431 не
  // зовётся ни разу и LB972 не исполняется ни разу.
  // Поэтому строка мини-карты подсаживается прямо (поле row), как это давно
  // делают plane_census/exec_census/geom_gate. Подсадка идёт КАЖДЫЙ ТИК и у
  // обеих сборок в один и тот же тик, так что сверка остаётся честной.
  //
  // Строка 7 выбрана нарочно: на ней LBDEA зовёт И LBE6D (группы III —
  // горизонтальные ходоки), И LC431 через такт (группа IV). Строки 9+ дали бы
  // только вертикальных.
  //
  // ПОКРЫТИЕ (замер на нашей DET-сборке, заходы за сценарий; в скобках — сколько
  // даёт лучший из прежних семи сценариев):
  //   LB972  вертикальный ходок + SkyGuard ....... 263  (0 — не исполнялся нигде)
  //   LC431  обход записей группы IV ............. 1209 (0)
  //   LB89F  горизонтальный ходок ................ 1357 (2715 у long)
  //   LB237  обход таблицы статики ............... 2410 (2508 у level4)
  // ЧЕГО СЦЕНАРИЙ НЕ ЗАКРЫВАЕТ — LB972_attr, атрибутная ветка вертикального
  // ходока. Ей нужен бит 0 в (IX+$0D), а он означает «существо ВИДНО в окне»:
  // LB5E0 взводит бит, когда столбец существа ВНЕ окна, и LB62D_f тут же
  // переворачивает его. Существа группы IV стоят в столбцах мира 107..140, а
  // окно при подсадке одной лишь строки остаётся на столбце 192 — они не видны
  // ни разу. Замер: 263 захода в LB972, бит 0 не взведён НИ РАЗУ (для сравнения,
  // у горизонтального ходока в сцене со свободным плаванием 126 из 1154).
  // Довести дайвера туда по-настоящему стенд не умеет: строка мини-карты не
  // растёт вовсе (6000 тиков с «газом» — максимум 0). Атрибутная ветка
  // ГОРИЗОНТАЛЬНОГО ходока (LB89F_attr) прикрыта слабо: 4 захода за 12 000 тиков
  // сценария long, здесь — ноль.
  deep:    { level: 4, seed: 0x0167, row: 7, phases: [
              { ticks: 120, keys: [KEY.DOWN] },
              { ticks: 120, keys: [KEY.DOWN, KEY.RIGHT] },
              { ticks: 120, keys: [KEY.RIGHT] },
              { ticks: 120, keys: [KEY.UP, KEY.RIGHT] },
              { ticks: 120, keys: [KEY.UP] },
              { ticks: 120, keys: [KEY.UP, KEY.LEFT] },
              { ticks: 120, keys: [KEY.LEFT] },
              { ticks: 120, keys: [KEY.DOWN, KEY.LEFT] },
              { ticks: 120, keys: [KEY.DOWN] },
              { ticks: 120, keys: [KEY.DOWN, KEY.RIGHT] },
              { ticks: 120, keys: [KEY.RIGHT] },
              { ticks: 120, keys: [KEY.UP, KEY.RIGHT] },
              { ticks: 120, keys: [KEY.UP] },
              { ticks: 120, keys: [KEY.UP, KEY.LEFT] },
              { ticks: 120, keys: [KEY.LEFT] },
              { ticks: 120, keys: [KEY.DOWN, KEY.LEFT] },
              { ticks: 240, keys: [KEY.UP] }] },
};

function record(romPath, symPath, name, cpu) {
  const sc = SCENARIOS[name];
  const g = reachGame(romPath, symPath, { cpu, level: sc.level, seed: sc.seed });
  const rows = [];
  let held = [];
  const setKeys = keys => {
    for (const k of held) if (!keys.includes(k)) g.m.key(k, false);
    for (const k of keys) if (!held.includes(k)) g.m.key(k, true);
    held = keys.slice();
  };
  // снимок делаем В МОМЕНТ тика (крючок на LD9C0), а не после кадра
  let want = -1;
  const snap = () => { if (g.ticks === want) { rows.push(g.read()); want = -1; } };
  // Подсадка строки мини-карты — ПОСЛЕ снимка, как в lockstep.js (см. там же
  // объяснение и разбор у сценария deep).
  g.m.onPc(g.S.LD9C0, () => { rows.push(g.read());
                              if (sc.row != null) g.m.wr(g.S.L5B03 + 1, sc.row); });

  const t0 = g.ticks;
  for (const ph of sc.phases) {
    setKeys(ph.keys || []);
    const target = g.ticks + ph.ticks;
    let guard = 0;
    while (g.ticks < target && guard < 200000) { g.m.step(); guard++; }
    if (guard >= 200000) throw new Error(`сценарий ${name}: тики встали на ${g.ticks - t0}`);
  }
  setKeys([]);
  return { name, level: sc.level, seed: sc.seed, cpu, ticks: g.ticks - t0,
           frames: g.m.frame, rows };
}

if (require.main === module) {
  const rom = process.argv[2], sym = process.argv[3], outdir = process.argv[4] || "build/oracle";
  const cpu = process.argv[5] || "z80";
  const only = process.argv[6];
  fs.mkdirSync(outdir, { recursive: true });
  const names = only ? [only] : Object.keys(SCENARIOS);
  for (const n of names) {
    const t = Date.now();
    const r = record(rom, sym, n, cpu);
    const f = path.join(outdir, n + ".json");
    fs.writeFileSync(f, JSON.stringify(r));
    // краткая сводка: сколько тиков, чем кончилось
    const last = r.rows[r.rows.length - 1];
    console.log(`${n.padEnd(8)} тиков=${String(r.ticks).padStart(6)} строк=${String(r.rows.length).padStart(6)} ` +
                `кадров=${String(r.frames).padStart(5)} ${((Date.now() - t) / 1000).toFixed(1)}с  ` +
                `итог: LIVES=${last.LIVES} SCORE=${last.SCORE} OXY=${last.OXYGEN} X=${last.dX} Y=${last.dY} ` +
                `col=${last.dCol} row=${last.dRow} -> ${f}`);
  }
}

module.exports = { SCENARIOS, record };
