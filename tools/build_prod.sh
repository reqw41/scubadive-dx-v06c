#!/bin/sh
# БОЕВОЙ НАБОР ФЛАГОВ — ОДНИМ МЕСТОМ.
# Всё, что отличает выкладываемый образ от голой сборки, перечислено здесь и
# больше нигде: раньше этот список переписывали руками в каждой команде, и
# любая забытая буква давала другой образ при том же имени файла.
#
#   tools/build_prod.sh [OUT]        -> OUT (по умолчанию build/prod)
#   DET=1 tools/build_prod.sh OUT    -> детерминированный ГПСЧ (для гейтов)
#
# CLOUDINK СНЯТ 2026-09-02 ПО РЕШЕНИЮ ВЛАДЕЛЬЦА. Трёхцветная стайка работала, но
# синее чернило — это по определению пиксель, которого нет в первой плоскости, а
# save-under в этом движке точен лишь пока существо сдвигается в пределах запаса
# слота (байт по горизонтали, восемь строк по вертикали). Что уезжает дальше,
# восстанавливается только повторным накрытием — и у любого другого существа
# брошенный байт пуст, а у стайки в нём остаётся синяя рыбка. Владелец видел
# это на живом железе стенда; след разобран на паузе Emu80 (столбец 9, строки
# 160-161, при пустой первой плоскости) — docs/cloud_ink.md.
# Стайка снова целиком красная: LC132 возвращается в LB4F0_redtab автоматически,
# ветка IFNDEF CLOUDINK в scubacod1.asm. Сам тракт остаётся в дереве под флагом.
# Ничего, кроме флагов, скрипт не делает: сама сборка — tools/build.sh.
set -e
cd "$(dirname "$0")/.."
OUT=${1:-build/prod}
exec env \
  NOTITLE=1 HIDVRAM=1 DITHER=1 THINGAUGE=1 BLUESHARK=1 SKYFILL=1 SHELLBLUE=1 \
  SKYGRAD=1 CORAL=05Fh MENUHUD=1 WIDE=1 BOATFAST=1 MENUART=1 CLOUDS=${CLOUDS:-1} REDINK=${REDINK:-1} MIRROR=${MIRROR:-1} \
  CURTAIN=${CURTAIN:-0} CLOUDINK=${CLOUDINK:-0} SCRDIR=${SCRDIR:-0} MENUMUS=${MENUMUS:-1} WHEEL=${WHEEL:-0} TIMEBASE=${TIMEBASE:-1} TB_FIXED=${TB_FIXED:-0} QPOOL=${QPOOL:-1} PAUSE=${PAUSE:-1} RUS=${RUS:-1} EXPLFADE=${EXPLFADE:-1} GAMEOVER=${GAMEOVER:-1} FASTTILE=${FASTTILE:-1} BLANKDRAW=${BLANKDRAW:-1} NOEELMIR=${NOEELMIR:-1} NOSNAKEMIR=${NOSNAKEMIR:-1} OPENCHEST=${OPENCHEST:-1} \
  SRC=src8080 OUT="$OUT" tools/build.sh
