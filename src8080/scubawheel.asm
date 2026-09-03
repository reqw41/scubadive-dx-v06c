; =====================================================================
; WHEEL — КОЛЕСО ТАЙМЕРОВ для обходов групп I, II, III (2026-09-03).
;
; Было: скан группы = декремент счётчика +$0F у КАЖДОЙ записи (30 тактов на
; запись, на ур.4 группы I+II — 81 запись ≈ 2900 тактов/тик), а до нуля
; досчитывают ~3,4 записи за тик. Стало: у записи в +$0F лежит СРОК (номер
; скана группы, на котором она сработает), часы группы C считают сканы, записи
; разложены по WH_NB корзинам (срок & (WH_NB-1)) списками, отсортированными по
; индексу. Скан: C += 1, обход одной корзины, срабатывают те, у кого срок == C —
; в порядке списка, то есть по индексу, как у линейного обхода. Перезарядка в
; LB737+17: срок := C + период (по СТАРОМУ периоду — двигатель меняет +$0E уже
; после). События LE8FA/LE97C (счётчик := n) идут через WH_event.
; Спецификация и доказательство эквивалентности: tools/verify/wheel_spec.py.
; Условия корректности — docs/archive/node_timer_wheel.md.
;
; ПАМЯТЬ: головы корзин и часы — в голове бута 0x0100.., мёртвой после старта
; (RestartInt лежит выше — ASSERT); next[] групп I и II — на месте распаковщика
; dzx0 (после старта не нужен); next[] группы III — здесь. Группы IV и V
; (LC431) остаются линейными: LB737 отличает вызов из колеса по wh_grp.
; =====================================================================
WH_NB		EQU 16
WH_HEADS	EQU 0100h		; 3 группы × WH_NB голов
WH_CLKS		EQU WH_HEADS+3*WH_NB	; 3 байта часов
WH_NEXT_I	EQU dzx0		; 51 индекс
WH_NEXT_II	EQU dzx0+51	; 31 индекс
	ASSERT WH_CLKS+3 <= RestartInt
	ASSERT WH_NEXT_II+31 <= snd_start
	ASSERT HIGH (WH_HEADS+3*WH_NB-1) = HIGH WH_HEADS	; головы в одной странице: add a,l без переноса
WH_NEXT_III:	DS 50
wh_baseI:	DEFW LC4F0
; Дескриптор группы: ptr к слову базы, шаг, ptr к N, next[], головы, часы, бит dirty
WH_TAB_I:	DEFW wh_baseI
		DEFB 21
		DEFW NumRecsI
		DEFW WH_NEXT_I
		DEFW WH_HEADS
		DEFW WH_CLKS
		DEFB 1
WH_TAB_II:	DEFW RecsAddrII
		DEFB 26
		DEFW NumRecsII
		DEFW WH_NEXT_II
		DEFW WH_HEADS+WH_NB
		DEFW WH_CLKS+1
		DEFB 2
WH_TAB_III:	DEFW RecsAddrIII
		DEFB 26
		DEFW NumRecsIII
		DEFW WH_NEXT_III
		DEFW WH_HEADS+2*WH_NB
		DEFW WH_CLKS+2
		DEFB 4
wh_base:	DEFW 0
wh_stride:	DEFB 0
wh_n:		DEFB 0
wh_nextp:	DEFW 0
wh_headp:	DEFW 0
wh_clkp:	DEFW 0
wh_mask:	DEFB 0
wh_C:		DEFB 0			; часы текущей группы (копия)
wh_grp:		DEFB 0			; ≠0 — LB737 вызван из колеса: +$0F := C + период
wh_cur:		DEFB 0
wh_i:		DEFB 0
wh_slot:	DEFW 0
wh_fire:	DEFB 0FFh
wh_ftail:	DEFW 0
wh_fnext:	DEFB 0
wh_dirty:	DEFB 7			; биты групп, которым нужно перестроение; InitLevelVars ставит 7
wh_evn:		DEFB 0

; --- WH_load: HL = дескриптор -> рабочие ячейки ------------------------------
WH_load:
	ld e,(hl)
	inc hl
	ld d,(hl)
	inc hl
	push hl
	ex de,hl
	ld e,(hl)
	inc hl
	ld d,(hl)
	ex de,hl
	ld (wh_base),hl
	pop hl
	ld a,(hl)
	ld (wh_stride),a
	inc hl
	ld e,(hl)
	inc hl
	ld d,(hl)
	inc hl
	ld a,(de)
	ld (wh_n),a
	ld e,(hl)
	inc hl
	ld d,(hl)
	inc hl
	ex de,hl
	ld (wh_nextp),hl
	ex de,hl
	ld e,(hl)
	inc hl
	ld d,(hl)
	inc hl
	ex de,hl
	ld (wh_headp),hl
	ex de,hl
	ld e,(hl)
	inc hl
	ld d,(hl)
	inc hl
	ld a,(hl)
	ld (wh_mask),a
	ex de,hl
	ld (wh_clkp),hl
	ld a,(hl)
	ld (wh_C),a
	ret

; --- WH_addr: A = индекс -> HL = адрес записи (base + i*шаг) -----------------
WH_addr:
	ld e,a
	ld d,0
	ld l,a
	ld h,d
	add hl,hl
	add hl,hl		; 4i
	ld a,(wh_stride)
	cp 21
	jp nz,WH_addr26
	add hl,de		; 5i
	add hl,hl
	add hl,hl		; 20i
	add hl,de		; 21i
	jp WH_addr_b
WH_addr26:
	add hl,de		; 5i
	add hl,hl		; 10i
	add hl,de
	add hl,de
	add hl,de		; 13i
	add hl,hl		; 26i
WH_addr_b:
	ex de,hl
	ld hl,(wh_base)
	add hl,de
	ret

; --- WH_nextp_: A = индекс -> HL = &next[i] -----------------------------------
WH_nextp_:
	ld hl,(wh_nextp)
	add a,l
	ld l,a
	ld a,h
	adc a,0
	ld h,a
	ret

; --- WH_insert: A = индекс; срок берётся из +$0F записи; вставка по индексу ---
WH_insert:
	ld (wh_cur),a
	call WH_addr
	ld de,000Fh
	add hl,de
	ld a,(hl)		; срок
	and WH_NB-1
	ld hl,(wh_headp)
	add a,l
	ld l,a			; HL = слот (голова корзины)
WH_ins_loop:
	ld a,(hl)		; cur
	cp 0FFh
	jp z,WH_ins_here
	ld b,a
	ld a,(wh_cur)
	cp b
	jp c,WH_ins_here	; i < cur — вставить перед ним
	ld a,b
	call WH_nextp_		; следующий слот — &next[cur]
	jp WH_ins_loop
WH_ins_here:
	ld b,(hl)		; cur или FF
	ld a,(wh_cur)
	ld (hl),a		; слот := i
	call WH_nextp_
	ld (hl),b		; next[i] := cur
	ret

; --- WH_build: разложить группу по корзинам из текущих +$0F (часы := 0) ------
WH_build:
	ld hl,(wh_clkp)
	ld (hl),0
	xor a
	ld (wh_C),a
	ld hl,(wh_headp)
	ld b,WH_NB
WH_b_h:
	ld (hl),0FFh
	inc hl
	dec b
	jp nz,WH_b_h
	ld a,(wh_n)
	or a
	ret z
	xor a
WH_b_loop:
	ld (wh_i),a
	call WH_insert
	ld a,(wh_i)
	inc a
	ld b,a
	ld a,(wh_n)
	cp b
	ld a,b
	jp nz,WH_b_loop
	ret

; --- WH_scan: HL = дескриптор группы. Заменяет LBE9A/LBE40/LBE6D --------------
WH_scan:
	call WH_load
	ld a,(wh_dirty)
	ld b,a
	ld a,(wh_mask)
	and b
	jp z,WH_scan_go
	cpl
	and b
	ld (wh_dirty),a
	call WH_build
WH_scan_go:
	ld hl,(wh_clkp)
	inc (hl)
	ld a,(hl)
	ld (wh_C),a
	and WH_NB-1
	ld hl,(wh_headp)
	add a,l
	ld l,a
	ld (wh_slot),hl
	ld a,0FFh
	ld (wh_fire),a
	ld hl,wh_fire
	ld (wh_ftail),hl
; проход 1: снять сработавшие из корзины в цепочку огня (порядок списка = по индексу)
WH_s1:
	ld hl,(wh_slot)
	ld a,(hl)
	cp 0FFh
	jp z,WH_s2
	ld (wh_cur),a
	call WH_addr
	ld de,000Fh
	add hl,de
	ld a,(wh_C)
	cp (hl)
	jp nz,WH_s1_keep
	ld a,(wh_cur)
	call WH_nextp_		; HL = &next[cur]
	ld a,(hl)
	push hl
	ld hl,(wh_slot)
	ld (hl),a		; слот := next[cur] (слот не двигается)
	ld hl,(wh_ftail)
	ld a,(wh_cur)
	ld (hl),a		; хвост цепочки := cur
	pop hl
	ld (wh_ftail),hl	; новый хвост — &next[cur]
	ld (hl),0FFh
	jp WH_s1
WH_s1_keep:
	ld a,(wh_cur)
	call WH_nextp_
	ld (wh_slot),hl
	jp WH_s1
; проход 2: сработать по цепочке, перезарядить (LB737+17 пишет срок), вернуть в корзину
WH_s2:
	ld a,(wh_fire)
WH_s2_loop:
	cp 0FFh
	ret z
	ld (wh_cur),a
	call WH_nextp_
	ld a,(hl)
	ld (wh_fnext),a		; следующий — до того, как вставка перепишет next[cur]
	ld a,(wh_cur)
	call WH_addr
	ld (z80_ix),hl
	ld a,1
	ld (wh_grp),a
	CALL LB737
	xor a
	ld (wh_grp),a
	ld a,(wh_cur)
	call WH_insert
	ld a,(wh_fnext)
	jp WH_s2_loop

; --- WH_event: A = n; запись z80_ix получает счётчик n (было: (IX+$0F) := n) ---
WH_event:
	ld (wh_evn),a
	ld hl,WH_TAB_I
	call WH_ev_try
	ld hl,WH_TAB_II
	call WH_ev_try
	ld hl,WH_TAB_III
	call WH_ev_try
	ld hl,(z80_ix)		; не наша группа (IV/V): счётчик, как раньше
	ld de,000Fh
	add hl,de
	ld a,(wh_evn)
	ld (hl),a
	ret
WH_ev_try:
	call WH_load
	ld a,(wh_dirty)
	ld b,a
	ld a,(wh_mask)
	and b
	ret nz			; группа ещё не построена (инициализация уровня): обычная запись счётчика
	ld hl,(z80_ix)
	ex de,hl
	ld hl,(wh_base)
	ld a,e
	sub l
	ld c,a
	ld a,d
	sbc a,h
	ld b,a			; BC = ix - base
	ret c
	xor a
	ld (wh_cur),a
WH_ev_div:
	ld a,c
	or b
	jp z,WH_ev_found	; остаток 0 — индекс в wh_cur
	ld a,(wh_stride)
	ld e,a
	ld a,c
	sub e
	ld c,a
	ld a,b
	sbc a,0
	ld b,a
	ret c			; не кратно шагу — не эта группа
	ld a,(wh_cur)
	inc a
	ld (wh_cur),a
	jp WH_ev_div
WH_ev_found:
	ld a,(wh_cur)
	ld b,a
	ld a,(wh_n)
	cp b
	ret c
	ret z			; индекс >= N — не эта группа
	pop hl			; выходим из WH_event сами
	ld a,(wh_cur)
	call WH_addr
	ld de,000Fh
	add hl,de
	push hl			; адрес +$0F
	ld a,(hl)
	and WH_NB-1
	ld hl,(wh_headp)
	add a,l
	ld l,a			; слот
WH_ev_unl:
	ld a,(hl)
	cp 0FFh
	jp z,WH_ev_set		; в корзине нет (не должно быть) — просто переставить срок
	ld b,a
	ld a,(wh_cur)
	cp b
	jp z,WH_ev_unl2
	ld a,b
	call WH_nextp_
	jp WH_ev_unl
WH_ev_unl2:
	push hl
	ld a,(wh_cur)
	call WH_nextp_
	ld a,(hl)
	pop hl
	ld (hl),a		; слот := next[i]
WH_ev_set:
	pop hl			; адрес +$0F
	ld a,(wh_C)
	ld b,a
	ld a,(wh_evn)
	add a,b
	ld (hl),a		; срок := C + n
	ld a,(wh_cur)
	jp WH_insert
