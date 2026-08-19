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
; --- RST-ТРАМПЛИНЫ ДЛЯ ТРЁХ САМЫХ МНОГОЧИСЛЕННЫХ ХЕЛПЕРОВ -------------------
; `rst n` — ОДНОБАЙТНЫЙ вызов, поэтому площадка `call z80_sta_X` (3 байта)
; становится `rst 20h` (1 байт): минус 2 байта на каждой из 126 площадок = 252 Б,
; минус 29 Б на эту установку = 223 Б чистыми. Байты сейчас дороже тактов: до
; потолка $B000 оставалось 74.
; ЧЕСТНО ПРО ТАКТЫ: это НЕ ускорение. `rst` = 11 тактов, но в векторе стоит `jp`
; (10), итого 21 против 17 у `call` — на 4 такта ДОРОЖЕ. Минус 6 тактов получился
; бы, только если тело хелпера физически лежит в векторе, а тела у нас 20+ байт
; при шаге векторов в 8. Поэтому вектора отданы не самым горячим, а самым
; МНОГОЧИСЛЕННЫМ по площадкам и при этом холодным хелперам: замер даёт
; 2.05 + 0.67 + 0.32 = 3.04 вызова на тик, то есть цена 12 тактов на тик = 0.03%.
; Векторы 0x20/0x28/0x30 (RST 4/5/6) свободны — проверено картой нулевой страницы;
; вектор 0x38 занят прерыванием, 0x00 — сбросом, их не трогаем (урок KV: таблица,
; положенная в 0x0039, съела вектор ISR).
	ld a,0C3h		; опкод jp
	ld (20h),a
	ld hl,z80_sta_X
	ld (21h),hl
	ld (28h),a
	ld hl,z80_stn_X
	ld (29h),hl
	ld (30h),a
	ld hl,z80_setX
	ld (31h),hl
; СКЛЕЙКА ЭКРАНОВ МЕНЮ. Титульные строки уехали на экран выбора (LEDFE): после
; снятия титульной картинки первый экран остался почти пустым, и держать ради
; двух строк отдельный шаг с «PRESS ENTER» стало незачем.
	IFNDEF NOTITLE
; Сборка С КАРТИНКОЙ: показываем её и ждём клавишу — иначе картинку никто не
; увидит. В сборке без картинки (-DNOTITLE) ждать нечего, идём сразу в меню.
	LD HL,StrPressEnter
	LD BC,$140A		; row/column
	CALL PrintString	; Print string
	call WaitAnyKey
	ENDIF

	xor A
	CALL ClearScreenFillAttr	; Clear screen with attribute A

	;ld hl,LEVEL
	;ld (hl),2
	;call START_GAME

;	LD HL,LE604		; Melody address
;	CALL PlayMelody		; Play melody
;	call LE615

; ОЖИДАНИЕ ОТПУСКАНИЯ — РОВНО ЗДЕСЬ, на переходе «заставка/титул -> меню».
; Утечка возникает только на этом переходе: кнопка, которой вышли из заставки, ещё
; удерживается, когда меню начинает читать ввод, и «газ» срабатывает мгновенно.
; ПОЧЕМУ НЕ В LEE1C, куда я поставил это сначала: туда управление приходит при
; КАЖДОМ возврате в меню, в том числе после смерти. Сценарий seed2 держит «газ»
; все 1500 тиков — и после первой же смерти ожидание не кончалось никогда.
; Замер: до правки seed2 доходил до 1500 тиков, после — вставал на 1445-м в
; DecodeKeyboard. Здесь этот путь исполняется один раз за запуск.
; Маска $CF обязательна: у DecodeKeyboard биты 4 и 5 ВСЕГДА единицы
; (scubacod0.asm: «b4/b5 всегда 1, кнопок нет»), и проверка OR A не вышла бы никогда.
; EI ОБЯЗАТЕЛЕН ПЕРЕД ЦИКЛОМ, и это уже выученный в проекте урок: у штатного
; WaitAnyKey ровно такой же цикл ожидания отпускания, и перед ним стоит ei с
; объяснением «без прерываний KEYINT не сканирует клавиатуру и ждать становится
; нечего». DecodeKeyboard читает KeyLine0/2/7, а заполняет их ТОЛЬКО обработчик
; KEYINT. К этому месту прерывания ещё закрыты бутом (ei делает лишь отрисовка
; меню, ниже по течению), поэтому KeyLine заморожена на «нажато» — и цикл не
; выходит НИКОГДА. Замер полной цепочки заставка->игра с удержанной кнопкой:
; FIRE2 и «газ» — меню не достигнуто, прерывания запрещены, PC вечно в
; DecodeKeyboard; ENTER проходил только потому, что не попадал под маску.
; Проверку берём как у автора — or a, без маски: при живых прерываниях
; DecodeKeyboard возвращает ноль, когда ничего не нажато.
	ei
WaitUnpress:
	call DecodeKeyboard
	or a
	jp NZ,WaitUnpress
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
StrBigTitle
	ABYTE	-$20 "SCUBA DIVE"
	BYTE	$FF
StrTitle2
	ABYTE	-$20 "I8080 PORT - NZEEMIN Z80 BASE"
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
	jp WaitAnyKey_1	; Wait for press

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
; Строка джойстика у автора уже была расписана ровно под раскладку порта 0x0E,
; но указывала на JoystickP (порт 6 через 8255) и не опрашивалась (ld b,3).
; Переставлено на JoystickE = чтение порта 0x0E, счётчик строк поднят до 4.
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
; [D.0] Тело ZX-бипера УДАЛЕНО (90 Б). Оно лежало за безусловным ret и не
; исполнялось ни разу (профиль: 0 исполнений, JP (IX) внутри него тоже 0), а
; звук у нас давно аппаратный на ВИ53 (scubacod0.asm). Держать мёртвую
; Z80-процедуру с DI и busy-петлями в образе, которому не хватает места под
; третью видимую плоскость, незачем.


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

; scubapanl.asm (битмап вертикальной панели, ZX0) в сборке с нижним HUD НЕ
; подключается: тот рисуется примитивами PrintString/PrintDec/HighlightChar плюс
; DrawHud. В геометрии зоны (-DGEOM) панель возвращается ровно та же, побайтно:
; md5 файла совпадает с исходником Зимина.
	IFDEF GEOM
SCUBAPANL_ZX0:
	INCLUDE "scubapanl.asm"
	ENDIF
SCUBACOD1_ENDA

; библиотека рекомпиляции Z80 -> i8080 (хелперы (IX+d), ГПСЧ вместо LD A,R,
; рабочие ячейки). Сгенерирована tools/z80to8080.py, дальше правится руками.
	INCLUDE "scubai80.asm"

;----------------------------------------------------------------------------
SCUBACOD1_END
; ДИАГНОСТИЧЕСКИЙ РАСТРОВЫЙ ФОН (-DRASTER). Модуль лежит по своему ORG 0BD00h —
; в забронированной странице пула буферов, ПОСЛЕ метки конца кода. Поэтому он не
; сдвигает ни одного байта игры и не участвует в стороже потолка ниже: сторож
; по-прежнему меряет SCUBACOD1_END, а он взят до включения.
	IFDEF RASTER
	INCLUDE "scubarast.asm"
	ENDIF
	IFDEF EVICT
; --- РАСКЛАДКА ВЫСЕЛЕННЫХ БЛОКОВ ПО ЛОМТЯМ ЗОНЫ ----------------------------
; Блоки лежат в образе УПАКОВАННЫМИ подряд (SCUBAZONE_SRC), а ассемблированы по
; адресам ломтей через DISP — поэтому все ссылки на них уже верные, и остаётся
; только разложить байты. Порядок ломтей: плоскость 2 (0xC0..0xD7), плоскость 3
; (0xE0..0xF7), и ТОЛЬКО ПОТОМ плоскость 1 (0xA0..0xBF). Порядок не косметика:
; ломти плоскости 1 лежат внутри кода, пока тот не съехал ниже 0xA000, и при
; частичном выселении раскладка туда затирает сам код — проверено, образ до
; главного цикла не доходил. Таблица переселенцев не нужна.
; ЗВАТЬ ЭТО НАДО ПОСЛЕ МЕНЮ, а не в голове блока кода1. Замер: меню печатает
; заголовок и подсказки знакоместными строками 0..7, а это экранные строки
; 0..63 — ровно ломти. Разложенные в голове данные меню затирало, и спрайты
; выходили побитыми (74 расхождения из 240 сверенных байт).
ZoneCopy:
	ld hl,SCUBAZONE_SRC
	ld d,0C0h
	ld e,192
	ld c,SCUBAZONE_N
zcopy:
	ld b,64
zcopy1:
	ld a,(hl)
	ld (de),a
	inc hl
	inc e			; младший байт ломтя 192..255, переполниться не может
	dec b
	jp nz,zcopy1
	ld a,d
	inc a
	cp 0D8h			; конец плоскости 2 -> плоскость 3
	jp nz,zcopy3
	ld a,0E0h
zcopy3:
	cp 0F8h			; конец плоскости 3 -> плоскость 1
	jp nz,zcopy2
	ld a,0A0h
zcopy2:
	ld d,a
	ld e,192
	dec c
	jp nz,zcopy
	ret
; Упакованная область выселенных блоков. Лежит ПОСЛЕ кода: от её выноса из
; непрерывной области код и съезжает вниз, а конец кода опускается под 0xA000.
; После раскладки область мертва — плоскость 1 её затрёт, когда станет видимой.
	INCLUDE "scubazone.asm"
SCUBAZONE_N	EQU (SCUBAZONE_END-SCUBAZONE_SRC)/64
	DISPLAY "ZONE slices: ", /A, SCUBAZONE_N
	ENDIF
; СТОРОЖ ПОТОЛКА КОДА. Область $B000-$BFFF — рабочие буферы спрайтов времени
; выполнения (LB7B9 хранит там адрес, LBEC7 ставит HL=$B000, задержка LC4D7 тоже
; топчется в этом диапазоне). Код обязан закончиться ДО неё.
; Почему сторож нужен: ассемблер об этом не знает и молча выпускает образ, который
; собирается без единой ошибки, проходит сборочные проверки — и не запускается.
; Именно так и случилось при первом заходе специализации хелперов: +431 байт увели
; Top address на 0xB0F8, игра встала на главном цикле, и понять это можно было
; только по падению стенда.
	ASSERT SCUBACOD1_END <= 0B000h
	DISPLAY "Top address: ", /A, SCUBACOD1_END
	OUTEND
	END