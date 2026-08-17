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
	EXPORT SCUBACOD0_END

;----------------------------------------------------------------------------

	OUTPUT "scubacod0.bin"
	ORG	100h

	di
; [ДОПОЛНЕНИЕ ПОВЕРХ nzeemin as-is] Режим прерываний не задавался НИ РАЗУ, а после
; сброса Z80 оказывается в IM0 и исполняет байт, который устройство выставит на
; шину в цикле подтверждения. На Векторе это RST 38h (0xFF), и бут кладёт по 0x38
; JP KEYINT — но всё держится на том, что ядро действительно выставит 0xFF.
; IM1 переходит на 0x0038 безусловно, не глядя на шину: то же поведение, но без
; зависимости от реализации. Стоит ДО первого ei (он внутри SetPaletteGame).
; Только для Z80-версии: у i8080 режимов прерываний нет вовсе.
	im 1
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
; --- свободно бегущий счётчик 0 ВИ53 как источник случайности --------------
; Заменяет регистр регенерации Z80, которого на i8080 нет. Канал 0 (порт 0x0Bh,
; управляющее слово в 0x08), режим 0, 16 бит, начальное значение 0xFFFF.
; Режим 0 выбран нарочно: выход уходит в единицу один раз по достижении нуля и
; там остаётся, то есть в динамике это ОДИН щелчок за всю игру, а не пила на
; 22.9 Гц, которую дал бы режим 2 или 3. Счётчик при этом продолжает считать и
; заворачиваться, значит его можно защёлкивать и читать сколько угодно.
; Канал 2 занят мелодией, канал 1 свободен про запас.
	ld a,030h		; канал 0, режим 0, 16 бит: сначала младший, потом старший
	out (8),a
	ld a,0FFh
	out (0Bh),a
	out (0Bh),a
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
; [ДОПОЛНЕНИЕ ПОВЕРХ nzeemin as-is] Штатный джойстик Вектора-06Ц: отдельная
; микросхема, порт 0x0E, PPI-инициализации не требует. Байт active-low ровно в том
; порядке, в каком его ждёт DecodeKeyboard_map: b0=Rt b1=Lt b2=Up b3=Dn, b4/b5
; всегда 1 (кнопок там нет), b6=Fire1, b7=Fire2. cpl не нужен: '1' у
; DecodeKeyboard уже означает «не нажато».
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

; ВНИМАНИЕ, ИМЕНА НИЖЕ ВВОДЯТ В ЗАБЛУЖДЕНИЕ (проверено расчётом цвета из байта
; палитры Вектора: биты 7-6 синий, 5-3 зелёный, 2-0 красный):
;   ColorGame = 0DBh -> (108,108,255) = СИНИЙ, а вовсе не "игровой жёлтый";
;   ColorText = 0BFh -> (252,252,170) = ЖЁЛТЫЙ, а вовсе не "текстовый".
; Отсюда фактическая раскладка плоскостей:
;   0C000h = ЖЁЛТАЯ  — все спрайты и текст HUD (18 записей на тик, замер);
;   0E000h = СИНЯЯ   — статика и рельеф (0 записей на тик, рисуется однажды);
;   пересечение обеих = красный (рельеф).
; Плоскости 08000h и 0A000h невидимы (палитра — четыре одинаковые четвёрки),
; в них лежит образ игры и буферы save-under.
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

SCUBACOD0_END
	OUTEND
	END