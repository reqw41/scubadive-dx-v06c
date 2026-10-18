#!/bin/sh
# ГОТОВЫЕ ОБРАЗЫ В rom/ — одной командой:
#   rom/scuba-dx.rom            — «i8080 DX», боевая сборка (tools/build_prod.sh), грузится с 0x0100
#   rom/scuba-dx-splash.rom     — она же с заставкой и маршем (tools/splash/build_splash.sh), 65280 Б
#   rom/scuba-nzeemin8080.rom   — порт Зимина под i8080 с джойстиком «П» (ветка nzeemin8080, её build.sh)
set -e
cd "$(dirname "$0")/.."
B=${BUILD_DIR:-build}
./tools/build_prod.sh "$B/prod" >/dev/null
BUILD_DIR=$B ./tools/splash/build_splash.sh >/dev/null
mkdir -p rom
cp "$B/prod/scuba.rom" rom/scuba-dx.rom
cp "$B/prod/scuba_splash.rom" rom/scuba-dx-splash.rom
REF=nzeemin8080
git rev-parse --verify -q "$REF" >/dev/null || REF=origin/nzeemin8080
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
git archive "$REF" | tar -x -C "$T"
SJASMPLUS="${SJASMPLUS:-$PWD/tools/bin/sjasmplus}" SALVADOR="${SALVADOR:-$PWD/tools/bin/salvador}" sh "$T/build.sh" >/dev/null
cp "$T/scuba.rom" rom/scuba-nzeemin8080.rom
ls -l rom
