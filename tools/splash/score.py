#!/usr/bin/env python3
"""
score.py — офлайн-конвертер марша Men of Harlech (public domain) из score римейка
в трёхголосые таблицы заставки для ВИ53.

Источник: ~/projects/scubadive-research/remake-assets/ay/gen_chiptune_v16_harlech.py
Берём ТОЛЬКО данные (ноты, аккорды, таблицы баса и арпеджио), синтез звука
генератора не трогаем.

ТРИ ГОЛОСА — три канала ВИ53 (в заставке игра не работает, свободны все):
  мелодия  — строка A+A+B+A, длительности 1..6 восьмых;
  бас      — по аккорду такта, 4 ноты по 2 восьмых;
  гармония — арпеджио по аккорду такта, 4 ноты по 2 восьмых.
Такт = 8 восьмых, тактов 40, вступление 16 восьмых (голоса молчат).

ПЛОТНЫЙ ФОРМАТ: нота — ОДИН байт (длительность-1) << 5 | индекс высоты.
  индекс 31 = пауза, байт 0FFh = конец голоса. Длительность в восьмых 1..6,
  в кадрах = восьмые * 12 (EIGHTH=0.24 c при 50 Гц).
Делители ВИ53 считаются ЗДЕСЬ при тактовой 1.5 МГц и лежат готовой таблицей —
драйверу заставки считать нечего. Нулевого делителя нет по построению.

Применение: python3 tools/splash/score.py
"""
import json, re
from pathlib import Path

SRC = Path.home() / "projects/scubadive-research/remake-assets/ay/gen_chiptune_v16_harlech.py"
CLK, FPS, REST, END = 1_500_000, 50, 31, 0xFF

src = SRC.read_text()
ns = {}
for name in ("NAMES", "ALIASES", "EIGHTH", "A", "B", "INTRO_EIGHTHS",
             "CHORDS", "ARP", "BASS"):
    m = re.search(rf"^{name} = (.*?)(?=^\w|\Z)", src, re.M | re.S)
    exec(f"{name} = {m.group(1).strip()}", ns)
NAMES, ALIASES, EIGHTH = ns["NAMES"], ns["ALIASES"], ns["EIGHTH"]
INTRO, CHORDS, ARP, BASS = ns["INTRO_EIGHTHS"], ns["CHORDS"], ns["ARP"], ns["BASS"]
MELODY = ns["A"] + ns["A"] + ns["B"] + ns["A"]
FRAMES_PER_EIGHTH = round(EIGHTH * FPS)

def midi(n):
    n = ALIASES.get(n, n)
    return (int(n[-1]) + 1) * 12 + NAMES.index(n[:-1])
def freq(n):
    return 440.0 * (2.0 ** ((midi(n) - 69) / 12.0))

# --- три голоса как последовательности (длительность в восьмых, нота|None) ---
voices = {}
voices["мелодия"]  = [(INTRO, None)] + list(MELODY)
voices["бас"]      = [(INTRO, None)] + [(2, BASS[c][i]) for c in CHORDS for i in range(4)]
voices["гармония"] = [(INTRO, None)] + [(2, ARP[c][i])  for c in CHORDS for i in range(4)]

# пауза вступления 16 восьмых не влезает в 3 бита — режем на куски по 6
def split_long(seq):
    out = []
    for d, n in seq:
        while d > 6:
            out.append((6, n)); d -= 6
        if d: out.append((d, n))
    return out
voices = {k: split_long(v) for k, v in voices.items()}

pitches = sorted({n for v in voices.values() for _, n in v if n}, key=midi)
assert len(pitches) < REST, f"высот {len(pitches)}, индексов только {REST}"
idx = {p: i for i, p in enumerate(pitches)}
div = []
for p in pitches:
    d = round(CLK / freq(p))
    assert 2 <= d <= 0xFFFF, f"{p}: делитель {d} вне диапазона"
    div.append(d)

streams, expect = {}, {}
for name, seq in voices.items():
    b, e = [], []
    for dur, n in seq:
        b.append(((dur - 1) << 5) | (REST if n is None else idx[n]))
        e.append({"rest": True, "frames": dur * FRAMES_PER_EIGHTH} if n is None else
                 {"note": n, "hz": freq(n), "div": div[idx[n]], "frames": dur * FRAMES_PER_EIGHTH})
    b.append(END)
    streams[name], expect[name] = b, e

def rows(vals, per):
    return "\n".join("\tdefb " + ",".join(f"0{v:02X}h" for v in vals[i:i + per])
                     for i in range(0, len(vals), per))

tot_e = sum(d for d, _ in voices["мелодия"])
asm = f"""; splash_music.asm — марш Men of Harlech (public domain), три голоса для ВИ53.
; СГЕНЕРИРОВАН tools/splash/score.py из score римейка, руками не править.
; Нота — один байт: (длительность-1) << 5 | индекс высоты; {REST} = пауза,
; 0FFh = конец голоса. Кадров на восьмую: {FRAMES_PER_EIGHTH} (EIGHTH={EIGHTH} c, {FPS} Гц).
; Делители ВИ53 посчитаны офлайн при тактовой {CLK} Гц; нуля в таблице нет.
; Длительность марша {tot_e * EIGHTH:.1f} c.

; делители: младший байт, затем старший
spl_div:
{rows([x for d in div for x in (d & 0xFF, d >> 8)], 8)}

; голос 0 — мелодия ({len(streams['мелодия'])} Б)
spl_v0:
{rows(streams['мелодия'], 16)}
; голос 1 — бас ({len(streams['бас'])} Б)
spl_v1:
{rows(streams['бас'], 16)}
; голос 2 — гармония ({len(streams['гармония'])} Б)
spl_v2:
{rows(streams['гармония'], 16)}
"""
Path("src_splash").mkdir(exist_ok=True)
Path("src_splash/splash_music.asm").write_text(asm, encoding="utf-8")
Path("build").mkdir(exist_ok=True)
Path("build/splash_expect.json").write_text(json.dumps(
    {"clk": CLK, "fps": FPS, "frames_per_eighth": FRAMES_PER_EIGHTH,
     "pitches": pitches, "div": div, "voices": expect}, ensure_ascii=False), encoding="utf-8")
n = sum(len(s) for s in streams.values())
print(f"голоса: " + ", ".join(f"{k} {len(v)} Б" for k, v in streams.items()))
print(f"нот всего {n} Б + таблица делителей {len(div)*2} Б = {n + len(div)*2} Б")
print(f"высот {len(pitches)}: {' '.join(pitches)}")
print(f"делители {min(div)}..{max(div)} -> {CLK/max(div):.1f}..{CLK/min(div):.1f} Гц")
print(f"длительность {tot_e * EIGHTH:.1f} c")
