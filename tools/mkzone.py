#!/usr/bin/env python3
# ГЕНЕРАТОР ВЫСЕЛЕНИЯ В ЛОМТИ ВЕРХНЕЙ ЗОНЫ.
#
# Что делает: выбирает блоки данных из scubasprt.asm, набивает ими ломти по 64
# байта под завязку и выносит их ИЗ непрерывной области — от этого весь код
# съезжает вниз, а конец кода опускается ниже 0xA000.
#
# Почему выемка выборочная, а не один разрез: в области спрайтов 95 блоков
# крупнее 64 байт, и сплошной хвост в ломти не режется ни при каком месте
# разреза (замер). Поэтому берутся только блоки, которые в ломоть влезают.
#
# Почему нельзя просто DS-дырами: ломти доходят до 0xF7FF, распаковщик писал бы
# поверх собственного сжатого потока (он лежит под 0xC000). Схема такая: блоки
# ассемблируются ПО АДРЕСАМ ЛОМТЕЙ через DISP/ENT, а в образе лежат упакованными
# подряд; бут раскладывает их циклом с шагом 256.
#
# СКЛЕЙКИ: игра ходит через границы блоков (замер: 38 границ из 690). Склеенные
# соседи объединяются в неразрывную единицу; единица крупнее 64 Б выбывает.
#
#   python3 tools/mkzone.py <sym> <ломтей>
import re, sys, os

SYM = sys.argv[1] if len(sys.argv) > 1 else "build/gz/scubacod1.sym"
NSLICE = int(sys.argv[2]) if len(sys.argv) > 2 else 8
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPR = os.path.join(ROOT, "src8080", "scubasprt.asm")
OUT = os.path.join(ROOT, "src8080", "scubazone.asm")
# Склейки, найденные замером tools/verify/zone_pack.js. Блок, чей АДРЕС здесь,
# читается впритык за предыдущим — разносить их нельзя.
WELD = {0x63e1,0x66ec,0x7227,0x718a,0x79a4,0x646e,0x723c,0x6830,0x61c5,0x6397,
        0x63a8,0x63ae,0x6400,0x640c,0x6418,0x6424,0x6430,0x643c,0x6448,0x6454,
        0x6460,0x647a,0x6486,0x6492,0x649e,0x64aa,0x64b6,0x64c2,0x64ce,0x64da,
        0x64e6,0x64f2,0x64fe,0x650a,0x6516,0x6522,0x652e,0x653a}

sym = {}
for line in open(SYM, encoding="latin1"):
    m = re.match(r"^(\S+):\s+EQU\s+0x([0-9A-Fa-f]+)\s*$", line)
    if m: sym[m.group(1)] = int(m.group(2), 16)

# метки, ОПРЕДЕЛЁННЫЕ в scubasprt.asm, и их строки
lines = open(SPR, encoding="utf-8").read().split("\n")
own = {}          # имя -> (первая строка, последняя строка)
order = []
cur = None
for i, l in enumerate(lines):
    m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)\b", l)
    if m:
        if cur: own[cur][1] = i - 1
        cur = m.group(1); own[cur] = [i, len(lines) - 1]; order.append(cur)
if cur: own[cur][1] = len(lines) - 1

# размеры блоков из .sym в адресном порядке
addrs = sorted((v, k) for k, v in sym.items() if 0x1000 <= v < 0x8E90)
size = {}
for i in range(len(addrs) - 1):
    size[addrs[i][1]] = addrs[i + 1][0] - addrs[i][0]

# единицы: подряд идущие блоки, склеенные между собой, объединяются
units = []
i = 0
while i < len(addrs) - 1:
    j = i
    while j + 1 < len(addrs) - 1 and addrs[j + 1][0] in WELD: j += 1
    names = [addrs[k][1] for k in range(i, j + 1)]
    sz = addrs[j + 1][0] - addrs[i][0]
    if sz > 0 and all(n in own for n in names):
        units.append({"sz": sz, "names": names, "addr": addrs[i][0]})
    i = j + 1

# набивка ломтя под завязку
avail = sorted([u for u in units if u["sz"] <= 64], key=lambda u: -u["sz"])
used, slices = set(), []
while len(slices) < NSLICE:
    rest, items = 64, []
    for u in avail:
        if u["names"][0] in used or u["sz"] > rest: continue
        used.update(u["names"]); items.append(u); rest -= u["sz"]
        if rest == 0: break
    if not items: break
    slices.append(items)
if len(slices) < NSLICE:
    sys.exit(f"не набралось {NSLICE} ломтей, только {len(slices)}")

# Адреса ломтей: СНАЧАЛА плоскости 2 и 3 (по 24 столбца), и только потом
# плоскость 1 (32 столбца). Порядок не косметика: ломти плоскости 1 лежат в
# 0xA000..0xBFFF, то есть внутри кода, пока тот не съехал ниже 0xA000. При
# частичном выселении раскладка в плоскость 1 затирает сам код — проверено,
# образ до главного цикла не доходил.
# КАРТА ЗАНЯТОСТИ. Ломти плоскости 0xC000 в столбцах 2..6 уже заняты буферами
# save-under (этап 2: индекс страницы = столбец, младшие 208..255). Наложение
# ловилось не сразу: данные ложились верно, а портились через сотни тиков, когда
# игра начинала сохранять фон под спрайтом. Занятые столбцы пропускаются.
POOL_COLS = {2, 3, 4, 5, 6}
def slice_addrs(n):
    out = []
    for base, cols in ((0xC000, 24), (0xE000, 24), (0xA000, 32)):
        for c in range(cols):
            if base == 0xC000 and c in POOL_COLS: continue
            out.append(base + c * 256 + 192)
            if len(out) == n: return out
    return out
sa = slice_addrs(len(slices))

# 1) файл выселенных блоков
buf = ["; ГЕНЕРИРУЕТСЯ tools/mkzone.py — РУКАМИ НЕ ПРАВИТЬ.",
       "; Блоки данных, выселенные в ломти верхней зоны. Каждый ломоть — 64 байта,",
       "; ассемблируется по адресу ломтя (DISP), а в образе лежит упакованным подряд;",
       "; бут раскладывает их циклом с шагом 256 (см. RZONE_COPY в scubacod0.asm).",
       "SCUBAZONE_SRC:"]
for k, items in enumerate(slices):
    tot = sum(u["sz"] for u in items)
    buf.append(f"; --- ломоть {k}: 0x{sa[k]:04X}, занято {tot} из 64 Б")
    buf.append(f"\tDISP 0{sa[k]:04X}h")
    for u in items:
        a, b = own[u["names"][0]][0], own[u["names"][-1]][1]
        buf.extend(lines[a:b + 1])
    if tot < 64: buf.append(f"\tDS {64 - tot},0")
    buf.append("\tENT")
buf.append("SCUBAZONE_END:")
buf.append("")
open(OUT, "w", encoding="utf-8").write("\n".join(buf))

# 2) исходный файл: выселенные блоки прячутся под флагом
out = []
skip_to = -1
for i, l in enumerate(lines):
    m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)\b", l)
    if m and m.group(1) in used and own[m.group(1)][0] == i:
        nm = m.group(1)
        out.append("\tIFNDEF EVICT\t; выселен в ломоть зоны (tools/mkzone.py)")
        out.extend(lines[own[nm][0]:own[nm][1] + 1])
        out.append("\tENDIF")
        skip_to = own[nm][1]
        continue
    if i <= skip_to: continue
    out.append(l)
open(SPR, "w", encoding="utf-8").write("\n".join(out))
print(f"ломтей {len(slices)}, единиц {len(used)}, байт {sum(sum(u['sz'] for u in it) for it in slices)}")
print(f"адреса ломтей: 0x{sa[0]:04X} .. 0x{sa[-1]:04X}")
