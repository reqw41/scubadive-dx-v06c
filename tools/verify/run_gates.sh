#!/bin/sh
# Приёмочный набор Scuba Dive i8080. Ничего не предполагает о содержимом build/:
# каталог сборки лежит в .gitignore, на свежем клоне он ПУСТ, и набор обязан
# собрать ВСЁ, что потом сверяет. Раньше он собирал только нашу ветку, а эталон
# для lockstep и пиксель-гейта брал из build/ как есть — на чужой машине этого
# файла просто не было, и набор краснел не по делу.
cd "$(dirname "$0")/../.."
FAIL=0
# BUILD_DIR разводит одновременные прогоны по разным каталогам сборки. Раньше
# два набора, запущенные внахлёст, писали в общий build/ и перезатирали образы
# друг у друга — оба результата были недействительны, а выглядели как обычный
# красный. Теперь параллель безопасна: BUILD_DIR=build2 ./tools/verify/run_gates.sh
B=${BUILD_DIR:-build}
export BUILD_DIR="$B"
# ВСЕ сверочные образы собираются с DET=1: источник случайности в бою —
# свободно бегущий счётчик ВИ53, а он зависит от протикавших тактов. Наша сборка
# и эталон идут с разной скоростью, поэтому потиковая сверка с аппаратным
# генератором невозможна В ПРИНЦИПЕ. Боевой образ (без DET) проверяется
# отдельным гейтом prng_gate.
echo "== сборка всех образов (сверочные — детерминированные, DET=1)"
python3 tools/mkref.py || FAIL=1                 # src_ref = src + подмена LD A,R
DET=1 SRC=src     OUT=$B/src     ./tools/build.sh || FAIL=1     # Z80-версия автора (+ наши правки)
DET=1 SRC=src_ref OUT=$B/src_ref ./tools/build.sh || FAIL=1     # эталон для потиковой сверки
echo "== гейт сборки и i8080-чистоты (sjasmplus --i8080 отвергает Z80-опкоды)"
DET=1 SRC=src8080 OUT=$B/src8080 ./tools/build.sh || FAIL=1
echo "== lockstep, все сценарии"
node tools/verify/lockstep.js || FAIL=1
echo "== негативный контроль: подсаженный сдвиг X должен дать КРАСНЫЙ"
LOCKSTEP_TICKS=200 LOCKSTEP_INJECT=dX node tools/verify/lockstep.js idle >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт не заметил подсаженный дефект"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== негативный контроль: пустая выборка должна дать КРАСНЫЙ"
LOCKSTEP_TICKS=200 LOCKSTEP_EMPTY=1 node tools/verify/lockstep.js idle >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт молчит на пустой выборке"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== сторож базы: прямая адресация читает ту базу, на которую рассчитана"
node tools/verify/idxbase_gate.js $B/src8080/scuba.rom $B/src8080/scubacod1.sym $B/src8080/scubacod1.lst || FAIL=1
echo "== пиксель-гейт: видеопамять байт в байт, все сценарии"
node tools/verify/pixgate.js || FAIL=1
echo "== негативный контроль пиксель-гейта: подсаженный байт должен дать КРАСНЫЙ"
PIXGATE_TICKS=200 PIXGATE_INJECT=1 node tools/verify/pixgate.js screen0 >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт не заметил подсаженный байт"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== негативный контроль пиксель-гейта: пустая выборка должна дать КРАСНЫЙ"
PIXGATE_TICKS=200 PIXGATE_EMPTY=1 node tools/verify/pixgate.js screen0 >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт молчит на пустой выборке"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== юнит-тест замены RRD: все 131072 сочетания входов"
node tools/verify/rrd_unit.js $B/src8080/scuba.rom $B/src8080/scubacod1.sym || FAIL=1
echo "== гейт LA0F5: полный перебор 65536 входов против замороженного свода"
node tools/verify/la0f5_gate.js $B/src8080/scuba.rom $B/src8080/scubacod1.sym || FAIL=1
echo "== негативный контроль: пустая выборка должна дать КРАСНЫЙ"
LA0F5_EMPTY=1 node tools/verify/la0f5_gate.js $B/src8080/scuba.rom $B/src8080/scubacod1.sym >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт молчит на пустой выборке"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== юнит-тест контрактов хелперов (IX+d): прозрачность по флагам и регистрам"
node tools/verify/helpers_unit.js $B/src8080/scuba.rom $B/src8080/scubacod1.sym || FAIL=1
echo "== гейт старта: джойстик (порт 0x0E) и клавиатура, обе сборки"
node tools/verify/joystart_gate.js $B/src8080/scuba.rom $B/src8080/scubacod1.sym i8080 || FAIL=1
node tools/verify/joystart_gate.js $B/src/scuba.rom     $B/src/scubacod1.sym     z80   || FAIL=1
echo "== гейт im 1: правка есть, и кроме неё ничего не сдвинулось"
node tools/verify/im1_gate.js || FAIL=1
echo "== гейт титула: независимость от мусора в IX, обе сборки"
node tools/verify/title_ix_gate.js $B/src8080/scuba.rom $B/src8080/scubacod0.sym $B/src8080/scubacod1.sym || FAIL=1
node tools/verify/title_ix_gate.js $B/src/scuba.rom     $B/src/scubacod0.sym     $B/src/scubacod1.sym     || FAIL=1
echo "== БОЕВОЙ образ (аппаратный генератор ВИ53) + гейт генератора"
SRC=src8080 OUT=$B/prod ./tools/build.sh || FAIL=1
node tools/verify/prng_gate.js $B/prod/scuba.rom $B/prod/scubacod1.sym || FAIL=1
echo "== splash-ROM: сборка и гейт (образ игры внутри обязан остаться байт в байт)"
./tools/splash/build_splash.sh >/dev/null || FAIL=1
node tools/verify/splash_gate.js || FAIL=1
echo "== негативный контроль: подсаженная палитровая запись должна дать КРАСНЫЙ"
SPLASH_INJECT=1 node tools/verify/splash_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт не заметил подмену в палитровой последовательности"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== негативный контроль: пустая палитровая выборка должна дать КРАСНЫЙ"
SPLASH_EMPTY=1 node tools/verify/splash_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт молчит на пустой выборке"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== гейт трассы портов заставки против эталона f79785f (подтверждён на железе)"
node tools/verify/porttrace_gate.js || FAIL=1
echo "== негативный контроль: подсаженная запись в порт должна дать КРАСНЫЙ"
PORTTRACE_INJECT=1 node tools/verify/porttrace_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт не заметил дрейф трассы"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== гейт сборки без старого титула (-DNOTITLE): экран чист, меню работает"
node tools/verify/notitle_gate.js || FAIL=1
echo "== негативный контроль: суженная чистка экрана должна дать КРАСНЫЙ"
NOTITLE_INJECT=1 node tools/verify/notitle_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт не заметил недочищенный экран"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== негативный контроль: пустая выборка должна дать КРАСНЫЙ"
NOTITLE_EMPTY=1 node tools/verify/notitle_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт молчит на пустой выборке"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== гейт HUD: полосы-индикаторы и безопасность сдвига поля на 4 столбца"
node tools/verify/hud_gate.js $B/src8080/scuba.rom $B/src8080/scubacod1.sym || FAIL=1
echo "== негативный контроль: испорченный байт полосы должен дать КРАСНЫЙ"
HUD_INJECT=1 node tools/verify/hud_gate.js $B/src8080/scuba.rom $B/src8080/scubacod1.sym >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт не заметил испорченную полосу"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== негативный контроль: пустая выборка должна дать КРАСНЫЙ"
HUD_EMPTY=1 node tools/verify/hud_gate.js $B/src8080/scuba.rom $B/src8080/scubacod1.sym >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт молчит на пустой выборке"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== гейт RST-векторов: установлены, никем не затираются, стек до них не достаёт"
node tools/verify/rst_gate.js || FAIL=1
echo "== негативный контроль: испорченный вектор должен дать КРАСНЫЙ"
RST_INJECT=1 node tools/verify/rst_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт не заметил порчу вектора"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== негативный контроль: пустая выборка должна дать КРАСНЫЙ"
RST_EMPTY=1 node tools/verify/rst_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт молчит на пустой выборке"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== гейт пула буферов: бронь цела, рабочих страниц хватает с запасом"
node tools/verify/pool_gate.js || FAIL=1
echo "== негативный контроль: пять лишних занятых страниц должны дать КРАСНЫЙ"
POOL_INJECT=1 node tools/verify/pool_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт не заметил исчерпания пула"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== негативный контроль: сброшенная бронь должна дать КРАСНЫЙ"
POOL_FREE=1 node tools/verify/pool_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт не заметил сброса брони"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== негативный контроль: пустая выборка должна дать КРАСНЫЙ"
POOL_EMPTY=1 node tools/verify/pool_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт молчит на пустой выборке"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== гейт звука (расчётная сверка частот с таблицами мелодий)"
node tools/verify/snd_gate.js $B/src8080/scuba.rom $B/src8080/scubacod1.sym || FAIL=1
[ $FAIL = 0 ] && echo "НАБОР ЗЕЛЁНЫЙ" || echo "НАБОР КРАСНЫЙ"
exit $FAIL
