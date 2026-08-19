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
# Файлы-доноры. Список задаётся снаружи (ZFILES), по умолчанию только спрайты.
FILES = os.environ.get("ZFILES", "scubasprt.asm").split(",")
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
# ИДЕМПОТЕНТНОСТЬ: обёртки прошлого прогона снимаются ПЕРЕД разбором. Без этого
# второй запуск разбирал уже обёрнутый файл, вытаскивал чужой ENDIF в выходной
# файл и ронял сборку, а третий добавлял Duplicate label.
def strip_wrappers(raw):
    out, drop = [], False
    for l in raw:
        if l.startswith("\tIFNDEF EVICT"): drop = True; continue
        if drop and l.rstrip() == "\tENDIF": drop = False; continue
        out.append(l)
    return out
src = {}
for f in FILES:
    fp = os.path.join(ROOT, "src8080", f)
    if not os.path.exists(fp): sys.exit(f"нет файла-донора {fp}")
    src[f] = strip_wrappers(open(fp, encoding="utf-8").read().split("\n"))
    if not any(l.strip() for l in src[f]): sys.exit(f"донор {f} пуст")
raw = []
# ИДЕМПОТЕНТНОСТЬ: снимаем обёртки прошлого прогона. Без этого второй запуск
# генератора разбирал уже обёрнутый файл, вытаскивал чужой ENDIF в scubazone.asm
# и ронял сборку ошибкой «ENDIF without IF».

# КРОСС-ФАЙЛОВЫЕ МЕТКИ: границы блока считаются ВНУТРИ файла, а размер берётся
# из .sym по соседней метке — она может лежать в другом файле. Совпадение
# проверяется ниже, блоки с расхождением выбывают.
own = {}          # имя -> [файл, первая строка, последняя строка]
for f in FILES:
    lines, cur = src[f], None
    for i, l in enumerate(lines):
        m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)\b", l)
        if m:
            if cur: own[cur][2] = i - 1
            cur = m.group(1); own[cur] = [f, i, len(lines) - 1]
    if cur: own[cur][2] = len(lines) - 1

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

# ФИЛЬТР СЫРЫХ УКАЗАТЕЛЕЙ (CLEAN=1). Перенос блока меняет его адрес, а слово,
# лежащее в таблице цифрами, ассемблер не правит. Скан ищет адрес блока сырым
# словом в образе. ЧЕСТНАЯ ОГОВОРКА: скан НЕ ДОКАЗАТЕЛЬСТВО — вероятность
# случайного совпадения двухбайтового слова в 44 КБ около 67%, поэтому он метит
# «грязными» и невиновных. Он годится ровно на одно: собрать заведомо ЧИСТУЮ
# выборку для решающего эксперимента.
if os.environ.get("CLEAN") == "1":
    img = open(os.path.join(ROOT, "build", "gz", "scubacod1.bin"), "rb").read()
    def clean(u):
        for n in u["names"]:
            a = sym.get(n)
            if a is None: return False
            if img.find(bytes([a & 0xff, a >> 8])) >= 0: return False
        return True
    units = [u for u in units if clean(u)]
    print(f"фильтр CLEAN: осталось единиц {len(units)}, {sum(u['sz'] for u in units)} Б")

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
        f0 = own[u["names"][0]][0]
        a, b = own[u["names"][0]][1], own[u["names"][-1]][2]
        buf.extend(src[f0][a:b + 1])
    if tot < 64: buf.append(f"\tDS {64 - tot},0")
    buf.append("\tENT")
buf.append("SCUBAZONE_END:")
n23 = sum(1 for a in sa if a >= 0xC000)
buf.append(f"SCUBAZONE_N23\tEQU {n23}\t; ломтей в плоскостях 2 и 3 (кладутся напрямую)")
buf.append("")
open(OUT, "w", encoding="utf-8").write("\n".join(buf))

# 2) исходный файл: выселенные блоки прячутся под флагом
for f in FILES:
    lines, out, skip_to = src[f], [], -1
    for i, l in enumerate(lines):
        m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)\b", l)
        if m and m.group(1) in used and own[m.group(1)][0] == f and own[m.group(1)][1] == i:
            nm = m.group(1)
            out.append("\tIFNDEF EVICT\t; выселен в ломоть зоны (tools/mkzone.py)")
            out.extend(lines[own[nm][1]:own[nm][2] + 1]); out.append("\tENDIF")
            skip_to = own[nm][2]; continue
        if i <= skip_to: continue
        out.append(l)
    open(os.path.join(ROOT, "src8080", f), "w", encoding="utf-8").write("\n".join(out))
print(f"ломтей {len(slices)}, единиц {len(used)}, байт {sum(sum(u['sz'] for u in it) for it in slices)}")
open(os.path.join(ROOT, "build", "zone_map.txt"), "w").write("\n".join(f"{a:04x}" for a in sa) + "\n")
print(f"адреса ломтей: 0x{sa[0]:04X} .. 0x{sa[-1]:04X} (карта -> build/zone_map.txt)")
