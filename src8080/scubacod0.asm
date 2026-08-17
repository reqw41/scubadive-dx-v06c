;----------------------------------------------------------------------------

	EXPORT KeyLineEx
	EXPORT KeyLine0
	EXPORT KeyLine2
	EXPORT KeyLine7
	EXPORT JoystickP
	EXPORT JoystickE
	EXPORT BorderColor
	EXPORT FRAMES
	EXPORT dzx0
	EXPORT snd_start
	EXPORT snd_stop
	EXPORT SCUBACOD0_END

;----------------------------------------------------------------------------

	OUTPUT "scubacod0.bin"
	ORG	100h

	di
	xor a
	out (10h),a		; turn off the quasi-disk
	ld sp,0100h
	ld hl,0C3F3h
	ld (0),hl
	ld a,h
	ld hl,RestartInt
	ld (2),hl
	ld (38h),a
	ld hl,KEYINT		; interrupt handler address
	ld (38h+1),hl

	call SetPaletteGame
	di

; Decompress 16K of the title screen from SCUBACOD0_END+LZSIZE1 to C000h
	ld de,SCUBACOD0_END+LZSIZE1	; source addr
	ld bc,0C000h		; destination addr
	call dzx0

; Move encoded block from SCUBACOD0_END to C000h-LZSIZE1, LZSIZE1 bytes
	ld de,SCUBACOD0_END	; source addr
	ld bc,0C000h-LZSIZE1	; destination addr
	ld hl,LZSIZE1		; size
	inc h
Init_1:
	ld a,(de)
	inc de
	ld (bc),a
	inc bc
	dec l
	jp NZ,Init_1
	dec h
	jp NZ,Init_1
; Decompress the code and sprites from C000h-LZSIZE1 to SCUBACOD0_END
	ld de,0C000h-LZSIZE1	; source addr
	ld bc,SCUBACOD0_END	; destination addr
	call dzx0

RestartInt:
	ld sp,100h
	ld a,88h
	out (4),a		; initialize R-Sound 2
; Joystick init
	ld a,83h		; control byte
	out (4),a		; initialize the I/O controller
	ld a,9Fh		; bits to check Joystick-P, both P1 and P2
	out (5),a		; set Joystick-P query bits
	in a,(6)		; read Joystick-P initial value
	ld (KEYINT_J+1),a	; store as xra instruction parameter

; Start SCUBACOD1
	jp SCUBACOD0_END

; Set game palette
SetPaletteGame:
	ld hl,PaletteGame+15
; Programming the Palette
SetPalette:
	ei
	halt
	ld de,100Fh
PaletLoop:
	ld a,e
	out (2),a
	ld a,(hl)
	out (0Ch),a
	out (0Ch),a
	out (0Ch),a
	out (0Ch),a
	out (0Ch),a
	dec hl
	out (0Ch),a
	dec e
	out (0Ch),a
	dec d
	out (0Ch),a
	jp nz,PaletLoop
	ret

;----------------------------------------------------------------------------

KEYINT:
	push af
	push hl
	ld a,8Ah
	out (0),a
; Keyboard scan
	in A,(1)
	or 00011111b
	ld (KeyLineEx),a
	ld a,0FEh
	out (3),a
	in A,(2)
	ld (KeyLine0),a
	ld a,0FBh
	out (3),a
	in A,(2)
	ld (KeyLine2),a
	ld a,07Fh
	out (3),A
	in A,(2)
	ld (KeyLine7),A
; Joystick scan
	in A,(6)		; read Joystick-P
KEYINT_J:
	xor 0			; XOR with initial value - mutable param!
	cpl
	ld (JoystickP),A	; save to analyze later
; Штатный джойстик Вектора-06Ц: отдельная микросхема, порт 0x0E, PPI-инициализации
; не требует. Байт active-low ровно в том порядке, в каком его ждёт
; DecodeKeyboard_map: b0=Rt b1=Lt b2=Up b3=Dn, b4/b5 всегда 1 (кнопок нет),
; b6=Fire1, b7=Fire2. cpl не нужен: '1' у DecodeKeyboard уже значит «не нажато».
	in a,(0Eh)
	ld (JoystickE),a

; FRAMES - Frame counter. 3 bytes, least significant first
	ld hl,FRAMES
	inc (hl)		; increment byte 0
	jp nz,FRAMES_X
	inc hl
	inc (hl)		; increment byte 1
	jp nz,FRAMES_X
	inc hl
	inc (hl)		; increment byte 2
FRAMES_X:

; Scrolling, screen mode, border
	ld a,88h
	out (0),A
	ld a,2
	out (1),A
	ld a,0FFh
	out (3),A		; scrolling
	ld A,(BorderColor)
	and 0Fh
	out (2),A		; screen mode and border

; Звук: один шаг мелодии на кадр (аппаратный ВИ53, логика не ждёт).
; Стоит ПОСЛЕ записей в порты 3 и 2 нарочно: у развёртки и каймы срок — гасящий
; ход, а у звука срока нет вовсе. Пока драйвер стоял перед ними, старт ноты
; (там счёт делителя и длительности, ~1500 тактов) отодвигал out (3) и out (2)
; примерно на восемь растровых строк. Замер показывал строки 0-15, то есть в
; видимую часть кадра записи не уезжали, но запас был съеден без всякой нужды.
	push bc
	push de
	call snd_tick
	pop de
	pop bc
;
	pop hl
	pop af
	ei
	ret

;				;  7   6   5   4   3   2   1   0
KeyLineEx:	db 11111111b	; R/L SS  US  --  --  --  --  --
KeyLine0:	db 11111111b	; Dn  Rt  Up  Lt  ZB  VK  PS  Tab
KeyLine2:	db 11111111b	;  7   6   5   4   3   2   1   0
KeyLine7:	db 11111111b	; SPC  ^   ]   \   [   Z   Y   X
JoystickP:	db 11111111b	; Fr  Fr  --  --  Dn  Up  Lt  Rt
JoystickE:	db 11111111b	; Fr2 Fr1 --  --  Dn  Up  Lt  Rt - порт 0x0E, active-low

BorderColor:	db 1		; border color number 0..15

FRAMES:		db 0,0,0	; frame counter

;----------------------------------------------------------------------------

ColorNone equ 00000000b    ; Color for empty bits  - black
ColorGame equ 11011011b    ; Color for $E000-$FFFF - yellow
ColorText equ 10111111b    ; Color for $C000-$DFFF - blue
ColorBoth equ 00000111b    ; Color for both planes - red
; Palette colors, game
PaletteGame:		; Palette
	db	ColorNone, ColorGame, ColorText, ColorBoth	; 0..3
	db	ColorNone, ColorGame, ColorText, ColorBoth	; 4..7
	db	ColorNone, ColorGame, ColorText, ColorBoth	; 8..11
	db	ColorNone, ColorGame, ColorText, ColorBoth	; 12..15

;----------------------------------------------------------------------------

; ZX0 decompressor code by Ivan Gorodetsky
; https://github.com/ivagorRetrocomp/DeZX/blob/main/ZX0/8080/OLD_V1/dzx0_CLASSIC.asm
; input:	de=compressed data start
;		bc=uncompressed destination start
;NOTE: FORWARD decompression only
dzx0:
		ld hl,0FFFFh
		push hl
		inc hl
		ld a,080h
dzx0_literals:
		call dzx0_elias
		call dzx0_ldir
		jp c,dzx0_new_offset
		call dzx0_elias
dzx0_copy:
		ex de,hl
		ex (sp),hl
		push hl
		add hl,bc
		ex de,hl
		call dzx0_ldir
		ex de,hl
		pop hl
		ex (sp),hl
		ex de,hl
		jp NC,dzx0_literals
dzx0_new_offset:
		call dzx0_elias
		ld h,a
		pop af
		xor a
		sub L
		ret z
		push hl
		rra
		ld h,a
		ld a,(de)
		rra
		ld l,a
		inc de
		ex (sp),hl
		ld A,H
		ld hl,1
		call nc,dzx0_elias_backtrack
		inc hl
		jp dzx0_copy
dzx0_elias:
		inc l
dzx0_elias_loop:
		add a,a
		jp NZ,dzx0_elias_skip
		ld a,(de)
		inc de
		rla
dzx0_elias_skip:
		ret C
dzx0_elias_backtrack:
		add hl,hl
		add a,a
		jp NC,dzx0_elias_loop
		jp dzx0_elias

dzx0_ldir:
		push af
dzx0_ldir1:
		ld a,(de)
		ld (bc),A
		inc de
		inc bc
		dec hl
		ld a,h
		or l
		jp nz,dzx0_ldir1
		pop af
		add a,a
		ret

;----------------------------------------------------------------------------

;----------------------------------------------------------------------------
; ЗВУК НА ВИ53 (замена бипера ZX)
;
; В порте nzeemin звука НЕТ вообще: ROM_BEEPER — это `ret ;STUB`, а под ним
; лежит нетронутая ZX-процедура с DI и busy-петлями. Здесь бипер заменён
; аппаратным ВИ53: канал 2 (порт 09h, управляющее слово в 08h), режим 3
; (меандр). Логика игры больше НЕ ЖДЁТ ноту — драйвер продвигается на один шаг
; за кадр прямо в KEYINT, поэтому такты игрового тика не растут.
;
; Формат мелодии оставлен ИСХОДНЫЙ (таблицы игры LE604/LE61C/LE629/LE638/LEDD5
; не тронуты), тройками байт под ZX ROM BEEPER:
;   +0      число периодов ноты (регистр DE у ROM_BEEPER); $FF = конец мелодии
;   +1,+2   «длина петли задержки» X (регистр HL): f = 437500/(X+30.125) Гц
;
; Пересчёт в делитель ВИ53 при тактовой 1.5 МГц:
;   N = 1500000/f = 1500000*(X+30.125)/437500 = 3.4286*X + 103.3
; Считаем N = 3X + X/2 - X/16 + 103 = 3.4375*X + 103 — ошибка 0.26% (4 цента).
; Длительность: t = DE/f сек, в кадрах при 50 Гц t = DE*N/30000.
;   Берём M = N>>8 и t = (DE*M + (DE*M)/8) >> 7 = DE*M/113.8 (против /117.2 —
;   3% короче). Ноль кадров поднимаем до одного.
; Делитель 0 в порт НЕ выдаётся НИКОГДА: на MiSTer счётчик с делителем 0 не
; стартует (грабли из vec_isr King's Valley). Ниже единицы зажимаем в 2.

; Запустить мелодию. Вход: HL = адрес таблицы. Возврат немедленный.
snd_start:
	ld (snd_ptr),hl
	xor a
	ld (snd_cnt),a
	ret

; Замолчать: канал 2 в режим 0 — выход уходит в ноль и там остаётся.
snd_stop:
	ld hl,0
	ld (snd_ptr),hl
	ld a,0B0h
	out (8),a
	xor a
	out (9),a
	out (9),a
	ret

; Шаг драйвера — один раз за кадр из KEYINT. Портит A,F,BC,DE,HL (KEYINT их
; сохраняет). Молчание стоит 30 тактов.
snd_tick:
	ld hl,(snd_ptr)
	ld a,h
	or l
	ret z			; молчим
	ld a,(snd_cnt)
	or a
	jp z,snd_next
	dec a
	ld (snd_cnt),a
	ret
snd_next:
	ld a,(hl)
	inc a
	jp z,snd_stop		; $FF -> конец мелодии
	dec a
	ld e,a			; E = число периодов (D не нужен, всегда 0)
	inc hl
	ld c,(hl)
	inc hl
	ld b,(hl)		; BC = X
	inc hl
	ld (snd_ptr),hl
	push de			; E = периоды
; --- делитель N = 3X + X/2 - X/16 + 103
	ld h,b
	ld l,c
	add hl,hl
	add hl,bc		; HL = 3X
	push hl
	ld h,b
	ld l,c
	call snd_shr		; X/2
	push hl
	call snd_shr
	call snd_shr
	call snd_shr		; X/16
	ld d,h
	ld e,l
	pop hl			; X/2
	ld a,l
	sub e
	ld l,a
	ld a,h
	sbc a,d
	ld h,a			; HL = X/2 - X/16
	pop de			; 3X
	add hl,de
	ld de,103
	add hl,de		; HL = N
; страховка от нулевого делителя
	ld a,h
	or a
	jp nz,snd_prog
	ld a,l
	cp 2
	jp nc,snd_prog
	ld hl,2
snd_prog:
	ld a,0B6h		; канал 2, режим 3, 16 бит: сначала младший, потом старший
	out (8),a
	ld a,l
	out (9),a
	ld a,h
	out (9),a
; --- длительность в кадрах: t = (P*M + P*M/8) >> 7,  M = N>>8, P = периоды
	ld a,h			; A = M
	pop bc			; C = P (клали push de, где E = число периодов)
	ld e,a
	ld d,0			; DE = M
	ld hl,0
	ld b,8
snd_mul:
	add hl,hl
	ld a,c
	rlca			; CY = очередной бит P, C сдвинут
	ld c,a
	jp nc,snd_mul_1
	add hl,de
snd_mul_1:
	dec b
	jp nz,snd_mul		; HL = P*M
	ld d,h
	ld e,l
	call snd_shr
	call snd_shr
	call snd_shr		; HL = P*M/8
	add hl,de		; 1.125 * P*M
	ld b,7
snd_div:
	call snd_shr
	dec b
	jp nz,snd_div		; HL >>= 7
	ld a,h
	or a
	jp nz,snd_cnt_max	; длиннее 255 кадров не бывает, но зажмём
	ld a,l
	or a
	jp nz,snd_cnt_ok
	inc a			; ноль кадров -> один
snd_cnt_ok:
	ld (snd_cnt),a
	ret
snd_cnt_max:
	ld a,255
	jp snd_cnt_ok

; HL >>= 1 (логический). Портит A и флаги.
snd_shr:
	and a			; CY = 0
	ld a,h
	rra
	ld h,a
	ld a,l
	rra
	ld l,a
	ret

snd_ptr:	dw 0		; позиция в мелодии, 0 = молчание
snd_cnt:	db 0		; кадров до следующей ноты

SCUBACOD0_END
	OUTEND
	END