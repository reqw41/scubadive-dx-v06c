#!/bin/sh
# Сборка splash-ROM. Смена картинки — ОДНА команда:
#   tools/splash/build_splash.sh ~/projects/scubadive-research/splash/v6_256.png
# Без аргумента берётся v5_256.png.
set -e
cd "$(dirname "$0")/../.."
ROOT=$(pwd)
PNG=${1:-$HOME/projects/scubadive-research/splash/v5_256.png}
B=${BUILD_DIR:-build}
GAME=$B/prod/scuba.rom
[ -f "$GAME" ] || { echo "нет боевого образа $GAME — собери SRC=src8080 OUT=$B/prod tools/build.sh"; exit 1; }
mkdir -p "$B/splash"
python3 tools/splash/pack_screen.py "$PNG" "$B/splash/planes.raw" "$B/splash/pal.bin"
python3 tools/splash/score.py
# первые три байта игры — стартер вернёт их на место перед прыжком
dd if="$GAME" of="$B/splash/orig3.bin" bs=1 count=3 status=none
cp "$B/splash/pal.bin" "$B/splash/orig3.bin" src_splash/ 2>/dev/null || true
cp "$B/splash/pal.bin" src_splash/splash_pal.bin
cp "$B/splash/orig3.bin" src_splash/orig3.bin
(cd src_splash && "$ROOT/tools/bin/sjasmplus" --nologo --msg=err --i8080 \
   --raw="$ROOT/$B/splash/starter.bin" splash_starter.asm \
   --lst="$ROOT/$B/splash/starter.lst" --sym="$ROOT/$B/splash/starter.sym")
python3 tools/splash/make_rom.py "$GAME" "$B/splash/starter.bin" "$B/splash/planes.raw" "$B/prod/scuba_splash.rom"
