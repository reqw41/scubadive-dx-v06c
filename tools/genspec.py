#!/usr/bin/env python3
"""
genspec.py — специализация индексных хелперов по паре «хелпер + смещение».

ЗАЧЕМ. Общий хелпер достаёт смещение из ПОТОКА КОМАНД, по адресу возврата:
    pop hl / ld a,(hl) / inc hl / ld (il_ptr),hl ... ld hl,(il_ptr) / push hl
Этот танец стоит 58 тактов на КАЖДЫЙ вызов и ничего не вычисляет — он только
добывает константу, известную на этапе ассемблирования. Замер прогоном: 30536
вызовов индексных хелперов за 401 тик, то есть 76 на тик.

ЧТО ДЕЛАЕТ СКРИПТ. Для каждой встреченной пары (хелпер, смещение) выпускает
отдельную точку входа с зашитым смещением и переписывает площадки вызова
    call z80_lda_X / defb $0D   ->   call z80_lda_X_13
Площадка при этом теряет байт (defb уходит).

ДВА КЛАССА СПЕЦИАЛИЗАЦИИ.
  d <= 6: адрес набирается цепочкой inc hl. На i8080 ни LHLD, ни INX, ни MOV A,M
          НЕ ТРОГАЮТ ФЛАГИ, поэтому сохранение флагов (push af/pop af и пляска
          через il_a — 47 тактов) не нужно вовсе. Контракт получается СТРОЖЕ
          исходного: флаги не портятся физически, а не «восстанавливаются».
  d >= 7: цепочка inc hl длиннее выгоды (5 тактов за штуку против 32 у сложения),
          поэтому остаётся сложение через A, а с ним и сохранение флагов.

Запуск: python3 tools/genspec.py [--dry]
"""
import re, sys, glob, collections, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FAMILIES = ("z80_bitX", "z80_lda_X", "z80_sta_Y")
DRY = "--dry" in sys.argv

# ВЫБОР ПАР — НЕ «все подряд». Потолок кода жёсткий: он упирается в $B000, где
# начинаются рабочие буферы спрайтов, и до правки свободно было 183 байта.
# Специализация всех 24 пар стоила бы +431 байт и молча выпускала неработающий
# образ (см. сторож ASSERT в scubacod1.asm). Поэтому берём только те пары, где
# выигрыш за байт оправдан; замер прогоном (401 тик, уровень 4) дал такие вызовы:
#   z80_bitX  d=13 — 2659, z80_lda_X d=13 — 1636, z80_lda_X d=2 — 1565,
#   z80_lda_X d=3  —  990, z80_bitX  d=17 —  397.
# Эти пять пар — 95% всех обращений обоих семейств. Чистая цена +39 байт:
# у bitX d=13 площадок 27, а тело 22 байта, то есть пара даже ОСВОБОЖДАЕТ 5 байт.
SELECT = {("z80_bitX", 13), ("z80_lda_X", 13), ("z80_lda_X", 2),
          ("z80_lda_X", 3), ("z80_bitX", 17),
          # F.4, семейство z80_sta_Y: площадок мало (по одной), но это тела горячих
          # циклов — 1024/776/776 вызовов за 401 тик. Рамка бюджета: после обоих
          # узлов оставить не меньше 60 байт до потолка $B000.
          ("z80_sta_Y", 1), ("z80_sta_Y", 3), ("z80_sta_Y", 7)}

# --- перепись площадок --------------------------------------------------------
pairs = collections.Counter()
files = sorted(glob.glob(f"{ROOT}/src8080/*.asm"))
for f in files:
    L = open(f, encoding="utf-8").read().split("\n")
    for i in range(len(L) - 1):
        m = re.match(r"\s*call\s+(" + "|".join(FAMILIES) + r")\s*(;.*)?$", L[i], re.I)
        if not m:
            continue
        d = re.match(r"\s*defb\s+\$([0-9A-Fa-f]+)\s*(;.*)?$", L[i + 1])
        if not d:
            continue
        key = (m.group(1), int(d.group(1), 16))
        if key in SELECT:
            pairs[key] += 1
    # ИДЕМПОТЕНТНОСТЬ. Площадки, переписанные прошлым запуском, уже не выглядят как
    # call+defb, и наивный повторный запуск не выпустил бы для них тела — сборка
    # падала бы с «Label not found». Поэтому считаем и уже специализированные
    # вызовы: генератор обязан выпускать тела для ВСЕХ пар из SELECT, которые
    # реально встречаются в дереве, в каком бы виде они там ни были.
    for ln in L:
        m = re.match(r"\s*call\s+(" + "|".join(FAMILIES) + r")_(\d+)\s*(;.*)?$", ln, re.I)
        if m:
            key = (m.group(1), int(m.group(2)))
            if key in SELECT:
                pairs[key] += 1

if not pairs:
    print("ПУСТАЯ ВЫБОРКА: ни одной площадки не найдено — генератор не имеет смысла")
    sys.exit(2)

# --- генерация тел ------------------------------------------------------------
def addr(d):
    """набор адреса IX+d в HL; возвращает (строки, портит ли A и флаги)"""
    if d == 0:
        return [], False
    if d <= 6:
        return ["\tinc hl" for _ in range(d)], False
    return ["\tld a,%d" % d, "\tadd a,l", "\tld l,a",
            "\tld a,0", "\tadc a,h", "\tld h,a"], True

def body(fam, d):
    a, dirty = addr(d)
    out = [f"{fam}_{d}:"]
    if fam == "z80_bitX":
        # контракт как у общего: A := (IX+d), прежнее A в il_a, флаги не обещаны
        out += ["\tld (il_a),a", "\tld (il_hl),hl", "\tld hl,(z80_ix)"]
        out += a
        out += ["\tld a,(hl)", "\tld hl,(il_hl)", "\tret"]
    elif fam == "z80_sta_Y":
        # контракт общего: (IY+d) := A, A и флаги целы, остальные регистры целы
        if not dirty:
            # d <= 6: A вообще не трогаем, флаги не портит ни одна инструкция
            out += ["\tld (il_hl),hl", "\tld hl,(z80_iy)"] + a
            out += ["\tld (hl),a", "\tld hl,(il_hl)", "\tret"]
        else:
            out += ["\tld (il_a),a", "\tld (il_hl),hl", "\tpush af",
                    "\tld hl,(z80_iy)"] + a
            out += ["\tld a,(il_a)", "\tld (hl),a", "\tpop af",
                    "\tld hl,(il_hl)", "\tret"]
    else:  # z80_lda_X: A := (IX+d), ФЛАГИ И ОСТАЛЬНЫЕ РЕГИСТРЫ ЦЕЛЫ
        out += ["\tld (il_hl),hl"]
        if dirty:
            out += ["\tpush af"]
        out += ["\tld hl,(z80_ix)"]
        out += a
        out += ["\tld a,(hl)"]
        if dirty:
            out += ["\tld (il_a),a", "\tpop af", "\tld a,(il_a)"]
        out += ["\tld hl,(il_hl)", "\tret"]
    return out

def cost(fam, d):
    a, dirty = addr(d)
    if fam == "z80_sta_Y":
        c = 16 + 16 + 7 + 16 + 10
        c += (5 * d) if 0 < d <= 6 else (32 if d else 0)
        if dirty:
            c += 13 + 11 + 13 + 10          # il_a, push af, ld a,(il_a), pop af
        return c
    c = {"z80_bitX": 13 + 16 + 16 + 7 + 16 + 10, "z80_lda_X": 16 + 16 + 7 + 16 + 10}[fam]
    c += (5 * d) if 0 < d <= 6 else (32 if d else 0)
    if dirty and fam == "z80_lda_X":
        c += 11 + 13 + 10 + 13
    return c

GEN = {"z80_bitX": 168, "z80_lda_X": 202, "z80_sta_Y": 202}  # такты общих хелперов

lines = ["", "; " + "=" * 76,
         "; СПЕЦИАЛИЗИРОВАННЫЕ ИНДЕКСНЫЕ ХЕЛПЕРЫ — СГЕНЕРИРОВАНЫ tools/genspec.py.",
         "; Руками не править: правь генератор и перезапускай его.",
         "; Смещение зашито в точку входа, поэтому не нужен разбор потока команд по",
         "; адресу возврата (58 тактов на вызов), а при d <= 6 не нужно и сохранение",
         "; флагов: LHLD, INX и MOV A,M на i8080 флагов не трогают.",
         "; " + "=" * 76]
saved_total = 0
for (fam, d), n in sorted(pairs.items()):
    lines += body(fam, d)
    saved_total += (GEN[fam] - cost(fam, d)) * n
print(f"пар (хелпер, смещение): {len(pairs)}; площадок вызова: {sum(pairs.values())}")
for (fam, d), n in sorted(pairs.items(), key=lambda x: -x[1])[:8]:
    print(f"  {n:3d} площадок  {fam} d={d}: {GEN[fam]} -> {cost(fam,d)} тактов "
          f"(минус {GEN[fam]-cost(fam,d)})")

if DRY:
    sys.exit(0)

# --- переписать площадки ------------------------------------------------------
nsites = 0
for f in files:
    L = open(f, encoding="utf-8").read().split("\n")
    out, i = [], 0
    while i < len(L):
        m = re.match(r"(\s*)call\s+(" + "|".join(FAMILIES) + r")\s*(;.*)?$", L[i], re.I)
        d = re.match(r"\s*defb\s+\$([0-9A-Fa-f]+)\s*(;.*)?$", L[i + 1]) if m and i + 1 < len(L) else None
        if m and d and (m.group(2), int(d.group(1), 16)) in SELECT:
            out.append(f"{m.group(1)}call {m.group(2)}_{int(d.group(1),16)}")
            i += 2
            nsites += 1
            continue
        out.append(L[i]); i += 1
    open(f, "w", encoding="utf-8").write("\n".join(out))

# --- дописать тела в scubai80.asm --------------------------------------------
p = f"{ROOT}/src8080/scubai80.asm"
s = open(p, encoding="utf-8").read()
MARK = "; СПЕЦИАЛИЗИРОВАННЫЕ ИНДЕКСНЫЕ ХЕЛПЕРЫ"
if MARK in s:
    s = s[:s.index("\n; " + "=" * 76 + "\n; СПЕЦИАЛИЗИРОВАННЫЕ")]
open(p, "w", encoding="utf-8").write(s.rstrip("\n") + "\n" + "\n".join(lines) + "\n")
print(f"переписано площадок: {nsites}; ожидаемая экономия {saved_total} тактов на 401 тик прогона")
