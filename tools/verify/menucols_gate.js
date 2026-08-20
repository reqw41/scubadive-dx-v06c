// ГЕЙТ СТОЛБЦОВ МЕНЮ: НАДПИСИ НЕ ЗАХОДЯТ ПОД ПАНЕЛЬ.
//
// Дефект с железа (наблюдение владельца 1): при старте игры часть стартового
// меню остаётся на экране — в столбцах 24..31, поверх боковой панели.
//
// Причина не в чистке, а в её ПРАВИЛЬНОМ клипе. ClearScreen под -DEVICT
// перешагивает столбцы 24..31: там битмап панели, и стирать его нельзя, иначе
// панель придётся распаковывать заново на каждой постановке уровня (а её
// распаковщик топчет ломти рельефа). Значит всё, что меню напечатает правее
// столбца 23, не стирает НИКТО и НИКОГДА.
//
// Мера — записи ПИКСЕЛЕЙ в видеопамять во время печати меню, с разбивкой по
// столбцам. Считаются только тракты печати (LDA89 в PrintChar и тело
// PrintBigChar), и только ПОСЛЕ входа в LEDFE (начало печати меню). Распаковщик
// панели dzx0 и PrintPanelLabels в счёт не идут: это сама панель (рамка в 0xE000,
// подписи ROM_CHARSET в 0xC000), её законные столбцы. Без отсечки по LEDFE мера
// считала 272 записи подписей HUD (34 глифа × 8 строк) как «меню на панели».
//
// Замер до правки: 88 записей от обычной печати (две строки версии по 29 знаков
// вылезали в столбцы 24..29) и 32 от заголовка 2x2 («SCUBA DIVE» со столбца 6
// занимает 6..25). После правки — ноль.
//
//   node tools/verify/menucols_gate.js
//   MC_INJECT=1 — вернуть заголовку старый столбец 6 (операнд MenuBigPos+1):
//                 «VE» снова уедет на панель, гейт обязан покраснеть.
//   MC_EMPTY=1  — обнулить выборку. Гейт обязан покраснеть.
"use strict";
const fs = require("fs"), path = require("path");
const { readSym, make } = require("./harness.js");
const ROOT = path.resolve(__dirname, "../..");
const B = process.env.BUILD_DIR || "build";
const DIRS = (process.env.MC_DIRS || `${ROOT}/${B}/ev,${ROOT}/${B}/evnt`).split(",");
const INJECT = process.env.MC_INJECT === "1";
const EMPTY = process.env.MC_EMPTY === "1";
const PANEL_COL0 = 24;             // первый столбец боковой панели

let fail = 0, checks = 0;
const chk = (ok, msg) => { checks++; if (ok) console.log("  ok      " + msg);
                           else { fail++; console.log("  ПРОВАЛ  " + msg); } };

for (const dir of DIRS) {
  for (const f of ["scuba.rom", "scubacod1.sym"])
    if (!fs.existsSync(`${dir}/${f}`)) { console.log(`нет ${dir}/${f}`); process.exit(2); }
  const S = readSym(`${dir}/scubacod1.sym`);
  for (const n of ["LEE2C", "LEDFE", "LDA89", "PrintBigChar", "MenuBigPos"])
    if (S[n] == null) { console.log(`нет метки ${n} в ${dir}`); process.exit(2); }
  const names = Object.entries(S).sort((a, b) => b[1] - a[1]);
  const near = (pc) => { const e = names.find(([, v]) => v <= pc); return e ? `${e[0]}+${pc - e[1]}` : "?"; };
  const m = make(`${dir}/scuba.rom`, { cpu: "i8080" });
  // ПОДСАДКА СТАВИТСЯ ДО ПЕЧАТИ, а не после неё: меню печатается один раз, и
  // патч, наложенный позже, ни на что не влияет (урок №2).
  if (INJECT) m.onPc(S.MenuBigPos, () => { m.wr(S.MenuBigPos + 1, 6 + 0); });
  let seen = false, menuPrint = false, inPanel = 0, inField = 0;
  const who = new Map();
  m.onPc(S.LEDFE, () => { menuPrint = true; });   // печать меню, не подписи панели в Start
  m.onPc(S.LEE2C, () => { seen = true; });
  const o = m.memory.write.bind(m.memory);
  m.memory.write = (a, v, st) => { a &= 0xffff;
    if (menuPrint && !seen && !EMPTY && a >= 0xc000) {
      const pc = m.cpu.pc & 0xffff, k = near(pc);
      // ТРАКТЫ ПЕЧАТИ, и только они: LDA89 — байт глифа в PrintChar,
      // PrintBigChar_1 — тело крупной печати 2x2.
      if (k.startsWith("LDA89") || k.startsWith("PrintBigChar")) {
        if (((a >> 8) & 0x1f) >= PANEL_COL0) { inPanel++; who.set(k, (who.get(k) || 0) + 1); }
        else inField++;
      }
    }
    return o(a, v, st); };
  for (let i = 0; i < 3000 && !seen; i++) m.step();
  if (!seen) { m.key(13, true); m.run(4); m.key(13, false);   // путь с титулом
    for (let i = 0; i < 900 && !seen; i++) m.step(); }
  const nm = path.basename(dir);
  console.log(`МЕНЮ ${nm}: достигнуто ${seen}, записей печати в поле ${inField}, ` +
              `в столбцы панели ${inPanel}`);
  for (const [k, n] of who) console.log(`      ${k}: ${n}`);
  // ПУСТАЯ ВЫБОРКА: без напечатанного меню сверять нечего.
  if (!seen || inField < 500) {
    chk(false, `${nm}: ПУСТАЯ ВЫБОРКА — меню ${seen ? "напечатано" : "НЕ достигнуто"}, ` +
        `записей печати в поле ${inField} (ждём > 500)`);
    continue;
  }
  chk(inPanel === 0, `${nm}: печать меню не заходит в столбцы ${PANEL_COL0}..31 (записей ${inPanel})`);
}
console.log(fail ? `ГЕЙТ КРАСНЫЙ: ${fail} из ${checks}` : `ГЕЙТ ЗЕЛЁНЫЙ: все ${checks} проверки`);
process.exit(fail ? 1 : 0);
