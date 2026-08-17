; splash_starter.asm — заставка Scuba Dive: картинка + марш Men of Harlech,
; потом штатный старт игры. Архитектурный донор — KV, ветка cas-version
; (src/cas/splash_starter.asm): ППА 0x88, палитра В ГАШЕНИИ, первое прерывание
; холостое, возврат первых трёх байт игры перед прыжком на 0x0100.
;
; Раскладка .rom: [0x0100 jp splash + образ игры][0x5500 этот код и ноты]
;                 [0x8000 плоскости заставки — их кладёт в видеопамять сам
;                  загрузчик ядра, распаковывать нечего].
; Игровой образ внутри файла НЕ ИЗМЕНЁН, кроме трёх первых байт, которые
; стартер возвращает на место перед прыжком (гейт сверяет md5 остального).
;
; Звук: три голоса на трёх каналах ВИ53 — в заставке игра не работает, свободны
; все. Управляющее слово в порт 0x08, счётчики 0/1/2 в портах 0x0B/0x0A/0x09.
; Режим 3 (меандр) для ноты, режим 0 для паузы: выход уходит в ноль и молчит.
; ДЕЛИТЕЛЬ 0 В ПОРТ НЕ ВЫДАЁТСЯ НИКОГДА — на MiSTer счётчик с нулём не стартует;
; таблица делителей построена офлайн и нуля не содержит по построению.

	org 0x5500

SPL_STACK	equ 0x7E00
GAME		equ 0x0100

splash:
	di
	ld sp,SPL_STACK
	ld a,0x88		; ППА: порт B выходом (урок железа из KV)
	out (0),a
	ld a,0xC3		; RST7 -> jp isr_skip
	ld (0x38),a
	ld hl,isr_skip
	ld (0x39),hl
; голоса: указатель, счётчик кадров, порт счётчика, слово режима 3, слово режима 0
	ld hl,spl_v0
	ld (v0),hl
	ld hl,spl_v1
	ld (v1),hl
	ld hl,spl_v2
	ld (v2),hl
	xor a
	ld (v0+2),a
	ld (v1+2),a
	ld (v2+2),a
	ld (paldone),a
	ld (ended),a
	ei
spl_loop:
	halt
	call chkkey		; клавиша или кнопка джойстика?
	or a
	jp nz,spl_quit
	ld a,(ended)
	cp 3			; все три голоса доиграли?
	jp c,spl_loop
spl_quit:
	di
	call snd_off
; вернуть игре её первые три байта и стартовать
	ld hl,orig3
	ld de,GAME
	ld a,(hl)
	ld (de),a
	inc hl
	inc de
	ld a,(hl)
	ld (de),a
	inc hl
	inc de
	ld a,(hl)
	ld (de),a
	jp GAME

; --- опрос клавиатуры и джойстика -------------------------------------------
; Возврат: A=0 ничего не нажато. Порт 3 — он же регистр вертикального скролла,
; поэтому после скана его СРАЗУ возвращаем в 0xFF (иначе картинка уедет).
chkkey:
; ППА: порт B надо на ВРЕМЯ СКАНА переключить на ВВОД. При 0x88 (порт B выходом,
; как требует видеорежим) чтение порта 2 возвращает защёлку вывода — ноль, то
; есть «нажато всё сразу», и заставка проскакивала мгновенно. Игра в KEYINT
; делает ровно так же: 0x8A на скан, 0x88 обратно.
	ld a,0x8A
	out (0),a
	xor a
	out (3),a		; выбрать все ряды матрицы
	in a,(2)
	ld b,a
	ld a,0xFF
	out (3),a		; вернуть скролл немедленно
	ld a,0x88
	out (0),a		; порт B обратно на вывод (иначе на железе всплывает mode512)
	ld a,b
	cpl			; активный ноль -> активная единица
	or a
	ret nz
	in a,(0x0E)		; штатный джойстик Вектора
	cpl
	and 0xC0		; только кнопки Fire1/Fire2
	ret

; --- прерывание --------------------------------------------------------------
isr_skip:			; первое прерывание холостое (урок KV)
	ld hl,isr
	ld (0x39),hl
	ei
	ret

isr:
	push af
	push bc
	push de
	push hl
	ld a,0xFF
	out (3),a		; скролл
	ld a,(paldone)
	or a
	jp nz,isr_snd
	inc a
	ld (paldone),a
; ПАЛИТРА ПИШЕТСЯ В ГАШЕНИИ: мы здесь сразу после прерывания кадра, то есть в
; вертикальном гасящем ходе — ровно то место, где ядро MiSTer защёлкивает слот
; по выводимому цвету. Вне гашения палитра защёлкивается не туда.
	ld hl,pal+15
	ld de,0x100F
ploop:
	ld a,e
	out (2),a
	ld a,(hl)
	out (0x0C),a
	out (0x0C),a
	out (0x0C),a
	out (0x0C),a
	out (0x0C),a
	dec hl
	out (0x0C),a
	dec e
	out (0x0C),a
	dec d
	out (0x0C),a
	jp nz,ploop
	xor a
	out (2),a
isr_snd:
	ld hl,v0
	call tick
	ld hl,v1
	call tick
	ld hl,v2
	call tick
	pop hl
	pop de
	pop bc
	pop af
	ei
	ret

; --- один шаг голоса ---------------------------------------------------------
; HL -> дескриптор: +0 указатель ноты (2), +2 счётчик кадров, +3 порт счётчика,
;                   +4 слово режима 3, +5 слово режима 0
tick:
	ld (tk_desc),hl
	ld de,2
	add hl,de		; -> счётчик кадров
	ld a,(hl)
	or a
	jp z,tk_next
	dec a
	ld (hl),a
	ret
tk_next:
	ld hl,(tk_desc)
	ld e,(hl)
	inc hl
	ld d,(hl)		; DE = указатель ноты
	ld a,(de)
	inc de
	cp 0xFF
	jp z,tk_end
	ld (tk_note),a
	ld hl,(tk_desc)		; сохранить продвинутый указатель
	ld (hl),e
	inc hl
	ld (hl),d
; длительность: (байт>>5)+1 восьмых, восьмая = 12 кадров
	ld a,(tk_note)
	rlca
	rlca
	rlca
	and 0x07
	inc a
	ld e,a
	xor a
tk_mul:
	add a,12
	dec e
	jp nz,tk_mul
	dec a			; счётчик считает до нуля включительно
	ld hl,(tk_desc)
	ld de,2
	add hl,de
	ld (hl),a		; счётчик кадров
	inc hl
	ld a,(hl)
	ld (tk_port),a
	inc hl
	ld a,(hl)
	ld (tk_m3),a
	inc hl
	ld a,(hl)
	ld (tk_m0),a
; высота
	ld a,(tk_note)
	and 0x1F
	cp 31
	jp z,tk_rest
	ld l,a
	ld h,0
	add hl,hl		; индекс * 2
	ld de,spl_div
	add hl,de
	ld a,(tk_m3)
	out (8),a		; режим 3 (меандр) для своего канала
	ld a,(hl)
	call outc		; младший байт делителя
	inc hl
	ld a,(hl)
	call outc		; старший
	ret
tk_rest:
	ld a,(tk_m0)
	out (8),a		; режим 0 — выход в ноль, канал молчит
	xor a
	call outc
	xor a
	call outc
	ret
tk_end:
	ld hl,(tk_desc)
	ld de,3
	add hl,de
	ld a,(hl)
	ld (tk_port),a
	inc hl
	inc hl
	ld a,(hl)		; слово режима 0
	out (8),a
	xor a
	call outc
	xor a
	call outc
	ld hl,ended
	inc (hl)
	ret

; Вывод A в порт, номер которого в ячейке tk_port. На i8080 команды out (c),a
; нет, поэтому номер порта подставляется самомодификацией.
outc:
	ld (outc_v+1),a
	ld a,(tk_port)
	ld (outc_i+1),a
outc_v:
	ld a,0
outc_i:
	out (0),a
	ret

tk_desc:	defw 0
tk_note:	defb 0
tk_port:	defb 0
tk_m3:		defb 0
tk_m0:		defb 0


; Выключить все три канала: режим 0 с нулевым счётом — выход уходит в ноль и
; там остаётся. Нулевой ДЕЛИТЕЛЬ в режиме 3 не выдаётся никогда (на MiSTer такой
; счётчик не стартует), а в режиме 0 это штатная тишина.
snd_off:
	ld a,0x30
	out (8),a
	xor a
	out (0x0B),a
	out (0x0B),a
	ld a,0x70
	out (8),a
	xor a
	out (0x0A),a
	out (0x0A),a
	ld a,0xB0
	out (8),a
	xor a
	out (9),a
	out (9),a
	ret

; --- дескрипторы голосов -----------------------------------------------------
v0:	defw 0
	defb 0
	defb 0x0B, 0x36, 0x30	; канал 0: порт 0x0B, режим 3 / режим 0
v1:	defw 0
	defb 0
	defb 0x0A, 0x76, 0x70	; канал 1
v2:	defw 0
	defb 0
	defb 0x09, 0xB6, 0xB0	; канал 2

paldone:	defb 0
ended:		defb 0

pal:
	INCBIN "splash_pal.bin"
orig3:
	INCBIN "orig3.bin"

	INCLUDE "splash_music.asm"
