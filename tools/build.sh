#!/bin/sh
# Сборка образа Scuba Dive. Порт nzeemin (Z80) и наша i8080-ветка собираются
# ОДНИМ скриптом: переменная SRC задаёт каталог исходников.
#   SRC=src      -> эталонная Z80-сборка автора  (build/src/scuba.rom)
#   SRC=src8080  -> наша i8080-ветка             (build/src8080/scuba.rom)
# Порядок повторяет !compile.cmd автора: два прохода по scubacod0 нужны, потому
# что размер ZX0-потока кода известен только после его сжатия.
# ВЫКЛАДЫВАЕМЫЙ ОБРАЗ СОБИРАЕТ НЕ ЭТОТ СКРИПТ, А tools/build_prod.sh: боевой
# набор флагов перечислен там и больше нигде. Ниже описаны все флаги, которые
# скрипт понимает; ни одного мёртвого в списке нет.
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
# DITHER=1 -> рельеф кладётся во вторую плоскость через шахматную маску: смесь
# двух чернил вместо сплошного индекса 3. Палитру не трогает.
DITHFLAG=""
if [ "${DITHER:-0}" = "1" ]; then DITHFLAG="-DDITHER=1"; fi
# THINGAUGE=1 -> узкие шкалы кислорода и глубины: корыто 4 px вместо 8.
if [ "${THINGAUGE:-0}" = "1" ]; then DITHFLAG="$DITHFLAG -DTHINGAUGE=1"; fi
# BLUESHARK=1 -> акула рисуется во вторую плоскость (синяя), а проверка
# столкновения дайвера расширяется на неё, минуя строку поверхности воды.
if [ "${BLUESHARK:-0}" = "1" ]; then DITHFLAG="$DITHFLAG -DBLUESHARK=1"; fi
# SKYFILL=1 -> небо над ватерлинией залито синим с жёлтыми вкраплениями-градиентом.
if [ "${SKYFILL:-0}" = "1" ]; then DITHFLAG="$DITHFLAG -DSKYFILL=1"; fi
# SHELLBLUE=1 -> большая ракушка синяя с красной каймой.
if [ "${SHELLBLUE:-0}" = "1" ]; then DITHFLAG="$DITHFLAG -DSHELLBLUE=1"; fi
# SKYGRAD=1 -> небо градиентом плотности синих точек (эксперимент 2026-08-27).
if [ "${SKYGRAD:-0}" = "1" ]; then DITHFLAG="$DITHFLAG -DSKYGRAD=1"; fi
# WIDE=1 -> поле во всю ширину экрана: 4 блока (32 знакоместа) вместо 3; окно карты то же,
#           четвёртый блок — справа; пределы дайвера по столбцу +8.
if [ "${WIDE:-0}" = "1" ]; then DITHFLAG="$DITHFLAG -DWIDE=1"; fi
# BOATFAST=1 -> кадр лодки собирается один раз в свою страницу пула (0xBD00),
# блит лодки шириной 8 — столбцом без построчного хвоста; модуль лежит в обычном коде.
# Самостоятелен: BLUESHARK не нужен. До 2026-08-30 зависел
# от BLUESHARK и без него МОЛЧА не исполнялся — диспетчер узнавал лодку по чужой
# переменной blue_this, которую взводил код под IFDEF BLUESHARK. Теперь он
# спрашивает IsBoatIY напрямую; сборка без BLUESHARK проверена (romdiff_pix против
# такой же сборки без BOATFAST: видеопамять байт в байт, заходов в BoatCol 212).
if [ "${BOATFAST:-0}" = "1" ]; then DITHFLAG="$DITHFLAG -DBOATFAST=1"; fi
# MENUHUD=1 -> экран меню под HUD: HUD рисуется сразу, текст в окне поля, SKILL в HUD.
if [ "${MENUHUD:-0}" = "1" ]; then DITHFLAG="$DITHFLAG -DMENUHUD=1"; fi
# MENUART=1 -> украшения стартового экрана: риф, ракушки, кислород, сундук под
# текстом меню (scubamenu.asm). Требует MENUHUD — раскладка строк 17..23.
if [ "${MENUART:-0}" = "1" ]; then DITHFLAG="$DITHFLAG -DMENUART=1"; fi
# CLOUDS=1 -> облака над ватерлинией: постоянная формация, дрейф на знакоместо
# при каждой перерисовке неба. Требует SKYFILL — рисуется из DrawSky.
if [ "${CLOUDS:-0}" = "1" ]; then DITHFLAG="$DITHFLAG -DCLOUDS=1"; fi
# REDINK=1 -> типы из таблицы LB4F0_redtab (малые кальмары) рисуются в ОБЕИХ
# плоскостях и получают индекс 3 (красный). Второй буфер save-under не нужен:
# во вторую плоскость идёт дельта байта, она симметрична и стирается сама.
if [ "${REDINK:-0}" = "1" ]; then DITHFLAG="$DITHFLAG -DREDINK=1"; fi
# REDTEST=1 -> в таблицу красных добавляется круглая рыба. Только для гейтов:
# малых кальмаров стенд на экран не выводит, а тракт проверять на чём-то надо.
if [ "${REDTEST:-0}" = "1" ]; then DITHFLAG="$DITHFLAG -DREDTEST=1"; fi
# CORAL=<байт палитры> -> третье чернило (рельеф, осьминог) коралловое вместо красного.
if [ -n "${CORAL:-}" ]; then DITHFLAG="$DITHFLAG -DCORAL=$CORAL"; fi
# HIDVRAM=1 -> рельеф, кадры дайвера и взрыв лежат сплошняком в скрытой
# плоскости 1 (0xA000..0xAFBF), пул как у Зимина на 0xB000, видимые
# C000/E000 — только картинка.
HIDFLAG=""
if [ "${HIDVRAM:-0}" = "1" ]; then HIDFLAG="-DHIDVRAM=1"; fi

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
"$SJ" --nologo --msg=err $DETFLAG $NTFLAG $ZXSFLAG $DITHFLAG $HIDFLAG $COD0FLAG -DLZSIZES=$LZSIZES -DLZSIZE1=12345 \
  --raw="$ROOT/$OUT/scubacod0.bin" scubacod0.asm \
  --lst="$ROOT/$OUT/scubacod0.lst" --exp=scubacod0.inc

# ГЕЙТ ЧИСТОТЫ: нашу ветку собираем в режиме --i8080 — sjasmplus сам отвергает
# любой Z80-only опкод в исходнике. Это точнее постфактум-разбора .lst.
I8080FLAG=""
if [ -f scubai80.asm ]; then I8080FLAG="--i8080"; fi
"$SJ" --nologo --msg=err $DETFLAG $NTFLAG $ZXSFLAG $DITHFLAG $HIDFLAG $I8080FLAG --raw="$ROOT/$OUT/scubacod1.bin" scubacod1.asm \
  --lst="$ROOT/$OUT/scubacod1.lst" --sym="$ROOT/$OUT/scubacod1.sym"

"$SALV" -classic "$ROOT/$OUT/scubacod1.bin" "$ROOT/$OUT/scubacod1.zx0" >/dev/null
LZSIZE1=$(wc -c < "$ROOT/$OUT/scubacod1.zx0" | tr -d ' ')

# проход 2: теперь размер известен — бут получает верные адреса
"$SJ" --nologo --msg=err $DETFLAG $NTFLAG $ZXSFLAG $DITHFLAG $HIDFLAG $COD0FLAG -DLZSIZES=$LZSIZES -DLZSIZE1=$LZSIZE1 \
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
