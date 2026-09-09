#!/bin/sh
# БОЕВОЙ НАБОР ФЛАГОВ — ОДНИМ МЕСТОМ.
# Всё, что отличает выкладываемый образ от голой сборки, перечислено здесь и
# больше нигде: раньше этот список переписывали руками в каждой команде, и
# любая забытая буква давала другой образ при том же имени файла.
#
#   tools/build_prod.sh [OUT]        -> OUT (по умолчанию build/prod)
#   DET=1 tools/build_prod.sh OUT    -> детерминированный ГПСЧ (для гейтов)
#
# ТРЁХЦВЕТНАЯ СТАЙКА СНЯТА 2026-09-02, А ТРАКТ ВЫЧИЩЕН 2026-09-08 (владелец:
# «стайку не восстанавливаем, чисти всё»). Синее чернило — это по определению
# пиксель, которого нет в первой плоскости, а save-under точен лишь в пределах
# запаса слота; что уехало дальше, у любого другого существа оставляет пустой
# байт, а у стайки — синюю рыбку. Разбор целиком в docs/cloud_ink.md, код — в
# истории git (флаги CLOUDINK/SCRDIR, файлы scubacloud*.asm).
# Ничего, кроме флагов, скрипт не делает: сама сборка — tools/build.sh.
set -e
cd "$(dirname "$0")/.."
OUT=${1:-build/prod}
exec env \
  NOTITLE=1 HIDVRAM=1 DITHER=1 THINGAUGE=1 BLUESHARK=1 SKYFILL=1 SHELLBLUE=1 \
  SKYGRAD=1 CORAL=05Fh MENUHUD=1 WIDE=${WIDE:-1} BOATFAST=1 MENUART=1 CLOUDS=${CLOUDS:-1} REDINK=${REDINK:-1} MIRROR=${MIRROR:-1} \
  MENUMUS=${MENUMUS:-0} TIMEBASE=${TIMEBASE:-1} TB_FIXED=${TB_FIXED:-0} QPOOL=${QPOOL:-1} PAUSE=${PAUSE:-1} RUS=${RUS:-1} EXPLFADE=${EXPLFADE:-1} GAMEOVER=${GAMEOVER:-1} FASTTILE=${FASTTILE:-1} BLANKDRAW=${BLANKDRAW:-1} NOEELMIR=${NOEELMIR:-1} NOSNAKEMIR=${NOSNAKEMIR:-1} OPENCHEST=${OPENCHEST:-1} NOSND=${NOSND:-0} GODKEY=${GODKEY:-1} MIRIX=${MIRIX:-1} \
  SRC=src8080 OUT="$OUT" tools/build.sh
