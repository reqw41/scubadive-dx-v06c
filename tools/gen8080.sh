#!/bin/sh
# Перегенерация ветки src8080 из src/ транслятором. Одноразовый шаг: после того
# как в src8080 появились ручные правки, ЗАПУСКАТЬ НЕЛЬЗЯ — затрёт их.
set -e
cd "$(dirname "$0")/.."
python3 tools/z80to8080.py \
  src/scubacod1.asm src8080/scubacod1.asm \
  src/scubacodb.asm src8080/scubacodb.asm \
  src/scubacodc.asm src8080/scubacodc.asm \
  --plan build/idxplan.json --helpers src8080/scubai80.asm --audit build/audit.txt
python3 - <<'PY'
p='src8080/scubacod1.asm'
s=open(p,encoding='utf-8').read()
s=s.replace('''SCUBAPANL_ZX0
	INCLUDE "scubapanl.asm"
SCUBACOD1_ENDA''','''SCUBAPANL_ZX0
	INCLUDE "scubapanl.asm"
SCUBACOD1_ENDA

; библиотека рекомпиляции Z80 -> i8080 (хелперы (IX+d), ГПСЧ вместо LD A,R,
; рабочие ячейки). Сгенерирована tools/z80to8080.py, дальше правится руками.
	INCLUDE "scubai80.asm"''')
s=s.replace('ABYTE	-$20 "VECTOR-06C Z80 PORT 2026 NZEEMIN"','ABYTE	-$20 "V06C I8080 PORT: NZEEMIN Z80 BASE"')
open(p,'w',encoding='utf-8').write(s)
PY
