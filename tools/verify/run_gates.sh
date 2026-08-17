#!/bin/sh
# Приёмочный набор Scuba Dive i8080. Гоняется на СОБРАННЫХ образах:
#   tools/mkref.py && SRC=src_ref  tools/build.sh     (эталон Z80 для lockstep)
#   SRC=src8080 tools/build.sh                        (наша ветка)
cd "$(dirname "$0")/../.."
FAIL=0
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
echo "== гейт звука (расчётная сверка частот с таблицами мелодий)"
node tools/verify/snd_gate.js build/src8080/scuba.rom build/src8080/scubacod1.sym || FAIL=1
[ $FAIL = 0 ] && echo "НАБОР ЗЕЛЁНЫЙ" || echo "НАБОР КРАСНЫЙ"
exit $FAIL
