#!/bin/sh
# БОЕВОЙ НАБОР ФЛАГОВ — ОДНИМ МЕСТОМ.
# Всё, что отличает выкладываемый образ от голой сборки, перечислено здесь и
# больше нигде: раньше этот список переписывали руками в каждой команде, и
# любая забытая буква давала другой образ при том же имени файла.
#
#   tools/build_prod.sh [OUT]        -> OUT (по умолчанию build/prod)
#   DET=1 tools/build_prod.sh OUT    -> детерминированный ГПСЧ (для гейтов)
#
# Ничего, кроме флагов, скрипт не делает: сама сборка — tools/build.sh.
set -e
cd "$(dirname "$0")/.."
OUT=${1:-build/prod}
exec env \
  NOTITLE=1 HIDVRAM=1 DITHER=1 THINGAUGE=1 BLUESHARK=1 SKYFILL=1 SHELLBLUE=1 \
  SKYGRAD=1 CORAL=05Fh MENUHUD=1 WIDE=1 BOATFAST=1 MENUART=1 CLOUDS=1 \
  SRC=src8080 OUT="$OUT" tools/build.sh
