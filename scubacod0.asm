;----------------------------------------------------------------------------

START1	.equ	1000h

	.EXPORT KeyLineEx, KeyLine0, KeyLine7, JoystickP
	.EXPORT BorderColor, SetPaletteGame

;----------------------------------------------------------------------------

	.org	100h

	di
	xra	a
	out	10h			; turn off the quasi-disk
	lxi	sp,0100h
	lxi	h,0C3F3h
	shld	0
	mov	a,h
	lxi	h,RestartInt
	shld	2
	sta	38h
	lxi	h,KEYINT		; interrupt handler address
	shld	38h+1

RestartInt:
	lxi	sp,100h
	mvi	a, 88h
	out	4			; initialize R-Sound 2
; Joystick init
	mvi	a, 83h		; control byte
	out	4		; initialize the I/O controller
	mvi	a, 9Fh		; bits to check Joystick-P, both P1 and P2
	out	5		; set Joystick-P query bits
	in	6		; read Joystick-P initial value
	sta	KEYINT_J+1	; store as xra instruction parameter

	call	SetPaletteGame
;	ei
	jp	START1

; Set game palette
SetPaletteGame:
	lxi	h, PaletteGame+15
	
; Programming the Palette
SetPalette:
	ei
	hlt
	lxi	d, 100Fh
PaletLoop:
	mov	a, e
	out	2
	mov	a, m
	out	0Ch
	out	0Ch
	out	0Ch
	out	0Ch
	out	0Ch
	dcx	h
	out	0Ch
	dcr	e
	out	0Ch
	dcr	d
	out	0Ch
	jnz	PaletLoop
	ret

;----------------------------------------------------------------------------

KEYINT:
	push	psw
	mvi	a, 8Ah
	out	0
; Keyboard scan
	in	1
	ori	00011111b
	sta	KeyLineEx
	mvi	a, 0FEh
	out	3
	in	2
	sta	KeyLine0
;	mvi	a, 0FDh
;	out	3
;	in	2
;	sta	KeyLine1
;	mvi	a, 0DFh
;	out	3
;	in	2
;	sta	KeyLine5
;	mvi	a, 0BFh
;	out	3
;	in	2
;	sta	KeyLine6
	mvi	a, 07Fh
	out	3
	in	2
	sta	KeyLine7
; Joystick scan
	in	6		; read Joystick-P
KEYINT_J:
	xri	0		; XOR with initial value - mutable param!
	cma
	sta	JoystickP	; save to analyze later

; Scrolling, screen mode, border
	mvi	a, 88h
	out	0
	mvi	a, 2
	out	1
	mvi	a, 0FFh
	out	3		; scrolling
	lda	BorderColor
	ani	0Fh
	out	2		; screen mode and border
;
	pop	psw
	ei
	ret

KeyLineEx:	.db 11111111b
KeyLine0:	.db 11111111b
;KeyLine1:	.db 11111111b
;KeyLine5:	.db 11111111b
;KeyLine6:	.db 11111111b
KeyLine7:	.db 11111111b
JoystickP:	.db 11111111b

BorderColor:	.db 0		; border color number 0..15

;----------------------------------------------------------------------------

ColorNone .equ 00000000b
ColorGame .equ 11000000b    ; Color for $E000-$FFFF
ColorText .equ 10111111b    ; Color for $C000-$DFFF
ColorBoth .equ 00000111b    ; Color for both
; Palette colors, game
PaletteGame:		; Palette
	.db	ColorNone, ColorGame, ColorText, ColorBoth	; 0..3
	.db	ColorNone, ColorGame, ColorText, ColorBoth	; 4..7
	.db	ColorNone, ColorGame, ColorText, ColorBoth	; 8..11
	.db	ColorNone, ColorGame, ColorText, ColorBoth	; 12..15

; Filler
	.org	START1-1
	.db	0

	.end

;----------------------------------------------------------------------------
