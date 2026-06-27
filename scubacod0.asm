;----------------------------------------------------------------------------

	EXPORT KeyLineEx
	EXPORT KeyLine0
	EXPORT KeyLine7
	EXPORT JoystickP
	EXPORT BorderColor
	EXPORT FRAMES
	EXPORT dzx0
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
;	ld a,0FDh
;	out (3),a
;	in A,(2)
;	ld (KeyLine1),a
;	ld a,0DFh
;	out (3),a
;	in A,(2)
;	ld (KeyLine5),a
;	ld a,0BFh
;	out (3),a
;	in A,(2)
;	ld (KeyLine6),a
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

KeyLineEx:	db 11111111b
KeyLine0:	db 11111111b
;KeyLine1:	db 11111111b
;KeyLine5:	db 11111111b
;KeyLine6:	db 11111111b
KeyLine7:	db 11111111b
JoystickP:	db 11111111b

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

SCUBACOD0_END
	OUTEND
	END