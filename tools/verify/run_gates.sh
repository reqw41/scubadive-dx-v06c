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
# ЖЁСТКИЙ ПОТОЛОК НА КАЖДЫЙ ГЕЙТ. Набор дважды вставал намертво на одном и том же
# месте: процесс гейта спал 20-33 минуты с нулевым CPU, и стек (sample) показал
# зависание node в LoadEnvironment — то есть НЕ в игре и не в мере, а в самом
# запуске интерпретатора. Причина среды остаётся неназванной, но правильное
# поведение набора от неё не зависит: гейт, который не уложился в потолок,
# обязан быть УБИТ и засчитан КРАСНЫМ. Висящий набор хуже красного — он не даёт
# даже узнать, что он врёт (урок 25).
GATE_TMO=${GATE_TMO:-900}
tmo() {
  "$@" &
  _p=$!
  # Сторож сам уходит, как только подопечный умер: убивать его из основного
  # потока нельзя — оболочка засоряет лог сообщениями «Terminated: 15» после
  # КАЖДОГО гейта, и настоящие строки в них тонут.
  ( _n=0; while [ "$_n" -lt "$GATE_TMO" ]; do sleep 1; _n=$((_n+1));
      kill -0 "$_p" 2>/dev/null || exit 0; done; kill -9 "$_p" 2>/dev/null ) &
  wait "$_p"; _rc=$?
  if [ "$_rc" -ge 128 ]; then
    echo "  ПРОВАЛ: гейт не уложился в ${GATE_TMO}s и убит по таймауту: $*"
  fi
  return "$_rc"
}
# ВСЕ сверочные образы собираются с DET=1: источник случайности в бою —
# свободно бегущий счётчик ВИ53, а он зависит от протикавших тактов. Наша сборка
# и эталон идут с разной скоростью, поэтому потиковая сверка с аппаратным
# генератором невозможна В ПРИНЦИПЕ. Боевой образ (без DET) проверяется
# отдельным гейтом prng_gate.
# ПЕРВАЯ СЕКЦИЯ — ПРАВИЛО №17. Несжатые бинари всех боевых конфигураций против
# замороженного эталона. Стоит первой намеренно: собирается за десяток секунд и
# падает РАНЬШЕ дорогих прогонов эмулятора. Однажды набор краснел тринадцатью
# провалами на ZONE и RASTER, штатная сборка при этом была неизменна, и два
# прогона подряд дали побайтно одинаковые провалы — полдня ушло на поиск дефекта
# игры, которого не было.
echo "== ПРАВИЛО №17: несжатые бинари пяти боевых конфигураций против эталона"
tmo ./tools/verify/img_gate.sh || FAIL=1
echo "== негативный контроль: подменённый эталон должен дать КРАСНЫЙ"
tmo env IMG_INJECT=1 ./tools/verify/img_gate.sh >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт не заметил подмены эталона"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== негативный контроль: пустая выборка должна дать КРАСНЫЙ"
tmo env IMG_EMPTY=1 ./tools/verify/img_gate.sh >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт молчит на пустой выборке"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== сборка всех образов (сверочные — детерминированные, DET=1)"
python3 tools/mkref.py || FAIL=1                 # src_ref = src + подмена LD A,R
DET=1 SRC=src     OUT=$B/src     ./tools/build.sh || FAIL=1     # Z80-версия автора (+ наши правки)
DET=1 SRC=src_ref OUT=$B/src_ref ./tools/build.sh || FAIL=1     # эталон для потиковой сверки
echo "== гейт сборки и i8080-чистоты (sjasmplus --i8080 отвергает Z80-опкоды)"
DET=1 SRC=src8080 OUT=$B/src8080 ./tools/build.sh || FAIL=1
echo "== lockstep, все сценарии"
tmo node tools/verify/lockstep.js || FAIL=1
echo "== негативный контроль: подсаженный сдвиг X должен дать КРАСНЫЙ"
tmo env LOCKSTEP_TICKS=200 LOCKSTEP_INJECT=dX node tools/verify/lockstep.js idle >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт не заметил подсаженный дефект"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== негативный контроль: пустая выборка должна дать КРАСНЫЙ"
tmo env LOCKSTEP_TICKS=200 LOCKSTEP_EMPTY=1 node tools/verify/lockstep.js idle >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт молчит на пустой выборке"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== сторож базы: прямая адресация читает ту базу, на которую рассчитана"
tmo node tools/verify/idxbase_gate.js $B/src8080/scuba.rom $B/src8080/scubacod1.sym $B/src8080/scubacod1.lst || FAIL=1
echo "== пиксель-гейт: видеопамять байт в байт, все сценарии"
tmo node tools/verify/pixgate.js || FAIL=1
echo "== негативный контроль пиксель-гейта: подсаженный байт должен дать КРАСНЫЙ"
tmo env PIXGATE_TICKS=200 PIXGATE_INJECT=1 node tools/verify/pixgate.js screen0 >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт не заметил подсаженный байт"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== негативный контроль пиксель-гейта: пустая выборка должна дать КРАСНЫЙ"
tmo env PIXGATE_TICKS=200 PIXGATE_EMPTY=1 node tools/verify/pixgate.js screen0 >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт молчит на пустой выборке"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== юнит-тест замены RRD: все 131072 сочетания входов"
tmo node tools/verify/rrd_unit.js $B/src8080/scuba.rom $B/src8080/scubacod1.sym || FAIL=1
echo "== гейт LA0F5: полный перебор 65536 входов против замороженного свода"
tmo node tools/verify/la0f5_gate.js $B/src8080/scuba.rom $B/src8080/scubacod1.sym || FAIL=1
echo "== негативный контроль: пустая выборка должна дать КРАСНЫЙ"
tmo env LA0F5_EMPTY=1 node tools/verify/la0f5_gate.js $B/src8080/scuba.rom $B/src8080/scubacod1.sym >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт молчит на пустой выборке"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== юнит-тест контрактов хелперов (IX+d): прозрачность по флагам и регистрам"
tmo node tools/verify/helpers_unit.js $B/src8080/scuba.rom $B/src8080/scubacod1.sym || FAIL=1
echo "== гейт старта: джойстик (порт 0x0E) и клавиатура, обе сборки"
tmo node tools/verify/joystart_gate.js $B/src8080/scuba.rom $B/src8080/scubacod1.sym i8080 || FAIL=1
tmo node tools/verify/joystart_gate.js $B/src/scuba.rom     $B/src/scubacod1.sym     z80   || FAIL=1
echo "== гейт im 1: правка есть, и кроме неё ничего не сдвинулось"
tmo node tools/verify/im1_gate.js || FAIL=1
echo "== гейт титула: независимость от мусора в IX, обе сборки"
tmo node tools/verify/title_ix_gate.js $B/src8080/scuba.rom $B/src8080/scubacod0.sym $B/src8080/scubacod1.sym || FAIL=1
tmo node tools/verify/title_ix_gate.js $B/src/scuba.rom     $B/src/scubacod0.sym     $B/src/scubacod1.sym     || FAIL=1
echo "== БОЕВОЙ образ (аппаратный генератор ВИ53) + гейт генератора"
SRC=src8080 OUT=$B/prod ./tools/build.sh || FAIL=1
tmo node tools/verify/prng_gate.js $B/prod/scuba.rom $B/prod/scubacod1.sym || FAIL=1
echo "== splash-ROM: сборка и гейт (образ игры внутри обязан остаться байт в байт)"
./tools/splash/build_splash.sh >/dev/null || FAIL=1
tmo node tools/verify/splash_gate.js || FAIL=1
echo "== негативный контроль: подсаженная палитровая запись должна дать КРАСНЫЙ"
tmo env SPLASH_INJECT=1 node tools/verify/splash_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт не заметил подмену в палитровой последовательности"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== негативный контроль: пустая палитровая выборка должна дать КРАСНЫЙ"
tmo env SPLASH_EMPTY=1 node tools/verify/splash_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт молчит на пустой выборке"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== гейт трассы портов заставки против эталона f79785f (подтверждён на железе)"
tmo node tools/verify/porttrace_gate.js || FAIL=1
echo "== негативный контроль: подсаженная запись в порт должна дать КРАСНЫЙ"
tmo env PORTTRACE_INJECT=1 node tools/verify/porttrace_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт не заметил дрейф трассы"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== гейт сборки без старого титула (-DNOTITLE): экран чист, меню работает"
tmo node tools/verify/notitle_gate.js || FAIL=1
echo "== негативный контроль: суженная чистка экрана должна дать КРАСНЫЙ"
tmo env NOTITLE_INJECT=1 node tools/verify/notitle_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт не заметил недочищенный экран"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== негативный контроль: пустая выборка должна дать КРАСНЫЙ"
tmo env NOTITLE_EMPTY=1 node tools/verify/notitle_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт молчит на пустой выборке"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== гейт HUD: полосы-индикаторы и безопасность сдвига поля на 4 столбца"
tmo node tools/verify/hud_gate.js $B/src8080/scuba.rom $B/src8080/scubacod1.sym || FAIL=1
echo "== негативный контроль: испорченный байт полосы должен дать КРАСНЫЙ"
tmo env HUD_INJECT=1 node tools/verify/hud_gate.js $B/src8080/scuba.rom $B/src8080/scubacod1.sym >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт не заметил испорченную полосу"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== негативный контроль: пустая выборка должна дать КРАСНЫЙ"
tmo env HUD_EMPTY=1 node tools/verify/hud_gate.js $B/src8080/scuba.rom $B/src8080/scubacod1.sym >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт молчит на пустой выборке"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== гейт RST-векторов: установлены, никем не затираются, стек до них не достаёт"
tmo node tools/verify/rst_gate.js || FAIL=1
echo "== негативный контроль: испорченный вектор должен дать КРАСНЫЙ"
tmo env RST_INJECT=1 node tools/verify/rst_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт не заметил порчу вектора"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== негативный контроль: пустая выборка должна дать КРАСНЫЙ"
tmo env RST_EMPTY=1 node tools/verify/rst_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт молчит на пустой выборке"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== гейт пула буферов: бронь цела, рабочих страниц хватает с запасом"
tmo node tools/verify/pool_gate.js || FAIL=1
echo "== негативный контроль: пять лишних занятых страниц должны дать КРАСНЫЙ"
tmo env POOL_INJECT=1 node tools/verify/pool_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт не заметил исчерпания пула"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== негативный контроль: сброшенная бронь должна дать КРАСНЫЙ"
tmo env POOL_FREE=1 node tools/verify/pool_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт не заметил сброса брони"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== негативный контроль: пустая выборка должна дать КРАСНЫЙ"
tmo env POOL_EMPTY=1 node tools/verify/pool_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт молчит на пустой выборке"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== этап 3: геометрия зоны и боковая панель (-DGEOM)"
DET=1 GEOM=1 SRC=src8080 OUT=$B/geomonly ./tools/build.sh || FAIL=1
tmo node tools/verify/geom_gate.js || FAIL=1
echo "== негативный контроль: поле, вернувшееся наверх, должно дать КРАСНЫЙ"
tmo env GEOM_INJECT=1 node tools/verify/geom_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт не заметил поле в зоне"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== негативный контроль: пустая выборка должна дать КРАСНЫЙ"
tmo env GEOM_EMPTY=1 node tools/verify/geom_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт молчит на пустой выборке"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== гейт скролла: поле прижато, зона уехала вниз, ввод жив"
tmo node tools/verify/scroll_gate.js || FAIL=1
echo "== негативный контроль: скролл, не восстановленный после скана, должен дать КРАСНЫЙ"
tmo env SCROLL_INJECT=1 node tools/verify/scroll_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт не заметил маску скана в порту 3"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== негативный контроль: пустая выборка должна дать КРАСНЫЙ"
tmo env SCROLL_EMPTY=1 node tools/verify/scroll_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт молчит на пустой выборке"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== гейт HUD в режиме ВЕРТИКАЛЬНОЙ ПАНЕЛИ (раскладка оригинала)"
tmo env HUD_PANEL=1 node tools/verify/hud_gate.js $B/geomonly/scuba.rom $B/geomonly/scubacod1.sym || FAIL=1
echo "== негативный контроль: испорченный байт ползунка должен дать КРАСНЫЙ"
tmo env HUD_PANEL=1 HUD_INJECT=1 node tools/verify/hud_gate.js $B/geomonly/scuba.rom $B/geomonly/scubacod1.sym >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт не заметил испорченный ползунок"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== негативный контроль: пустая выборка должна дать КРАСНЫЙ"
tmo env HUD_PANEL=1 HUD_EMPTY=1 node tools/verify/hud_gate.js $B/geomonly/scuba.rom $B/geomonly/scubacod1.sym >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт молчит на пустой выборке"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== ВЫРАВНИВАНИЕ ПАНЕЛИ: относительная позиция панель-против-поля как у Зимина"
tmo env OUT=$B/geomonly ./tools/verify/mkpanlref.sh || FAIL=1
tmo node tools/verify/panel_align_gate.js || FAIL=1
echo "== негативный контроль: старый, невыровненный битмап должен дать КРАСНЫЙ"
tmo env PANEL_INJECT=1 node tools/verify/panel_align_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт не заметил невыровненную панель"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== негативный контроль: неверный сдвиг эталона должен дать КРАСНЫЙ"
tmo env PANEL_SHIFT=0 node tools/verify/panel_align_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт не заметил нулевой сдвиг"; FAIL=1; } || echo "  ok, красный как и должен"
tmo env PANEL_SHIFT=16 node tools/verify/panel_align_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт не заметил сдвиг на 16"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== негативный контроль: пустая выборка должна дать КРАСНЫЙ"
tmo env PANEL_EMPTY=1 node tools/verify/panel_align_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт молчит на пустой выборке"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== этап 2 планировки видеопамяти: пул в ломтях верхней зоны (-DZONE)"
DET=1 ZONE=1 SRC=src8080 OUT=$B/zone ./tools/build.sh || FAIL=1
tmo node tools/verify/zone_gate.js || FAIL=1
echo "== негативный контроль: буфер 256 Б, загнанный в ломоть 48 Б, должен дать КРАСНЫЙ"
tmo env ZONE_INJECT=1 node tools/verify/zone_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт не заметил переполнения ломтя"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== негативный контроль: пустая выборка должна дать КРАСНЫЙ"
tmo env ZONE_EMPTY=1 node tools/verify/zone_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт молчит на пустой выборке"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== диагностический растровый образ (-DRASTER) и его гейт"
DET=1 RASTER=1 SRC=src8080 OUT=$B/raster ./tools/build.sh || FAIL=1
tmo node tools/verify/raster_gate.js || FAIL=1
echo "== негативный контроль: сдвинутая цель довводки должна дать КРАСНЫЙ"
tmo env RASTER_INJECT=1 node tools/verify/raster_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт не заметил уехавший из окна каймы залп"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== негативный контроль: пустая выборка должна дать КРАСНЫЙ"
tmo env RASTER_EMPTY=1 node tools/verify/raster_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт молчит на пустой выборке"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== самокалибрующийся растровый образ (-DRASTER_CAL) и его гейт"
DET=1 RASTER=1 RASTER_CAL=1 SRC=src8080 OUT=$B/rcal ./tools/build.sh || FAIL=1
tmo node tools/verify/raster_cal_gate.js || FAIL=1
echo "== негативный контроль: лестница без шага должна дать КРАСНЫЙ"
tmo env RASTER_CAL_INJECT=1 node tools/verify/raster_cal_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт не заметил, что лестница стоит на месте"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== негативный контроль: пустая выборка должна дать КРАСНЫЙ"
tmo env RASTER_CAL_EMPTY=1 node tools/verify/raster_cal_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт молчит на пустой выборке"; FAIL=1; } || echo "  ok, красный как и должен"
# --- ЭТАП 3: ВЫСЕЛЕНИЕ В ЛОМТИ (-DEVICT) -------------------------------------
# Собирается ДВЕ сборки: боевая EVICT и её ровесница GEOM+ZONE без выселения.
# Вторая нужна не для красоты: рельеф адресуется арифметикой от базы, и
# доказательство правильности переноса — сверка РЕЗУЛЬТАТА с безвыселенной
# сборкой, а не рассуждение о формуле.
echo "== этап 3: выселение в ломти верхней зоны (-DEVICT), сборка обеих ровесниц"
DET=1 SRC=src8080 GEOM=1 ZONE=1 EVICT=1 OUT=$B/ev    ./tools/build.sh || FAIL=1
DET=1 SRC=src8080 GEOM=1 ZONE=1          OUT=$B/gzref ./tools/build.sh || FAIL=1
echo "== гейт границ зоны: карта ломтей, рельеф сплошным рядом, ни кода, ни пула"
tmo node tools/verify/zone_bounds_gate.js || FAIL=1
echo "== негативный контроль: сдвинутая карта ломтей должна дать КРАСНЫЙ"
tmo env BOUNDS_INJECT=1 node tools/verify/zone_bounds_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт не заметил сдвига карты"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== негативный контроль: дыра в ряду ломтей рельефа должна дать КРАСНЫЙ"
tmo env BOUNDS_RELF=1 node tools/verify/zone_bounds_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт не заметил разрыва ряда рельефа"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== негативный контроль: дыра в ряду ломтей кадров дайвера должна дать КРАСНЫЙ"
tmo env BOUNDS_DIVR=1 node tools/verify/zone_bounds_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт не заметил разрыва ряда кадров"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== негативный контроль: конец кода выше плоскости 1 должен дать КРАСНЫЙ"
tmo env BOUNDS_CODE=1 node tools/verify/zone_bounds_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: страж кода не сторожит"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== негативный контроль: пустая выборка должна дать КРАСНЫЙ"
tmo env BOUNDS_EMPTY=1 node tools/verify/zone_bounds_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт молчит на пустой выборке"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== гейт рельефа: чтения по ВСЕЙ карте против безвыселенной сборки"
tmo node tools/verify/relief_gate.js || FAIL=1
echo "== негативный контроль: испорченный байт рельефа должен дать КРАСНЫЙ"
tmo env RELIEF_LEVELS=1 RELIEF_INJECT=1 node tools/verify/relief_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт не заметил порчи рельефа"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== негативный контроль: подсадка в хвост блока должна дать КРАСНЫЙ"
tmo env RELIEF_LEVELS=1 RELIEF_TAB=1 node tools/verify/relief_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт не заметил подсадки в хвост блока"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== негативный контроль: вырезанный перенос курсора должен дать КРАСНЫЙ"
tmo env RELIEF_LEVELS=1 RELIEF_NOWRAP=1 node tools/verify/relief_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт не заметил курсора без переноса"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== негативный контроль: пустая выборка должна дать КРАСНЫЙ"
tmo env RELIEF_EMPTY=1 node tools/verify/relief_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт молчит на пустой выборке"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== пул: буфер save-under не выходит за выданный ломоть (сцена со спавном акулы)"
tmo node tools/verify/pool_overflow_gate.js || FAIL=1
echo "== негативный контроль: все шаблоны размечены мелкими — крупный сядет в ломоть"
tmo env PO_INJECT=1 node tools/verify/pool_overflow_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт не заметил переполнения ломтя"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== пул: ПЯТЫЙ КРУПНЫЙ не портит память (бюджет сужен до одной четвёрки)"
tmo env PO_QUAD1=1 node tools/verify/pool_overflow_gate.js || FAIL=1
echo "== негативный контроль: пустая выборка должна дать КРАСНЫЙ"
tmo env PO_EMPTY=1 node tools/verify/pool_overflow_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт молчит на пустой выборке"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== сцена «смерть на дне»: ломти целы после гибели у нижней кромки"
tmo node tools/verify/bottom_probe.js || FAIL=1
echo "== негативный контроль: испорченный байт ломтя должен дать КРАСНЫЙ"
tmo env BP_INJECT=1 node tools/verify/bottom_probe.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: сцена не заметила порчи ломтя"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== негативный контроль: пустая выборка должна дать КРАСНЫЙ"
tmo env BP_EMPTY=1 node tools/verify/bottom_probe.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: сцена молчит на пустой выборке"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== гейт меню: текст на прежних местах экрана, ломти после смерти целы"
tmo node tools/verify/menu_gate.js || FAIL=1
echo "== негативный контроль: неверная компенсация развёртки должна дать КРАСНЫЙ"
tmo env MENU_OFF=63 node tools/verify/menu_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: сверка картинки меню сверяет не то"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== негативный контроль: испорченный байт ломтя должен дать КРАСНЫЙ"
tmo env MENU_INJECT=1 node tools/verify/menu_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт не заметил порчи ломтя"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== негативный контроль: пустая выборка должна дать КРАСНЫЙ"
tmo env MENU_EMPTY=1 node tools/verify/menu_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт молчит на пустой выборке"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== гейт кадров дайвера: обратное отображение адреса ломтя в смещение массива"
tmo node tools/verify/sprite_gate.js || FAIL=1
echo "== негативный контроль: неразложенный ломоть кадров должен дать КРАСНЫЙ"
tmo env SPRITE_LEVELS=1 SPRITE_TEAR=1 node tools/verify/sprite_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт не заметил разрыва массива"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== негативный контроль: испорченный байт кадра должен дать КРАСНЫЙ"
tmo env SPRITE_LEVELS=1 SPRITE_INJECT=1 node tools/verify/sprite_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт не заметил порчи кадра"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== негативный контроль: переставленные ломти должны дать КРАСНЫЙ"
tmo env SPRITE_LEVELS=1 SPRITE_SWAP=1 node tools/verify/sprite_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт не заметил перестановки ломтей"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== негативный контроль: имя существа в плане должно дать КРАСНЫЙ"
tmo env SPRITE_DTEST=1 SPRITE_LEVELS=1 node tools/verify/sprite_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт не заметил выселенного набора существа"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== негативный контроль: пустая выборка должна дать КРАСНЫЙ"
tmo env SPRITE_EMPTY=1 node tools/verify/sprite_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт молчит на пустой выборке"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== пути старта по кнопкам НА EVICT-образе (титул ENTER/FIRE1/FIRE2 -> меню)"
tmo node tools/verify/joystart_gate.js $B/ev/scuba.rom $B/ev/scubacod1.sym i8080 || FAIL=1
echo "== пути старта на EVICT-образе БЕЗ титула (-DNOTITLE)"
DET=1 SRC=src8080 GEOM=1 ZONE=1 EVICT=1 NOTITLE=1 OUT=$B/evnt ./tools/build.sh || FAIL=1
tmo env JOYSTART_NOTITLE=1 node tools/verify/joystart_gate.js $B/evnt/scuba.rom $B/evnt/scubacod1.sym i8080 || FAIL=1
echo "== гейт звука (расчётная сверка частот с таблицами мелодий)"
tmo node tools/verify/snd_gate.js $B/src8080/scuba.rom $B/src8080/scubacod1.sym || FAIL=1
[ $FAIL = 0 ] && echo "НАБОР ЗЕЛЁНЫЙ" || echo "НАБОР КРАСНЫЙ"
exit $FAIL
