#!/bin/sh
# Сборка образа Scuba Dive. Порт nzeemin (Z80) и наша i8080-ветка собираются
# ОДНИМ скриптом: переменная SRC задаёт каталог исходников.
#   SRC=src      -> эталонная Z80-сборка автора  (build/z80/scuba.rom)
#   SRC=src8080  -> наша i8080-ветка             (build/i8080/scuba.rom)
# Порядок повторяет !compile.cmd автора: два прохода по scubacod0 нужны, потому
# что размер ZX0-потока кода известен только после его сжатия.
set -e
cd "$(dirname "$0")/.."
ROOT=$(pwd)
SRC=${SRC:-src}
OUT=${OUT:-build/$(basename "$SRC")}
# DET=1 -> детерминированный ГПСЧ вместо аппаратного счётчика ВИ53. Гейты
# гоняются ТОЛЬКО в этом режиме: аппаратный счётчик зависит от тактов, а
# сборки идут с разной скоростью. Боевой образ собирается без DET.
DETFLAG=""
if [ "${DET:-0}" = "1" ]; then DETFLAG="-DDETERMINISTIC=1"; fi
SJ=$ROOT/tools/bin/sjasmplus
SALV=$ROOT/tools/bin/salvador

rm -rf "$OUT"; mkdir -p "$OUT"
cd "$SRC"

"$SALV" -classic scubascrn.bin "$ROOT/$OUT/scubascrn.zx0" >/dev/null
LZSIZES=$(wc -c < "$ROOT/$OUT/scubascrn.zx0" | tr -d ' ')

# проход 1: размер потока кода ещё неизвестен, ставим заглушку
# Бут НАШЕЙ ветки собирается с --i8080 (гейт чистоты). У Z80-версий флаг снят:
# туда добавлен im 1, а это ED-опкод, которого в i8080-подмножестве нет.
COD0FLAG=""
if [ -f scubai80.asm ]; then COD0FLAG="--i8080"; fi
"$SJ" --nologo --msg=err $DETFLAG $COD0FLAG -DLZSIZES=$LZSIZES -DLZSIZE1=12345 \
  --raw="$ROOT/$OUT/scubacod0.bin" scubacod0.asm \
  --lst="$ROOT/$OUT/scubacod0.lst" --exp=scubacod0.inc

# ГЕЙТ ЧИСТОТЫ: нашу ветку собираем в режиме --i8080 — sjasmplus сам отвергает
# любой Z80-only опкод в исходнике. Это точнее постфактум-разбора .lst.
I8080FLAG=""
if [ -f scubai80.asm ]; then I8080FLAG="--i8080"; fi
"$SJ" --nologo --msg=err $DETFLAG $I8080FLAG --raw="$ROOT/$OUT/scubacod1.bin" scubacod1.asm \
  --lst="$ROOT/$OUT/scubacod1.lst" --sym="$ROOT/$OUT/scubacod1.sym"

"$SALV" -classic "$ROOT/$OUT/scubacod1.bin" "$ROOT/$OUT/scubacod1.zx0" >/dev/null
LZSIZE1=$(wc -c < "$ROOT/$OUT/scubacod1.zx0" | tr -d ' ')

# проход 2: теперь размер известен — бут получает верные адреса
"$SJ" --nologo --msg=err $DETFLAG $COD0FLAG -DLZSIZES=$LZSIZES -DLZSIZE1=$LZSIZE1 \
  --raw="$ROOT/$OUT/scubacod0.bin" scubacod0.asm \
  --lst="$ROOT/$OUT/scubacod0.lst" --exp=scubacod0.inc --sym="$ROOT/$OUT/scubacod0.sym"

cat "$ROOT/$OUT/scubacod0.bin" "$ROOT/$OUT/scubacod1.zx0" "$ROOT/$OUT/scubascrn.zx0" \
  > "$ROOT/$OUT/scuba.rom"

cd "$ROOT"
printf 'cod0=%s  cod1=%s  zx0(cod1)=%s  zx0(scrn)=%s  rom=%s\n' \
  "$(wc -c < "$OUT/scubacod0.bin" | tr -d ' ')" \
  "$(wc -c < "$OUT/scubacod1.bin" | tr -d ' ')" \
  "$LZSIZE1" "$LZSIZES" \
  "$(wc -c < "$OUT/scuba.rom" | tr -d ' ')"
