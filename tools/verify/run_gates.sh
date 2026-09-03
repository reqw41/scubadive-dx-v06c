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
echo "== образ с аппаратным генератором ВИ53 (без DET) + гейт генератора"
# ГОЛАЯ сборка без флагов — ТОЛЬКО для prng- и notitle-гейтов, и кладётся в
# $B/bare. Раньше она шла в $B/prod и ЗАТИРАЛА боевой образ build_prod.sh:
# после каждого прогона набора в build/prod лежал образ без BOATFAST/REDINK/
# MIRROR/…, и замеры на нём врали (2026-09-03: «лодка не рисуется» — потому что
# в образе не было модуля лодки). build/prod набор больше не трогает.
SRC=src8080 OUT=$B/bare ./tools/build.sh || FAIL=1
tmo node tools/verify/prng_gate.js $B/bare/scuba.rom $B/bare/scubacod1.sym || FAIL=1
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
# NOTITLE-ГЕЙТ СВЕРЯЕТ ПАРУ «ТЕ ЖЕ ФЛАГИ, С ТИТУЛОМ И БЕЗ», и разницу в размере
# меряет числом байт потока zx0 титула. build_splash.sh кладёт в $B/notitle
# БОЕВУЮ сборку (build_prod.sh), а $B/bare выше собран без флагов — такую пару
# гейт сравнивать не может и краснеет на первой же мере. Пересобираем $B/notitle
# ровно как $B/bare, только без титула. Заставке этот каталог уже не нужен: её
# гейты (splash/porttrace) отработали выше.
NOTITLE=1 SRC=src8080 OUT=$B/notitle ./tools/build.sh || FAIL=1
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
# НА БОЕВОМ ОБРАЗЕ, а не на голой сборке из $B/prod: у безфлаговой нет BOAT_PAGE,
# и гейт проверял бы пустую бронь (разбор — в шапке pool_gate.js).
DET=1 ./tools/build_prod.sh $B/prodd >/dev/null || FAIL=1
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
# ГЕЙТЫ СНЯТЫХ МЕХАНИЗМОВ УДАЛЕНЫ ВМЕСТЕ С НИМИ (2026-08-30). Ушли секции
# -DGEOM (боковая панель, скролл, выравнивание битмапа), -DZONE/-DEVICT
# (ломти верхней зоны, рельеф, кадры дайвера, дом пула, шкалы панели, меню,
# украшения, шрифт подписей) и -DRASTER/-DRASTER_CAL. Их гейты обращались к
# меткам, которых в исходниках больше нет (ZoneCopy, GaugeInit, DrawMenuArt,
# PrintPanelLabels), и запускаться уже не могли.
echo "== пул: буфер save-under не выходит за выданную страницу (сцена со спавном акулы)"
tmo env PO_DIR=$PWD/$B/src8080 node tools/verify/pool_overflow_gate.js || FAIL=1
echo "== негативный контроль: ломоть 64 Б вместо страницы должен дать КРАСНЫЙ"
tmo env PO_DIR=$PWD/$B/src8080 PO_INJECT=1 node tools/verify/pool_overflow_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт не заметил переполнения буфера"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== пул: при суженном бюджете страховка работает и памяти не портит"
tmo env PO_DIR=$PWD/$B/src8080 PO_BUDGET=1 node tools/verify/pool_overflow_gate.js || FAIL=1
echo "== негативный контроль: пустая выборка должна дать КРАСНЫЙ"
tmo env PO_DIR=$PWD/$B/src8080 PO_EMPTY=1 node tools/verify/pool_overflow_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт молчит на пустой выборке"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== пути старта по кнопкам на БОЕВОМ образе без титула (-DNOTITLE)"
DET=1 ./tools/build_prod.sh $B/prodd >/dev/null || FAIL=1
echo "== TIMEBASE: арифметика счётчиков на живом обходе (Δ = 1,2,3,8; счётчики 0..255)"
tmo node tools/verify/timebase_unit.js $B/prodd/scuba.rom $B/prodd/scubacod1.sym || FAIL=1
echo "== QPOOL: инварианты выдачи четвертей (класс, выравнивание, непересечение, бронь), ур.4 и ур.3"
tmo node tools/verify/qpool_gate.js $B/prodd/scuba.rom $B/prodd/scubacod1.sym 4 3000 || FAIL=1
tmo node tools/verify/qpool_gate.js $B/prodd/scuba.rom $B/prodd/scubacod1.sym 3 3000 || FAIL=1
tmo env JOYSTART_NOTITLE=1 node tools/verify/joystart_gate.js $B/prodd/scuba.rom $B/prodd/scubacod1.sym i8080 || FAIL=1
echo "== БОНУСНАЯ ЖИЗНЬ: подсветка цифры LIVES в HUD переезжает (было ;TODO)"
tmo node tools/verify/lives_gate.js $B/src8080 || FAIL=1
echo "== гейт демо-режима: аттракт входит, HUD цел, возвращается в меню с EI, игра стартует"
tmo node tools/verify/attract_gate.js || FAIL=1
echo "== негативный контроль: без возврата в меню должен дать КРАСНЫЙ"
tmo env ATTRACT_INJECT=1 node tools/verify/attract_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт не заметил зависание на выходе из демо"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== негативный контроль: пустая выборка должна дать КРАСНЫЙ"
tmo env ATTRACT_EMPTY=1 node tools/verify/attract_gate.js >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт молчит на пустой выборке"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== негативный контроль: пустая UpdateLives должна дать КРАСНЫЙ"
tmo env LIVES_NOCALL=1 node tools/verify/lives_gate.js $B/src8080 >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт не заметил, что подсветка не переехала"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== негативный контроль: бонуса не было — гейт обязан покраснеть"
tmo env LIVES_EMPTY=1 node tools/verify/lives_gate.js $B/src8080 >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт молчит на пустой выборке"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== зеркальные наборы: картинка равна сборке, которая хранит наборы влево"
DET=1 MIRROR=0 CLOUDINK=0 CURTAIN=0 REDINK=0 NOTITLE=1 HIDVRAM=1 THINGAUGE=1 BLUESHARK=1 \
  SKYFILL=1 SHELLBLUE=1 SKYGRAD=1 MENUHUD=1 WIDE=1 BOATFAST=1 MENUART=1 CLOUDS=1 \
  SRC=src8080 OUT=$B/nomirror ./tools/build.sh >/dev/null || FAIL=1
DET=1 MIRROR=1 CLOUDINK=0 CURTAIN=0 REDINK=0 NOTITLE=1 HIDVRAM=1 THINGAUGE=1 BLUESHARK=1 \
  SKYFILL=1 SHELLBLUE=1 SKYGRAD=1 MENUHUD=1 WIDE=1 BOATFAST=1 MENUART=1 CLOUDS=1 \
  SRC=src8080 OUT=$B/mirror ./tools/build.sh >/dev/null || FAIL=1
tmo node tools/verify/mirror_gate.js $B/nomirror/scuba.rom $B/nomirror/scubacod1.sym \
  $B/mirror/scuba.rom $B/mirror/scubacod1.sym 800 1,2,3,4 || FAIL=1
echo "== негативный контроль: короткое окно не набирает покрытия — КРАСНЫЙ"
tmo env MG_EMPTY=1 node tools/verify/mirror_gate.js $B/nomirror/scuba.rom $B/nomirror/scubacod1.sym \
  $B/mirror/scuba.rom $B/mirror/scubacod1.sym 800 1 >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт зелен на окне, где дефект ещё не наступает"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== негативный контроль: вернуть дайверу признак зеркала — КРАСНЫЙ"
tmo env MG_INJECT=1 node tools/verify/mirror_gate.js $B/nomirror/scuba.rom $B/nomirror/scubacod1.sym \
  $B/mirror/scuba.rom $B/mirror/scubacod1.sym 800 1 >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт не заметил отражённого дайвера"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== шторка: экран, собранный полосами, байт в байт равен собранному блоками"
DET=1 SCRDIR=1 CURTAIN=0 CLOUDINK=1 REDINK=1 MIRROR=1 NOTITLE=1 HIDVRAM=1 DITHER=1 THINGAUGE=1 \
  BLUESHARK=1 SKYFILL=1 SHELLBLUE=1 SKYGRAD=1 CORAL=05Fh MENUHUD=1 WIDE=1 BOATFAST=1 MENUART=1 \
# TB_FIXED=1 у ОБЕИХ: под TIMEBASE сборки с разной ценой тика расходятся по состоянию (Δ разный),
# а гейт сверяет их тик в тик.
  CLOUDS=1 TIMEBASE=1 TB_FIXED=1 SRC=src8080 OUT=$B/blocks ./tools/build.sh >/dev/null || FAIL=1
DET=1 TB_FIXED=1 ./tools/build_prod.sh $B/curtain >/dev/null || FAIL=1
tmo node tools/verify/curtain_gate.js $B/blocks/scuba.rom $B/blocks/scubacod1.sym \
  $B/curtain/scuba.rom $B/curtain/scubacod1.sym 600 1,2,4 || FAIL=1
echo "== негативный контроль: без перерисовок гейт обязан покраснеть"
tmo env CT_EMPTY=1 node tools/verify/curtain_gate.js $B/blocks/scuba.rom $B/blocks/scubacod1.sym \
  $B/curtain/scuba.rom $B/curtain/scubacod1.sym 300 4 >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт отрапортовал зелёным, ничего не сверив"; FAIL=1; } || echo "  ok, красный как и должен"
echo "== негативный контроль: сдвинутая база блоков рельефа должна дать КРАСНЫЙ"
tmo env CT_INJECT=1 node tools/verify/curtain_gate.js $B/blocks/scuba.rom $B/blocks/scubacod1.sym \
  $B/curtain/scuba.rom $B/curtain/scubacod1.sym 300 4 >/dev/null 2>&1 \
  && { echo "  ПРОВАЛ: гейт не заметил, что шторка берёт не те тайлы"; FAIL=1; } || echo "  ok, красный как и должен"
# ГЕЙТЫ ТРЁХЦВЕТНОЙ СТАЙКИ СНЯТЫ ВМЕСТЕ С ФЛАГОМ (2026-09-02). Сам тракт и
# cloud_gate.js остались в дереве: если когда-нибудь браться за честное
# восстановление второй плоскости, начинать надо с них, а не с чистого листа.
echo "== гейт звука (расчётная сверка частот с таблицами мелодий)"
tmo node tools/verify/snd_gate.js $B/src8080/scuba.rom $B/src8080/scubacod1.sym || FAIL=1
[ $FAIL = 0 ] && echo "НАБОР ЗЕЛЁНЫЙ" || echo "НАБОР КРАСНЫЙ"
exit $FAIL
