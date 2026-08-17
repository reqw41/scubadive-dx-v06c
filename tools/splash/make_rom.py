#!/usr/bin/env python3
"""
make_rom.py — сборка splash-ROM.
Раскладка файла (грузится с 0x0100, как и обычный .rom Вектора):
  0x0100  образ игры БЕЗ ИЗМЕНЕНИЙ, кроме первых трёх байт -> jp 0x5500;
          стартер возвращает их на место перед прыжком на 0x0100;
  0x5500  стартер заставки и ноты марша;
  0x8000  плоскости заставки сырыми — загрузчик ядра кладёт их прямо в
          видеопамять, распаковывать на Векторе нечего.
Применение: make_rom.py <игра.rom> <starter.bin> <planes.raw> <out.rom>
"""
import sys, hashlib
game_p, st_p, pl_p, out_p = sys.argv[1:5]
game = bytearray(open(game_p, "rb").read())
st = open(st_p, "rb").read()
pl = open(pl_p, "rb").read()
START = 0x5500
assert 0x100 + len(game) <= START, f"образ игры {len(game)} Б перекрывает стартер на 0x{START:04X}"
assert START + len(st) <= 0x8000, f"стартер {len(st)} Б не влезает до 0x8000"
assert len(pl) == 32768
orig3 = bytes(game[0:3])
game[0:3] = bytes([0xC3, START & 0xFF, START >> 8])
out = bytearray(0xFF00)
out[0:len(game)] = game
out[START - 0x100:START - 0x100 + len(st)] = st
out[0x8000 - 0x100:0x8000 - 0x100 + len(pl)] = pl
open(out_p, "wb").write(bytes(out))
print(f"{out_p}: {len(out)} Б; игра {len(game)}, стартер+ноты {len(st)}, плоскости {len(pl)}")
print(f"  первые 3 байта игры {orig3.hex()} -> jp 0x{START:04X}, стартер вернёт их обратно")
print(f"  md5 {hashlib.md5(bytes(out)).hexdigest()}")
