#!/usr/bin/env python3
"""
Офлайн-отрисовка боковой панели HUD (тот же алгоритм, что DrawSidePanel).

Панель больше не битмап и не ZX0: рамка — тайлы $3B..$40, корыта — шаблон
FF/C3, цифры SKILL/LIVES — ROM_CHARSET '1'..'4'. Всё это в 0xE000.
Подписи HIGH/SCORE/HELD/OXYGEN/DEPTH/SKILL/LIVES печатает PrintChar в 0xC000.

  tools/mkpanl.py --render FILE  — 2048 Б плоскости 0xE000 (эталон menu_gate D)
  tools/mkpanl.py                — PNG было/стало в docs/hudfont_*.png
  OUT=build/hudfont              — каталог сборки (по умолчанию)

Знакоместная сетка: строка r → y=8r (GetScrAddr, без +64),
столбец c → 0xC000+c*256+(255-8r). Корыта: cols 25 и 27, rows 15..30.
"""
from __future__ import annotations
import argparse, os, re, struct, subprocess, sys, zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.environ.get("OUT", os.path.join(ROOT, "build/hudfont"))
SALV = os.path.join(ROOT, "tools", "bin", "salvador")
ASM = os.path.join(ROOT, "src8080", "scubapanl.asm")
SYM = os.path.join(ROOT, "src8080", "scubasymb.asm")

# Экранные координаты чернил подписей в битмапе (столбец экрана 24..31, y).
# Снято с распакованного потока: ASCII-дамп строк 64..255, столбцы 24..31.
# Рамка (24/31 и пояса 65..70 / 249..254), корыта (25 и 27, y>=121) и цифры
# SKILL/LIVES (столбец 29) сюда НЕ входят.
REGIONS = {
    "HIGH":   {"cols": range(26, 30), "ys": range(73, 79)},    # гориз. 4 буквы
    "SCORE":  {"cols": range(25, 31), "ys": range(89, 95)},    # гориз. 5 букв, шаг ~6 px
    "HELD":   {"cols": range(26, 30), "ys": range(105, 111)},  # гориз. 4 буквы
    "OXYGEN": {"cols": range(26, 27), "ys": range(161, 207)},  # столбик, столбец 26
    "DEPTH":  {"cols": range(28, 29), "ys": range(165, 203)},  # столбик, столбец 28
    "SKILL":  {"cols": range(30, 31), "ys": range(129, 167)},  # столбик, столбец 30
    "LIVES":  {"cols": range(30, 31), "ys": range(201, 239)},  # столбик, столбец 30
}

# Куда печатает штатный PrintChar после стирания (знакоместо: row, col, текст, vert).
# row 8 = y 64 — верх поля; row 0..7 = зона, туда не кладём.
PRINT = [
    ("HIGH",   9,  26, "HIGH",   False),
    ("SCORE", 11,  25, "SCORE",  False),
    ("HELD",  13,  26, "HELD",   False),
    ("OXYGEN",20,  26, "OXYGEN", True),
    ("DEPTH", 20,  28, "DEPTH",  True),
    ("SKILL", 16,  30, "SKILL",  True),
    ("LIVES", 25,  30, "LIVES",  True),
]

# Палитра игры: индекс = (бит 0xC000)*2 + (бит 0xE000). Формула байта — colour_plan.
def vc(p):
    return ((p & 7) * 36, ((p >> 3) & 7) * 36, ((p >> 6) & 3) * 85)
PAL = [vc(x) for x in (0x00, 0xDB, 0xBF, 0x07)]  # чёрный / сине-голубой / жёлтый / красный


def zx0_from_asm(path):
    d = bytearray()
    for ln in open(path, encoding="utf-8"):
        ln = ln.split(";")[0]
        if "DB" not in ln.upper():
            continue
        for t in re.findall(r"\$([0-9A-Fa-f]{2})", ln):
            d.append(int(t, 16))
    return bytes(d)


def unpack(zx0, dest):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    tmp = dest + ".zx0"
    open(tmp, "wb").write(zx0)
    subprocess.run([SALV, "-d", "-classic", tmp, dest], check=True, capture_output=True)
    b = open(dest, "rb").read()
    if len(b) != 2048:
        raise SystemExit(f"{dest}: распаковалось {len(b)} Б, жду 2048")
    return bytearray(b)


def pack(raw, dest):
    subprocess.run([SALV, "-classic", raw, dest], check=True, capture_output=True)
    return open(dest, "rb").read()


def charset():
    glyphs = {}
    cur, rows = None, []
    for ln in open(SYM, encoding="utf-8"):
        m = re.search(r";char([0-9A-Fa-f]{2})", ln)
        if m:
            if cur is not None:
                glyphs[cur] = rows
            cur = int(m.group(1), 16)
            rows = []
        m2 = re.search(r"DEFB %([01]{8})", ln)
        if m2 and cur is not None:
            rows.append(int(m2.group(1), 2))
    if cur is not None:
        glyphs[cur] = rows
    return glyphs


def erase(bmp):
    mask = bytearray(2048)  # 1 = этот байт затёрт конвейером
    stats = []
    for name, r in REGIONS.items():
        n = 0
        for c in r["cols"]:
            for y in r["ys"]:
                off = (c - 24) * 256 + (255 - y)
                if bmp[off]:
                    n += 1
                bmp[off] = 0
                mask[off] = 1
        stats.append((name, n, list(r["cols"]), min(r["ys"]), max(r["ys"])))
    return mask, stats


def blit_cell(plane, row, col, rows):
    """8 байт глифа в знакоместо (row, col) массива 8*256 (столбцы 24..31)."""
    base = (col - 24) * 256
    y0 = row * 8
    for k, b in enumerate(rows):
        plane[base + (255 - (y0 + k))] = b


def blit_labels(plane_c, glyphs):
    """Наложить глифы ROM_CHARSET в массив 8*256 плоскости C (столбцы 24..31)."""
    for _name, row, col, text, vert in PRINT:
        for i, ch in enumerate(text):
            r = row + (i if vert else 0)
            c = col + (0 if vert else i)
            blit_cell(plane_c, r, c, glyphs[ord(ch)])


# Вертикальное корыто: как в битмапе Зимина после стирания подписей.
# Первая ячейка (row 15) — пустая строка сверху; последняя (row 30) — две
# пустые снизу, перед нижней кромкой. Середина — насечка C3 на 4-й строке.
TROUGH_CAP = (0x00, 0xFF, 0xFF, 0xC3, 0xFF, 0xFF, 0xFF, 0xFF)
TROUGH_MID = (0xFF, 0xFF, 0xFF, 0xC3, 0xFF, 0xFF, 0xFF, 0xFF)
TROUGH_END = (0xFF, 0xFF, 0xFF, 0xC3, 0xFF, 0xFF, 0x00, 0x00)


def render_chrome(glyphs):
    """Плоскость 0xE000 столбцов 24..31: рамка, корыта, цифры SKILL/LIVES."""
    e = bytearray(2048)
    blit_cell(e, 8, 24, glyphs[0x3D])          # TILE_TL
    for c in range(25, 31):
        blit_cell(e, 8, c, glyphs[0x3B])       # TILE_H
    blit_cell(e, 8, 31, glyphs[0x3E])          # TILE_TR
    blit_cell(e, 31, 24, glyphs[0x3F])         # TILE_BL
    for c in range(25, 31):
        blit_cell(e, 31, c, glyphs[0x3B])
    blit_cell(e, 31, 31, glyphs[0x40])         # TILE_BR
    for r in range(9, 31):
        blit_cell(e, r, 24, glyphs[0x3C])      # TILE_V
        blit_cell(e, r, 31, glyphs[0x3C])
    for col in (25, 27):
        blit_cell(e, 15, col, TROUGH_CAP)
        for r in range(16, 30):
            blit_cell(e, r, col, TROUGH_MID)
        blit_cell(e, 30, col, TROUGH_END)
    for base_row in (15, 24):
        for i, ch in enumerate("1234"):
            blit_cell(e, base_row + i * 2, 29, glyphs[ord(ch)])
    return e


def png_rgb(rgb, w, h, path):
    def crc(b):
        return zlib.crc32(b) & 0xffffffff
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", crc(t + d))
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        raw.extend(rgb[y * w * 3:(y + 1) * w * 3])
    ih = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    open(path, "wb").write(
        b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ih) +
        chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b""))


def render_panel(e000, c000, y0=64, y1=256, scale=3):
    """Панель как на экране: 64 px ширина, (y1-y0) высота. Не поворачивать."""
    ph, pw = y1 - y0, 64
    w, h = pw * scale, ph * scale
    rgb = bytearray(w * h * 3)
    for y in range(ph):
        sy = y0 + y
        lo = 255 - sy
        for x in range(64):
            col, bit = divmod(x, 8)
            e = (e000[col * 256 + lo] >> (7 - bit)) & 1
            c = (c000[col * 256 + lo] >> (7 - bit)) & 1 if c000 else 0
            r, g, b = PAL[c * 2 + e]
            for dy in range(scale):
                for dx in range(scale):
                    o = ((y * scale + dy) * w + x * scale + dx) * 3
                    rgb[o:o + 3] = bytes((r, g, b))
    return rgb, w, h


def compose_before_after(before, after, bw, bh, gap=16):
    w = bw * 2 + gap
    h = bh
    rgb = bytearray(w * h * 3)
    for y in range(h):
        rgb[y * w * 3 + bw * 3:(y * w * 3) + (bw + gap) * 3] = b"\x20\x20\x20" * gap
        rgb[y * w * 3:y * w * 3 + bw * 3] = before[y * bw * 3:(y + 1) * bw * 3]
        off = y * w * 3 + (bw + gap) * 3
        rgb[off:off + bw * 3] = after[y * bw * 3:(y + 1) * bw * 3]
    return rgb, w, h


def emit_asm(zx0, n_before, n_after, n_zx0_old):
    lines = [
        "; ГЕНЕРИРУЕТСЯ: tools/mkpanl.py. Не править руками.",
        "; Битмап боковой панели, выровненный под геометрию зоны (поле y=64..255).",
        "; Подписи HIGH/SCORE/HELD/OXYGEN/DEPTH/SKILL/LIVES стёрты: их печатает",
        "; PrintChar шрифтом ROM_CHARSET (плоскость 0xC000). Здесь остаются рамка,",
        "; корыта шкал и цифры SKILL/LIVES. Поток ZX0, salvador -classic.",
        f"; Распакованных ненулевых: было {n_before}, стало {n_after}; поток {n_zx0_old} → {len(zx0)} Б.",
    ]
    for i in range(0, len(zx0), 16):
        chunk = zx0[i:i + 16]
        lines.append("  DB " + ",".join(f"${b:02X}" for b in chunk))
    return "\n".join(lines) + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--render", metavar="FILE",
                    help="записать 2048 Б хрома панели (0xE000, столбцы 24..31)")
    ap.add_argument("--write", action="store_true",
                    help="больше не пишет asm: битмап не вшивается")
    args = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)

    glyphs = charset()
    for code in (0x3B, 0x3C, 0x3D, 0x3E, 0x3F, 0x40):
        if code not in glyphs or len(glyphs[code]) != 8:
            raise SystemExit(f"нет тайла рамки char{code:02X} в {SYM}")
    chrome = render_chrome(glyphs)
    n_e = sum(1 for b in chrome if b)
    zone_nz = sum(1 for c in range(8) for lo in range(192, 256) if chrome[c * 256 + lo])
    print(f"хром DrawSidePanel: ненулевых {n_e}, в зоне {zone_nz}")
    if zone_nz:
        raise SystemExit("СТОП: хром панели зашёл в зону (lo>=192)")

    if args.render:
        dest = args.render
        os.makedirs(os.path.dirname(os.path.abspath(dest)) or ".", exist_ok=True)
        open(dest, "wb").write(chrome)
        print(f"записан {dest} ({len(chrome)} Б)")
        return

    if args.write:
        print("src8080/scubapanl.asm больше не вшивается: панель рисует DrawSidePanel")

    for name, row, col, text, vert in PRINT:
        for i, ch in enumerate(text):
            r = row + (i if vert else 0)
            c = col + (0 if vert else i)
            lo = 255 - 8 * r
            if lo >= 192:
                raise SystemExit(f"СТОП: {name} {ch} row {r} col {c} попадает в зону lo={lo}")
        print(f"  печать {name:6s}  row {row:2d} col {col:2d}  {text:6s}  "
              f"{'вертикально' if vert else 'горизонтально'}  y={row*8}  field")

    c000 = bytearray(2048)
    blit_labels(c000, glyphs)

    docs = os.path.join(ROOT, "docs")
    # «было»: последний вшитый битмап (подписи уже стёрты, цифры — шрифт Зимина).
    before_e = chrome
    if os.path.isfile(ASM):
        before_e = unpack(zx0_from_asm(ASM), os.path.join(OUT, "panl_old.bin"))
    before_rgb, bw, bh = render_panel(before_e, c000)
    after_rgb, aw, ah = render_panel(chrome, c000)
    png_rgb(before_rgb, bw, bh, os.path.join(docs, "hudfont_before.png"))
    png_rgb(after_rgb, aw, ah, os.path.join(docs, "hudfont_after.png"))
    both, ww, hh = compose_before_after(before_rgb, after_rgb, bw, bh)
    png_rgb(both, ww, hh, os.path.join(docs, "hudfont_before_after.png"))
    print("PNG: docs/hudfont_before.png  docs/hudfont_after.png  docs/hudfont_before_after.png")
    print("     панель 64×192, масштаб ×3; слева битмап, справа тайлы+римейк цифр")
    print("     рамка/корыта/цифры — 0xE000 (сине-голубой), подписи — 0xC000 (жёлтый)")


if __name__ == "__main__":
    main()
