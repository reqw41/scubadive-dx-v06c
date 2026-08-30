#!/bin/sh
# ПАКЕТ ПЕРЕДАЧИ АВТОРУ ОРИГИНАЛА: чистый код с комментариями, документация,
# сборка. Без стенда (tools/verify), без Z80-исходников автора (src, src_ref),
# без истории git. Применение: tools/mkhandoff.sh [каталог=~/projects/scubadive-i8080-handoff]
set -e
cd "$(dirname "$0")/.."
H=${1:-$HOME/projects/scubadive-i8080-handoff}
rm -rf "$H"; mkdir -p "$H/build"
git archive --format=tar HEAD src8080 src_splash tools/bin tools/build.sh tools/build_prod.sh \
  tools/splash tools/z80to8080.py tools/genspec.py tools/gen8080.sh docs README.md | tar -x -C "$H"
rm -f "$H/docs/tool_defects.md"          # дефекты стенда — не про игру
# генерируемые файлы стартера кладём готовыми: сборка стартера вручную не требует score.py
python3 tools/splash/score.py >/dev/null && cp src_splash/splash_music.asm "$H/src_splash/"
printf 'Слепок ветки palette-dither %s, %s.\nСборка: tools/build_prod.sh и tools/splash/build_splash.sh, либо вручную — см. README.md.\nСтенд (потиковая сверка с Z80-оригиналом, гейты) в пакет не входит — он живёт в репозитории разработки.\n' \
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
rmdir "$H/build" 2>/dev/null || true
echo "пакет: $H"; du -sh "$H" | cut -f1; find "$H" -type f | wc -l
