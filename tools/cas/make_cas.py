#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Собрать кассетную версию Scuba Dive одной командой.

    python3 tools/cas/make_cas.py            # -> build/cas/scuba_kaseta.wav

На входе: build/prod/scuba_splash.rom (собрать заранее: tools/splash/build_splash.sh)
На выходе: build/cas/scuba_kaseta.wav

СТРУКТУРА ЛЕНТЫ

  1. Ступень 1, формат ШТАТНОГО ПЗУ (v06c-rom, фазовая модуляция 1575 бод),
     две страницы 0xDB00-0xDCFF. Это единственный кусок, который читает ПЗУ;
     он переносит турбо-загрузчик в 0x7600 и передаёт ему управление.
  2. Турбо-блок: заставка 0x8000-0xFFFF (128 страниц) — прямо в видеопамять.
  3. Турбо-блок: игра со стартером 0x0100-0x59FF (89 страниц) и флаг «пуск».
     Он идёт последним, потому что прыгаем на адрес ПОСЛЕДНЕГО блока.

ПОЧЕМУ НЕ ВЕСЬ ОБРАЗ ЦЕЛИКОМ. Между концом стартера (0x59F3) и видеопамятью
лежат 9740 нулевых байт — их везти незачем, ПЗУ и так чистит ОЗУ при сбросе. В
этой же щели, по 0x7600, живёт турбо-загрузчик: вези мы образ целиком, он бы сам
себя затёр. Экономия заодно: 55 552 байта вместо 65 280.

ПОЧЕМУ ТУРБО. Штатным форматом весь образ едет 8 минут 13 секунд (проверено
прогоном в vector06js). Турбо-формат ivagor'а — та же лента примерно за минуту.
"""

import hashlib
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import tape                                                    # noqa: E402

SJASM = os.path.join(ROOT, 'tools', 'bin', 'sjasm')
SRC = os.path.join(ROOT, 'src_cas')
BUILD = os.path.join(ROOT, 'build', 'cas')
ROM = os.path.join(ROOT, 'build', 'prod', 'scuba_splash.rom')

STAGE1_ORG = 0xDA00
GAME_DEST = 0x0100
GAME_END = 0x5A00          # конец игры со стартером, кратно странице
SCREEN = 0x8000
LEADER_GROUPS = 48
ROM_HALFPERIOD = 14        # 14 сэмплов при 44100 Гц = 1575 бод, как 7 при 22050
PILOT_FIRST = 15435        # 0.7 с — загрузчику хватит на переезд и настройку
PILOT_NEXT = 441           # 0.02 с — между блоками он только возвращается


def sjasm(src, out, lst):
    r = subprocess.run([SJASM, '-s', src, out, lst], cwd=os.path.dirname(src),
                       capture_output=True, text=True)
    if r.returncode != 0 or 'Errors: 0' not in r.stdout:
        sys.exit('sjasm упал на %s:\n%s%s' % (src, r.stdout, r.stderr))
    return open(out, 'rb').read()


def main():
    os.makedirs(BUILD, exist_ok=True)
    if not os.path.exists(ROM):
        sys.exit('нет %s — собери tools/splash/build_splash.sh' % ROM)
    img = open(ROM, 'rb').read()
    if len(img) != 65280:
        sys.exit('splash-ROM обязан быть 65280 Б, а он %d' % len(img))
    print('образ: %s (%d Б)' % (hashlib.md5(img).hexdigest(), len(img)))

    game = img[:GAME_END - GAME_DEST]                 # 0x0100..0x59FF
    planes = img[SCREEN - GAME_DEST:]                 # 0x8000..0xFFFF
    assert len(planes) == 32768, len(planes)
    # щель обязана быть пустой: там живёт загрузчик, и мы её не везём
    gap = img[GAME_END - GAME_DEST:SCREEN - GAME_DEST]
    if any(gap):
        sys.exit('между 0x%04X и 0x8000 есть данные (%d ненулевых) — загрузчику негде жить'
                 % (GAME_END, sum(1 for b in gap if b)))

    rt = sjasm(os.path.join(SRC, 'runtime.asm'), os.path.join(BUILD, 'runtime.bin'),
               os.path.join(BUILD, 'runtime.lst'))
    if len(rt) > 246:
        sys.exit('турбо-загрузчик %d Б, а в страницу ступени 1 влезает 246' % len(rt))
    open(os.path.join(BUILD, 'runtime_embed.bin'), 'wb').write(rt)
    st1 = sjasm(os.path.join(SRC, 'stage1.asm'), os.path.join(BUILD, 'stage1.bin'),
                os.path.join(BUILD, 'stage1.lst'))
    print('ступень 1: %d Б, турбо-загрузчик: %d Б (в 0x7600)' % (len(st1), len(rt)))

    part1 = tape.biphase(tape.v06c_rom(st1, STAGE1_ORG, 'SCUBA', leader_groups=LEADER_GROUPS),
                         ROM_HALFPERIOD)[:-tape.END_PADDING]
    pulses = tape.turbo_block(SCREEN, planes, pilot=PILOT_FIRST)
    pulses += tape.turbo_block(GAME_DEST, game, jump=True, pilot=PILOT_NEXT)
    part2 = tape.turbo_samples(pulses)
    # ХВОСТ ПОСЛЕ ПОСЛЕДНЕГО БЛОКА — ЦЕЛАЯ СЕКУНДА, А НЕ 128 СЭМПЛОВ.
    # Первый прогон: заставка легла вся (128/128), игра дошла до 84 страниц из 89,
    # и ровно на конце ленты управление вернулось к ПЗУ — оно почистило ОЗУ.
    # Последнему блоку нужен запас на контрольную сумму и на то, что проигрыватель
    # ленты в эмуляторе и наши кадры считают время чуть по-разному.
    samples = part1 + part2 + bytes([128]) * 44100
    wav = tape.wav8(samples, 44100)
    out = os.path.join(BUILD, 'scuba_kaseta.wav')
    open(out, 'wb').write(wav)
    print('%s: %d Б, %.1f с (ступень 1 %.1f с + турбо %.1f с)'
          % (out, len(wav), len(samples) / 44100, len(part1) / 44100, len(part2) / 44100))
    print('  везём %d страниц: заставка 128 в 0x8000, игра 89 в 0x0100 (щель 0x%04X-0x7FFF не везём)'
          % (len(planes) // 256 + len(game) // 256, GAME_END))


if __name__ == '__main__':
    main()
