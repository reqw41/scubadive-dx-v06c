; =====================================================================
; TIMEBASE — ИГРОВОЕ ВРЕМЯ ОТ ПРЕРЫВАНИЯ (2026-09-03, решение владельца).
;
; Было: игровое время = число тиков главного цикла. На тяжёлой сцене тиков
; меньше — дайвер и существа в секундах медленнее (ур.4 в глубине: 77 тик/с,
; 5.5 шага дайвера в секунду против 13 в оригинале).
; Стало: единица времени u = 1/175 с (3.5 u на кадр 50 Гц — ровно один тик при
; штатном темпе pace_tick). tb_tick раз за тик считает Δ — сколько единиц
; прошло; счётчики существ, дайвера и таймеров уменьшаются на Δ, срабатывание
; «дошёл до нуля или ниже», перелёт переносится в перезарядку.
; На лёгкой сцене (3.5 тика/кадр) Δ == 1 всегда — поведение как раньше.
; Спецификация и проверка аккумулятора: tools/verify/timebase_spec.py.
; Арифметика точна для счётчиков 0..255 (у группы V есть мусорные слоты с 255):
; A = t + ~Δ = t-Δ-1, перенос ЕСТЬ <=> t >= Δ+1 <=> ещё не досчитал.
; TB_FIXED=1 — Δ принудительно 1 (доказательство обвязки: образ обязан
; совпасть с обычным байт в байт).
; =====================================================================
tb_acc:		DEFB 0		; запас времени в полуединицах после номинального 1 u за тик
tb_last:	DEFB 0		; FRAMES на прошлом тике
tb_delta:	DEFB 1		; Δ текущего тика, 1..8
tb_over:	DEFB 0		; перелёт последнего срабатывания
tb_force1:	DEFB 0		; ≠0 — залповый цикл (LEF12): Δ = 1
tb_ent:		DEFB 0		; вход в развёртку (11 байт на тело)
SCAN_BODY_TB	EQU 11		; ld a,(hl) 1 + add a,c 1 + inc a 1 + ld (hl),a 1 + jp c 3 + call 3 + add hl,de 1

; --- tb_tick: раз за тик, в начале LB213. Портит A, B, HL. ------------------
tb_tick:
	IFDEF TB_FIXED
	jp tb_one
	ENDIF
	ld a,(tb_force1)
	or a
	jp nz,tb_one
	ld hl,tb_last
	ld a,(FRAMES)
	ld b,a
	sub (hl)		; df = кадров прошло
	ld (hl),b		; last := FRAMES
	cp 5
	jp nc,tb_pause		; пауза (смена экрана): мир стоял, время не догоняем
	ld hl,tb_acc
	ld b,a
	ld a,(hl)
	sub 2			; номинальная единица за тик
tb_addf:
	dec b
	jp m,tb_take
	add a,7			; + 3.5 u за кадр
	jp tb_addf
tb_take:
	ld (hl),a		; acc
	or a
	jp m,tb_neg		; запаса нет — Δ = 1
	rrca
	and 7Fh			; extra = acc/2
	cp 8
	jp c,tb_ok
	ld a,7
tb_ok:
	ld b,a
	inc a
	ld (tb_delta),a		; Δ = 1 + extra
	ld a,b
	add a,a
	ld b,a
	ld a,(hl)
	sub b
	ld (hl),a		; acc -= 2*extra
	ret
tb_neg:
	cp 0F8h			; acc < -8 — тики бегут впереди времени: не копим
	jp nc,tb_one
	ld a,0F8h
	ld (hl),a
	jp tb_one
tb_pause:
	xor a
	ld (tb_acc),a
tb_one:
	ld a,1
	ld (tb_delta),a
	ret

; --- tb_dec: (HL) -= Δ. Выход: NC — досчитал (tb_over = перелёт); C — ещё нет.
; Портит только A и флаги. ------------------------------------------------
tb_dec:
	ld a,(tb_delta)
	cpl			; ~Δ = -Δ-1
	add a,(hl)		; t-Δ-1; перенос <=> t >= Δ+1
	inc a			; t-Δ (перенос цел)
	ld (hl),a
	ret c			; ещё не досчитал
	cpl
	inc a			; перелёт = Δ-t
	ld (tb_over),a
	or a			; NC
	ret
; --- tb_reload: A = период -> (HL) := период - перелёт. A цел. ----------------
tb_reload:
	push bc
	ld b,a
	ld a,(tb_over)
	cpl
	inc a
	add a,b
	ld (hl),a
	ld a,b
	pop bc
	ret

; --- срабатывание в развёртке обхода: A = t-Δ (<= 0), HL -> поле +$0F -----------
; Перезарядка LB737 (+$0F := +$0E) корректируется на перелёт. Бережёт BC, HL.
SCAN_HITC_TB:
	cpl
	inc a
	ld (tb_over),a		; перелёт = Δ - t
	push bc
	push hl
	ld bc,0FFF1h
	add hl,bc
	ld (z80_ix),hl
	CALL LB737
	ld hl,(z80_ix)
	ld bc,000Fh
	add hl,bc
	ld a,(tb_over)
	ld b,a
	ld a,(hl)
	sub b
	ld (hl),a		; период - перелёт
	pop hl
	pop bc
	ret
SCAN_HIT21_TB:
	call SCAN_HITC_TB
	ld de,0015h
	ret
SCAN_HIT26_TB:
	call SCAN_HITC_TB
	ld de,001Ah
	ret
SCAN_HIT28_TB:
	call SCAN_HITC_TB
	ld de,001Ch
	ret
