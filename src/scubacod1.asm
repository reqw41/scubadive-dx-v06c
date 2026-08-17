	INCLUDE "scubacod0.inc"

;----------------------------------------------------------------------------
; Cheats: set to 1 to enable, 0 to disable

CHEAT_OXY	EQU 0		; Oxygen level never goes down
CHEAT_RELIEF	EQU 0		; No damage from relief and closed clam
CHEAT_SPECIES	EQU 0		; No damage from living things (fishes, sharks, etc.)

;----------------------------------------------------------------------------

	OUTPUT "scubacod1.bin"
	ORG	SCUBACOD0_END

; Start after the loader here
	LD HL,StrTitle1
	LD BC,$1601		; row/column
	;LD DE,PrintCharRt	; Procedure Print char and shift right
	CALL PrintString	; Print string
	LD HL,StrTitle2
	LD BC,$1700		; row/column
	CALL PrintString	; Print string
	LD HL,StrPressEnter
	LD BC,$140A		; row/column
	CALL PrintString	; Print string
	call WaitAnyKey

	xor A
	CALL ClearScreenFillAttr	; Clear screen with attribute A

	;ld hl,LEVEL
	;ld (hl),2
	;call START_GAME

;	LD HL,LE604		; Melody address
;	CALL PlayMelody		; Play melody
;	call LE615

	jp	Start

StrPressEnter
	ABYTE	-$20 "PRESS ENTER"
	BYTE	$FF
StrPressAny
	ABYTE	-$20 "PRESS ANY KEY"
	BYTE	$FF
StrTitle1
	ABYTE	-$20 "SPECTRUM VERSION 1983 DURRELL"
	BYTE	$FF
StrTitle2
	ABYTE	-$20 "VECTOR-06C Z80 PORT 2026 NZEEMIN"
	BYTE	$FF
StrControls
	ABYTE	-$20 "CONTROLS:"
	BYTE	$FF
StrControls1
	ABYTE	-$20 "KEYBOARD AND JOYSTICK-P"
	BYTE	$FF
StrControls2
	ABYTE	-$20 "ROTATE: LEFT AND RIGHT"
	BYTE	$FF
StrControls3
	ABYTE	-$20 "ACCELERATE:"
	BYTE	$FF
StrControls4
	ABYTE	-$20 "UP/US/SS/RUSLAT/ZB"
	BYTE	$FF
StrControls5
	ABYTE	-$20 "DECELERATE:"
	BYTE	$FF
StrControls6
	ABYTE	-$20 "DOWN/SPACE/TAB"
	BYTE	$FF
StrPrompt1
	ABYTE	-$20 "PRESS 1..4 FOR SKILL  OR"
	BYTE	$FF
StrPrompt2
	ABYTE	-$20 "ACCELERATE TO START GAME"
	BYTE	$FF
StrSkill
SkillChar = StrSkill + 16
	ABYTE	-$20 "SKILL SELECTED: 1"
	BYTE	$FF
; StrGameOver
; 	ABYTE	-$20 "GAME OVER"
; 	BYTE	$FF

;----------------------------------------------------------------------------

; Wait for any key
WaitAnyKey:
; [ИСПРАВЛЕНИЕ] Было: call ReadKeyboard. Та процедура объявлена как «I: IX = Diver
; object address», но на ТИТУЛЕ IX ещё никто не инициализировал — LD IX,DiverObj
; стоит только внутри игры. А ReadKeyboard безусловно делает LD (IX+$06),A, то
; есть на каждой итерации ожидания пишет байт по СЛУЧАЙНОМУ адресу, и читает
; LD E,(IX+$06) — от чего зависит, выйдет ли цикл вообще. В эмуляторе IX после
; сброса = 0, запись уходит в 0x0006 и незаметна; на железе IX — что осталось от
; загрузчика. Трасса: при IX=0x9000 цикл не выходит НИКОГДА и делает 13901 запись
; в 0x9006 (это середина образа игры), при IX=0x0100 — 13901 запись в 0x0106.
; Отсюда и жалоба «на клавиатуре старт иногда зависает».
; Стало: DecodeKeyboard — она и предназначена для этого (возвращает маску нажатых,
; 0 = ничего), от IX не зависит и ничего не пишет. Отдельный ei нужен потому, что
; прерывания на титуле включал именно ei внутри ReadKeyboard, а без прерываний
; KEYINT не сканирует клавиатуру и ждать становится нечего.
  ei
  call DecodeKeyboard
  or a
  jp nz,WaitAnyKey	; Wait for unpress
WaitAnyKey_1:		; Wait for key press
  call DecodeKeyboard
  or a
  ret nz		; pressed => return
; Increment the random seed
;  ld hl,Random16_seed1
;  inc (hl)		; increment lo
;  jp nc,WaitAnyKey_1
;  inc hl
;  inc (hl)		; increment hi
  jr WaitAnyKey_1	; Wait for press

; Returns: A=key code, $00 no key; Z=0 for key, Z=1 for no key
; Key codes: Left=$02, Right=$04, Accel=$08, Decel=$01 -- xxxxARLD
DecodeKeyboard:
  xor a
  ld (DecodeKeyboard_3+1),a
  ld hl,DecodeKeyboard_map  ; Point HL at the keyboard list
  ld b,4		; number of rows to check [БЫЛО 3: строка джойстика не опрашивалась]
DecodeKeyboard_0:
  ld e,(hl)		; get address low
  inc hl
  ld d,(hl)		; get address high
  inc hl
  ld a,(de)		; get bits for keys
  ld c,8		; number of keys in a row
DecodeKeyboard_1:
  rla			; shift A left; bit 0 sets carry bit
  jp c,DecodeKeyboard_2	; if the bit is 1, the key's not pressed
  ld e,a		; save A
  ld a,(DecodeKeyboard_3+1)
  or (hl)               ; set bit for the key pressed
  ld (DecodeKeyboard_3+1),a
  ld a,e		; restore A
DecodeKeyboard_2:
  inc hl		; next table address
  dec c
  jp nz,DecodeKeyboard_1	; continue the loop by bits
  dec b
  jp nz,DecodeKeyboard_0	; continue the loop by lines
DecodeKeyboard_3:
  ld a,$00		; set the result
  ld (KSTATE5),A	; save the result
  or a			; set/reset Z flag
  ret

; Mapping: Arrows Left/Right - rotate, Up - accelerate, Down - decelerate
;          US/SS/RusLat/ZB - accelerate, Space/Tab - decelerate
; Joystick Fire - accelerate
DecodeKeyboard_map:                     ; 7   6   5   4   3   2   1   0
  DW KeyLineEx
  DB $08,$08,$08,$00,$00,$00,$00,$00  ; R/L SS  US  --  --  --  --  --
  DW KeyLine0
  DB $01,$04,$08,$02,$01,$20,$20,$01  ; Dn  Rt  Up  Lt  ZB  VK  PS  Tab
  DW KeyLine7
  DB $01,$00,$00,$00,$00,$00,$00,$00  ; Spc  ^   ]   \   [   Z   Y   X
; [ДОПОЛНЕНИЕ ПОВЕРХ nzeemin as-is] Строка джойстика у автора уже была расписана
; ровно под раскладку порта 0x0E, но указывала на JoystickP (порт 6 через 8255) и
; не опрашивалась (ld b,3). Переставлено на JoystickE = чтение порта 0x0E, счётчик
; строк поднят до 4. Любая из кнопок Fire даёт $08 = Accel, а Accel в меню и есть
; «старт игры»; на титуле она же считается «любой клавишей».
  DW JoystickE
  DB $08,$08,$00,$00,$01,$08,$02,$04  ; Fr2 Fr1 --  --  Dn  Up  Lt  Rt

; Decoding KeyLine2
; Returns: A = 1..4 if pressed; 0 = not pressed
DecodeKeyLine2:
  ld A,(KeyLine2)
  rra			; skip bit0 = key '0'
  ld C,1
  rra			; bit1 = key '1'
  jp nc,.found
  inc C
  rra			; bit1 = key '2'
  jp nc,.found
  inc C
  rra			; bit1 = key '3'
  jp nc,.found
  inc C
  rra			; bit1 = key '4'
  jp nc,.found
  xor A
  ret
.found:
  ld A,C
  ret

;----------------------------------------------------------------------------
; ZX Spectrum 48K ROM calls used by the game code

; ROM_KEYBOARD	;EQU $02BF	; Scan the keyboard and decode the key value into LAST-K variable
; 	ret

; DE	Number of passes to make through the sound generation loop
; HL	Loop delay parameter
ROM_BEEPER	;EQU $03B5
	ret ;STUB
	DI		; Disable the interrupt for the duration of a 'beep'.
	LD A,L		; Save L temporarily.
	SRL L		; Each '1' in the L register is to count 4 T states, but take INT (L/4) and count 16 T states instead.
	SRL L
	CPL		; Go back to the original value in L and find how many were lost by taking 3-(A mod 4).
	AND $03
	LD C,A
	LD B,$00
	LD IX,$03D1	; The base address of the timing loop.
	ADD IX,BC	; Alter the length of the timing loop. Use an earlier starting point for each '1' lost by taking INT (L/4).
	xor a
;	LD A,($5C48)	; Fetch the present border colour from BORDCR and move it to bits 2, 1 and 0 of the A register.
;	AND $38
;	RRCA
;	RRCA
;	RRCA
;	OR $08		; Ensure the MIC output is 'off'.
; Now enter the sound generation loop. DE complete passes are made, i.e. a pass for each cycle of the note.
; The HL register holds the 'length of the timing loop' with 16 T states being used for each '1' in the L register and 1024 T states for each '1' in the H register.
	NOP		; Add 4 T states for each earlier entry point that is used.
	NOP
	NOP
	INC B		; The values in the B and C registers will come from the H and L registers - see below.
	INC C
BE_H_L_LP
	DEC C		; The 'timing loop', i.e. BC*4 T states. (But note that at the half-cycle point, C will be equal to L+1.)
	JR NZ,BE_H_L_LP
	LD C,$3F
	DEC B
	JP NZ,BE_H_L_LP
; The loudspeaker is now alternately activated and deactivated.
	xor 1 ;XOR $10		;Flip bit 4.
	out ($00),a ;OUT ($FE),A	; Perform the 'OUT' operation, leaving the border unchanged.
	LD B,H		; Reset the B register.
	LD C,A		; Save the A register.
	BIT 4,A		; Jump if at the half-cycle point.
	JR NZ,BE_AGAIN
; After a full cycle the DE register pair is tested.
	LD A,D		; Jump forward if the last complete pass has been made already.
	OR E
	JR Z,BE_END
	LD A,C		; Fetch the saved value.
	LD C,L		; Reset the C register.
	DEC DE		; Decrease the pass counter.
	JP (IX)		; Jump back to the required starting location of the loop.
; The parameters for the second half-cycle are set up.
BE_AGAIN
	LD C,L		; Reset the C register.
	INC C		; Add 16 T states as this path is shorter.
	JP (IX)		; Jump back.
; Upon completion of the 'beep' the maskable interrupt has to be enabled.
BE_END
	EI		; Enable interrupt.
	RET		; Finally return.


;ROM_CHARSET	;EQU $3D00
	INCLUDE "scubasymb.asm"

;----------------------------------------------------------------------------
; ZX Spectrum variables used by the game code

KSTATE5	DB 0	; $1C05 KSTATE5
;FRAMES	DB 0,0,0 ; $1C78 FRAMES - Frame counter. 3 bytes, least significant first
;DF_CC	DW 0	; $1C84 DF-CC - Address in display file of PRINT position
;S_POSN	DW 0	; $1C88 S-POSN - Column and line number for PRINT position
;ATTR_P	DB 0	; $1C8D ATTR-P - Permanent current colours

;----------------------------------------------------------------------------

; Variables
	DISPLAY "Variables start: ", /A, $
	INCLUDE "scubacoda.asm"

	ALIGN 256
	INCLUDE "scubammap.asm" ; MiniMap

	ALIGN 256
; Screen attributes.
; Было $300 = 32 столбца * 24 строки. Стало $400 = 32 * 32: GetScrAttrAddr
; считает смещение как row*32 + column, а HUD теперь печатается в знакоместных
; строках 24..31, и PrintChar писал бы атрибут за хвост буфера — прямо в код,
; который начинается сразу за ним. В образе эти 256 нулей стоят единицы байт:
; ZX0 давит их почти в ноль.
SCRATTR:
	DS $400

	ALIGN 256
	INCLUDE "scubacodb.asm"
	;ALIGN 256
	INCLUDE "scubacodc.asm"

; scubapanl.asm (битмап вертикальной панели, ZX0) больше НЕ подключается: HUD
; стал горизонтальным и рисуется примитивами PrintString/PrintDec/HighlightChar
; плюс DrawHud. Сам файл оставлен в дереве нетронутым.
SCUBACOD1_ENDA

;----------------------------------------------------------------------------
SCUBACOD1_END
	DISPLAY "Top address: ", /A, SCUBACOD1_END
	OUTEND
	END