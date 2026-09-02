#!/usr/bin/env python3
"""
packmarch.py — упаковка марша заставки для стартового МЕНЮ игры.

Зачем. На заставке ноты живут в стартере по 0x5500 и умирают, как только игра
распаковывается: её образ занимает эту память. Чтобы марш играл и в меню, ноты
обязаны лежать ВНУТРИ образа, а там байты на счету.

Марш очень повторяющийся (мелодия A+A+B+A, бас и гармония — секвенции по
аккордам), поэтому ноты пакуются ВЫЗОВОМ ФРАГМЕНТА: повторяющийся кусок хранится
один раз, а в потоке стоит ссылка на него.

ФОРМАТ. Нота — как была: (длительность-1) << 5 | индекс высоты, 31 = пауза.
Управляющие байты взяты из ЗАВЕДОМО НЕВОЗМОЖНЫХ значений, а не назначены наугад:
  0FFh = длительность 8, высота 31. Пауз длиннее шести генератор не выпускает
         (score.py режет их на куски по 6) — байт свободен;
  0FEh = высота 30, а высот всего 22 (0..21) — тоже свободен.
Управление:
  0FFh 000h 000h — конец голоса (адрес 0);
  0FFh мл ст     — играть фрагмент по адресу, потом продолжить отсюда;
  0FEh           — возврат из фрагмента.
Вложенность ОДНОУРОВНЕВАЯ: фрагмент не зовёт фрагмент. Тогда голосу хватает
одного слова под адрес возврата, и плеер остаётся коротким.

  python3 tools/music/packmarch.py [вход.asm] [выход.asm]
"""
import re, sys
from pathlib import Path

SRC = Path(sys.argv[1] if len(sys.argv) > 1 else "src_splash/splash_music.asm")
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else "src8080/scubamenumus.asm")
CALL, RET = 0xFF, 0xFE

text = SRC.read_text(encoding="utf-8")
def block(name):
    out, on = [], False
    for line in text.split("\n"):
        if line.startswith(name + ":"): on = True; continue
        if on and "defb" in line: out += [int(x, 16) for x in re.findall(r"0([0-9A-Fa-f]{2})h", line)]
        elif on and line.strip() and not line.startswith("\t"): break
    return out

voices = {n: block("spl_v%d" % i) for i, n in enumerate(("melody", "bass", "harm"))}
for v in voices.values():
    assert v and v[-1] == 0xFF, "голос обязан кончаться 0FFh"
    v.pop()
div, ay = block("spl_div"), block("spl_ay")
for k, v in voices.items():
    assert CALL not in v and RET not in v, f"управляющий байт встретился в нотах голоса {k}"

def pack(seq):
    """Жадно: берём самый выгодный повтор, выносим во фрагмент, повторяем.
    Выгода = вхождений*(длина-3) - длина - 1 (3 байта вызов, 1 байт возврат)."""
    data, frags = list(seq), []
    while True:
        best = (0, None, None, 0)
        n = len(data)
        for L in range(min(90, n // 2), 3, -1):
            seen = {}
            for i in range(n - L + 1):
                w = data[i:i + L]
                if any(isinstance(x, tuple) for x in w): continue
                seen.setdefault(tuple(w), []).append(i)
            for key, pos in seen.items():
                sel, last = [], -99
                for p in pos:
                    if p >= last + L: sel.append(p); last = p
                if len(sel) >= 2:
                    gain = len(sel) * (L - 3) - L - 1
                    if gain > best[0]: best = (gain, key, sel, L)
            if best[0] > 0: break
        if best[0] <= 0: break
        _, key, sel, L = best
        fid = len(frags); frags.append(list(key))
        out, i = [], 0
        while i < len(data):
            if i in sel: out.append(("call", fid)); i += L
            else: out.append(data[i]); i += 1
        data = out
    return data, frags

packed = {k: pack(v) for k, v in voices.items()}

# --- САМОПРОВЕРКА: РАСПАКОВКА ОБЯЗАНА ДАТЬ ИСХОДНЫЙ ГОЛОС НОТА В НОТУ.
# Упаковщик без этой проверки — генератор молчаливого брака: ошибка в поиске
# повторов даёт складную на вид таблицу, а слышно её станет только на железе.
for k, (stream, frags) in packed.items():
    back = []
    for x in stream:
        back += frags[x[1]] if isinstance(x, tuple) else [x]
    assert back == voices[k], f"распаковка голоса {k} не совпала с исходником"
# и ни один фрагмент не должен сам содержать вызов (вложенность одноуровневая)
for k, (stream, frags) in packed.items():
    for f in frags:
        assert CALL not in f and RET not in f, f"фрагмент голоса {k} содержит управляющий байт"

def rows(body):
    out, row = [], []
    for b in body:
        row.append("0%02Xh" % b)
        if len(row) == 12: out.append("\tdefb " + ",".join(row)); row = []
    if row: out.append("\tdefb " + ",".join(row))
    return out

asm = ["; СГЕНЕРИРОВАНО tools/music/packmarch.py — РУКАМИ НЕ ПРАВИТЬ.",
       "; Марш Men of Harlech (public domain) для стартового меню, три голоса.",
       "; Формат и выбор управляющих байтов — в шапке упаковщика.",
       "\tIFDEF MENUMUS", ""]
total = 0
for k, (stream, frags) in packed.items():
    for i, f in enumerate(frags):
        asm.append("mm_%s_f%d:" % (k, i)); asm += rows(f + [RET]); total += len(f) + 1
    asm.append("mm_%s:" % k)
    row = []
    for x in stream:
        if isinstance(x, tuple):
            if row: asm.append("\tdefb " + ",".join(row)); row = []
            asm.append("\tdefb 0FFh")
            asm.append("\tdefw mm_%s_f%d" % (k, x[1])); total += 3
        else:
            row.append("0%02Xh" % x); total += 1
            if len(row) == 12: asm.append("\tdefb " + ",".join(row)); row = []
    if row: asm.append("\tdefb " + ",".join(row))
    asm.append("\tdefb 0FFh\n\tdefw 0"); total += 3
asm.append("mm_div:"); asm += rows(div)
# ТАБЛИЦЫ AY ЗДЕСЬ НЕТ. Меню и заставка играют только на ВИ53 (решение владельца
# 2026-09-02): один аппарат на оба экрана, иначе на машинах с AY тембр менялся бы
# при переходе с заставки в меню. Таблица периодов AY осталась в заставке —
# splash_music.asm генерируется отдельно и её пока хранит.
asm.append("\tENDIF")
OUT.write_text("\n".join(asm) + "\n", encoding="utf-8")

raw = sum(len(v) + 1 for v in voices.values())
print(f"ноты: было {raw} Б, стало {total} Б (экономия {raw - total})")
for k, (stream, frags) in packed.items():
    n = sum(3 if isinstance(x, tuple) else 1 for x in stream) + 3
    print(f"  {k}: поток {n} Б, фрагментов {len(frags)}" +
          (f" по {', '.join(str(len(f) + 1) for f in frags)} Б" if frags else ""))
print(f"таблица ВИ53 {len(div)} Б (AY не нужен: играем только на ВИ53)")
print(f"ИТОГО данных {total + len(div)} Б -> {OUT}")
