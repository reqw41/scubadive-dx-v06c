#!/usr/bin/env python3
"""
pack_screen.py — PNG 256x256 (до 16 цветов) -> сырые плоскости Вектора-06Ц + палитра.
По образцу KV (ветка cas-version, tools/cas/pack_screen.py).

Раскладка Вектора: H = база плоскости + столбец (0..31), L = строка, 255 = верхняя.
Индекс цвета = 8*p(0x8000) + 4*p(0xA000) + 2*p(0xC000) + 1*p(0xE000).
Байт палитры: BBGGGRRR (биты 7-6 синий, 5-3 зелёный, 2-0 красный).

В .rom плоскости кладутся СЫРЫМИ по 0x8000: загрузчик ядра пишет их прямо в
видеопамять, распаковка на Векторе не нужна. RLE (как в KV) здесь не требуется —
место в файле есть, а лишний распаковщик стоил бы кода в заставке.

Применение: pack_screen.py in.png out_planes.raw out_pal.bin
Смена картинки — одна команда: tools/splash/build_splash.sh <новый.png>
"""
import sys
from PIL import Image

im = Image.open(sys.argv[1]).convert("RGB")
assert im.size == (256, 256), f"нужно 256x256, а тут {im.size}"
cols = im.getcolors(16)
assert cols, "в картинке больше 16 цветов — сведите палитру заранее"
colors = [c for _, c in sorted(cols, reverse=True)]
lut = {c: i for i, c in enumerate(colors)}
px = im.load()
pal = [((b * 3 // 255) << 6) | ((g * 7 // 255) << 3) | (r * 7 // 255) for r, g, b in colors]
pal += [0] * (16 - len(pal))
planes = [bytearray(8192) for _ in range(4)]
for col in range(32):
    for x in range(8):
        for y in range(256):
            i = lut[px[col * 8 + x, y]]
            for p, bit in enumerate((8, 4, 2, 1)):
                if i & bit:
                    planes[p][col * 256 + (255 - y)] |= 0x80 >> x
open(sys.argv[2], "wb").write(b"".join(bytes(p) for p in planes))
open(sys.argv[3], "wb").write(bytes(pal))
print(f"плоскости {sys.argv[2]}: 32768 Б; палитра {sys.argv[3]}: 16 Б; цветов {len(colors)}")
