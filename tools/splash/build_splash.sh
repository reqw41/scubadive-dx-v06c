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
# ВНУТРЬ SPLASH КЛАДЁТСЯ СБОРКА БЕЗ СТАРОГО ТИТУЛА. Заставку показывает наш
# стартер своей картинкой; старая титульная картинка после неё — вторая заставка
# подряд, и она же занимает 2055 Б потоком zx0. Бут в этой сборке вместо распаковки
# титула чистит видимые плоскости C000..FFFF (иначе под 4-цветной игровой палитрой
# осталась бы каша из 16-цветного арта заставки).
# NOTITLE=0 — вернуть старое поведение (splash поверх сборки с титулом).
NT=${NOTITLE:-1}
if [ "$NT" = "1" ]; then
  NOTITLE=1 SRC=src8080 OUT=$B/notitle ./tools/build.sh >/dev/null
  GAME=$B/notitle/scuba.rom
else
  GAME=$B/prod/scuba.rom
fi
[ -f "$GAME" ] || { echo "нет образа игры $GAME — собери SRC=src8080 OUT=$B/prod tools/build.sh"; exit 1; }
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
if [ "${RULER:-0}" = "1" ]; then
  BFLAG="-DBANDS=1 -DRULER=1 -DLINE_ITER=${LINE_ITER:-5} -DPAL_REPS=${PAL_REPS:-3}"
  OUTROM="$B/prod/scuba_splash_ruler.rom"
elif [ "${BANDS:-0}" = "1" ]; then
  BFLAG="-DBANDS=1 -DLINE_ITER=${LINE_ITER:-5} -DPAL_REPS=${PAL_REPS:-3}"
  OUTROM="$B/prod/scuba_splash_bands.rom"
else
  BFLAG="-DLINE_ITER=${LINE_ITER:-5} -DPAL_REPS=${PAL_REPS:-3}"
fi
(cd src_splash && "$ROOT/tools/bin/sjasmplus" --nologo --msg=err --i8080 $BFLAG \
   --raw="$ROOT/$B/splash/starter.bin" splash_starter.asm \
   --lst="$ROOT/$B/splash/starter.lst" --sym="$ROOT/$B/splash/starter.sym")
python3 tools/splash/make_rom.py "$GAME" "$B/splash/starter.bin" "$B/splash/planes.raw" "$OUTROM"
