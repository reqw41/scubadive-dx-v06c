#!/usr/bin/env python3
"""
genframe.py — тайлы рамки HUD в ДЫРЫ ШРИФТА.

Рамка оригинала не хранится битмапом: шесть знакомест (уголок в четырёх
ориентациях + горизонтальная и вертикальная палочки) кладутся в глифы символов
$3B..$40 (';' '<' '=' '>' '?' '@'). Эти глифы доказанно мертвы по переписи
шрифта: игра их не печатает нигде. Поэтому рамка стоит НОЛЬ байт данных — её
рисует обычная печать символов.

Уголки получаются поворотами/зеркалами одного рисунка, как и просил владелец,
но повороты считаются ЗДЕСЬ, на сборке, а не на Векторе.
"""
import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Двойная линия толщиной 2 пикселя посередине знакоместа: столбцы 3-4, строки 3-4.
V = 0b00011000
H = 0xFF
def tile(up, down, left, right):
    g = [0] * 8
    for r in range(8):
        v = 0
        if up and r < 3:      v |= V
        if down and r > 4:    v |= V
        if r in (3, 4):
            v |= V
            if left:  v |= 0b11111000
            if right: v |= 0b00011111
        g[r] = v
    return g
TILES = [
    (0x3B, tile(0, 0, 1, 1)),   # ';' горизонтальная палочка
    (0x3C, tile(1, 1, 0, 0)),   # '<' вертикальная палочка
    (0x3D, tile(0, 1, 0, 1)),   # '=' уголок левый верхний
    (0x3E, tile(0, 1, 1, 0)),   # '>' уголок правый верхний
    (0x3F, tile(1, 0, 0, 1)),   # '?' уголок левый нижний
    (0x40, tile(1, 0, 1, 0)),   # '@' уголок правый нижний
]
for p in ("src8080/scubasymb.asm", "src/scubasymb.asm"):
    f = os.path.join(ROOT, p)
    s = open(f, encoding="utf-8").read().split("\n")
    idx = {}
    for i, l in enumerate(s):
        if ";char" in l:
            try: idx[int(l.split(";char")[1].strip(), 16)] = i
            except ValueError: pass
    for ch, g in TILES:
        i0 = idx[ch]
        for b in range(8):
            s[i0 + b] = "\tDEFB %" + format(g[b], "08b") + (f"\t;char{ch:02X} тайл рамки HUD" if b == 0 else "")
    open(f, "w", encoding="utf-8").write("\n".join(s))
    print(p, "— шесть тайлов рамки вшиты в дыры шрифта")
for ch, g in TILES:
    print(f"  char {ch:02X}: " + " ".join(format(b, "08b").replace("0", ".").replace("1", "#") for b in g[:1]))
