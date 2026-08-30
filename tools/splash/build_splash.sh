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
# NOTITLE=0 — вернуть старое поведение (splash поверх готового $B/prod/scuba.rom).
# Внутрь заставки кладётся БОЕВАЯ сборка: tools/build_prod.sh, тот же набор
# флагов, что у выкладываемого образа. Раньше здесь стояло голое NOTITLE=1, и
# остальные флаги приходили из окружения — образ внутри заставки зависел от
# того, что экспортировал вызывающий.
NT=${NOTITLE:-1}
if [ "$NT" = "1" ]; then
  ./tools/build_prod.sh "$B/notitle" >/dev/null
  GAME=$B/notitle/scuba.rom
else
  GAME=$B/prod/scuba.rom
fi
[ -f "$GAME" ] || { echo "нет образа игры $GAME — собери tools/build_prod.sh $B/prod"; exit 1; }
# $B/prod тоже создаём: при NOTITLE=1 игра собирается в $B/notitle, и на чистом
# каталоге сборки $B/prod не появлялся вовсе — make_rom.py падал с FileNotFoundError.
mkdir -p "$B/splash" "$B/prod"
# КАРТИНКА ЛЕЖИТ В РЕПОЗИТОРИИ, а не в каталоге сборки. Раньше упакованные
# плоскости жили только в build/ (в .gitignore), то есть заставка была
# НЕВОСПРОИЗВОДИМА из чистого клона, а связка «плоскости + палитра» ничем не
# фиксировалась: достаточно было чужого каталога сборки, чтобы образ молча уехал
# на другой арт. Для регрессии «испорченные цвета на железе» это ровно тот класс
# причин, который нельзя оставлять открытым.
if [ -n "$PNG" ]; then
  python3 tools/splash/pack_screen.py "$PNG" "$B/splash/planes.raw" "$B/splash/pal.bin"
  cp "$B/splash/planes.raw" src_splash/splash_planes.raw   # новая картинка -> в репозиторий
else
  [ -f src_splash/splash_planes.raw ] || { echo "нет src_splash/splash_planes.raw: запусти с аргументом <png>"; exit 1; }
  cp src_splash/splash_planes.raw "$B/splash/planes.raw"
  cp src_splash/splash_pal.bin    "$B/splash/pal.bin"
  echo "картинка: вшитые плоскости из репозитория (src_splash/splash_planes.raw)"
fi
python3 tools/splash/score.py
# первые три байта игры — стартер вернёт их на место перед прыжком
dd if="$GAME" of="$B/splash/orig3.bin" bs=1 count=3 status=none
cp "$B/splash/pal.bin" src_splash/splash_pal.bin
cp "$B/splash/orig3.bin" src_splash/orig3.bin
# Дизеринг рельефа разводится по имени: образ с ним нельзя спутать с обычным
# при ручной выкладке на MiSTer.
if [ "${DITHER:-0}" = "1" ]; then DTSFX="_dth"; else DTSFX=""; fi
OUTROM="$B/prod/scuba_splash$DTSFX.rom"
(cd src_splash && "$ROOT/tools/bin/sjasmplus" --nologo --msg=err --i8080 \
   --raw="$ROOT/$B/splash/starter.bin" splash_starter.asm \
   --lst="$ROOT/$B/splash/starter.lst" --sym="$ROOT/$B/splash/starter.sym")
python3 tools/splash/make_rom.py "$GAME" "$B/splash/starter.bin" "$B/splash/planes.raw" "$OUTROM"
