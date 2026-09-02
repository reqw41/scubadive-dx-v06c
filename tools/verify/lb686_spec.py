#!/usr/bin/env python3
"""
lb686_spec.py — СПЕЦИФИКАЦИЯ процедуры LB686 (карта занятости после шага существа)
и её проверка на записях живых вызовов из стенда (tools/verify/lb686_dump.js).

Зачем спецификация. LB686 в нашем образе — построчный перевод Z80-кода, где
каждое обращение к полю записи идёт через хелпер (~90 тактов вместо одного
опкода). Чтобы переписать её нативно под i8080, нужно знать, ЧТО она делает, а не
КАК делал Z80. Это «что» и записано ниже — коротко, на Python, и доказано на
тысячах реальных вызовов: рекордер снимает вход и выход штатного кода, модель
считает свой выход по тому же входу, они обязаны совпасть байт в байт.

ЧТО ДЕЛАЕТ LB686. Существо только что сдвинулось на одну клетку по горизонтали
(бит 5 в (IX+$0D)) и/или по вертикали (бит 6). Карта занятости SCRATTR (32
столбца x 24 строки, байт на клетку) должна это отразить:
  1) освободить ПОКИНУТЫЙ столбец (или строку): клетки, где стояла наша метка
     6^m, становятся свободными (6);
  2) сдвинуть координаты записи (IX+0/1) и описателя (IY+0/1) на клетку;
  3) пометить НОВОЕ место: свободные клетки (6) под существом получают метку 6^m.
Метка m = (IX+$04) у каждого существа своя. Клетки вне поля (строка >= 24,
столбец >= 32, в том числе «отрицательные» после переполнения байта) не
трогаются.

  python3 tools/verify/lb686_spec.py <дамп.json>
"""
import json, sys

FIELD_W, ROWS = 32, 24

def cell_ok(row, col):
    return row < ROWS and col < FIELD_W          # байты 0..255: >=0xE0 тоже «вне поля»

def lb70f(attr, row, col, c, m, width):
    """Строка: для width клеток от col — если клетка == c, клетка ^= m."""
    if not row < ROWS: return
    for i in range(width):
        cc = (col + i) & 0xFF
        if cc < FIELD_W and attr[row * 32 + cc] == c:
            attr[row * 32 + cc] ^= m

def lb686(ix, iy, attr):
    """ix, iy — bytearray записи и описателя; attr — bytearray SCRATTR. Правит на месте."""
    m = ix[0x04]
    c = 6 ^ m
    if ix[0x0D] & 0x20:                          # шаг по горизонтали
        row, col = iy[1], iy[0]
        # ⚠️ ФЛАГ НАПРАВЛЕНИЯ — В (IX+$11), А НЕ (IX+$17). В исходнике стоит
        # `call z80_bitX_17`, и 17 там ДЕСЯТИЧНОЕ: хелперы z80_bitX_13/_17 носят
        # смещение в имени как число, а не как hex ($0D и $11). Первая редакция
        # спецификации читала $17 и разъезжалась с кодом в 149 вызовах из 595 —
        # дифференциальный тест поймал это первым же прогоном.
        if ix[0x11] & 0x80 == 0:                 # вправо: покинут левый столбец = старый col
            ix[0] = (ix[0] + 1) & 0xFF; iy[0] = (iy[0] + 1) & 0xFF
        else:                                    # влево: покинут правый = старый col + (ширина-1)
            ix[0] = (ix[0] - 1) & 0xFF; iy[0] = (iy[0] - 1) & 0xFF
            col = (col + iy[6]) & 0xFF
        for r in range(iy[9]):                   # (IY+9) — высота в клетках
            rr = (row + r) & 0xFF
            if cell_ok(rr, col) and attr[rr * 32 + col] == c:
                attr[rr * 32 + col] = 6
    if ix[0x0D] & 0x40:                          # шаг по вертикали
        row, col = iy[1], iy[0]
        if ix[0x12] & 0x80 == 0:                 # вниз: покинута верхняя строка = старая row
            iy[1] = (iy[1] + 1) & 0xFF; ix[1] = (ix[1] + 1) & 0xFF
        else:                                    # вверх: покинута нижняя = старая row + (высота-1)
            iy[1] = (iy[1] - 1) & 0xFF; ix[1] = (ix[1] - 1) & 0xFF
            row = (row + iy[8]) & 0xFF
        lb70f(attr, row, col, c, m, iy[7])       # (IY+7) — ширина
    # LB704/LB875: пометить новое место — height строк, в каждой width клеток
    row, col = iy[1], iy[0]
    iy[0x0E] = iy[9]
    for r in range(iy[9]):
        lb70f(attr, (row + r) & 0xFF, col, 6, m, iy[7])
        iy[0x0E] = (iy[0x0E] - 1) & 0xFF
    return ix, iy, attr

if __name__ == "__main__":
    calls = json.load(open(sys.argv[1]))
    bad = 0
    for k, c in enumerate(calls):
        ix = bytearray(bytes.fromhex(c["ix_in"])); iy = bytearray(bytes.fromhex(c["iy_in"]))
        attr = bytearray(bytes.fromhex(c["attr_in"]))
        lb686(ix, iy, attr)
        want_ix = bytes.fromhex(c["ix_out"]); want_iy = bytes.fromhex(c["iy_out"]); want_attr = bytes.fromhex(c["attr_out"])
        errs = []
        if bytes(ix) != want_ix: errs.append("запись " + " ".join(f"{i:02x}:{a:02x}/{b:02x}" for i,(a,b) in enumerate(zip(ix,want_ix)) if a!=b))
        if bytes(iy) != want_iy: errs.append("описатель " + " ".join(f"{i:02x}:{a:02x}/{b:02x}" for i,(a,b) in enumerate(zip(iy,want_iy)) if a!=b))
        if bytes(attr) != want_attr:
            d = [(i//32, i%32, a, b) for i,(a,b) in enumerate(zip(attr,want_attr)) if a!=b]
            errs.append(f"SCRATTR {len(d)} клеток: " + " ".join(f"({r},{cc}) {a:02x}/{b:02x}" for r,cc,a,b in d[:6]))
        if errs:
            bad += 1
            if bad <= 5: print(f"вызов #{k} (флаги {c['flags']:02x}): " + "; ".join(errs))
    n = len(calls)
    hz = sum(1 for c in calls if c["flags"] & 0x20); vt = sum(1 for c in calls if c["flags"] & 0x40)
    print(f"вызовов {n}: горизонтальных {hz}, вертикальных {vt}, обоих {sum(1 for c in calls if (c['flags']&0x60)==0x60)}; расхождений {bad}")
    if n < 200 or hz < 20 or vt < 20:
        print("ПРОВАЛ: покрытие не набрано (нужно >=200 вызовов, >=20 каждого направления)"); sys.exit(2)
    print("СПЕЦИФИКАЦИЯ ВЕРНА" if not bad else "СПЕЦИФИКАЦИЯ РАСХОДИТСЯ С КОДОМ"); sys.exit(1 if bad else 0)
