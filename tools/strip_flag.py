#!/usr/bin/env python3
"""Вырезает из ассемблерных исходников блоки мёртвого флага сборки.

Флаг считается ВЫКЛЮЧЕННЫМ навсегда: IFDEF FLAG ... [ELSE ...] ENDIF -> остаётся
ветка ELSE (если есть); IFNDEF FLAG ... [ELSE ...] ENDIF -> остаётся первая ветка.
Вложенность любых других условий сохраняется как есть — они не разбираются.

    tools/strip_flag.py WHEEL CURTAIN -- src8080/*.asm

Проверка правильности одна и жёсткая: боевой образ до и после обязан совпасть
байт в байт (флаг в проде и так выключен). Скрипт этого не делает — делает
вызывающий.
"""
import sys, re

def strip(text, flags):
    out, stack = [], []          # stack: (мой ли это флаг, брать ли текущую ветку, глубина)
    for line in text.splitlines(keepends=True):
        s = line.strip()
        m = re.match(r'^IF(N?)DEF\s+([A-Za-z_][A-Za-z_0-9]*)', s, re.I)
        if m:
            neg, name = m.group(1).upper() == 'N', m.group(2)
            if name in flags:
                # наш флаг ВЫКЛЮЧЕН: у IFDEF первая ветка не берётся, у IFNDEF берётся
                stack.append(('mine', neg))
                continue
            stack.append(('other', True))
            if all(t != 'mine' or k for t, k in stack[:-1]):
                out.append(line)
            continue
        if re.match(r'^ELSE\b', s, re.I) and stack:
            kind, keep = stack[-1]
            if kind == 'mine':
                stack[-1] = (kind, not keep)
                continue
            if all(t != 'mine' or k for t, k in stack[:-1]):
                out.append(line)
            continue
        if re.match(r'^ENDIF\b', s, re.I) and stack:
            kind, keep = stack.pop()
            if kind == 'mine':
                continue
            if all(t != 'mine' or k for t, k in stack):
                out.append(line)
            continue
        if all(t != 'mine' or k for t, k in stack):
            out.append(line)
    if stack:
        raise SystemExit('незакрытый IFDEF — файл не тронут')
    return ''.join(out)

if __name__ == '__main__':
    a = sys.argv[1:]
    if '--' not in a: raise SystemExit(__doc__)
    i = a.index('--')
    flags, files = set(a[:i]), a[i+1:]
    for f in files:
        src = open(f).read()
        dst = strip(src, flags)
        if dst != src:
            open(f, 'w').write(dst)
            print(f'{f}: {len(src.splitlines()) - len(dst.splitlines())} строк убрано')
