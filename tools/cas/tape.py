#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Кассетные форматы ПК «Вектор-06Ц»: кодирование байтов в звук.

Эталон — svofski/bin2wav (tape.js). Здесь порт на Python двух форматов:

  v06c-rom  — то, что читает ШТАТНОЕ ПЗУ boots.bin (F1 при сбросе).
              Фазовая (biphase) модуляция, полупериод 7 сэмплов @22050 Гц.
  loadfm    — «турбо» ivagor'а: частотная (FM) модуляция @44100 Гц,
              короткий полупериод = 0, длинный = 1. Втрое-вчетверо быстрее.

Соответствие эталону проверяется гейтом tools/cas/check_tape_parity.py:
он гоняет node bin2wav и сравнивает WAV байт в байт.
"""

import os
import struct

# --- физический слой -------------------------------------------------------

BIPHASE_LO = 32
BIPHASE_HI = 255 - 32
END_PADDING = 128


def biphase(data, halfperiod):
    """Фазовая модуляция: бит = два полупериода, первый несёт !бит.

    Точная копия TapeFormat.prototype.biphase из tape.js: для бита 1 первый
    полупериод низкий (32), второй высокий (223); для бита 0 — наоборот.
    Старший бит байта идёт первым.
    """
    out = bytearray()
    for octet in data:
        for _ in range(8):
            phase = BIPHASE_LO if (octet & 0x80) else BIPHASE_HI
            out += bytes([phase]) * halfperiod
            out += bytes([phase ^ 0xFF]) * halfperiod
            octet = (octet << 1) & 0xFF
    out += bytes([128]) * END_PADDING
    return bytes(out)


def wav8(samples, sample_rate):
    """WAV: 8 бит без знака, моно — как пишет makewav.js."""
    n = len(samples)
    return (b'RIFF' + struct.pack('<I', 36 + n) + b'WAVEfmt ' +
            struct.pack('<IHHIIHH', 16, 1, 1, sample_rate,
                        sample_rate, 1, 8) +
            b'data' + struct.pack('<I', n) + bytes(samples))


# --- формат v06c-rom (штатное ПЗУ) ----------------------------------------
#
# Ракорд 200 байт: чередование 25x00 / 25x55 (загрузчик ищет три подряд 0x55
# либо 0xAA — при любой раскадровке поток ...0101... даёт одно из двух).
# Далее по блоку на каждые 256 байт полезной нагрузки:
#   16x00, 4x55, 0xE6                      — преамбула блока имени
#   4x00, имя(25), 2x00, hi(адрес), N, N-i, cs0   — 35 байт после 0xE6
#   и восемь подблоков данных по 32 байта:
#   4x00, 0xE6, id(0x80+j), cs0, данные(32), cs   — 35 байт после 0xE6
#
# Загружается СТРАНИЦАМИ: адрес задаётся только старшим байтом, поэтому
# org обязан быть кратен 256. Номер блока считается ВНИЗ (N, N-1, ... 1) —
# загрузчик стартует только с блока, у которого номер равен N.

ROM_HALFPERIOD = 7
ROM_SAMPLE_RATE = 22050


def v06c_rom(mem, org, name, leader_groups=8, tail_zeros=64):
    """Собрать байтовый поток формата v06c-rom.

    leader_groups — число групп по 25 байт в стартовом ракорде (эталон 8,
    т.е. 200 байт ≈ 1.0 с). Увеличение удлиняет «пилот» и даёт загрузчику
    больше времени зацепиться, если лента пошла раньше, чем ПЗУ проснулось.
    """
    assert org % 256 == 0, 'v06c-rom грузит страницами: org должен быть кратен 256'
    nblocks = (len(mem) + 255) // 256
    assert 1 <= nblocks <= 255, 'v06c-rom: 1..255 блоков по 256 Б'

    data = bytearray()
    for i in range(leader_groups * 25):
        data.append(0x00 if (i // 25) % 2 == 0 else 0x55)

    sofs = 0
    for block in range(nblocks):
        cs0 = 0
        data += b'\x00' * 16
        data += b'\x55' * 4
        data.append(0xE6)
        data += b'\x00' * 4
        for i in range(25):
            b = ord(name[i]) if i < len(name) else 0x20
            cs0 += b
            data.append(b)
        data += b'\x00' * 2
        for b in ((org >> 8) & 0xFF, nblocks, nblocks - block):
            cs0 += b
            data.append(b)
        data.append(cs0 & 0xFF)

        for sblk in range(0x80, 0x88):
            cs = 0
            data += b'\x00' * 4
            data.append(0xE6)
            for b in (sblk, cs0 & 0xFF):
                cs += b
                data.append(b)
            for _ in range(32):
                b = mem[sofs] if sofs < len(mem) else 0
                sofs += 1
                cs += b
                data.append(b)
            data.append(cs & 0xFF)

    # bin2wav переразмеряет буфер и оставляет в хвосте нули — держим их, чтобы
    # побайтово совпадать с эталоном (и заодно это полезный «выбег» ленты).
    data += b'\x00' * tail_zeros
    return bytes(data)


def v06c_rom_wav(mem, org, name, leader_groups=8, tail_zeros=64,
                 halfperiod=ROM_HALFPERIOD, sample_rate=ROM_SAMPLE_RATE):
    return wav8(biphase(v06c_rom(mem, org, name, leader_groups, tail_zeros),
                        halfperiod), sample_rate)


def v06c_rom_seconds(nbytes, leader_groups=8, halfperiod=ROM_HALFPERIOD,
                     sample_rate=ROM_SAMPLE_RATE):
    """Время звучания блока формата v06c-rom, с."""
    nblocks = (nbytes + 255) // 256
    tape_bytes = leader_groups * 25 + nblocks * 376 + 64
    return tape_bytes * 8 * 2 * halfperiod / sample_rate


# --- турбо-формат «kvturbo» (наш) -----------------------------------------
#
# Физический слой — как у loadfm ivagor'а (проверен на живом железе):
# частотная манипуляция, уровень ПЕРЕКЛЮЧАЕТСЯ на каждом импульсе, а длина
# импульса кодирует бит. Постоянной составляющей нет, самосинхронизация есть.
#
#   короткий импульс = 2 сэмпла = бит 0
#   длинный  импульс = 5 сэмплов = бит 1
#   перед каждым байтом — СИНХРОИМПУЛЬС 5 сэмплов, его длительность
#   загрузчик ОТБРАСЫВАЕТ. Это окно (≈340 тактов ЦП), в котором загрузчик
#   успевает сохранить предыдущий байт, обновить контрольную сумму и кайму,
#   не рискуя промахнуться мимо фронта. У loadfm синхроимпульс 2 сэмпла —
#   мы взяли 5, потому что проверить на живом железе не можем, а запас
#   стоит 9% скорости.
#
# Байт = 5 + сумма(8 бит по 2/5) сэмплов; в среднем 33 сэмпла на байт,
# при 44100 Гц это 1336 Б/с — вдесятеро быстрее штатных 134 Б/с.
#
# Кадр блока:
#   пилот: PILOT коротких импульсов (лента раскручивается, АРУ садится)
#   МЕТКА: один импульс MARK сэмплов — вдвое длиннее любого бита, в данных
#          такого не бывает. Она и задаёт РАСКАДРОВКУ: пока метка не поймана,
#          загрузчик не знает, где кончается байт. Без неё загрузчик может
#          встать на сдвиг в один импульс и читать мусор.
#   0xE6                       — синхробайт (проверка, что метка не ложная)
#   adr_lo, adr_hi             — куда грузить
#   pages                      — длина в страницах по 256 Б (1..255)
#   flags                      — бит 0: после загрузки прыгнуть на adr
#   данные pages*256 байт
#   cks_lo, cks_hi             — Флетчер-16 по ДАННЫМ: s1+=b; s2+=s1

TURBO_SAMPLE_RATE = 44100
TURBO_SHORT = 2
TURBO_LONG = 5
TURBO_SYNC = 5
TURBO_PILOT = 2048		# коротких импульсов
TURBO_MARK = 20			# сэмплов в метке раскадровки
TURBO_SYNCBYTE = 0xE6


def turbo_pulses(data, short=TURBO_SHORT, long_=TURBO_LONG, sync=TURBO_SYNC):
    """Байты -> список длин импульсов в сэмплах (старший бит первым)."""
    out = []
    for octet in data:
        out.append(sync)
        for b in range(7, -1, -1):
            out.append(long_ if (octet >> b) & 1 else short)
    return out


def turbo_samples(pulses, level0=0):
    out = bytearray()
    level = level0
    for n in pulses:
        out += bytes([BIPHASE_HI if level else BIPHASE_LO]) * n
        level ^= 1
    return out


def turbo_block(dest, payload, jump=False, pilot=TURBO_PILOT):
    """Собрать блок как СПИСОК ДЛИН ИМПУЛЬСОВ. payload дополняется нулями
    до целого числа страниц."""
    assert dest % 256 == 0, 'турбо-блок грузится страницами'
    pages = (len(payload) + 255) // 256
    assert 1 <= pages <= 255, 'турбо-блок: 1..255 страниц'
    body = bytes(payload) + b'\x00' * (pages * 256 - len(payload))
    s1 = s2 = 0
    for b in body:
        s1 = (s1 + b) & 0xFF
        s2 = (s2 + s1) & 0xFF
    head = bytes([TURBO_SYNCBYTE, dest & 0xFF, (dest >> 8) & 0xFF,
                  pages, 1 if jump else 0])
    # Хвост: последний бит блока ОБЯЗАН завершиться фронтом, иначе загрузчик
    # досчитает его до тишины и примет короткий импульс за длинный (ловили:
    # вторая половина контрольной суммы приезжала на 1 больше).
    return ([TURBO_SHORT] * pilot + [TURBO_MARK] +
            turbo_pulses(head + body + bytes([s1, s2])) + [TURBO_SHORT] * 4)


def turbo_seconds(nbytes, pilot=TURBO_PILOT):
    """Время звучания турбо-блока, с (при среднем бите 3.5 сэмпла)."""
    pages = (nbytes + 255) // 256
    tape_bytes = 5 + pages * 256 + 2
    n = (pilot * TURBO_SHORT + TURBO_MARK +
         tape_bytes * (TURBO_SYNC + 8 * (TURBO_SHORT + TURBO_LONG) / 2))
    return n / TURBO_SAMPLE_RATE


# --- компактный контейнер V06T для MiSTer-плеера ---------------------------
#
# Заголовок 16 байт, дальше RLE длительностей импульсов (порог sample>127,
# тот же, что в check_cas.py и в rtl/tape_player.sv). Плеер автоопределяет
# формат по магии "V06T" vs "RIFF". Расширение файла — .v6t (три символа,
# лимит OSD MiSTer).
#
#   0   4  "V06T"
#   4   1  version = 1
#   5   1  flags: bit0 = начальный уровень (0=низ, 1=верх)
#   6   2  sample rate uint16 LE
#   8   4  число импульсов uint32 LE
#  12   4  reserved = 0
#  16   …  RLE: байт b!=0 → длительность b; b==0 → uint32 LE

V06T_MAGIC = b'V06T'
V06T_VERSION = 1


def tape_bits(samples):
    return bytes(1 if s > 127 else 0 for s in samples)


def _runs(samples):
    if not samples:
        return 0, []
    initial = 1 if samples[0] > 127 else 0
    level = initial
    runs, n = [], 0
    for s in samples:
        b = 1 if s > 127 else 0
        if b == level:
            n += 1
        else:
            runs.append(n)
            level = b
            n = 1
    if n:
        runs.append(n)
    return initial, runs


def v06t(samples, sample_rate=TURBO_SAMPLE_RATE):
    """Сэмплы 8 бит без знака → контейнер V06T."""
    initial, runs = _runs(samples)
    rle = bytearray()
    for n in runs:
        if 1 <= n <= 255:
            rle.append(n)
        else:
            rle.append(0)
            rle += struct.pack('<I', n)
    return (V06T_MAGIC + bytes([V06T_VERSION, initial]) +
            struct.pack('<H', sample_rate) +
            struct.pack('<I', len(runs)) +
            struct.pack('<I', 0) + bytes(rle))


def v06t_samples(blob):
    """V06T → (rate, сэмплы 0/255). Для сверки битового потока с WAV."""
    assert blob[:4] == V06T_MAGIC, 'не V06T'
    assert blob[4] == V06T_VERSION
    rate = struct.unpack_from('<H', blob, 6)[0]
    npulses = struct.unpack_from('<I', blob, 8)[0]
    i, runs, level = 16, [], blob[5] & 1
    while i < len(blob) and len(runs) < npulses:
        b = blob[i]
        i += 1
        if b:
            runs.append(b)
        else:
            runs.append(struct.unpack_from('<I', blob, i)[0])
            i += 4
    out = bytearray()
    for n in runs:
        out += bytes([255 if level else 0]) * n
        level ^= 1
    return rate, bytes(out)


def write_v06t(wav_path, samples, sample_rate=TURBO_SAMPLE_RATE):
    """Рядом с .wav написать .v6t и сверить битовый поток. Возвращает путь."""
    blob = v06t(samples, sample_rate)
    out = os.path.splitext(wav_path)[0] + '.v6t'
    open(out, 'wb').write(blob)
    _, rec = v06t_samples(blob)
    if tape_bits(rec) != tape_bits(samples):
        raise SystemExit('V06T битовый поток разошёлся с WAV: ' + out)
    return out

