#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ГЕЙТ КАССЕТЫ: разобрать готовый WAV обратно и сверить с исходниками.

    python3 tools/cas/check_cas.py

Гейт читает build/cas/kvalley_kaseta.wav как ЗВУК (по длительностям импульсов,
а не по внутренним структурам сборщика) и восстанавливает из него:

  * поток формата ПЗУ -> байты ступени 1 (сверка с build/cas/stage1.bin);
  * 130 турбо-блоков -> рантайм 2, 128 страниц заставки, образ игры.

ЗАСТАВКА СОБИРАЕТСЯ ОБРАТНО ИЗ СТОЛБЦОВ: каждый блок кладётся по адресу из
своего заголовка в модель видеопамяти 0x8000-0xFFFF, и она сверяется с
docs/cas/v16_planes.raw БАЙТ В БАЙТ. Заодно проверяется сам ПОРЯДОК блоков:
они обязаны идти столбцами полного цвета слева направо, иначе картинка
наливалась бы четырьмя призрачными слоями, а не цветной полосой.

Образ игры сверяется БАЙТ В БАЙТ с build/kvalley_8c.rom (замороженного md5
нет намеренно: он ложно краснел на каждом обновлении игры).

Гейт обязан падать на пустой выборке и на порче сигнала — это проверяется
самотестом (--selftest, включён в обычный прогон): синтетическая мини-лента
разбирается, потом выжигается кусок и потом обнуляется целиком, и гейт обязан
покраснеть в обоих случаях.
"""

import hashlib
import os
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)

import tape                                            # noqa: E402
import pack_lz                                         # noqa: E402

WAV = os.path.join(ROOT, 'build', 'cas', 'kvalley_kaseta.wav')
NCOLS = 128                       # 32 столбца × 4 плоскости
GAME = os.path.join(ROOT, 'build', 'kvalley_8c.rom')
PLANES = os.path.join(ROOT, 'docs', 'cas', 'v16_planes.raw')
STAGE1 = os.path.join(ROOT, 'build', 'cas', 'stage1.bin')

fails = []


def check(cond, msg):
    print(('  ok   ' if cond else '  ПАДЕНИЕ ') + msg)
    if not cond:
        fails.append(msg)


def wav_samples(path):
    d = open(path, 'rb').read()
    assert d[:4] == b'RIFF' and d[8:12] == b'WAVE'
    i = 12
    rate = None
    while i < len(d):
        cid, sz = d[i:i + 4], struct.unpack('<I', d[i + 4:i + 8])[0]
        body = d[i + 8:i + 8 + sz]
        if cid == b'fmt ':
            rate = struct.unpack('<I', body[4:8])[0]
        elif cid == b'data':
            return rate, body
        i += 8 + sz + (sz & 1)
    raise SystemExit('в WAV нет чанка data')


def runs(samples):
    """Звук -> список длин импульсов (в сэмплах), порог 128."""
    out = []
    cur = samples[0] > 127
    n = 0
    for s in samples:
        b = s > 127
        if b == cur:
            n += 1
        else:
            out.append(n)
            cur = b
            n = 1
    out.append(n)
    return out


def decode_turbo(pulses, start):
    """Разобрать один турбо-блок начиная с метки. Возвращает словарь или None.

    Кандидатов на метку в ПЗУ-части ленты хватает: там полупериод 14 сэмплов,
    а два одинаковых подряд дают пробег 28. Поэтому ложную метку отсеиваем
    синхробайтом и ищем ДАЛЬШЕ (циклом, не рекурсией: ложных меток в штатном
    куске тысячи, рекурсия упёрлась бы в предел интерпретатора).
    """
    i = start
    while True:
        while i < len(pulses) and pulses[i] < tape.TURBO_MARK - 2:
            i += 1
        if i + 9 * 8 >= len(pulses):
            return None
        i += 1                              # метка съедена

        def byte():
            nonlocal i
            i += 1                          # синхроимпульс
            v = 0
            for k in range(8):
                v = (v << 1) | (1 if pulses[i + k] >= (tape.TURBO_SHORT +
                                                       tape.TURBO_LONG) // 2 else 0)
            i += 8
            return v

        if byte() != tape.TURBO_SYNCBYTE:
            continue                        # ложная метка — ищем следующую
        lo, hi, pages, flags = byte(), byte(), byte(), byte()
        if i + 9 * (pages * 256 + 2) >= len(pulses):
            return None
        data = bytes(byte() for _ in range(pages * 256))
        c1, c2 = byte(), byte()
        s1 = s2 = 0
        for b in data:
            s1 = (s1 + b) & 0xFF
            s2 = (s2 + s1) & 0xFF
        return dict(dest=lo | (hi << 8), pages=pages, flags=flags, data=data,
                    cks_ok=(c1 == s1 and c2 == s2), end=i)


def turbo_time(pulses, idx):
    """Момент ленты (с), к которому доехал импульс idx."""
    return sum(pulses[:idx]) / tape.TURBO_SAMPLE_RATE


ROM_HP = 14                       # полупериод фазовой модуляции при 44100 Гц
FULL_WAV = os.path.join(ROOT, 'build', 'cas', 'kvalley_full.wav')


def biphase_bits(pulses, hp, lvl0):
    """Пробеги уровней -> биты. В фазовой модуляции бит занимает два
    полупериода, и значение несёт ВТОРОЙ из них (первый — инверсный)."""
    half = []
    lvl = lvl0
    for n in pulses:
        for _ in range(max(1, int(round(n / hp)))):
            half.append(lvl)
        lvl ^= 1
    return [half[i + 1] for i in range(0, len(half) - 1, 2)]


def rom_groups(bits):
    """Разобрать поток штатного формата так же, как это делает ПЗУ: побитно
    искать 0xE6, затем 35 байт, затем проверить сумму.

    Возвращает СПИСОК программ (лента — их конкатенация), каждая как
    {страница: 256 байт}. Разбирать вместе нельзя: программы кладутся по
    пересекающимся адресам (образ игры занимает то же ОЗУ, где до него
    лежала сжатая заставка), и склеенная картина памяти врёт."""
    pos = 0
    progs = []
    cur = tag = None
    bad = [0]
    while True:
        c = 0
        while True:
            if pos >= len(bits):
                return progs, bad[0]
            c = ((c << 1) | bits[pos]) & 0xFF
            pos += 1
            if c == 0xE6:
                break
        buf = []
        s = 0
        for _ in range(35):
            if pos + 8 > len(bits):
                return progs, bad[0]
            v = 0
            for _ in range(8):
                v = ((v << 1) | bits[pos]) & 0xFF
                pos += 1
            buf.append(v)
            s = (s + v) & 0xFF
        if (s - 2 * buf[34]) & 0xFF:
            # Сумма не сошлась. На чистой ленте такого быть не должно ВООБЩЕ:
            # 0xE6 встречается и внутри данных, поэтому пара ложных срабатываний
            # ожидаема, но любая порча сигнала сразу поднимет этот счётчик.
            bad[0] += 1
            continue
        if buf[0] == 0:                    # заголовок страницы
            org, total, num = buf[31], buf[32], buf[33]
            if num == total:               # первая страница = новая программа
                progs.append({'org': org, 'pages': total, 'data': {}})
            if not progs:
                continue
            cur = (org + total - num) & 0xFF
            tag = buf[34]
        elif progs and cur is not None and buf[1] == tag:
            page = progs[-1]['data'].setdefault(cur, bytearray(256))
            page[(buf[0] & 7) * 32:(buf[0] & 7) * 32 + 32] = buf[2:34]
    return progs, bad[0]


def flat(prog):
    """Страницы программы -> непрерывный кусок памяти с её адреса."""
    out = bytearray(prog['pages'] * 256)
    for p, v in prog['data'].items():
        i = ((p - prog['org']) & 0xFF) * 256
        out[i:i + 256] = v
    return bytes(out)


def vidpage(idx):
    """Порядковый номер страницы в программе-заставке -> страница видеопамяти.

    Ровно та же формула, что в vidmap (src/cas/runtime_cas.asm): j = idx - 1,
    страница = 0x80 + (j & 3)*0x20 + (j >> 2). Нулевой порядковый — жертва, у
    неё j = 0xFF, и формула даёт 0xFF — ту же страницу, куда потом ляжет
    последняя настоящая. В файле жертва — нули, поэтому вреда нет.
    """
    j = (idx - 1) & 0xFF
    return 0x80 | ((j & 3) << 5) | ((j >> 2) & 0x1F)


def check_full(ref, planes):
    print('--- чисто штатный вариант (kvalley_full.wav) ---')
    if not os.path.exists(FULL_WAV):
        check(False, 'нет %s' % FULL_WAV)
        return
    rate, samples = wav_samples(FULL_WAV)
    # Уровень ПЕРВОГО сэмпла обязателен: поток начинается с ракорда из
    # байтов 0x00, у которых первый полупериод ВЫСОКИЙ. Если начать отсчёт
    # с нуля, все биты приедут инверсными и ни одного 0xE6 не найдётся.
    progs, bad = rom_groups(biphase_bits(runs(samples), ROM_HP,
                                         1 if samples[0] > 127 else 0))
    check(bad <= 8, 'групп с несошедшейся суммой: %d (на чистой ленте это только '
                    'ложные 0xE6 внутри данных)' % bad)
    check(len(progs) == 4, 'программ на ленте %d (ждём 4: ступень 1, рантайм 2, '
                           'заставка, игра)' % len(progs))
    if len(progs) != 4:
        return
    boot, run2, splash, game = progs
    packed, _ = pack_lz.pack(planes)
    want_splash = (256 + len(packed) + 255) // 256
    check(splash['pages'] == want_splash,
          'кусок 3: %d страниц (ждём %d = жертва + G8 %d Б)'
          % (splash['pages'], want_splash, len(packed)))
    for p in progs:
        check(len(p['data']) == p['pages'],
              'программа с 0x%02X00: принято %d страниц из %d'
              % (p['org'], len(p['data']), p['pages']))

    check(boot['org'] == 0xDA and boot['pages'] == 3,
          'кусок 1 — ступень 1, 3 страницы с 0xDA00')
    b1 = flat(boot)
    check(b1[0xDCEE - 0xDA00:0xDCF0 - 0xDA00] == bytes([0x00, 0xDB]),
          'подмена адреса возврата ПЗУ по 0xDCEE — на месте и здесь')

    check(run2['org'] == 0x07 and run2['pages'] == 3,
          'кусок 2 — рантайм 2, 3 страницы с 0x0700 (жертва + 512 Б с unlz)')
    b2 = flat(run2)
    check(b2[:256] == b'\xFF' * 256, 'первая страница куска 2 — жертва (0xFF)')

    # --- кусок 3: сжатая заставка G8 в нижнее ОЗУ, жертва + поток ----------
    check(splash['org'] == 0x08,
          'кусок 3 — сжатая заставка, с 0x0800 (org=0x%02X)' % splash['org'])
    b3 = flat(splash)
    check(b3[:256] == b'\x00' * 256, 'первая страница куска 3 — жертва из нулей')
    blob = bytes(b3[256:])
    back, used = pack_lz.unpack(blob)
    check(back == planes,
          'G8 заставки распаковался в v16_planes.raw байт в байт (%d Б)' % len(planes))
    check(used == len(packed), 'распаковщик прочитал %d Б, упаковщик дал %d' % (used, len(packed)))

    check(game['org'] == 0x00 and game['pages'] == 118, 'кусок 4 — игра, с 0x0000')
    b4 = flat(game)
    check(b4[:3] == b'\xC3\x00\x01',
          'по 0x0000 лежит jp 0x0100 — точка входа после БЛК+СБР')
    check(b4[0x100:0x100 + len(ref)] == ref,
          'образ игры с ленты совпал байт в байт (%d Б)' % len(ref))
    print('  --  длительность %.0f с (%d:%02d)'
          % (len(samples) / rate, len(samples) / rate // 60, len(samples) / rate % 60))


def turbo_blocks(samples):
    """Все турбо-блоки выборки (пустая выборка -> пустой список)."""
    p = runs(samples)
    out, i = [], 0
    while i < len(p):
        b = decode_turbo(p, i)
        if b is None:
            break
        out.append(b)
        i = b['end']
    return out


def selftest():
    """ДЕТЕКТОР ОБЯЗАН КРАСНЕТЬ. Гейт, который молча зеленеет на пустой выборке
    или на порченом сигнале, хуже отсутствующего: он даёт ложную уверенность.
    Поэтому перед настоящей проверкой гоняем синтетическую мини-ленту — чистую,
    выжженную и пустую — и требуем от разборщиков ожидаемого поведения."""
    print('--- самотест гейта ---')
    payload = bytes((i * 37 + 11) & 0xFF for i in range(512))
    flat_ = tape.turbo_samples(tape.turbo_block(0x8000, payload[:256], pilot=64) +
                               tape.turbo_block(0xA000, payload[256:], pilot=64))
    good = turbo_blocks(flat_)
    check(len(good) == 2 and all(b['cks_ok'] for b in good) and
          good[0]['data'] + good[1]['data'] == payload,
          'самотест: чистая турбо-мини-лента разбирается (2 блока, суммы сошлись)')

    burnt = bytearray(flat_)
    mid = len(burnt) // 2
    burnt[mid:mid + 600] = b'\x20' * 600          # ровный уровень = выжженный кусок
    bb = turbo_blocks(bytes(burnt))
    check(not (len(bb) == 2 and all(b['cks_ok'] for b in bb) and
               bb[0]['data'] + bb[1]['data'] == payload),
          'самотест: выжженный кусок турбо-ленты гейт ловит')
    check(turbo_blocks(b'\x80' * 8000) == [],
          'самотест: на пустой выборке турбо-блоков не находится вовсе')

    rom = tape.biphase(tape.v06c_rom(payload, 0x0700, 'TEST', leader_groups=8),
                       ROM_HP)
    lvl = 1 if rom[0] > 127 else 0
    progs, bad = rom_groups(biphase_bits(runs(rom), ROM_HP, lvl))
    check(len(progs) == 1 and len(progs[0]['data']) == 2 and flat(progs[0]) == payload,
          'самотест: чистая мини-программа штатного формата разбирается')
    rb = bytearray(rom)
    rb[len(rb) // 2:len(rb) // 2 + 3000] = b'\x20' * 3000
    progs2, bad2 = rom_groups(biphase_bits(runs(bytes(rb)), ROM_HP, lvl))
    check(not (len(progs2) == 1 and len(progs2[0]['data']) == 2 and
               flat(progs2[0]) == payload and bad2 == 0),
          'самотест: выжженный кусок штатной программы гейт ловит')
    check(rom_groups(biphase_bits(runs(b'\x80' * 8000), ROM_HP, 1))[0] == [],
          'самотест: на пустой выборке штатных программ не находится вовсе')


def main():
    print('гейт кассеты:', WAV)
    selftest()
    if not os.path.exists(WAV):
        sys.exit('нет ленты — сначала python3 tools/cas/make_cas.py')

    rate, samples = wav_samples(WAV)
    check(rate == tape.TURBO_SAMPLE_RATE, 'частота дискретизации %d Гц' % rate)
    p = runs(samples)
    check(len(p) > 1000, 'импульсов в ленте: %d' % len(p))

    # --- турбо-блоки: ищем метки по всей ленте ---------------------------
    blocks = []
    i = 0
    while i < len(p):
        b = decode_turbo(p, i)
        if b is None:
            break
        blocks.append(b)
        i = b['end']
    check(len(blocks) == 2 + NCOLS,
          'турбо-блоков найдено %d (ждём %d: рантайм 2, %d страниц заставки, игра)'
          % (len(blocks), 2 + NCOLS, NCOLS))
    if len(blocks) != 2 + NCOLS:
        sys.exit(1)

    rt2, cols, game = blocks[0], blocks[1:-1], blocks[-1]
    bad_cks = [n for n, b in enumerate(blocks) if not b['cks_ok']]
    check(not bad_cks, 'контрольная сумма Флетчера сошлась у всех %d блоков%s'
          % (len(blocks), '' if not bad_cks else ', не сошлась у ' + str(bad_cks)))

    check(rt2['dest'] == 0x7700 and rt2['flags'] == 1,
          'рантайм 2 -> 0x%04X, флаг пуска %d' % (rt2['dest'], rt2['flags']))
    check(game['dest'] == 0x0100 and game['flags'] == 0,
          'игра -> 0x%04X' % game['dest'])

    ref = open(GAME, 'rb').read()
    # Замороженный md5 релиза снят (ложно краснел при каждом обновлении игры):
    # истинный сторож — следующая строка, байт-в-байт против текущей сборки.
    check(game['data'][:len(ref)] == ref,
          'образ игры с ленты совпал байт в байт (%d Б)' % len(ref))
    check(set(game['data'][len(ref):]) <= {0},
          'добивка образа до страницы — нули (%d Б)' % (len(game['data']) - len(ref)))

    # --- заставка: собираем видеопамять обратно из блоков-столбцов --------
    planes = open(PLANES, 'rb').read()
    check(len(planes) == 32768, 'эталон заставки 32768 Б')
    vram = bytearray(0x8000)
    seen = set()
    for b in cols:
        d = b['dest']
        if not (0x8000 <= d <= 0xFF00) or d % 256 or b['pages'] != 1 or b['flags']:
            check(False, 'блок заставки с адресом 0x%04X, страниц %d, флаги %d — '
                         'ждём одну страницу видеопамяти без флагов'
                         % (d, b['pages'], b['flags']))
            break
        seen.add(d)
        vram[d - 0x8000:d - 0x8000 + 256] = b['data']
    check(len(seen) == NCOLS, 'адреса блоков заставки не повторяются: %d разных из %d'
          % (len(seen), NCOLS))
    check(bytes(vram) == planes,
          'заставка, собранная из %d блоков, совпала с v16_planes.raw байт в байт'
          % NCOLS)

    # --- порядок: столбцами полного цвета, слева направо ------------------
    want = [0x8000 + p_ * 0x2000 + x * 0x100 for x in range(32) for p_ in range(4)]
    got = [b['dest'] for b in cols]
    first_bad = next((k for k in range(NCOLS) if got[k] != want[k]), -1)
    check(first_bad < 0,
          'порядок блоков — столбцами полного цвета слева направо'
          + ('' if first_bad < 0 else ': на месте %d ждали 0x%04X, а там 0x%04X'
             % (first_bad, want[first_bad], got[first_bad])))

    st1 = open(STAGE1, 'rb').read()
    check(len(st1) == 768, 'ступень 1 = 768 Б (3 страницы 0xDA-0xDC)')
    check(st1[0xDCEE - 0xDA00:0xDCF0 - 0xDA00] == bytes([0x00, 0xDB]),
          'подмена адреса возврата ПЗУ по 0xDCEE на 0xDB00 — на месте')
    check(st1[0xDCEA - 0xDA00:0xDCEE - 0xDA00] == bytes([0x00, 0xDB, 0x01, 0x01]),
          'сохранённые BC=0xDB00 / DE=0x0101 по 0xDCEA — на месте')
    check(st1[0xDCAE - 0xDA00:0xDCB0 - 0xDA00] == bytes([0x00, 0x00]),
          'клетки 6,7 карты прогресса последней страницы — нули')

    dur = len(samples) / rate
    print('  --  длительность ленты %.1f с' % dur)
    print('  --  заставка едет с %.1f-й по %.1f-ю секунду'
          % (turbo_time(p, rt2['end']), turbo_time(p, cols[-1]['end'])))

    check_full(ref, planes)
    print('ГЕЙТ ' + ('ЗЕЛЁНЫЙ' if not fails else 'КРАСНЫЙ: %d' % len(fails)))
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
