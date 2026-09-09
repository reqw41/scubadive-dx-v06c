#!/bin/sh
# СБОРКА ПОРТА ЗИМИНА ПОД ВАНИЛЬНЫЙ ВЕКТОР (i8080), с звуком и без.
#
#   tools/build_zimin.sh [OUT]        -> OUT (по умолчанию build/zimin8080)
#   ZXSOUND=1 tools/build_zimin.sh    -> плюс наш патч звука в ВИ53
#
# ЗАЧЕМ. Оригинальный порт nzeemin рассчитан на Вектор С ПЛАТОЙ Z80. Здесь он
# пропускается через наш транслятор Z80 -> i8080 и собирается для штатного
# КР580ВМ80А. Получается «его игра на ванильной машине», без наших правок.
#
# ИСХОДНИКИ БЕРУТСЯ ИЗ ИСТОРИИ, А НЕ ИЗ src/. Каталог src/ в этом репозитории
# давно разошёлся с автором (горизонтальный HUD, починки — больше тысячи строк),
# поэтому берём слепок «as-is» из коммита ZIMIN_REV.
#
# ПАТЧ ЗВУКА НАКЛАДЫВАЕТСЯ ДО ТРАНСЛЯЦИИ. Z80-версия автора НЕМА: ROM_BEEPER
# заглушён `ret` первой же командой. Наш ZXSOUND играет ноту в ВИ53 и написан на
# Z80 — если наложить его ПОСЛЕ трансляции, в i8080-код попадут jr/srl/sbc hl,de
# и сборка развалится (проверено).
#
# ⚠ ГЕЙТЫ НАШЕЙ ВЕТКИ К ЭТОЙ СБОРКЕ НЕПРИМЕНИМЫ: другая раскладка памяти, верх
# кода уезжает за 0xA000 (у нас там данные скрытой плоскости). Из набора имеет
# смысл только гейт частот snd_gate.js.
set -e
cd "$(dirname "$0")/.."
ROOT=$(pwd)
OUT=${1:-build/zimin8080}
ZIMIN_REV=${ZIMIN_REV:-f0218ba}          # слепок «исходник nzeemin as-is»
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

git archive "$ZIMIN_REV" src | tar -x -C "$TMP" --strip-components=1
echo "исходники автора: $ZIMIN_REV ($(ls "$TMP"/*.asm | wc -l | tr -d ' ') файлов)"

if [ "${ZXSOUND:-0}" = "1" ]; then
  python3 - "$TMP" <<'PY'
import re, sys
tmp = sys.argv[1]
ours = open('src/scubacodc.asm', encoding='utf-8').read()
i = ours.index("\tIFDEF ZXSOUND\n\tCALL ZXNote"); j = ours.index("\tENDIF", i) + len("\tENDIF\n")
choice = ours[i:j]
k = ours.index("\tIFDEF ZXSOUND\n; --- НОТА В ВИ53")
m = re.search(r"\n\tENDIF\b", ours[k:]); body = ours[k:k + m.end() + 1]
p = tmp + "/scubacodc.asm"; s = open(p, encoding='utf-8').read()
a = "\tCALL ROM_BEEPER"
if a not in s: sys.exit("в исходниках автора нет CALL ROM_BEEPER — патч звука не наложить")
ls = s.rindex("\n", 0, s.index(a)) + 1; le = s.index("\n", s.index(a)) + 1
open(p, 'w', encoding='utf-8').write(s[:ls] + choice + s[le:] + "\n" + body)
print("патч звука (ВИ53) наложен до трансляции")
PY
fi

python3 tools/z80to8080.py \
  "$TMP/scubacod1.asm" "$TMP/scubacod1.asm" \
  "$TMP/scubacodb.asm" "$TMP/scubacodb.asm" \
  "$TMP/scubacodc.asm" "$TMP/scubacodc.asm" \
  --helpers "$TMP/scubai80.asm" --audit "$ROOT/build/audit_zimin.txt" >/dev/null

python3 - "$TMP" <<'PY'
import sys
p = sys.argv[1] + "/scubacod1.asm"
s = open(p, encoding='utf-8').read()
a = '\tINCLUDE "scubacodc.asm"'
if 'scubai80.asm' not in s:
    i = s.rindex(a) + len(a)
    s = s[:i] + '\n\n; библиотека рекомпиляции Z80 -> i8080 (хелперы (IX+d), ГПСЧ вместо LD A,R)\n\tINCLUDE "scubai80.asm"' + s[i:]
    open(p, 'w', encoding='utf-8').write(s)
PY

# build.sh ждёт каталог ВНУТРИ репозитория (пути от корня), поэтому кладём рядом
SRCDIR=build/zimin_src
rm -rf "$SRCDIR"; cp -r "$TMP" "$SRCDIR"
SRC="$SRCDIR" OUT="$OUT" ZXSOUND=${ZXSOUND:-0} ./tools/build.sh
echo "готово: $OUT/scuba.rom (звук: ${ZXSOUND:-0})"
