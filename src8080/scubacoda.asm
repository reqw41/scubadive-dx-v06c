
;----------------------------------------------------------------------------
; ПЕРЕМЕННЫЕ ИГРЫ. Имена вида L5Bxx (и L1Cxx в scubacod1.asm) — это АДРЕСА тех же
; ячеек в ZX-образе, историческая справка от дизассемблера: в нашей раскладке
; блок стоит совсем в другом месте, ассемблер расставляет его сам. Пометка ???
; означает «назначение не разобрано» — так и досталось от автора порта, и
; выяснить его можно только чтением тех, кто ячейку пишет и читает.
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
LEVEL	DEFB $01	; Game level selected: 1..4
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
	IFDEF MENUHUD
SCORE	DEFW $0000	; Score value: меню под HUD показывает SCORE до первой игры — нули,
			; а не наследственные $03E8 из ZX-образа (в игре всё равно сбрасывается)
	ELSE
SCORE	DEFW $03E8	; Score value
	ENDIF
L5B46	DEFW $0000	; ??? $0000 at game start
L5B48	DEFW $0000	; ??? $0000 at game start
L5B4A	DEFB $00	; Current screen attribute, see routine LDA39
HISCORE	DEFW $0000	; High score value

;----------------------------------------------------------------------------

; ZX-остаток таблицы клавиш (L5B4D/L5BED, 161 Б) удалён: читателей нет, а
; следом стоит ALIGN 256 перед MiniMap — вырез экономит целую страницу памяти.

;----------------------------------------------------------------------------
