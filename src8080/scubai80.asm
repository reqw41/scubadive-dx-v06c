; scubai80.asm — библиотека рекомпиляции Z80 -> i8080.
; СГЕНЕРИРОВАН tools/z80to8080.py; дальше правится руками.
; Смещение (IX+d) передаётся ИНЛАЙН-БАЙТОМ сразу за call: так место
; вызова стоит 4 байта против 3 у Z80, тогда как встроенное раскрытие
; стоило бы ~26 (замер: свободной RAM всего 6898 байт).

; z80_add_X: a add (IX+d). Флаги от результата, BC/DE/HL целы.
z80_add_X:
	ld (il_a),a
	ld (il_hl),hl
	pop hl
	ld a,(hl)
	inc hl
	ld (il_ptr),hl
	ld hl,(z80_ix)
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld a,(il_a)
	add a,(hl)
	ld (il_a),a
	ld hl,(il_ptr)
	push hl
	ld hl,(il_hl)
	ld a,(il_a)
	ret

; z80_add_Y: a add (IY+d). Флаги от результата, BC/DE/HL целы.
z80_add_Y:
	ld (il_a),a
	ld (il_hl),hl
	pop hl
	ld a,(hl)
	inc hl
	ld (il_ptr),hl
	ld hl,(z80_iy)
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld a,(il_a)
	add a,(hl)
	ld (il_a),a
	ld hl,(il_ptr)
	push hl
	ld hl,(il_hl)
	ld a,(il_a)
	ret

; z80_and_X: a and (IX+d). Флаги от результата, BC/DE/HL целы.
z80_and_X:
	ld (il_a),a
	ld (il_hl),hl
	pop hl
	ld a,(hl)
	inc hl
	ld (il_ptr),hl
	ld hl,(z80_ix)
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld a,(il_a)
	and (hl)
	ld (il_a),a
	ld hl,(il_ptr)
	push hl
	ld hl,(il_hl)
	ld a,(il_a)
	ret

; z80_and_Y: a and (IY+d). Флаги от результата, BC/DE/HL целы.
z80_and_Y:
	ld (il_a),a
	ld (il_hl),hl
	pop hl
	ld a,(hl)
	inc hl
	ld (il_ptr),hl
	ld hl,(z80_iy)
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld a,(il_a)
	and (hl)
	ld (il_a),a
	ld hl,(il_ptr)
	push hl
	ld hl,(il_hl)
	ld a,(il_a)
	ret

; z80_bitX: A := (IX+d), прежнее A в il_a. Вызывающий делает and mask / ld a,(il_a).
z80_bitX:
	ld (il_a),a
	ld (il_hl),hl
	pop hl
	ld a,(hl)
	inc hl
	ld (il_ptr),hl
	ld hl,(z80_ix)
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld a,(hl)
	ld hl,(il_ptr)
	push hl
	ld hl,(il_hl)
	ret

; z80_bitY: A := (IY+d), прежнее A в il_a. Вызывающий делает and mask / ld a,(il_a).
z80_bitY:
	ld (il_a),a
	ld (il_hl),hl
	pop hl
	ld a,(hl)
	inc hl
	ld (il_ptr),hl
	ld hl,(z80_iy)
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld a,(hl)
	ld hl,(il_ptr)
	push hl
	ld hl,(il_hl)
	ret

; z80_cp_X: a cp (IX+d). Флаги от результата, BC/DE/HL целы.
z80_cp_X:
	ld (il_a),a
	ld (il_hl),hl
	pop hl
	ld a,(hl)
	inc hl
	ld (il_ptr),hl
	ld hl,(z80_ix)
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld a,(il_a)
	cp (hl)
	ld hl,(il_ptr)
	push hl
	ld hl,(il_hl)
	ret

; z80_cp_Y: a cp (IY+d). Флаги от результата, BC/DE/HL целы.
z80_cp_Y:
	ld (il_a),a
	ld (il_hl),hl
	pop hl
	ld a,(hl)
	inc hl
	ld (il_ptr),hl
	ld hl,(z80_iy)
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld a,(il_a)
	cp (hl)
	ld hl,(il_ptr)
	push hl
	ld hl,(il_hl)
	ret

; z80_dec_X: dec (IX+d). Флаги S,Z,P от результата; CY ПОРЧЕН (Z80 его хранил). A цел.
z80_dec_X:
	ld (il_a),a
	ld (il_hl),hl
	pop hl
	ld a,(hl)
	inc hl
	ld (il_ptr),hl
	ld hl,(z80_ix)
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld a,(il_a)
	dec (hl)
	ld hl,(il_ptr)
	push hl
	ld hl,(il_hl)
	ret

; z80_dec_Y: dec (IY+d). Флаги S,Z,P от результата; CY ПОРЧЕН (Z80 его хранил). A цел.
z80_dec_Y:
	ld (il_a),a
	ld (il_hl),hl
	pop hl
	ld a,(hl)
	inc hl
	ld (il_ptr),hl
	ld hl,(z80_iy)
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld a,(il_a)
	dec (hl)
	ld hl,(il_ptr)
	push hl
	ld hl,(il_hl)
	ret

; z80_inc_X: inc (IX+d). Флаги S,Z,P от результата; CY ПОРЧЕН (Z80 его хранил). A цел.
z80_inc_X:
	ld (il_a),a
	ld (il_hl),hl
	pop hl
	ld a,(hl)
	inc hl
	ld (il_ptr),hl
	ld hl,(z80_ix)
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld a,(il_a)
	inc (hl)
	ld hl,(il_ptr)
	push hl
	ld hl,(il_hl)
	ret

; z80_inc_Y: inc (IY+d). Флаги S,Z,P от результата; CY ПОРЧЕН (Z80 его хранил). A цел.
z80_inc_Y:
	ld (il_a),a
	ld (il_hl),hl
	pop hl
	ld a,(hl)
	inc hl
	ld (il_ptr),hl
	ld hl,(z80_iy)
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld a,(il_a)
	inc (hl)
	ld hl,(il_ptr)
	push hl
	ld hl,(il_hl)
	ret

; z80_lda_X: ld a,(IX+d). Флаги и остальные регистры целы.
z80_lda_X:
	ld (il_hl),hl
	pop hl
	push af
	ld a,(hl)
	inc hl
	ld (il_ptr),hl
	ld hl,(z80_ix)
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld a,(hl)
	ld (il_a),a
	pop af
	ld a,(il_a)
	ld hl,(il_ptr)
	push hl
	ld hl,(il_hl)
	ret

; z80_lda_Y: ld a,(IY+d). Флаги и остальные регистры целы.
z80_lda_Y:
	ld (il_hl),hl
	pop hl
	push af
	ld a,(hl)
	inc hl
	ld (il_ptr),hl
	ld hl,(z80_iy)
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld a,(hl)
	ld (il_a),a
	pop af
	ld a,(il_a)
	ld hl,(il_ptr)
	push hl
	ld hl,(il_hl)
	ret

; z80_ldb_X: ld b,(IX+d). Флаги и остальные регистры целы.
z80_ldb_X:
	ld (il_hl),hl
	pop hl
	push af
	ld a,(hl)
	inc hl
	ld (il_ptr),hl
	ld hl,(z80_ix)
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld b,(hl)
	pop af
	ld hl,(il_ptr)
	push hl
	ld hl,(il_hl)
	ret

; z80_ldb_Y: ld b,(IY+d). Флаги и остальные регистры целы.
z80_ldb_Y:
	ld (il_hl),hl
	pop hl
	push af
	ld a,(hl)
	inc hl
	ld (il_ptr),hl
	ld hl,(z80_iy)
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld b,(hl)
	pop af
	ld hl,(il_ptr)
	push hl
	ld hl,(il_hl)
	ret

; z80_ldc_Y: ld c,(IY+d). Флаги и остальные регистры целы.
z80_ldc_Y:
	ld (il_hl),hl
	pop hl
	push af
	ld a,(hl)
	inc hl
	ld (il_ptr),hl
	ld hl,(z80_iy)
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld c,(hl)
	pop af
	ld hl,(il_ptr)
	push hl
	ld hl,(il_hl)
	ret

; z80_ldd_X: ld d,(IX+d). Флаги и остальные регистры целы.
z80_ldd_X:
	ld (il_hl),hl
	pop hl
	push af
	ld a,(hl)
	inc hl
	ld (il_ptr),hl
	ld hl,(z80_ix)
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld d,(hl)
	pop af
	ld hl,(il_ptr)
	push hl
	ld hl,(il_hl)
	ret

; z80_ldd_Y: ld d,(IY+d). Флаги и остальные регистры целы.
z80_ldd_Y:
	ld (il_hl),hl
	pop hl
	push af
	ld a,(hl)
	inc hl
	ld (il_ptr),hl
	ld hl,(z80_iy)
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld d,(hl)
	pop af
	ld hl,(il_ptr)
	push hl
	ld hl,(il_hl)
	ret

; z80_lde_X: ld e,(IX+d). Флаги и остальные регистры целы.
z80_lde_X:
	ld (il_hl),hl
	pop hl
	push af
	ld a,(hl)
	inc hl
	ld (il_ptr),hl
	ld hl,(z80_ix)
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld e,(hl)
	pop af
	ld hl,(il_ptr)
	push hl
	ld hl,(il_hl)
	ret

; z80_lde_Y: ld e,(IY+d). Флаги и остальные регистры целы.
z80_lde_Y:
	ld (il_hl),hl
	pop hl
	push af
	ld a,(hl)
	inc hl
	ld (il_ptr),hl
	ld hl,(z80_iy)
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld e,(hl)
	pop af
	ld hl,(il_ptr)
	push hl
	ld hl,(il_hl)
	ret

; z80_ldh_X: ld h,(IX+d). Флаги и остальные регистры целы.
z80_ldh_X:
	ld (il_hl),hl
	pop hl
	push af
	ld a,(hl)
	inc hl
	ld (il_ptr),hl
	ld hl,(z80_ix)
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld a,(hl)
	ld (il_hl+1),a
	pop af
	ld hl,(il_ptr)
	push hl
	ld hl,(il_hl)
	ret

; z80_ldh_Y: ld h,(IY+d). Флаги и остальные регистры целы.
z80_ldh_Y:
	ld (il_hl),hl
	pop hl
	push af
	ld a,(hl)
	inc hl
	ld (il_ptr),hl
	ld hl,(z80_iy)
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld a,(hl)
	ld (il_hl+1),a
	pop af
	ld hl,(il_ptr)
	push hl
	ld hl,(il_hl)
	ret

; z80_ldl_X: ld l,(IX+d). Флаги и остальные регистры целы.
z80_ldl_X:
	ld (il_hl),hl
	pop hl
	push af
	ld a,(hl)
	inc hl
	ld (il_ptr),hl
	ld hl,(z80_ix)
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld a,(hl)
	ld (il_hl),a
	pop af
	ld hl,(il_ptr)
	push hl
	ld hl,(il_hl)
	ret

; z80_ldl_Y: ld l,(IY+d). Флаги и остальные регистры целы.
z80_ldl_Y:
	ld (il_hl),hl
	pop hl
	push af
	ld a,(hl)
	inc hl
	ld (il_ptr),hl
	ld hl,(z80_iy)
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld a,(hl)
	ld (il_hl),a
	pop af
	ld hl,(il_ptr)
	push hl
	ld hl,(il_hl)
	ret

; z80_or_Y: a or (IY+d). Флаги от результата, BC/DE/HL целы.
z80_or_Y:
	ld (il_a),a
	ld (il_hl),hl
	pop hl
	ld a,(hl)
	inc hl
	ld (il_ptr),hl
	ld hl,(z80_iy)
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld a,(il_a)
	or (hl)
	ld (il_a),a
	ld hl,(il_ptr)
	push hl
	ld hl,(il_hl)
	ld a,(il_a)
	ret

; z80_resX: res n,(IX+d) — инлайн-байты d,mask. Флаги и A целы.
z80_resX:
	ld (il_hl),hl
	pop hl
	push af
	ld a,(hl)
	inc hl
	ld (il_ptr),hl
	ld hl,(z80_ix)
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld (il_ptr2),hl
	ld hl,(il_ptr)
	ld a,(hl)
	inc hl
	ld (il_ptr),hl
	ld (il_a),a
	ld hl,(il_ptr2)
	ld a,(il_a)
	and (hl)
	ld (hl),a
	pop af
	ld hl,(il_ptr)
	push hl
	ld hl,(il_hl)
	ret

; z80_setX: set n,(IX+d) — инлайн-байты d,mask. Флаги и A целы.
z80_setX:
	ld (il_hl),hl
	pop hl
	push af
	ld a,(hl)
	inc hl
	ld (il_ptr),hl
	ld hl,(z80_ix)
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld (il_ptr2),hl
	ld hl,(il_ptr)
	ld a,(hl)
	inc hl
	ld (il_ptr),hl
	ld (il_a),a
	ld hl,(il_ptr2)
	ld a,(il_a)
	or (hl)
	ld (hl),a
	pop af
	ld hl,(il_ptr)
	push hl
	ld hl,(il_hl)
	ret

; z80_sla_X: sla (IX+d). Ставит только CY (Z80 ставил ещё S,Z,P). A цел.
z80_sla_X:
	ld (il_a),a
	ld (il_hl),hl
	pop hl
	ld a,(hl)
	inc hl
	ld (il_ptr),hl
	ld hl,(z80_ix)
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld a,(hl)
	and a
	rla
	ld (hl),a
	ld a,(il_a)
	ld hl,(il_ptr)
	push hl
	ld hl,(il_hl)
	ret

; z80_srl_X: srl (IX+d). Ставит только CY (Z80 ставил ещё S,Z,P). A цел.
z80_srl_X:
	ld (il_a),a
	ld (il_hl),hl
	pop hl
	ld a,(hl)
	inc hl
	ld (il_ptr),hl
	ld hl,(z80_ix)
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld a,(hl)
	and a
	rra
	ld (hl),a
	ld a,(il_a)
	ld hl,(il_ptr)
	push hl
	ld hl,(il_hl)
	ret

; z80_sta_X: ld (IX+d),a. Флаги и A целы.
z80_sta_X:
	ld (il_a),a
	ld (il_hl),hl
	pop hl
	push af
	ld a,(hl)
	inc hl
	ld (il_ptr),hl
	ld hl,(z80_ix)
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld a,(il_a)
	ld (hl),a
	pop af
	ld hl,(il_ptr)
	push hl
	ld hl,(il_hl)
	ret

; z80_sta_Y: ld (IY+d),a. Флаги и A целы.
z80_sta_Y:
	ld (il_a),a
	ld (il_hl),hl
	pop hl
	push af
	ld a,(hl)
	inc hl
	ld (il_ptr),hl
	ld hl,(z80_iy)
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld a,(il_a)
	ld (hl),a
	pop af
	ld hl,(il_ptr)
	push hl
	ld hl,(il_hl)
	ret

; z80_stb_X: ld (IX+d),b. Флаги и A целы.
z80_stb_X:
	ld (il_hl),hl
	pop hl
	push af
	ld a,(hl)
	inc hl
	ld (il_ptr),hl
	ld hl,(z80_ix)
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld (hl),b
	pop af
	ld hl,(il_ptr)
	push hl
	ld hl,(il_hl)
	ret

; z80_stb_Y: ld (IY+d),b. Флаги и A целы.
z80_stb_Y:
	ld (il_hl),hl
	pop hl
	push af
	ld a,(hl)
	inc hl
	ld (il_ptr),hl
	ld hl,(z80_iy)
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld (hl),b
	pop af
	ld hl,(il_ptr)
	push hl
	ld hl,(il_hl)
	ret

; z80_stc_X: ld (IX+d),c. Флаги и A целы.
z80_stc_X:
	ld (il_hl),hl
	pop hl
	push af
	ld a,(hl)
	inc hl
	ld (il_ptr),hl
	ld hl,(z80_ix)
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld (hl),c
	pop af
	ld hl,(il_ptr)
	push hl
	ld hl,(il_hl)
	ret

; z80_std_X: ld (IX+d),d. Флаги и A целы.
z80_std_X:
	ld (il_hl),hl
	pop hl
	push af
	ld a,(hl)
	inc hl
	ld (il_ptr),hl
	ld hl,(z80_ix)
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld (hl),d
	pop af
	ld hl,(il_ptr)
	push hl
	ld hl,(il_hl)
	ret

; z80_std_Y: ld (IY+d),d. Флаги и A целы.
z80_std_Y:
	ld (il_hl),hl
	pop hl
	push af
	ld a,(hl)
	inc hl
	ld (il_ptr),hl
	ld hl,(z80_iy)
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld (hl),d
	pop af
	ld hl,(il_ptr)
	push hl
	ld hl,(il_hl)
	ret

; z80_ste_X: ld (IX+d),e. Флаги и A целы.
z80_ste_X:
	ld (il_hl),hl
	pop hl
	push af
	ld a,(hl)
	inc hl
	ld (il_ptr),hl
	ld hl,(z80_ix)
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld (hl),e
	pop af
	ld hl,(il_ptr)
	push hl
	ld hl,(il_hl)
	ret

; z80_ste_Y: ld (IY+d),e. Флаги и A целы.
z80_ste_Y:
	ld (il_hl),hl
	pop hl
	push af
	ld a,(hl)
	inc hl
	ld (il_ptr),hl
	ld hl,(z80_iy)
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld (hl),e
	pop af
	ld hl,(il_ptr)
	push hl
	ld hl,(il_hl)
	ret

; z80_sth_X: ld (IX+d),h. Флаги и A целы.
z80_sth_X:
	ld (il_hl),hl
	pop hl
	push af
	ld a,(hl)
	inc hl
	ld (il_ptr),hl
	ld hl,(z80_ix)
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld a,(il_hl+1)
	ld (hl),a
	pop af
	ld hl,(il_ptr)
	push hl
	ld hl,(il_hl)
	ret

; z80_sth_Y: ld (IY+d),h. Флаги и A целы.
z80_sth_Y:
	ld (il_hl),hl
	pop hl
	push af
	ld a,(hl)
	inc hl
	ld (il_ptr),hl
	ld hl,(z80_iy)
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld a,(il_hl+1)
	ld (hl),a
	pop af
	ld hl,(il_ptr)
	push hl
	ld hl,(il_hl)
	ret

; z80_stl_X: ld (IX+d),l. Флаги и A целы.
z80_stl_X:
	ld (il_hl),hl
	pop hl
	push af
	ld a,(hl)
	inc hl
	ld (il_ptr),hl
	ld hl,(z80_ix)
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld a,(il_hl)
	ld (hl),a
	pop af
	ld hl,(il_ptr)
	push hl
	ld hl,(il_hl)
	ret

; z80_stl_Y: ld (IY+d),l. Флаги и A целы.
z80_stl_Y:
	ld (il_hl),hl
	pop hl
	push af
	ld a,(hl)
	inc hl
	ld (il_ptr),hl
	ld hl,(z80_iy)
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld a,(il_hl)
	ld (hl),a
	pop af
	ld hl,(il_ptr)
	push hl
	ld hl,(il_hl)
	ret

; z80_stn_X: ld (IX+d),n — инлайн-байты d,n. Флаги и A целы.
z80_stn_X:
	ld (il_hl),hl
	pop hl
	push af
	ld a,(hl)
	inc hl
	ld (il_ptr),hl
	ld hl,(z80_ix)
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld (il_ptr2),hl
	ld hl,(il_ptr)
	ld a,(hl)
	inc hl
	ld (il_ptr),hl
	ld hl,(il_ptr2)
	ld (hl),a
	pop af
	ld hl,(il_ptr)
	push hl
	ld hl,(il_hl)
	ret

; z80_stn_Y: ld (IY+d),n — инлайн-байты d,n. Флаги и A целы.
z80_stn_Y:
	ld (il_hl),hl
	pop hl
	push af
	ld a,(hl)
	inc hl
	ld (il_ptr),hl
	ld hl,(z80_iy)
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld (il_ptr2),hl
	ld hl,(il_ptr)
	ld a,(hl)
	inc hl
	ld (il_ptr),hl
	ld hl,(il_ptr2)
	ld (hl),a
	pop af
	ld hl,(il_ptr)
	push hl
	ld hl,(il_hl)
	ret

; z80_sub_X: a sub (IX+d). Флаги от результата, BC/DE/HL целы.
z80_sub_X:
	ld (il_a),a
	ld (il_hl),hl
	pop hl
	ld a,(hl)
	inc hl
	ld (il_ptr),hl
	ld hl,(z80_ix)
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld a,(il_a)
	sub (hl)
	ld (il_a),a
	ld hl,(il_ptr)
	push hl
	ld hl,(il_hl)
	ld a,(il_a)
	ret

; z80_sub_Y: a sub (IY+d). Флаги от результата, BC/DE/HL целы.
z80_sub_Y:
	ld (il_a),a
	ld (il_hl),hl
	pop hl
	ld a,(hl)
	inc hl
	ld (il_ptr),hl
	ld hl,(z80_iy)
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld a,(il_a)
	sub (hl)
	ld (il_a),a
	ld hl,(il_ptr)
	push hl
	ld hl,(il_hl)
	ld a,(il_a)
	ret

; z80_xor_X: a xor (IX+d). Флаги от результата, BC/DE/HL целы.
z80_xor_X:
	ld (il_a),a
	ld (il_hl),hl
	pop hl
	ld a,(hl)
	inc hl
	ld (il_ptr),hl
	ld hl,(z80_ix)
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld a,(il_a)
	xor (hl)
	ld (il_a),a
	ld hl,(il_ptr)
	push hl
	ld hl,(il_hl)
	ld a,(il_a)
	ret

; z80_xor_Y: a xor (IY+d). Флаги от результата, BC/DE/HL целы.
z80_xor_Y:
	ld (il_a),a
	ld (il_hl),hl
	pop hl
	ld a,(hl)
	inc hl
	ld (il_ptr),hl
	ld hl,(z80_iy)
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld a,(il_a)
	xor (hl)
	ld (il_a),a
	ld hl,(il_ptr)
	push hl
	ld hl,(il_hl)
	ld a,(il_a)
	ret


; ---------------------------------------------------------------------------
; z80_ldhl_X / z80_ldhl_Y — HL := СЛОВО по (IX+d) / (IY+d), смещение инлайн-байтом.
; Заменяет ПАРУ вызовов вида ld l,(iy+d) / ld h,(iy+d+1): та стоила 2*218=436
; тактов, эта — 220. Замер: таких смежных пар в образе 12, из них пара
; (IY+$00,$01) исполняется 3.4 раза на тик.
; A, BC, DE и флаги целы; HL — результат, сохранять его незачем.
z80_ldhl_X:
	pop hl
	push af
	ld a,(hl)
	inc hl
	ld (il_ptr),hl
	ld hl,(z80_ix)
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld a,(hl)
	inc hl
	ld h,(hl)
	ld l,a
	ld (il_hl),hl
	pop af
	ld hl,(il_ptr)
	push hl
	ld hl,(il_hl)
	ret

; ---------------------------------------------------------------------------
; z80_ldhl_X / z80_ldhl_Y — HL := СЛОВО по (IX+d) / (IY+d), смещение инлайн-байтом.
; Заменяет ПАРУ вызовов вида ld l,(iy+d) / ld h,(iy+d+1): та стоила 2*218=436
; тактов, эта — 220. Замер: таких смежных пар в образе 12, из них пара
; (IY+$00,$01) исполняется 3.4 раза на тик.
; A, BC, DE и флаги целы; HL — результат, сохранять его незачем.
z80_ldhl_Y:
	pop hl
	push af
	ld a,(hl)
	inc hl
	ld (il_ptr),hl
	ld hl,(z80_iy)
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld a,(hl)
	inc hl
	ld h,(hl)
	ld l,a
	ld (il_hl),hl
	pop af
	ld hl,(il_ptr)
	push hl
	ld hl,(il_hl)
	ret

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
	IFDEF DETERMINISTIC
; ДЕТЕРМИНИРОВАННЫЙ режим (только под гейтами): ЛКГ s := 5*s+23 (mod 256),
; период ровно 256, значит and 7Fh даёт ноль ровно 2 раза за 256 вызовов = те же
; 1/128, что у семибитного R. Нужен потому, что аппаратный счётчик зависит от
; тактов, а наша сборка и эталон идут с разной скоростью — потиковая сверка с
; ним невозможна в принципе.
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
	ELSE
; БОЕВОЙ режим: свободно бегущий счётчик 0 ВИ53 (инициализация в scubacod0.asm).
; Управляющее слово 0x00 = защёлкнуть счётчик 0; читаем младший байт (он меняется
; с частотой 1.5 МГц, между двумя вызовами успевает провернуться), затем старший —
; чтобы снять защёлку. Портит только A, флаги ставит and, как LD A,R.
	ld hl,(il_hl)
	xor a
	out (8),a
	in a,(0Bh)
	ld (il_r),a
	in a,(0Bh)
	ld a,(il_r)
	rrca		; бит 0 счётчика бесполезен: ВИ53 тактуется вдвое реже CPU
	and 07Fh
	ret
	ENDIF

; ---------------------------------------------------------------------------
; z80_rrd — точная семантика Z80 RRD:
;   tmp=(HL); (HL) = ((A&0F)<<4) | (tmp>>4); A = (A&F0) | (tmp&0F)
; Флаги S,Z,P от нового A. CY на Z80 сохранялся, у нас — сбрасывается (or c).
; Используется в предсдвиге спрайта LB454 (замер: 8.9 исполнений на игровой тик).
z80_rrd:
; ЭТАП E.4. Упрощено с 177 тактов до 115 за счёт ДОКАЗАННОГО предусловия:
; в единственном месте вызова (LB454) в A лежит только ниббл-перенос 0..15 —
; цикл начинается с XOR A, а RRD оставляет A = (A&F0)|(tmp&0F), значит при A<16
; старший ниббл так и остаётся нулевым. Проверено прогоном: 24576 вызовов на
; трёх сценариях, максимум A на входе 15, нарушений ноль (гейт rrd_pre в наборе).
; Поэтому не нужны ни маска A&0F перед сдвигом, ни склейка старшего ниббла A.
; ЕСЛИ КОГДА-НИБУДЬ ПОЯВИТСЯ ВТОРОЕ МЕСТО ВЫЗОВА — предусловие рухнет, и сюда
; надо будет вернуть общий вариант (он в истории, коммит с этим текстом).
; Ниббл-таблица рассмотрена и ОТВЕРГНУТА расчётом: обращение к таблице стоит
; дороже, чем rlca/rrca по 4 такта — вариант с таблицей вышел 203 такта против 115.
	push bc
	ld c,a			; C = входной ниббл (0..15)
	ld a,(hl)
	ld b,a			; B = tmp
	ld a,c
	rlca
	rlca
	rlca
	rlca			; A = ниббл<<4
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
	and 00Fh		; новый A = tmp&0F (старший ниббл входного A был нулевой)
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
il_scr:		defw 0		; указатель экрана в переписанном цикле блита LB500
il_a:		defb 0		; сохранённый/рабочий A
il_r:		defb 0		; состояние ГПСЧ вместо регистра R

; ============================================================================
; СПЕЦИАЛИЗИРОВАННЫЕ ИНДЕКСНЫЕ ХЕЛПЕРЫ — СГЕНЕРИРОВАНЫ tools/genspec.py.
; Руками не править: правь генератор и перезапускай его.
; Смещение зашито в точку входа, поэтому не нужен разбор потока команд по
; адресу возврата (58 тактов на вызов), а при d <= 6 не нужно и сохранение
; флагов: LHLD, INX и MOV A,M на i8080 флагов не трогают.
; ============================================================================
z80_bitX_13:
	ld (il_a),a
	ld (il_hl),hl
	ld hl,(z80_ix)
	ld a,13
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld a,(hl)
	ld hl,(il_hl)
	ret
z80_bitX_17:
	ld (il_a),a
	ld (il_hl),hl
	ld hl,(z80_ix)
	ld a,17
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld a,(hl)
	ld hl,(il_hl)
	ret
z80_lda_X_2:
	ld (il_hl),hl
	ld hl,(z80_ix)
	inc hl
	inc hl
	ld a,(hl)
	ld hl,(il_hl)
	ret
z80_lda_X_3:
	ld (il_hl),hl
	ld hl,(z80_ix)
	inc hl
	inc hl
	inc hl
	ld a,(hl)
	ld hl,(il_hl)
	ret
z80_lda_X_13:
	ld (il_hl),hl
	push af
	ld hl,(z80_ix)
	ld a,13
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld a,(hl)
	ld (il_a),a
	pop af
	ld a,(il_a)
	ld hl,(il_hl)
	ret
z80_ldb_Y_14:
	ld (il_hl),hl
	push af
	ld hl,(z80_iy)
	ld a,14
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld b,(hl)
	pop af
	ld hl,(il_hl)
	ret
z80_sta_Y_1:
	ld (il_hl),hl
	ld hl,(z80_iy)
	inc hl
	ld (hl),a
	ld hl,(il_hl)
	ret
z80_sta_Y_3:
	ld (il_hl),hl
	ld hl,(z80_iy)
	inc hl
	inc hl
	inc hl
	ld (hl),a
	ld hl,(il_hl)
	ret
z80_sta_Y_7:
	ld (il_a),a
	ld (il_hl),hl
	push af
	ld hl,(z80_iy)
	ld a,7
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld a,(il_a)
	ld (hl),a
	pop af
	ld hl,(il_hl)
	ret
