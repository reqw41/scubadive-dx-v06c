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
# NOTITLE=1 -> сборка БЕЗ старой титульной картинки: бут чистит экран вместо её
# распаковки, и поток zx0(scrn) в образ не дописывается вовсе. Для splash-ROM,
# где заставку показывает своя картинка. Чистая сборка (без флага) не меняется
# ни байтом — ветка стоит под IFNDEF.
# ZXSOUND=1 -> звук Z80-сборки через ВИ53 вместо заглушённого бипера. Флаг ставится
# ТОЛЬКО для отдельной Z80-сборки владельцу: оракул src_ref и наша ветка src8080
# собираются без него, поэтому патч в них не ассемблируется и lockstep не видит
# блокирующего проигрывания.
ZXSFLAG=""
if [ "${ZXSOUND:-0}" = "1" ]; then ZXSFLAG="-DZXSOUND=1"; fi
NTFLAG=""
if [ "${NOTITLE:-0}" = "1" ]; then NTFLAG="-DNOTITLE=1"; fi
# RASTER=1 -> ДИАГНОСТИЧЕСКИЙ образ растровой палитры: слот 0 (фон) перекрашивается
# три раза за кадр по строкам растра (небо/вода/фон HUD), цвета нарочно контрастные.
# Флаг развязан ровно как ZXSOUND: без него ни одного байта растрового кода в образ
# не ассемблируется, и штатные образы обязаны совпадать байт в байт (это сверяет
# tools/verify/raster_gate.js своим контролем чистоты).
# RASTER_SPLIT=1 -> вариант врезки «рандеву разнесены по тику»: замерен, выигрыша не
# даёт (239 полных кадров из 300 против 237), оставлен как отрицательный результат.
RASTFLAG=""
if [ "${RASTER:-0}" = "1" ]; then RASTFLAG="-DRASTER=1"; fi
# DITHER=1 -> рельеф кладётся во вторую плоскость через шахматную маску: смесь
# двух чернил вместо сплошного индекса 3. Палитру не трогает.
DITHFLAG=""
if [ "${DITHER:-0}" = "1" ]; then DITHFLAG="-DDITHER=1"; fi
# THINGAUGE=1 -> узкие шкалы кислорода и глубины: корыто 4 px вместо 8.
if [ "${THINGAUGE:-0}" = "1" ]; then DITHFLAG="$DITHFLAG -DTHINGAUGE=1"; fi
if [ "${RASTER_SPLIT:-0}" = "1" ]; then RASTFLAG="$RASTFLAG $DITHFLAG -DRASTER_SPLIT=1"; fi
# RASTER_CAL=1 -> САМОКАЛИБРУЮЩИЙСЯ образ: фаза залпа сама идёт лестницей из 16
# ступеней по 12 тактов (ровно одна растровая строка), ступень меняется раз в 150
# кадров, номер ступени показан числом жёлтых квадратиков в верхней строке экрана.
if [ "${RASTER_CAL:-0}" = "1" ]; then RASTFLAG="$RASTFLAG $DITHFLAG -DRASTER_CAL=1"; fi
# ZONE=1 -> этап 2 планировки видеопамяти: шесть 48-байтовых буферов пула
# переезжают в ломти верхней зоны (плоскость 0xC000, строки картинки 0..47),
# две полные страницы остаются на 0xB000/0xB100. Освобождает 0xB200..0xBFFF.
ZONEFLAG=""
if [ "${ZONE:-0}" = "1" ]; then ZONEFLAG="-DZONE=1"; fi
# GEOM=1 -> этап 3, шаг геометрии: поле вниз на 64 строки и влево на 4 столбца.
# ПРОМЕЖУТОЧНЫЙ образ: HUD пока остаётся горизонтальным и с полем перекрывается —
# флаг существует, чтобы проверить арифметику геометрии отдельно от перекладки HUD.
GEOMFLAG=""
if [ "${GEOM:-0}" = "1" ]; then GEOMFLAG="-DGEOM=1"; fi
# EVICT=1 -> выселение блоков данных в ломти верхней зоны (генератор tools/mkzone.py).
EVICTFLAG=""
if [ "${EVICT:-0}" = "1" ]; then EVICTFLAG="-DEVICT=1"; fi
# HIDVRAM=1 -> ветка palette-bands: рельеф, кадры дайвера и взрыв лежат сплошняком
# в скрытой плоскости 1 (0xA000..0xAFBF), пул как у Зимина на 0xB000, видимые
# C000/E000 — только картинка. Нижний HUD (без -DGEOM) + растр неба/воды/HUD.
# С EVICT не сочетать: оба претендуют на 0xA000.
HIDFLAG=""
if [ "${HIDVRAM:-0}" = "1" ]; then HIDFLAG="-DHIDVRAM=1"; fi
if [ -n "$HIDFLAG" ] && [ -n "$EVICTFLAG" ]; then
  echo "HIDVRAM и EVICT вместе нельзя: оба сажают данные на 0xA000"
  exit 2
fi
# PAL=A|B|C -> ДЕМОНСТРАЦИОННАЯ ПАЛИТРА для владельца. Правит ровно три байта
# таблицы цветов (см. шапку в scubacod0.asm), кода не добавляет ни байта, размер
# образа не меняет. Без флага палитра штатная и образы совпадают байт в байт —
# это сверяет правило №17 на пяти конфигурациях.
# Имя символа НЕ начинается с «PAL» намеренно: sjasmplus подставляет -D-флаг
# ТЕКСТУАЛЬНО, и символ вроде PALETTE превратился бы в «Ah_ETTE» (урок №10).
PALFLAG=""
case "${PAL:-}" in
  A) PALFLAG="-DCLRSET=1" ;;
  B) PALFLAG="-DCLRSET=2" ;;
  C) PALFLAG="-DCLRSET=3" ;;
  "") ;;
  *) echo "PAL: ожидается A, B или C, получено '$PAL'"; exit 2 ;;
esac

SJ=$ROOT/tools/bin/sjasmplus
SALV=$ROOT/tools/bin/salvador

rm -rf "$OUT"; mkdir -p "$OUT"
cd "$SRC"

if [ -z "$NTFLAG" ]; then
  "$SALV" -classic scubascrn.bin "$ROOT/$OUT/scubascrn.zx0" >/dev/null
  LZSIZES=$(wc -c < "$ROOT/$OUT/scubascrn.zx0" | tr -d ' ')
else
  : > "$ROOT/$OUT/scubascrn.zx0"; LZSIZES=0
fi

# проход 1: размер потока кода ещё неизвестен, ставим заглушку
# Бут НАШЕЙ ветки собирается с --i8080 (гейт чистоты). У Z80-версий флаг снят:
# туда добавлен im 1, а это ED-опкод, которого в i8080-подмножестве нет.
COD0FLAG=""
if [ -f scubai80.asm ]; then COD0FLAG="--i8080"; fi
"$SJ" --nologo --msg=err $DETFLAG $NTFLAG $ZXSFLAG $RASTFLAG $DITHFLAG $ZONEFLAG $GEOMFLAG $EVICTFLAG $HIDFLAG $PALFLAG $COD0FLAG -DLZSIZES=$LZSIZES -DLZSIZE1=12345 \
  --raw="$ROOT/$OUT/scubacod0.bin" scubacod0.asm \
  --lst="$ROOT/$OUT/scubacod0.lst" --exp=scubacod0.inc

# ГЕЙТ ЧИСТОТЫ: нашу ветку собираем в режиме --i8080 — sjasmplus сам отвергает
# любой Z80-only опкод в исходнике. Это точнее постфактум-разбора .lst.
I8080FLAG=""
if [ -f scubai80.asm ]; then I8080FLAG="--i8080"; fi
"$SJ" --nologo --msg=err $DETFLAG $NTFLAG $ZXSFLAG $RASTFLAG $DITHFLAG $ZONEFLAG $GEOMFLAG $EVICTFLAG $HIDFLAG $PALFLAG $I8080FLAG --raw="$ROOT/$OUT/scubacod1.bin" scubacod1.asm \
  --lst="$ROOT/$OUT/scubacod1.lst" --sym="$ROOT/$OUT/scubacod1.sym"

"$SALV" -classic "$ROOT/$OUT/scubacod1.bin" "$ROOT/$OUT/scubacod1.zx0" >/dev/null
LZSIZE1=$(wc -c < "$ROOT/$OUT/scubacod1.zx0" | tr -d ' ')

# проход 2: теперь размер известен — бут получает верные адреса
"$SJ" --nologo --msg=err $DETFLAG $NTFLAG $ZXSFLAG $RASTFLAG $DITHFLAG $ZONEFLAG $GEOMFLAG $EVICTFLAG $HIDFLAG $PALFLAG $COD0FLAG -DLZSIZES=$LZSIZES -DLZSIZE1=$LZSIZE1 \
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
