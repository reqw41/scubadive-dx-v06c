;----------------------------------------------------------------------------

	;ASSERT $ < $9900
	;DS $9900 - $
	;ORG $9900
	DISPLAY "Code start: ", /A, $

; Game; returns on Game Over
Game	DI
	PUSH IX
	PUSH IY
	LD HL,$0000
	LD (SCORE),HL		; reset Score value
	LD (HELD),HL		; reset HELD value
	LD A,$03		; Number of lives
	LD (LIVES),A		; set the initial value
LD9A3	CALL PrepareMiniMap	; Prepare the world MiniMap table
	CALL InitLevelVars	; Initialize variables depending of LEVEL
	CALL LBEDB
	LD HL,LE361
	LD (HL),$00
LD9B1	CALL PrepareGame	; Prepare game screen and some variables
	CALL LE6AB
	LD HL,(L5B03)		; get Screen position on mini-map
	CALL DrawGameScr	; Draw game screen
	CALL LBDBA
LD9C0	CALL LB213
	CALL LBDEA
	CALL LE2A8
	LD IX,DiverObj		; Diver object address
	BIT 4,(IX+$26)
	JR NZ,LD9DB
	BIT 5,(IX+$10)
	JR NZ,LD9F4
	JR LD9C0
LD9DB	LD A,(LIVES)		; get Number of lives
	CP $04
	JR NZ,LD9E7
	LD A,$03
	LD (LIVES),A		; set Number of lives
LD9E7	LD A,(LEVEL)		; LEVEL
	CP $04
	JR Z,LD9EF
	INC A			; increase Game level
LD9EF	LD (LEVEL),A		; Save LEVEL
	JR LD9A3
LD9F4	LD B,$00		; repeat 256 times
LD9F6	PUSH BC
	CALL LB213
	CALL LBDEA
	CALL LE2A8
	POP BC
	DJNZ LD9F6
	LD A,(L5B00)
	CP $08
	JR NZ,LDA1E
	LD A,(L5B0F)
	CP $03
	JR NZ,LDA1E
	LD A,(LIVES)		; get Number of lives
	CP $01
	JR Z,LDA1E		; No more lives? => no lives, jump
	DEC A
	LD (LIVES),A		; set Number of lives
	JR LD9DB
LDA1E	LD A,(LIVES)		; get Number of lives
	CP $01			; last live?
	JR Z,LDA33		; yes => game over
	DEC A			; One live less
	LD (LIVES),A		; set Number of lives
	LD HL,LE361
	LD A,(HL)
	AND $20
	LD (HL),A
	JP LD9B1
; No more lives, game over
LDA33	POP IY			; Ending the Game routine, the game is over
	POP IX
	EI
	RET

; Clear screen, fill attributes with A
; I: A = screen attribute to use
ClearScreenFillAttr
	LD (L5B4A),A		; store the attribute as current
; Clear color plane $C000-$DFFF, except the upper part
	ld C,32			; number of columns to clear
	call ClearScreen
; Fill the attributes area
	LD A,(L5B4A)		; get current screen attribute
	LD E,A
	LD BC,$0300		; number of bytes in screen attributes area
	ld hl,SCRATTR
LDA51	LD (HL),E		; set attribute
	INC HL
	DEC BC
	LD A,B
	OR C
	JR NZ,LDA51
	RET

; Clear game screen only, keep the indicators
ClearGameScreen
	ld C,24			; number of columns to clear
ClearScreen
	push BC			; save C
	ld h,$C0 ;LD HL,$C000	; screen pixels start address
LDA42	xor a
	ld l,232
LDA44	dec l
	LD (HL),a		; clear pixels
	jr nz,LDA44
	inc h
	dec C
	jr nz,LDA42
; Clear second color plane $E000
	pop BC			; restore C
	ld H,$E0		; screen pixels start address = $E0FF
.loop0:	ld L,$FF
	ld A,$FF
	ld B,32
.loop1	LD (HL),A
	dec L
	dec B
	jp nz,.loop1
	xor A
	ld B,24*8
.loop2	LD (HL),A
	dec L
	dec B
	jp nz,.loop2
	ld A,$FF
	ld B,32
.loop3	LD (HL),A
	dec L
	dec B
	jp nz,.loop3
	inc h
	dec C
	jr nz,.loop0
	ret

; Print char and shift current position right
PrintCharRt
	LD HL,(LDC7E)
	INC L
	LD (LDC7E),HL
	DEC L
	JR PrintChar
; Print char and shift current position down
PrintCharDn
	LD HL,(LDC7E)
	INC H
	LD (LDC7E),HL
	DEC H
; Print char
; I: HL = char coords
; I: A = character to print
PrintChar
	PUSH HL
	PUSH AF
	CALL GetScrAddr		; Convert char coords HL to ZX screen address
	EX DE,HL
	POP AF
	LD L,A
	LD H,$00
	RES 7,L
	ADD HL,HL
	ADD HL,HL
	ADD HL,HL		; *8
	BIT 7,A
	JR NZ,LDA83
	LD BC,ROM_CHARSET	; ROM font address, for chars $20..$7F
	JR LDA86
LDA83	LD BC,LDC80		; Tiles 8x8 address, for chars $80..$AE
LDA86	ADD HL,BC
	LD B,$08		; repeat 8 times
LDA89	LD A,(HL)		; get char pixels
	LD (DE),A		; put on the screen
	INC HL
	dec e ;INC D			; next row
	DJNZ LDA89
	POP HL			; restore char coords
	CALL GetScrAttrAddr	; Get screen attribute address
	LD A,(L5B4A)		; get current screen attribute
	LD (HL),A		; set attribute on the screen
	RET

; Print string
; I:HL	String address
; I:BC	Row and column
; I:DE	Print char procedure address
PrintStringEx
	LD (LDAA2+1),DE
;
PrintString
	LD (LDC7E),BC
	LD A,(HL)
LDAA1	PUSH HL
LDAA2	CALL PrintCharRt	; Print char and shift !!MUT-ARG!! DA59 / DA63
	POP HL
	INC HL
	LD A,(HL)
	CP $FF
	JR NZ,LDAA1
	RET

; Highlight one 8x8 char cell on the panel by filling it solid in the
; GetScrAddr colour plane (opposite the digit). ZX used a bright attribute.
; I: HL = Vector screen address of the cell's top line
HighlightChar
	LD B,$08		; 8 pixel lines
HighlightChar_1
	LD (HL),$FF
	dec l			; next line down
	DJNZ HighlightChar_1
	RET

ShowGamePanel:
	ld de,SCUBAPANL_ZX0
	ld bc,$F800
	jp dzx0

; Prepare game screen, indicators, and some variables
PrepareGame
	LD A,$30
	CALL ClearScreenFillAttr	; Clear screen with attribute A = $30
	xor a ; LD A,$01
	out ($00),a ; OUT ($FE),A
	call ShowGamePanel
;
	xor A
	call UpdateDepth1	; reset the Depth indicator
	ld hl,$FFFF
	call UpdateOxygen
; UpdateLevel: highlight the current skill (LEVEL) digit
	LD A,(LEVEL)		; LEVEL 1..4
	DEC A			; 0..3
	ADD A,A			; *2 - two char rows per digit
	ADD A,$07		; row = 7 + (LEVEL-1)*2 => 7 / 9 / 11 / 13
	LD H,A			; row
	LD L,$1D		; column 29
	CALL GetScrAddr		; HL = Vector screen address of the digit cell
	CALL HighlightChar
; UpdateLives: highlight the current LIVES digit
	LD A,(LIVES)		; Number of lives 1..4
	DEC A			; 0..3
	ADD A,A			; *2
	ADD A,$10		; row = 16 + (LIVES-1)*2 => 16 / 18 / 20 / 22
	LD H,A			; row
	LD L,$1D		; column 29
	CALL GetScrAddr		; HL = Vector screen address of the digit cell
	CALL HighlightChar
	LD IX,DiverObj		; Diver object address
	CALL PrintHighScore	; Print high score number
	CALL PrintScore		; Print score number
	CALL PrintHeld		; Print HELD number
	LD A,(LEVEL)		; LEVEL
	DEC A
	ADD A,A
	ADD A,A
	ADD A,A
	ADD A,A			; A = (LEVEL - 1) * 16 => 0 / 16 / 32 / 48
	LD E,A
	LD D,$00
	LD HL,LDDF0
	ADD HL,DE		; HL = LDDF0 + (LEVEL - 1) * 16
	LD DE,L5B27
	LD BC,$000E
	LDIR			; copy 14 bytes = 7 words
	LD A,(LEVEL)		; LEVEL
	LD C,A
	LD A,$05
	SUB C			; A = 5 - LEVEL => 4 / 3 / 2 / 1
	LD (IX+$1C),A
	LD (IX+$1E),A
	LD C,A
	LD A,$16
	SUB C			; A => 12 / 13 / 14 / 15
	LD (IX+$1D),A
	LD (IX+$1B),A
	LD A,(LEVEL)		; LEVEL
	ADD A,A
	LD C,A
	LD A,$0A
	SUB C			; A = 10 - LEVEL * 2
	ADD A,$02
	LD (L5B0E),A		; = 10 - LEVEL * 2 + 2 => 10 / 8 / 6 / 4
	SUB $03
	LD (L5B0D),A		; = 10 - LEVEL * 2 + 2 - 3 => 7 / 5 / 3 / 1
	RET

; Initialize variables depending of LEVEL
InitLevelVars
	LD A,(LEVEL)		; LEVEL
	ADD A,A
	ADD A,A			; *4
	ADD A,$09		; A = LEVEL * 4 + 9 => 13 / 17 / 21 / 25
	LD (L5B13),A		; set Number of Meduza objects
	LD (L5B14),A		; set Number of Round fishes
	ADD A,$05		; A = LEVEL * 4 + 9 + 5 => 18 / 22 / 26 / 31
	LD (NumRecsII),A	; set Number of 26-byte records in group II
	SUB $05
	ADD A,A
	INC A			; A = (LEVEL * 4 + 9) * 2 + 1 => 27 / 35 / 43 / 51
	LD (NumRecsI),A		; set Number of 21-byte records in group I
	DEC A			; A = (LEVEL * 4 + 9) * 2 => 26 / 34 / 42 / 50
	LD (NumRecsIII),A	; set Number of 26-byte records in group III
	LD A,(LEVEL)		; LEVEL
	LD C,A
	ADD A,A
	ADD A,A
	ADD A,C			; A = LEVEL * 5 => 5 / 10 / 15 / 20
	LD (NumRecsIV),A	; set Number of 26-byte records in group IV
	LD C,A
	ADD A,A
	ADD A,C
	SUB $03			; A = LEVEL * 5 * 3 - 3 => 12 / 27 / 42 / 57
	LD (NumRecsV),A		; set Number of 28-byte records in group V
	LD HL,$0001
	LD (DelayVal),HL
	LD A,(LEVEL)		; LEVEL
	NEG
	ADD A,$04		; 3 / 2 / 1 / 0
	RET Z
	LD B,A			; B = loop counter
	XOR A
LDC01	ADD A,50		; +50
	DJNZ LDC01
	LD (DelayVal),A
	RET

LDC7E	DEFW $0000	; Char coords for printing on the screen, see DA59

; Tiles 8x8
; LDC80	DEFB $00,$7F,$40,$58,$58,$40,$43,$42	; NOT USED
; 	DEFB $00,$FF,$00,$18,$18,$00,$FF,$00	; NOT USED
; 	DEFB $42,$42,$42,$5A,$5A,$42,$42,$42	; NOT USED
; 	DEFB $42,$43,$40,$58,$58,$40,$7F,$00	; NOT USED
; 	DEFB $42,$C2,$02,$1A,$1A,$02,$FE,$00	; NOT USED
; 	DEFB $00,$FE,$02,$1A,$1A,$02,$C2,$42	; NOT USED
; 	DEFB $FF,$81,$81,$E7,$81,$81,$81,$81	; NOT USED - gauge top
; 	DEFB $81,$81,$81,$E7,$81,$81,$81,$81	; NOT USED
; 	DEFB $81,$81,$81,$E7,$81,$FF,$00,$00	; NOT USED - gauge bottom
LDCC8
LDC80 = LDCC8 - 72
	DEFB $07,$0F,$1F,$7F,$3F,$3E,$7E,$1F
	DEFB $47,$C3,$61,$7F,$7F,$7F,$7F,$1D
	DEFB $04,$0F,$0F,$7F,$3E,$78,$70,$E0
	DEFB $70,$38,$7C,$7F,$7F,$1F,$07,$02
	DEFB $0C,$1C,$18,$78,$78,$F8,$70,$78
	DEFB $78,$70,$FC,$7F,$7F,$3F,$1F,$00
	DEFB $D2,$FF,$76,$70,$F0,$F9,$7F,$7F
	DEFB $7F,$79,$F0,$F8,$70,$7C,$7F,$50
	DEFB $02,$1F,$3F,$3F,$7D,$78,$F8,$7B
	DEFB $FF,$7F,$7E,$7A,$18,$70,$E0,$60
	DEFB $80,$D0,$F8,$FF,$FE,$DE,$0E,$02
	DEFB $E0,$E0,$F8,$FC,$FC,$FC,$F0,$98
	DEFB $00,$E0,$F0,$F8,$70,$30,$00,$00
	DEFB $00,$00,$0C,$74,$F8,$F8,$E0,$80
	DEFB $70,$F8,$78,$FC,$38,$3C,$18,$38
	DEFB $3C,$18,$38,$30,$F8,$FC,$F0,$C0
	DEFB $C0,$F0,$F0,$FC,$F8,$E0,$E0,$80
	DEFB $C0,$70,$78,$7C,$F8,$F0,$E0,$40
	DEFB $00,$80,$C0,$F0,$E0,$78,$F8,$F0
	DEFB $F8,$F0,$78,$38,$78,$38,$70,$78
	DEFB $B1,$7F,$7F,$7F,$FD,$78,$78,$FC
	DEFB $F0,$70,$78,$70,$F1,$7F,$7F,$CC
	DEFB $03,$07,$01,$03,$01,$03,$00,$01
	DEFB $00,$00,$01,$01,$03,$01,$07,$03
	DEFB $F8,$F0,$78,$7C,$FE,$FE,$7E,$7E
	DEFB $7F,$FF,$FF,$7F,$3F,$1F,$1F,$0A
	DEFB $00,$FF,$FF,$67,$E0,$60,$60,$6E
	DEFB $FF,$F8,$60,$70,$76,$7F,$3F,$01
	DEFB $60,$F4,$FE,$FE,$BF,$3E,$3F,$3F
	DEFB $3F,$1F,$3F,$7F,$FF,$FE,$FC,$EC
	DEFB $80,$C0,$E0,$E0,$E0,$C0,$C0,$C0
	DEFB $80,$C0,$C0,$C0,$80,$C0,$E0,$80
	DEFB $0B,$1F,$1E,$3E,$7F,$3F,$7C,$FC
	DEFB $FC,$FC,$F8,$F8,$F0,$F8,$F0,$E0
	DEFB $80,$F8,$F0,$F0,$78,$00,$00,$00
	DEFB $80,$00,$00,$00,$80,$E0,$F0,$C0
	DEFB $00,$00,$00,$00,$00,$00,$00,$00

; Blocks of 14 bytes to copy to 5B27, blocks aligned to 16 bytes
;	     L5B27 L5B29 L5B2B L5B2D L5B2F L5B31 L5B33
LDDF0	DEFW $0002,$0005,$004B,$0019,$0032,$00FA,$0019,$0000	; Level 1
	DEFW $0004,$000A,$0032,$0096,$0064,$01F4,$0032,$0000	; Level 2
	DEFW $0006,$000F,$0096,$00E1,$004B,$02EE,$004B,$0000	; Level 3
	DEFW $0008,$0014,$0064,$00C8,$012C,$03E8,$0064		; Level 4

; Update gauge indicator on the screen
; I: A = value 0..63, DE = base address in screen area
; I: HL = old address for the indicator
; O: HL = new address for the indicator
UpdateGauge
	inc l
	ld (hl),$00
	inc l
	ld (hl),$00
	dec l
	dec l
	ld (hl),$00
	dec l
	ld (hl),$00
	ex de,hl	; now HL = base screen address
	ld e,a
	ld d,$00
	or a
	sbc hl,de
	inc l
	ld (hl),$FF
	inc l
	ld (hl),$FF
	dec l
	dec l
	LD (hl),$FF
	dec l
	ld (hl),$FF
	inc l
	RET

; Update Depth indicator
UpdateDepth
	LD A,(L5B03+1)		; get screen position on mini-map, row value
UpdateDepth1
	LD HL,(LDE55)		; get Depth indicator address
	LD DE,$DBA3		; base address in screen area
	add a,a
	add a,a
	AND $7F			; 0..127
	CALL UpdateGauge	; Update the gauge indicator on the screen
	LD (LDE55),HL		; set Depth indicator address
	RET

LDE55	DEFW $DBA3	; Depth indicator, address in screen area
LDE57	DEFW $D9A3	; Oxygen indicator, address in screen area
LDE59	DEFW $0000	; Lives indicator, address in screen attributes
OXYGEN	DEFW $FFFF	; Oxygen level

; Update Oxygen indicator
; I: HL = new value for Oxygen
UpdateOxygen
	LD (OXYGEN),HL
	LD A,H
	SRL A
	LD H,A
	LD A,$7F		; 0..127
	SUB H
	LD HL,(LDE57)		; get Oxygen indicator address
	CP $0E
	JR C,LDE7E
	CALL LE645		; Play melody LE629
LDE7E	LD DE,$D9A3		; base address in screen area
	CALL UpdateGauge	; Update the gauge indicator on the screen
	LD (LDE57),HL		; set Oxygen indicator address
	RET

; Print decimal number
; I: HL = number to print
; I: DE = address on the screen
PrintDec
	LD (IX+$23),B
	PUSH DE
	LD IY,LE5E0		; address for list of dividers: 10000, 1000, 100, 10, 1
LDE8D	LD C,$FF
	LD E,(IY+$00)
	LD D,(IY+$01)		; get divider in DE
	BIT 7,D
	JR Z,LDEA0
	LD (IX+$23),D
	LD C,$00
	JR LDEB6
LDEA0	INC C
	OR A
	SBC HL,DE
	JR NC,LDEA0
	ADD HL,DE
	INC IY
	INC IY
	LD A,(IX+$23)
	OR A
	JR Z,LDEB6
	DEC (IX+$23)
	JR LDE8D
LDEB6	EX (SP),HL
	EX DE,HL
	LD B,$00
	SLA C
	SLA C
	SLA C
	LD HL,ROM_CHARSET+$80		; ZX Charset (3D00) + $80 = address of char '0'
	ADD HL,BC
	LD B,$08		; repeat 8 times
	PUSH DE
LDEC7	LD A,(HL)
	LD (DE),A
	INC HL
	dec e ;INC D
	DJNZ LDEC7
	POP DE
	inc d ;INC E
	EX DE,HL
	EX (SP),HL
	BIT 7,(IX+$23)
	JR Z,LDE8D
	POP DE
	RET

; Print high score number
PrintHighScore
	LD B,$00
	LD HL,(HISCORE)
	LD DE,$D9CF		; screen address AT 25,2
	CALL PrintDec		; Print decimal number
	RET

; Print score number
PrintScore
	LD B,$00
	LD HL,(SCORE)		; get Score number
	LD DE,$D9BF		; screen address AT 25,4
	CALL PrintDec		; Print decimal number
	RET

; Print HELD number
PrintHeld
	LD B,$02
	LD HL,(HELD)		; get HELD value
	LD DE,$DAAF		; screen address AT 26,6
	CALL PrintDec		; Print decimal number
	RET

LDEFD	DEFB $00,$00
HELD	DEFW $0000	; HELD value
LDF01	DEFB $00,$00,$00,$00,$00,$00,$02,$03
	DEFB $02,$03,$18,$10,$00,$30
LDF0F	DEFW $0000
LDF11	DEFB $00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00

; Table: Angle 0..15 -> (DX, DY)
AngleToDXDY
	DEFB $00,$FE,$01,$FE,$02,$FE,$02,$FF,$02,$00,$02,$01,$02,$02,$01,$02
	DEFB $00,$02,$FF,$02,$FE,$02,$FE,$01,$FE,$00,$FE,$FF,$FE,$FE,$FF,$FE

LDF45	DEFB $00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00
LDF8D	DEFB $00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00

; I:IX = Diver object address = DiverObj
LDFD5	LD HL,(LB7B9)
	LD DE,(L5B35)
	LD (L5B35),HL
	LD (LB7B9),DE
	LD IY,LDF01
	LD HL,LDF11
	LD (LDF0F),HL
	LD A,(IX+$09)
	LD (IX+$0B),A
	LD A,(IX+$0A)
	LD (IX+$0C),A
	BIT 7,(IX+$10)
	JR Z,LE021
	LD A,(IX+$06)		; get Angle 0..15
	ADD A,A
	LD C,A
	LD B,$00
	LD HL,AngleToDXDY	; Table base address
	ADD HL,BC
	LD A,(HL)		; get DX value for the Angle
	LD (IX+$04),A		; set DX value
	INC HL
	LD A,(HL)		; get DY value for the Angle
	LD (IX+$05),A		; set DY value
	BIT 0,(IX+$10)		; check "moving" bit
	JR NZ,LE021
	LD (IX+$04),$00		; clear DX value
	LD (IX+$05),$00		; clear DY value
LE021	LD A,(IX+$13)		; get X value
	LD HL,(L5B03)		; get Screen position on mini-map
	ADD A,(IX+$04)		; add DX
	LD (IX+$13),A		; set X value
	SRL A
	AND $07			; 0..7
	CP (IX+$02)		; compare to previous X shift
	LD (IX+$15),A		; set X shift
	JR Z,LE08D
	CP $01
	JR Z,LE068
	CP $07
	JR NZ,LE08D
	BIT 7,(IX+$04)		; check DX sign - moving left?
	JR Z,LE08D
	BIT 7,(IX+$11)
	JR Z,LE08D
	DEC (IX+$00)		; one column left
	RES 4,(IX+$0D)
	LD A,(IX+$00)		; get column 0..255
	CP (IX+$1C)
	JR NC,LE08D
	ADD A,$08
	LD (IX+$00),A		; set column
	SET 2,(IX+$10)
	DEC L
	JR LE08D
LE068	BIT 7,(IX+$04)		; check DX sign - moving left?
	JR NZ,LE08D
	BIT 7,(IX+$11)
	JR NZ,LE08D
	INC (IX+$00)		; one column right
	RES 4,(IX+$0D)
	LD A,(IX+$00)		; get column 0..255
	CP (IX+$1B)
	JR C,LE08D
	SUB $08
	LD (IX+$00),A		; set column
	SET 2,(IX+$10)
	INC L
LE08D	LD A,(IX+$14)		; get Y value
	ADD A,(IX+$05)		; add DY
	LD (IX+$14),A		; set Y value
	SRL A
	AND $07			; 0..7
	CP (IX+$03)		; compare to previous Y shift
	LD (IX+$16),A
	JP Z,LE120
	CP $01
	JR Z,LE0EA
	CP $07
	JP NZ,LE120
	BIT 7,(IX+$05)		; check DY sign - moving up?
	JR Z,LE120
	BIT 7,(IX+$12)
	JR Z,LE120
	LD A,(IX+$1A)
	CP (IX+$28)
	JR NZ,LE0CC
	LD A,(IX+$03)		; get previous Y shift
	LD (IX+$16),A		; set Y shift
	ADD A,A
	LD (IX+$14),A		; set Y value
	JR LE120
LE0CC	DEC (IX+$01)		; one row up
	DEC (IX+$1A)
	RES 3,(IX+$0D)
	LD A,(IX+$01)		; get row 0..255
	CP (IX+$1E)
	JR NC,LE120
	ADD A,$08
	LD (IX+$01),A		; set row
	DEC H			; one block up
	SET 2,(IX+$10)
	JR LE120
LE0EA	BIT 7,(IX+$05)		; check DY sign - moving up?
	JR NZ,LE120
	BIT 7,(IX+$12)
	JR NZ,LE120
	INC (IX+$01)
	INC (IX+$1A)
	BIT 5,(IX+$26)
	JR NZ,LE10A
	LD A,(IX+$1A)
	CP $46
	CALL Z,LE9B0		; => plus one live
LE10A	RES 3,(IX+$0D)
	LD A,(IX+$01)		; get row 0..255
	CP (IX+$1D)
	JR C,LE120
	SUB $08
	LD (IX+$01),A
	INC H			; one block down
	SET 2,(IX+$10)
LE120	LD A,(IX+$0D)
	AND $18
	CP $18
	JR Z,LE174
	BIT 2,(IX+$10)
	JR Z,LE171
	RES 1,(IX+$0D)
	PUSH IX
	PUSH IY
	LD A,L
	AND $1F			; column 0..31
	LD L,A
	LD A,H
	AND $1F			; row 0..31
	LD H,A
	LD (L5B03),HL		; set Screen position on mini-map
	CALL DrawGameScr	; Draw game screen
	CALL UpdateDepth	; Update Depth indicator
	LD HL,(LB7B9)
	LD DE,(L5B35)
	LD (LB7B9),DE
	LD (L5B35),HL
	CALL LBDBA
	LD HL,(LB7B9)
	LD DE,(L5B35)
	LD (LB7B9),DE
	LD (L5B35),HL
	POP IY
	POP IX
	RES 2,(IX+$10)
	JR LE174
LE171	CALL LB3AB
LE174	SET 4,(IX+$0D)
	SET 3,(IX+$0D)
	LD E,(IX+$04)		; get DX value
	LD A,(IX+$15)		; get X shift 0..7
	CP (IX+$02)		; compare to previous X shift
	JR Z,LE18D
	LD (IX+$02),A		; set previous X shift
	LD (IX+$11),E
LE18D	LD E,(IX+$05)		; get DY value
	LD A,(IX+$16)		; get Y shift 0..7
	CP (IX+$03)		; compare to previous Y shift
	JR Z,LE19E
	LD (IX+$12),E
	LD (IX+$03),A		; set previous Y shift
LE19E	BIT 7,(IX+$10)
	JR NZ,LE1B8
	LD A,(IX+$24)
	LD (IX+$09),A
	LD (IX+$0B),A
	LD A,(IX+$25)
	LD (IX+$0A),A
	LD (IX+$0C),A
	JR LE1F4
LE1B8	BIT 4,(IX+$10)
	JR NZ,LE1C4
	BIT 5,(IX+$10)
	JR Z,LE1D2
LE1C4	LD A,(IX+$09)
	LD (IX+$0B),A
	LD A,(IX+$0A)
	LD (IX+$0C),A
	JR LE1F4
LE1D2	INC (IX+$17)
	LD H,(IX+$06)		; get Angle 0..15
	LD A,(IX+$17)
	AND $03			; 0..3
	RRCA
	RRCA
	LD L,A
	SRL H
	RR L
	LD DE,SprDiver0		; Diver sprites base address
	ADD HL,DE		; now HL = diver sprite address
	LD (IX+$0A),H
	LD (IX+$0C),H
	LD (IX+$09),L
	LD (IX+$0B),L
LE1F4	CALL LB3A6
	LD A,(IX+$01)
	LD (IX+$19),A		; set Row
	LD IY,(LB7B9)
	LD D,(IX+$08)
	LD E,(IX+$07)
	BIT 0,(IX+$0D)
	JR NZ,LE211
	LD IY,LA41B		; empty sprite address
LE211	BIT 1,(IX+$0D)
	JR NZ,LE21A
	LD DE,LA41B		; empty sprite address
LE21A	LD B,$03		; loop 3 times
LE21C	PUSH BC
	LD A,(IX+$00)
	LD (IX+$18),A		; set Column
	LD L,A
	LD H,(IX+$19)		; get Row
	CALL GetScrAddr		; Convert char coords HL to ZX screen address
	LD B,$03		; loop 3 times
LE22C	PUSH BC
	PUSH HL
	PUSH IY
	PUSH DE
	LD B,$08		; loop 8 times
LE233	LD A,(DE)
	XOR (HL)
	LD C,A
	AND (IY+$00)
	JR Z,LE23F
	SET 1,(IX+$10)
LE23F	LD A,(IY+$00)
	XOR C
	LD (HL),A
	dec l ;INC H
	INC DE
	INC DE
	INC DE
	INC IY
	INC IY
	INC IY
	DJNZ LE233
	INC (IX+$18)		; one Column right
	BIT 1,(IX+$10)
	JR Z,LE26E
	LD HL,(LDF0F)
	LD A,(IX+$19)		; get Row
	LD (HL),A
	INC HL
	LD A,(IX+$18)		; get Column
	DEC A
	LD (HL),A
	INC HL
	LD (LDF0F),HL
	RES 1,(IX+$10)
LE26E	POP DE
	INC DE
	POP IY
	INC IY
	POP HL
	inc h ;INC HL
	POP BC
	DJNZ LE22C
	INC (IX+$19)		; one Row down
	LD BC,$0015
	ADD IY,BC
	EX DE,HL
	ADD HL,BC
	EX DE,HL
	POP BC
	DJNZ LE21C
	LD HL,(LB7B9)
	LD BC,(L5B35)
	LD D,(IX+$08)
	LD E,(IX+$07)
	LD (LB7B9),BC
	LD (L5B35),DE
	LD (IX+$08),H
	LD (IX+$07),L
	LD HL,(LDF0F)
	LD (HL),$FF
	RET

LE2A8	LD IX,DiverObj		; Diver object address
	DEC (IX+$0F)
	JR NZ,LE2CC
	LD A,(IX+$0E)		; get speed factor
	LD (IX+$0F),A
	RES 1,(IX+$0D)
	BIT 0,(IX+$0D)
	JR Z,LE2C5
	SET 1,(IX+$0D)
LE2C5	SET 0,(IX+$0D)
	CALL LDFD5
LE2CC	DEC (IX+$20)
	RET NZ
	LD (IX+$20),$14
	CALL ReadKeyboard	; Read keyboard input
	CALL LE364
	RET

; Read keyboard input
; I: IX = Diver object address = DiverObj
ReadKeyboard
	ei ;HACK to make keyboard working
	BIT 3,(IX+$10)
	RET NZ
	call DecodeKeyboard
	ld d,a
	LD E,(IX+$06)		; get Angle
;	LD BC,(L5B38)		; get port for Clockwise key
;	LD A,(L5B3A)		; get bit mask for Clockwise key
;	LD D,A
;	IN A,(C)		; read the port for Clockwise key
;	AND D
	bit 2,a
	jr z,LE2F1 ;JR NZ,LE2F1		; not pressed => skip rotate
; Clockwise key pressed
	INC E			; rotate clockwise
LE2F1	;LD BC,(L5B3B)		; get port for Anticlockwise key
;	LD A,(L5B3D)		; get bit mask for Anticlockwise key
;	LD D,A
;	IN A,(C)		; read the port for Anticlockwise key
;	AND D
	bit 1,a
	jr z,LE2FF ;JR NZ,LE2FF		; not pressed => skip rotate
; Anticlockwise key pressed
	DEC E			; rotate anticlockwise
LE2FF	LD A,$0F
	AND E
	LD (IX+$06),A		; set Angle 0..15
;	LD BC,(L5B3E)		; get port for Accelerate key
;	LD A,(L5B40)		; get bit mask for Accelerate key
;	LD D,A
;	IN A,(C)		; read the port for Accelerate key
;	AND D
	bit 3,d
	jr z,LE31F ;JR NZ,LE31F		; not pressed => skip
; Accelerate key pressed
	LD A,(IX+$0E)
	SET 0,(IX+$10)		; set "moving" bit
	CP $08
	RET Z
	DEC (IX+$0E)
LE31F	;LD BC,(L5B41)		; get port for Decelerate key
	;LD A,(L5B43)		; get bit mask for Decelerate key
	;LD D,A
	;IN A,(C)		; read the port for Decelerate key
	;AND D
	bit 0,d
	ret z ;RET NZ			; not pressed => return
; Decelerate key pressed
	LD A,(IX+$0E)
	CP $14
	JR NZ,LE337
	RES 0,(IX+$10)		; clear "moving" bit - diver stopped
	RET
LE337	INC (IX+$0E)
	RET

; Diver object record
DiverObj
LE33B	DEFB $0A	; (IX+$00) Column 0..255
LE33C	DEFB $0A	; (IX+$01) Row 0..255
LE33D	DEFB $04	; (IX+$02) ??? X shift 0..7, previous value
LE33E	DEFB $04	; (IX+$03) ??? Y shift 0..7, previous value
LE33F	DEFB $00	; (IX+$04) DX value for the Angle, -2..2, see table DF25
LE340	DEFB $00	; (IX+$05) DY value for the Angle, -2..2, see table DF25
LE341	DEFB $04	; (IX+$06) Angle 0..15, initially 4
LE342	DEFW LDF8D	; (IX+$07) ???
LE344	DEFW $0000	; (IX+$09) Sprite address
LE346	DEFW $0000	; (IX+$0B) Sprite address
LE348	DEFB $18	; (IX+$0D) ??? bits 0/1/2/3/4/5/6/7
LE349	DEFB $14	; (IX+$0E) speed factor = 12 20 40 100; 8 max speed, 20 min speed
LE34A	DEFB $14	; (IX+$0F) speed counter
LE34B	DEFB $00	; (IX+$10) ??? bits 0/1/2/3/4/5/6/7; bit0: 1 = diver moving, 0 = diver stopped
LE34C	DEFB $00	; (IX+$11) ??? $00 $FF
LE34D	DEFB $00	; (IX+$12) ??? $00
LE34E	DEFB $08	; (IX+$13) X value
LE34F	DEFB $08	; (IX+$14) Y value
LE350	DEFB $00	; (IX+$15) X shift 0..7
LE351	DEFB $00	; (IX+$16) Y shift 0..7
LE352	DEFB $00	; (IX+$17) ???
LE353	DEFB $00	; (IX+$18) Column 0..31
LE354	DEFB $00	; (IX+$19) Row
LE355	DEFB $0A,$12
LE357	DEFB $03	; (IX+$1C) ???
LE358	DEFB $12,$03
LE35A	DEFB $40	; (IX+$1F) Row??
LE35B	DEFB $00	; (IX+$20) ??? $03
LE35C	DEFB $00	; (IX+$21) ???
LE35D	DEFB $00	; (IX+$22) ??? $F5
LE35E	DEFB $00
LE35F	DEFW $0000	; (IX+$24) Sprite address
LE361	DEFB $00	; (IX+$26) ??? bits 0/1/2/3/4/5/6
LE362	DEFB $00	; (IX+$27) ???
LE363	DEFB $00	; (IX+$28) ???

; I: IX = Diver object address = DiverObj
LE364	BIT 5,(IX+$10)
	RET NZ
	BIT 7,(IX+$10)
	JP Z,LE767
  IF CHEAT_OXY == 0
	LD HL,(OXYGEN)		; get Oxygen level
	LD A,(LEVEL)		; LEVEL
	ADD A,A
	ADD A,A
	ADD A,A			; *8
	ADD A,$0A		; *8 + 10
	LD E,A
	LD D,$00
	LD A,H
	SBC HL,DE		; HL = [Oxygen] - LEVEL * 8 - 10
	LD (OXYGEN),HL		; set Oxygen level
	CP H
	CALL NZ,UpdateOxygen	; => Update Oxygen indicator
  ENDIF
	LD A,(OXYGEN+1)		; get Oxygen high byte
	AND $F0			; out of Oxygen?
	JR NZ,LE393
	CALL DiverExplosion	; Diver explosion
	RET
LE393	LD A,(IX+$22)
	OR A
	JR Z,LE39C
	INC (IX+$22)
LE39C	BIT 4,(IX+$10)
	CALL NZ,LE41B
	LD HL,LDF11
LE3A6	LD A,(HL)
	CP $FF
	RET Z
	BIT 7,(IX+$10)
	RET Z
	LD D,A
	INC HL
	LD E,(HL)
	INC HL
	PUSH HL
	EX DE,HL
	PUSH HL
	CALL GetScrAttrAddr	; Get screen attribute address
	LD A,(HL)		; get attribute
	POP HL
	CP $02			; red on black? (color for relief)
	JP NZ,LE476		; no => Interact with object - like take Oxygen or pick up pearls
;
LE3C0
  IF CHEAT_RELIEF
	JP LE418		; CHEAT_RELIEF: ignore relief / closed clam hit
  ENDIF
	BIT 4,(IX+$10)
	JR NZ,LE418
	LD A,(IX+$22)
	CP $FF
	JR NZ,LE3D2
;
LE3CD	CALL DiverExplosion	; Diver explosion
	JR LE418
LE3D2	OR A
	JR NZ,LE418
	SET 3,(IX+$10)
	LD (IX+$0E),$0A
	RES 0,(IX+$10)		; clear "moving" bit
	SET 4,(IX+$10)
	LD A,(IX+$06)		; get Angle 0..15
	INC A
	AND $0C			; 0 / 4 / 8 / 12
	ADD A,A			; 0 / 8 / 16 / 24
	ADD A,A			; 0 / 16 / 32 / 48
	ADD A,A			; 0 / 32 / 64 / 96
	LD C,A
	LD B,$00
	LD HL,SprDrowned	; Base address for 4 sprites of drowned diver
	ADD HL,BC
	LD (IX+$09),L
	LD (IX+$0B),L
	LD (IX+$0A),H
	LD (IX+$0C),H
	LD (IX+$21),$E6
	LD HL,$0000
	LD (HELD),HL		; reset HELD value
	CALL PrintHeld		; Print HELD number
	RES 6,(IX+$10)
	LD HL,LE604		; Melody address
	CALL PlayMelody		; Play melody
;
LE418	POP HL
	JR LE3A6

; I: IX = Diver object record address
LE41B	INC (IX+$21)
	RET NZ
	LD A,(IX+$06)		; get Angle
	ADD A,$08		; rotate 180 degree
	AND $0F			; 0..15
	LD (IX+$06),A		; set Angle
	LD (IX+$22),$F5
	RES 4,(IX+$10)
	RES 3,(IX+$10)
	LD (IX+$0E),$14
	RET

; Diver explosion
; I: IX = Diver object address = DiverObj
DiverExplosion
	BIT 3,(IX+$26)
	RET NZ
	SET 5,(IX+$10)
	SET 3,(IX+$10)
	RES 0,(IX+$10)		; clear "moving" bit
	LD A,(IX+$06)		; get Angle 0..15
	INC A
	LD HL,SprExplosion	; Explosion sprite address
	LD BC,$0020		; 32
	BIT 2,A
	JR Z,LE45A
	ADD HL,BC		; use the other explosion sprite
LE45A	LD (IX+$09),L
	LD (IX+$0B),L		; set sprite address
	LD (IX+$0A),H
	LD (IX+$0C),H		; set sprite address
	LD HL,LE61C		; Melody address
	CALL PlayMelody		; Play melody
	LD HL,$0000
	LD (HELD),HL		; reset HELD value
	CALL PrintHeld		; Print HELD number
	RET

; Interact with object - like take Oxygen or pick up pearls
; I: IX = Diver object address = DiverObj
; I: HL = column and row
LE476	LD IY,LB07D		; Table of objects on the screen
LE47A	LD A,(IY+$01)		; get address hi
	CP $FF			; end of list marker?
	JP Z,LE915		; yes => exit
	LD D,(IY+$03)		; get row
	LD E,(IY+$02)		; get column
	LD B,A			; record address hi (in LA27E table)
	LD C,(IY+$00)		; record address lo
	LD A,(BC)		; get record flags
	BIT 5,A			; check "oxygen" bit
	JR Z,LE4B2		; not oxygen => jump
	LD A,D
	CP H			; same row?
	JR NZ,LE4AB		; no => jump
	LD A,E
	CP L			; same column?
	JR NZ,LE4AB		; no => jump
; We've got Oxygen object
	LD HL,(OXYGEN)		; get Oxygen level
	LD BC,$00C8		; 200
	ADD HL,BC
	JR NC,LE4A5
	LD HL,$FFFF		; maximum Oxygen
LE4A5	CALL UpdateOxygen	; Update Oxygen indicator
	JP LE418
LE4AB	LD BC,$0004
	ADD IY,BC		; next record in LB07D table
	JR LE47A		; continue the loop
LE4B2	BIT 6,A			; check "chest" bit
	JP Z,LE553		; no => jump
	LD A,H
	CP D			; same row?
	JR NZ,LE4AB
	LD A,L
	CP E			; same column?
	JR Z,LE4C3
	DEC A
	CP E			; previous column?
	JR NZ,LE4AB		; no => continue
; We've got Chest object
LE4C3	BIT 6,(IX+$10)
	JP NZ,LE418
	BIT 4,(IX+$10)
	JP NZ,LE418
	LD A,(BC)
	BIT 3,A
	JP NZ,LE418
	PUSH BC
	INC BC
	INC BC
	INC BC
	LD A,(BC)
	DEC A
	ADD A,A
	LD HL,L5B2B		; get value 75 / 50 / 150 / 100, depending on LEVEL
	LD C,A
	LD B,$00
	ADD HL,BC
	PUSH DE
	CALL LE5D2		; DE = (L5B33) - HELD
	LD C,(HL)
	INC HL
	LD B,(HL)
	DEC HL
	EX DE,HL
	PUSH HL
	PUSH BC
	OR A
	SBC HL,BC
	POP BC
	POP HL
	JR Z,LE4FB
	JR C,LE533
	JR LE509
LE4FB	LD BC,(L5B33)		; get value 25 / 50 / 75 / 100 depending of LEVEL
	LD (HELD),BC		; set HELD value
	SET 6,(IX+$10)
	JR LE510
LE509	LD HL,(HELD)		; get HELD value
	ADD HL,BC
	LD (HELD),HL		; set HELD value
LE510	POP DE
	EX DE,HL
	CALL GetScrAttrAddr	; Get screen attribute address
	LD (HL),$06
	INC HL
	LD (HL),$06
	POP BC
	LD A,(BC)
	SET 3,A
	LD (BC),A
	CALL PrintHeld		; Print HELD number
	CALL LE615		; Play melody LE60B
	LD HL,L5B0F
	INC (HL)
	LD HL,(L5B48)
	INC HL
	LD (L5B48),HL
	JP LE418
LE533	PUSH BC
	EX (SP),HL
	POP BC
	OR A
	SBC HL,BC
	LD A,L
	LD (DE),A
	INC DE
	LD A,H
	LD (DE),A
	LD HL,(L5B33)		; get value 25 / 50 / 75 / 100 depending of LEVEL
	LD (HELD),HL		; set HELD value
	SET 6,(IX+$10)
	POP DE
	POP BC
	CALL PrintHeld		; Print HELD number
	CALL LE615		; Play melody LE60B
	JP LE418
; We've got a shell, big or small
LE553	BIT 1,A			; check "big/small" bit
	JR Z,LE5A9		; big => jump
	LD A,H
	CP D			; same row?
	JP NZ,LE4AB
	LD A,L
	CP E			; same column?
	JP NZ,LE4AB
; We've got small shell object
	BIT 6,(IX+$10)
	JP NZ,LE418
	BIT 4,(IX+$10)
	JP NZ,LE418
	LD A,(BC)
	BIT 3,A
	JP NZ,LE418
	LD HL,(L5B27)		; get value 2 / 4 / 6 / 8, depending on LEVEL
; Update HELD value; HL = value to add
LE578	LD A,(BC)
	BIT 4,A
	JP NZ,LE418
	PUSH BC
	CALL LE5D2		; DE = (L5B33) - HELD
	POP BC
	EX DE,HL
	OR A
	SBC HL,DE
	JP C,LE418
	LD HL,(HELD)		; get HELD value
	ADD HL,DE
	LD (HELD),HL		; set HELD value
	LD A,(BC)
	SET 4,A
	LD (BC),A
	CALL PrintHeld		; Print HELD number
	CALL LE615		; Play melody LE60B
	LD HL,L5B00
	DEC (HL)
	LD HL,(L5B46)
	INC HL
	LD (L5B46),HL
	JP LE418
LE5A9	LD A,H
	CP D			; same row?
	JR Z,LE5B2
	INC A
	CP D			; next row?
	JP NZ,LE4AB
LE5B2	LD A,L
	CP E			; same column?
	JR Z,LE5BB
	DEC A
	CP E			; previous column?
	JP NZ,LE4AB
; We've got big shell object
LE5BB	LD A,(BC)
	BIT 3,A
	JP NZ,LE3C0
	LD A,L
	CP E
	JP NZ,LE418
	BIT 6,(IX+$10)
	JP NZ,LE418
	LD HL,(L5B29)		; get value 5 / 10 / 15 / 20, depending on LEVEL
	JR LE578		; jump to update HELD value

; DE = (L5B33) - HELD
LE5D2	LD BC,(HELD)		; get HELD value
	LD DE,(L5B33)		; get value 25 / 50 / 75 / 100 depending of LEVEL
	EX DE,HL
	OR A
	SBC HL,BC
	EX DE,HL		; DE = (L5B33) - HELD
	RET

; Dividers used to print decimal number
LE5E0	DEFW 10000,1000,100,10,1
	DEFB $FF,$FF

; Play melody
; I: HL = Melody address
PlayMelody
	LD E,(HL)
	LD A,E
	INC A
	RET Z
	LD D,$00
	INC HL
	LD C,(HL)
	INC HL
	LD B,(HL)
	INC HL
	PUSH BC
	EX (SP),HL
	PUSH IX
	CALL ROM_BEEPER		; ROM Beeper subroutine
	DI
	POP IX
	POP HL
	JR PlayMelody		; continue

; Melodies
LE604	DEFB $02,$00,$20,$03,$00,$30,$FF
LE60B	DEFB $06,$00,$01,$06,$00,$03,$06,$80
	DEFB $00,$FF

; Play melody LE60B
LE615	LD HL,LE60B		; Melody address
	CALL PlayMelody		; Play melody
	RET

; Melodies
LE61C	DEFB $01,$00,$20,$01,$00,$18,$02,$00
	DEFB $10,$03,$00,$08,$FF
LE629	DEFB $02,$00,$0A,$03,$15,$0E,$FF
LE630	DEFB $02,$FF
LE632	DEFB $00,$FF
LE634	DEFB $04,$80,$00,$FF
LE638	DEFB $14,$00,$02,$1E,$00,$01,$32,$C8
	DEFB $00,$14,$40,$02,$FF

; Play melody LE629
LE645	PUSH HL
	PUSH DE
	PUSH AF
	LD HL,LE629		; Melody address
	CALL PlayMelody		; Play melody
	POP AF
	POP DE
	POP HL
	RET

; Sprites for 1/2/3 divers on the boat; width 2 chars, 16 bytes each sprite
LE652	DEFB $00,$0C,$00,$1E,$00,$0C,$00,$1E
	DEFB $00,$1E,$00,$1E,$FF,$FF,$FF,$FF
	DEFB $01,$8C,$03,$DE,$01,$8C,$03,$DE
	DEFB $03,$DE,$03,$DE,$FF,$FF,$FF,$FF
	DEFB $31,$8C,$7B,$DE,$31,$8C,$7B,$DE
	DEFB $7B,$DE,$7B,$DE,$FF,$FF,$FF,$FF

; Draw Divers on the Boat
; I: A = lives left (number of divers on the boat)
LE682	OR A
	JR NZ,LE68A
	LD HL,LA41B		; empty sprite address
	JR LE697
LE68A	LD HL,LE652		; Divers on the boat sprite address base
	LD DE,$0010		; shift to next sprite
	DEC A
	JR Z,LE697
	LD B,A			; B = loop counter
LE694	ADD HL,DE
	DJNZ LE694
LE697	LD B,$06		; repeat 6 times
	LD DE,SprBoat+60	; $8CD6 = $8C9A + 60
LE69C	PUSH BC
	LDI			; copy pixels
	LDI			; copy pixels
	LD BC,$0005
	EX DE,HL
	ADD HL,BC
	EX DE,HL
	POP BC
	DJNZ LE69C
	RET

LE6AB	LD IX,DiverObj		; Diver object address
	LD HL,$FFFF		; maximum Oxygen
	LD (OXYGEN),HL		; reset Oxygen level
	LD A,(LIVES)		; get Number of lives
	DEC A			; one less = lives left
	CALL LE682		; Draw Divers on the Boat
	LD A,(LC4F0)
	LD C,A
	SRL A
	SRL A
	SRL A
	DEC A
	AND $1F			; column 0..31
	LD L,A
	LD H,$00
	LD (L5B03),HL		; set Screen position on mini-map
	LD (IX+$1E),$00
	LD (IX+$11),$FE
	LD (IX+$12),$00
	LD (IX+$0D),$00
	LD (IX+$01),$06
	LD (IX+$14),$0C		; set Y value = 12
	SET 3,(IX+$10)
	LD A,(LC4F0+2)
	LD (IX+$27),A
	LD (IX+$04),$00		; clear DX value
	LD (IX+$05),$00		; clear DY value
	LD (IX+$28),$00
	LD (IX+$1A),$06
	LD (IX+$10),$00
	LD (IX+$0E),$14		; speed factor = min speed
	LD (IX+$12),$00
	LD (IX+$11),$FF
	LD A,L			; get screen position on mini-map (column)
	ADD A,A
	ADD A,A
	ADD A,A			; *8
	LD L,A
	LD A,C
	SUB L
	ADD A,$03
	LD (IX+$00),A		; set Column value
	LD C,A
	LD A,(LC4F0+2)
	ADD A,$03
	BIT 3,A
	JR Z,LE72C
	INC (IX+$00)		; one Column right
	AND $07			; 0..7
LE72C	ADD A,A
	LD (IX+$13),A		; set X value
	LD A,(LIVES)		; get Number of lives
	CP $03
	JR Z,LE759
	LD B,$0A
	CP $02
	JR Z,LE73F
	LD B,$14
LE73F	LD A,(IX+$13)		; get X value
	ADD A,B
LE743	SUB $10
	JR C,LE74C
	INC (IX+$00)		; one Column right
	JR LE743
LE74C	ADD A,$10
	LD (IX+$13),A		; set X value
	LD (IX+$20),$01
	LD (IX+$0F),$02
LE759	LD HL,SprDiverSit	; Sprite diver sitting on the boat
	LD (IX+$24),L		; set sprite address
	LD (IX+$25),H
	SET 0,(IX+$10)		; set "moving" bit
	RET

LE767	BIT 0,(IX+$26)
	JR NZ,LE7E0
	LD (IX+$20),$03
	LD (IX+$0F),$03
	LD (IX+$04),$00		; clear DX value
	LD (IX+$05),$00		; clear DY value
	LD A,(LC4F0+2)
	CP (IX+$27)
	JR Z,LE78C
	LD (IX+$27),A
	LD (IX+$04),$FE		; set DX value = -2
LE78C	;LD BC,(L5B3E)		; get port for Accelerate key
	;LD A,(L5B40)		; get bit mask for Accelerate key
	;LD L,A
	;IN A,(C)		; Read from port for the key
	;AND L
	ei ;HACK to make keyboard working
	call DecodeKeyboard
	bit 3,a
	ret z ;RET NZ		; Return if not pressed
	LD HL,LE634		; Melody address
	CALL PlayMelody		; Play melody
	BIT 2,(IX+$26)
	JR NZ,LE7C2
	LD (IX+$0E),$0C
	LD HL,SprDiverSit	; Sprite diver sitting on the boat
	LD (IX+$24),L		; set sprite address
	LD (IX+$25),H
	SET 0,(IX+$26)
	LD (IX+$04),$FF		; set DX value = -1
	LD (IX+$05),$02		; set DY value = +2
	SET 1,(IX+$26)
	RET
LE7C2	LD HL,SprDiver1		; Sprite diver directing up-right
	LD (IX+$0E),$14		; speed factor = min speed
	LD (IX+$24),L		; set sprite address
	LD (IX+$25),H
	SET 0,(IX+$26)
	LD (IX+$04),$02		; set DX value = +2
	LD (IX+$05),$02		; set DY value = +2
	SET 1,(IX+$26)
	RET
LE7E0	BIT 2,(IX+$26)
	JR NZ,LE837
	BIT 1,(IX+$26)
	JR Z,LE7F1
	RES 1,(IX+$26)
	RET
LE7F1	SET 1,(IX+$26)
	LD H,(IX+$25)		; get sprite address
	LD L,(IX+$24)
	LD BC,$0020
	ADD HL,BC
	LD (IX+$24),L		; set sprite address
	LD (IX+$25),H
	LD DE,L9C4C		; address right after last diver sprite
	OR A
	SBC HL,DE
	RET NZ
	LD (IX+$0E),$14
	LD (IX+$04),$00		; clear DX value
	LD (IX+$05),$00		; clear DY value
	LD (IX+$06),$04		; set initial Angle = 4
	SET 7,(IX+$10)
	RES 0,(IX+$10)		; clear "moving" bit
	LD A,(LEVEL)		; LEVEL
	LD C,A
	LD A,$05
	SUB C			; A = 5 - LEVEL
	LD (IX+$1E),A
	LD (IX+$28),$07
	RES 3,(IX+$10)
	RET
LE837	BIT 3,(IX+$26)
	JR NZ,LE88A
	BIT 1,(IX+$26)
	JR Z,LE848
	RES 1,(IX+$26)
	RET
LE848	SET 1,(IX+$26)
	LD H,(IX+$25)		; get sprite address
	LD L,(IX+$24)
	LD BC,$0080
	ADD HL,BC
	LD (IX+$24),L		; set sprite address
	LD (IX+$25),H
	LD DE,SprDiver5
	OR A
	SBC HL,DE
	RET NZ
	LD (IX+$04),$00		; clear DX value
	LD (IX+$05),$00		; clear DY value
	LD (IX+$06),$04
	SET 7,(IX+$10)
	RES 0,(IX+$10)		; clear "moving" bit
	LD A,(LEVEL)		; LEVEL
	LD C,A
	LD A,$05
	SUB C			; A = 5 - LEVEL
	LD (IX+$1E),A
	LD (IX+$28),$07
	RES 3,(IX+$10)
	RET
LE88A	LD (IX+$1E),$00
	LD HL,LE632
	INC (HL)
	DEC HL
	DEC HL			; HL = LE630
	CALL PlayMelody		; Play melody
	LD A,(IX+$1A)
	CP $06
	JR NZ,LE8FA
	LD A,(IX+$03)
	CP $07
	JR NZ,LE8FA
	LD HL,(HELD)		; get HELD value
	LD DE,(SCORE)		; get Score number
	ADD HL,DE
	LD (SCORE),HL		; set Score number
	LD HL,$0000
	LD (HELD),HL		; reset HELD value
	CALL PrintHeld		; Print HELD number
	CALL PrintScore		; Print score number
	LD HL,$FFFF
	CALL UpdateOxygen	; Update Oxygen indicator
	RES 6,(IX+$10)
	RES 3,(IX+$26)
	RES 0,(IX+$26)
	LD A,(L5B00)
	CP $08
	JR NZ,LE8FA
	LD A,(L5B0F)
	CP $03
	JR NZ,LE8FA
	LD HL,(L5B31)		; get value depending on LEVEL
	LD DE,(SCORE)		; get Score number
	ADD HL,DE
	LD (SCORE),HL		; set Score number
	CALL PrintScore		; Print score number
	SET 4,(IX+$26)
	LD HL,LE638		; Melody address
	CALL PlayMelody		; Play melody
	LD HL,LE638		; Melody address
	CALL PlayMelody		; Play melody
LE8FA	LD (IX+$04),$00		; clear DX value
	LD (IX+$0F),$03
	LD (IX+$20),$03
	LD A,(LC4F0+2)
	CP (IX+$27)
	RET Z
	LD (IX+$27),A
	LD (IX+$04),$FE		; DX value = -2
	RET

LE915	LD DE,(LC4F0)
	BIT 5,(IX+$10)
	JP NZ,LE418
	LD BC,(L5B0B)		; get screen position on 256x256 map
	LD A,E
	SUB C
	ADD A,$07
	LD C,A
	CP L
  IF CHEAT_SPECIES
	JP NZ,LE418		; CHEAT_SPECIES: ignore non-boat (living thing) collision
  ELSE
	JP NZ,LE3CD
  ENDIF
	LD A,D
	SUB B
	INC A
	CP H
	JR Z,LE93C
	INC A
	CP H
	JR Z,LE93C
	INC A
	CP H
  IF CHEAT_SPECIES
	JP NZ,LE418		; CHEAT_SPECIES: ignore non-boat (living thing) collision
  ELSE
	JP NZ,LE3CD
  ENDIF
LE93C	SET 1,(IX+$0D)
	RES 0,(IX+$0D)
	PUSH IY
	PUSH BC
	LD (IX+$04),$00		; clear DX value
	LD HL,(L5B03)		; get Screen position on mini-map
	PUSH HL
	CALL LDFD5
	POP HL
	RES 7,(IX+$10)
	SET 0,(IX+$26)
	SET 2,(IX+$26)
	SET 3,(IX+$26)
	LD A,(LC4F0+2)
	LD (IX+$27),A
	LD (IX+$04),$00		; clear DX value
	LD (IX+$05),$FF		; set DY = -1
	POP BC
	LD A,(L5B03)		; get Screen position (column) on mini-map
	CP L
	JR Z,LE97C
	LD A,$08
	ADD A,C
	LD C,A
LE97C	LD (IX+$00),C		; set Column value
	LD A,(IX+$27)
	ADD A,A
	LD (IX+$13),A
	LD (IX+$28),$00
	LD HL,SprDiverClimb	; Sprite diver climbing on the boat
	LD (IX+$24),L		; set sprite address
	LD (IX+$25),H		;
	SET 0,(IX+$0D)
	RES 1,(IX+$0D)
	CALL LDFD5
	POP IY
	LD (IX+$0F),$03
	LD (IX+$20),$03
	LD HL,LE632
	LD (HL),$00
	JP LE418

; Plus one live
; I: IX = Diver object address = DiverObj
LE9B0	SET 5,(IX+$26)
	PUSH HL
	PUSH DE
	;LD HL,(LDE59)		; get address in attributes for Lives indicator
	;LD (HL),$0D		; clean old value from the screen
	;LD DE,$0040		; 2 char lines lower
	;ADD HL,DE
	;LD (LDE59),HL		; set address in attributes for Lives indicator
	;LD (HL),$4F		; indicate new value
	;TODO: UpdateLives
	LD HL,LIVES		; address for Number of lives
	LD A,(HL)		; get number of lives
	INC (HL)		; one more live
	PUSH BC
	CALL LE682		; Draw Divers on the Boat
	POP BC
	POP DE
	POP HL
	RET

; After game finished
; Update HISCORE if the finished game's SCORE beats it
LEA7A	LD HL,(SCORE)		; get Score number
	LD DE,(HISCORE)		; get current High Score
	LD A,L
	SUB E
	LD A,H
	SBC A,D
	JR C,LEADE		; SCORE < HISCORE => no new high score
	LD (HISCORE),HL		; SCORE >= HISCORE => store new High Score
;	fall through to LEADE (Game Over screen)
;
LEADE	LD A,$0F
	;LD (ATTR_P),A		; set ATTR-P - Permanent current colours
	call ClearGameScreen
	;LD HL,StrGameOver
	;LD BC,$0607		; row 6, column 7
	;LD DE,PrintCharRt	; Procedure Print char and shift right
	;CALL PrintStringEx	; Print "GAME OVER"
	ret			; => Main menu

; Redefine keys - REMOVED

; Sound??
LECEB	LD C,$FE
	LD B,C
LECEE	IN A,(C)
	AND $1F			; 0..31
	XOR $1F
	JR NZ,LECFA
	RLC B
	JR LECEE
LECFA	PUSH AF
	PUSH BC
	PUSH IX
	PUSH DE
	LD HL,LEDD5
LED02	LD E,(HL)
	LD A,E
	INC A
	JR Z,LED16
	LD D,$00
	INC HL
	LD C,(HL)
	INC HL
	LD B,(HL)
	INC HL
	PUSH BC
	EX (SP),HL
	CALL ROM_BEEPER		; ROM BEEPER subroutine
	POP HL
	JR LED02
LED16	POP DE
	POP IX
	POP BC
	POP AF
	LD L,A
LED1C	IN A,(C)
	AND L
	JR Z,LED1C
	LD A,L
	RET

; UDG symbols $90..$93 used for Redefine keys - REMOVED
; Text for Redefine keys - REMOVED

; Melody
LEDD5	DEFB $12,$80,$01,$1E,$00,$01,$0C,$40
	DEFB $01,$FF

; Starting point
Start
;	LD A,$08
;	LD (FLAGS2),A
	LD A,$0F
	;LD (ATTR_P),A		; set ATTR-P - Permanent current colours
	LD HL,(FRAMES)		; get FRAMES - Frame counter
	LD (RANDOM),HL		; set current random
	;LD HL,L5B4D
	;BIT 0,(HL)
	;JP NZ,LEEA7
	;SET 0,(HL)
; Main menu - print the signs and wait for input
LEDFE:
	call ShowGamePanel
	;LD DE,LEF70
	;LD BC,$000F
	;CALL ROM_PRSTRING	; ROM call PR-STRING
	LD HL,StrControls
	LD BC,$0200		; row, column
	LD DE,PrintCharRt	; Procedure Print char and shift right
	CALL PrintStringEx
	inc HL ;LD HL,StrControls1
	LD BC,$0300		; row, column
	CALL PrintString
	inc HL ;LD HL,StrControls2
	LD BC,$0500		; row, column
	CALL PrintString
	inc HL ;LD HL,StrControls3
	LD BC,$0600		; row, column
	CALL PrintString
	inc HL ;LD HL,StrControls4
	LD BC,$0702		; row, column
	CALL PrintString
	inc HL ;LD HL,StrControls5
	LD BC,$0800		; row, column
	CALL PrintString
	inc HL ;LD HL,StrControls6
	LD BC,$0902		; row, column
	CALL PrintString
	inc HL ;LD HL,StrPrompt1
	LD BC,$1300		; row, column
	CALL PrintString
	inc HL ;LD HL,StrPrompt2
	LD BC,$1400		; row, column
	CALL PrintString
LEE07:	LD HL,StrSkill		; "SKILL"
	LD BC,$0E04		; row, column
	LD DE,PrintCharRt	; Procedure Print char and shift right
	CALL PrintStringEx
	EI
;
; 	LD B,$0A		; repeat 10 times
; LEE12	PUSH BC
; 	LD HL,LEDD5
; 	CALL PlayMelody		; Play melody
; 	POP BC
; 	DJNZ LEE12

LEE1C
;TODO: WaitKeyUp
	LD HL,$0000
	LD (FRAMES),HL		; reset FRAMES - Frame counter
;LEE22	CALL LEEAD		; attract-mode
;	LD A,(KSTATE5)
;	OR A			; key pressed?
;	JR NZ,LEE22
LEE2C	CALL LEEAD		; attract-mode
; Skill keys 1-4 are on KeyLine2, which DecodeKeyboard/KSTATE5 does not see,
; so check them directly every loop iteration.
	call DecodeKeyLine2	; A = 1..4 if a skill key is pressed; 0 = none
	or A
	jr z,.notskill
	add $10			; skill number -> digit char '1'..'4'
	ld (SkillChar),A	; update the SKILL SELECTED line
	jp LEE07		; re-print SKILL and keep waiting
.notskill:
	LD A,(KSTATE5)		; movement / fire key pressed?
	OR A
	JR Z,LEE2C		; nothing pressed => keep waiting
	call DecodeKeyboard
	and $08			; check for Accel key
	jp z,LEE1C		; not Accel => continue menu loop
;
; Starting the game
START_GAME
; First clear the screen, so user see immediate response on the key press
	LD A,$30
	CALL ClearScreenFillAttr	; Clear screen with attribute A = $30
; Get SKILL selected and put in LEVEL variable
	ld A,(SkillChar)
	sub $10			; 1..4
	ld (LEVEL),A
;
	LD HL,LEDD5
	CALL PlayMelody		; Play melody
	LD HL,$0000
	LD (L5B46),HL
	LD (L5B48),HL
	CALL Game		; Game
	CALL LEA7A		; Update HISCORE, clear game screen
	jp LEDFE		; => Main menu

; Attract-mode / idle demo for the menu
LEEAD
	call DecodeKeyboard
	OR A			; key pressed?
	ret nz
;
	LD A,(FRAMES+1)		; get FRAMES hi byte
	CP 4			; wait $0400 frames ~= 20 sec
	EI
	RET NZ
	LD A,$04
	LD (LEVEL),A		; set Game level = 4
	LD A,$0D
	CALL ClearScreenFillAttr	; Clear screen with attribute A = $0D
	call ShowGamePanel
;	LD A,$01
;	OUT ($FE),A
	PUSH IX
	PUSH IY
	DI
	CALL PrepareMiniMap	; Prepare the world MiniMap table
	CALL InitLevelVars	; Initialize variables depending of LEVEL
	CALL LBEDB
	LD HL,$0518
	LD (L5B03),HL		; set Screen position on mini-map
	CALL DrawGameScr	; Draw game screen
	LD BC,$1405		; row/column
	LD DE,PrintCharRt	; Procedure Print char and shift right
	LD HL,StrPressAny	; "PRESS ANY KEY"
	CALL PrintStringEx	; Print string
	; LD BC,$001A		; row/column
	; LD DE,PrintCharDn	; Procedure Print char and shift down
	; LD HL,LEF3A
	; CALL PrintStringEx	; Print string
	; INC HL
	; LD BC,$001B		; row/column
	; CALL PrintString	; Print string
	; INC HL
	; LD BC,$0D1D		; row/column
	; CALL PrintString	; Print string
	; INC HL
	; LD BC,$0D1E		; row/column
	; CALL PrintString	; Print string
	CALL LBDBA
	POP IY
	POP IX
LEF12	PUSH IX
	PUSH IY
	CALL LB213
	CALL LBDEA
	POP IY
	POP IX
	;EI
	PUSH HL
	POP HL
	PUSH HL
	POP HL
	;CALL ROM_KEYBOARD	; scan keyboard
	;LD A,(KSTATE5)
	call DecodeKeyboard
	OR A			; key pressed?
	;DI
	JR Z,LEF12
	;EI
; key pressed - leave the attract demo and go back to the menu
MenuFromDemo
	call DecodeKeyboard	; wait until the key is released
	or a
	jr nz,MenuFromDemo
	call LEADE		; clear the screen
	pop hl			; HACK: drop the LEEAD return into the wait loop
	jp LEDFE		; redraw the menu signs and wait for input

; LEF3A	DEFB $89,$8A,$00,$8B,$8C,$00,$8D,$8E
; 	DEFB $00,$8F,$90,$00,$91,$92,$FF
; 	DEFB $93,$94,$00,$95,$96,$00,$97,$98
; 	DEFB $00,$99,$9A,$00,$9B,$9C,$FF
; 	DEFB $9D,$9E,$00,$9F,$A0,$00,$A1,$A2
; 	DEFB $00,$A3,$A4,$FF,$A5,$A6,$00,$A7
; 	DEFB $A8,$00,$A9,$AA,$00,$AB,$AC,$FF
; LEF70	DEFB $12,$00,$13,$00,$14,$00,$15,$00
; 	DEFB $11,$00,$10,$07,$16,$15,$01
