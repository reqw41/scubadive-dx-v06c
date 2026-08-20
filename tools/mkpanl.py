#!/usr/bin/env python3
"""
Конвейер битмапа боковой панели HUD.

  распаковать src8080/scubapanl.asm
    → стереть пиксели подписей Зимина (~6 px)
    → сжать salvador -classic
    → выписать DB (только с --write)
    → PNG было/стало (панель узкая и высокая, как на экране)

Подписи HIGH/SCORE/HELD/OXYGEN/DEPTH/SKILL/LIVES уходят из битмапа и печатаются
штатным ROM_CHARSET через PrintChar (плоскость 0xC000, жёлтый). Рамка, корыта
шкал и цифры SKILL/LIVES остаются в битмапе (плоскость 0xE000, сине-голубой).

  tools/mkpanl.py              — распаковка, стирание, сжатие, PNG; asm не трогает
  tools/mkpanl.py --write      — то же и переписать src8080/scubapanl.asm
  OUT=build/hudfont            — каталог сборки (по умолчанию)

Координаты подписей сняты с распакованного битмапа (не из комментариев):
см. REGIONS. Знакоместная сетка PrintChar: строка r → экранная y=8r
(GetScrAddr, без +64), столбец c → адрес 0xC000+c*256+(255-8r).
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


def blit_labels(plane_c, glyphs):
    """Наложить глифы ROM_CHARSET в массив 8*256 плоскости C (столбцы 24..31)."""
    for _name, row, col, text, vert in PRINT:
        for i, ch in enumerate(text):
            r = row + (i if vert else 0)
            c = col + (0 if vert else i)
            g = glyphs[ord(ch)]
            base = (c - 24) * 256
            y0 = r * 8
            for k in range(8):
                plane_c[base + (255 - (y0 + k))] = g[k]


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
    ap.add_argument("--write", action="store_true", help="переписать src8080/scubapanl.asm")
    args = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)

    zx0_old = zx0_from_asm(ASM)
    bmp = unpack(zx0_old, os.path.join(OUT, "panl_ours.bin"))
    n_before = sum(1 for b in bmp if b)
    zone_nz = sum(1 for c in range(8) for lo in range(192, 256) if bmp[c * 256 + lo])
    print(f"поток до: {len(zx0_old)} Б, распаковано 2048, ненулевых {n_before}, в зоне {zone_nz}")

    # PrintChar: GetScrAddr hi = col+0xC0 → плоскость 0xC000 всегда.
    print("PrintChar GetScrAddr: hi=column+0xC0 → 0xC000..0xDFFF, индекс палитры 2 (жёлтый)")
    print("битмап панели: 0xF800 = плоскость 0xE000, индекс 1 (сине-голубой)")

    for name, row, col, text, vert in PRINT:
        for i, ch in enumerate(text):
            r = row + (i if vert else 0)
            c = col + (0 if vert else i)
            lo = 255 - 8 * r
            zone = "ZONE" if lo >= 192 else "field"
            if zone != "field":
                raise SystemExit(f"СТОП: {name} {ch} row {r} col {c} попадает в зону lo={lo}")
        print(f"  печать {name:6s}  row {row:2d} col {col:2d}  {text:6s}  "
              f"{'вертикально' if vert else 'горизонтально'}  y={row*8}  {zone if False else 'field'}")

    mask, stats = erase(bmp)
    n_after = sum(1 for b in bmp if b)
    print("стёрто подписей:")
    for name, n, cols, y0, y1 in stats:
        print(f"  {name:6s}  cols {cols[0]}..{cols[-1]}  y {y0}..{y1}  ненулевых байт {n}")
    print(f"ненулевых после стирания: {n_after} (ушло {n_before - n_after})")

    raw_path = os.path.join(OUT, "panl_erased.bin")
    open(raw_path, "wb").write(bmp)
    open(os.path.join(OUT, "erase_mask.bin"), "wb").write(mask)
    zx0_new = pack(raw_path, os.path.join(OUT, "panl_erased.zx0"))
    print(f"поток после: {len(zx0_new)} Б ({len(zx0_new) - len(zx0_old):+d})")

    glyphs = charset()
    c000 = bytearray(2048)
    blit_labels(c000, glyphs)

    docs = os.path.join(ROOT, "docs")
    before_rgb, bw, bh = render_panel(unpack(zx0_old, os.path.join(OUT, "panl_ours.bin")), bytearray(2048))
    after_rgb, aw, ah = render_panel(bmp, c000)
    png_rgb(before_rgb, bw, bh, os.path.join(docs, "hudfont_before.png"))
    png_rgb(after_rgb, aw, ah, os.path.join(docs, "hudfont_after.png"))
    both, ww, hh = compose_before_after(before_rgb, after_rgb, bw, bh)
    png_rgb(both, ww, hh, os.path.join(docs, "hudfont_before_after.png"))
    print("PNG: docs/hudfont_before.png  docs/hudfont_after.png  docs/hudfont_before_after.png")
    print("     панель 64×192, масштаб ×3, ориентация экрана (узкая и высокая), слева было / справа стало")
    print("     стало: рамка сине-голубая (E000), подписи жёлтые ROM_CHARSET (C000 = PrintChar)")

    if args.write:
        open(ASM, "w", encoding="utf-8").write(emit_asm(zx0_new, n_before, n_after, len(zx0_old)))
        print(f"записан {ASM}")
    else:
        print("asm не тронут (запусти с --write, чтобы вшить)")


if __name__ == "__main__":
    main()
