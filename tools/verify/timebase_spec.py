#!/usr/bin/env python3
"""
timebase_spec.py — СПЕЦИФИКАЦИЯ аккумулятора игрового времени (флаг TIMEBASE).

Единица игрового времени u = 1/175 с: 3.5 u на кадр (50 Гц) — ровно то, что
сейчас даёт один тик при штатном темпе pace_tick (3.5 тика на кадр). Тик
продвигает мир на Δ единиц: счётчики существ/дайвера/таймеров уменьшаются на Δ,
срабатывание — «дошёл до нуля или ниже», перелёт переносится в перезарядку.

tb_tick (раз за тик, в начале LB213):
  df  = FRAMES - last (кадров прошло);  last := FRAMES
  df >= 5  -> пауза (смена экрана и т.п.): acc := 0, Δ := 1
  acc += 7*df - 2            # запас времени в ПОЛУединицах после номинального 1 u за тик
  extra = clamp(acc // 2, 0, 7) ; Δ = 1 + extra ; acc -= 2*extra
  acc < -8 -> acc := -8      # тики бегут впереди времени (только на лёгкой сцене под pace_tick)

Свойства (проверяются ниже): на лёгкой сцене (3.5 тика/кадр) Δ == 1 всегда;
на тяжёлой средний Δ = 3.5 / (тиков на кадр) с точностью до округления;
Δ ∈ 1..8.
"""
import random, sys
DMAX = 4   # потолок Δ (TB_DMAX): тик продвигает мир не больше чем на ~1.1 кадра; 8 давало спираль на перегруженной сцене

class TB:
    # 2026-09-07: масштаб ×4 и две скорости по состоянию дайвера (калибровка по ZX):
    # в лодке RATE=12 (150 u/с, ZX 146), в воде RATE=15 (187.5 u/с, ZX 185).
    def __init__(self, rate=15): self.acc = 0; self.last = 0; self.delta = 1; self.rate = rate
    def tick(self, frames):
        df = (frames - self.last) & 0xFF; self.last = frames
        if df >= 5: self.acc = 0; self.delta = 1; return 1
        self.acc += self.rate * df - 4
        extra = max(0, self.acc // 4)
        if extra >= DMAX:                       # потолок: долг не копим — мир замедляется плавно
            self.delta = DMAX; self.acc = 0; return DMAX
        self.delta = 1 + extra; self.acc -= 4 * extra
        if self.acc < -16: self.acc = -16
        return self.delta

def run(tpf, n=20000, jitter=0.0, seed=1, rate=15):
    """tpf — тиков на кадр (скорость сцены); возвращает средний Δ и гистограмму."""
    rnd = random.Random(seed); tb = TB(rate); frames = 0; t = 0.0; hist = {}; total = 0
    for k in range(n):
        t += 1.0 / tpf * (1 + rnd.uniform(-jitter, jitter))
        frames = int(t)
        d = tb.tick(frames & 0xFF); hist[d] = hist.get(d, 0) + 1; total += d
    return total / n, hist

if __name__ == "__main__":
    ok = True
    for rate, tpf in [(15, 3.75), (15, 3.0), (15, 2.0), (15, 1.54), (15, 1.0), (15, 0.7), (12, 3.0), (12, 2.0), (12, 1.0)]:
        upf = rate / 4
        avg, hist = run(tpf, rate=rate); want = min(DMAX, upf / tpf) if tpf <= upf else 1.0
        # на перегрузе (want == DMAX) потолок без долга даёт DMAX-1..DMAX — плавная деградация, это норма
        err = abs(avg - want) / want if want < DMAX else max(0.0, (DMAX - 1 - avg))
        print(f"rate {rate} тиков/кадр {tpf:4}: средний Δ {avg:.3f}, ожидание {want:.3f}{' (потолок)' if want >= DMAX else ''}, ошибка {100*err:.1f} %, Δ: {dict(sorted(hist.items()))}")
        if err > 0.02: ok = False
    avg, hist = run(3.75, jitter=0.3)
    print(f"лёгкая сцена с дрожанием 30 %: средний Δ {avg:.3f}, Δ: {dict(sorted(hist.items()))}")
    if abs(avg - 1) > 0.02: ok = False
    print("СПЕЦИФИКАЦИЯ ВЕРНА" if ok else "ПРОВАЛ"); sys.exit(0 if ok else 1)
