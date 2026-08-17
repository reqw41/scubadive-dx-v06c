#!/usr/bin/env python3
"""
z80to8080.py — рекомпиляция исходников Scuba Dive (порт nzeemin, Z80) в
подмножество i8080 НА УРОВНЕ ИСХОДНИКА, в том же синтаксисе sjasmplus.

Транслятор ОДНОРАЗОВЫЙ: его выход (src8080/) — канон, дальше правится руками
(методика kvalley-v06c «asm-native»). Данные (спрайты, рельеф, мини-карта,
панель, шрифт) не трогаются вовсе — файлы копируются как есть.

ПОЧЕМУ (IX+d) РАСКРЫВАЕТСЯ В ВЫЗОВ ХЕЛПЕРА, А НЕ ВСТРОЕННЫМ КОДОМ
Замер: свободной RAM между вершиной образа (0x950E) и буферной областью
спрайтов (0xB000, «or $B0» в LB6xx) — 6898 байт. Встроенное раскрытие в стиле
kvalley стоит ~23 лишних байта на место; мест 830 => +19 КБ, НЕ ВЛЕЗАЕТ.
Вызов хелпера со смещением инлайн-байтом после call стоит +1 байт на место
(call 3 + defb 1 против 3 у Z80) => +830 байт. Цена — такты; горячие места
переписываются вручную на этапе 3 (см. профиль в build/profile_z80.json).

КОНТРАКТ РАСКРЫТИЙ (что точно, что расходится — расхождения идут в аудит):
  jr cc,X       -> jp cc,X                              точно
  djnz X        -> dec b / jp nz,X    CY цел; S,Z,P портятся
  bit n,src     -> and-маска, A восстанавливается; Z верен, CY ОБНУЛЯЕТСЯ
  set/res n,src -> push af / ... / pop af                точно
  (IX+d)        -> call-хелпер + defb d                  см. scubai80.asm
  ldir/lddr/ldi -> петли; BC=0, HL/DE как на Z80
  sbc/adc hl,rp -> побайтно через A; S,CY верны, Z только от старшего байта
  neg           -> cpl / inc a; CY не ставится
  ld a,r        -> call z80_ldar (ГПСЧ; регистра регенерации на i8080 нет)
  srl/sla/rr..  -> ротации i8080 ставят ТОЛЬКО CY, Z80 ставил ещё S,Z,P
  rrd           -> call z80_rrd (точная семантика, CY не сохраняется)
  in/out (c)    -> самомодификация номера порта

Использование:
  python3 tools/z80to8080.py <in.asm> <out.asm> [--audit f] [--helpers f]
"""
import re
import sys

DIRECTIVES = {'defb', 'defw', 'db', 'dw', 'ds', 'defs', 'abyte', 'byte', 'word',
              'equ', 'org', 'include', 'output', 'outend', 'end', 'display',
              'align', 'export', 'assert', 'incbin', 'module', 'endmodule'}

REG8 = ('a', 'b', 'c', 'd', 'e', 'h', 'l')


def split_line(line):
    comment = ''
    if ';' in line:
        i = line.index(';')
        comment, line = line[i:], line[:i]
    line = line.rstrip()
    label = ''
    if line[:1] not in ('', ' ', '\t'):
        m = re.match(r'^(\S+)(\s+(.*))?$', line)
        label = m.group(1)
        line = m.group(3) or ''
    return label, line.strip(), comment


def split_ops(s):
    out, depth, cur = [], 0, ''
    for ch in s:
        if ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
        if ch == ',' and depth == 0:
            out.append(cur.strip()); cur = ''
        else:
            cur += ch
    if cur.strip():
        out.append(cur.strip())
    return out


def parse(body):
    parts = body.split(None, 1)
    if not parts:
        return '', []
    return parts[0].lower(), (split_ops(parts[1]) if len(parts) > 1 else [])


IDX_RE = re.compile(r'^\(\s*(ix|iy)\s*([+-])\s*(.+?)\s*\)$', re.I)
IDX_RE0 = re.compile(r'^\(\s*(ix|iy)\s*\)$', re.I)


def idx_of(op):
    m = IDX_RE.match(op)
    if m:
        d = m.group(3)
        return (m.group(1).lower(), d if m.group(2) == '+' else '-(' + d + ')')
    m = IDX_RE0.match(op)
    if m:
        return (m.group(1).lower(), '0')
    return None


class Tr:
    def __init__(self, plan=None):
        self.audit, self.counts, self.helpers = [], {}, set()
        self.fname, self.lineno = '', 0
        self._n = 0
        self.plan = plan or {}          # "файл:строка" -> {"base": "DiverObj"}
        self.direct = 0

    def base_here(self, cell):
        """Константная база для текущей строки, если перепись её доказала."""
        import os
        p = self.plan.get('%s:%d' % (os.path.basename(self.fname), self.lineno))
        if p and p.get('reg') == cell:
            return p['base']
        return None

    def direct_addr(self, base, disp):
        self.direct += 1
        return '(%s+%s)' % (base, disp)

    def note(self, kind, text):
        self.audit.append((self.fname, self.lineno, kind, text))

    def bump(self, k):
        self.counts[k] = self.counts.get(k, 0) + 1

    def lbl(self, tag):
        self._n += 1
        return 'i80_%s_%d' % (tag, self._n)

    def hcall(self, base, cell, disp, tail=None):
        h = base + ('X' if cell == 'ix' else 'Y')
        self.helpers.add(h)
        return ['call %s' % h, 'defb %s' % disp] + (tail or [])

    def expand(self, mn, ops, body):
        f = getattr(self, 'i_' + mn, None)
        return None if f is None else f(ops, body)

    # ------------------------------------------------------------ переходы
    def i_jr(self, ops, body):
        self.bump('jr')
        return ['jp %s' % ops[0]] if len(ops) == 1 else ['jp %s,%s' % (ops[0], ops[1])]

    def i_djnz(self, ops, body):
        self.bump('djnz')
        self.note('djnz', 'dec b портит S,Z,P (CY цел): ' + body)
        return ['dec b', 'jp nz,%s' % ops[0]]

    # ------------------------------------------------------------ bit/set/res
    def i_bit(self, ops, body):
        if len(ops) != 2:
            return None
        n, src = ops[0], ops[1]
        mask = '1<<(%s)' % n
        self.bump('bit')
        self.note('bit-cy', 'and обнуляет CY, BIT его не трогал: ' + body)
        ix = idx_of(src)
        if ix:
            b = self.base_here(ix[0])
            if b:
                self.bump('bit прямо')
                return ['ld (il_a),a', 'ld a,%s' % self.direct_addr(b, ix[1]),
                        'and %s' % mask, 'ld a,(il_a)']
            return self.hcall('z80_bit', ix[0], ix[1],
                              ['and %s' % mask, 'ld a,(il_a)'])
        s = src.lower()
        if s == 'a':
            return ['ld (il_a),a', 'and %s' % mask, 'ld a,(il_a)']
        return ['ld (il_a),a', 'ld a,%s' % src, 'and %s' % mask, 'ld a,(il_a)']

    def _setres(self, ops, body, is_set):
        if len(ops) != 2:
            return None
        n, dst = ops[0], ops[1]
        mask = ('1<<(%s)' % n) if is_set else ('(~(1<<(%s)))&255' % n)
        alu = ('or %s' % mask) if is_set else ('and %s' % mask)
        tag = 'set' if is_set else 'res'
        self.bump(tag)
        ix = idx_of(dst)
        if ix:
            b = self.base_here(ix[0])
            if b:
                self.bump(tag + ' прямо')
                a = self.direct_addr(b, ix[1])
                return ['push af', 'ld a,%s' % a, alu, 'ld %s,a' % a, 'pop af']
            return self.hcall('z80_' + tag, ix[0], ix[1], ['defb %s' % mask])
        d = dst.lower()
        # SET/RES на Z80 не трогают флаги -> push af/pop af
        if d == 'a':
            return ['push af', alu, 'ld (il_a),a', 'pop af', 'ld a,(il_a)']
        if d == '(hl)':
            return ['push af', 'ld a,(hl)', alu, 'ld (hl),a', 'pop af']
        return ['push af', 'ld a,%s' % dst, alu, 'ld %s,a' % dst, 'pop af']

    def i_set(self, ops, body):
        return self._setres(ops, body, True)

    def i_res(self, ops, body):
        return self._setres(ops, body, False)

    # ------------------------------------------------------------ сдвиги
    def _shift(self, ops, body, kind):
        if len(ops) != 1:
            return None
        dst = ops[0]
        self.bump(kind)
        self.note('shift-flags', '%s: Z80 ставил S,Z,P; у нас только CY: %s' % (kind, body))
        core = {'srl': ['and a', 'rra'],       # and a: CY=0, A цел
                'sla': ['and a', 'rla'],
                'sra': ['rlca', 'rrca', 'rra'],
                'rl':  ['rla'], 'rr': ['rra'],
                'rlc': ['rlca'], 'rrc': ['rrca']}[kind]
        ix = idx_of(dst)
        if ix:
            b = self.base_here(ix[0])
            if b:
                self.bump(kind + ' прямо')
                a = self.direct_addr(b, ix[1])
                return ['ld (il_a),a', 'ld a,%s' % a] + core + \
                       ['ld %s,a' % a, 'ld a,(il_a)']
            return self.hcall('z80_%s_' % kind, ix[0], ix[1])
        d = dst.lower()
        if d == 'a':
            return core
        if d == '(hl)':
            return ['ld (il_a),a', 'ld a,(hl)'] + core + ['ld (hl),a', 'ld a,(il_a)']
        return ['ld (il_a),a', 'ld a,%s' % dst] + core + ['ld %s,a' % dst, 'ld a,(il_a)']

    for _k in ('srl', 'sla', 'sra', 'rl', 'rr', 'rlc', 'rrc'):
        exec("def i_%s(self, ops, body):\n    return self._shift(ops, body, '%s')" % (_k, _k))

    # ------------------------------------------------------------ блочные
    # ВАЖНО: LDIR/LDDR/LDI/LDD на Z80 НЕ ТРОГАЮТ A. Петля через A обязана его
    # вернуть — иначе, например, LC4D5 (задержка: LDIR, потом DEC A / JR NZ)
    # получает A=0 после каждого прохода и крутится ВЕЧНО. Именно на этом
    # первая сборка и повисла.
    def i_ldir(self, ops, body):
        self.bump('ldir'); l = self.lbl('ldir')
        self.note('block-flags', 'после петли Z=1,CY=0; на Z80 LDIR хранил S,Z,CY: ' + body)
        return ['ld (il_a),a', '%s:' % l, 'ld a,(hl)', 'ld (de),a', 'inc hl', 'inc de',
                'dec bc', 'ld a,b', 'or c', 'jp nz,%s' % l, 'ld a,(il_a)']

    def i_lddr(self, ops, body):
        self.bump('lddr'); l = self.lbl('lddr')
        self.note('block-flags', 'после петли Z=1,CY=0; на Z80 LDDR хранил S,Z,CY: ' + body)
        return ['ld (il_a),a', '%s:' % l, 'ld a,(hl)', 'ld (de),a', 'dec hl', 'dec de',
                'dec bc', 'ld a,b', 'or c', 'jp nz,%s' % l, 'ld a,(il_a)']

    def i_ldi(self, ops, body):
        self.bump('ldi')
        self.note('block-flags', 'LDI: флаги не воспроизводятся: ' + body)
        return ['ld (il_a),a', 'ld a,(hl)', 'ld (de),a', 'inc hl', 'inc de',
                'dec bc', 'ld a,(il_a)']

    def i_ldd(self, ops, body):
        self.bump('ldd')
        self.note('block-flags', 'LDD: флаги не воспроизводятся: ' + body)
        return ['ld (il_a),a', 'ld a,(hl)', 'ld (de),a', 'dec hl', 'dec de',
                'dec bc', 'ld a,(il_a)']

    def i_neg(self, ops, body):
        if ops:
            return None
        self.bump('neg')
        self.note('neg-cy', 'NEG ставил CY=(A!=0); cpl/inc a не ставит: ' + body)
        return ['cpl', 'inc a']

    def i_rrd(self, ops, body):
        self.bump('rrd'); self.helpers.add('z80_rrd')
        self.note('rrd-cy', 'RRD сохранял CY; хелпер — нет: ' + body)
        return ['call z80_rrd']

    def i_rld(self, ops, body):
        self.bump('rld'); self.helpers.add('z80_rld')
        return ['call z80_rld']

    # ------------------------------------------------------------ ld
    def i_ld(self, ops, body):
        if len(ops) != 2:
            return None
        dst, src = ops
        dl, sl = dst.lower(), src.lower()

        if dl == 'a' and sl in ('r', 'i'):
            self.bump('ld a,r'); self.helpers.add('z80_ldar')
            self.note('ldar', 'LD A,R -> call z80_ldar: ' + body)
            return ['call z80_ldar']
        if dl in ('r', 'i') and sl == 'a':
            self.bump('ld r,a')
            return ['; i8080: регистра %s нет — команда выброшена' % dl.upper()]

        # ld ix,nn | ld ix,(nn)
        if dl in ('ix', 'iy'):
            self.bump('ld ix,src')
            return ['ld (il_hl),hl', 'ld hl,%s' % src, 'ld (z80_%s),hl' % dl,
                    'ld hl,(il_hl)']
        # ld (nn),ix
        if sl in ('ix', 'iy'):
            self.bump('ld dst,ix')
            return ['ld (il_hl),hl', 'ld hl,(z80_%s)' % sl, 'ld %s,hl' % dst,
                    'ld hl,(il_hl)']

        ixd, ixs = idx_of(dst), idx_of(src)
        if ixs and not ixd and dl in REG8:
            b = self.base_here(ixs[0])
            if b:
                self.bump('ld r,(ix+d) прямо')
                a = self.direct_addr(b, ixs[1])
                if dl == 'a':
                    return ['ld a,%s' % a]
                return ['ld (il_a),a', 'ld a,%s' % a, 'ld %s,a' % dl, 'ld a,(il_a)']
            self.bump('ld r,(ix+d)')
            return self.hcall('z80_ld%s_' % dl, ixs[0], ixs[1])
        if ixd and not ixs:
            b = self.base_here(ixd[0])
            if sl in REG8:
                if b:
                    self.bump('ld (ix+d),r прямо')
                    a = self.direct_addr(b, ixd[1])
                    if sl == 'a':
                        return ['ld %s,a' % a]
                    return ['ld (il_a),a', 'ld a,%s' % sl, 'ld %s,a' % a, 'ld a,(il_a)']
                self.bump('ld (ix+d),r')
                return self.hcall('z80_st%s_' % sl, ixd[0], ixd[1])
            if b:
                self.bump('ld (ix+d),n прямо')
                a = self.direct_addr(b, ixd[1])
                return ['ld (il_a),a', 'ld a,%s' % src, 'ld %s,a' % a, 'ld a,(il_a)']
            self.bump('ld (ix+d),n')
            return self.hcall('z80_stn_', ixd[0], ixd[1], ['defb %s' % src])

        # ld (nn),bc|de   /   ld bc|de,(nn)
        if (dst.startswith('(') and not re.match(r'^\((hl|bc|de|c)\)$', dl)
                and sl in ('bc', 'de')):
            self.bump('ld (nn),rp')
            return ['ld (il_a),a', 'ld a,%s' % sl[1], 'ld %s,a' % dst,
                    'ld a,%s' % sl[0], 'ld %s,a' % _plus1(dst), 'ld a,(il_a)']
        if dl in ('bc', 'de') and src.startswith('(') and not re.match(r'^\((hl|bc|de|c)\)$', sl):
            self.bump('ld rp,(nn)')
            return ['ld (il_hl),hl', 'ld hl,%s' % src, 'ld %s,l' % dl[1],
                    'ld %s,h' % dl[0], 'ld hl,(il_hl)']
        return None

    # ------------------------------------------------------------ inc/dec
    def _incdec(self, ops, body, kind):
        if len(ops) != 1:
            return None
        ix = idx_of(ops[0])
        if ix:
            b = self.base_here(ix[0])
            if b:
                # ТОЧНО как на Z80: ld hl,nn и ld hl,(nn) флаги не трогают,
                # inc/dec (hl) ставит S,Z,P и хранит CY.
                self.bump('%s (ix+d) прямо' % kind)
                return ['ld (il_hl),hl', 'ld hl,%s+%s' % (b, ix[1]),
                        '%s (hl)' % kind, 'ld hl,(il_hl)']
            self.bump('%s (ix+d)' % kind)
            self.note('incdec-cy', '%s (ix+d): CY портится сборкой адреса: %s' % (kind, body))
            return self.hcall('z80_%s_' % kind, ix[0], ix[1])
        d = ops[0].lower()
        if d in ('ix', 'iy'):
            self.bump('%s ix' % kind)
            return ['ld (il_hl),hl', 'ld hl,(z80_%s)' % d, '%s hl' % kind,
                    'ld (z80_%s),hl' % d, 'ld hl,(il_hl)']
        return None

    def i_inc(self, ops, body):
        return self._incdec(ops, body, 'inc')

    def i_dec(self, ops, body):
        return self._incdec(ops, body, 'dec')

    # ------------------------------------------------------------ АЛУ
    def _alu(self, ops, body, mn):
        if mn == 'add' and len(ops) == 2 and ops[0].lower() in ('ix', 'iy'):
            cell = 'z80_' + ops[0].lower()
            rp = ops[1].lower()
            self.bump('add ix,rp')
            if rp in ('ix', 'iy'):
                return ['ld (il_hl),hl', 'ld hl,(%s)' % cell, 'add hl,hl',
                        'ld (%s),hl' % cell, 'ld hl,(il_hl)']
            return ['ld (il_hl),hl', 'ld hl,(%s)' % cell, 'add hl,%s' % rp,
                    'ld (%s),hl' % cell, 'ld hl,(il_hl)']
        if mn in ('sbc', 'adc') and len(ops) == 2 and ops[0].lower() == 'hl':
            rp = ops[1].lower()
            if rp not in ('bc', 'de', 'hl'):
                return None
            self.bump('%s hl,rp' % mn)
            self.note('16bit-flags',
                      '%s: Z только по старшему байту, P = чётность (на Z80 — переполнение): %s'
                      % (mn, body))
            hi, lo = rp[0], rp[1]
            op = 'sbc a,' if mn == 'sbc' else 'adc a,'
            return ['ld (il_a),a', 'ld a,l', op + lo, 'ld l,a',
                    'ld a,h', op + hi, 'ld h,a', 'ld a,(il_a)']
        idxop = next((o for o in ops if idx_of(o)), None)
        if idxop is not None:
            cell, disp = idx_of(idxop)
            b = self.base_here(cell)
            if b:
                # ld hl,nn / ld hl,(nn) флаги не трогают -> флаги ровно от АЛУ
                alu = {'add': 'add a,(hl)', 'adc': 'adc a,(hl)', 'sub': 'sub (hl)',
                       'sbc': 'sbc a,(hl)', 'and': 'and (hl)', 'or': 'or (hl)',
                       'xor': 'xor (hl)', 'cp': 'cp (hl)'}[mn]
                self.bump('%s (ix+d) прямо' % mn)
                self.direct += 1
                return ['ld (il_hl),hl', 'ld hl,%s+%s' % (b, disp), alu,
                        'ld hl,(il_hl)']
            self.bump('%s (ix+d)' % mn)
            return self.hcall('z80_%s_' % mn, cell, disp)
        return None

    for _k in ('add', 'adc', 'sub', 'sbc', 'and', 'or', 'xor', 'cp'):
        exec("def i_%s(self, ops, body):\n    return self._alu(ops, body, '%s')" % (_k, _k))

    # ------------------------------------------------------------ стек/переходы IX
    def i_push(self, ops, body):
        if len(ops) == 1 and ops[0].lower() in ('ix', 'iy'):
            self.bump('push ix')
            return ['ld (il_hl),hl', 'ld hl,(z80_%s)' % ops[0].lower(), 'push hl',
                    'ld hl,(il_hl)']
        return None

    def i_pop(self, ops, body):
        if len(ops) == 1 and ops[0].lower() in ('ix', 'iy'):
            self.bump('pop ix')
            return ['ld (il_hl),hl', 'pop hl', 'ld (z80_%s),hl' % ops[0].lower(),
                    'ld hl,(il_hl)']
        return None

    def i_jp(self, ops, body):
        if len(ops) == 1 and ops[0].lower() in ('(ix)', '(iy)'):
            self.bump('jp (ix)')
            return ['ld hl,(z80_%s)' % ops[0].lower()[1:3], 'jp (hl)']
        return None

    def i_in(self, ops, body):
        if len(ops) == 2 and ops[1].lower() == '(c)':
            self.bump('in r,(c)'); l = self.lbl('inc')
            self.note('in-c', 'номер порта из C через самомодификацию: ' + body)
            return ['ld a,c', 'ld (%s+1),a' % l, '%s:' % l, 'in a,(0)'] + \
                   ([] if ops[0].lower() == 'a' else ['ld %s,a' % ops[0]])
        return None

    def i_out(self, ops, body):
        if len(ops) == 2 and ops[0].lower() == '(c)':
            self.bump('out (c),r'); l = self.lbl('outc')
            self.note('out-c', 'номер порта из C через самомодификацию: ' + body)
            pre = [] if ops[1].lower() == 'a' else ['ld a,%s' % ops[1]]
            return ['ld (il_a),a', 'ld a,c', 'ld (%s+1),a' % l, 'ld a,(il_a)'] + \
                   pre + ['%s:' % l, 'out (0),a']
        return None


def _plus1(memop):
    return '(%s+1)' % memop[1:-1].strip()


def translate(src, fname, tr):
    out = []
    for i, line in enumerate(src.split('\n'), 1):
        tr.fname, tr.lineno = fname, i
        label, body, comment = split_line(line)
        if not body:
            out.append(line)
            continue
        mn, ops = parse(body)
        if mn in DIRECTIVES or mn == '=' or mn.endswith(':'):
            out.append(line)
            continue
        seq = tr.expand(mn, ops, body)
        if seq is None:
            out.append(line)
            continue
        if label:
            out.append(label if label.endswith(':') else label + ':')
        first = True
        for s in seq:
            ln = s if s.endswith(':') else '\t' + s
            if first and comment:
                ln += '\t' + comment
                first = False
            out.append(ln)
        if first and comment:
            out.append('\t' + comment)
    return '\n'.join(out)


# =============================================================== хелперы

# Сборка адреса: A = d (смещение из инлайн-байта), HL = (z80_ix) -> HL = IX+d.
# CY после этого испорчен всегда — учтено в контрактах ниже.
ADDR = """\tld hl,({cell})
\tadd a,l
\tld l,a
\tld a,0
\tadc a,h
\tld h,a"""

# Пролог «взять инлайн-байт»: HL вызывающего в il_hl, адрес возврата поправлен
# и лежит в il_ptr, A и F сохранены на стеке (push af ПОСЛЕ pop hl — иначе
# инлайн-байт оказался бы под AF).
PRE_KEEPAF = """\tld (il_hl),hl
\tpop hl
\tpush af
\tld a,(hl)
\tinc hl
\tld (il_ptr),hl
"""
POST_KEEPAF = """\tpop af
\tld hl,(il_ptr)
\tpush hl
\tld hl,(il_hl)
\tret
"""
# Вариант без сохранения флагов (A сохраняется в il_a вручную там, где нужен).
PRE_NOAF = """\tld (il_hl),hl
\tpop hl
\tld a,(hl)
\tinc hl
\tld (il_ptr),hl
"""
POST_NOAF = """\tld hl,(il_ptr)
\tpush hl
\tld hl,(il_hl)
\tret
"""


def gen_helper(name):
    """Собрать текст хелпера по его имени."""
    cell = 'z80_ix' if name.endswith('X') else 'z80_iy'
    base = name[:-1]
    A = ADDR.format(cell=cell)

    # ld r,(IX+d): флаги и A (кроме r=a) целы
    m = re.match(r'^z80_ld([abcdehl])_$', base)
    if m:
        r = m.group(1)
        if r == 'a':
            core = "\tld a,(hl)\n\tld (il_a),a\n"
            tail = "\tpop af\n\tld a,(il_a)\n\tld hl,(il_ptr)\n\tpush hl\n\tld hl,(il_hl)\n\tret\n"
        elif r == 'h':
            core = "\tld a,(hl)\n\tld (il_hl+1),a\n"
            tail = POST_KEEPAF
        elif r == 'l':
            core = "\tld a,(hl)\n\tld (il_hl),a\n"
            tail = POST_KEEPAF
        else:
            core = "\tld %s,(hl)\n" % r
            tail = POST_KEEPAF
        return ("; %s: ld %s,(%s+d). Флаги и остальные регистры целы.\n%s:\n%s%s\n%s%s"
                % (name, r, cell[4:].upper(), name, PRE_KEEPAF, A, core, tail))

    # ld (IX+d),r
    m = re.match(r'^z80_st([abcdehl])_$', base)
    if m:
        r = m.group(1)
        if r == 'a':
            # A нужен как значение — берём его из сохранённого на стеке через il_a
            return ("; %s: ld (%s+d),a. Флаги и A целы.\n%s:\n"
                    "\tld (il_a),a\n%s%s\n\tld a,(il_a)\n\tld (hl),a\n%s"
                    % (name, cell[4:].upper(), name, PRE_KEEPAF, A, POST_KEEPAF))
        if r in ('h', 'l'):
            src = 'ld a,(il_hl+1)' if r == 'h' else 'ld a,(il_hl)'
            core = "\t%s\n\tld (hl),a\n" % src
        else:
            core = "\tld (hl),%s\n" % r
        return ("; %s: ld (%s+d),%s. Флаги и A целы.\n%s:\n%s%s\n%s%s"
                % (name, cell[4:].upper(), r, name, PRE_KEEPAF, A, core, POST_KEEPAF))

    # ld (IX+d),n  — два инлайн-байта: d, затем n
    if base == 'z80_stn_':
        return ("; %s: ld (%s+d),n — инлайн-байты d,n. Флаги и A целы.\n%s:\n"
                "\tld (il_hl),hl\n\tpop hl\n\tpush af\n\tld a,(hl)\n\tinc hl\n"
                "\tld (il_ptr),hl\n%s\n\tld (il_ptr2),hl\n"
                "\tld hl,(il_ptr)\n\tld a,(hl)\n\tinc hl\n\tld (il_ptr),hl\n"
                "\tld hl,(il_ptr2)\n\tld (hl),a\n%s"
                % (name, cell[4:].upper(), name, A, POST_KEEPAF))

    # inc/dec (IX+d): флаги = результат (как на Z80, кроме CY — он портится)
    m = re.match(r'^z80_(inc|dec)_$', base)
    if m:
        op = m.group(1)
        return ("; %s: %s (%s+d). Флаги S,Z,P от результата; CY ПОРЧЕН (Z80 его хранил). A цел.\n%s:\n"
                "\tld (il_a),a\n%s%s\n\tld a,(il_a)\n\t%s (hl)\n"
                "\tld hl,(il_ptr)\n\tpush hl\n\tld hl,(il_hl)\n\tret\n"
                % (name, op, cell[4:].upper(), name, PRE_NOAF, A, op))

    # bit: A := (IX+d), старое A в il_a; флаги ставит сам вызывающий (and mask)
    if base == 'z80_bit':
        return ("; %s: A := (%s+d), прежнее A в il_a. Вызывающий делает and mask / ld a,(il_a).\n%s:\n"
                "\tld (il_a),a\n%s%s\n\tld a,(hl)\n"
                "\tld hl,(il_ptr)\n\tpush hl\n\tld hl,(il_hl)\n\tret\n"
                % (name, cell[4:].upper(), name, PRE_NOAF, A))

    # set/res: инлайн-байты d, mask. Флаги и A целы (SET/RES их не трогают).
    m = re.match(r'^z80_(set|res)$', base)
    if m:
        alu = 'or (hl)' if m.group(1) == 'set' else 'and (hl)'
        return ("; %s: %s n,(%s+d) — инлайн-байты d,mask. Флаги и A целы.\n%s:\n"
                "\tld (il_hl),hl\n\tpop hl\n\tpush af\n\tld a,(hl)\n\tinc hl\n"
                "\tld (il_ptr),hl\n%s\n\tld (il_ptr2),hl\n"
                "\tld hl,(il_ptr)\n\tld a,(hl)\n\tinc hl\n\tld (il_ptr),hl\n"
                "\tld (il_a),a\n\tld hl,(il_ptr2)\n\tld a,(il_a)\n\t%s\n\tld (hl),a\n%s"
                % (name, m.group(1), cell[4:].upper(), name, A, alu, POST_KEEPAF))

    # АЛУ: A op (IX+d)
    m = re.match(r'^z80_(add|adc|sub|sbc|and|or|xor|cp)_$', base)
    if m:
        op = m.group(1)
        alu = {'add': 'add a,(hl)', 'adc': 'adc a,(hl)', 'sub': 'sub (hl)',
               'sbc': 'sbc a,(hl)', 'and': 'and (hl)', 'or': 'or (hl)',
               'xor': 'xor (hl)', 'cp': 'cp (hl)'}[op]
        keep = "" if op == 'cp' else "\tld (il_a),a\n"
        back = "\tld a,(il_a)\n" if op != 'cp' else ""
        return ("; %s: a %s (%s+d). Флаги от результата, BC/DE/HL целы.\n%s:\n"
                "\tld (il_a),a\n%s%s\n\tld a,(il_a)\n\t%s\n%s"
                "\tld hl,(il_ptr)\n\tpush hl\n\tld hl,(il_hl)\n%s\tret\n"
                % (name, op, cell[4:].upper(), name, PRE_NOAF, A, alu, keep, back))

    # сдвиги над (IX+d)
    m = re.match(r'^z80_(srl|sla|sra|rl|rr|rlc|rrc)_$', base)
    if m:
        core = {'srl': ['and a', 'rra'], 'sla': ['and a', 'rla'],
                'sra': ['rlca', 'rrca', 'rra'], 'rl': ['rla'], 'rr': ['rra'],
                'rlc': ['rlca'], 'rrc': ['rrca']}[m.group(1)]
        return ("; %s: %s (%s+d). Ставит только CY (Z80 ставил ещё S,Z,P). A цел.\n%s:\n"
                "\tld (il_a),a\n%s%s\n\tld a,(hl)\n%s\n\tld (hl),a\n\tld a,(il_a)\n"
                "\tld hl,(il_ptr)\n\tpush hl\n\tld hl,(il_hl)\n\tret\n"
                % (name, m.group(1), cell[4:].upper(), name, PRE_NOAF, A,
                   "\n".join("\t" + c for c in core)))
    return None


FIXED_HELPERS = """
; ---------------------------------------------------------------------------
; z80_ldar — замена LD A,R. Регистра регенерации на i8080 нет, а игра берёт из
; него случайность (11 мест, везде вплотную JR Z: срабатывание 1/128, потому что
; R семибитный). Заменено ЛКГ s := 5*s+23 (mod 256) — период ровно 256, значит
; and 7Fh даёт ноль ровно 2 раза за 256 вызовов = те же 1/128. Возвращает 0..127,
; ставит Z и S как LD A,R. Тот же хелпер вставляется и в эталонную Z80-сборку —
; иначе lockstep невозможен: R зависит от числа исполненных инструкций, а оно у
; сборок разное.
z80_ldar:
	ld (il_hl),hl
	ld hl,il_r
	ld a,(hl)
	add a,a
	add a,a
	add a,(hl)
	add a,23
	ld (hl),a
	ld hl,(il_hl)
	and 07Fh
	ret

; ---------------------------------------------------------------------------
; z80_rrd — точная семантика Z80 RRD:
;   tmp=(HL); (HL) = ((A&0F)<<4) | (tmp>>4); A = (A&F0) | (tmp&0F)
; Флаги S,Z,P от нового A. CY на Z80 сохранялся, у нас — сбрасывается (or c).
; Используется в предсдвиге спрайта LB454 (замер: 8.9 исполнений на игровой тик).
z80_rrd:
	ld (il_a),a
	push bc
	ld a,(hl)
	ld b,a			; B = tmp
	ld a,(il_a)
	and 00Fh
	rlca
	rlca
	rlca
	rlca			; (A&0F)<<4
	ld c,a
	ld a,b
	rrca
	rrca
	rrca
	rrca
	and 00Fh		; tmp>>4
	or c
	ld (hl),a		; новый (HL)
	ld a,b
	and 00Fh
	ld c,a
	ld a,(il_a)
	and 0F0h
	or c			; новый A
	pop bc
	ret

; ---------------------------------------------------------------------------
; Рабочие ячейки рекомпиляции. Лежат внутри образа (распаковываются вместе с
; кодом), поэтому не конфликтуют ни с буферами спрайтов ($B000-$BFFF), ни с
; областью задержки LC4D7.
z80_ix:		defw 0		; тень IX
z80_iy:		defw 0		; тень IY
il_hl:		defw 0		; сохранённый HL вызывающего
il_ptr:		defw 0		; исправленный адрес возврата
il_ptr2:	defw 0		; второй временный указатель
il_a:		defb 0		; сохранённый/рабочий A
il_r:		defb 0		; состояние ГПСЧ вместо регистра R
"""


def main():
    import json
    args = sys.argv[1:]
    audit = helpers_out = plan_path = None
    if '--audit' in args:
        k = args.index('--audit'); audit = args[k + 1]; del args[k:k + 2]
    if '--helpers' in args:
        k = args.index('--helpers'); helpers_out = args[k + 1]; del args[k:k + 2]
    if '--plan' in args:
        k = args.index('--plan'); plan_path = args[k + 1]; del args[k:k + 2]
    plan = json.load(open(plan_path, encoding='utf-8')) if plan_path else {}
    tr = Tr(plan)
    pairs = [(args[i], args[i + 1]) for i in range(0, len(args), 2)]
    for inp, outp in pairs:
        src = open(inp, encoding='latin1').read()
        res = translate(src, inp, tr)
        open(outp, 'w', encoding='utf-8').write(res)
        print('%s -> %s' % (inp, outp))
    tot = sum(tr.counts.values())
    print('раскрыто %d инструкций (из них прямой адресацией по доказанной базе: %d):'
          % (tot, tr.direct))
    for k in sorted(tr.counts, key=lambda x: -tr.counts[x]):
        print('    %5d  %s' % (tr.counts[k], k))
    if helpers_out:
        parts = ["; scubai80.asm — библиотека рекомпиляции Z80 -> i8080.\n"
                 "; СГЕНЕРИРОВАН tools/z80to8080.py; дальше правится руками.\n"
                 "; Смещение (IX+d) передаётся ИНЛАЙН-БАЙТОМ сразу за call: так место\n"
                 "; вызова стоит 4 байта против 3 у Z80, тогда как встроенное раскрытие\n"
                 "; стоило бы ~26 (замер: свободной RAM всего 6898 байт).\n"]
        miss = []
        for h in sorted(tr.helpers):
            t = gen_helper(h)
            if t is None:
                if h not in ('z80_ldar', 'z80_rrd', 'z80_rld'):
                    miss.append(h)
                continue
            parts.append(t)
        parts.append(FIXED_HELPERS)
        open(helpers_out, 'w', encoding='utf-8').write("\n".join(parts))
        print('    хелперов: %d -> %s' % (len(tr.helpers), helpers_out))
        if miss:
            print('    !!! НЕТ ШАБЛОНА для: %s' % ', '.join(miss))
    if audit:
        with open(audit, 'w', encoding='utf-8') as f:
            for a in tr.audit:
                f.write('%s:%d\t%s\t%s\n' % a)
        kinds = {}
        for a in tr.audit:
            kinds[a[2]] = kinds.get(a[2], 0) + 1
        print('    аудит: %d записей -> %s' % (len(tr.audit), audit))
        for k in sorted(kinds, key=lambda x: -kinds[x]):
            print('        %5d  %s' % (kinds[k], k))


if __name__ == '__main__':
    main()
