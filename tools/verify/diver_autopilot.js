"use strict";
// АВТОПИЛОТ ДАЙВЕРА: довести до заданного знакоместа.
//
// Почему не телепорт. Положение ведёт движок, и подмена полей ломает отрисовку:
// тракт дайвера сначала СТИРАЕТ прошлый кадр из буфера save-under, потом рисует
// новый; если менять поля быстрее, чем он рисует, дайвер исчезает с экрана
// (замер: у полей ПУСТО и через 10, и через 30 кадров). Подробности и границы —
// в diver_teleport.js.
//
// Управление у дайвера не «шаг в сторону», а лодочное: ВЛЕВО/ВПРАВО — поворот,
// ВВЕРХ — тяга, ВНИЗ — тормоз; есть инерция и угол (DiverObj+$06, 0..15).
// Поэтому здесь обратная связь по расстоянию, а не расчёт угла: каждые
// несколько кадров смотрим, приблизились ли, и если нет — доворачиваем.
//
// Клетка дайвера — (строка DiverObj+$19, столбец DiverObj+$00), см. LE21A.
//   const { goTo } = require("./diver_autopilot.js");
//   const ok = goTo(m, S, KEY, row, col, 6000);
module.exports.goTo = function goTo(m, S, KEY, row, col, budget = 6000) {
  const D = S.DiverObj;
  const dist = () => Math.abs(m.rd(D + 0x19) - row) + Math.abs(m.rd(D) - col);
  let best = dist(), stale = 0, turn = 0;
  for (let f = 0; f < budget; f++) {
    const d = dist();
    if (d === 0) return true;
    // раз в 12 кадров решаем, крутить или тянуть
    const phase = f % 12;
    m.key(KEY.UP, phase >= 4 && phase < 10);        // тяга импульсами
    m.key(KEY.DOWN, d <= 1 && phase < 4);           // у цели — притормаживаем
    m.key(KEY.LEFT, turn === 1 && phase < 4);
    m.key(KEY.RIGHT, turn === 2 && phase < 4);
    m.step();
    if (phase === 11) {
      if (d < best) { best = d; stale = 0; turn = 0; }
      else if (++stale >= 2) { turn = turn === 1 ? 2 : 1; stale = 0; }  // не приближаемся — доворот
    }
  }
  return dist() === 0;
};
