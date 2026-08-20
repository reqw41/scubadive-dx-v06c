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
# И НАШ битмап — тем же конвейером. Он нужен второй мере: «панель, положенная
# бутом, доживает до экрана меню байт в байт». Эталон для неё обязан быть внешним
# (файл источника), а не снимком того же прогона.
python3 - "$OUT" <<'PYEOF'
import re, sys
out = sys.argv[1]
d = bytearray()
for ln in open('src8080/scubapanl.asm', encoding='utf-8'):
    ln = ln.split(';')[0]
    if 'DB' not in ln.upper(): continue
    for t in re.findall(r'\$([0-9A-Fa-f]{2})', ln): d.append(int(t, 16))
open(out + '/panl_ours.zx0', 'wb').write(bytes(d))
print('поток нашей панели:', len(d), 'Б')
PYEOF
./tools/bin/salvador -d -classic "$OUT/panl_ours.zx0" "$OUT/panl_ours.bin" >/dev/null
wc -c < "$OUT/panl_ours.bin" | tr -d ' ' | sed 's/^/наш битмап распакован: /;s/$/ Б/'
