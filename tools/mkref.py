#!/usr/bin/env python3
"""
mkref.py — эталонная Z80-сборка ДЛЯ LOCKSTEP: то же, что src/, но с одной
заменой — LD A,R -> call z80_ldar.

Зачем. Игра берёт случайность из регистра регенерации Z80 (11 мест, везде
вплотную JR Z: срабатывание 1/128, потому что R семибитный). На i8080 регистра R
нет вообще, а любая замена даёт ДРУГИЕ значения: R зависит от числа исполненных
инструкций, а оно у Z80-порта и у нашей рекомпиляции разное по построению.
Значит потиковая сверка «наш против оригинала» невозможна в принципе, пока в
обеих сборках стоит один и тот же детерминированный ГПСЧ.

Эталон для ПРИЁМКИ (звук, вид, скорость) — по-прежнему пристинный src/;
src_ref/ существует ровно для того, чтобы гейт мог сказать «расхождений нет».
"""
import os, re, shutil, sys

SRC, DST = 'src', 'src_ref'
LDAR = '''
;----------------------------------------------------------------------------
; z80_ldar — общий с i8080-веткой ГПСЧ вместо LD A,R (см. tools/mkref.py).
; s := 5*s+23 (mod 256): период ровно 256, значит and 7Fh даёт ноль ровно 2 раза
; за 256 вызовов = те же 1/128, что и у семибитного R. Возвращает 0..127, ставит
; Z и S как LD A,R.
z80_ldar:
	IFDEF DETERMINISTIC
	push hl
	ld hl,z80_ldar_s
	ld a,(hl)
	add a,a
	add a,a
	add a,(hl)
	add a,23
	ld (hl),a
	pop hl
	and 07Fh
	ret
	ELSE
	xor a
	out (8),a
	in a,(0Bh)
	ld (z80_ldar_s),a
	in a,(0Bh)
	ld a,(z80_ldar_s)
	rrca		; бит 0 счётчика бесполезен: ВИ53 тактуется вдвое реже CPU
	and 07Fh
	ret
	ENDIF
z80_ldar_s:	defb 0
'''

def main():
    if os.path.isdir(DST):
        shutil.rmtree(DST)
    shutil.copytree(SRC, DST)
    n = 0
    for f in ('scubacodb.asm', 'scubacodc.asm', 'scubacod1.asm'):
        p = os.path.join(DST, f)
        s = open(p, encoding='utf-8', errors='replace').read()
        # метка может стоять слева в той же строке: "LB339\tLD A,R"
        s, k = re.subn(r'(?im)^(\S*\s+)LD\s+A\s*,\s*R\s*(;.*)?$',
                       r'\1call z80_ldar\t; было: LD A,R \2', s)
        n += k
        open(p, 'w', encoding='utf-8').write(s)
    p = os.path.join(DST, 'scubacod1.asm')
    s = open(p, encoding='utf-8', errors='replace').read()
    s = s.replace('SCUBACOD1_ENDA', LDAR + '\nSCUBACOD1_ENDA', 1)
    # ТИТУЛЬНАЯ СТРОКА — ТА ЖЕ, ЧТО В НАШЕЙ ВЕТКЕ. Иначе пиксель-гейт краснеет на
    # ТИКЕ 0 из-за 49 байт текста (у автора «VECTOR-06C Z80 PORT 2026 NZEEMIN», у
    # нас короче) и в таком виде не стережёт НИЧЕГО: настоящее расхождение видеопамяти
    # прячется за косметическим. Строка ни на что в игре не влияет.
    s = s.replace('ABYTE\t-$20 "VECTOR-06C Z80 PORT 2026 NZEEMIN"',
                  'ABYTE\t-$20 "I8080 PORT - NZEEMIN Z80 BASE"')
    open(p, 'w', encoding='utf-8').write(s)
    print('src_ref: заменено LD A,R -> call z80_ldar в %d местах' % n)

main()
