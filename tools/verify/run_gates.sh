#!/bin/sh
# Приёмочный набор Scuba Dive i8080. Ничего не предполагает о содержимом build/:
# каталог сборки лежит в .gitignore, на свежем клоне он ПУСТ, и набор обязан
# собрать ВСЁ, что потом сверяет. Раньше он собирал только нашу ветку, а эталон
# для lockstep и пиксель-гейта брал из build/ как есть — на чужой машине этого
# файла просто не было, и набор краснел не по делу.
cd "$(dirname "$0")/../.."
FAIL=0
echo "== сборка всех трёх образов"
python3 tools/mkref.py || FAIL=1                 # src_ref = src + подмена LD A,R
SRC=src     ./tools/build.sh || FAIL=1           # Z80-версия автора (+ наши правки)
SRC=src_ref ./tools/build.sh || FAIL=1           # эталон для потиковой сверки
echo "== гейт сборки и i8080-чистоты (sjasmplus --i8080 отвергает Z80-опкоды)"
SRC=src8080 ./tools/build.sh || FAIL=1
echo "== lockstep, все сценарии"
node tools/verify/lockstep.js || FAIL=1
echo "== негативный контроль: подсаженный сдвиг X должен дать КРАСНЫЙ"
LOCKSTEP_TICKS=200 LOCKSTEP_INJECT=dX node tools/verify/lockstep.js idle >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт не заметил подсаженный дефект"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== негативный контроль: пустая выборка должна дать КРАСНЫЙ"
LOCKSTEP_TICKS=200 LOCKSTEP_EMPTY=1 node tools/verify/lockstep.js idle >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт молчит на пустой выборке"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== пиксель-гейт: видеопамять байт в байт, все сценарии"
node tools/verify/pixgate.js || FAIL=1
echo "== негативный контроль пиксель-гейта: подсаженный байт должен дать КРАСНЫЙ"
PIXGATE_TICKS=200 PIXGATE_INJECT=1 node tools/verify/pixgate.js screen0 >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт не заметил подсаженный байт"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== негативный контроль пиксель-гейта: пустая выборка должна дать КРАСНЫЙ"
PIXGATE_TICKS=200 PIXGATE_EMPTY=1 node tools/verify/pixgate.js screen0 >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт молчит на пустой выборке"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== юнит-тест замены RRD: все 131072 сочетания входов"
node tools/verify/rrd_unit.js build/src8080/scuba.rom build/src8080/scubacod1.sym || FAIL=1
echo "== юнит-тест контрактов хелперов (IX+d): прозрачность по флагам и регистрам"
node tools/verify/helpers_unit.js build/src8080/scuba.rom build/src8080/scubacod1.sym || FAIL=1
echo "== гейт старта: джойстик (порт 0x0E) и клавиатура, обе сборки"
node tools/verify/joystart_gate.js build/src8080/scuba.rom build/src8080/scubacod1.sym i8080 || FAIL=1
node tools/verify/joystart_gate.js build/src/scuba.rom     build/src/scubacod1.sym     z80   || FAIL=1
echo "== гейт титула: независимость от мусора в IX, обе сборки"
node tools/verify/title_ix_gate.js build/src8080/scuba.rom build/src8080/scubacod0.sym build/src8080/scubacod1.sym || FAIL=1
node tools/verify/title_ix_gate.js build/src/scuba.rom     build/src/scubacod0.sym     build/src/scubacod1.sym     || FAIL=1
echo "== гейт звука (расчётная сверка частот с таблицами мелодий)"
node tools/verify/snd_gate.js build/src8080/scuba.rom build/src8080/scubacod1.sym || FAIL=1
[ $FAIL = 0 ] && echo "НАБОР ЗЕЛЁНЫЙ" || echo "НАБОР КРАСНЫЙ"
exit $FAIL
