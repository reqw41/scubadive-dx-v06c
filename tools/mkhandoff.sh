#!/bin/sh
# ПАКЕТ ПЕРЕДАЧИ АВТОРУ ОРИГИНАЛА: чистый код с комментариями, документация,
# сборка. Без стенда (tools/verify), без Z80-исходников автора (src, src_ref),
# без истории git. Применение: tools/mkhandoff.sh [каталог=~/projects/scubadive-i8080-handoff]
set -e
cd "$(dirname "$0")/.."
H=${1:-$HOME/projects/scubadive-i8080-handoff}
rm -rf "$H"; mkdir -p "$H/build"
git archive --format=tar HEAD src8080 src_splash src_cas tools/bin tools/build.sh tools/build_prod.sh \
  tools/splash tools/cas tools/z80to8080.py tools/genspec.py tools/gen8080.sh docs README.md | tar -x -C "$H"
rm -f "$H/docs/tool_defects.md"          # дефекты стенда — не про игру
# генерируемые файлы стартера кладём готовыми: сборка стартера вручную не требует score.py
python3 tools/splash/score.py >/dev/null && cp src_splash/splash_music.asm "$H/src_splash/"
printf 'Слепок ветки palette-dither %s, %s.\nСборка: tools/build_prod.sh (игра), tools/splash/build_splash.sh (образ с заставкой),\npython3 tools/cas/make_cas.py (кассета) — либо вручную, см. README.md.\nГотовые образы лежат в build/: scuba.rom, scuba_splash.rom, scuba_kaseta.wav.\nСтенд (потиковая сверка с Z80-оригиналом, гейты) в пакет не входит — он живёт в\nрепозитории разработки; исключение tools/cas/run_tape.js: он проверяет кассету\nсквозняком и требует клон vector06js (путь через $V06JS).\n' \
  "$(git rev-parse --short HEAD)" "$(date +%Y-%m-%d)" > "$H/SNAPSHOT.txt"
# README пакета: раздел про стенд заменяем короткой заметкой
python3 - "$H/README.md" <<'PY'
import sys,re
p=sys.argv[1]; s=open(p).read()
a=s.find('## Стенд'); b=s.find('\n## ',a+1)
note='''## Стенд
В этот пакет стенд не входит (он живёт в репозитории разработки): потиковая
сверка с Z80-оригиналом по восьми сценариям (lockstep), пиксельная сверка
видеопамяти, гейты пула save-under, HUD, демо-режима, LIVES и др. — все правки
в этом коде прошли через него. Упоминания `tools/verify/*.js` в `docs/` —
про него.
'''
s=s[:a]+note+s[b:]
open(p,'w').write(s)
PY
# ГОТОВЫЕ ОБРАЗЫ КЛАДЁМ В ПАКЕТ, а не только исходники: получателю не обязано
# быть чем собирать. Кассету собираем здесь же — она делается из splash-ROM.
if [ -f build/prod/scuba_splash.rom ]; then
  mkdir -p "$H/build"
  cp build/prod/scuba.rom "$H/build/" 2>/dev/null || true
  cp build/prod/scuba_splash.rom "$H/build/"
  python3 tools/cas/make_cas.py >/dev/null 2>&1 && cp build/cas/scuba_kaseta.wav "$H/build/" 2>/dev/null || true
  ls -la "$H/build" | tail -n +2
else
  echo "ВНИМАНИЕ: build/prod/scuba_splash.rom не собран — образы в пакет не попали"
fi
rmdir "$H/build" 2>/dev/null || true
echo "пакет: $H"; du -sh "$H" | cut -f1; find "$H" -type f | wc -l
