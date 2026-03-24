
;----------------------------------------------------------------------------

L5B00	DEFB $00	; ??? 0..99
L5B01	DEFW $0000	; ???
L5B03	DEFW $0000	; Screen position on mini-map (H = row 0..31, L = column 0..31)
RANDOM	DEFW $0167	; Current number in pseudo-random sequence, see routine 9D84
L5B07	DEFW $0000	; ??? current trunk position while building the labyrinth
L5B09	DEFB $00	; ??? trunk width while building the labyrinth
L5B0A	DEFB $00	; ??? saved trunk width while building the labyrinth
L5B0B	DEFW $0000	; Screen position on 256x256 map (H = row, L = column)
L5B0D	DEFB $08	; Delay value: 7 / 5 / 3 / 1, depending on LEVEL
L5B0E	DEFB $08	; Delay value for Octopus: 10 / 8 / 6 / 4, depending on LEVEL
L5B0F	DEFB $00	; ??? $03
LEVEL	DEFB $04	; Game level selected: 1..4
L5B11	DEFW $0000	; ???
L5B13	DEFB $19	; Number of Meduza objects:  13 / 17 / 21 / 25, depending on LEVEL
L5B14	DEFB $1E	; Number of Round fishes:    13 / 17 / 21 / 25, depending on LEVEL
NumRecsI   DEFB $38	; Number of 21-byte records (27 / 35 / 43 / 51), group I;   starts at LC4F0
NumRecsII  DEFB $1E	; Number of 26-byte records (18 / 22 / 26 / 31), group II;  starts at (RecsAddrII)
NumRecsIII DEFB $32	; Number of 26-byte records (26 / 34 / 42 / 50), group III; starts at (RecsAddrIII)
NumRecsIV  DEFB $14	; Number of 26-byte records ( 5 / 10 / 15 / 20), group IV;  starts at (RecsAddrIV)
NumRecsV   DEFB $46	; Number of 28-byte records (12 / 27 / 42 / 57), group V
L5B1A	DEFB $02	; ???
L5B1B	DEFB $02	; ???
L5B1C	DEFB $02	; ???
L5B1D	DEFB $02	; ???
L5B1E	DEFB $05	; ???
RecsAddrII  DEFW $0000	; Address of 26-byte records in block LC4F0; NumRecsII is number of records
RecsAddrIII DEFW $0000	; Address of 26-byte records in block LC4F0; NumRecsIII is number of records
RecsAddrIV  DEFW $0000	; Address of 26-byte records in block LC4F0; NumRecsIV is number of records
DelayVal DEFW $0001	; Delay value 150 / 100 / 50 / 1, depending on LEVEL, see LC4D5
; 14 bytes copied from LDDF0 + (LEVEL - 1) * 16
L5B27	DEFW $0000
L5B29	DEFW $0000
L5B2B	DEFW $0000,$0000
L5B2F	DEFW $0000
L5B31	DEFW $0000
L5B33	DEFW $0000	; ???
;
L5B35	DEFW LDF45	; ???
LIVES	DEFB $03	; Number of lives
;	defs 12		; Ports and masks for keys - REMOVED
SCORE	DEFW $03E8	; Score value
L5B46	DEFW $0000	; ??? $0000 at game start
L5B48	DEFW $0000	; ??? $0000 at game start
L5B4A	DEFB $00	; Current screen attribute, see routine LDA39
HISCORE	DEFW $0000	; High score value

; Octopus variables
L9C50	DEFB $00	; $00 = no Octopus, $01 = we have Octopus on the game screen
L9C51	DEFW $0000	; Octopus screen address
L9C53	DEFW LA41B	; Octopus previous sprite address or LA41B for empty sprite
L9C55	DEFB $04	; Octopus phase

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

; Table of static objects on the screen
; Bytes #0,1: record address in TableStatics; bytes #2,3: column and row;
; byte #1 = $FF means end of list
TableScrStatics
	DEFB $01,$01,$01,$01
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

LDE55	DEFW $DBA4	; Depth indicator, address in screen area
LDE57	DEFW $D9A4	; Oxygen indicator, address in screen area
LDE59	DEFW $0000	; Lives indicator, address in screen attributes
OXYGEN	DEFW $FFFF	; Oxygen level, maximum is $FFFF

LDEFD	DEFB $00,$00
HELD	DEFW $0000	; HELD value
LDF01	DEFB $00,$00,$00,$00,$00,$00,$02,$03
	DEFB $02,$03,$18,$10,$00,$30
LDF0F	DEFW $0000	; LDF11
LDF11	DEFS 20

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

;----------------------------------------------------------------------------

L5B4D	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
L5BED	DEFB $00

;----------------------------------------------------------------------------
