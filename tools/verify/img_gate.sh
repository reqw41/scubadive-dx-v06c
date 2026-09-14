#!/bin/sh
# ПРАВИЛО №17: СВЕРКА НЕСЖАТЫХ БИНАРЕЙ ВСЕХ БОЕВЫХ КОНФИГУРАЦИЙ.
#
# Один md5 штатной сборки не доказывает ничего о соседней ветке условной
# компиляции. Набор однажды покраснел тринадцатью провалами на конфигурациях
# ZONE и RASTER, а штатная сборка при этом была неизменна — и два прогона подряд
# дали побайтно одинаковые провалы, то есть выглядели как настоящий дефект игры.
# Причина была в генераторе, который переписывает файлы-доноры целиком.
#
# Сверяется ИМЕННО НЕСЖАТЫЙ бинарь (scubacod0.bin и scubacod1.bin), а не ROM:
# размер сжатого потока однажды совпал случайно и потерю в десять байт скрыл бы,
# показав «12015 различий при равном размере» — картину «всё поехало» вместо
# десяти байт. md5 самого ROM тоже сверяется, но как дополнение.
#
# Гейт стоит ПЕРВЫМ в наборе: он собирается за десяток секунд и падает раньше
# дорогих прогонов эмулятора.
#
#   ./tools/verify/img_gate.sh
#   IMG_FREEZE=1  — пересоздать эталон (только осознанно, после разбора причины!)
#   IMG_INJECT=1  — подменить эталон одной конфигурации: гейт обязан покраснеть
#   IMG_EMPTY=1   — не собрать ни одной конфигурации: гейт обязан покраснеть
cd "$(dirname "$0")/../.."
B=${BUILD_DIR:-build}
REF=tools/verify/ref/images.md5
FAIL=0
N=0
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT

MD5() { if command -v md5 >/dev/null 2>&1; then md5 -q "$1"
        else md5sum "$1" | cut -d' ' -f1; fi; }

# name flags...  — конфигурации перечислены здесь и только здесь
build_one() {
  name=$1; shift
  [ "${IMG_EMPTY:-0}" = "1" ] && return 0
  env DET=1 SRC=src8080 OUT="$B/_img_$name" "$@" ./tools/build.sh >/dev/null 2>&1 || {
    echo "  ПРОВАЛ  $name: сборка не собралась"; FAIL=1; return 0; }
  printf '%s %s %s %s\n' "$name" \
    "$(MD5 "$B/_img_$name/scubacod0.bin")" \
    "$(MD5 "$B/_img_$name/scubacod1.bin")" \
    "$(MD5 "$B/_img_$name/scuba.rom")" >> "$TMP"
  N=$((N + 1))
}

# БОЕВАЯ КОНФИГУРАЦИЯ И ОТКЛЮЧЕНИЯ ЕЁ ВЕТОК. build_prod.sh берёт каталог первым
# аргументом и пускает флаги снаружи.
build_prod_cfg() {
  name=$1; shift
  [ "${IMG_EMPTY:-0}" = "1" ] && return 0
  env DET=1 "$@" ./tools/build_prod.sh "$B/_img_$name" >/dev/null 2>&1 || {
    echo "  ПРОВАЛ  $name: сборка не собралась"; FAIL=1; return 0; }
  printf '%s %s %s %s\n' "$name" \
    "$(MD5 "$B/_img_$name/scubacod0.bin")" \
    "$(MD5 "$B/_img_$name/scubacod1.bin")" \
    "$(MD5 "$B/_img_$name/scuba.rom")" >> "$TMP"
  N=$((N + 1))
}

# КОНФИГУРАЦИИ ПЕРЕСОБРАНЫ 2026-09-14. До этого здесь стояли plain/geom/zone/
# raster/geomzone с флагами GEOM, ZONE, RASTER — а этих флагов в исходниках
# больше нет, их сняла чистка мёртвых экспериментов. Гейт при этом не молчал: он
# собирал ПЯТЬ ОДИНАКОВЫХ образов и сверял их с пятью разными старыми эталонами,
# то есть давал пять провалов там, где проверял одну сборку. Ниже — ветки,
# которые в исходниках действительно есть.
build_one      plain
build_prod_cfg prod
build_prod_cfg nowide    WIDE=0
build_prod_cfg nosky     SKYFILL=0
# MIRROR=0 в боевой конфигурации НЕ СОБИРАЕТСЯ и потому не ветка: без отражения
# кадры движения влево хранятся в данных, и образ вылезает за 0A000h (замер:
# SCUBACOD1_END = 0xA29A). Зеркальную ветку стережёт отдельная пара сборок
# mirror/nomirror в наборе — она голая, туда влезает.
build_prod_cfg noclouds  CLOUDS=0
build_prod_cfg nored     REDINK=0

if [ "${IMG_FREEZE:-0}" = "1" ]; then
  mkdir -p "$(dirname "$REF")"; cp "$TMP" "$REF"
  echo "  эталон пересоздан: $REF"; cat "$REF"; exit 0
fi

if [ ! -f "$REF" ]; then
  echo "  ПРОВАЛ  нет эталона $REF — сними его IMG_FREEZE=1 на заведомо зелёном дереве"
  echo "ГЕЙТ НЕДЕЙСТВИТЕЛЕН"; exit 2
fi

# ПУСТАЯ ВЫБОРКА — ОТДЕЛЬНАЯ ПРОВЕРКА С ЧИСЛОМ, а не подразумеваемое условие.
EXP=$(grep -c . "$REF")
if [ "$N" -eq 0 ] || [ "$N" -ne "$EXP" ]; then
  echo "  ПРОВАЛ  собрано конфигураций $N, в эталоне $EXP — выборка неполная"
  echo "ГЕЙТ НЕДЕЙСТВИТЕЛЕН"; exit 2
fi

# ВЫРОЖДЕНИЕ — ОТДЕЛЬНАЯ ПРОВЕРКА. Если две конфигурации дали один и тот же
# бинарь, значит флаг, которым они разведены, мёртв, и гейт сверяет одно и то же
# под разными именами. Ровно так он и прожил неизвестно сколько времени.
DUP=$(cut -d' ' -f2- "$TMP" | sort | uniq -d | grep -c .)
if [ "$DUP" -ne 0 ]; then
  echo "  ПРОВАЛ  $DUP пар конфигураций дали ОДИНАКОВЫЙ бинарь — флаг, который их разводит, мёртв"
  cut -d' ' -f2- "$TMP" | sort | uniq -d | while read -r d; do grep " $d$" "$TMP" | cut -d' ' -f1 | tr '\n' ' '; echo; done
  FAIL=1
fi

REFCUR=$REF
if [ "${IMG_INJECT:-0}" = "1" ]; then
  REFCUR=$(mktemp)
  sed 's/^nosky [0-9a-f]* [0-9a-f]*/zone 00000000000000000000000000000000 11111111111111111111111111111111/' "$REF" > "$REFCUR"
fi

while read -r name c0 c1 rom; do
  [ -z "$name" ] && continue
  line=$(grep "^$name " "$REFCUR")
  if [ -z "$line" ]; then
    echo "  ПРОВАЛ  $name: конфигурации нет в эталоне"; FAIL=1; continue; fi
  set -- $line
  if [ "$c0" = "$2" ] && [ "$c1" = "$3" ] && [ "$rom" = "$4" ]; then
    echo "  ok      $name: cod0 $c0, cod1 $c1, rom $rom"
  else
    echo "  ПРОВАЛ  $name: НЕСЖАТЫЙ БИНАРЬ РАЗОШЁЛСЯ С ЭТАЛОНОМ"
    echo "          cod0 $c0 против $2"
    echo "          cod1 $c1 против $3"
    echo "          rom  $rom против $4"
    FAIL=1
  fi
done < "$TMP"

[ "${IMG_INJECT:-0}" = "1" ] && rm -f "$REFCUR"
[ $FAIL = 0 ] && echo "ГЕЙТ ЗЕЛЁНЫЙ: $N конфигураций байт в байт" \
              || echo "ГЕЙТ КРАСНЫЙ"
exit $FAIL
