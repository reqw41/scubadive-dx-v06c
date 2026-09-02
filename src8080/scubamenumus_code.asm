	IFDEF MENUMUS
; =====================================================================
; МАРШ В СТАРТОВОМ МЕНЮ (-DMENUMUS)
;
; На заставке этот же марш играет проигрыватель стартера, но он живёт по 0x5500
; и умирает вместе со стартером: распакованный образ игры занимает эту память.
; Здесь плеер и ноты лежат ВНУТРИ образа, поэтому ноты упакованы вызовом
; фрагмента (tools/music/packmarch.py, формат — в его шапке).
;
; ГДЕ ИДЁТ ШАГ. Раз в кадр из KEYINT, рядом с snd_tick — тем же порядком, каким
; в игре двигается штатная мелодия. Игровой тик от этого не растёт: в меню
; главный цикл игры не работает вовсе.
;
; КАНАЛЫ. В меню свободны все три канала ВИ53 (штатный драйвер молчит: snd_ptr=0
; и snd_tick выходит сразу). При старте игры mm_stop возвращает их в режим 0 —
; иначе канал 2, на котором играет игровая мелодия, остался бы занят меандром.
;
; ТОЛЬКО ВИ53, БЕЗ AY — решение владельца 2026-09-02. AY есть не на всякой
; машине, и путь под него стоил и определения при заводе, и второй таблицы
; периодов, и ветки в каждой ноте. Главное же — заставка и меню звучали бы
; разным тембром на машинах с AY и одинаковым на машинах без него. Один
; аппарат на оба экрана проще и предсказуемее; заставка тоже переведена на ВИ53.
; =====================================================================

; --- дескриптор голоса -------------------------------------------------------
;  +0 указатель ноты (2)      +5 порт ВИ53
;  +2 счётчик кадров          +6 управляющее слово, режим 3 (меандр)
;  +3 адрес возврата (2)      +7 управляющее слово, режим 0 (молчание)
MM_LEN	EQU 8

mm_v0:	defw 0
	defb 0
	defw 0
	defb 00Bh, 036h, 030h		; мелодия:  ВИ53 канал 0
mm_v1:	defw 0
	defb 0
	defw 0
	defb 00Ah, 076h, 070h		; бас:      ВИ53 канал 1
mm_v2:	defw 0
	defb 0
	defw 0
	defb 009h, 0B6h, 0B0h		; гармония: ВИ53 канал 2

mm_on:		defb 0		; 1 — марш играет
mm_desc:	defw 0		; текущий дескриптор
mm_note:	defb 0		; текущий байт ноты
mm_ended:	defb 0		; сколько голосов доиграло

; --- завести марш ------------------------------------------------------------
; Портит всё. Зовётся при входе в меню.
; ЗАВОД ИДЕМПОТЕНТЕН, И ЭТО НЕ ПЕРЕСТРАХОВКА: LEE1C — не только вход в меню, но
; и точка возврата в его цикл (`jp z,LEE1C`, когда нажата не та клавиша). Без
; этой проверки марш начинался бы заново на каждое нажатие.
mm_init:
	ld a,(mm_on)
	or a
	ret nz
	ld hl,mm_melody
	ld (mm_v0),hl
	ld hl,mm_bass
	ld (mm_v1),hl
	ld hl,mm_harm
	ld (mm_v2),hl
	xor a
	ld (mm_v0+2),a
	ld (mm_v1+2),a
	ld (mm_v2+2),a
	ld (mm_ended),a
	ld a,1
	ld (mm_on),a
	ld hl,mm_tick
	ld (mm_hook),hl		; с этого кадра бут зовёт наш шаг
	ret

; --- замолчать и отпустить каналы -------------------------------------------
mm_stop:
	xor a
	ld (mm_on),a
	ld hl,0
	ld (mm_hook),hl		; бут больше не зовёт шаг
	ld hl,mm_v0
	ld b,3
mm_stop_1:
	push bc
	push hl
	ld de,7
	add hl,de
	ld a,(hl)		; управляющее слово режима 0
	out (8),a
	pop hl
	push hl
	ld de,5
	add hl,de
	ld a,(hl)
	ld (mm_outp+1),a	; порт своего канала
	xor a
	call mm_out
	xor a
	call mm_out
	pop hl
	ld de,MM_LEN
	add hl,de
	pop bc
	dec b
	jp nz,mm_stop_1
	ret
; --- шаг раз в кадр ----------------------------------------------------------
mm_tick:
	ld a,(mm_on)
	or a
	ret z
	ld hl,mm_v0
	call mm_voice
	ld hl,mm_v1
	call mm_voice
	ld hl,mm_v2
	call mm_voice
	ld a,(mm_ended)
	cp 3
	ret nz
	jp mm_stop		; все три голоса доиграли

; --- один голос --------------------------------------------------------------
; I: HL = дескриптор.
mm_voice:
	ld (mm_desc),hl
	push hl
	ld de,2
	add hl,de
	ld a,(hl)
	or a
	jp z,mm_next
	dec a
	ld (hl),a		; ещё держим прежнюю ноту
	pop hl
	ret
mm_next:
	pop hl
	ld e,(hl)
	inc hl
	ld d,(hl)		; DE = указатель ноты
	ld a,d
	or e
	ret z			; голос уже кончился
mm_fetch:
	ld a,(de)
	inc de
	cp 0FEh
	jp z,mm_ret
	cp 0FFh
	jp z,mm_call
	ld (mm_note),a
	jp mm_play

; 0FEh — возврат из фрагмента: продолжаем с сохранённого адреса
mm_ret:
	ld hl,(mm_desc)
	ld de,3
	add hl,de
	ld e,(hl)
	inc hl
	ld d,(hl)		; DE = адрес возврата
	jp mm_fetch

; 0FFh мл ст — вызов фрагмента; адрес 0 означает конец голоса
mm_call:
	ld a,(de)
	inc de
	ld c,a
	ld a,(de)
	inc de
	ld b,a			; BC = адрес фрагмента
	ld a,b
	or c
	jp z,mm_end
; DE уже стоит на байте ЗА вызовом — это и есть адрес возврата.
	ld hl,(mm_desc)
	push bc
	ld bc,3
	add hl,bc
	pop bc
	ld (hl),e
	inc hl
	ld (hl),d
	ld d,b
	ld e,c			; DE = фрагмент
	jp mm_fetch

mm_end:
	ld hl,(mm_desc)
	xor a
	ld (hl),a
	inc hl
	ld (hl),a		; указатель 0 — голос молчит
	ld a,(mm_ended)
	inc a
	ld (mm_ended),a
	ret

; --- сыграть ноту из mm_note, указатель в DE ---------------------------------
mm_play:
	ld hl,(mm_desc)		; сохранить продвинутый указатель
	ld (hl),e
	inc hl
	ld (hl),d
; длительность: (байт>>5)+1 восьмых, восьмая = 12 кадров
	ld a,(mm_note)
	rlca
	rlca
	rlca
	and 007h
	inc a
	ld e,a
	xor a
mm_mul:
	add a,12
	dec e
	jp nz,mm_mul
	dec a			; счётчик считает до нуля включительно
	ld hl,(mm_desc)
	ld de,2
	add hl,de
	ld (hl),a
; поля устройства
	ld hl,(mm_desc)
	ld de,5
	add hl,de
	ld a,(hl)
	ld (mm_outp+1),a	; порт ВИ53
	inc hl
	ld a,(hl)
	ld (mm_m3),a
; высота
	ld a,(mm_note)
	and 01Fh
	cp 31
	jp z,mm_rest
	ld l,a
	ld h,0
	add hl,hl		; индекс * 2
	ld de,mm_div
	add hl,de
	ld a,(mm_m3)
	out (8),a		; режим 3 (меандр) на своём канале
	ld a,(hl)
	call mm_out
	inc hl
	ld a,(hl)
	jp mm_out
; пауза: канал в режим 0 — выход уходит в ноль и там остаётся
mm_rest:
	ld hl,(mm_desc)
	ld de,7
	add hl,de
	ld a,(hl)
	out (8),a
	xor a
	call mm_out
	xor a
	jp mm_out
; --- вывод байта в свой канал ВИ53 (порт подставляется операндом) ------------
mm_out:
	ld (mm_outv+1),a
mm_outv:
	ld a,0
mm_outp:
	out (0),a		; операнд ставит mm_play
	ret

mm_m3:		defb 0
	ENDIF
