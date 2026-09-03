#!/usr/bin/env python3
"""
wheel_spec.py — СПЕЦИФИКАЦИЯ КОЛЕСА ТАЙМЕРОВ и доказательство эквивалентности
линейному обходу со счётчиками (фаззинг). Только модель, железа не трогает.

ОРИГИНАЛ (LBE9A/LBE40/LBE6D): скан группы = по всем записям в порядке индекса:
t[i] -= 1; если t[i] == 0 — срабатывание (LB737): t[i] := P[i] (перезарядка
в LB737+17), возможны побочные правки P других записей (двигатели) и — вне
сканов — события, пишущие t[j] := n напрямую (LE8FA/LE97C).

КОЛЕСО: часы группы C = число выполненных сканов (байт). У записи — срок
due[i] (в самом +$0F) и next[i]; NB корзин, корзина k — список индексов с
due & (NB-1) == k, ОТСОРТИРОВАННЫЙ по индексу. Скан: C += 1; обойти корзину
C & (NB-1), сработать все с due == C в порядке списка (= по индексу);
перезарядка: due := C + P (C уже увеличен); событие между сканами: due := C + n.
Построение: из стартовых счётчиков, due := C + t.

    python3 tools/verify/wheel_spec.py            # фаззинг
"""
import random, sys

NB = 16

class Linear:
    """Оригинал. Срабатывание: LB737 СНАЧАЛА перезаряжает t[i] := P[i] (LB737+17),
    ПОТОМ двигатель может сменить P[i] (sla/srl относительно IX — только своей
    записи); новый период действует со следующей перезарядки."""
    def __init__(self, t, P): self.t = list(t); self.P = list(P); self.fired = []
    def scan(self, k, mover):
        for i in range(len(self.t)):
            self.t[i] = (self.t[i] - 1) & 0xFF
            if self.t[i] == 0:
                self.fired.append((k, i))
                self.t[i] = self.P[i]
                newp = mover(k, i)
                if newp is not None: self.P[i] = newp
    def event_set(self, j, n): self.t[j] = n

class Wheel:
    def __init__(self, t, P):
        self.P = list(P); self.n = len(t); self.C = 0
        self.due = [0]*self.n; self.next = [0xFF]*self.n; self.head = [0xFF]*NB; self.fired = []
        for i in range(self.n): self.due[i] = (self.C + t[i]) & 0xFF; self._insert(i)
    def _insert(self, i):                      # в корзину due&(NB-1), по возрастанию индекса
        b = self.due[i] & (NB-1); prev = None; cur = self.head[b]
        while cur != 0xFF and cur < i: prev, cur = cur, self.next[cur]
        self.next[i] = cur
        if prev is None: self.head[b] = i
        else: self.next[prev] = i
    def _remove(self, i):
        b = self.due[i] & (NB-1); prev = None; cur = self.head[b]
        while cur != i: prev, cur = cur, self.next[cur]
        if prev is None: self.head[b] = self.next[i]
        else: self.next[prev] = self.next[i]
    def scan(self, k, mover):
        self.C = (self.C + 1) & 0xFF
        b = self.C & (NB-1)
        fire = []; prev = None; cur = self.head[b]   # снять сработавшие одним проходом; список по индексу
        while cur != 0xFF:
            nxt = self.next[cur]
            if self.due[cur] == self.C:
                fire.append(cur)
                if prev is None: self.head[b] = nxt
                else: self.next[prev] = nxt
            else: prev = cur
            cur = nxt
        for i in fire:
            self.fired.append((k, i))
            self.due[i] = (self.C + self.P[i]) & 0xFF; self._insert(i)   # перезарядка по СТАРОМУ периоду
            newp = mover(k, i)
            if newp is not None: self.P[i] = newp
    def event_set(self, j, n):
        self._remove(j); self.due[j] = (self.C + n) & 0xFF; self._insert(j)

def fuzz(rounds=3000, seed=7):
    rnd = random.Random(seed); bad = 0; fires = 0
    for r in range(rounds):
        n = rnd.randint(1, 60)
        lo, hi = rnd.choice([(15, 30), (31, 125), (1, 200), (1, 255)])
        P = [rnd.randint(lo, hi) for _ in range(n)]
        t0 = [rnd.randint(1, 255) for _ in range(n)]
        L = Linear(t0, P); W = Wheel(t0, P)
        # двигатель детерминирован по (скан, индекс): обе модели получают одно и то же
        def mover(k, i):
            h = (k * 7919 + i * 104729 + r) % 1000
            if h < 50: return max(1, ((h * 37) % (hi - lo + 1)) + lo)
            return None
        k = 0
        for step in range(rnd.randint(50, 600)):
            if rnd.random() < 0.7:
                k += 1; L.scan(k, mover); W.scan(k, mover)
            elif rnd.random() < 0.1:                     # событие вне скана: t[j] := m
                j = rnd.randrange(n); m = rnd.randint(1, 255); L.event_set(j, m); W.event_set(j, m)
            if L.fired != W.fired or L.t != [ (W.due[i] - W.C) & 0xFF for i in range(n) ]:
                bad += 1
                if bad <= 3: print(f"раунд {r}: расхождение на шаге {step}: L {L.fired[-3:]} W {W.fired[-3:]}")
                break
        fires += len(L.fired)
    print(f"фаззинг: {rounds} раундов, {fires} срабатываний, расхождений {bad}")
    return bad

if __name__ == "__main__":
    sys.exit(1 if fuzz() else 0)
