#!/bin/sh
# Сборка splash-ROM. Смена картинки — ОДНА команда:
#   tools/splash/build_splash.sh ~/projects/scubadive-research/splash/v6_256.png
# Без аргумента берётся v5_256.png.
set -e
cd "$(dirname "$0")/../.."
ROOT=$(pwd)
# БЕЗ АРГУМЕНТА КАРТИНКА НЕ ПЕРЕПАКОВЫВАЕТСЯ — берутся уже вшитые плоскости.
# Иначе любая пересборка ради кода молча вернула бы картинку по умолчанию и
# откатила вшитую версию. Смена картинки — только явным аргументом.
PNG=${1:-}
B=${BUILD_DIR:-build}
GAME=$B/prod/scuba.rom
[ -f "$GAME" ] || { echo "нет боевого образа $GAME — собери SRC=src8080 OUT=$B/prod tools/build.sh"; exit 1; }
mkdir -p "$B/splash"
if [ -n "$PNG" ]; then
  python3 tools/splash/pack_screen.py "$PNG" "$B/splash/planes.raw" "$B/splash/pal.bin"
else
  [ -f "$B/splash/planes.raw" ] || { echo "картинка не вшита: запусти с аргументом <png>"; exit 1; }
  echo "картинка: используются уже вшитые плоскости ($B/splash/planes.raw), перепаковки нет"
fi
python3 tools/splash/score.py
# первые три байта игры — стартер вернёт их на место перед прыжком
dd if="$GAME" of="$B/splash/orig3.bin" bs=1 count=3 status=none
cp "$B/splash/pal.bin" src_splash/splash_pal.bin
cp "$B/splash/orig3.bin" src_splash/orig3.bin
# BANDS=1 -> диагностический образ с полосной палитрой, ОТДЕЛЬНЫМ файлом.
# Обычный splash при этом не трогается.
BFLAG=""; OUTROM="$B/prod/scuba_splash.rom"
if [ "${BANDS:-0}" = "1" ]; then
  BFLAG="-DBANDS=1 -DLINE_ITER=${LINE_ITER:-5}"
  OUTROM="$B/prod/scuba_splash_bands.rom"
else
  BFLAG="-DLINE_ITER=${LINE_ITER:-5}"
fi
(cd src_splash && "$ROOT/tools/bin/sjasmplus" --nologo --msg=err --i8080 $BFLAG \
   --raw="$ROOT/$B/splash/starter.bin" splash_starter.asm \
   --lst="$ROOT/$B/splash/starter.lst" --sym="$ROOT/$B/splash/starter.sym")
python3 tools/splash/make_rom.py "$GAME" "$B/splash/starter.bin" "$B/splash/planes.raw" "$OUTROM"
