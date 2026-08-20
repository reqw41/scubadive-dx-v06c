#!/bin/sh
# Распаковать ЭТАЛОННЫЙ битмап боковой панели Зимина (src_ref/scubapanl.asm) в
# сырые 2048 Б для panel_align_gate.js. Эталон берётся из НЕТРОНУТОГО src_ref, а
# не из нашей ветки: сверять выравнивание надо с оригиналом, а не с собой.
# Конвейер тот же, которым панель жмётся в образ: salvador -classic.
set -e
cd "$(dirname "$0")/../.."
OUT=${OUT:-build/panalign}
mkdir -p "$OUT"
python3 -c "
import re,sys
d=bytearray()
for ln in open('src_ref/scubapanl.asm',encoding='utf-8'):
    ln=ln.split(';')[0]
    if 'DB' not in ln.upper(): continue
    for t in re.findall(r'\\\$([0-9A-Fa-f]{2})', ln): d.append(int(t,16))
open('$OUT/panl_ref.zx0','wb').write(bytes(d))
print('поток эталона:',len(d),'Б')
"
./tools/bin/salvador -d -classic "$OUT/panl_ref.zx0" "$OUT/panl_ref.bin" >/dev/null
wc -c < "$OUT/panl_ref.bin" | tr -d ' ' | sed 's/^/эталон распакован: /;s/$/ Б/'
# Наш эталон панели — офлайн-отрисовка DrawSidePanel (тайлы рамки, корыта,
# цифры SKILL/LIVES), не ZX0 и не снимок того же прогона. menu_gate D сверяет
# с ним столбцы 24..31 плоскости 0xE000 на экране меню.
OUT="$OUT" python3 tools/mkpanl.py --render "$OUT/panl_ours.bin"
wc -c < "$OUT/panl_ours.bin" | tr -d ' ' | sed 's/^/хром панели нарисован: /;s/$/ Б/'
