#!/bin/sh
# Сборка СТЕРИЛЬНОГО калибровщика растровой палитры — самостоятельный .rom,
# игры внутри нет вовсе. Флагом игры это не является и на штатные образы не
# влияет ничем: отдельный исходник, отдельный каталог сборки.
#   tools/pure/build_pure.sh   ->  build/pure/rastcal.rom
set -e
cd "$(dirname "$0")/../.."
ROOT=$(pwd)
OUT=${OUT:-build/pure}
SJ=$ROOT/tools/bin/sjasmplus
rm -rf "$OUT"; mkdir -p "$OUT"
cd src_pure
# --i8080 — тот же гейт чистоты, что у игры: ассемблер сам отвергнет Z80-опкод.
"$SJ" --nologo --msg=err --i8080 --raw="$ROOT/$OUT/rastcal.rom" rastcal.asm \
  --lst="$ROOT/$OUT/rastcal.lst" --sym="$ROOT/$OUT/rastcal.sym"
cd "$ROOT"
printf 'rastcal.rom=%s Б  md5=%s\n' \
  "$(wc -c < "$OUT/rastcal.rom" | tr -d ' ')" \
  "$(md5 -q "$OUT/rastcal.rom" 2>/dev/null || md5sum "$OUT/rastcal.rom" | cut -d' ' -f1)"
