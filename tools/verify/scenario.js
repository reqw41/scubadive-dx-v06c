// Сценарии ввода: детерминированная последовательность нажатий, заданная НЕ в
// кадрах, а в событиях игры — потому что наша i8080-сборка идёт с другой
// скоростью, и «кадр N» у неё означает другой момент игры, чем у Z80-эталона.
//
// Единица времени сценария — ИГРОВОЙ ТИК: проход главного цикла LD9C0
// (CALL LB213 / CALL LBDEA / CALL LE2A8). До входа в игру тиков нет, там время
// меряется кадрами прерывания.
"use strict";

// коды браузерных клавиш, как их ждёт keyboard.js из vector06js
const KEY = {
  ENTER: 13, TAB: 9, SPACE: 32,
  LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40,
  D1: 49, D2: 50, D3: 51, D4: 52,
};

// Сценарий = список фаз. Фаза: {frames|ticks: N, keys: [...]}
// keys — что ДЕРЖАТЬ нажатым всю фазу.
const SCENARIOS = {
  // Просто дойти до игры и постоять: базовый заплыв вниз от лодки.
  boot: [
    { frames: 80, keys: [] },              // бут, распаковка, титры
    { frames: 6,  keys: [KEY.ENTER] },     // «PRESS ENTER»
    { frames: 10, keys: [] },
    { frames: 6,  keys: [KEY.UP] },        // Accel = старт игры с меню
    { frames: 10, keys: [] },
  ],
  // Заплыв вниз: разгон и погружение.
  dive: [
    { ticks: 400, keys: [] },
    { ticks: 200, keys: [KEY.UP] },
    { ticks: 400, keys: [] },
  ],
  // Поворот влево-вправо: гоняет таблицу углов AngleToDXDY и смену спрайта.
  turn: [
    { ticks: 100, keys: [KEY.LEFT] },
    { ticks: 100, keys: [] },
    { ticks: 100, keys: [KEY.RIGHT] },
    { ticks: 200, keys: [] },
  ],
  // Долгий проход: кислород, глубина, встречи с живностью, смерть.
  long: [
    { ticks: 3000, keys: [KEY.UP] },
  ],
};

// Прогон сценария. hooks:
//   onTick(i, m)  — вызывается на каждом игровом тике
//   onFrame(f, m) — на каждом кадре
function runScenario(m, phases, tickAddr, hooks) {
  hooks = hooks || {};
  let ticks = 0, held = new Set();
  const setKeys = keys => {
    for (const k of held) if (!keys.includes(k)) m.key(k, false);
    for (const k of keys) if (!held.has(k)) m.key(k, true);
    held = new Set(keys);
  };
  // счётчик тиков вешаем на PC главного цикла
  let tickHit = 0;
  const watch = () => { tickHit++; };
  m.onPc(tickAddr, watch);

  for (const ph of phases) {
    setKeys(ph.keys || []);
    if (ph.frames != null) {
      for (let i = 0; i < ph.frames; i++) { m.step(); if (hooks.onFrame) hooks.onFrame(m.frame, m); }
    } else {
      const target = tickHit + ph.ticks;
      let guard = 0;
      while (tickHit < target && guard < 100000) { m.step(); guard++; if (hooks.onFrame) hooks.onFrame(m.frame, m); }
      if (guard >= 100000) throw new Error("сценарий завис: тики не идут (tickHit=" + tickHit + ")");
    }
  }
  setKeys([]);
  return tickHit;
}

module.exports = { KEY, SCENARIOS, runScenario };
