#!/usr/bin/env python3
"""Русский текст Scuba Dive (флаг сборки RUS).

Шрифт ROM_CHARSET — $20..$5A по 8 байт, адресуется арифметически, поэтому
кириллица живёт в СВОБОДНЫХ ячейках: знаки $24..$2C (пунктуация, в игре не
печатается) и латинские G/Q ($47/$51), которые в русской сборке не нужны (H занята:
ею печатается русская Н).
Буквы, совпадающие по начертанию с латиницей/цифрами, берутся из неё
(А В Е К М Н О Р С Т Х, З='3', У='Y'). Ё пишется как Е, Ы/Ю/Я/Ф/Ц/Э/Щ в
словах избегаем — под них ячеек нет.

Режимы:
  python3 tools/rus.py gen     — напечатать asm-блоки (проверка глазами)
  python3 tools/rus.py apply   — вписать IFDEF RUS/ELSE/ENDIF в исходники (идемпотентно)
  python3 tools/rus.py check   — убедиться, что исходники совпадают с генератором (гейт)
"""
import re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SYMB = ROOT / "src8080/scubasymb.asm"
COD1 = ROOT / "src8080/scubacod1.asm"

# Штрих 2 px, засечки, ряд 7 пустой — как у авторской латиницы.
CYR = {
 "Б": [".######.",".##.....",".##.....",".#####..",".##..##.",".##..##.",".#####..","........"],
 "Г": [".#######",".###..##",".##.....",".##.....",".##.....",".##.....",".###....","........"],
 "Д": ["..#####.","..##..##","..##..##","..##..##","..##..##",".#######",".#....#.","........"],
 "Ж": [".##.#.##",".##.#.##","..#####.","...###..","..#####.",".##.#.##",".##.#.##","........"],
 "И": [".##...##",".##..###",".##.####",".####.##",".###..##",".##...##",".##...##","........"],
 "Й": [".##.#.##",".##...##",".##..###",".####.##",".###..##",".##...##",".##...##","........"],  # обе ножки на всю высоту, чёрточка — точка в середине верхнего ряда (владелец)
 "Л": ["..######","..##..##","..##..##","..##..##","..##..##",".###..##",".##...##","........"],
 "П": [".#######",".##...##",".##...##",".##...##",".##...##",".##...##",".##...##","........"],
 "Ч": [".##...##",".##...##",".##...##","..######","......##","......##","......##","........"],
 "Ш": [".##.#.##",".##.#.##",".##.#.##",".##.#.##",".##.#.##",".##.#.##",".#######","........"],  # колонка 0 пустая — просвет, как у всех букв (на 8 колонок сливалась с И)
 "Ь": [".##.....",".##.....",".##.....",".#####..",".##..##.",".##..##.",".#####..","........"],
}
SLOT = {"Б":0x24,"Г":0x25,"Д":0x26,"Ж":0x27,"И":0x28,"Й":0x29,"Л":0x2A,"П":0x2B,"Ч":0x2C,"Ш":0x47,"Ь":0x51}
SAME = {"А":"A","В":"B","Е":"E","Ё":"E","К":"K","М":"M","Н":"H","О":"O","Р":"P","С":"C","Т":"T","Х":"X","З":"3","У":"Y"}

# метка в scubacod1.asm -> русская строка (ширина указана для вёрстки)
STRINGS = {
 "StrHudHigh":   "РЕКОРД",
 "StrHudScore":  "СЧЕТ",
 "StrHudHeld":   "ГРУЗ",
 "StrHudSkill":  "КЛАСС",
 "StrHudLives":  "ЖИЗНИ",
 "StrHudOxygen": "ВОЗДУХ",
 "StrHudDepth":  "ГЛУБИНА",
 "MenuStr4":     "УПРАВЛЕНИЕ: КЛАВИАТУРА/ДЖОЙСТИК",   # 31, столбец 1
 "MenuStr5":     "ПОВОРОТ  ВЛЕВО/ВПРАВО",
 "MenuStr6":     "РАЗГОН   ВВЕРХ/УС/СС/РУСЛАТ/ЗБ",     # 30
 "MenuStr7":     "ТОРМОЗ   ВНИЗ/ПРОБЕЛ/ТАБ",
 "MenuStr8":     "КЛАВИШИ 1-4: КЛАСС СЛОЖНОСТИ",      # 28, столбец 2 (в HUD — просто КЛАСС, 5 знакомест)
 "MenuStr9":     "РАЗГОН - НАЧАТЬ ИГРУ",              # 20, столбец 6
 "StrPressAny":  "НАЖМИТЕ ПРОБЕЛ",                    # 14, столбец 9 (экран демо; выход — любая клавиша)
 "StrGameOver":  "ИГРА ОКОНЧЕНА",                    # 13, столбец 9 (конец игры, GAMEOVER)
 # StrSkill («КЛАСС: 1») — вручную в scubacod1.asm: вложен в IFDEF MENUHUD
}

def code(ch):
    if ch in SLOT: return SLOT[ch]
    if ch in SAME: ch = SAME[ch]
    o = ord(ch)
    assert 0x20 <= o <= 0x5A and not (0x3B <= o <= 0x40) and o not in (0x47, 0x51), f"нет глифа для {ch!r}"
    return o

def enc(s):
    return [code(c) - 0x20 for c in s]

def defb(s):
    bs = enc(s)
    lines = []
    for i in range(0, len(bs), 12):
        lines.append("\tDEFB\t" + ",".join("$%02X" % b for b in bs[i:i+12]))
    lines[0] += "\t; \"%s\" (%d)" % (s, len(s))
    return lines

def rows(ch):
    out = []
    for r in CYR[ch]:
        assert len(r) == 8
        out.append(sum(1 << (7 - i) for i, c in enumerate(r) if c == "#"))
    return out

def glyph_block(ch, orig):
    sl = SLOT[ch]
    new = ["\tDEFB %s\t;char%02X = %s (RUS)" % (format(b, "#010b").replace("0b", "%"), sl, ch) if i == 0
           else "\tDEFB %s" % format(b, "#010b").replace("0b", "%") for i, b in enumerate(rows(ch))]
    return ["\tIFDEF RUS"] + new + ["\tELSE"] + orig + ["\tENDIF"]

def apply_symb(check):
    txt = SYMB.read_text().split("\n")
    for ch, sl in SLOT.items():
        idx = next(i for i, l in enumerate(txt) if re.search(r";char%02X\b" % sl, l))
        if txt[idx-1].strip() == "IFDEF RUS":
            if not check:
                txt[idx:idx+8] = glyph_block(ch, [])[1:9]  # перерисованный глиф — обновить
            continue
        if check:
            raise SystemExit("rus.py check: глиф %s (char%02X) не вписан" % (ch, sl))
        orig = txt[idx:idx+8]
        txt[idx:idx+8] = glyph_block(ch, orig)
    if check:
        # сверка содержимого блока
        for ch, sl in SLOT.items():
            idx = next(i for i, l in enumerate(txt) if re.search(r";char%02X = " % sl, l))
            want = glyph_block(ch, [])[1:9]
            if txt[idx:idx+8] != want:
                raise SystemExit("rus.py check: глиф %s расходится с генератором" % ch)
        return
    SYMB.write_text("\n".join(txt))

def apply_cod1(check):
    txt = COD1.read_text().split("\n")
    for label, s in STRINGS.items():
        idx = next(i for i, l in enumerate(txt) if l.rstrip() == label)
        j = idx + 1
        if txt[j].strip() == "IFDEF RUS":
            k = j + 1
            if label == "StrSkill":
                k += 1  # SkillChar = StrSkill + N
            e = next(i for i in range(k, k + 8) if txt[i].strip() == "ELSE")
            want = defb(s)
            if txt[k:e] != want:
                if check:
                    raise SystemExit("rus.py check: строка %s расходится с генератором" % label)
                txt[k:e] = want  # изменённая строка — обновить
                if label == "StrSkill":
                    txt[j + 1] = "SkillChar = StrSkill + %d" % s.index("1")
            continue
        if check:
            raise SystemExit("rus.py check: строка %s не вписана" % label)
        if label == "StrSkill":
            orig = txt[j:j+2]   # SkillChar = ..., ABYTE
            new = ["\tIFDEF RUS", "SkillChar = StrSkill + %d" % s.index("1")] + defb(s) + ["\tELSE"] + orig + ["\tENDIF"]
            txt[j:j+2] = new
        else:
            assert "ABYTE" in txt[j], (label, txt[j])
            orig = [txt[j]]
            txt[j:j+1] = ["\tIFDEF RUS"] + defb(s) + ["\tELSE"] + orig + ["\tENDIF"]
    if not check:
        COD1.write_text("\n".join(txt))

def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "gen"
    if mode == "gen":
        for ch in SLOT:
            print("\n".join(glyph_block(ch, ["\t; …оригинал…"])))
        for label, s in STRINGS.items():
            print(label); print("\n".join(defb(s)))
    elif mode == "apply":
        apply_symb(False); apply_cod1(False); print("rus.py: применено")
    elif mode == "check":
        apply_symb(True); apply_cod1(True); print("rus.py check: OK")
    else:
        raise SystemExit(__doc__)

if __name__ == "__main__":
    main()
