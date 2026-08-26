;----------------------------------------------------------------------------
; Sprites

	DISPLAY "Sprites start: ", /A, $
	INCLUDE "scubasprt.asm"

;----------------------------------------------------------------------------

L9C50	DEFB $00	; $00 = no Octopus, $01 = we have Octopus on the game screen
L9C51	DEFW $0000	; Octopus screen address
L9C53	DEFW LA41B	; Octopus previous sprite address or LA41B for empty sprite
L9C55	DEFB $04	; Octopus phase

; Draw game screen
; Draws 3x3 blocks = 24x24 tiles, draws Octopus if present, draws static objects on the screen.
; I: HL	Screen position on mini-map
DrawGameScr
	DI
	IFNDEF GEOM
	LD DE,$C4FF		; левый верхний байт поля: столбец 4, lo $FF = экранная строка 0
	ELSE
	LD DE,$C0BF		; левый верхний байт поля: столбец 0, lo $BF = экранная строка 64
	ENDIF
	XOR A
	LD (L9C50),A		; no Octopus by default
	ld (il_hl),hl
	ld hl,(z80_ix)
	push hl
	ld hl,(il_hl)
	ld (il_hl),hl
	ld hl,(z80_iy)
	push hl
	ld hl,(il_hl)
	ld (il_hl),hl	; screen attributes start address
	ld hl,SCRATTR
	ld (z80_ix),hl
	ld hl,(il_hl)
	LD B,$03		; loop counter; game screen 3 blocks high = 24 tiles
	EX DE,HL		; now DE = screen position, HL = address on the screen
L9C69	PUSH BC
	LD B,$03		; loop counter; game screen 3 blocks wide = 24 tiles
L9C6C	PUSH BC
	ld (il_hl),hl
	ld hl,(z80_ix)
	push hl
	ld hl,(il_hl)
	EX DE,HL		; now HL = screen position, DE = screen address
	CALL MiniMap_Get	; Calc address in MiniMap and Get block number
	PUSH AF
	EX DE,HL
	CP $1C			; place for Octopus?
	jp NZ,L9C89	; no => skip
	LD (L9C51),HL		; save the Octopus screen address
	PUSH HL
	LD HL,LA41B		; empty sprite address
	LD (L9C53),HL		; set previous sprite
	POP HL
	LD A,$01		; flag value
	LD (L9C50),A		; we have the Octopus on the screen
L9C89	INC E
	LD A,E
	AND $1F			; 0..31
	LD E,A
	POP AF
	PUSH DE
	PUSH HL
	PUSH HL
; АДРЕС БЛОКА РЕЛЬЕФА ПО ЕГО НОМЕРУ (A). Штатно: HL = A*256, HL >>= 2 (то есть
; A*64), плюс база LA4DD. Под выселением блок n лежит в ломте n, значит номер
; блока становится СТАРШИМ байтом адреса, а младший — началом ломтя (192).
; Смещения внутри блока (IY бежит по 64 тайлам инкрементом) не меняются вовсе.
	IFDEF EVICT
	add a,RELIEF_HI
	ld h,a
	ld l,192
	ELSE
	LD H,A
	LD L,$00
	ld (il_a),a
	ld a,H
	and a
	rra
	ld H,a
	ld a,(il_a)
	ld (il_a),a
	ld a,L
	rra
	ld L,a
	ld a,(il_a)
	ld (il_a),a
	ld a,H
	and a
	rra
	ld H,a
	ld a,(il_a)
	ld (il_a),a
	ld a,L
	rra
	ld L,a
	ld a,(il_a)
	LD DE,LA4DD		; base address for relief blocks, 8x8 tiles each block
	ADD HL,DE		; now HL = address of the block
	ENDIF
	PUSH HL
	ld (il_hl),hl	; now IY = address of the block
	pop hl
	ld (z80_iy),hl
	ld hl,(il_hl)
	POP HL
	LD B,$08		; repeat 8 times - block height in tiles
L9CA7	PUSH BC
	LD B,$08		; repeat 8 times - block width in tiles
L9CAA	PUSH BC
	call z80_lda_Y	; get tile number
	defb $00
	PUSH HL
	PUSH HL
	AND $7F			; 0..127
	LD L,A
	LD H,$00
	ADD HL,HL
	ADD HL,HL
	ADD HL,HL		; *8
	LD BC,L9134		; base address for relief tiles, 8x8 pixels each tile
	ADD HL,BC		; now HL = tile address
	POP DE			; DE = screen address
	LD B,$08		; repeat 8 times - tile height
L9CBF	LD A,(HL)		; get tile pixels
	LD (DE),A		; write to the screen
	ld a,d
	xor $20		; switch screen plane
	ld d,a
	IFDEF DITHER
; --- ДИЗЕРИНГ РЕЛЬЕФА (-DDITHER) -------------------------------------------
; Тайл кладётся в обе плоскости одинаковыми битами, поэтому рельеф — сплошной
; индекс 3. Здесь ВТОРАЯ плоскость получает его через шахматную маску: половина
; пикселей остаётся индексом 3, половина падает в 2, и на экране получается
; смесь двух чернил вместо одного. Никаких новых цветов в палитре для этого не
; нужно — только они сами, через глаз.
; ДИЗЕРИМ ИМЕННО ВТОРУЮ ПЛОСКОСТЬ, И ЭТО НЕ ВСЁ РАВНО: первая (0xC000) — та, по
; которой считается столкновение дайвера (LE233 берёт пересечение своей маски с
; её содержимым). Прореди её — и дайвер начнёт проваливаться сквозь камень.
; Маска чередуется по строкам, иначе вместо шахматки выйдут вертикальные полосы.
	ld a,e
	and 1
	ld a,(hl)
	jp z,L9CBF_even
	and 55h
	jp L9CBF_put
L9CBF_even:
	and 0AAh
L9CBF_put:
	ELSE
	LD A,(HL)
	ENDIF
	LD (DE),A	; write to the other plane
	INC HL			; next tile byte
	dec e ;INC D		; next pixel row
	dec b
	jp nz,L9CBF
	POP HL
	LD A,(L5B03+1)		; get Screen position on mini-map, row value
	OR A
	jp NZ,L9CD5
	LD A,H
	AND $18			; 0 / 8 / 16 / 24
	jp NZ,L9CD5
	call DrawSurface
	LD C,$29		; blue on cyan (sky)
	jp L9CEB
L9CD5	LD C,$06		; yellow on black
	call z80_lda_Y
	defb $00
	OR A
	jp Z,L9CEB
	CP $32
	jp Z,L9CEB
	LD C,$02		; red on black (color for relief)
	call z80_bitY
	defb $00
	and 1<<(7)
	ld a,(il_a)
	jp Z,L9CEB
	LD C,$06		; yellow on black
L9CEB:
	call z80_stc_X	; set screen attribute
	defb $00
	ld (il_hl),hl
	ld hl,(z80_iy)
	inc hl
	ld (z80_iy),hl
	ld hl,(il_hl)
	ld (il_hl),hl
	ld hl,(z80_ix)
	inc hl
	ld (z80_ix),hl
	ld hl,(il_hl)
	inc h ;INC L		; next column
	POP BC
	dec b	; continue horizontal loop for tiles in the block
	jp nz,L9CAA
	LD BC,$0018		; 24
	ld (il_hl),hl
	ld hl,(z80_ix)
	add hl,bc
	ld (z80_ix),hl
	ld hl,(il_hl)
	ld a,h
	sub 8
	ld h,a
	ld a,l
	sub 8
	ld l,a
	POP BC
	dec b	; continue vertical loop for tiles in the block
	jp nz,L9CA7
	POP HL
	ld a,h
	add a,8
	ld h,a
	POP DE
	ld (il_hl),hl
	pop hl
	ld (z80_ix),hl
	ld hl,(il_hl)
	LD BC,$0008
	ld (il_hl),hl
	ld hl,(z80_ix)
	add hl,bc
	ld (z80_ix),hl
	ld hl,(il_hl)
	POP BC
	DEC B
	JP NZ,L9C6C		; continue horizontal loop for blocks on the screen
	ld a,h
	sub 24			; назад в первый столбец поля (было: and $E0 — сброс в столбец 0,
	ld h,a			; но теперь поле начинается со столбца 4, а не 0)
	ld a,l
	sub 64
	ld l,a
	LD BC,$00E8
	ld (il_hl),hl
	ld hl,(z80_ix)
	add hl,bc
	ld (z80_ix),hl
	ld hl,(il_hl)
	INC D
	DEC E
	DEC E
	DEC E
	LD A,E
	AND $1F			; 0..31
	LD E,A
	POP BC
	DEC B
	JP NZ,L9C69		; continue vertical loop for blocks on the screen
	LD A,(L9C50)		; get Octopus flag
	OR A			; do we have the Octopus on the screen?
	jp Z,L9D38	; no => skip
	LD A,(L9C55)		; get Octopus phase
	CALL LB346		; Draw Octopus
L9D38:
	ld (il_hl),hl
	pop hl
	ld (z80_iy),hl
	ld hl,(il_hl)
L9D3A:
	ld (il_hl),hl
	pop hl
	ld (z80_ix),hl
	ld hl,(il_hl)
L9D3C	CALL DrawStatics	; Draw static objects on the screen; prepare LB07D table
	ei
	RET

DrawSurface
	push hl
	IFNDEF GEOM
	ld hl,$E4BF		; линия поверхности воды: столбец 4, lo $BF = экранная строка 64
	ELSE
	ld hl,$E07F		; поверхность воды: столбец 0, lo $7F = экранная строка 128
	ENDIF			; (те же 64 строки от верха поля, что и раньше)
	ld b,24
DrawSurface_1
	ld (hl),$FF
	inc h			; next column
	dec b
	jp nz,DrawSurface_1
	pop hl
	ret

; Calculate address in the MiniMap table
; I: HL	H = row, L = column 0..31
; O: HL = address in the MiniMap table
MiniMap_Addr
	LD A,L
	LD L,$00
	ld (il_a),a
	ld a,H
	and a
	rra
	ld H,a
	ld a,(il_a)
	ld (il_a),a
	ld a,L
	rra
	ld L,a
	ld a,(il_a)
	ld (il_a),a
	ld a,H
	and a
	rra
	ld H,a
	ld a,(il_a)
	ld (il_a),a
	ld a,L
	rra
	ld L,a
	ld a,(il_a)
	ld (il_a),a
	ld a,H
	and a
	rra
	ld H,a
	ld a,(il_a)
	ld (il_a),a	; HL shifted right 3 bits
	ld a,L
	rra
	ld L,a
	ld a,(il_a)
	OR L
	LD L,A			; HL := H * 32 + L
	LD DE,MiniMap
	ADD HL,DE		; HL := MiniMap + H * 32 + L
	RET

; Calculate address in the MiniMap table and Get block number
; I: H = row, L = column 0..31
; O: A = value
MiniMap_Get
	PUSH HL
	PUSH DE
	CALL MiniMap_Addr	; Calculate address in the MiniMap table
	LD A,(HL)		; get value
	POP DE
	POP HL
	RET

; Check value in the MiniMap table, if row and column in range 0..31
; I: H = row, L = column
; If column or row is out of range 0..31 - returns flag Z=0;
; else, gets value from MiniMap table;
; if this value is $01, returns flag Z=1, in other case flag Z=0.
MiniMap_Check
	PUSH HL
	PUSH AF
	LD A,L
	AND $E0			; check Column for range 0..31
	jp NZ,L9D73
	LD A,H
	AND $E0			; check Row for range 0..31
	jp NZ,L9D73
	CALL MiniMap_Get	; Calc address in MiniMap and Get block number
	LD L,A
	POP AF
	DEC L
	POP HL
	RET
L9D73	POP AF
	LD L,$01
	INC L
	POP HL
	RET

; Calculate address in the MiniMap table and Set block number
; I: H = row, L = column 0..31, A = value to set
MiniMap_Set
	PUSH HL
	PUSH DE
	PUSH AF
	CALL MiniMap_Addr	; Calculate address in the MiniMap table
	POP AF
	LD (HL),A		; set value
	POP DE
	POP HL
	RET

; Random
; Calculate next number in pseudo-random sequence
NextRandom
	LD HL,(RANDOM)		; get current Random
	LD D,H
	LD E,L
	ADD HL,HL		; x2
	ADD HL,HL		; x4
	ADD HL,HL		; x8
	ADD HL,HL		; x16
	PUSH HL
	ADD HL,HL		; x32
	EX (SP),HL
	OR A
	ld (il_a),a	; HL = x15
	ld a,l
	sbc a,e
	ld l,a
	ld a,h
	sbc a,d
	ld h,a
	ld a,(il_a)
	POP BC			; BC = x32
	ADD HL,BC		; x47
	ADD HL,HL		; x94
	ADD HL,HL		; x188
	ADD HL,HL		; x376
	ADD HL,DE		; x377
	ADD HL,HL		; x754
	ADD HL,HL		; x1508
	ADD HL,DE		; x1509
	LD DE,$0029
	ADD HL,DE
	LD (RANDOM),HL		; (RANDOM) := (RANDOM) * 1509 + 41
	RET

; L9DA4	DEFB $AF

; Fill block at HL with A
; I: HL = block address, A = value, B = length of the block to fill
FillBlock
	LD (HL),A
	INC HL
	dec b
	jp nz,FillBlock
	RET

; Prepare the MiniMap table
PrepareMiniMap
	LD HL,MiniMap+3*32+2	; $ACBF = $AC5D + 3 * 32 + 2: row 3 column 2
	LD B,$1C
	LD A,$16
	CALL FillBlock		; Fill block at $ACBF with $16
	LD (HL),$06		; ($ACDB) <- $06
	INC HL			; HL = $ACDC
	LD B,$22
	LD A,$01
	CALL FillBlock		; Fill block at $ACDC with $01
	INC HL			; HL = $ACFF
	LD A,$1A
	LD B,$1C
	CALL FillBlock		; Fill block at $ACFF with $1A
	INC HL
	INC HL
	LD (HL),$02
	LD HL,MiniMap+6*32+31	; $AD3C = $AC5D + 6 * 32 + 31; row 6 column 31
	LD (HL),$06		; ($AD3C) <- $06
	INC HL
	INC HL
	INC HL			; HL = $AD3F
	LD B,$1C
	LD A,$16
	CALL FillBlock		; Fill block at $AD3F with $16
	INC HL
	INC HL			; HL = $AD5D; $AD5D = $AC5D + $100: row 8 column 0
	LD B,$00
	LD A,$01
	CALL FillBlock		; Fill block at $AD5D with $01, 256 bytes: fill rows 8..15
	CALL FillBlock		; Fill block at $AE5D with $01, 256 bytes: fill rows 16..23
	CALL FillBlock		; Fill block at $AF5D with $01, 256 bytes: fill rows 24..31
	CALL NextRandom		; Calculate next random value
	LD A,H
	AND $0F			; 0..15
	ADD A,$07		; A = (Random:H) & 15 + 7 => 7..22
	LD L,A			; column
	LD H,$03		; row = 3
	XOR A
	CALL MiniMap_Set	; Calc address in MiniMap and Set block number = 0
	INC L			; next column; column = 4
	CALL MiniMap_Set	; Calc address in MiniMap and Set block number = 0
	LD H,$05		; row = 5
	CALL MiniMap_Set	; Calc address in MiniMap and set block number = 0
	DEC L			; previous column; column = 3
	CALL MiniMap_Set	; Calc address in MiniMap and Set block number = 0
	DEC H			; previous row; row = 4
	LD A,$1C		; $1C = place for Octopus, left block
	CALL MiniMap_Set	; Calc address in MiniMap and Set block number = $1C
	INC A			; = $1D = place for Octopus, right block
	INC L			; next column; column = 4
	CALL MiniMap_Set	; Calc address in MiniMap and Set block number = $1D
	LD HL,MiniMap+3*32	; $ACBD = $AC5D + 3 * 32: row 3 column 0
	LD B,$A0		; repeat 160 times = 5 rows, rows 3..7
L9E14	LD A,(HL)		; get block number
	CP $02			; block $02 is dead end to the left, exit to the right
	jp Z,L9E2A
	CP $06			; block $06 is dead end to the right, exit to the left
	jp Z,L9E2A
	CP $16			; block $16 looks like floor (seabed)
	jp Z,L9E2A
	CP $1A			; block $1A looks like ceiling
	jp Z,L9E2A
L9E25	INC HL			; to the next block
	dec b
	jp nz,L9E14
	jp L9E38
; Block $02 / $06 / $16 / $1A
L9E2A	PUSH BC
	PUSH HL
	CALL NextRandom		; Calculate next random value
	ld (il_a),a
	ld a,H
	and 1<<(5)
	ld a,(il_a)
	POP HL
	POP BC
	jp Z,L9E25
	INC (HL)		; increase block number
	jp L9E25	; continue the loop
; Coming here after the loop end; continue to build the map
L9E38	LD A,$02		; initial trunk width
	LD (L5B09),A		; set trunk width
	CALL NextRandom		; Calculate next random value
	LD A,H
	AND $0F			; 0..15
	ADD A,$07		; 7..22
	LD L,A
	LD H,$07		; row = 7
	XOR A
	CALL MiniMap_Set	; Calc address in MiniMap and Set block number = 0
	INC L			; next column
	CALL MiniMap_Set	; Calc address in MiniMap and Set block number = 0
	INC H			; next row
	LD A,$1D		; $1D = place for Octopus, right block
	CALL MiniMap_Set	; Calc address in MiniMap and Set block number = $1D - Octopus place
	DEC A			; = $1C = place for Octopus, left block
	DEC L			; previous column
	CALL MiniMap_Set	; Calc address in MiniMap and Set block number = $1C - Octopus place
	DEC L			; previous column
; Building the labyrinth down from the hole with Octopus
	LD (L5B07),HL		; store the octopus place as the current trunk position
L9E5F	LD HL,(L5B07)		; get current trunk position
	INC H			; next row
	LD (L5B07),HL		; set current trunk position
	LD A,(L5B09)		; get trunk width
	LD (L5B0A),A		; and save it
	LD A,(LEVEL)		; LEVEL
	ADD A,A			; *2
	ADD A,A			; *4
	ADD A,$10		; now A = [Game level] * 4 + 16 => 20 / 24 / 28 / 32
	LD C,A
	DEC C			; now C = 19 / 23 / 27 / 31 - row where the labirinth ends
	CP H			; row = A ?
	jp NZ,L9E99	; no => jump
; The labyrinth ends on this depth
	DEC H			; previous row
	LD A,(L5B09)		; get trunk width
	LD B,A			; B = loop counter
L9E7D	PUSH HL
	PUSH BC
	CALL NextRandom		; Calculate next random value
	LD D,H
	POP BC
	POP HL
	INC L			; next column
	LD A,$16		; block $16 is floor (seabed)
	ld (il_a),a
	ld a,D
	and 1<<(1)
	ld a,(il_a)
	jp Z,L9E8D
	INC A			; change to block $17 - a bit different floor (seabed)
L9E8D	CALL MiniMap_Set	; Calc address in MiniMap and Set block number
	dec b
	jp nz,L9E7D
	CALL LA193
	CALL LB1D4
	RET
; Fill the labyrinth on this row level
L9E99	PUSH HL
	PUSH BC
	CALL NextRandom		; Calculate next random value
	POP BC
	POP DE
	EX DE,HL
	LD A,D
	AND $07			; 0..7
	jp NZ,L9EB3
L9EA6	LD A,$02		; block $02 is dead end to the left, exit to the right
	ld (il_a),a
	ld a,D
	and 1<<(6)
	ld a,(il_a)
	jp Z,L9EAD
	INC A			; change to block $03, same as $02 with a bit different relief
L9EAD	CALL MiniMap_Set	; Calc address in MiniMap and Set block number
	JP L9F0E
L9EB3	LD A,E
	AND $C0
	jp NZ,L9EFB
L9EB8:
	ld (il_a),a
	ld a,E
	and 1<<(4)
	ld a,(il_a)
	jp Z,L9ED8
	LD A,L
	OR A
	jp Z,L9EA6
	LD A,H
	CP C
	jp Z,L9ED8
	LD A,$05		; block $05 is wall to left/up, exit to right/down
	CALL MiniMap_Set	; Calc address in MiniMap and Set block number
	DEC L			; previous column
	LD (L5B07),HL		; set current trunk position
	INC L			; next column
	LD A,(L5B0A)
	INC A
	LD (L5B0A),A
	JP L9F0E
L9ED8	LD A,(L5B09)		; get trunk width
	ADD A,L
	CP $1E
	jp Z,L9EA6
	LD A,(L5B0A)
	DEC A
	jp Z,L9EA6
	LD (L5B0A),A
	LD A,(L5B09)
	DEC A			; decrease trunk width
	LD (L5B09),A
	INC L			; next column
	LD (L5B07),HL		; set current trunk position
	LD A,$04		; block $04 is wall to left/down, exit to rigth/up
	CALL MiniMap_Set	; Calc address in MiniMap and Set block number
	jp L9F0E
L9EFB	DEC L			; previous column
	CALL MiniMap_Check	; Check value in MiniMap table
	PUSH AF
	INC L			; next column
	POP AF
	jp NZ,L9EB8
	LD A,$0B		; block $0B is floor and ceiling, passage to left/right
	CALL MiniMap_Set	; Calc address in MiniMap and Set block number = $0B
	PUSH BC
	CALL L9F81
	POP BC
L9F0E	LD A,(L5B09)		; get trunk width
	LD B,A			; B = loop counter
	XOR A
L9F13	INC L			; next column
	CALL MiniMap_Set	; Calc address in MiniMap and Set block number = 0
	dec b
	jp nz,L9F13
	INC L			; next column
	PUSH HL
	PUSH BC
	CALL NextRandom		; Calculate next random value
	POP BC
	POP DE
	EX DE,HL
	LD A,D
	AND $07			; 0..7
	jp NZ,L9F34
L9F27	LD A,$06		; block $06 is dead end to the right, exit to the left
	ld (il_a),a
	ld a,D
	and 1<<(6)
	ld a,(il_a)
	jp NZ,L9F2E
	INC A			; change to block $07 - same as $06 with a bit different relief
L9F2E	CALL MiniMap_Set	; Calc address in MiniMap and Set block number
	JP L9F78
L9F34	LD A,E
	AND $C0
	jp NZ,L9F67
L9F39:
	ld (il_a),a
	ld a,E
	and 1<<(4)
	ld a,(il_a)
	jp Z,L9F4F
	LD A,(L5B0A)
	DEC A
	jp Z,L9F4F
	LD (L5B0A),A
	DEC L
	LD A,$08		; block $08 is wall to right/down, exit to left/up
	CALL MiniMap_Set	; Calc address in MiniMap and Set block number = $08
	JP L9F78
L9F4F	LD A,L
	CP $1E
	jp NC,L9F27
	LD A,H
	CP C
	jp Z,L9F27
	LD A,$09		; block $09 is wall to right/up, exit to left/down
	CALL MiniMap_Set	; Calc address in MiniMap and Set block number = $09
	LD A,(L5B0A)
	INC A
	LD (L5B0A),A
	JP L9F78
L9F67	INC L			; next column
	CALL MiniMap_Check	; Check value in MiniMap table
	PUSH AF
	DEC L			; previous column
	POP AF
	jp NZ,L9F39
	LD A,$0A		; block $0A is floor and ceiling, passage to left/right
	CALL MiniMap_Set	; Calc address in MiniMap and Set block number = $0A
	CALL LA03B
L9F78	LD A,(L5B0A)
	LD (L5B09),A		; restore trunk width
	JP L9E5F		; continue the loop by mini-map rows

L9F81	LD (L5B01),HL
L9F84	DEC L
	PUSH HL
	CALL NextRandom		; Calculate next random value
	POP DE
	EX DE,HL
	LD A,D
	AND $02			; check bit 1
	jp NZ,L9FEB
L9F90	DEC L
	CALL MiniMap_Check	; Check value in MiniMap table
	jp Z,L9FC0
	LD A,L
	CP $FF
	jp NZ,L9FB6
	LD L,$1F
	CALL MiniMap_Get	; Calc address in MiniMap and Get block number
	CP $14
	jp NZ,L9FB4
	LD A,$0B
	CALL MiniMap_Set	; Calc address in MiniMap and Set block number
	LD L,$00
	LD A,$0A
	CALL MiniMap_Set	; Calc address in MiniMap and Set block number
	LD HL,(L5B01)
	RET
L9FB4	LD L,$FF
L9FB6	INC L
	LD A,$15
	CALL MiniMap_Set	; Calc address in MiniMap and Set block number
	LD HL,(L5B01)
	RET
L9FC0	INC L
	ld (il_a),a
	ld a,E
	and 1<<(7)
	ld a,(il_a)
	jp Z,L9FE0
	DEC H
	CALL MiniMap_Get	; Calc address in MiniMap and Get block number
	INC H
	SUB $10
	jp C,L9FE0
	CP $04
	jp NC,L9FE0
	LD A,$18
	CALL MiniMap_Set	; Calc address in MiniMap and Set block number
	DEC H
	INC A
	CALL MiniMap_Set	; Calc address in MiniMap and Set block number
	INC H
	JP L9F84
L9FE0	LD A,D
	AND $03			; 0..3
	ADD A,$10		; $10..$13
	CALL MiniMap_Set	; Calc address in MiniMap and Set block number
	JP L9F84
L9FEB:
	ld (il_a),a
	ld a,E
	and 1<<(6)
	ld a,(il_a)
	jp NZ,LA011
	INC H
	CALL MiniMap_Check	; Check value in MiniMap table
	jp Z,L9FF8
	DEC H
	jp L9F90
L9FF8	DEC L
	CALL MiniMap_Check	; Check value in MiniMap table
	jp Z,LA002
	INC L
	DEC H
	jp L9F90
LA002	INC L
	LD A,$0D
	CALL MiniMap_Set	; Calc address in MiniMap and Set block number
	DEC H
	DEC A
	CALL MiniMap_Set	; Calc address in MiniMap and Set block number
	INC H
	JP L9F84
LA011	LD A,$09
	CP H
	JP Z,L9F90
	DEC H
	CALL MiniMap_Check	; Check value in MiniMap table
	jp Z,LA021
	INC H
	JP L9F90
LA021	DEC L
	CALL MiniMap_Check	; Check value in MiniMap table
	jp Z,LA02C
	INC L
	INC H
	JP L9F90
LA02C	LD A,$0E
	INC L
	CALL MiniMap_Set	; Calc address in MiniMap and Set block number
	INC H
	INC A
	CALL MiniMap_Set	; Calc address in MiniMap and Set block number
	DEC H
	JP L9F84

LA03B	LD (L5B01),HL
LA03E	INC L
	PUSH HL
	CALL NextRandom		; Calculate next random value
	POP DE
	EX DE,HL
	LD A,D
	AND $04			; check bit 2
	jp NZ,LA0A5
LA04A	INC L
	CALL MiniMap_Check	; Check value in MiniMap table
	jp Z,LA079
	LD A,L
	AND $1F			; 0..31
	jp NZ,LA06F
	LD L,A
	CALL MiniMap_Get	; Calc address in MiniMap and Get block number
	CP $15
	jp NZ,LA06D
	LD A,$0A
	CALL MiniMap_Set	; Calc address in MiniMap and Set block number
	LD L,$1F
	LD A,$0B
	CALL MiniMap_Set	; Calc address in MiniMap and Set block number
	LD HL,(L5B01)
	RET
LA06D	LD L,$20
LA06F	DEC L
	LD A,$14
	CALL MiniMap_Set	; Calc address in MiniMap and Set block number
	LD HL,(L5B01)
	RET
LA079	DEC L
	ld (il_a),a
	ld a,E
	and 1<<(7)
	ld a,(il_a)
	jp Z,LA09A
	DEC H
	CALL MiniMap_Get	; Calc address in MiniMap and Get block number
	INC H
	SUB $10
	jp C,LA09A
	CP $04
	jp NC,LA09A
	LD A,$18
	CALL MiniMap_Set	; Calc address in MiniMap and Set block number
	DEC H
	LD A,$19
	CALL MiniMap_Set	; Calc address in MiniMap and Set block number
	INC H
	JP LA03E
LA09A	LD A,D
	AND $03			; 0..3
	ADD A,$10		; $10..$13
	CALL MiniMap_Set	; Calc address in MiniMap and Set block number
	JP LA03E
LA0A5:
	ld (il_a),a
	ld a,E
	and 1<<(6)
	ld a,(il_a)
	jp NZ,LA0CB
	INC H
	CALL MiniMap_Check	; Check value in MiniMap table
	jp Z,LA0B2
	DEC H
	jp LA04A
LA0B2	INC L
	CALL MiniMap_Check	; Check value in MiniMap table
	jp Z,LA0BC
	DEC L
	DEC H
	jp LA04A
LA0BC	DEC L
	LD A,$0F
	CALL MiniMap_Set	; Calc address in MiniMap and Set block number
	DEC H
	DEC A
	CALL MiniMap_Set	; Calc address in MiniMap and Set block number
	INC H
	JP LA03E
LA0CB	LD A,$09
	CP H
	JP Z,LA04A
	DEC H
	CALL MiniMap_Check	; Check value in MiniMap table
	jp Z,LA0DB
	INC H
	JP LA04A
LA0DB	INC L
	CALL MiniMap_Check	; Check value in MiniMap table
	jp Z,LA0E6
	INC H
	DEC L
	JP LA04A
LA0E6	LD A,$0C
	DEC L
	CALL MiniMap_Set	; Calc address in MiniMap and Set block number
	INC H
	INC A
	CALL MiniMap_Set	; Calc address in MiniMap and Set block number
	DEC H
	JP LA03E

; Calculate address in relief block
; I: HL = Char coords: H = row, L = column
LA0F5	PUSH HL
; ЭТАП G.1. Здесь лежал развёрнутый Z80-код из девяти однобитных сдвигов
; (SRL H трижды, затем SRL H:RR L трижды), и транслятор обвесил КАЖДЫЙ шаг
; сохранением A через il_a — по 13 тактов на запись и на чтение.
; Итог всех девяти шагов ровно один:
;   HL := ((H>>3)<<8 | L) >> 3
; то есть индекс мини-карты (строка/8)*32 + столбец/8. Разложив по байтам:
;   L := ((H>>3 & 7) << 5) | (L >> 3)      H := (H>>3) >> 3
; A на выходе блока МЁРТВ — следующее обращение к нему это LD A,E, то есть
; запись; флаги тоже никто не читает. Значит сохранять A не нужно вовсе, и
; именно это сохранение составляло основную цену.
	ld a,l
	rrca
	rrca
	rrca
	and $1F			; L>>3
	ld l,a
	ld a,h
	rrca
	rrca
	rrca
	and $1F			; m = H>>3
	ld h,a
	and $07
	rlca
	rlca
	rlca
	rlca
	rlca			; (m&7)<<5
	or l
	ld l,a			; младший байт результата
	ld a,h
	rrca
	rrca
	rrca
	and $1F			; m>>3 — старший байт
	ld h,a
	LD DE,MiniMap
	ADD HL,DE		; now HL = address in MiniMap
	LD H,(HL)		; get block number from MiniMap
	POP DE			; restore row/column
	LD A,E			; get column
	AND $07			; 0..7
	LD E,A
	LD A,D			; get row
	RRCA
	RRCA
	RRCA
	AND $E0
	LD L,A
; ВЫСЕЛЕННЫЙ РЕЛЬЕФ: блок n лежит в ломте n, адрес = RELIEF_BASE + n*256 + off,
; где off = (строка&7)*8 + (столбец&7) — ровно то же смещение, что и штатно.
; Здесь H = номер блока, A = (строка&7)<<5, E = столбец&7. Считаем напрямую:
; младший байт = 192 | off, старший = RELIEF_HI + номер блока. Это ДЕШЕВЛЕ
; штатного пути (сдвиг всей пары), а не дороже.
	IFDEF EVICT
	rrca
	rrca			; (строка&7)<<3
	or e			; + столбец&7
	or 192			; начало ломтя
	ld l,a
	ld a,h
	add a,RELIEF_HI
	ld h,a
	RET
	ELSE
; ЭТАП G.1, второй блок той же процедуры: четыре однобитных сдвига (SRL H:RR L
; дважды) с тем же сохранением A на каждом шаге. Итог: HL >>= 2, по байтам
;   L := ((H & 3) << 6) | (L >> 2)      H := H >> 2
; A здесь тоже мёртв: сразу следом LD A,L.
	ld a,l
	rrca
	rrca
	and $3F			; L>>2
	ld l,a
; ПОРЯДОК ВАЖЕН: младший байт считается ДО того, как H затрётся сдвинутым
; значением, иначе (H&3) возьмётся уже из H>>2. Поймано перечитыванием.
	ld a,h
	and $03
	rrca
	rrca			; (H&3)<<6
	or l
	ld l,a			; готовый младший байт
	ld a,h
	rrca
	rrca
	and $3F			; H>>2 — старший байт
	ld h,a
	LD A,L
	OR E
	LD L,A
	LD DE,LA4DD		; address of relief blocks
	ADD HL,DE		; now HL = address in the block
	RET
	ENDIF

; Calculate address in relief block and Get tile nummber
; I: HL = Char coords: H = row, L = column
; O: A = tile number
GetTileInBlock
	PUSH HL
	PUSH DE
	CALL LA0F5		; Calculate address in relief block
	LD A,(HL)		; get tile number
	POP DE
	POP HL
	RET

; LA132	DEFB $E5,$D5,$F5,$CD,$F5,$A0,$F1,$5F
; 	DEFB $7E,$E6,$3F,$7B,$D1,$E1,$C9,$E5
; 	DEFB $D5,$F5,$CD,$F5,$A0,$F1,$D1,$BE
; 	DEFB $E1,$C9

; Get screen attribute address
GetScrAttrAddr
	PUSH DE
	LD A,L
	LD L,$00
	ld (il_a),a
	ld a,H
	and a
	rra
	ld H,a
	ld a,(il_a)
	ld (il_a),a
	ld a,L
	rra
	ld L,a
	ld a,(il_a)
	ld (il_a),a
	ld a,H
	and a
	rra
	ld H,a
	ld a,(il_a)
	ld (il_a),a
	ld a,L
	rra
	ld L,a
	ld a,(il_a)
	ld (il_a),a
	ld a,H
	and a
	rra
	ld H,a
	ld a,(il_a)
	ld (il_a),a
	ld a,L
	rra
	ld L,a
	ld a,(il_a)
	OR L
	LD L,A
	LD DE,SCRATTR		; Screen attributes area, $0300 bytes
	ADD HL,DE
	POP DE
	RET

; Convert char coords HL to Vector screen address
; I: HL = Char coords: H = row 0..31, L = column 0..31
; O: HL	= address on the Vector screen
; Знакоместная строка r ложится на экранную строку 8r, r = 0..31: экран отдан
; целиком под знакоместа. Поле — строки 0..23 (экранные 0..191), горизонтальный
; HUD — строки 24..31 (экранные 192..255).
; АДРЕСАЦИЯ ПО ВЕРТИКАЛИ: регистр скролла (порт 3) игра держит в 0xFF, развёртка
; защёлкивает его в НАЧАЛЕ картинки и дальше убавляет — значит экранная строка y
; читается из lo = 255 - y. Это же видно в упаковщике заставки
; tools/splash/pack_screen.py (`255 - y`), чей вывод проверен на железе.
GetScrAddr
	PUSH DE
	ld a,h		; row
;	and $1F
	add a,a
	add a,a
	add a,a		; *8
	cpl		; lo = 255 - 8*row: экранная строка y читается из lo = 255 - y
	ld e,a		; lo byte
	ld a,l		; column
	and $1F
	add a,$C0
	ld d,a		; hi byte
	ex de,hl
	POP DE
	RET

; То же самое, но для ПОЛЯ: столбцы поля 0..23 ложатся на столбцы экрана 4..27.
; Это и есть центрирование — по 32 px чёрного слева и справа.
; Именно КОПИЯ, а не обёртка `jp GetScrAddr`: обёртка добавила бы CALL/RET в
; горячий спрайтовый блит LB4F0, а бюджет изменения темпа — ноль.
; Столбец на входе гарантированно 0..23 (клип LB4BB: столбец+ширина < 24,
; клип строки LB4D7/LB4BB: строка < 24), значит $C4+23 = $DB — плоскость 0xC000
; не покидаем.
GetScrAddrF
	PUSH DE
	ld a,h		; row
	add a,a
	add a,a
	add a,a		; *8
	cpl		; lo = 255 - 8*row
	IFDEF GEOM
; ГЕОМЕТРИЯ ЗОНЫ (-DGEOM): поле уезжает ВНИЗ на 64 строки и ВЛЕВО на 4 столбца.
; Строка поля r ложится на экранную строку 64+8r, то есть lo = 191 - 8r: верхние
; 64 строки экрана (lo 192..255) освобождаются под зону данных и полем больше не
; трогаются НИКОГДА. Это то самое свойство, ради которого всё затевалось:
; lo пробегает 7..191 при r = 0..23 и в зону не заходит ни разу.
; Столбцы поля 0..23 ложатся на экранные 0..23 — центрирование больше не нужно,
; справа встаёт боковая панель HUD (столбцы 24..31).
	sub 64		; lo = 191 - 8*row: поле начинается с экранной строки 64
	ENDIF
	ld e,a		; lo byte
	ld a,l		; column
	and $1F
	IFNDEF GEOM
	add a,$C4	; +4 столбца: поле начинается со столбца 4
	ELSE
	add a,$C0	; поле начинается со столбца 0, справа — боковая панель
	ENDIF
	ld d,a		; hi byte
	ex de,hl
	POP DE
	RET

; Draw tile 16x8 at the screen; used for static objects: Big Shell, Chest
; I: HL = Char coords: H = row 0..23, L = column 0..31
; I: DE = Tile address; 16 bytes
DrawTile16x8
	CALL GetScrAddrF		; поле: столбцы 0..23 -> экранные 4..27
	LD B,$08		; repeat 8 times
LA17B	LD A,(DE)
	LD (HL),A
	INC DE
	inc h ;INC L		; next column
	LD A,(DE)
	LD (HL),A
	dec h ;DEC L		; prev column
	dec l ;INC H		; next line
	INC DE
	dec b
	jp nz,LA17B
; Second pass to clear other color plane (both columns)
	ld a,h
	xor $20		; switch screen plane
	ld h,a
	ld b,8
	xor a
DrawTile16x8_2:
	inc l			; line up
	ld (hl),a		; clear col 0
	inc h			; next column
	ld (hl),a		; clear col 1
	dec h			; prev column
	dec b
	jp nz,DrawTile16x8_2
	RET

; Draw tile 8x8 at the screen; used to draw static objects: Oxygen, Small shell
; I: HL = Char coords: H = row 0..23, L = column 0..31
; I: DE = Tile address; 8 bytes
DrawTile8x8
	CALL GetScrAddrF		; поле: столбцы 0..23 -> экранные 4..27
	LD B,$08		; repeat 8 times
LA18C	LD A,(DE)
	LD (HL),A
	INC DE
	dec l ;INC H		; next line
	dec b
	jp nz,LA18C
; Second pass to clear other color plane
	ld a,h
	xor $20		; switch screen plane
	ld h,a
	ld b,8
	xor a
DrawTile8x8_2:
	inc l			; line up
	ld (hl),a
	dec b
	jp nz,DrawTile8x8_2
	RET

LA193	LD HL,$20FF
	LD DE,TableStatics	; Table of static objects on the map
	XOR A
	LD (L5B00),A
	LD A,$03
	LD (L5B0F),A
LA1A2	INC L
	LD A,L
	AND $1F			; 0..31
	jp NZ,LA1B0
	LD L,A
	DEC H
	jp NZ,LA1B0
	LD A,$80		; end of list marker
	LD (DE),A
	RET
LA1B0	CALL MiniMap_Get	; Calc address in MiniMap and Get block number
	LD C,A
	PUSH HL
	CP $14
	jp Z,LA1CC
	CP $15
	jp NZ,LA1F6
	LD A,L
	OR A
	jp NZ,LA1F6
	LD L,$04
	LD A,H
	ADD A,A
	ADD A,A
	ADD A,A
	ADD A,$04
	LD H,A
	jp LA1DA
LA1CC	LD A,L
	CP $1F
	jp NZ,LA1F6
	LD L,$FB
	LD A,H
	ADD A,A
	ADD A,A
	ADD A,A
	ADD A,$06
	LD H,A
LA1DA	LD A,(L5B0F)
	OR A
	jp Z,LA1F6
	LD A,$40
	LD (DE),A
	INC DE
	LD A,L
	LD (DE),A
	INC DE
	LD A,H
	LD (DE),A
	INC DE
	LD A,(L5B0F)
	LD (DE),A
	INC DE
	DEC A
	LD (L5B0F),A
	POP HL
	jp LA1A2
; ВХОД В ОБХОД ПОСЛЕДНИХ 16 ТАЙЛОВ БЛОКА. Штатно: H = номер блока, L = $C0,
; пара сдвигается вправо на 2 (то есть блок*64 + 48) и складывается с базой; в
; BC при этом остаётся ДОСЛОЖЕНИЕ (блок*64+48), из которого дальше берутся
; только младшие 6 бит — номер тайла внутри блока.
; Под выселением: старший байт = RELIEF_HI + блок, младший = 192 + 48 = $F0.
; C по-прежнему годится как счётчик тайла: $F0 mod 64 = 48, ровно как и штатно
; (блок*64 кратно 64), а все его читатели берут C через AND $07 / AND $38.
	IFDEF EVICT
LA1F6	ld a,c
	add a,RELIEF_HI
	ld h,a
	ld l,0F0h
	ld c,0F0h
	LD B,$10		; repeat 16 times
	jp LA209
	ELSE
LA1F6	LD H,C
	LD L,$C0
	ld (il_a),a
	ld a,H
	and a
	rra
	ld H,a
	ld a,(il_a)
	ld (il_a),a
	ld a,L
	rra
	ld L,a
	ld a,(il_a)
	ld (il_a),a
	ld a,H
	and a
	rra
	ld H,a
	ld a,(il_a)
	ld (il_a),a
	ld a,L
	rra
	ld L,a
	ld a,(il_a)
	LD BC,LA4DD
	PUSH HL
	ADD HL,BC
	POP BC
	LD B,$10		; repeat 16 times
	ENDIF
LA209	LD A,(HL)
	RELF_INC			; INC HL с переносом курсора на следующий ломоть
	INC C
	SUB $1C
	jp C,LA278
	CP $04
	jp NC,LA278
	LD A,(HL)
	RELF_INC
	INC C
	SUB $1C
	jp C,LA278
	CP $04
	jp NC,LA278
	LD A,C
	AND $07			; 0..7
	jp Z,LA278
	PUSH HL
	PUSH DE
	PUSH BC
	CALL NextRandom		; Calculate next random value
	POP BC
	POP DE
	LD A,H
	POP HL
	AND $02			; check bit 1
	jp NZ,LA278
	LD A,(L5B00)
	INC A
	CP $64			; 100
	jp Z,LA278
	LD (L5B00),A
	LD A,$0A
	LD (DE),A
	EX (SP),HL
	LD A,H
	CP $04
	jp C,LA249
	LD A,$00
	LD (DE),A
LA249	INC DE
	LD A,C
	DEC A
	DEC A
	AND $07			; 0..7
	PUSH DE
	LD D,A
	LD A,L
	ADD A,A
	ADD A,A
	ADD A,A
	AND $F8
	OR D
	POP DE
	LD (DE),A
	INC DE
	PUSH DE
	LD A,H
	ADD A,A
	ADD A,A
	ADD A,A
	AND $F8
	LD D,A
	LD A,C
	AND $38
	RRCA
	RRCA
	RRCA
	OR D
	POP DE
	EX (SP),HL
	LD (DE),A
	INC DE
	LD A,(RANDOM)		; get current Random lo byte
	AND $7F			; 0..127
	LD (DE),A
	INC DE
	RELF_INC
	INC C
	DEC B
LA278:
	dec b
	jp nz,LA209
	POP HL
	JP LA1A2

; Table of static objects on the map - oxygen, chests, shells
; each record is 4 bytes wide: byte #0 = flags; byte #1 = column 0..255, byte #2 = row 0..255
; flags: bit 1 = big/small;
;        bit 3 = opened/closed;
;        bit 5 = oxygen;
;        bit 6 = chest;
;        bit 7 = end of list
TableStatics
	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
LA40C	DEFB $B2,$1D,$EA,$53,$DE,$69,$DE,$01,$53,$48,$46,$B5,$7A,$EA,$5E

; Empty sprite
LA41B	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00

;----------------------------------------------------------------------------

; 30 блоков рельефа по 64 Б. Под -DEVICT они выселяются ЦЕЛЫМ КУСКОМ в ломти
; плоскости 3 (страницы RELIEF_HI..0xFF, младшие 192..255) и подключаются уже
; ПОСЛЕ конца кода — см. scubacod1.asm. Здесь под выселением их нет вовсе, от
; этого и опускается Top address.
	IFNDEF EVICT
	IFNDEF HIDVRAM
	INCLUDE "scubarelb.asm"
	ENDIF
	ENDIF
	INCLUDE "scubarelf.asm"

;----------------------------------------------------------------------------

; Table of objects on the screen
; Bytes #0,1: record address in TableStatics; bytes #2,3: column and row
LB07D	DEFB $01,$01,$01,$01
	DEFB $01,$21,$01,$01
	DEFB $01,$01,$01,$01
	DEFB $01,$0C,$01,$09
	DEFB $14,$16,$17,$0D
	DEFB $01,$32,$14,$00
	DEFB $00,$00,$00,$00
	DEFB $23,$32,$00,$00
	DEFB $00,$00,$00,$00
	DEFB $0C,$32,$06,$27
	DEFB $03,$00,$00,$00

; Draw static objects on the screen; prepare LB07D table
DrawStatics
	ld (il_hl),hl	; get Screen position on mini-map
	ld hl,(L5B03)
	ld e,l
	ld d,h
	ld hl,(il_hl)
	LD A,D			; get row
	RLCA
	RLCA
	RLCA			; *8
	LD D,A
	LD A,E
	RLCA
	RLCA
	RLCA			; *8
	LD E,A
	ld (il_a),a	; set screen position on 256x256 map
	ld a,e
	ld (L5B0B),a
	ld a,d
	ld (L5B0B+1),a
	ld a,(il_a)
	LD HL,TableStatics	; Table of static objects on the map
	;DI
	ld (il_hl),hl
	ld hl,(z80_iy)
	push hl
	ld hl,(il_hl)
	ld (il_hl),hl	; Table of objects on the screen
	ld hl,LB07D
	ld (z80_iy),hl
	ld hl,(il_hl)
LB0C5:
	ld (il_a),a	; end of objects list?
	ld a,(HL)
	and 1<<(7)
	ld a,(il_a)
	jp Z,LB0D0	; no => jump
	call z80_stn_Y	; address hi := 255 - end of list marker in LB07D table
	defb $01
	defb $FF
	ld (il_hl),hl
	pop hl
	ld (z80_iy),hl
	ld hl,(il_hl)
	RET
LB0D0	PUSH HL
	PUSH DE
	push af
	ld a,(hl)
	and (~(1<<(0)))&255
	ld (hl),a
	pop af
	INC HL
	LD A,(HL)		; get column 0..255
	SUB E			; minus screen row
	CP $18			; within the screen?
	jp NC,LB148	; no => skip
	LD E,A			; now E = column on the screen, 0..23
	INC HL
	LD A,(HL)		; get row 0..255
	SUB D			; minus screen column
	CP $18			; within the screen?
	jp NC,LB148	; no => skip
	LD D,A			; now D = row on the screen, 0..23
	PUSH DE
	DEC HL			; back to column
	DEC HL			; back to flags
	call z80_stl_Y
	defb $00
	call z80_sth_Y	; store record address
	defb $01
	call z80_ste_Y
	defb $02
	call z80_std_Y	; store position
	defb $03
	ld (il_hl),hl
	ld hl,(z80_iy)
	inc hl
	ld (z80_iy),hl
	ld hl,(il_hl)
	ld (il_hl),hl
	ld hl,(z80_iy)
	inc hl
	ld (z80_iy),hl
	ld hl,(il_hl)
	ld (il_hl),hl
	ld hl,(z80_iy)
	inc hl
	ld (z80_iy),hl
	ld hl,(il_hl)
	ld (il_hl),hl	; next record
	ld hl,(z80_iy)
	inc hl
	ld (z80_iy),hl
	ld hl,(il_hl)
	push af
	ld a,(hl)
	or 1<<(0)
	ld (hl),a
	pop af
	LD C,$46		; screen attribute for chest
	LD DE,LB1B4		; Sprite 16x8 Chest
	ld (il_a),a	; check "chest" bit
	ld a,(HL)
	and 1<<(6)
	ld a,(il_a)
	jp NZ,LB151	; chest => draw the chest
	LD C,$47		; screen attribute for oxygen
	LD DE,LB1AC		; Sprite 8x8 Oxygen
	ld (il_a),a	; check "oxygen" bit
	ld a,(HL)
	and 1<<(5)
	ld a,(il_a)
	jp NZ,LB160	; oxygen => draw the oxygen
	LD C,$07		; screen attribute for shells
	ld (il_a),a	; check "big/small" bit
	ld a,(HL)
	and 1<<(1)
	ld a,(il_a)
	jp Z,LB121	; big => draw big shell
	LD DE,LB1CC		; Sprite 8x8 Small shell opened
	ld (il_a),a	; check "closed/opened" bit
	ld a,(HL)
	and 1<<(3)
	ld a,(il_a)
	jp Z,LB160	; open => draw the small shell
	LD DE,LB1C4		; Sprite 8x8 Small shell closed
	jp LB160	; => draw the small shell
; Draw Big shell
LB121	LD DE,LB16C		; Sprite 16x16 Big shell opened
	ld (il_a),a	; check "closed/opened" bit
	ld a,(HL)
	and 1<<(3)
	ld a,(il_a)
	jp Z,LB12B
	LD DE,LB18C		; Sprite 16x16 Big shell closed
LB12B	POP HL			; restore (row, column)
	PUSH HL			; save again
	CALL GetScrAttrAddr	; Get screen attribute address
	LD (HL),C		; set screen attribute
	INC HL
	LD (HL),C		; set screen attribute
	PUSH BC
	LD BC,$0020
	OR A
	ld (il_a),a	; one char line up
	ld a,l
	sbc a,c
	ld l,a
	ld a,h
	sbc a,b
	ld h,a
	ld a,(il_a)
	POP BC
	LD (HL),C		; set screen attribute
	DEC HL
	LD (HL),C		; set screen attribute
	POP HL			; restore (row, column)
	PUSH HL			; save again
	CALL DrawTile16x8	; Draw tile 16x8 at the screen
	POP HL			; restore (row, column)
	DEC H			; One char line up
	CALL DrawTile16x8	; Draw tile 16x8 at the screen
LB148	POP DE
	POP HL
	LD BC,$0004		; record size
	ADD HL,BC		; next record
	JP LB0C5		; continue the loop
; Draw Chest object
LB151	LD A,(HL)
	POP HL			; restore (row, column)
	PUSH HL			; save again
	CALL GetScrAttrAddr	; Get screen attribute address
	LD (HL),C		; set screen attribute
	INC HL
	LD (HL),C		; set screen attribute
	POP HL			; restore (row, column)
	CALL DrawTile16x8	; Draw tile 16x8 at the screen
	jp LB148
; Draw Oxygen or Small shell
LB160	POP HL			; restore (row, column)
	PUSH HL			; save again
	CALL GetScrAttrAddr	; Get screen attribute address
	LD (HL),C		; set screen attribute
	POP HL			; restore (row, column)
	CALL DrawTile8x8	; Draw tile 8x8 at the screen
	jp LB148

;----------------------------------------------------------------------------
; Sprites for objects

; Sprite 16x16 Big shell opened; first lower part then upper
LB16C	DEFB $60,$1C,$60,$0E,$2C,$1E,$36,$1C	; sprB16C
	DEFB $36,$0C,$16,$C4,$0B,$6C,$05,$B8
LB17C	DEFB $00,$00,$00,$60,$00,$78,$00,$38	; sprB17C
	DEFB $00,$3C,$00,$0E,$40,$36,$40,$3B

; Sprite 16x16 Big shell closed; first lower part then upper
LB18C	DEFB $63,$10,$61,$E0,$2C,$F8,$36,$78	; sprB18C
	DEFB $36,$1C,$16,$C4,$0B,$6C,$05,$B8
LB19C	DEFB $00,$00,$00,$00,$00,$00,$0C,$00	; sprB19C
	DEFB $3F,$00,$0F,$80,$4F,$80,$40,$E0

; Sprite 8x8 Oxygen
LB1AC	DEFB $30,$10,$7C,$6C,$6C,$6C,$7C,$6C	; sprB1AC

; Sprite 16x8 Chest
LB1B4	DEFB $0F,$F8,$1F,$FC,$00,$00,$1F,$FC	; sprB1B4
	DEFB $1F,$7C,$1F,$7C,$1F,$FC,$1F,$FC

; Sprite 8x8 Small shell closed
LB1C4	DEFB $00,$00,$00,$7C,$FE,$06,$FE,$7C	; sprB1C4

; Sprite 8x8 Small shell opened
LB1CC	DEFB $02,$03,$03,$03,$03,$03,$FE,$7C	; sprB1CC

;----------------------------------------------------------------------------

LB1D4:
	ld (il_hl),hl
	ld hl,(z80_iy)
	push hl
	ld hl,(il_hl)
	NOP
	NOP
	NOP
	NOP
	XOR A
	LD (LB210),A
LB1DE:
	ld (il_hl),hl	; Table of static objects on the map
	ld hl,TableStatics
	ld (z80_iy),hl
	ld hl,(il_hl)
LB1E2	CALL NextRandom		; Calculate next random value
	LD A,H
	AND $03			; 0..3
	ADD A,$03		; 3..6
	LD B,A
	LD DE,$0004		; record size
LB1EE:
	ld (il_hl),hl	; next record
	ld hl,(z80_iy)
	add hl,de
	ld (z80_iy),hl
	ld hl,(il_hl)
	dec b
	jp nz,LB1EE
	call z80_lda_Y	; get row 0..255
	defb $02
	CP $48			; < 72 ? (top 9 blocks = top 3 screens)
	jp C,LB1DE	; yes => jump
	call z80_lda_Y	; get flags
	defb $00
	AND $60
	jp NZ,LB1E2
	call z80_stn_Y
	defb $00
	defb $20
	LD HL,LB210
	INC (HL)
	LD A,(HL)
	CP $08
	jp NZ,LB1E2
	ld (il_hl),hl
	pop hl
	ld (z80_iy),hl
	ld hl,(il_hl)
	RET

LB210	DEFB $00
LB211	DEFB $08
LB212	DEFB $05

LB213	CALL LB2C0		; Octopus delay and process
	LD HL,LB211
	DEC (HL)
	RET NZ
	;DI
	LD A,(L5B0D)		; get value 7 / 5 / 3 / 1, depending on LEVEL
	LD (HL),A
	LD A,(LB212)
	ld (il_a),a
	and 1<<(7)
	ld a,(il_a)
	jp NZ,LB230
	INC A
	CP $07
	jp NZ,LB237
	push af
	or 1<<(7)
	ld (il_a),a
	pop af
	ld a,(il_a)
	jp LB237
LB230	DEC A
	CP $83
	jp NZ,LB237
	push af
	and (~(1<<(7)))&255
	ld (il_a),a
	pop af
	ld a,(il_a)
LB237	LD (LB212),A
	ld (il_hl),hl
	ld hl,(z80_iy)
	push hl
	ld hl,(il_hl)
	ld (il_hl),hl
	ld hl,LB079
	ld (z80_iy),hl
	ld hl,(il_hl)
LB240	LD DE,$0004
	ld (il_hl),hl	; get screen position on 256x256 map
	ld hl,(L5B0B)
	ld c,l
	ld b,h
	ld hl,(il_hl)
LB247:
	ld (il_hl),hl
	ld hl,(z80_iy)
	add hl,de
	ld (z80_iy),hl
	ld hl,(il_hl)
	call z80_ldhl_Y
	defb $00		; было: два вызова, младший+старший
	LD A,$FF
	CP H
	jp NZ,LB257
	ld (il_hl),hl
	pop hl
	ld (z80_iy),hl
	ld hl,(il_hl)
	RET
LB257:
	ld (il_a),a
	ld a,(HL)
	and 1<<(5)
	ld a,(il_a)
	jp NZ,LB247
	ld (il_a),a
	ld a,(HL)
	and 1<<(6)
	ld a,(il_a)
	jp Z,LB276
	ld (il_a),a
	ld a,(HL)
	and 1<<(3)
	ld a,(il_a)
	jp NZ,LB247
	call z80_ldhl_Y
	defb $02		; было: два вызова, младший+старший
	CALL GetScrAttrAddr	; Get screen attribute address
	LD A,(LB212)
	AND $07			; 0..7
	LD (HL),A
	INC HL
	LD (HL),A
	jp LB240
LB276:
	ld (il_a),a
	ld a,(HL)
	and 1<<(3)
	ld a,(il_a)
	jp Z,LB27E
	ld (il_a),a
	ld a,(HL)
	and 1<<(4)
	ld a,(il_a)
	jp NZ,LB247
LB27E	ADD HL,DE
	DEC HL
	DEC (HL)
	jp Z,LB286
	INC HL
	jp LB247
LB286	PUSH HL
	PUSH DE
	PUSH BC
	CALL NextRandom		; Calculate next random value
	POP BC
	POP DE
	LD A,H
	POP HL
	AND $7F			; 0..127
	ADD A,$80		; 128..255
	LD (HL),A
	DEC HL
	LD A,(HL)
	SUB B
	LD D,A
	DEC HL
	LD A,(HL)
	SUB C
	LD E,A
	DEC HL
	LD A,$08
	XOR (HL)
	LD (HL),A
	ld (il_a),a
	ld a,(HL)
	and 1<<(1)
	ld a,(il_a)
	PUSH HL
	EX DE,HL
	jp Z,LB2B1
	LD DE,LB2EE		; sprite 8x8 address, 8 bytes
	CALL DrawTileXor8x8	; Draw tile 8x8 with XOR
	POP HL
	jp LB240
LB2B1	LD DE,LB2F6		; sprite 16x16 address, 32 bytes
	PUSH HL
	CALL DrawTileXor16x8	; Draw tile 16x8 with XOR
	POP HL
	DEC H			; one line upper
	CALL DrawTileXor16x8	; Draw tile 16x8 with XOR
	POP HL
	jp LB240

; Octopus delay and process
LB2C0	LD HL,LB2CD
	DEC (HL)
	RET NZ
	LD A,(L5B0E)		; get value 10 / 8 / 6 / 4, depending on LEVEL
	LD (HL),A
	CALL LB317		; Process Octopus, draw if needed
	RET
LB2CD	DEFB $08

; Draw tile 8x8 with XOR
; I: HL = Char coords: H = 0..23, L = 0..31
; I: DE = Tile address
DrawTileXor8x8
	CALL GetScrAddrF		; поле: столбцы 0..23 -> экранные 4..27
	LD B,$08		; tile height 8 pixels
LB2D3	LD A,(DE)
	XOR (HL)
	LD (HL),A
	INC DE
	dec l ;INC H		; next line
	dec b
	jp nz,LB2D3
	RET

; Draw tile 16x8 with XOR
; I: HL = Char coords: H = 0..23, L = 0..31
; I: DE = Tile address
DrawTileXor16x8
	CALL GetScrAddrF		; поле: столбцы 0..23 -> экранные 4..27
	LD B,$08		; tile height 8 pixels
LB2E0	LD A,(DE)
	XOR (HL)
	LD (HL),A
	INC DE
	inc h ;INC L		; next column
	LD A,(DE)
	XOR (HL)
	LD (HL),A
	dec h ;DEC L		; prev column
	dec l ;INC H		; next line
	INC DE
	dec b
	jp nz,LB2E0
	RET

; Sprite 8x8 address, 8 bytes
LB2EE	DEFB $02,$03,$03,$7F,$FD,$05,$00,$00

; Sprite 16x16, 32 bytes; first lower part then upper
LB2F6	DEFB $03,$0C,$01,$EE,$00,$E6,$00,$64	; sprB2F6
	DEFB $00,$10,$00,$00,$00,$00,$00,$00
LB306	DEFB $00,$00,$00,$60,$00,$78,$0C,$38	; sprB306
	DEFB $3F,$3C,$0F,$8E,$0F,$B6,$00,$DB
; Data block at B316
LB316	DEFB $09

; Process Octopus, draw if needed
LB317	LD A,(L9C50)		; get Octopus flag
	OR A
	RET Z
	LD HL,LB316
	DEC (HL)
	RET NZ
	LD (HL),$10
	LD A,(L9C55)		; get Octopus phase
	LD B,A
	ld (il_a),a
	and 1<<(7)
	ld a,(il_a)
	jp NZ,LB339
	call z80_ldar
	jp Z,LB345
	INC B
	LD A,$05
	CP B
	jp NZ,LB345
	LD B,$83
	jp LB345
LB339:
	call z80_ldar
	jp Z,LB345
	DEC B
	LD A,$7F
	CP B
	jp NZ,LB345
	LD B,$01
LB345	LD A,B
;
; Entry point to draw Octopus
; I: A = Octopus phase
LB346	LD (L9C55),A		; set Octopus phase
	LD HL,SprOctopus	; Base address for Octopus sprites
	AND $07			; 0..7
	LD B,A
	OR A
	jp Z,LB358
	LD DE,$00C0		; address shift between phases
LB355	ADD HL,DE
	dec b
	jp nz,LB355
LB358	EX DE,HL		; now DE = Octopus sprite address
	;CALL DrawOctopusSprite	; Draw Octopus sprite on the screen
	;RET

; Draw Octopus sprite on the screen
; I: DE = Octopus sprite address, 6x4 tiles 8x8 pixels, 192 bytes
DrawOctopusSprite
	;DI
	ld (il_hl),hl
	ld hl,(z80_iy)
	push hl
	ld hl,(il_hl)
	ld (il_hl),hl	; now IY = previous Octopus sprite address
	ld hl,(L9C53)
	ld (z80_iy),hl
	ld hl,(il_hl)
	ld (il_a),a	; store new Octopus sprite address
	ld a,e
	ld (L9C53),a
	ld a,d
	ld (L9C53+1),a
	ld a,(il_a)
	LD HL,(L9C51)		; get the Octopus screen address
	inc h ;INC HL		; two tiles (columns) to the right
	inc h ;INC HL
	LD C,$04		; repeat 4 times - height in chars
LB36F	LD B,$06		; repeat 6 times - width in chars
	PUSH HL
LB372	PUSH BC
	LD B,$08		; repeat 8 times
	PUSH HL
LB376	LD A,(DE)		; get pixels
	XOR (HL)		; XOR with screen pixels
	call z80_xor_Y	; XOR with previous sprite pixels
	defb $00
	LD (HL),A		; write to the screen
	INC DE			; next sprite byte
	ld (il_hl),hl	; next previous sprite byte
	ld hl,(z80_iy)
	inc hl
	ld (z80_iy),hl
	ld hl,(il_hl)
	dec l ;INC H		; next line
	dec b
	jp nz,LB376
	POP HL			; restore screen address
	inc h ;INC L		; next column
	POP BC
	dec b	; continue by columns
	jp nz,LB372
	POP HL			; restore screen address
	LD A,L
	sub 8 ;ADD A,$20
	LD L,A
	DEC C
	jp NZ,LB36F	; continue by char rows
	ld (il_hl),hl
	pop hl
	ld (z80_iy),hl
	ld hl,(il_hl)
	RET

LB392	DEFB $00,$00,$00,$00,$00,$00,$00,$00
	DEFB $32,$32,$32,$1D,$02,$32

; I: IX = record address in LC4F0 area
; I: IY = record address in LC092 area
LB3A0:
	call z80_bitX_13
	and 1<<(4)
	ld a,(il_a)
	jp Z,LB3AB
;
LB3A6	LD HL,(LB7B9)
	jp LB3B1
;
LB3AB:
	ld (il_a),a
	ld a,(DiverObj+$08)
	ld h,a
	ld a,(il_a)
	ld (il_a),a	; get buffer address
	ld a,(DiverObj+$07)
	ld l,a
	ld a,(il_a)
LB3B1:
	call z80_ldc_Y
	defb $0A
	call z80_lda_X_3
	OR A
	jp NZ,LB3D6
	rst 30h	; = call z80_setX
	defb $0D
	defb 1<<(6)
	call z80_bitX_13
	and 1<<(3)
	ld a,(il_a)
	jp Z,LB3CE
	call z80_bitX
	defb $12
	and 1<<(7)
	ld a,(il_a)
	jp NZ,LB3E9
	LD A,$08
	jp LB3D6
LB3CE:
	ld (il_a),a
	ld a,(DiverObj+$12)
	and 1<<(7)
	ld a,(il_a)
	jp Z,LB3E9
	LD A,$08
LB3D6	LD B,A
	XOR A
LB3D8:
	call z80_add_Y
	defb $07
	dec b
	jp nz,LB3D8
	LD B,A
	LD C,A
	call z80_lda_Y
	defb $0A
	SUB C
	LD C,A
	XOR A
LB3E5	LD (HL),A	; clear buffer byte
	INC HL
	dec b
	jp nz,LB3E5
LB3E9	PUSH HL
	call z80_ldd_X
	defb $0C
	call z80_lde_X
	defb $0B
	LD A,(DE)
	INC A
	jp NZ,LB3FA
	call z80_ldd_X	; get sprite address
	defb $0A
	call z80_lde_X
	defb $09
LB3FA:
	ld (il_a),a
	ld a,e
	ld (L5B11),a
	ld a,d
	ld (L5B11+1),a
	ld a,(il_a)
	call z80_ldb_Y
	defb $0B
LB401	PUSH BC
	call z80_ldc_Y
	defb $06
	LD B,$00
	EX DE,HL	; now DE = buffer address, HL = sprite address
	ld (il_a),a	; copy to the buffer
i80_ldir_1:
	ld a,(hl)
	ld (de),a
	inc hl
	inc de
	dec bc
	ld a,b
	or c
	jp nz,i80_ldir_1
	ld a,(il_a)
	EX DE,HL
	LD (HL),$00
	INC HL
	POP BC
	dec b
	jp nz,LB401
	LD B,C
	LD A,B
	OR A
	jp Z,LB41B
	XOR A
LB417	LD (HL),A
	INC HL
	dec b
	jp nz,LB417
LB41B:
	call z80_std_X
	defb $0C
	call z80_ste_X
	defb $0B
	call z80_ldb_X
	defb $02
	LD A,B
	OR A
	jp NZ,LB446
	rst 30h	; = call z80_setX
	defb $0D
	defb 1<<(5)
	call z80_bitX_13
	and 1<<(4)
	ld a,(il_a)
	jp Z,LB43E
	call z80_bitX_17
	and 1<<(7)
	ld a,(il_a)
	jp Z,LB43A
LB438	POP HL
	RET
LB43A	LD B,$08
	jp LB446
LB43E:
	ld (il_a),a
	ld a,(DiverObj+$11)
	and 1<<(7)
	ld a,(il_a)
	jp NZ,LB43A
	jp LB438
LB446	LD A,B
	CP $04
	jp C,LB45C
	SUB $04
	LD C,A
	call z80_ldb_Y
	defb $0D
	POP HL
	PUSH HL
	XOR A
LB454:
	call z80_rrd
	INC HL
	dec b
	jp nz,LB454
	LD B,C
	jp LB446
LB45C	OR A
	jp Z,LB438
LB45F	POP HL
	PUSH HL
	PUSH BC
	call z80_ldb_Y
	defb $0D
	OR A
; ЭТАП E.4: 64 такта на байт стало 38. A в этом цикле МЁРТВ: единственное, ради
; чего он тут был, — OR A перед циклом, а тот стоит только чтобы сбросить перенос
; (его Z-флаг никто не читает), и после цикла A тоже никем не используется —
; выход идёт на POP BC / DJNZ LB45F, а LB45F снова делает OR A. Значит сохранять
; A через il_a незачем: минус два обращения к памяти на каждый байт.
LB466:
	ld a,(hl)
	rra
	ld (hl),a
	INC HL
	dec b
	jp nz,LB466
	POP BC
	dec b
	jp nz,LB45F
	POP HL
	RET

; I: IX = record address in LC4F0 area
; I: IY = record address in LC092 area
LB470:
	call z80_bitX_13
	and 1<<(0)
	ld a,(il_a)
	jp Z,LB479
	CALL LB3A0
LB479:
	call z80_ldd_X
	defb $08
	call z80_lde_X	; get buffer address
	defb $07
	call z80_bitX_13
	and 1<<(1)
	ld a,(il_a)
	jp NZ,LB496
	PUSH DE
	call z80_ldc_Y	; get sprite char width
	defb $09
	call z80_ldl_Y	; get record size ??
	defb $0A
	XOR A
LB48D	LD B,L			; loop counter = record size
LB48E	LD (DE),A		; clear the record
	INC DE
	dec b
	jp nz,LB48E
	DEC C
	jp NZ,LB48D
	POP DE
LB496	LD HL,(LB7B9)
	call z80_bitX_13
	and 1<<(0)
	ld a,(il_a)
	jp NZ,LB4A2
	LD HL,LA41B		; empty sprite address
LB4A2:
	call z80_ldb_Y
	defb $07
LB4A5:
	call z80_lda_Y	; get column
	defb $02
	AND $E0			; check column for 0..31 range
	jp Z,LB4B4
	call z80_inc_Y	; incremment column
	defb $02
	INC DE
	INC HL
	DEC B
	jp LB4A5
LB4B4:
	call z80_lda_Y
	defb $06
	call z80_add_Y	; add column
	defb $02
	LD C,A
LB4BB	CP $18			; < 24 ?
	jp C,LB4C4
	DEC C
	DEC B
	LD A,C
	jp LB4BB
LB4C4:
	call z80_stb_Y	; set width
	defb $0E
	call z80_lda_Y
	defb $07
	SUB B
	call z80_sta_Y
	defb $0F
	ld (il_hl),hl
	ld hl,(z80_ix)
	push hl
	ld hl,(il_hl)
	PUSH HL
	ld (il_hl),hl
	pop hl
	ld (z80_ix),hl
	ld hl,(il_hl)
	call z80_ldb_Y	; get sprite char width
	defb $09
LB4D6	PUSH BC
LB4D7:
	call z80_lda_Y	; get row
	defb $03
	CP $18			; < 24 ?
	jp C,LB4F0
	call z80_inc_Y	; increment row
	defb $03
	POP BC
	DEC B
	PUSH BC
	call z80_ldl_Y	; get record size
	defb $0A
	LD H,$00
	EX DE,HL
	ADD HL,DE
	ld (il_hl),hl
	ld hl,(z80_ix)
	add hl,de
	ld (z80_ix),hl
	ld hl,(il_hl)
	EX DE,HL
	jp LB4D7
LB4F0:
	call z80_ldhl_Y	; get colummn
	defb $02		; было: два вызова, младший+старший
	CALL GetScrAddrF		; поле: столбцы 0..23 -> экранные 4..27
	LD B,$08		; repeat 8 times
LB4FB	PUSH BC
	PUSH HL
	call z80_ldb_Y_14
; ЭТАП 3, ручная дожимка внутреннего цикла блита. Профиль i8080-сборки: четыре
; хелпера этого тела (z80_sta_Y, z80_and_X, z80_lda_X, z80_or_Y) — 20.4% всех
; тактов игры, тело стоило ~900 тактов на байт против 141 у Z80.
; Что использовано:
;  * (IY+$07) внутри цикла — ЧИСТЫЙ временный: сразу после цикла его затирает
;    LD A,(IY+$06) / INC A / LD (IY+$07),A. Значит его можно держать в C.
;  * C свободен: LB4FB делает PUSH BC, счётчиком служит B, POP BC возвращает пару.
;  * (IX+$00) читается дважды за итерацию — читаем один раз, второй операнд
;    берём тем же (hl), пока указатель ещё в HL.
;  * тень z80_ix используется КАК РАБОЧИЙ указатель маски (inc в HL, обратно в
;    ячейку) — после цикла она остаётся верной, её читает ADD IX,DE ниже.
; Итог: ~149 тактов на байт вместо ~900.
LB500	LD A,(DE)		; байт буфера
	XOR (HL)		; XOR with pixels on the screen
	LD C,A			; C = временный (было (IY+$07))
	CPL
	ld (il_scr),hl		; отложить указатель экрана
	ld hl,(z80_ix)		; указатель маски
	AND (HL)		; ~t & mask
	LD (DE),A		; вернуть в буфер
	LD A,(HL)		; mask
	INC HL
	ld (z80_ix),hl		; было: INC IX
	ld hl,(il_scr)		; вернуть указатель экрана
	OR C			; mask | t
	LD (HL),A		; set pixels on the screen
	inc h ;INC L		; next column
	INC DE
	dec b
	jp nz,LB500
	call z80_lda_Y
	defb $06
	INC A
	call z80_sta_Y_7
	call z80_ldl_Y
	defb $0F
	LD H,$00
	EX DE,HL
	ADD HL,DE
	ld (il_hl),hl
	ld hl,(z80_ix)
	add hl,de
	ld (z80_ix),hl
	ld hl,(il_hl)
	EX DE,HL
	POP HL
	dec l ;INC H		; next pixel row
	POP BC
	dec b
	jp nz,LB4FB
	POP BC
	call z80_inc_Y	; increment row
	defb $03
	call z80_lda_Y	; get row
	defb $03
	CP $18			; < 24 ?
	jp NC,LB53A
	dec b
	jp nz,LB4D6
LB53A:
	ld (il_hl),hl
	pop hl
	ld (z80_ix),hl
	ld hl,(il_hl)
	call z80_bitX_13
	and 1<<(5)
	ld a,(il_a)
	jp NZ,LB547
	call z80_bitX_13
	and 1<<(6)
	ld a,(il_a)
	RET Z
LB547:
	call z80_ldh_X
	defb $08
	call z80_ldl_X	; get buffer address
	defb $07
	call z80_lda_X_2
	OR A
	jp NZ,LB5A4
	call z80_bitX_17
	and 1<<(7)
	ld a,(il_a)
	jp NZ,LB57E
	PUSH HL
	POP DE
	INC HL
	call z80_ldb_Y	; number of records to copy
	defb $09
	CALL CopyRecordsFwd	; Copy B records forward, from HL to DE
	DEC DE
	XOR A
	LD (DE),A
;
LB565:
	call z80_lda_X_3
	OR A
	RET NZ
	call z80_ldh_X
	defb $08
	call z80_ldl_X	; get buffer address
	defb $07
	jp LB5A4

; Copy records forward
; I: HL = source address, DE = destination address
; I: IY = record address in LC092 area
; I: B = number of records to copy
CopyRecordsFwd	; LB572
	PUSH BC
	call z80_ldc_Y	; get record size
	defb $0A
	LD B,$00
	ld (il_a),a
i80_ldir_2:
	ld a,(hl)
	ld (de),a
	inc hl
	inc de
	dec bc
	ld a,b
	or c
	jp nz,i80_ldir_2
	ld a,(il_a)
	POP BC
	dec b	; repeat
	jp nz,CopyRecordsFwd
	RET

; I: IY = record address in LC092 area; (IY+$0A) is record size
LB57E:
	call z80_lde_Y	; get record size
	defb $0A
	LD D,$00
	call z80_ldb_Y
	defb $09
LB586	ADD HL,DE
	dec b
	jp nz,LB586
	DEC HL
	LD D,H
	LD E,L
	DEC HL
	call z80_ldb_Y	; number of records to copy
	defb $09
	CALL CopyRecordsBck	; Copy B records backward, from HL to DE
	INC DE
	XOR A
	LD (DE),A
	jp LB565

; Copy records backward
; I: HL = source address, DE = destination address
; I: IY = record address in LC092 area; (IY+$0A) is record size
; I: B = number of records to copy
CopyRecordsBck	; LB598
	PUSH BC
	call z80_ldc_Y	; get record size
	defb $0A
	LD B,$00
	ld (il_a),a
i80_lddr_3:
	ld a,(hl)
	ld (de),a
	dec hl
	dec de
	dec bc
	ld a,b
	or c
	jp nz,i80_lddr_3
	ld a,(il_a)
	POP BC
	dec b	; repeat
	jp nz,CopyRecordsBck
	RET

; I: HL = buffer address ??; $F200 $F500 $F700
; I: IX = record address in LC4F0 area
; I: IY = record address in LC092 area
LB5A4:
	call z80_bitX
	defb $12
	and 1<<(7)
	ld a,(il_a)
	jp NZ,LB5C1
	PUSH HL
	call z80_lde_Y	; get record size
	defb $0A
	LD D,$00
	ADD HL,DE
	POP DE
	call z80_ldb_Y	; number of records to copy
	defb $08
	CALL CopyRecordsFwd	; Copy B records forward, from HL to DE
	call z80_ldb_Y	; get record size
	defb $0A
	XOR A
LB5BC	LD (DE),A		; clear the record
	INC DE
	dec b
	jp nz,LB5BC
	RET
LB5C1:
	call z80_lde_Y	; get record size
	defb $0A
	LD D,$00
	call z80_ldb_Y	; number of records to skip
	defb $08
LB5C9	ADD HL,DE
	dec b
	jp nz,LB5C9
	DEC HL
	PUSH HL
	ADD HL,DE
	POP DE
	EX DE,HL
	call z80_ldb_Y	; number of records to copy
	defb $08
	CALL CopyRecordsBck	; Copy B records backward, from HL to DE
	call z80_ldb_Y	; get record size
	defb $0A
	XOR A
LB5DB	LD (DE),A		; clear the record
	DEC DE
	dec b
	jp nz,LB5DB
	RET

; I: IX = record address in LC4F0 area
; I: IY = record address in LC092 area
LB5E0:
; ЭТАП C. Базы IX (запись существа) и IY (дескриптор типа) обе гуляют — прямая
; адресация невозможна, а хелпер стоит ~190 тактов. Считаем адрес прямо в HL.
; HL освобождён тем, что положение экрана на карте 256x256 держим в DE, а не в
; HL: в окне от LD HL,(L5B0B) до SUB H регистр DE не используется вовсе, а все
; переходы на LB5EE/LB60A/LB62D — ВНУТРЕННИЕ (проверено грепом по исходнику,
; иначе снаружи кто-нибудь пришёл бы сюда с ожиданием HL = позиция карты).
	ld hl,(z80_ix)
	ld de,000Dh
	add hl,de		; -> (IX+$0D)
	ld a,(hl)
	and (~(1<<(1)))&255	; было: RES 1,(IX+$0D)
	ld (hl),a
	and 1<<(0)		; было: BIT 0,(IX+$0D) — байт тот же, читать заново незачем
	jp Z,LB5EE
	ld a,(hl)
	or 1<<(1)		; было: SET 1,(IX+$0D)
	ld (hl),a
LB5EE:
	ld hl,(z80_ix)
	ld de,000Dh
	add hl,de
	ld a,(hl)
	and (~(1<<(0)))&255	; было: RES 0,(IX+$0D)
	ld (hl),a
	ld hl,(L5B0B)		; get screen position on 256x256 map
	ld e,l			; позицию держим в DE, HL нужен под указатель
	ld d,h
	ld hl,(z80_ix)
	ld a,(hl)		; было: LD A,(IX+$00) — смещение 0, складывать нечего
	sub e			; было: SUB L
	LD C,A
	CP $18			; < 24 ?
	jp C,LB60A
	ld hl,(z80_iy)
	push de
	ld de,0006h
	add hl,de
	pop de
	add a,(hl)		; было: ADD A,(IY+$06)
	CP $18			; < 24 ?
	LD A,C
	jp C,LB60A
	ld hl,(z80_ix)
	push de
	ld de,000Dh
	add hl,de
	pop de
	ld a,(hl)
	or 1<<(0)		; было: SET 0,(IX+$0D)
	ld (hl),a
	ld a,c			; на Z80 SET не трогал A, а он тут равен C
LB60A:
	ld hl,(z80_iy)
	push de
	ld de,0002h
	add hl,de
	pop de
	ld (hl),a		; было: LD (IY+$02),A
	ld hl,(z80_iy)
	ld (hl),a		; было: LD (IY+$00),A — смещение 0
	ld hl,(z80_ix)
	inc hl
	ld a,(hl)		; было: LD A,(IX+$01)
	sub d			; было: SUB H
	CP $18			; < 24 ?
	LD C,A
	jp C,LB62D
	ld hl,(z80_iy)
	push de
	ld de,0008h
	add hl,de
	pop de
	add a,(hl)		; было: ADD A,(IY+$08)
	CP $18
	LD A,C
	jp C,LB62D
	ld hl,(z80_iy)
	inc hl
	ld (hl),a		; было: LD (IY+$01),A
	ld hl,(z80_ix)
	ld de,000Dh		; DE больше не нужен: за LB65F он переопределяется
	add hl,de
	ld a,(hl)
	and (~(1<<(0)))&255	; было: RES 0,(IX+$0D)
	ld (hl),a		; A уже равен новому значению — это и есть LD A,(IX+$0D)
	jp LB65F
LB62D:
	call z80_sta_Y_3
	call z80_sta_Y_1
	call z80_lda_X_13
	XOR $01			; inverse bit 0
	rst 20h	; = call z80_sta_X
	defb $0D
	ld (il_a),a
	and 1<<(0)
	ld a,(il_a)
	jp Z,LB65F
	ld (il_a),a
	and 1<<(1)
	ld a,(il_a)
	RET NZ
	LD HL,LB676
	XOR A
LB646:
	ld (il_a),a
	ld a,(HL)
	and 1<<(7)
	ld a,(il_a)
	jp Z,LB655
	INC HL
	INC A
	ld (il_a),a
	and 1<<(4)
	ld a,(il_a)
	jp Z,LB646
; ПУЛ ИСЧЕРПАН — штатная ветка автора: бит 7 в (IX+$0D), буфер не выдан,
; существо в этот кадр не рисуется. Метка названа для гейта полноты: он считает
; срабатывания этой ветки и сверяет их число с безвыселенной сборкой (у обеих
; обязан быть ноль — мест 16, как в стоке).
LB646_none:
	rst 30h	; = call z80_setX
	defb $0D
	defb 1<<(7)
	RET
LB655	AND $0F			; 0..15
; ПОЛНАЯ СТРАНИЦА НА ИНДЕКС — так в стоке, так и здесь. Буфер save-under занимает
; (IY+$09)*(IY+$0A) байт, и это до 256 (лодка и акула — 4x64, кальмар 3x64, рыба
; 3x56; замер poolfoot_probe.js). Ломоть в 48 или 64 байта под него не годится,
; поэтому раздатчик размера и не знает — он просто отдаёт страницу целиком.
; База POOL_HI: 0xB0 без выселения (как в стоке), 0xA0 под -DEVICT, где стоковые
; страницы отданы кадрам дайвера. Возврат в пул (LB65F, LBCB4) восстанавливает
; индекс младшим полубайтом старшего байта — правило работает при любой базе,
; кратной 16 страницам.
	or POOL_HI
	rst 20h	; = call z80_sta_X
	defb $08
LB655_marked:
	push af
	ld a,(hl)
	or 1<<(7)
	ld (hl),a
	pop af
	RET
LB65F:
	ld (il_a),a
	and 1<<(1)
	ld a,(il_a)
	RET Z
	call z80_bitX_13
	and 1<<(7)
	ld a,(il_a)
	RET NZ
	call z80_lda_X
	defb $08
	AND $0F			; 0..15: база пула кратна 16 страницам
	LD HL,LB676
	LD E,A
	LD D,$00
	ADD HL,DE
	push af
	ld a,(hl)
	and (~(1<<(7)))&255
	ld (hl),a
	pop af
	RET

LB676	DEFS $10

; I: IX = record address in LC4F0 area
; I: IY = record address in LC092 area
LB686:
	call z80_bitX_13
	and 1<<(5)
	ld a,(il_a)
	jp Z,LB6D6
	call z80_ldhl_Y	; get column
	defb $00		; было: два вызова, младший+старший
	LD A,$06
	call z80_xor_X
	defb $04
	LD C,A
	call z80_bitX_17
	and 1<<(7)
	ld a,(il_a)
	jp NZ,LB6A6
	call z80_inc_X	; one column right
	defb $00
	call z80_inc_Y
	defb $00
	jp LB6B1
LB6A6:
	call z80_dec_X	; one column left
	defb $00
	call z80_dec_Y
	defb $00
	LD A,L
	call z80_add_Y	; add DX ??
	defb $06
	LD L,A
LB6B1:
	call z80_ldb_Y	; get object height - loop counter
	defb $09
LB6B4	LD A,H
	AND $E0			; check for 0..31 range
	jp NZ,LB6D3	; out of range => skip
	LD A,H
	CP $18			; row < 24 ?
	jp NC,LB6D3	; no => skip
	LD A,L
	AND $E0			; check for 0..31 range
	jp NZ,LB6D3	; out of range => skip
	LD A,L
	CP $18			; column < 24 ?
	jp NC,LB6D3	; no => skip
	PUSH HL
	CALL GetScrAttrAddr	; Get screen attribute address
	LD A,C
	CP (HL)			; same color?
	jp NZ,LB6D2	; no => skip
	LD (HL),$06
LB6D2	POP HL
LB6D3	INC H			; next row
	dec b
	jp nz,LB6B4
LB6D6:
	call z80_bitX_13
	and 1<<(6)
	ld a,(il_a)
	jp Z,LB704
	call z80_ldhl_Y	; get column
	defb $00		; было: два вызова, младший+старший
	LD A,$06
	call z80_xor_X
	defb $04
	LD C,A
	call z80_bitX
	defb $12
	and 1<<(7)
	ld a,(il_a)
	jp NZ,LB6F6
	call z80_inc_Y	; one row down
	defb $01
	call z80_inc_X
	defb $01
	jp LB701
LB6F6:
	call z80_dec_Y	; one row up
	defb $01
	call z80_dec_X
	defb $01
	LD A,H
	call z80_add_Y
	defb $08
	LD H,A
LB701	CALL LB70F		; Screen attribute change for horizontally oriented object
LB704:
	call z80_ldhl_Y	; get column
	defb $00		; было: два вызова, младший+старший
	LD C,$06
	JP LB875

; Screen attribute change for horizontally oriented object
; I: IX = record address in LC4F0 area
; I: IY = record address in LC092 area
; I: HL = (row, column)
LB70F	LD A,H			; row
	AND $E0			; check for 0..31 range
	RET NZ			; return if out of range
	LD A,H			; row
	CP $18			; < 24 ?
	RET NC			; return if >= 24
	PUSH HL
	call z80_ldb_Y	; object width as loop counter
	defb $07
LB71B	LD A,L			; column
	AND $E0			; check for 0..31 range
	jp NZ,LB732	; return if out of range
	LD A,L			; column
	CP $18			; < 24 ?
	jp NC,LB732	; return if >= 24
	PUSH HL
	CALL GetScrAttrAddr	; Get screen attribute address
	LD A,(HL)		; get color from the screen
	CP C			; same color?
	jp NZ,LB731	; skip if not
	call z80_xor_X	; change color
	defb $04
	LD (HL),A		; write color to the screen
LB731	POP HL
LB732	INC L			; next column
	dec b
	jp nz,LB71B
	POP HL
	RET

; I: IX = record address in LC4F0 area
LB737:
; ЭТАП C: прямые указатели вместо хелперов (IX+d).
; В этом блоке НЕТ НИ ОДНОГО вызова, а HL и DE мертвы: DE занят только первыми
; тремя строками (адрес записи в области LC092 -> тень IY), дальше не нужен;
; HL не используется до CALL LB5E0; флаги никто не читает до конца блока.
; Поэтому адрес считаем прямо в HL: ld hl,(z80_ix) / ld de,d / add hl,de —
; около 43 тактов на обращение против ~190 у хелпера.
	ld hl,(z80_ix)
	ld de,0013h
	add hl,de
	ld e,(hl)		; было: LD E,(IX+$13)
	inc hl
	ld d,(hl)		; было: LD D,(IX+$14)
	ld a,e			; было: PUSH DE / POP IY
	ld (z80_iy),a		; (ld (nn),de — это Z80, на i8080 такого нет)
	ld a,d
	ld (z80_iy+1),a
	ld hl,(z80_ix)
	ld de,000Eh
	add hl,de
	ld a,(hl)		; было: LD A,(IX+$0E)
	inc hl
	ld (hl),a		; было: LD (IX+$0F),A
	dec hl
	dec hl			; -> (IX+$0D)
	ld a,(hl)
	and 09Fh		; было: RES 5,(IX+$0D) и RES 6,(IX+$0D) — одной маской
	ld (hl),a
	ld hl,(z80_ix)
	ld de,0002h
	add hl,de		; -> (IX+$02)
	ld a,(hl)
	push hl
	ld de,000Fh
	add hl,de		; -> (IX+$11)
	add a,(hl)
	and 007h		; 0..7
	pop hl			; -> (IX+$02)
	ld (hl),a
	inc hl			; -> (IX+$03)
	ld a,(hl)
	push hl
	ld de,000Fh
	add hl,de		; -> (IX+$12)
	add a,(hl)
	and 007h		; 0..7
	pop hl			; -> (IX+$03)
	ld (hl),a
	CALL LB5E0
	call z80_bitX_13
	and 1<<(0)
	ld a,(il_a)
	jp Z,LB77B
	call z80_bitX_13
	and 1<<(7)
	ld a,(il_a)
	jp NZ,LB79E
	CALL LB470
	CALL LB686
	jp LB79E
LB77B:
	call z80_lda_X_2
	call z80_resX
	defb $0D
	defb (~(1<<(7)))&255
	OR A
	jp NZ,LB789
	rst 30h	; = call z80_setX
	defb $0D
	defb 1<<(5)
LB789:
	call z80_lda_X_3
	OR A
	jp NZ,LB793
	rst 30h	; = call z80_setX
	defb $0D
	defb 1<<(6)
LB793:
	call z80_lda_X_13
	AND $60
	jp Z,LB79E
	CALL LB686
	RET
LB79E:
	call z80_lda_X_2
	call z80_bitX_13
	and 1<<(2)
	ld a,(il_a)
	jp Z,LB7AA
	call z80_lda_X_3
LB7AA	CP $04
	RET NZ
	LD HL,LB7B8		; address of the return point - put on the stack
	PUSH HL
	call z80_ldh_X	; get address of moving procedure
	defb $06
	call z80_ldl_X
	defb $05
	JP (HL)			; run the moving procedure
; Point of return
LB7B8	RET

; СТЕЙДЖИНГ-БУФЕР = СТРАНИЦА ИНДЕКСА 0, забронированного в LBEC7 навсегда.
; Адрес обязан следовать за базой пула: под -DEVICT это 0xA000, иначе стоковый
; 0xB000. Литерал здесь и в LBEC7 — одно и то же место, и разъехаться им нельзя.
LB7B9	DW POOL_HI*256		; buffer address ??

; I: IX = object address in LC4F0 area
LB7BB:
	call z80_lda_X_13
	AND $9E			; clear bits 0,5,6
	rst 20h	; = call z80_sta_X
	defb $0D
	call z80_lde_X	;
	defb $13
	call z80_ldd_X	; get record address in block LC092
	defb $14
	PUSH DE
	ld (il_hl),hl	; now IY = record address in block LC092
	pop hl
	ld (z80_iy),hl
	ld hl,(il_hl)
	call z80_lda_X_2
	call z80_add_X
	defb $11
	AND $07			; 0..7
	rst 20h	; = call z80_sta_X
	defb $02
	call z80_lda_X_3
	call z80_add_X
	defb $12
	AND $07			; 0..7
	rst 20h	; = call z80_sta_X
	defb $03
	CALL LB5E0
	call z80_bitX_13
	and 1<<(0)
	ld a,(il_a)
	jp Z,LB7F9
	call z80_bitX_13
	and 1<<(7)
	ld a,(il_a)
	jp NZ,LB81C
	CALL LB470
	CALL LB837
	jp LB81C
LB7F9:
	call z80_lda_X_2
	call z80_resX
	defb $0D
	defb (~(1<<(7)))&255
	OR A
	jp NZ,LB807
	rst 30h	; = call z80_setX
	defb $0D
	defb 1<<(5)
LB807:
	call z80_lda_X_3
	OR A
	jp NZ,LB811
	rst 30h	; = call z80_setX
	defb $0D
	defb 1<<(6)
LB811:
	call z80_lda_X_13
	AND $60
	jp Z,LB81C
	CALL LB686
	RET
LB81C:
	call z80_lda_X_2
	call z80_bitX_13
	and 1<<(2)
	ld a,(il_a)
	jp Z,LB828
	call z80_lda_X_3
LB828	CP $04
	RET NZ
	LD HL,LB836		; point of return address
	PUSH HL			; put on stack
	call z80_ldh_X	; get address of moving procedure
	defb $06
	call z80_ldl_X
	defb $05
	JP (HL)			; run the moving procedure
; Point of return
LB836	RET

; I: IX = object address in LC4F0 area
; I: IY = record address in LC092 area
LB837	LD A,$06
	call z80_bitX_13
	and 1<<(0)
	ld a,(il_a)
	jp NZ,LB842
	call z80_xor_X
	defb $04
LB842	LD C,A
	call z80_ldhl_Y
	defb $00		; было: два вызова, младший+старший
	call z80_lda_X_2
	OR A
	jp NZ,LB85F
	call z80_bitX_17
	and 1<<(7)
	ld a,(il_a)
	jp NZ,LB85B
	call z80_inc_X
	defb $00
	INC L
	jp LB85F
LB85B:
	call z80_dec_X
	defb $00
	DEC L
LB85F:
	call z80_lda_X_3
	OR A
	jp NZ,LB875
	call z80_bitX
	defb $12
	and 1<<(7)
	ld a,(il_a)
	jp NZ,LB871
	call z80_inc_X
	defb $01
	INC H
	jp LB875
LB871:
	call z80_dec_X
	defb $01
	DEC H
;
LB875:
	call z80_lda_Y
	defb $09
	call z80_sta_Y
	defb $0E
LB87B	CALL LB70F		; Screen attribute change for horizontally oriented object
	INC H			; next row
	call z80_dec_Y
	defb $0E
	jp NZ,LB87B
	RET

; Moving procedure for fish object moving horizontal
; I: IX = record address in LC4F0 area
LB885:
	call z80_bitX	; check "moving" bit
	defb $10
	and 1<<(0)
	ld a,(il_a)
	JP NZ,LB941
	call z80_bitX_17
	and 1<<(7)
	ld a,(il_a)
	call z80_lda_X	; get column 0..255
	defb $00
	jp NZ,LB89C
	INC A
	INC A
	call z80_add_Y
	defb $07
	jp LB89F
LB89C	DEC A
	DEC A
	DEC A
LB89F	LD L,A
	call z80_ldh_X	; get row 0..255
	defb $01
	CALL GetTileInBlock	; Calculate address in relief block and Get tile nummber
	OR A			; empty tile?
	jp NZ,LB903
	INC H			; down one row
	CALL GetTileInBlock	; Calculate address in relief block and Get tile nummber
	OR A			; empty tile?
	jp NZ,LB903
	call z80_bitX_13
	and 1<<(0)
	ld a,(il_a)
	jp Z,LB8D7
	call z80_bitX_13
	and 1<<(7)
	ld a,(il_a)
	jp NZ,LB8D7
	ld (il_hl),hl	; get screen position on 256x256 map
	ld hl,(L5B0B)
	ld e,l
	ld d,h
	ld hl,(il_hl)
	LD A,H			; get screen row
	SUB D			; now A = [row 0..255] - [screen row]
	CP $18			; result within 0..23 ?
	jp NC,LB8D7
	LD D,A			; now D = row 0..23
	LD A,L			; get screen column
	SUB E			; now A = [column 0..255] - [screen column]
	CP $18			; result within 0..23 ?
	jp NC,LB8D7
	LD L,A
	LD H,D			; now HL = row/column on the screen
	CALL GetScrAttrAddr	; Get screen attribute address
	LD A,(HL)		; get attribute value
	CP $06
	jp NZ,LB903
LB8D7:
	call z80_ldar
	jp Z,LB903
	LD C,A
	AND $40
	jp Z,LB8E5
LB8E0:
	rst 28h	; = call z80_stn_X
	defb $12
	defb $00
	RET
LB8E5:
	ld (il_a),a
	ld a,C
	and 1<<(2)
	ld a,(il_a)
	jp Z,LB8F6
	call z80_lda_X
	defb $01
	call z80_cp_X
	defb $15
	jp NC,LB8E0
	rst 28h	; = call z80_stn_X
	defb $12
	defb $01
	RET
LB8F6:
	call z80_lda_X
	defb $16
	call z80_cp_X
	defb $01
	jp NC,LB8E0
	rst 28h	; = call z80_stn_X
	defb $12
	defb $FF
	RET
LB903:
	call z80_bitX_17
	and 1<<(7)
	ld a,(il_a)
	jp Z,LB917
	call z80_lda_X
	defb $17
	rst 20h	; = call z80_sta_X
	defb $18
	call z80_ldhl_Y
	defb $16		; было: два вызова, младший+старший
	jp LB924
LB917	XOR A
	call z80_sub_X
	defb $17
	rst 20h	; = call z80_sta_X
	defb $18
	call z80_ldhl_Y
	defb $14		; было: два вызова, младший+старший
LB924:
	call z80_stl_X
	defb $0B
	call z80_sth_X
	defb $0C
	rst 28h	; = call z80_stn_X
	defb $11
	defb $00
	rst 28h	; = call z80_stn_X
	defb $12
	defb $00
	rst 30h	; = call z80_setX
	defb $10
	defb 1<<(0)
	call z80_lda_Y
	defb $0C
	rst 20h	; = call z80_sta_X
	defb $19
	call z80_sla_X
	defb $0E
	RET
LB941:
	call z80_dec_X
	defb $19
	RET NZ
	call z80_lda_X
	defb $18
	rst 20h	; = call z80_sta_X
	defb $11
	ld (il_a),a
	and 1<<(7)
	ld a,(il_a)
	jp Z,LB957
	call z80_ldhl_Y
	defb $10		; было: два вызова, младший+старший
	jp LB95D
LB957:
	call z80_ldhl_Y
	defb $12		; было: два вызова, младший+старший
LB95D:
	call z80_stl_X	; set sprite address
	defb $09
	call z80_sth_X
	defb $0A
	call z80_stl_X	; set sprite address
	defb $0B
	call z80_sth_X
	defb $0C
	call z80_resX	; clear "moving" bit
	defb $10
	defb (~(1<<(0)))&255
	call z80_srl_X
	defb $0E
	RET

; Moving procedure for fish object moving vertical
; I: IX = record address in LC4F0 area
LB972:
	call z80_bitX	; check "moving" bit
	defb $10
	and 1<<(0)
	ld a,(il_a)
	JP NZ,LBA33
	call z80_bitX
	defb $12
	and 1<<(7)
	ld a,(il_a)
	call z80_lda_X	; get row 0..255
	defb $01
	jp NZ,LB988
	call z80_add_Y
	defb $09
	INC A
	jp LB98A
LB988	DEC A
	DEC A
LB98A	LD H,A
	call z80_ldl_X	; get column 0..255
	defb $00
	CALL GetTileInBlock	; Calculate address in relief block and Get tile nummber
	OR A			; empty tile?
	jp NZ,LB9F9
	LD A,L
	call z80_add_Y
	defb $06
	LD L,A
	CALL GetTileInBlock	; Calculate address in relief block and Get tile nummber
	OR A			; empty tile?
	jp NZ,LB9F9
	call z80_bitX_13
	and 1<<(0)
	ld a,(il_a)
	jp Z,LB9C7
	call z80_bitX_13
	and 1<<(7)
	ld a,(il_a)
	jp NZ,LB9C7
	ld (il_hl),hl
	ld hl,(L5B0B)
	ld e,l
	ld d,h
	ld hl,(il_hl)
	LD A,H
	SUB D
	CP $18			; 24
	jp NC,LB9C7
	LD D,A
	LD A,L
	DEC A
	SUB E
	CP $18			; 24
	jp NC,LB9C7
	LD L,A
	LD H,D
	CALL GetScrAttrAddr	; Get screen attribute address
	LD A,(HL)		; get attribute value
	CP $06
	jp NZ,LB9F9
LB9C7:
	call z80_ldar
	jp Z,LB9F9
	ld (il_a),a
	and 1<<(6)
	ld a,(il_a)
	jp Z,LB9D4
LB9CF:
	rst 28h	; = call z80_stn_X
	defb $11
	defb $00
	RET
LB9D4:
	ld (il_a),a
	and 1<<(2)
	ld a,(il_a)
	LD C,$01
	jp Z,LB9E3
	LD C,$FF
	LD A,L
	call z80_sub_Y
	defb $06
	SUB $02
	LD L,A
LB9E3	INC L
	CALL GetTileInBlock	; Calculate address in relief block and Get tile nummber
	OR A			; empty tile?
	jp NZ,LB9CF
	LD A,H
	call z80_add_Y
	defb $08
	LD H,A
	CALL GetTileInBlock	; Calculate address in relief block and Get tile nummber
	OR A			; empty tile?
	jp NZ,LB9CF
	call z80_stc_X
	defb $11
	RET
LB9F9:
	call z80_bitX
	defb $12
	and 1<<(7)
	ld a,(il_a)
	jp Z,LBA0A
	call z80_lda_X
	defb $17
	call z80_ldhl_Y
	defb $14		; было: два вызова, младший+старший
	jp LBA14
LBA0A	XOR A
	call z80_sub_X
	defb $17
	call z80_ldhl_Y
	defb $16		; было: два вызова, младший+старший
LBA14:
	rst 20h	; = call z80_sta_X
	defb $18
	call z80_stl_X
	defb $0B
	call z80_sth_X
	defb $0C
	XOR A
	rst 20h	; = call z80_sta_X
	defb $11
	rst 20h	; = call z80_sta_X
	defb $12
	rst 30h	; = call z80_setX
	defb $10
	defb 1<<(0)
	call z80_lda_Y
	defb $0C
	rst 20h	; = call z80_sta_X
	defb $19
	call z80_sla_X
	defb $0E
	RET
LBA33:
	call z80_dec_X
	defb $19
	RET NZ
	call z80_lda_X
	defb $18
	rst 20h	; = call z80_sta_X
	defb $12
	ld (il_a),a
	and 1<<(7)
	ld a,(il_a)
	jp Z,LBA49
	call z80_ldhl_Y
	defb $12		; было: два вызова, младший+старший
	jp LBA4F
LBA49:
	call z80_ldhl_Y
	defb $10		; было: два вызова, младший+старший
LBA4F:
	call z80_stl_X
	defb $09
	call z80_sth_X
	defb $0A
	call z80_stl_X
	defb $0B
	call z80_sth_X
	defb $0C
	call z80_resX	; clear "moving" bit
	defb $10
	defb (~(1<<(0)))&255
	call z80_srl_X
	defb $0E
	RET

; Moving procedure for fish object moving horizontal
; I: IX = record address in LC4F0 area
LBA64:
	call z80_bitX	; check "moving" bit
	defb $10
	and 1<<(0)
	ld a,(il_a)
	JP NZ,LBC8F
	rst 30h	; = call z80_setX
	defb $10
	defb 1<<(5)
	call z80_bitX_13
	and 1<<(2)
	ld a,(il_a)
	call z80_ldhl_X
	defb $00		; было: два вызова, младший+старший
	JP NZ,LBB94
	call z80_bitX_17
	and 1<<(7)
	ld a,(il_a)
	jp NZ,LBA8F
	LD A,L
	call z80_add_Y
	defb $07
	LD L,A
	call z80_ldd_Y
	defb $15
	call z80_lde_Y
	defb $14
	jp LBA96
LBA8F	DEC L
	call z80_ldd_Y	; Get ??
	defb $17
	call z80_lde_Y
	defb $16
LBA96	CALL GetTileInBlock	; Calculate address in relief block and Get tile nummber
	OR A			; empty tile?
	jp NZ,LBADE
	LD A,H
	call z80_add_Y
	defb $08
	LD H,A
	CALL GetTileInBlock	; Calculate address in relief block and Get tile nummber
	OR A			; empty tile?
	jp NZ,LBADE
	call z80_ldar
	jp Z,LBADE
	ld (il_a),a
	and 1<<(6)
	ld a,(il_a)
	jp NZ,LBAB4
LBAAF:
	rst 28h	; = call z80_stn_X
	defb $12
	defb $00
	RET
LBAB4:
	call z80_ldh_X	; get row 0..255
	defb $01
	call z80_ldl_X	; get column 0..255
	defb $00
	DEC H			; one row up
	LD C,$FF
	ld (il_a),a
	and 1<<(2)
	ld a,(il_a)
	jp Z,LBAC9
	LD C,$01
	LD A,H
	call z80_add_Y
	defb $09
	LD H,A
	INC H			; one row down
LBAC9	CALL GetTileInBlock	; Calculate address in relief block and Get tile nummber
	OR A			; empty tile?
	jp NZ,LBAAF
	LD A,L
	call z80_add_Y
	defb $06
	LD L,A
	CALL GetTileInBlock	; Calculate address in relief block and Get tile nummber
	OR A			; empty tile?
	jp NZ,LBAAF
	call z80_stc_X
	defb $12
	RET
LBADE:
	call z80_ste_X
	defb $0B
	call z80_std_X
	defb $0C
	rst 30h	; = call z80_setX
	defb $10
	defb 1<<(0)
	call z80_resX
	defb $10
	defb (~(1<<(7)))&255
	call z80_sla_X
	defb $0E
	call z80_ldhl_X	; get column 0..255
	defb $00		; было: два вызова, младший+старший
	call z80_bitX_17
	and 1<<(7)
	ld a,(il_a)
	jp NZ,LBB04
	LD A,L
	call z80_add_Y
	defb $06
	call z80_sub_Y
	defb $08
	LD L,A
LBB04:
	call z80_ldar
	jp Z,LBB32
	LD A,H
	CP $4A
	jp C,LBB32
	call z80_add_Y
	defb $08
	call z80_sub_Y
	defb $07
	LD H,A
	CALL GetTileInBlock	; Calculate address in relief block and Get tile nummber
	OR A			; empty tile?
	jp NZ,LBB32
	LD A,L
	LD C,L
	call z80_add_Y
	defb $08
	LD L,A
	CALL GetTileInBlock	; Calculate address in relief block and Get tile nummber
	OR A			; empty tile?
	LD L,C
	jp NZ,LBB32
	rst 30h	; = call z80_setX
	defb $10
	defb 1<<(6)
	XOR A
	call z80_sub_X
	defb $17
	INC H
	jp LBB5E
LBB32:
	call z80_ldar
	jp Z,LBB75
	call z80_lda_X	; get row 0..255
	defb $01
	CP $FA
	jp NC,LBB75
	call z80_add_Y
	defb $07
	LD H,A
	CALL GetTileInBlock	; Calculate address in relief block and Get tile nummber
	OR A			; empty tile?
	jp NZ,LBB75
	LD C,L
	LD A,L
	call z80_add_Y
	defb $08
	LD L,A
	CALL GetTileInBlock	; Calculate address in relief block and Get tile nummber
	OR A			; empty tile?
	LD L,C
	jp NZ,LBB75
	rst 30h	; = call z80_setX
	defb $10
	defb 1<<(6)
	call z80_lda_X
	defb $17
	call z80_ldh_X	; get row 0..255
	defb $01
LBB5E:
	rst 20h	; = call z80_sta_X
	defb $18
	XOR A
	rst 20h	; = call z80_sta_X
	defb $12
	rst 20h	; = call z80_sta_X
	defb $11
	call z80_stl_X
	defb $1A
	call z80_sth_X
	defb $1B
	call z80_lda_X
	defb $15
	rst 20h	; = call z80_sta_X
	defb $19
	RET
LBB75:
	call z80_resX
	defb $10
	defb (~(1<<(6)))&255
	call z80_resX
	defb $10
	defb (~(1<<(5)))&255
	call z80_ldh_X	; get row 0..255
	defb $01
	call z80_ldl_X	; get column 0..255
	defb $00
	call z80_bitX_17
	and 1<<(7)
	ld a,(il_a)
	jp NZ,LBB8F
	XOR A
	call z80_sub_X
	defb $17
	jp LBB5E
LBB8F:
	call z80_lda_X
	defb $17
	jp LBB5E
LBB94:
	call z80_bitX
	defb $12
	and 1<<(7)
	ld a,(il_a)
	jp NZ,LBBA7
	LD A,H
	call z80_add_Y
	defb $09
	LD H,A
	call z80_ldd_Y
	defb $17
	call z80_lde_Y
	defb $16
	jp LBBAE
LBBA7	DEC H			; one row up
	call z80_ldd_Y
	defb $15
	call z80_lde_Y
	defb $14
LBBAE	CALL GetTileInBlock	; Calculate address in relief block and Get tile nummber
	OR A			; empty tile?
	jp NZ,LBBF6
	LD A,L
	call z80_add_Y
	defb $06
	LD L,A
	CALL GetTileInBlock	; Calculate address in relief block and Get tile nummber
	OR A			; empty tile?
	jp NZ,LBBF6
	call z80_ldar
	jp Z,LBBF6
	ld (il_a),a
	and 1<<(6)
	ld a,(il_a)
	jp NZ,LBBCC
LBBC7:
	rst 28h	; = call z80_stn_X
	defb $11
	defb $00
	RET
LBBCC:
	call z80_ldh_X	; get row 0..255
	defb $01
	call z80_ldl_X	; get column 0..255
	defb $00
	DEC L			; one column left
	LD C,$FF
	ld (il_a),a
	and 1<<(2)
	ld a,(il_a)
	jp Z,LBBE1
	LD C,$01
	LD A,L
	call z80_add_Y
	defb $07
	INC A
	LD L,A
LBBE1	CALL GetTileInBlock	; Calculate address in relief block and Get tile nummber
	OR A			; empty tile?
	jp NZ,LBBC7
	LD A,H
	call z80_add_Y
	defb $08
	LD H,A
	CALL GetTileInBlock	; Calculate address in relief block and Get tile nummber
	OR A			; empty tile?
	jp NZ,LBBC7
	call z80_stc_X
	defb $11
	RET
LBBF6:
	call z80_ste_X
	defb $0B
	call z80_std_X
	defb $0C
	rst 30h	; = call z80_setX
	defb $10
	defb 1<<(0)
	rst 30h	; = call z80_setX
	defb $10
	defb 1<<(7)
	call z80_sla_X
	defb $0E
	call z80_ldhl_X	; get row 0..255
	defb $00		; было: два вызова, младший+старший
	call z80_bitX
	defb $12
	and 1<<(7)
	ld a,(il_a)
	jp NZ,LBC1C
	LD A,H
	call z80_add_Y
	defb $08
	call z80_sub_Y
	defb $06
	LD H,A
LBC1C:
	call z80_ldar
	jp Z,LBC47
	LD A,L
	call z80_add_Y
	defb $06
	call z80_sub_Y
	defb $09
	LD L,A
	CALL GetTileInBlock	; Calculate address in relief block and Get tile nummber
	OR A			; empty tile?
	jp NZ,LBC47
	LD A,H
	LD C,H
	call z80_add_Y
	defb $06
	LD H,A
	CALL GetTileInBlock	; Calculate address in relief block and Get tile nummber
	OR A			; empty tile?
	LD H,C
	jp NZ,LBC47
	call z80_resX
	defb $10
	defb (~(1<<(6)))&255
	XOR A
	call z80_sub_X
	defb $17
	INC L
	JP LBB5E
LBC47:
	call z80_lda_X
	defb $00
	call z80_add_Y
	defb $09
	LD L,A
	CALL GetTileInBlock	; Calculate address in relief block and Get tile nummber
	OR A			; empty tile?
	jp NZ,LBC6E
	LD C,H
	LD A,H
	call z80_add_Y
	defb $06
	LD H,A
	CALL GetTileInBlock	; Calculate address in relief block and Get tile nummber
	OR A			; empty tile?
	LD H,C
	jp NZ,LBC6E
	call z80_resX
	defb $10
	defb (~(1<<(6)))&255
	call z80_lda_X
	defb $17
	call z80_ldl_X
	defb $00
	JP LBB5E
LBC6E:
	rst 30h	; = call z80_setX
	defb $10
	defb 1<<(6)
	call z80_resX
	defb $10
	defb (~(1<<(5)))&255
	call z80_ldh_X	; get row 0..255
	defb $01
	call z80_ldl_X	; get column 0..255
	defb $00
	call z80_bitX
	defb $12
	and 1<<(7)
	ld a,(il_a)
	jp NZ,LBC89
	XOR A
	call z80_sub_X
	defb $17
	JP LBB5E
LBC89:
	call z80_lda_X
	defb $17
	JP LBB5E
LBC8F:
	call z80_bitX
	defb $10
	and 1<<(1)
	ld a,(il_a)
	JP NZ,LBD4E
	call z80_dec_X
	defb $19
	RET NZ
	CALL LB5E0
	call z80_bitX_13
	and 1<<(0)
	ld a,(il_a)
	jp Z,LBCC1
	call z80_bitX_13
	and 1<<(7)
	ld a,(il_a)
	jp NZ,LBCC1
	call z80_resX
	defb $0D
	defb (~(1<<(0)))&255
	CALL LB470
	CALL LB837
	call z80_lda_X
	defb $08
	AND $0F			; 0..15: база пула кратна 16 страницам
	LD E,A
	LD D,$00
	LD HL,LB676
	ADD HL,DE
	LD (HL),$00
LBCC1:
	call z80_bitX
	defb $10
	and 1<<(5)
	ld a,(il_a)
	jp Z,LBCEA
	call z80_lda_X_2
	call z80_ldb_X
	defb $03
	rst 20h	; = call z80_sta_X
	defb $03
	call z80_stb_X
	defb $02
	call z80_lda_X_13
	XOR $04
	rst 20h	; = call z80_sta_X
	defb $0D
	call z80_ldhl_Y
	defb $04		; было: два вызова, младший+старший
	PUSH HL
	ld (il_hl),hl
	pop hl
	ld (z80_iy),hl
	ld hl,(il_hl)
	call z80_stl_X	; set X value
	defb $13
	call z80_sth_X	; set Y value
	defb $14
LBCEA:
	call z80_lda_X
	defb $1A
	rst 20h	; = call z80_sta_X
	defb $00
	call z80_lda_X
	defb $1B
	rst 20h	; = call z80_sta_X
	defb $01
	call z80_bitX
	defb $10
	and 1<<(6)
	ld a,(il_a)
	jp Z,LBD04
	call z80_bitX
	defb $18
	and 1<<(7)
	ld a,(il_a)
	jp Z,LBD0A
	jp LBD18
LBD04:
	call z80_bitX
	defb $18
	and 1<<(7)
	ld a,(il_a)
	jp Z,LBD18
LBD0A:
	call z80_ldh_Y
	defb $19
	call z80_ldl_Y
	defb $18
	call z80_ldd_Y
	defb $11
	call z80_lde_Y
	defb $10
	jp LBD24
LBD18:
	call z80_ldh_Y
	defb $1B
	call z80_ldl_Y
	defb $1A
	call z80_ldd_Y
	defb $13
	call z80_lde_Y
	defb $12
LBD24:
	call z80_std_X
	defb $0A
	call z80_ste_X
	defb $09
	call z80_sth_X
	defb $0C
	call z80_stl_X
	defb $0B
	call z80_lda_X
	defb $16
	rst 20h	; = call z80_sta_X
	defb $19
	rst 30h	; = call z80_setX
	defb $10
	defb 1<<(1)
	CALL LB5E0
	call z80_bitX_13
	and 1<<(0)
	ld a,(il_a)
	RET Z
	call z80_bitX_13
	and 1<<(7)
	ld a,(il_a)
	RET NZ
	CALL LB470
	CALL LB837
	RET
LBD4E:
	call z80_dec_X
	defb $19
	RET NZ
	call z80_srl_X
	defb $0E
	call z80_lda_X
	defb $0A
	rst 20h	; = call z80_sta_X
	defb $0C
	call z80_lda_X
	defb $09
	rst 20h	; = call z80_sta_X
	defb $0B
	call z80_resX	; clear "moving" bit
	defb $10
	defb (~(1<<(0)))&255
	call z80_resX
	defb $10
	defb (~(1<<(1)))&255
	call z80_lda_X
	defb $18
	call z80_bitX
	defb $10
	and 1<<(6)
	ld a,(il_a)
	jp NZ,LBD7B
	rst 20h	; = call z80_sta_X
	defb $11
	call z80_resX
	defb $0D
	defb (~(1<<(2)))&255
	RET
LBD7B:
	rst 20h	; = call z80_sta_X
	defb $12
	rst 30h	; = call z80_setX
	defb $0D
	defb 1<<(2)
	RET

; I: L = ??
; I: C = ??; $0F $1F $3F
; I: IX = record address in LC4F0 area
LBD83	LD A,L
	AND C
	ADD A,C
	rst 20h	; = call z80_sta_X
	defb $0E
	LD HL,LBDA9
	INC (HL)
	LD A,$1F
	AND (HL)
	INC A
	rst 20h	; = call z80_sta_X
	defb $0F
	PUSH DE
	CALL NextRandom		; Calculate next random value
	LD A,H
	AND $07			; 0..7
LBD9B	LD HL,LBDAA		; !!MUT-ARG!! LBDAA or LBDB2
	ADD A,L
	LD L,A
	jp NC,LBDA3
	INC H
LBDA3	LD A,(HL)
	rst 20h	; = call z80_sta_X
	defb $04
	POP DE
	RET

LBDA9	DEFB $00
LBDAA	DEFB $41,$44,$05,$45,$02,$42,$43,$40
LBDB2	DEFB $05,$45,$02,$42,$43,$03,$40,$41

LBDBA	CALL LBEC7
	LD A,(L5B03+1)		; get screen position (row) on mini-map
	CP $03			; < 3 ?
	jp NC,LBDCB
	CALL LBEB2		; ??? process 21-byte records: Boat, meduzas, round fishes
	CALL LBE58
	RET
LBDCB	CP $04
	jp NC,LBDD6
	CALL LBE58
	CALL LBE85
	RET
LBDD6	CP $06
	jp NC,LBDDE
	CALL LBE85
	RET
LBDDE	CP $09
	jp NC,LBDE5
	CALL LBE85
LBDE5	CALL LC45C
	RET

LBDE9	DEFS $01

LBDEA	LD A,(L5B03+1)		; get screen position (row) on mini-map
	CP $03			; row 0..3 ?
	jp NC,LBDFE	; no => jump
	CALL LBE9A		; ??? process 21-byte records: Boat, meduzas, round fishes
	CALL LBE40		; ??? process 26-byte records
	LD A,(L5B1A)		; 2
	CALL LC4D5		; Delay
	RET
LBDFE	CP $04			; row 4 ?
	jp NC,LBE0F	; no => jump
	CALL LBE40		; ??? process 26-byte records
	CALL LBE6D
	LD A,(L5B1B)		; 2
	CALL LC4D5		; Delay
	RET
LBE0F	CP $06			; row 5..6 ?
	jp NC,LBE1D	; no => jump
	CALL LBE6D
	LD A,(L5B1C)		; 2
	CALL LC4D5		; Delay
	RET
LBE1D	CP $09			; row 7..9 ?
	jp NC,LBE36	; no => jump
	CALL LBE6D
	LD HL,LBDE9
	LD A,(L5B1D)		; 2
	CALL LC4D5		; Delay
	LD A,$01
	XOR (HL)
	LD (HL),A
	RET Z
	CALL LC431
	RET
LBE36	CALL LC431
	LD A,(L5B1E)		; 5
	CALL LC4D5		; Delay
	RET

; Process 26-byte records in group II
; ЭТАП 3, ручная дожимка сканов записей существ. Профиль i8080-сборки (уровень 4):
; хелпер z80_dec_X — 11.9%% тактов, самая дорогая строка всей игры. В этих циклах
; IX идёт по массиву записей постоянным шагом, а HL внутри тела МЁРТВ (CALL Z,LB737
; его всё равно рушит, значит на Z80 на него тоже нельзя было опереться) и BC
; свободен между PUSH BC / POP BC. Поэтому вместо тени с хелпером — прямой
; указатель в HL. Заодно точнее: dec (hl) хранит CY, как dec (ix+d) на Z80,
; а хелпер его портил. Цена тела: ~145 тактов против ~300.
; ЭТАП E: скан записей существ. Было 145 тактов на запись, стало 76 на обычном
; пути. Ключ: указатель на поле +0x0F держим в HL ЧЕРЕЗ ВЕСЬ ЦИКЛ (шаг записи
; постоянный, значит и это поле шагает так же), а тень z80_ix выставляем только
; на РЕДКОМ пути — когда счётчик дошёл до нуля и надо звать LB737. Раньше тень
; читалась и писалась на каждой записи, хотя нужна лишь при вызове.
; HL вызывающего не сохраняем: он и прежде затирался телом цикла, а LBDEA после
; вызова его не использует.
LBE40	LD A,(NumRecsII)	; get Number of 26-byte records: 18 / 22 / 26 / 31, depending on LEVEL
	LD B,A			; loop counter
	ld hl,(RecsAddrII)
	ld (z80_ix),hl
	ld de,000Fh		; НЕ bc: в B уже лежит счётчик записей
	add hl,de		; HL -> поле +0x0F первой записи
LBE48	PUSH BC
	dec (hl)		; было: DEC (IX+$0F)
	jp nz,LBE48_adv
	push hl
	ld bc,0FFF1h		; -15: от поля +0x0F к началу записи
	add hl,bc
	ld (z80_ix),hl		; тень нужна ТОЛЬКО здесь — LB737 читает её
	CALL LB737
	pop hl
LBE48_adv:
	ld bc,001Ah
	add hl,bc		; следующая запись, то же поле
	POP BC
	dec b
	jp nz,LBE48
	RET

; Process 26-byte records in group II
LBE58	LD A,(NumRecsII)	; get Number of 26-byte records: 18 / 22 / 26 / 31, depending on LEVEL
	LD B,A
	ld (il_hl),hl	; now IX = record address in LC4F0 area
	ld hl,(RecsAddrII)
	ld (z80_ix),hl
	ld hl,(il_hl)
LBE60	PUSH BC
	CALL LB7BB
	ld hl,(z80_ix)
	ld bc,26		; 26 - record size
	add hl,bc
	ld (z80_ix),hl
	POP BC
	dec b
	jp nz,LBE60
	RET

; Process 26-byte records in group III
LBE6D	LD A,(NumRecsIII)	; get Number of 26-byte records (26 / 34 / 42 / 50) in group III
	LD B,A
	ld hl,(RecsAddrIII)
	ld (z80_ix),hl
	ld de,000Fh		; НЕ bc: в B уже лежит счётчик записей
	add hl,de		; HL -> поле +0x0F первой записи
LBE75	PUSH BC
	dec (hl)		; было: DEC (IX+$0F)
	jp nz,LBE75_adv
	push hl
	ld bc,0FFF1h		; -15: от поля +0x0F к началу записи
	add hl,bc
	ld (z80_ix),hl		; тень нужна ТОЛЬКО здесь — LB737 читает её
	CALL LB737
	pop hl
LBE75_adv:
	ld bc,001Ah
	add hl,bc		; следующая запись, то же поле
	POP BC
	dec b
	jp nz,LBE75
	RET

; Process 26-byte records in group III
LBE85	LD A,(NumRecsIII)	; get Number of 26-byte records (26 / 34 / 42 / 50) in group III
	LD B,A
	ld (il_hl),hl
	ld hl,(RecsAddrIII)
	ld (z80_ix),hl
	ld hl,(il_hl)
LBE8D	PUSH BC
	CALL LB7BB
	ld hl,(z80_ix)
	ld bc,26		; 26 - record size
	add hl,bc
	ld (z80_ix),hl
	POP BC
	dec b
	jp nz,LBE8D
	RET

; Process 21-byte records in group I: Boat, meduzas, round fishes
LBE9A	LD A,(NumRecsI)		; get Number of 21-byte records in group I: 27 / 35 / 43 / 51, depending on LEVEL
	LD B,A			; loop count
	ld hl,LC4F0
	ld (z80_ix),hl
	ld de,000Fh		; НЕ bc: в B уже лежит счётчик записей
	add hl,de		; HL -> поле +0x0F первой записи
; ЭТАП F.1. Обход 27..51 записей группы I — самый дорогой цикл тика (замер:
; LBEA2 + LBEA2_adv = 4988 тактов на тик, 10.9% при уровне 4). Тело стоило 76
; тактов на запись: PUSH BC (11) + dec (hl) (10) + jp nz (10) + ld bc,0015h (10)
; + add hl,bc (10) + POP BC (10) + dec b (5) + jp nz (10).
; Что сделано: шаг записи переехал в DE и держится ВНЕ цикла, а спасение BC ушло
; с общего пути на редкий. Тело стало 45 тактов: dec (hl) + jp nz + add hl,de +
; dec b + jp nz. Минус 31 такт на каждую запись, которая не досчиталась до нуля.
; Почему BC можно не спасать в общем пути: единственное, что портит B, — вызов
; LB737, а он случается только на нулевом счётчике; там push/pop bc и стоят.
; Почему DE надо перезагружать после вызова: LB737 своих обязательств по DE не
; даёт, а проверять их дороже, чем 10 тактов на редком пути.
	ld de,0015h		; шаг записи держим в DE весь обход
LBEA2	dec (hl)		; было: DEC (IX+$0F)
	jp nz,LBEA2_adv
	push bc			; редкий путь: только здесь B и DE под угрозой
	push hl
	ld bc,0FFF1h		; -15: от поля +0x0F к началу записи
	add hl,bc
	ld (z80_ix),hl		; тень нужна ТОЛЬКО здесь — LB737 читает её
	CALL LB737
	pop hl
	pop bc
	ld de,0015h		; LB737 мог затереть DE
LBEA2_adv:
	add hl,de		; следующая запись, то же поле
	dec b
	jp nz,LBEA2
	RET

; Process 21-byte records in group I: Boat, meduzas, round fishes
LBEB2	LD A,(NumRecsI)		; get Number of 21-byte records in group I: 27 / 35 / 43 / 51, depending on LEVEL
	LD B,A			; loop count
	ld (il_hl),hl	; record address
	ld hl,LC4F0
	ld (z80_ix),hl
	ld hl,(il_hl)
LBEBA	PUSH BC
	CALL LB7BB
	ld hl,(z80_ix)
	ld bc,$0015		; 21 bytes - record size
	add hl,bc
	ld (z80_ix),hl
	POP BC
	dec b
	jp nz,LBEBA
	RET

LBEC7	LD HL,LB676
	LD (HL),$80
	INC HL
	LD B,$0F		; repeat 15 times
	XOR A
LBED0	LD (HL),A
	INC HL
	dec b
	jp nz,LBED0
; БРОНЬ ТРЁХ ВЕРХНИХ СТРАНИЦ ПУЛА под данные колеса таймеров ($BD00..$BFFF).
; Распределитель ищет первую запись с НУЛЕВЫМ битом 7 (LB646: and 1<<7 / jp z),
; освобождение бит 7 сбрасывает. Значит выставленный бит 7 — это «занято
; навсегда», и распределитель эти страницы не выдаст никогда.
; ПОЧЕМУ ЭТО БЕЗОПАСНО, замер по таблице LB676 на спектре сцен:
;   уровень 4 глубина (строки 3 и 9), 3001 тик .... пик 6 из 16
;   уровень 1 поверхность, 4003 тика ............. пик 7
;   уровень 4 поверхность, 4000 тиков ............ пик 9
;   уровень 1, 12003 тика, ЧЕТЫРЕ гибели ......... пик 9
; Пик 9, брони 3 — остаётся 13 рабочих страниц, то есть ЧЕТЫРЕ свободных сверх
; наблюдаемого пика. Отдельно отмечено: глубина для пула ЛЕГЧЕ поверхности
; (постоянные 6 против гуляющих 4..9), то есть худшая сцена по тактам и худшая по
; памяти — разные сцены.
	LD HL,LB676+13
	LD B,3
	LD A,$80
LBED0_resv:
	LD (HL),A
	INC HL
	dec b
	jp nz,LBED0_resv
	LD HL,POOL_HI*256	; стейджинг = страница индекса 0 (см. LB7B9)
	LD (LB7B9),HL
	RET

LBEDB	CALL LBEC7
	LD HL,LBDAA
	LD (LBD9B+1),HL		; set table address
	LD HL,LC20A		; record template for Boat
	LD DE,LC4F0		; record address
	LD BC,21		; 21 bytes
	ld (il_a),a	; Copy 21 bytes from LC20A to LC4F0
i80_ldir_4:
	ld a,(hl)
	ld (de),a
	inc hl
	inc de
	dec bc
	ld a,b
	or c
	jp nz,i80_ldir_4
	ld a,(il_a)
	LD A,(L5B13)		; get Number of Meduza objects
	LD B,A			; loop counter
LBEF3	PUSH BC
	LD HL,LC21F		; record template for Meduza
	PUSH DE
	ld (il_hl),hl
	pop hl
	ld (z80_ix),hl
	ld hl,(il_hl)
	LD BC,$0015		; 21 bytes - record size
	ld (il_a),a	; Copy 21 bytes
i80_ldir_5:
	ld a,(hl)
	ld (de),a
	inc hl
	inc de
	dec bc
	ld a,b
	or c
	jp nz,i80_ldir_5
	ld a,(il_a)
	PUSH DE
	CALL NextRandom		; Calculate next random value
	POP DE
	call z80_sth_X	; set column 0..255
	defb $00
	LD C,$3F
	CALL LBD83
	POP BC
	dec b
	jp nz,LBEF3
	LD A,(L5B14)		; get Number of Round fishes
	LD B,A			; loop counter
	LD C,$00
	LD A,(RANDOM)		; get current Random lo byte
	ld (il_a),a
	and 1<<(5)
	ld a,(il_a)
	jp Z,LBF1D
	INC C
LBF1D	PUSH BC
	LD HL,LC234		; record template for Round fish
	PUSH DE
	ld (il_hl),hl
	pop hl
	ld (z80_ix),hl
	ld hl,(il_hl)
	LD BC,$0015		; 21 bytes - record size
	ld (il_a),a	; Copy template to record
i80_ldir_6:
	ld a,(hl)
	ld (de),a
	inc hl
	inc de
	dec bc
	ld a,b
	or c
	jp nz,i80_ldir_6
	ld a,(il_a)
	PUSH DE
	CALL NextRandom		; Calculate next random value
	POP DE
	call z80_sth_X
	defb $00
	LD A,L
	AND $03			; 0..3
	call z80_add_X
	defb $01
	rst 20h	; = call z80_sta_X
	defb $01
	LD A,L
	and a
	rra
	and a
	rra
	AND $07			; 0..7
	jp NZ,LBF44
	INC A
LBF44:
	rst 20h	; = call z80_sta_X
	defb $03
	LD C,$1F
	CALL LBD83
	POP BC
	ld (il_a),a
	ld a,C
	and 1<<(0)
	ld a,(il_a)
	jp Z,LBF5D
	rst 28h	; = call z80_stn_X
	defb $09
	defb $85
	rst 28h	; = call z80_stn_X
	defb $0B
	defb $85
	rst 28h	; = call z80_stn_X
	defb $11
	defb $FE
LBF5D:
	dec b
	jp nz,LBF1D
	ld (il_a),a	; save address for 26-byte records
	ld a,e
	ld (RecsAddrII),a
	ld a,d
	ld (RecsAddrII+1),a
	ld a,(il_a)
	LD A,(NumRecsII)	; get number of 26-byte records in group II
	LD HL,$0F1B
	ld (il_hl),hl	; table address with record templates, horizontal movement
	ld hl,LC2EB
	ld (z80_iy),hl
	ld hl,(il_hl)
	CALL LBFB0
	ld (il_a),a	; save address for 26-byte records
	ld a,e
	ld (RecsAddrIII),a
	ld a,d
	ld (RecsAddrIII+1),a
	ld a,(il_a)
	LD A,(NumRecsIII)	; get number of 26-byte records in group III
	LD HL,$2A3B
	ld (il_hl),hl	; table address with record templates, horizontal movement
	ld hl,LC331
	ld (z80_iy),hl
	ld hl,(il_hl)
	CALL LBFB0
	ld (il_a),a	; save address for 26-byte records
	ld a,e
	ld (RecsAddrIV),a
	ld a,d
	ld (RecsAddrIV+1),a
	ld a,(il_a)
	ld (il_hl),hl
	ld hl,LBFA0
	ld (z80_iy),hl
	ld hl,(il_hl)
	LD A,(NumRecsIV)	; get number of 26-byte records in group IV
	LD HL,LBDB2
	LD (LBD9B+1),HL		; set table address
	CALL LC009
	ld (il_hl),hl
	ld hl,LBFA8
	ld (z80_iy),hl
	ld hl,(il_hl)
	LD A,(NumRecsV)		; get number of 28-byte records in group V
	CALL LC009
LBF9F	RET

LBFA0	DEFB $05,$00
	DEFW LC3AD		; table of 4 vertical record templates (group IV)
	DEFB $1A,$00,$00,$0F
LBFA8	DEFB $10,$11
	DEFW LC429		; table of 4 horizontal record templates (group V)
	DEFB $1C,$00,$00,$0F

; I: IX = ???
; I: IY = address of table with 8 record template addresses: LC2EB or LC331
; I: HL = ???; $0F1B or $2A3B
; I: A = number of records, loop counter
; O: DE = address ??
LBFB0:
	ld (il_hl),hl
	ld hl,(z80_iy)
	ld (LBFC3+1),hl
	ld hl,(il_hl)
	LD (LC007),HL
	LD B,A
LBFB8	PUSH BC
	PUSH DE
	CALL NextRandom		; Calculate next random value
	LD A,H
	AND $0E			; 0 / 2 / 4 / 6 / 8 / 10 / 12 / 14
	LD E,A
	LD D,$00
LBFC3	LD HL,$0000		; !!MUT-ARG!! table address with 8 record template addresses
	ADD HL,DE
	LD C,(HL)
	INC HL
	LD B,(HL)		; now BC = record template address
	LD L,C
	LD H,B			; HL = record template address
	LD BC,26		; 26 bytes - record size
	POP DE
	PUSH DE
	ld (il_hl),hl
	pop hl
	ld (z80_ix),hl
	ld hl,(il_hl)
	ld (il_a),a	; copy template to record
i80_ldir_7:
	ld a,(hl)
	ld (de),a
	inc hl
	inc de
	dec bc
	ld a,b
	or c
	jp nz,i80_ldir_7
	ld a,(il_a)
	LD HL,(LC007)		; restore saved HL
	call z80_sth_X
	defb $16
	call z80_stl_X
	defb $15
	LD A,(RANDOM)		; get current Random lo byte
	AND $7F			; 0..127
	ADD A,$40		; 64..191
	rst 20h	; = call z80_sta_X
	defb $00
	LD A,(RANDOM+1)		; get current Random hi byte
	and a
	rra
	and a
	rra
	and a
	rra
	AND $0F			; 0..15
	LD H,A
	LD A,L
	SUB H
	rst 20h	; = call z80_sta_X
	defb $01
	PUSH DE
	CALL NextRandom		; Calculate next random value
	POP DE
	LD C,$0F
	CALL LBD83
	POP BC
	dec b
	jp nz,LBFB8
	RET

LC007	DEFW $0000		; temp storage for HL

; I: IY ???; LBFA0 or LBFA8
; I: A = number of records
LC009	LD B,A
	call z80_ste_Y
	defb $05
	call z80_std_Y
	defb $06
	LD DE,$F8F8
	LD HL,MiniMap+$3FF
LC016	LD A,(HL)
	call z80_cp_Y
	defb $00
	jp Z,LC039
	call z80_cp_Y
	defb $01
	jp Z,LC039
LC021	DEC HL
	LD A,E
	SUB $08
	LD E,A
	CP $F8
	jp NZ,LC037
	LD A,D
	SUB $08
	LD D,A
	CP $38
	jp NZ,LC037
	LD D,$F8
	LD HL,MiniMap+$3FF
LC037:
	jp LC016
LC039	PUSH BC
	PUSH HL
	PUSH DE
	CALL NextRandom		; Calculate next random value
	call z80_ldd_Y
	defb $03
	call z80_lde_Y
	defb $02
	LD A,L
	AND $F0
	jp Z,LC04F
	POP DE
	POP HL
	POP BC
	jp LC021
LC04F	LD A,H
	AND $06			; 0 / 2 / 4 / 6
	LD L,A
	LD H,$00
	ADD HL,DE
	LD E,(HL)
	INC HL
	LD D,(HL)
	EX DE,HL
	call z80_ldc_Y
	defb $04
	LD B,$00
	call z80_lde_Y
	defb $05
	call z80_ldd_Y
	defb $06
	PUSH DE
	ld (il_hl),hl
	pop hl
	ld (z80_ix),hl
	ld hl,(il_hl)
	ld (il_a),a
i80_ldir_8:
	ld a,(hl)
	ld (de),a
	inc hl
	inc de
	dec bc
	ld a,b
	or c
	jp nz,i80_ldir_8
	ld a,(il_a)
	call z80_ste_Y
	defb $05
	call z80_std_Y
	defb $06
	POP DE
	LD A,D
	ADD A,$03
	rst 20h	; = call z80_sta_X
	defb $01
	LD A,E
	ADD A,$04
	rst 20h	; = call z80_sta_X
	defb $00
	LD A,(RANDOM+1)		; get current Random hi byte
	LD L,A
	call z80_ldc_Y
	defb $07
	CALL LBD83
	POP HL
	POP BC
	dec b
	jp nz,LC021
	call z80_lde_Y
	defb $05
	call z80_ldd_Y
	defb $06
	RET

; Object records
;	(IY+$00)(IY+$01) - ??
;	(IY+$02) - ?? colummn
;	(IY+$03) - ?? row
;	(IY+$06) - sprite char width
;	(IY+$07) - ??
;	(IY+$08) - sprite char height
;	(IY+$09) - ??
;	(IY+$0A) - ??
;	(IY+$0C)(IY+$0D) - ??
;	(IY+$0E)
;	(IY+$0F)
;	(IY+$12)(IY+$13) - sprite address
;	      1  0  3  2  5  4  7  6  9  8  B  A  D  C  F  E
LC092	DEFW $0000,$0000,$0000,$0807,$0403,$1840,$C080,$0000	; Boat
LC0A2	DEFW $0000,$0000,$0000,$0201,$0302,$1010,$2030,$0000	; Meduza
LC0B2	DEFW $0000,$0000,LC0CE,$0302,$0201,$0818,$1803,$0000
	DEFW L8285,L8254,L82B6,L82E6,L82C6,L82F6		; Round fish
LC0CE	DEFW $0000,$0000,LC0B2,$0201,$0302,$1010,$2003,$0000
	DEFW L8347,L8316,L8378,L83A8,L8388,L83B8		; Round fish vertical
LC0EA	DEFW $0000,$0000,$0000,$0706,$0302,$1038,$7005,$0000
	DEFW L64E5,L6364,L6666,L6846				; Fish
LC102	DEFW $0000,$0000,$0000,$0807,$0403,$1840,$C006,$0000
	DEFW L70B7,L6A26,L6CC7,L7358				; Shark
LC11A	DEFW $0000,$0000,$0000,$0504,$0201,$0828,$2804,$0000
	DEFW L7BCE,L7C4F,L7D50,L7CD0				; Long fish
LC132	DEFW $0000,$0000,$0000,$0403,$0403,$1820,$6001,$0000
	DEFW L7748,L7869,L7942,L7821				; Fish cloud
LC14A	DEFW $0000,$0000,LC166,$0403,$0201,$0820,$2005,$0000
	DEFW L60D9,L6000,L6061,L613A,L6091,L616A		; Small squid horizontal
LC166	DEFW $0000,$0000,LC14A,$0201,$0403,$1810,$3005,$0000
	DEFW L628B,L61B2,L6213,L62EC,L6243,L631C		; Small squid vertical
LC182	DEFW $0000,$0000,LC19E,$0403,$0201,$0820,$2003,$0000
	DEFW L7A1B,L798A,L79D3,L7A64,L79EB,L7A7C		; Electric eel horizontal
LC19E	DEFW $0000,$0000,LC182,$0201,$0403,$1810,$3003,$0000
	DEFW L7AF5,L7AAC,L7B3E,L7B86,L7B56,L7B9E		; Electric eel vertical
LC1BA	DEFW $0000,$0000,LC1D6,$0504,$0201,$0828,$2805,$0000
	DEFW L7EF1,L7DD0,L7E51,L7F72,L7E91,L7FB2		; Snake fish horizontal
LC1D6	DEFW $0000,$0000,LC1BA,$0201,$0504,$2010,$4005,$0000
	DEFW L8133,L8012,L8093,L81B4,L80D3,L81F4		; Snake fish vertical
LC1F2	DEFW $0000,$0000,$0000,$0807,$0302,$1040,$8006,$0000
	DEFW L8839,L83D8,L8599,L89FA				; Squid

; Record templates
; These templates are used to create records in LC4F0 area.
;
; Record template for 21-byte record - Boat
LC20A	DEFB $F8,$06,$04,$01,$05
	DEFW LC481		; moving procedure
	DEFW $0000
	DEFW SprBoat,SprBoat	; sprite address
	DEFB $18,$28,$28,$01,$00,$00
	DEFW LC092		; object record
; Record template for 21-byte record - Meduza
LC21F	DEFB $00,$07,$04,$05,$00
	DEFW LBF9F		; moving procedure -> RET
	DEFW $0000
	DEFW L8D43,L8D43	; sprite address
	DEFB $18,$00,$00,$00,$01,$00
	DEFW LC0A2		; object record
; Record template for 21-byte record - Round fish
LC234	DEFB $00,$09,$04,$02,$00
	DEFW LBF9F		; moving procedure -> RET
	DEFW $0000
	DEFW L8254,L8254	; sprite address
	DEFB $18,$00,$00,$00,$02,$00
	DEFW LC0B2		; object record
; Record template for 26-byte record - Fish
LC249	DEFB $00,$00,$04,$02,$00
	DEFW LB885		; moving procedure
	DEFW $0000
	DEFW L6364,L6364	; sprite address
	DEFB $18,$00,$00,$00,$02,$00
	DEFW LC0EA		; object record
	DEFB $00,$00,$02,$00,$00,$00
; Record template for 26-byte record - Shark
LC264	DEFB $00,$00,$04,$02,$00
	DEFW LB885		; moving procedure
	DEFW $0000
	DEFW L6A26,L6A26	; sprite address
	DEFB $18,$00,$00,$00,$02,$00
	DEFW LC102		; object record
	DEFB $00,$00,$02,$00,$00,$00
; Record template for 26-byte record - Small squid horizontal
LC27F	DEFB $00,$00,$04,$02,$00
	DEFW LB885		; moving procedure
	DEFW $0000
	DEFW L6000,L6000	; sprite address
	DEFB $18,$00,$00,$00,$02,$00
	DEFW LC14A		; object record
	DEFB $00,$00,$02,$00,$00,$00
; Record template for 26-byte record - Long fish
LC29A	DEFB $00,$00,$04,$02,$00
	DEFW LB885		; moving procedure
	DEFW $0000
	DEFW L7C4F,L7C4F	; sprite address
	DEFB $18,$00,$00,$00,$02,$00
	DEFW LC11A		; object record
	DEFB $00,$00,$02,$00,$00,$00
; Record template for 26-byte record - Fish cloud
LC2B5	DEFB $00,$00,$04,$02,$00
	DEFW LB885		; moving procedure
	DEFW $0000
	DEFW L7869,L7869	; sprite address
	DEFB $18,$00,$00,$00,$02,$00
	DEFW LC132		; object record
	DEFB $00,$00,$02,$00,$00,$00
; Record template for 26-byte record - Electric eel horizontal
LC2D0	DEFB $00,$00,$04,$02,$00
	DEFW LB885		; moving procedure
	DEFW $0000
	DEFW L798A,L798A	; sprite address
	DEFB $18,$00,$00,$00,$02,$00
	DEFW LC182		; object record
	DEFB $00,$00,$02,$00,$00,$00
; Table of 8 record templates for fish objects, horizontal movement
LC2EB	DEFW LC249		; Fish
	DEFW LC264		; Shark
	DEFW LC27F		; Small squid horizontal
	DEFW LC29A		; Long fish
	DEFW LC2B5		; Fish cloud
	DEFW LC2D0		; Electric eel horizontal
	DEFW LC29A		; Long fish
	DEFW LC249		; Fish
;
; Record template for 26-byte record - Snake fish horizontal
LC2FB	DEFB $00,$00,$04,$02,$00
	DEFW LB885		; moving procedure
	DEFW $0000
	DEFW L7DD0,L7DD0	; sprite address
	DEFB $18,$00,$00,$00,$02,$00
	DEFW LC1BA		; object record
	DEFB $00,$00,$02,$00,$00,$00
; Record template for 26-byte record - Squid
LC316	DEFB $00,$00,$04,$02,$00
	DEFW LB885		; moving procedure
	DEFW $0000
	DEFW L83D8,L83D8	; sprite address
	DEFB $18,$00,$00,$00,$02,$00
	DEFW LC1F2		; object record
	DEFB $00,$00,$02,$00,$00,$00
; Table of 8 record templates for fish objects, horizontal movement
LC331	DEFW LC249		; Fish
	DEFW LC264		; Shark
	DEFW LC27F		; Small squid horizontal
	DEFW LC29A		; Long fish
	DEFW LC2B5		; Fish cloud
	DEFW LC2D0		; Electric eel horizontal
	DEFW LC2FB		; Snake fish horizontal
	DEFW LC316		; Squid
;
; Record template for 26-byte record - Round fish vertical
LC341	DEFB $00,$00,$02,$04,$00
	DEFW LB972		; moving procedure
	DEFW $0000
	DEFW L8347,L8347	; sprite address
	DEFB $1C,$00,$00,$00,$00,$02
	DEFW LC0CE		; object record
	DEFB $00,$00,$02,$00,$00,$00
; Record template for 26-byte record - Small squid vertical
LC35C	DEFB $00,$00,$02,$04,$00
	DEFW LB972		; moving procedure
	DEFW $0000
	DEFW L628B,L628B	; sprite address
	DEFB $1C,$00,$00,$00,$00,$02
	DEFW LC166		; object record
	DEFB $00,$00,$02,$00,$00,$00
; Record template for 26-byte record - Snake fish vertical
LC377	DEFB $00,$00,$02,$04,$00
	DEFW LB972		; moving procedure
	DEFW $0000
	DEFW L8133,L8133	; sprite address
	DEFB $1C,$00,$00,$00,$00,$02
	DEFW LC1D6		; object record
	DEFB $00,$00,$02,$00,$00,$00
; Record template for 26-byte record - Electric eel vertical
LC392	DEFB $00,$00,$02,$04,$00
	DEFW LB972		; moving procedure
	DEFW $0000
	DEFW L7AF5,L7AF5	; sprite address
	DEFB $1C,$00,$00,$00,$00,$02
	DEFW LC19E		; object record
	DEFB $00,$00,$02,$00,$00,$00
; Table of 4 record templates for fish objects, vertical movement
LC3AD	DEFW LC341		; Round fish vertical
	DEFW LC35C		; Small squid vertical
	DEFW LC377		; Snake fish vertical
	DEFW LC392		; Electric eel vertical
;
; Record template for 28-byte record - Round fish
LC3B5	DEFB $00,$00,$04,$02,$00
	DEFW LBA64		; moving procedure
	DEFW $0000
	DEFW L8254,L8254	; sprite address
	DEFB $18,$00,$00,$00,$02,$00
	DEFW LC0B2		; object record
	DEFB $03,$01,$02,$00,$00,$00,$00,$00
; Record template for 28-byte record - Small squid horizontal
LC3D2	DEFB $00,$00,$04,$02,$00
	DEFW LBA64		; moving procedure
	DEFW $0000
	DEFW L6000,L6000	; sprite address
	DEFB $18,$00,$00,$00,$02,$00
	DEFW LC14A		; object record
	DEFB $04,$02,$02,$00,$00,$00,$00,$00
; Record template for 28-byte record - Electric eel horizontal
LC3EF	DEFB $00,$00,$04,$02,$00
	DEFW LBA64		; moving procedure
	DEFW $0000
	DEFW L798A,L798A	; sprite address
	DEFB $18,$00,$00,$00,$02,$00
	DEFW LC182		; object record
	DEFB $03,$01,$02,$00,$00,$00,$00,$00
; Record template for 28-byte record - Snake fish horizontal
LC40C	DEFB $00,$00,$04,$02,$00
	DEFW LBA64		; moving procedure
	DEFW $0000
	DEFW L7DD0,L7DD0	; sprite address
	DEFB $18,$00,$00,$00,$02,$00
	DEFW LC1BA		; object record
	DEFB $04,$02,$02,$00,$00,$00,$00,$00
; Table of 4 record templates
LC429	DEFW LC3B5		; Round fish
	DEFW LC3D2		; Small squid horizontal
	DEFW LC3EF		; Electric eel horizontal
	DEFW LC40C		; Snake fish horizontal

; ЭТАП F.2. Обходчики групп IV и V — самое дорогое место ГЛУБОКОЙ воды, где
; игрок и проводит основное время. Тело стоило 145 тактов i8080 на запись против
; 76 у LBE48/LBEA2: тень z80_ix перечитывалась из памяти ДВАЖДЫ за запись
; (LHLD 16 тактов каждый) и записывалась обратно (SHLD 16), плюс константа шага
; грузилась в BC внутри цикла, плюс PUSH/POP BC на общем пути.
; Схема перенесена дословно с LBEA2 (этап F.1): указатель на поле +0x0F держится
; в HL сквозь весь обход, шаг записи — в DE, тень z80_ix выставляется ТОЛЬКО на
; редком пути (счётчик досчитал до нуля и надо звать LB737, который тень читает).
; Тело стало 45 тактов: dec (hl) + jp nz + add hl,de + dec b + jp nz.
; Минус 100 тактов i8080 на каждую запись, а записей в этих двух группах на
; уровне 4 — 77 штук за тик.
; ПОЧЕМУ ГРУППА V ПРОДОЛЖАЕТ ТЕМ ЖЕ УКАЗАТЕЛЕМ: так было и в оригинале — цикл V
; не перезагружал базу, а шёл дальше по тени, оставшейся от последней записи IV.
; Записи групп лежат подряд, поэтому HL после цикла IV уже указывает на поле
; +0x0F первой записи V.
; ЧТО ВОССТАНАВЛИВАЕТСЯ НА ВЫХОДЕ: прежний код оставлял в тени z80_ix адрес
; «за последней записью V». Раз тень теперь пишется не каждый шаг, это значение
; выставляется явно перед RET — иначе вызывающий увидел бы протухшую тень.
LC431	LD A,(NumRecsIV)	; get Number of 26-byte records (5 / 10 / 15 / 20) in group IV
	LD B,A			; loop counter
	ld hl,(RecsAddrIV)
	ld (z80_ix),hl		; тень на первую запись: LB737 читает её
	ld de,000Fh
	add hl,de		; HL -> поле +0x0F первой записи
	ld de,26		; шаг записи группы IV
LC439	dec (hl)		; было: DEC (IX+$0F)
	jp nz,LC439_adv
	push bc			; редкий путь: только здесь B и DE под угрозой
	push hl
	ld bc,0FFF1h		; -15: от поля +0x0F к началу записи
	add hl,bc
	ld (z80_ix),hl
	CALL LB737
	pop hl
	pop bc
	ld de,26		; LB737 своих обязательств по DE не даёт
LC439_adv:
	add hl,de
	dec b
	jp nz,LC439
	LD A,(NumRecsV)		; get Number of 28-byte records (12 / 27 / 42 / 57) in group V
	LD B,A			; loop counter
	ld de,$001C		; шаг записи группы V; HL уже на поле +0x0F первой записи V
LC44C	dec (hl)		; было: DEC (IX+$0F)
	jp nz,LC44C_adv
	push bc
	push hl
	ld bc,0FFF1h
	add hl,bc
	ld (z80_ix),hl
	CALL LB737
	pop hl
	pop bc
	ld de,$001C
LC44C_adv:
	add hl,de
	dec b
	jp nz,LC44C
	ld bc,0FFF1h		; тень на выход: адрес за последней записью группы V
	add hl,bc
	ld (z80_ix),hl
	RET

LC45C	LD A,(NumRecsIV)	; get number of 26-byte records (5 / 10 / 15 / 20) in group IV
	LD B,A
	ld (il_hl),hl
	ld hl,(RecsAddrIV)
	ld (z80_ix),hl
	ld hl,(il_hl)
LC464	PUSH BC
	CALL LB7BB
	ld hl,(z80_ix)
	ld bc,26
	add hl,bc
	ld (z80_ix),hl
	POP BC
	dec b
	jp nz,LC464
	LD A,(NumRecsV)		; get number of 28-byte records (12 / 27 / 42 / 57) in group V
	LD B,A
LC474	PUSH BC
	CALL LB7BB
	ld hl,(z80_ix)
	ld bc,$001C
	add hl,bc
	ld (z80_ix),hl
	POP BC
	dec b
	jp nz,LC474
	RET

; Moving procedure for Boat object
; I: IX = record address in LC4F0 area
LC481:
	ld a,(LC4F0+$10)
	OR A
	jp NZ,LC490
	call z80_dec_Y
	defb $0C
	RET NZ
	rst 28h	; = call z80_stn_X
	defb $10
	defb $03
	RET
LC490	DEC A
	jp NZ,LC4A4
	ld (il_hl),hl
	ld hl,LC092+$0C
	dec (hl)
	ld hl,(il_hl)
	RET NZ
	rst 28h	; = call z80_stn_X
	defb $0E
	defb $28
	rst 28h	; = call z80_stn_X
	defb $10
	defb $02
	rst 28h	; = call z80_stn_X
	defb $11
	defb $FF
	RET
LC4A4	DEC A
	jp NZ,LC4BA
	call z80_dec_X
	defb $0E
	call z80_lda_X
	defb $0E
	CP $08
	RET NZ
	rst 28h	; = call z80_stn_X
	defb $10
	defb $00
	call z80_ldar
	call z80_sta_Y
	defb $0C
	RET
LC4BA:
	call z80_inc_X
	defb $0E
	call z80_lda_X
	defb $0E
	CP $28
	RET NZ
	rst 28h	; = call z80_stn_X
	defb $0E
	defb $64
	rst 28h	; = call z80_stn_X
	defb $11
	defb $00
	rst 28h	; = call z80_stn_X
	defb $10
	defb $01
	call z80_ldar
	call z80_sta_Y
	defb $0C
	RET

; Delay ??
; I: A = ?? 2 or 5
LC4D5	OR A
	RET Z
; ЭТАП B: вместо балласта — КАРКАС ТЕМПА.
; Было: LC4D7 жёг такты петлёй LDIR из $B000 в $B000 (копия сама в себя, 300
; итераций на тик — 37% такта у Z80-порта, замер этапа 0). Стало: синхронизация
; по кадру с параметром темпа.
;
; ЦЕЛЬ 3.5 тика на кадр = 175 тиков/с при 50 Гц. Это середина замеренного
; диапазона ZX-оригинала (156-190 тиков/с, tools/verify/zx) и ровно темп порта
; Зимина (3.48 тика/кадр). Задаётся дробью TEMPO_DEN/TEMPO_NUM = 2/7.
;
; ИЗЯЩНОЕ ВЫРОЖДЕНИЕ. Ждём не «следующего прерывания», а «пока НОМЕР КАДРА не
; изменится». Если тик уже занял больше кадра, номер сменился сам — ожидания нет
; вовсе, долг не копится, темп просто просаживается до фактического. Это и есть
; поведение оригинала на тяжёлой сцене.
;
; ПОБОЧНЫЕ ЭФФЕКТЫ СТАРОЙ ЗАДЕРЖКИ ВОСПРОИЗВОДЯТСЯ ТОЧНО, и это не педантизм:
; LBE1D делает LD HL,LBDE9 / CALL LC4D5 / XOR (HL) — а прежний LDIR к этому
; моменту уже затирал HL значением $B000+DelayVal, и игра работает НА ЭТОМ.
; Выход: A=0, BC=0, DE=HL=$B000+DelayVal.
TEMPO_NUM	EQU 7		; знаменатель: 7/2 = 3.5 тика на кадр
TEMPO_DEN	EQU 2
LC4D7:
	call pace_tick
; восстановить то, что оставляла прежняя задержка
	ld hl,(DelayVal)
	ld de,0B000h
	add hl,de
	ld d,h
	ld e,l			; DE = $B000+DelayVal
	ld bc,0
	xor a			; A = 0, как после DEC A / JR NZ
	ret

; Один шаг каркаса темпа. Портит A, флаги, HL. Вызывается раз за игровой тик.
pace_tick:
	ld a,(pace_acc)
	add a,TEMPO_DEN
	cp TEMPO_NUM
	jp c,pace_keep
	sub TEMPO_NUM
	ld (pace_acc),a
; пора ждать смены кадра — но только если она ещё не наступила сама
	ld hl,pace_frame
	ld a,(FRAMES)
	cp (hl)
	jp nz,pace_new		; кадр уже сменился: тик не уложился, не ждём вовсе
	ld b,0			; страховка от зависания, если прерывания вдруг закрыты
pace_wait:
	ei
	ld a,(FRAMES)
	cp (hl)
	jp nz,pace_new
	dec b
	jp nz,pace_wait
	ld a,(FRAMES)
pace_new:
	ld (hl),a
	ret
pace_keep:
	ld (pace_acc),a
	ret

pace_acc:	defb 0		; аккумулятор дроби темпа
pace_frame:	defb 0		; номер кадра, на котором ждали в прошлый раз

LC4E7	DEFB $FB,$02,$00,$2C,$42,$4C,$46,$49
	DEFB $4C

; Object record groups:
;  I.   21-byte records at LC4F0, count in NumRecsI: Boat, meduzas, round fishes
;  II.  26-byte records at (RecsAddrII), count in NumRecsII
;  III. 26-byte records at (RecsAddrIII), count in NumRecsIII
;  IV.  26-byte records at (RecsAddrIV), count in NumRecsIV
;  V.   28-byte records, count in NumRecsV
; Record format:
; word	(IX+$00),(IX+$01) - column, row 0..255
; byte	(IX+$02) - ?? 0..7
; byte	(IX+$03) - ?? 0..7
;	(IX+$04)
;	(IX+$05),(IX+$06) - address of moving procedure
;	(IX+$07),(IX+$08) - address of buffer in $F000 area
; word	(IX+$09),(IX+$0A) - sprite address
; word	(IX+$0B),(IX+$0C) - sprite address
;	(IX+$0D) - bits 0,1
;	(IX+$0E)
;	(IX+$0F)
;	(IX+$11)
;	(IX+$12)
; word	(IX+$13),(IX+$14) - record address in block LC092
LC4F0	DEFB $2B,$31
	DEFB $30,$32,$33,$0D,$DC,$3C
	DEFB $47,$43,$32,$20,$4A,$52,$20,$47

	DEFS $1490

;----------------------------------------------------------------------------
