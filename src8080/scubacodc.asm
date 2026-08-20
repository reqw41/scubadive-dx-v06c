;----------------------------------------------------------------------------

	;ASSERT $ < $9900
	;DS $9900 - $
	;ORG $9900
	DISPLAY "Code start: ", /A, $

; Game; returns on Game Over
Game	DI
	IFDEF GEOM
	ld a,0BFh
	ld (ScrollVal),a	; геймплей: поле прижато, зона уехала вниз
	ENDIF
	ld (il_hl),hl
	ld hl,(z80_ix)
	push hl
	ld hl,(il_hl)
	ld (il_hl),hl
	ld hl,(z80_iy)
	push hl
	ld hl,(il_hl)
	LD HL,$0000
	LD (SCORE),HL		; reset Score value
	LD (HELD),HL		; reset HELD value
	LD A,$03		; Number of lives
	LD (LIVES),A		; set the initial value
; РАСКЛАДКИ ЗДЕСЬ БОЛЬШЕ НЕТ, И ЭТО НЕ ЭКОНОМИЯ, А СЛЕДСТВИЕ ФИКСА ДЕМО.
; PrepareMiniMap читает выселенные блоки и без разложенных ломтей получает мусор
; — поэтому раскладка обязана предшествовать ей. Но тот же PrepareMiniMap зовёт
; и демо-режим меню, куда управление приходит РАНЬШЕ первого входа в Game.
; Значит единственное место, которое годится обоим, — бут: раскладка перенесена
; в Start, сразу за распаковку панели (см. там подробный разбор зависания).
; Здесь она была бы уже второй и разложила бы затёртый источник.
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
	IFDEF RASTER
	call rz_start		; взвести счётчик строк в детерминированной фазе
	ENDIF
LD9C0
; --- ВРЕЗКА РАСТРОВОГО ФОНА (-DRASTER) -------------------------------------
; ШТАТНО оба рандеву стоят ПОДРЯД ПОСЛЕ ТИКА. Между целями ровно 128 строк =
; 24576 тактов, и эти такты сгорают впустую — казалось бы, дешевле разнести
; вызовы по тику и уложить CALL LB213 в промежуток 64..192. ЗАМЕР ЭТУ ИДЕЮ
; ОТВЕРГ: -DRASTER_SPLIT даёт 239 полных кадров из 300 против 237 у простого
; варианта на уровне 4 и 248 против 248 на уровне 1, то есть разницы нет.
; Причина видна в распределении тика: он не «чуть длиннее окна», он ДВУГОРБЫЙ —
; медиана 24048 тактов, но максимум 286980 (почти пять кадров) на перерисовке
; экрана. Кадры теряются не на промахе мимо окна, а внутри длинных перерисовок,
; и разнесение вызовов от этого не спасает. Вариант оставлен под флагом как
; проверенный отрицательный результат, чтобы его не переоткрывали.
; Порядок вызовов игры не меняется ни в одном из вариантов.
	IFDEF RASTER
	IFDEF RASTER_SPLIT
	call rz_water		; рандеву к строке 64: слот 0 := синий (вода)
	ENDIF
	ENDIF
	CALL LB213
	IFDEF RASTER
	IFDEF RASTER_SPLIT
	call rz_hud		; рандеву к строке 192: слот 0 := чёрный (фон HUD)
	ENDIF
	ENDIF
	CALL LBDEA
	CALL LE2A8
	IFDEF RASTER
	IFNDEF RASTER_SPLIT
	call rz_water
	call rz_hud
	ENDIF
	ENDIF
	ld (il_hl),hl	; Diver object address
	ld hl,DiverObj
	ld (z80_ix),hl
	ld hl,(il_hl)
	ld (il_a),a
	ld a,(DiverObj+$26)
	and 1<<(4)
	ld a,(il_a)
	jp NZ,LD9DB
	ld (il_a),a
	ld a,(DiverObj+$10)
	and 1<<(5)
	ld a,(il_a)
	jp NZ,LD9F4
	jp LD9C0
LD9DB	LD A,(LIVES)		; get Number of lives
	CP $04
	jp NZ,LD9E7
	LD A,$03
	LD (LIVES),A		; set Number of lives
LD9E7	LD A,(LEVEL)		; LEVEL
	CP $04
	jp Z,LD9EF
	INC A			; increase Game level
LD9EF	LD (LEVEL),A		; Save LEVEL
	jp LD9A3
LD9F4	LD B,$00		; repeat 256 times
LD9F6	PUSH BC
; Та же врезка в цикле смерти: без неё 256 тиков агонии шли бы со слотом 0,
; замершим на цвете неба, то есть весь экран голубой. Диагностика должна быть
; видна и здесь.
	IFDEF RASTER
	IFDEF RASTER_SPLIT
	call rz_water
	ENDIF
	ENDIF
	CALL LB213
	IFDEF RASTER
	IFDEF RASTER_SPLIT
	call rz_hud
	ENDIF
	ENDIF
	CALL LBDEA
	CALL LE2A8
	IFDEF RASTER
	IFNDEF RASTER_SPLIT
	call rz_water
	call rz_hud
	ENDIF
	ENDIF
	POP BC
	dec b
	jp nz,LD9F6
	LD A,(L5B00)
	CP $08
	jp NZ,LDA1E
	LD A,(L5B0F)
	CP $03
	jp NZ,LDA1E
	LD A,(LIVES)		; get Number of lives
	CP $01
	jp Z,LDA1E	; No more lives? => no lives, jump
	DEC A
	LD (LIVES),A		; set Number of lives
	jp LD9DB
LDA1E	LD A,(LIVES)		; get Number of lives
	CP $01			; last live?
	jp Z,LDA33	; yes => game over
	DEC A			; One live less
	LD (LIVES),A		; set Number of lives
	LD HL,LE361
	LD A,(HL)
	AND $20
	LD (HL),A
	JP LD9B1
; No more lives, game over
LDA33:
	IFDEF GEOM
	IFNDEF EVICT
	ld a,0FFh
	ld (ScrollVal),a	; меню и таблица рекордов — дефолтная развёртка
	ELSE
; РАЗВЁРТКА НА МЕНЮ ТА ЖЕ, ЧТО В ИГРЕ. Под выселением строки 0..63 — это ломти, и
; показывать их незачем: меню печатается на восемь знакомест ниже (MENU_ROWS), а
; развёртка 0xBF сдвигает картинку ровно на те же 64 строки вверх. Текст стоит на
; прежних местах, а зона уходит в нижнюю кайму — и в меню тоже.
; Ветвление при этом вырождается: ScrollVal становится константой 0xBF с самого
; буста, и переключать его больше негде.
	ENDIF
	ENDIF
	IFDEF RASTER
	call rz_stop		; вернуть слоту 0 чёрный: меню не должно остаться голубым
	ENDIF
	ld (il_hl),hl	; Ending the Game routine, the game is over
	pop hl
	ld (z80_iy),hl
	ld hl,(il_hl)
	ld (il_hl),hl
	pop hl
	ld (z80_ix),hl
	ld hl,(il_hl)
	EI
	RET

; Clear screen, fill attributes with A
; I: A = screen attribute to use
ClearScreenFillAttr
	LD (L5B4A),A		; store the attribute as current
	call ClearScreen	; стереть обе видимые плоскости целиком
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
	jp NZ,LDA51
	RET

; Стереть ВСЮ видимую видеопамять $C000..$FFFF в ноль.
; Было: две плоскости чистились разными раскладками — в $C000 цикл начинался с
; l=232 и намеренно оставлял lo 255..232 (экранные строки 32..55) с остатком
; титульной картинки, а в $E000 сверху и снизу писались полосы $FF — синий фон
; над и под полем. Новая геометрия: поле — экранные строки 0..191, HUD —
; строки 192..255, синих полос нет ни одной, фон везде чёрный (индекс 0 =
; обе плоскости в нуле). Значит обе плоскости чистятся одинаково, и $C000..$FFFF
; — это просто 64 подряд идущих столбца: один цикл вместо пяти.
; ClearGameScreen больше не «поле без индикаторов»: HUD теперь лежит в строках
; 24..31 ВСЕХ столбцов, отдельной вертикальной панели нет, и единственный его
; вызыватель (LEADE, game over) сразу уходит в меню, которое перерисовывает
; экран само.
ClearGameScreen
ClearScreen
	ld h,$C0		; первый столбец видимой видеопамяти
	IFNDEF EVICT
LDA42	xor a
	ld l,a			; 256 байт столбца
	ELSE
; КЛИП ПОД ЛОМТИ: младшие байты 192..255 — это экранные строки 0..63, то есть
; зона данных. Чистить их нельзя, там лежат выселенные блоки. Поле занимает
; строки 64..255 = младшие 0..191, поэтому клип ровно по границе зоны и ничего
; видимого не теряет.
LDA42	xor a
	ld l,192
	ENDIF
LDA44	dec l
	LD (HL),a		; clear pixels
	jp nz,LDA44
	inc h
	IFDEF EVICT
; КЛИП ПО СТОЛБЦАМ. Столбцы 24..31 обеих плоскостей — БИТМАП ПАНЕЛИ, и чистка
; стирала его целиком (замер: 3072 записи в эти столбцы, все в область битмапа).
; Из-за этого панель перерисовывалась на каждой постановке уровня, а её
; распаковщик топтал ломти рельефа 22..29 (512 записей в зону) — на чём и
; держалась вторая раскладка. Пропуск восьми столбцов разрывает цепочку и заодно
; удешевляет чистку на четверть.
; Гасить панель незачем: владелец принял её видимой и в меню, и это эталонный вид.
	ld a,h
	and 1Fh
	cp 24
	jp c,LDA43
	ld a,h
	add a,8			; перескочить восемь столбцов панели на следующую плоскость
	ld h,a
LDA43:
	ENDIF
	ld a,h
	or a			; h завернулся из $FF в $00 => прошли $C000..$FFFF
	jp nz,LDA42
	ret

	IFDEF EVICT
; ПАНЕЛЬ РИСУЕТСЯ ОДИН РАЗ ЗА ВСЮ ЖИЗНЬ ОБРАЗА. Чистка экрана её столбцы не
; трогает (клип по столбцам выше), гасить её незачем: владелец принял боковую
; панель видимой и в меню, и это теперь эталонный вид. Отсюда главное следствие:
; распаковщик панели больше НИКОГДА не проходит по зонным строкам своих столбцов
; после буста, и раскладка ломтей может быть ОДНОКРАТНОЙ.
ZoneLaid:	db 0	; 0xFF = ломти разложены, источник мёртв
	ENDIF

; Print char and shift current position right
PrintCharRt
	LD HL,(LDC7E)
	INC L
	LD (LDC7E),HL
	DEC L
;	JR PrintChar
; ; Print char and shift current position down
; PrintCharDn
; 	LD HL,(LDC7E)
; 	INC H
; 	LD (LDC7E),HL
; 	DEC H
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
	push af
	ld a,L
	and (~(1<<(7)))&255
	ld L,a
	pop af
	ADD HL,HL
	ADD HL,HL
	ADD HL,HL		; *8
	ld (il_a),a
	and 1<<(7)
	ld a,(il_a)
	jp NZ,LDA83
	LD BC,ROM_CHARSET	; ROM font address, for chars $20..$7F
	jp LDA86
LDA83	LD BC,LDC80		; Tiles 8x8 address, for chars $80..$AE
LDA86	ADD HL,BC
	LD B,$08		; repeat 8 times
LDA89	LD A,(HL)		; get char pixels
	LD (DE),A		; put on the screen
	INC HL
	dec e ;INC D			; next row
	dec b
	jp nz,LDA89
	POP HL			; restore char coords
	CALL GetScrAttrAddr	; Get screen attribute address
	LD A,(L5B4A)		; get current screen attribute
	LD (HL),A		; set attribute on the screen
	RET


; --- КРУПНАЯ ПЕЧАТЬ 2x2 ----------------------------------------------------
; Каждый глиф растягивается в четыре знакоместа: биты удваиваются по горизонтали
; таблицей «полубайт -> байт», строки — повторной записью. Таблица лежит в мёртвых
; глифах шрифта ($22 и $23), поэтому крупный заголовок не стоит НИ БАЙТА данных.
BIG_TBL	EQU ROM_CHARSET+($22-$20)*8

; I: HL = строка ($FF-терминатор), BC = строка/столбец знакоместа
PrintBig
	ld a,(hl)
	cp $FF
	ret z
	push hl
	push bc
	call PrintBigChar
	pop bc
	inc c
	inc c			; следующий символ — через ДВА знакоместа
	pop hl
	inc hl
	jp PrintBig

; Один символ 2x2. I: A = код символа, BC = строка/столбец
PrintBigChar
	push bc
	ld l,a
	ld h,0
	add hl,hl
	add hl,hl
	add hl,hl		; A*8 — смещение глифа
	ld de,ROM_CHARSET
	add hl,de
	ex de,hl		; DE = адрес глифа
	pop hl			; H = строка, L = столбец
	call GetScrAddr		; HL = экран; DE цел — GetScrAddr его сохраняет
	ld b,8
PrintBigChar_1
	push bc
	ld a,(de)
	inc de
	push de
	call ExpandByte		; D = левая половина строки, E = правая
	ld (hl),d
	inc h			; соседний столбец
	ld (hl),e
	dec h
	dec l			; экранная строка ниже
	ld (hl),d		; та же строка второй раз — растяжение по вертикали
	inc h
	ld (hl),e
	dec h
	dec l
	pop de
	pop bc
	dec b
	jp nz,PrintBigChar_1
	ret

; A -> D:E, каждый бит удвоен
ExpandByte
	push af
	rrca
	rrca
	rrca
	rrca
	and $0F
	call ExpandNib
	ld d,a
	pop af
	and $0F
	call ExpandNib
	ld e,a
	ret
ExpandNib
	push hl
	ld hl,BIG_TBL
	add a,l
	ld l,a
	ld a,0
	adc a,h
	ld h,a
	ld a,(hl)
	pop hl
	ret

; Print string
; I:HL	String address
; I:BC	Row and column
; I:DE	Print char procedure address
; PrintStringEx
; 	LD (LDAA2+1),DE
;
; Print string
; I:HL	String address
; I:BC	Row and column
PrintString
	ld (il_a),a
	ld a,c
	ld (LDC7E),a
	ld a,b
	ld (LDC7E+1),a
	ld a,(il_a)
	LD A,(HL)
LDAA1	PUSH HL
LDAA2	CALL PrintCharRt	; Print char and shift
	POP HL
	INC HL
	LD A,(HL)
	CP $FF
	jp NZ,LDAA1
	RET

; Highlight one 8x8 char cell on the panel by filling it solid in the
; GetScrAddr colour plane (opposite the digit). ZX used a bright attribute.
; I: HL = Vector screen address of the cell's top line
HighlightChar
	IFNDEF GEOM
	ld a,h
	xor $20			; подсветка ложится в ДРУГУЮ плоскость, не поверх цифры:
	ld h,a			; фон знакоместа синий, цифра на нём красная
	ELSE
; ПЛОСКОСТЬ ПОДСВЕТКИ ВОЗВРАЩЕНА КАК У ЗИМИНА — БЕЗ xor $20.
; Правка с xor родилась в эпоху НИЖНЕГО HUD: там цифры SKILL/LIVES печатались
; нашей печатью в 0xC000, и подсветку приходилось класть в 0xE000, чтобы поверх
; синего фона цифра вышла красной.
; С панелью оригинала цифры приходят ГОТОВЫМИ в битмапе панели, а он лежит в
; 0xE000. Наш xor отправлял подсветку в ту же плоскость, где уже нарисована
; цифра: вместо «красная цифра на синем» получалась заливка одной плоскости, и
; цвет SKILL/LIVES на железе сбивался. У Зимина подсветка идёт по адресу от
; GetScrAddr, то есть в 0xC000, и вместе с битмапом в 0xE000 даёт обе плоскости
; = красный.
	ENDIF
	LD B,$08		; 8 pixel lines
HighlightChar_1
	LD (HL),$FF
	dec l			; next line down
	dec b
	jp nz,HighlightChar_1
	RET

; Базы полос-индикаторов HUD: левый верхний байт полосы в плоскости 0xC000,
; столбец 8. Полоса горизонтальная, 128 пикселей = 16 столбцов, высота 4 строки.
	IFNDEF GEOM
GAUGE_OXY	EQU $C81D	; столбец 8, lo $1D = экранная строка 226 (знакоместная 28)
GAUGE_DEPTH	EQU $C80D	; столбец 8, lo $0D = экранная строка 242 (знакоместная 30)
	ELSE
; Шкалы оригинала ВЕРТИКАЛЬНЫЕ: один столбец шириной, ползунок высотой 4 строки
; ездит по 128 пикселям. Корыто нарисовано в битмапе панели (плоскость 0xE000),
; поэтому сужать с 16 столбцов до 8 не требуется — сужать нечего.
GAUGE_OXY	EQU $D983	; столбец 25, lo $83 = экранная строка 124
GAUGE_DEPTH	EQU $DB83	; столбец 27, lo $83 = экранная строка 124
	ENDIF

; Нарисовать неподвижную часть HUD: разделительную линию, подписи и корыта полос.
; Вызывается один раз из PrepareGame — вместо распаковки битмапа вертикальной
; панели scubapanl (ShowGamePanel), которого больше нет.
; Раскладка (знакоместные строки 24..31, столбцы 0..31):
;   24: разделительная линия во всю ширину (экранная строка 192)
;   25: HIGH 000000        SCORE 000000
;   26: HELD 0000          SKILL 1 2 3 4
;   27:                    LIVES 1 2 3 4
;   28: OXYGEN  [полоса 128 px]
;   30: DEPTH   [полоса 128 px]
; Ширины строк: HIGH(4)+пробел+6 цифр = столбцы 0..10; SCORE(5)+пробел+6 цифр =
; 16..27; HELD(4)+пробел+4 цифры = 0..8; SKILL/LIVES(5) = 16..20, "1 2 3 4" =
; 22..28; OXYGEN(6) = 0..5, DEPTH(5) = 0..4, обе полосы = столбцы 8..23
; (16 столбцов * 8 = ровно 128 пикселей). Ни одна строка не выходит за 32 столбца.
; --- РАМКА HUD ------------------------------------------------------------
; В оригинале панель была в рамке; при переносе HUD вниз рамка потерялась.
; Тайлы лежат в ДЫРАХ ШРИФТА (символы $3B..$40), доказанно мёртвых по переписи
; глифов, и генерируются офлайн (tools/genframe.py) поворотами одного рисунка.
; Поэтому рамка не стоит НИ ОДНОГО байта данных: её печатает обычная печать
; символов, а строковых констант нет вовсе — кромки набираются счётчиком.
TILE_H	EQU $3B-$20		; горизонтальная палочка
TILE_V	EQU $3C-$20		; вертикальная палочка
TILE_TL	EQU $3D-$20		; уголок левый верхний
TILE_TR	EQU $3E-$20		; уголок правый верхний
TILE_BL	EQU $3F-$20		; уголок левый нижний
TILE_BR	EQU $40-$20		; уголок правый нижний

	IFNDEF GEOM		; горизонтальный HUD целиком выключен в геометрии зоны
; позиция печати := BC (B = строка, C = столбец)
HudSetPos
	ld a,c
	ld (LDC7E),a
	ld a,b
	ld (LDC7E+1),a
	ret

; напечатать символ A ровно B раз подряд вправо
HudFill
	push bc
	push af
	call PrintCharRt
	pop af
	pop bc
	dec b
	jp nz,HudFill
	ret

DrawHudFrame
	ld bc,$1800		; строка 24, столбец 0 — верхняя кромка
	call HudSetPos
	ld a,TILE_TL
	call PrintCharRt
	ld a,TILE_H
	ld b,30
	call HudFill
	ld a,TILE_TR
	call PrintCharRt
	ld bc,$1F00		; строка 31 — нижняя кромка
	call HudSetPos
	ld a,TILE_BL
	call PrintCharRt
	ld a,TILE_H
	ld b,30
	call HudFill
	ld a,TILE_BR
	call PrintCharRt
	ld c,$19		; боковые кромки: строки 25..30
DrawHudFrame_1
	push bc
	ld b,c
	ld c,0
	call HudSetPos
	ld a,TILE_V
	call PrintCharRt
	pop bc
	push bc
	ld b,c
	ld c,31
	call HudSetPos
	ld a,TILE_V
	call PrintCharRt
	pop bc
	inc c
	ld a,$1F		; строка 31 — это уже нижняя кромка
	cp c
	jp nz,DrawHudFrame_1
	ret

DrawHud
	call DrawHudFrame
; корыта полос: 16 столбцов по 4 строки в плоскости 0xE000. Сами пиксели полосы
; рисуются в 0xC000, поэтому заполненная часть выходит красной (индекс 3), а
; пустая остаётся синей (индекс 1) — полосу видно и когда она пуста.
	ld hl,GAUGE_OXY+$2002	; +2: корыто 8 px от верха знакоместа, заполнение 4 px внутри
	call DrawHudTrough
	ld hl,GAUGE_DEPTH+$2002
	call DrawHudTrough
; подписи; строки лежат в памяти подряд, поэтому после PrintString (HL стоит на
; терминаторе $FF) следующую даёт один inc hl вместо трёхбайтного ld hl,nn
	ld hl,StrHudHigh
	ld bc,$1901		; строка 25, столбец 1 (столбец 0 занят кромкой)
	call PrintString
	inc hl			; StrHudScore
	ld bc,$1910		; строка 25, столбец 16
	call PrintString
	inc hl			; StrHudHeld
	ld bc,$1A01		; строка 26, столбец 1
	call PrintString
	inc hl			; StrHudSkill
	ld bc,$1A10		; строка 26, столбец 16
	call PrintString
	inc hl			; StrHudLives
	ld bc,$1B10		; строка 27, столбец 16
	call PrintString
	inc hl			; StrHudOxygen
	ld bc,$1C01		; строка 28, столбец 1
	call PrintString
	inc hl			; StrHudDepth
	ld bc,$1E01		; строка 30, столбец 1
	call PrintString
	ld hl,StrHud1234
	ld bc,$1A16		; строка 26, столбец 22 — цифры SKILL
	call PrintString
	ld hl,StrHud1234
	ld bc,$1B16		; строка 27, столбец 22 — цифры LIVES
	call PrintString
; FIDELITY. В оригинале рамка, подписи и корыта шкал лежали в БИТМАПЕ ПАНЕЛИ, то
; есть в плоскости 0xE000 — и потому были фиолетовыми (ColorGame). Бледно-жёлтым
; (ColorText, плоскость 0xC000) там были только ЦИФРЫ, а красным (обе плоскости) —
; ползунок и подсветка. Опись нашей панели показала, что рамка и подписи у нас
; печатаются в 0xC000 и выходят бледно-жёлтыми — не как у Зимина.
; Печать умеет писать только в 0xC000, поэтому переносим готовую полосу целиком:
; всё, что нарисовано в 0xC000 в строках HUD, добавляется в 0xE000 и стирается из
; 0xC000. Делается один раз при входе в игру, до печати цифр — цифры печатаются
; позже и остаются бледно-жёлтыми, как и должны.
; Полоса HUD — знакоместные строки 24..31, то есть lo от 0x3F до 0x00.
	ld c,$20		; 32 столбца
	ld h,$C0
HudToPlane_col:
	ld l,$3F		; верх полосы HUD
HudToPlane_1:
	ld a,(hl)
	or a
	jp z,HudToPlane_next	; пусто — не трогаем
	ld b,a
	ld a,h
	xor $20			; тот же адрес в плоскости 0xE000
	ld h,a
	ld a,(hl)
	or b
	ld (hl),a		; добавили в 0xE000
	ld a,h
	xor $20
	ld h,a
	xor a
	ld (hl),a		; стёрли из 0xC000
HudToPlane_next:
	dec l
	ld a,l
	cp $FF
	jp nz,HudToPlane_1
	inc h
	dec c
	jp nz,HudToPlane_col
	ret

; Корыто полосы-индикатора: 16 знакомест ПОВЁРНУТОЙ ГРАФИКОЙ ОРИГИНАЛА.
; В панели оригинала шкала — сплошной столбец 8 пикселей шириной с насечками через
; каждые 8 строк (##....## по кромкам). Повёрнутый на 90 градусов (офлайн, в
; tools/genframe.py), он даёт горизонтальную полосу 8 пикселей толщиной с
; ВЕРТИКАЛЬНЫМИ штрихами через каждые 8 пикселей длины — то есть разметку-линейку,
; которой у плоской полосы не было.
; Тайл лежит в дыре шрифта (символ $21), поэтому данных не стоит НИ БАЙТА.
; Печатью символов сюда не дотянуться: PrintChar пишет только в плоскость 0xC000,
; а корыто обязано лечь в 0xE000 — иначе заполнение не будет видно поверх него.
; Отсюда свой короткий копировщик глифа.
; I: HL = левый верхний байт корыта в плоскости 0xE000
TILE_TROUGH EQU $21-$20
DrawHudTrough
	ld c,$10		; 16 знакомест = 128 пикселей
DrawHudTrough_1
	push hl
	ld de,ROM_CHARSET+TILE_TROUGH*8
	ld b,$08		; глиф 8 строк
DrawHudTrough_2
	ld a,(de)
	ld (hl),a
	inc de
	dec l			; строка ниже
	dec b
	jp nz,DrawHudTrough_2
	pop hl
	inc h			; next column
	dec c
	jp nz,DrawHudTrough_1
	ret

StrHudHigh
	ABYTE	-$20 "HIGH"
	BYTE	$FF
StrHudScore
	ABYTE	-$20 "SCORE"
	BYTE	$FF
StrHudHeld
	ABYTE	-$20 "HELD"
	BYTE	$FF
StrHudSkill
	ABYTE	-$20 "SKILL"
	BYTE	$FF
StrHudLives
	ABYTE	-$20 "LIVES"
	BYTE	$FF
StrHudOxygen
	ABYTE	-$20 "OXYGEN"
	BYTE	$FF
StrHudDepth
	ABYTE	-$20 "DEPTH"
	BYTE	$FF
StrHud1234
	ABYTE	-$20 "1 2 3 4"
	BYTE	$FF

; Prepare game screen, indicators, and some variables
	ENDIF
	IFDEF GEOM
; Битмап боковой панели: 2048 Б в 0xF800..0xFFFF = плоскость 0xE000, столбцы
; 24..31, вся высота экрана. Подписи, рамка и КОРЫТА ШКАЛ приходят готовыми в
; плоскости 0xE000 — фиолетовыми и закрытыми с обеих сторон; ползунок пишется в
; 0xC000, обе плоскости дают красный. Fidelity полосок обеспечена ИСТОЧНИКОМ.
; СТОЛКНОВЕНИЕ С ЗОНОЙ разведено выбором раскладки, а не правкой потока: строки
; 0..63 этих восьми столбцов плоскости 3 объявлены занятыми панелью и в карту
; ломтей не входят. Резать поток не пришлось, порядок «панель раньше раздачи» не
; требуется — множества адресов просто не пересекаются, и это проверяет гейт.
; Цена: 8 столбцов * 64 Б = 512 Б зоны; ёмкость падает с 96 ломтей до 88.
ShowGamePanel:
	ld de,SCUBAPANL_ZX0
	ld bc,$F800
	jp dzx0
	ENDIF
PrepareGame
	LD A,$30
	CALL ClearScreenFillAttr	; Clear screen with attribute A = $30
	xor a ; LD A,$01
	out ($00),a ; OUT ($FE),A
	IFNDEF GEOM
	call DrawHud		; неподвижная часть HUD вместо битмапа панели
	ELSE
; БОКОВАЯ ПАНЕЛЬ ОРИГИНАЛА: битмап 2048 Б распаковывается в 0xF800 — плоскость
; 0xE000, столбцы 24..31, вся высота. Подписи, рамка и КОРЫТА ШКАЛ приходят
; готовыми в плоскости 0xE000, то есть фиолетовыми и закрытыми с обеих сторон, а
; ползунок пишется в 0xC000 — обе плоскости дают красный. Fidelity-семантика
; полосок обеспечена ИСТОЧНИКОМ, а не нашим кодом.
	IFNDEF EVICT
	call ShowGamePanel
	ELSE
; ПОД ВЫСЕЛЕНИЕМ ПАНЕЛЬ УЖЕ НА ЭКРАНЕ: её рисует бут (см. Start), и с тех пор её
; никто не стирает — чистка экрана перешагивает столбцы 24..31. Перерисовывать
; нечего, а распаковщик при каждой перерисовке протирал бы нулями ломти рельефа
; 22..29 (512 записей в зону).
	ENDIF
	ENDIF
; РАСКЛАДКА СТОИТ ЗДЕСЬ, А НЕ ВЫШЕ. Раньше ZoneCopy шла первой в PrepareGame — до
; чистки экрана и до панели. Замер показал, что распаковщик панели dzx0 проходит
; весь блок 2048 Б и ПРОТИРАЕТ НУЛЯМИ зону в своих восьми столбцах (512 записей,
; все нулевые), убивая только что разложенные ломти. Поднять панель выше раскладки
; нельзя — её тут же сотрёт ClearScreenFillAttr. Поэтому порядок такой:
; чистка -> панель -> раскладка, и восемь столбцов 0xE000 возвращаются в оборот.
	IFDEF EVICT
; СТРАХОВОЧНАЯ РАСКЛАДКА. Штатно она НЕ СРАБАТЫВАЕТ НИ РАЗУ: признак ZoneLaid
; ставит бут (Start), сразу за распаковкой панели. Вызов оставлен нарочно и
; стоит 9 байт — он держит два свойства набора:
;   * если признак когда-нибудь окажется сброшен, ломти будут разложены до
;     первой отрисовки поля, а не покажутся мусором на экране;
;   * негативный контроль zone_gate (ZONE_INJECT=1 сбрасывает ZoneLaid в игре и
;     ждёт КРАСНОГО на повторной раскладке живого источника) без него потерял бы
;     свой крючок и зеленел бы впустую.
	ld a,(ZoneLaid)
	or a
	jp nz,zl2
	call ZoneCopy		; разложить выселенные блоки ПОСЛЕ чистки и панели
	dec a			; A был нулём -> 0xFF
	ld (ZoneLaid),a
zl2:
	ENDIF
;
	IFNDEF GEOM
	xor A
	ld (LDE55),a		; полосы стёрты чисткой экрана — состояние тоже в ноль,
	ld (LDE57),a		; иначе на второй игре полоса не перерисуется
	call UpdateDepth1	; reset the Depth indicator
	ELSE
; ПОЛЗУНКИ ПАНЕЛИ НЕ СБРАСЫВАЮТСЯ В БАЗУ, И ЭТО ВАЖНО ДВАЖДЫ.
; Панель Зимина распаковывается ОДИН РАЗ за всю жизнь образа (признак
; её кладёт бут), значит на второй и следующей игре старый ползунок остаётся на
; экране ровно там, где его застал конец прошлой игры. Единственный след, по
; которому его можно стереть, — адрес в LDE55/LDE57, и обнулять его нельзя:
; UpdateGauge стирает четыре байта ПО ПРОШЛОМУ АДРЕСУ, а рисует по новому.
; ВТОРОЕ: звать надо UpdateDepth, а не UpdateDepth1. Второй берёт глубину из A,
; а к этому месту в A лежит остаток от ZoneCopy (на первой игре) или 0xFF (на
; следующих, из проверки ZoneLaid). Замер до правки: на ПЕРВОМ старте ползунок
; глубины вставал в 0xDB07, то есть на 125 пикселей ниже базы 0xDB83, при
; истинной глубине 0 — ровно то, что владелец видел на железе.
; UpdateDepth читает строку мини-карты (L5B03+1) сам, и она к этому моменту уже
; поставлена: её же читает DrawGameScr сразу после PrepareGame.
GaugeInit:			; операнд GaugeInit+1 — точка подсадки гейта шкал
	call UpdateDepth	; ползунок глубины — по РЕАЛЬНОЙ строке мини-карты
	ENDIF
	ld hl,$FFFF
	call UpdateOxygen
; UpdateLevel: highlight the current skill (LEVEL) digit
	LD A,(LEVEL)		; LEVEL 1..4
	DEC A			; 0..3
	ADD A,A			; *2 — два столбца на цифру в строке "1 2 3 4"
	IFNDEF GEOM
	ADD A,$16		; column = 22 + (LEVEL-1)*2 => 22 / 24 / 26 / 28
	LD L,A			; column
	LD H,$1A		; row 26
	ELSE
; Панель Зимина: цифры SKILL стоят в столбце 29, строками 7/9/11/13 ЕГО
; знакоместной сетки. Его GetScrAddr смещала строку на 32 пикселя (neg/sub 4*8+1),
; наша — нет, и трогать её нельзя: ею печатается меню во весь экран: +4 знакоместа.
; ВТОРЫЕ +4: битмап панели выровнен под нашу геометрию (сдвинут вниз на 32 px),
; поэтому все элементы панели уехали ещё на 4 знакоместа. Итого 7+4+4 = 15.
	ADD A,$0F		; row = 15 + (LEVEL-1)*2 => 15 / 17 / 19 / 21
	LD H,A			; row
	LD L,$1D		; column 29
	ENDIF
	CALL GetScrAddr		; HL = Vector screen address of the digit cell
	CALL HighlightChar
; UpdateLives: highlight the current LIVES digit
	LD A,(LIVES)		; Number of lives 1..4
	DEC A			; 0..3
	ADD A,A			; *2
	IFNDEF GEOM
	ADD A,$16		; column = 22 + (LIVES-1)*2 => 22 / 24 / 26 / 28
	LD L,A			; column
	LD H,$1B		; row 27
	ELSE
	ADD A,$18		; row = 24 + (LIVES-1)*2 => 24 / 26 / 28 / 30
	LD H,A			; row
	LD L,$1D		; column 29
	ENDIF
	CALL GetScrAddr		; HL = Vector screen address of the digit cell
	CALL HighlightChar
	ld (il_hl),hl	; Diver object address
	ld hl,DiverObj
	ld (z80_ix),hl
	ld hl,(il_hl)
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
	ld (il_a),a	; copy 14 bytes = 7 words
i80_ldir_10:
	ld a,(hl)
	ld (de),a
	inc hl
	inc de
	dec bc
	ld a,b
	or c
	jp nz,i80_ldir_10
	ld a,(il_a)
	LD A,(LEVEL)		; LEVEL
	LD C,A
	LD A,$05
	SUB C			; A = 5 - LEVEL => 4 / 3 / 2 / 1
	ld (DiverObj+$1C),a
	ld (DiverObj+$1E),a
	LD C,A
	LD A,$16
	SUB C			; A => 12 / 13 / 14 / 15
	ld (DiverObj+$1D),a
	ld (DiverObj+$1B),a
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
	cpl
	inc a
	ADD A,$04		; 3 / 2 / 1 / 0
	RET Z
	LD B,A			; B = loop counter
	XOR A
LDC01	ADD A,50		; +50
	dec b
	jp nz,LDC01
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

; Адрес байта полосы и маска пикселя.
; I: A = номер пикселя 0..127, DE = база полосы
; O: HL = адрес байта, A = маска пикселя
; Портит A, BC, HL; DE цело.
	IFNDEF GEOM		; горизонтальные шкалы — только в сборке с нижним HUD
GaugeByte
	ld b,a			; сохранить номер пикселя
	and $07			; номер бита внутри байта
	ld c,a
	ld a,b
	rrca
	rrca
	rrca
	and $1F			; A = пиксель >> 3 = смещение столбца полосы
	add a,d			; + столбец базы
	ld b,a			; b = hi адреса байта
	push bc
	ld b,$00
	ld hl,GaugeMask
	add hl,bc		; маску берём из таблицы, а не крутим цикл сдвигов
	ld a,(hl)
	pop bc
	ld h,b			; hi = столбец полосы
	ld l,e			; lo = верхняя строка полосы
	ret
GaugeMask
	DEFB $80,$40,$20,$10,$08,$04,$02,$01

; Зажечь один пиксель полосы (высота 4 строки).
; I: A = номер пикселя 0..127, DE = база полосы. BC и DE сохраняются.
GaugeSet
	push bc
	call GaugeByte
	ld c,a			; c = маска
	ld b,$04		; высота полосы 4 строки
GaugeSet_1
	ld a,(hl)
	or c
	ld (hl),a
	dec l			; строка ниже
	dec b
	jp nz,GaugeSet_1
	pop bc
	ret

; Погасить один пиксель полосы.
; I: A = номер пикселя 0..127, DE = база полосы. BC и DE сохраняются.
GaugeClr
	push bc
	call GaugeByte
	cpl
	ld c,a			; c = ~маска
	ld b,$04
GaugeClr_1
	ld a,(hl)
	and c
	ld (hl),a
	dec l
	dec b
	jp nz,GaugeClr_1
	pop bc
	ret

; Обновить полосу-индикатор.
; I: A  = новое значение 0..127 (столько пикселей полосы должно гореть)
;    DE = база полосы
;    HL = адрес ячейки прошлого значения (1 байт)
; Рисуем ИНКРЕМЕНТАЛЬНО, только разницу: обычно это один пиксель = 4 обращения
; к экрану. Полная перерисовка стоила бы 128 пикселей * 4 строки = 512
; обращений на каждое изменение и съела бы темп.
UpdateGauge
	ld b,a			; B = новое значение
	ld c,(hl)		; C = прошлое значение
	ld (hl),b		; новое запоминаем сразу, HL дальше не нужен
	ld a,b
	cp c
	ret z			; самый частый случай: ничего не изменилось
	jp c,UpdateGauge_dn
UpdateGauge_up			; C < B: зажечь пиксели C .. B-1
	ld a,c
	call GaugeSet
	inc c
	ld a,b
	cp c
	jp nz,UpdateGauge_up
	ret
UpdateGauge_dn			; C > B: погасить пиксели B .. C-1
	dec c
	ld a,c
	call GaugeClr
	ld a,b
	cp c
	jp nz,UpdateGauge_dn
	ret
	ELSE
; ШКАЛА ОРИГИНАЛА, восстановлена один в один из исходников Зимина.
; Вход: HL = адрес прошлого положения ползунка, DE = база, A = 0..127.
; Стирает четыре байта на старом месте, считает HL = база - A, рисует четыре
; байта $FF. Ползунок едет вниз по мере роста значения: строка = 92 + A.
; sbc hl,de у Зимина — опкод Z80, здесь развёрнуто через аккумулятор.
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
	ex de,hl		; HL = база шкалы
	ld e,a
	ld d,$00
	ld a,l
	sub e
	ld l,a
	ld a,h
	sbc a,d
	ld h,a
	inc l
	ld (hl),$FF
	inc l
	ld (hl),$FF
	dec l
	dec l
	ld (hl),$FF
	dec l
	ld (hl),$FF
	inc l
	ret
	ENDIF

; Update Depth indicator
UpdateDepth
	LD A,(L5B03+1)		; get screen position on mini-map, row value
UpdateDepth1
	IFNDEF GEOM
	add a,a
	add a,a
	AND $7F			; 0..127
	LD DE,GAUGE_DEPTH
	LD HL,LDE55
	jp UpdateGauge		; полоса растёт вместе с глубиной
	ELSE
	LD HL,(LDE55)
	LD DE,GAUGE_DEPTH
	add a,a
	add a,a
	AND $7F			; 0..127
	CALL UpdateGauge
	LD (LDE55),HL
	RET
	ENDIF

	IFNDEF GEOM
LDE55	DEFB $00	; прошлое значение полосы DEPTH
LDE57	DEFB $00	; прошлое значение полосы OXYGEN
	ELSE
LDE55	DEFW GAUGE_DEPTH	; адрес ползунка DEPTH
LDE57	DEFW GAUGE_OXY		; адрес ползунка OXYGEN
	ENDIF
LDE59	DEFW $0000	; Lives indicator, address in screen attributes (мёртвая)
OXYGEN	DEFW $FFFF	; Oxygen level

; Update Oxygen indicator
; I: HL = new value for Oxygen
UpdateOxygen
	LD (OXYGEN),HL
	LD A,H
	and a
	rra
	LD H,A
	LD A,$7F		; 0..127
	SUB H			; A = СКОЛЬКО кислорода израсходовано
	CP $0E
	jp C,LDE7E
	CALL LE645		; Play melody LE629
	IFNDEF GEOM
LDE7E	xor $7F			; полоса показывает ОСТАТОК, а не расход: 127 - A
	LD DE,GAUGE_OXY
	LD HL,LDE57
	jp UpdateGauge
	ELSE
LDE7E	LD HL,(LDE57)
	LD DE,GAUGE_OXY
	CALL UpdateGauge
	LD (LDE57),HL
	RET
	ENDIF

; Print decimal number
; I: HL = number to print
; I: DE = address on the screen
PrintDec
	ld (il_a),a
	ld a,b
	ld (DiverObj+$23),a
	ld a,(il_a)
	PUSH DE
	ld (il_hl),hl	; address for list of dividers: 10000, 1000, 100, 10, 1
	ld hl,LE5E0
	ld (z80_iy),hl
	ld hl,(il_hl)
LDE8D	LD C,$FF
	call z80_lde_Y
	defb $00
	call z80_ldd_Y	; get divider in DE
	defb $01
	ld (il_a),a
	ld a,D
	and 1<<(7)
	ld a,(il_a)
	jp Z,LDEA0
	ld (il_a),a
	ld a,d
	ld (DiverObj+$23),a
	ld a,(il_a)
	LD C,$00
	jp LDEB6
LDEA0	INC C
	OR A
	ld (il_a),a
	ld a,l
	sbc a,e
	ld l,a
	ld a,h
	sbc a,d
	ld h,a
	ld a,(il_a)
	jp NC,LDEA0
	ADD HL,DE
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
	ld a,(DiverObj+$23)
	OR A
	jp Z,LDEB6
	ld (il_hl),hl
	ld hl,DiverObj+$23
	dec (hl)
	ld hl,(il_hl)
	jp LDE8D
LDEB6	EX (SP),HL
	EX DE,HL
	LD B,$00
	ld (il_a),a
	ld a,C
	and a
	rla
	ld C,a
	ld a,(il_a)
	ld (il_a),a
	ld a,C
	and a
	rla
	ld C,a
	ld a,(il_a)
	ld (il_a),a
	ld a,C
	and a
	rla
	ld C,a
	ld a,(il_a)
	LD HL,ROM_CHARSET+$80		; ZX Charset (3D00) + $80 = address of char '0'
	ADD HL,BC
	LD B,$08		; repeat 8 times
	PUSH DE
LDEC7	LD A,(HL)
	LD (DE),A
	INC HL
	dec e ;INC D
	dec b
	jp nz,LDEC7
	POP DE
	inc d ;INC E
	EX DE,HL
	EX (SP),HL
	ld (il_a),a
	ld a,(DiverObj+$23)
	and 1<<(7)
	ld a,(il_a)
	jp Z,LDE8D
	POP DE
	RET

; Print high score number
PrintHighScore
	LD B,$00
	LD HL,(HISCORE)
	IFNDEF GEOM
	LD DE,$C637
	ELSE
	LD DE,$D9AF		; панель оригинала: HIGH
	ENDIF		; строка 25, столбец 6 — 6 цифр HIGH (подпись уехала на столбец 1)
	CALL PrintDec		; Print decimal number
	RET

; Print score number
PrintScore
	LD B,$00
	LD HL,(SCORE)		; get Score number
	IFNDEF GEOM
	LD DE,$D637
	ELSE
	LD DE,$D99F		; панель оригинала: SCORE
	ENDIF		; строка 25, столбец 22 — 6 цифр SCORE
	CALL PrintDec		; Print decimal number
	RET

; Print HELD number
PrintHeld
	LD B,$02
	LD HL,(HELD)		; get HELD value
	IFNDEF GEOM
	LD DE,$C62F
	ELSE
	LD DE,$DA8F		; панель оригинала: HELD
	ENDIF		; строка 26, столбец 6 — 4 цифры HELD
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
	ld (il_hl),hl
	ld hl,(L5B35)
	ld e,l
	ld d,h
	ld hl,(il_hl)
	LD (L5B35),HL
	ld (il_a),a
	ld a,e
	ld (LB7B9),a
	ld a,d
	ld (LB7B9+1),a
	ld a,(il_a)
	ld (il_hl),hl
	ld hl,LDF01
	ld (z80_iy),hl
	ld hl,(il_hl)
	LD HL,LDF11
	LD (LDF0F),HL
	ld a,(DiverObj+$09)
	ld (DiverObj+$0B),a
	ld a,(DiverObj+$0A)
	ld (DiverObj+$0C),a
	ld (il_a),a
	ld a,(DiverObj+$10)
	and 1<<(7)
	ld a,(il_a)
	jp Z,LE021
	ld a,(DiverObj+$06)	; get Angle 0..15
	ADD A,A
	LD C,A
	LD B,$00
	LD HL,AngleToDXDY	; Table base address
	ADD HL,BC
	LD A,(HL)		; get DX value for the Angle
	ld (DiverObj+$04),a	; set DX value
	INC HL
	LD A,(HL)		; get DY value for the Angle
	ld (DiverObj+$05),a	; set DY value
	ld (il_a),a	; check "moving" bit
	ld a,(DiverObj+$10)
	and 1<<(0)
	ld a,(il_a)
	jp NZ,LE021
	ld (il_a),a	; clear DX value
	ld a,$00
	ld (DiverObj+$04),a
	ld a,(il_a)
	ld (il_a),a	; clear DY value
	ld a,$00
	ld (DiverObj+$05),a
	ld a,(il_a)
LE021:
	ld a,(DiverObj+$13)	; get X value
	LD HL,(L5B03)		; get Screen position on mini-map
	ld (il_hl),hl	; add DX
	ld hl,DiverObj+$04
	add a,(hl)
	ld hl,(il_hl)
	ld (DiverObj+$13),a	; set X value
	and a
	rra
	AND $07			; 0..7
	ld (il_hl),hl	; compare to previous X shift
	ld hl,DiverObj+$02
	cp (hl)
	ld hl,(il_hl)
	ld (DiverObj+$15),a	; set X shift
	jp Z,LE08D
	CP $01
	jp Z,LE068
	CP $07
	jp NZ,LE08D
	ld (il_a),a	; check DX sign - moving left?
	ld a,(DiverObj+$04)
	and 1<<(7)
	ld a,(il_a)
	jp Z,LE08D
	ld (il_a),a
	ld a,(DiverObj+$11)
	and 1<<(7)
	ld a,(il_a)
	jp Z,LE08D
	ld (il_hl),hl	; one column left
	ld hl,DiverObj+$00
	dec (hl)
	ld hl,(il_hl)
	push af
	ld a,(DiverObj+$0D)
	and (~(1<<(4)))&255
	ld (DiverObj+$0D),a
	pop af
	ld a,(DiverObj+$00)	; get column 0..255
	ld (il_hl),hl
	ld hl,DiverObj+$1C
	cp (hl)
	ld hl,(il_hl)
	jp NC,LE08D
	ADD A,$08
	rst 20h	; = call z80_sta_X
	defb $00
	rst 30h	; = call z80_setX
	defb $10
	defb 1<<(2)
	DEC L
	jp LE08D
LE068:
	ld (il_a),a	; check DX sign - moving left?
	ld a,(DiverObj+$04)
	and 1<<(7)
	ld a,(il_a)
	jp NZ,LE08D
	ld (il_a),a
	ld a,(DiverObj+$11)
	and 1<<(7)
	ld a,(il_a)
	jp NZ,LE08D
	ld (il_hl),hl	; one column right
	ld hl,DiverObj+$00
	inc (hl)
	ld hl,(il_hl)
	push af
	ld a,(DiverObj+$0D)
	and (~(1<<(4)))&255
	ld (DiverObj+$0D),a
	pop af
	ld a,(DiverObj+$00)	; get column 0..255
	ld (il_hl),hl
	ld hl,DiverObj+$1B
	cp (hl)
	ld hl,(il_hl)
	jp C,LE08D
	SUB $08
	ld (DiverObj+$00),a	; set column
	push af
	ld a,(DiverObj+$10)
	or 1<<(2)
	ld (DiverObj+$10),a
	pop af
	INC L
LE08D:
	ld a,(DiverObj+$14)	; get Y value
	ld (il_hl),hl	; add DY
	ld hl,DiverObj+$05
	add a,(hl)
	ld hl,(il_hl)
	ld (DiverObj+$14),a	; set Y value
	and a
	rra
	AND $07			; 0..7
	ld (il_hl),hl	; compare to previous Y shift
	ld hl,DiverObj+$03
	cp (hl)
	ld hl,(il_hl)
	ld (DiverObj+$16),a
	JP Z,LE120
	CP $01
	jp Z,LE0EA
	CP $07
	JP NZ,LE120
	ld (il_a),a	; check DY sign - moving up?
	ld a,(DiverObj+$05)
	and 1<<(7)
	ld a,(il_a)
	jp Z,LE120
	call z80_bitX
	defb $12
	and 1<<(7)
	ld a,(il_a)
	jp Z,LE120
	call z80_lda_X
	defb $1A
	call z80_cp_X
	defb $28
	jp NZ,LE0CC
	call z80_lda_X_3
	rst 20h	; = call z80_sta_X
	defb $16
	ADD A,A
	rst 20h	; = call z80_sta_X
	defb $14
	jp LE120
LE0CC:
	call z80_dec_X	; one row up
	defb $01
	call z80_dec_X
	defb $1A
	call z80_resX
	defb $0D
	defb (~(1<<(3)))&255
	call z80_lda_X	; get row 0..255
	defb $01
	call z80_cp_X
	defb $1E
	jp NC,LE120
	ADD A,$08
	rst 20h	; = call z80_sta_X
	defb $01
	DEC H			; one block up
	rst 30h	; = call z80_setX
	defb $10
	defb 1<<(2)
	jp LE120
LE0EA:
	ld (il_a),a	; check DY sign - moving up?
	ld a,(DiverObj+$05)
	and 1<<(7)
	ld a,(il_a)
	jp NZ,LE120
	ld (il_a),a
	ld a,(DiverObj+$12)
	and 1<<(7)
	ld a,(il_a)
	jp NZ,LE120
	ld (il_hl),hl
	ld hl,DiverObj+$01
	inc (hl)
	ld hl,(il_hl)
	ld (il_hl),hl
	ld hl,DiverObj+$1A
	inc (hl)
	ld hl,(il_hl)
	ld (il_a),a
	ld a,(DiverObj+$26)
	and 1<<(5)
	ld a,(il_a)
	jp NZ,LE10A
	ld a,(DiverObj+$1A)
	CP $46
	CALL Z,LE9B0		; => plus one live
LE10A:
	push af
	ld a,(DiverObj+$0D)
	and (~(1<<(3)))&255
	ld (DiverObj+$0D),a
	pop af
	ld a,(DiverObj+$01)	; get row 0..255
	ld (il_hl),hl
	ld hl,DiverObj+$1D
	cp (hl)
	ld hl,(il_hl)
	jp C,LE120
	SUB $08
	rst 20h	; = call z80_sta_X
	defb $01
	INC H			; one block down
	rst 30h	; = call z80_setX
	defb $10
	defb 1<<(2)
LE120:
	ld a,(DiverObj+$0D)
	AND $18
	CP $18
	jp Z,LE174
	ld (il_a),a
	ld a,(DiverObj+$10)
	and 1<<(2)
	ld a,(il_a)
	jp Z,LE171
	push af
	ld a,(DiverObj+$0D)
	and (~(1<<(1)))&255
	ld (DiverObj+$0D),a
	pop af
	ld (il_hl),hl
	ld hl,(z80_ix)
	push hl
	ld hl,(il_hl)
	ld (il_hl),hl
	ld hl,(z80_iy)
	push hl
	ld hl,(il_hl)
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
	ld (il_hl),hl
	ld hl,(L5B35)
	ld e,l
	ld d,h
	ld hl,(il_hl)
	ld (il_a),a
	ld a,e
	ld (LB7B9),a
	ld a,d
	ld (LB7B9+1),a
	ld a,(il_a)
	LD (L5B35),HL
	CALL LBDBA
	LD HL,(LB7B9)
	ld (il_hl),hl
	ld hl,(L5B35)
	ld e,l
	ld d,h
	ld hl,(il_hl)
	ld (il_a),a
	ld a,e
	ld (LB7B9),a
	ld a,d
	ld (LB7B9+1),a
	ld a,(il_a)
	LD (L5B35),HL
	ld (il_hl),hl
	pop hl
	ld (z80_iy),hl
	ld hl,(il_hl)
	ld (il_hl),hl
	pop hl
	ld (z80_ix),hl
	ld hl,(il_hl)
	push af
	ld a,(DiverObj+$10)
	and (~(1<<(2)))&255
	ld (DiverObj+$10),a
	pop af
	jp LE174
LE171	CALL LB3AB
LE174:
	push af
	ld a,(DiverObj+$0D)
	or 1<<(4)
	ld (DiverObj+$0D),a
	pop af
	push af
	ld a,(DiverObj+$0D)
	or 1<<(3)
	ld (DiverObj+$0D),a
	pop af
	ld (il_a),a	; get DX value
	ld a,(DiverObj+$04)
	ld e,a
	ld a,(il_a)
	ld a,(DiverObj+$15)	; get X shift 0..7
	ld (il_hl),hl	; compare to previous X shift
	ld hl,DiverObj+$02
	cp (hl)
	ld hl,(il_hl)
	jp Z,LE18D
	ld (DiverObj+$02),a	; set previous X shift
	ld (il_a),a
	ld a,e
	ld (DiverObj+$11),a
	ld a,(il_a)
LE18D:
	ld (il_a),a	; get DY value
	ld a,(DiverObj+$05)
	ld e,a
	ld a,(il_a)
	ld a,(DiverObj+$16)	; get Y shift 0..7
	ld (il_hl),hl	; compare to previous Y shift
	ld hl,DiverObj+$03
	cp (hl)
	ld hl,(il_hl)
	jp Z,LE19E
	ld (il_a),a
	ld a,e
	ld (DiverObj+$12),a
	ld a,(il_a)
	ld (DiverObj+$03),a	; set previous Y shift
LE19E:
	ld (il_a),a
	ld a,(DiverObj+$10)
	and 1<<(7)
	ld a,(il_a)
	jp NZ,LE1B8
	ld a,(DiverObj+$24)
	ld (DiverObj+$09),a
	ld (DiverObj+$0B),a
	ld a,(DiverObj+$25)
	ld (DiverObj+$0A),a
	ld (DiverObj+$0C),a
	jp LE1F4
LE1B8:
	ld (il_a),a
	ld a,(DiverObj+$10)
	and 1<<(4)
	ld a,(il_a)
	jp NZ,LE1C4
	ld (il_a),a
	ld a,(DiverObj+$10)
	and 1<<(5)
	ld a,(il_a)
	jp Z,LE1D2
LE1C4:
	ld a,(DiverObj+$09)
	ld (DiverObj+$0B),a
	ld a,(DiverObj+$0A)
	ld (DiverObj+$0C),a
	jp LE1F4
LE1D2:
	ld (il_hl),hl
	ld hl,DiverObj+$17
	inc (hl)
	ld hl,(il_hl)
	IFNDEF EVICT
	ld (il_a),a	; get Angle 0..15
	ld a,(DiverObj+$06)
	ld h,a
	ld a,(il_a)
	ld a,(DiverObj+$17)
	AND $03			; 0..3
	RRCA
	RRCA
	LD L,A
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
	LD DE,SprDiver0		; Diver sprites base address
	ADD HL,DE		; now HL = diver sprite address
	ELSE
; АДРЕС КАДРА В ЗОНЕ. Массив выселен: угол = 128 Б = ДВА смежных ломтя, фазы 0,1
; в первом, 2,3 во втором. Значит номер угла уходит в СТАРШИЙ байт удвоенным, а
; младший собирается из фазы:
;	hi = ряд + 2*угол + (фаза>>1)
;	lo = 192 + 32*(фаза&1)
; Ряда два (свободные страницы зоны разорваны буферами пула), выбор ряда — одно
; сравнение. Штатный путь считал то же самое сдвигом ПАРЫ вправо, а сдвиг пары в
; i8080 — это 16 команд с сохранением A через il_a; здесь его нет вовсе, поэтому
; правка выходит ДЕШЕВЛЕ штатной: 39 байт и 163 такта против 41 и 181.
	ld (il_a),a
	ld a,(DiverObj+$06)	; угол 0..15
	add a,a			; 2*угол — угол занимает две страницы
	ld h,a
	ld a,(DiverObj+$17)
	and 2			; старший бит фазы -> вторая страница угла
	rrca
	add a,h
	cp 16			; углы 0..7 — ряд A, углы 8..15 — ряд B
	jp c,DvSprRowA
	add a,DIVER_ROWB
DvSprRowA:
	add a,DIVER_A
	ld h,a
	ld a,(DiverObj+$17)
	and 1			; младший бит фазы -> вторая половина ломтя
	rrca
	rrca
	rrca			; 0 или 32
	or 192			; ломоть — это младшие 192..255 страницы
	ld l,a
	ld a,(il_a)
	ENDIF
DvSprCalc:			; метка для замеров: здесь HL = адрес кадра дайвера
	ld (il_a),a
	ld a,h
	ld (DiverObj+$0A),a
	ld a,(il_a)
	ld (il_a),a
	ld a,h
	ld (DiverObj+$0C),a
	ld a,(il_a)
	ld (il_a),a
	ld a,l
	ld (DiverObj+$09),a
	ld a,(il_a)
	ld (il_a),a
	ld a,l
	ld (DiverObj+$0B),a
	ld a,(il_a)
LE1F4	CALL LB3A6
	ld a,(DiverObj+$01)
	ld (DiverObj+$19),a	; set Row
	ld (il_hl),hl
	ld hl,(LB7B9)
	ld (z80_iy),hl
	ld hl,(il_hl)
	ld (il_a),a
	ld a,(DiverObj+$08)
	ld d,a
	ld a,(il_a)
	ld (il_a),a
	ld a,(DiverObj+$07)
	ld e,a
	ld a,(il_a)
	ld (il_a),a
	ld a,(DiverObj+$0D)
	and 1<<(0)
	ld a,(il_a)
	jp NZ,LE211
	ld (il_hl),hl	; empty sprite address
	ld hl,LA41B
	ld (z80_iy),hl
	ld hl,(il_hl)
LE211:
	ld (il_a),a
	ld a,(DiverObj+$0D)
	and 1<<(1)
	ld a,(il_a)
	jp NZ,LE21A
	LD DE,LA41B		; empty sprite address
LE21A	LD B,$03		; loop 3 times
LE21C	PUSH BC
	ld a,(DiverObj+$00)
	ld (DiverObj+$18),a	; set Column
	LD L,A
	ld (il_a),a	; get Row
	ld a,(DiverObj+$19)
	ld h,a
	ld a,(il_a)
	CALL GetScrAddrF		; поле: столбцы 0..23 -> экранные 4..27
	LD B,$03		; loop 3 times
LE22C	PUSH BC
	PUSH HL
	ld (il_hl),hl
	ld hl,(z80_iy)
	push hl
	ld hl,(il_hl)
	PUSH DE
	LD B,$08		; loop 8 times
; ЭТАП E.2: цикл вывода ныряльщика. Было ~660 тактов на байт: два вызова
; хелпера, читающие ОДИН И ТОТ ЖЕ байт (IY+$00), плюс три раскрытия INC IY по
; 69 тактов каждое. Стало ~175.
; Что использовано: байт маски читается ОДИН раз и держится в A через push af
; (на редком пути его затирает работа с DiverObj); указатель маски шагает сразу
; на 3 прямо в HL, под push hl / pop hl, потому что HL занят экраном.
LE233	LD A,(DE)
	XOR (HL)
	LD C,A			; C = t = буфер XOR экран
	push hl			; HL занят экраном — одолжим его под указатель маски
	ld hl,(z80_iy)
	ld a,(hl)		; A = маска, было: AND (IY+$00) и LD A,(IY+$00) — ДВА чтения
	inc hl
	inc hl
	inc hl			; было: три INC IY по 69 тактов
	ld (z80_iy),hl
	pop hl
	push af			; маску надо будет ещё раз — на редком пути её затрут
	and c			; было: AND (IY+$00)
	jp Z,LE23F
	push af
	ld a,(DiverObj+$10)
	or 1<<(1)
	ld (DiverObj+$10),a
	pop af
LE23F:
	pop af			; A = маска
	XOR C
	LD (HL),A
	dec l ;INC H
	INC DE
	INC DE
	INC DE
	dec b
	jp nz,LE233
	ld (il_hl),hl	; one Column right
	ld hl,DiverObj+$18
	inc (hl)
	ld hl,(il_hl)
	ld (il_a),a
	ld a,(DiverObj+$10)
	and 1<<(1)
	ld a,(il_a)
	jp Z,LE26E
	LD HL,(LDF0F)
	ld a,(DiverObj+$19)	; get Row
	LD (HL),A
	INC HL
	ld a,(DiverObj+$18)	; get Column
	DEC A
	LD (HL),A
	INC HL
	LD (LDF0F),HL
	push af
	ld a,(DiverObj+$10)
	and (~(1<<(1)))&255
	ld (DiverObj+$10),a
	pop af
LE26E	POP DE
	INC DE
	ld (il_hl),hl
	pop hl
	ld (z80_iy),hl
	ld hl,(il_hl)
	ld (il_hl),hl
	ld hl,(z80_iy)
	inc hl
	ld (z80_iy),hl
	ld hl,(il_hl)
	POP HL
	inc h ;INC HL
	POP BC
	dec b
	jp nz,LE22C
	ld (il_hl),hl	; one Row down
	ld hl,DiverObj+$19
	inc (hl)
	ld hl,(il_hl)
	LD BC,$0015
	ld (il_hl),hl
	ld hl,(z80_iy)
	add hl,bc
	ld (z80_iy),hl
	ld hl,(il_hl)
	EX DE,HL
	ADD HL,BC
	EX DE,HL
	POP BC
	dec b
	jp nz,LE21C
	LD HL,(LB7B9)
	ld (il_hl),hl
	ld hl,(L5B35)
	ld c,l
	ld b,h
	ld hl,(il_hl)
	ld (il_a),a
	ld a,(DiverObj+$08)
	ld d,a
	ld a,(il_a)
	ld (il_a),a
	ld a,(DiverObj+$07)
	ld e,a
	ld a,(il_a)
	ld (il_a),a
	ld a,c
	ld (LB7B9),a
	ld a,b
	ld (LB7B9+1),a
	ld a,(il_a)
	ld (il_a),a
	ld a,e
	ld (L5B35),a
	ld a,d
	ld (L5B35+1),a
	ld a,(il_a)
	ld (il_a),a
	ld a,h
	ld (DiverObj+$08),a
	ld a,(il_a)
	ld (il_a),a
	ld a,l
	ld (DiverObj+$07),a
	ld a,(il_a)
	LD HL,(LDF0F)
	LD (HL),$FF
	RET

LE2A8:
	ld (il_hl),hl	; Diver object address
	ld hl,DiverObj
	ld (z80_ix),hl
	ld hl,(il_hl)
	ld (il_hl),hl
	ld hl,DiverObj+$0F
	dec (hl)
	ld hl,(il_hl)
	jp NZ,LE2CC
	ld a,(DiverObj+$0E)	; get speed factor
	ld (DiverObj+$0F),a
	push af
	ld a,(DiverObj+$0D)
	and (~(1<<(1)))&255
	ld (DiverObj+$0D),a
	pop af
	ld (il_a),a
	ld a,(DiverObj+$0D)
	and 1<<(0)
	ld a,(il_a)
	jp Z,LE2C5
	push af
	ld a,(DiverObj+$0D)
	or 1<<(1)
	ld (DiverObj+$0D),a
	pop af
LE2C5:
	push af
	ld a,(DiverObj+$0D)
	or 1<<(0)
	ld (DiverObj+$0D),a
	pop af
	CALL LDFD5
LE2CC:
	ld (il_hl),hl
	ld hl,DiverObj+$20
	dec (hl)
	ld hl,(il_hl)
	RET NZ
	ld (il_a),a
	ld a,$14
	ld (DiverObj+$20),a
	ld a,(il_a)
	CALL ReadKeyboard	; Read keyboard input
	CALL LE364
	RET

; Read keyboard input
; I: IX = Diver object address = DiverObj
ReadKeyboard
	ei ;HACK to make keyboard working
	call z80_bitX
	defb $10
	and 1<<(3)
	ld a,(il_a)
	RET NZ
	call DecodeKeyboard
	ld d,a
	call z80_lde_X	; get Angle
	defb $06
;	LD BC,(L5B38)		; get port for Clockwise key
;	LD A,(L5B3A)		; get bit mask for Clockwise key
;	LD D,A
;	IN A,(C)		; read the port for Clockwise key
;	AND D
	ld (il_a),a
	and 1<<(2)
	ld a,(il_a)
	jp z,LE2F1	;JR NZ,LE2F1		; not pressed => skip rotate
; Clockwise key pressed
	INC E			; rotate clockwise
LE2F1	;LD BC,(L5B3B)		; get port for Anticlockwise key
;	LD A,(L5B3D)		; get bit mask for Anticlockwise key
;	LD D,A
;	IN A,(C)		; read the port for Anticlockwise key
;	AND D
	ld (il_a),a
	and 1<<(1)
	ld a,(il_a)
	jp z,LE2FF	;JR NZ,LE2FF		; not pressed => skip rotate
; Anticlockwise key pressed
	DEC E			; rotate anticlockwise
LE2FF	LD A,$0F
	AND E
	rst 20h	; = call z80_sta_X
	defb $06
;	LD BC,(L5B3E)		; get port for Accelerate key
;	LD A,(L5B40)		; get bit mask for Accelerate key
;	LD D,A
;	IN A,(C)		; read the port for Accelerate key
;	AND D
	ld (il_a),a
	ld a,d
	and 1<<(3)
	ld a,(il_a)
	jp z,LE31F	;JR NZ,LE31F		; not pressed => skip
; Accelerate key pressed
	ld a,(DiverObj+$0E)
	push af	; set "moving" bit
	ld a,(DiverObj+$10)
	or 1<<(0)
	ld (DiverObj+$10),a
	pop af
	CP $08
	RET Z
	ld (il_hl),hl
	ld hl,DiverObj+$0E
	dec (hl)
	ld hl,(il_hl)
LE31F	;LD BC,(L5B41)		; get port for Decelerate key
	;LD A,(L5B43)		; get bit mask for Decelerate key
	;LD D,A
	;IN A,(C)		; read the port for Decelerate key
	;AND D
	ld (il_a),a
	ld a,d
	and 1<<(0)
	ld a,(il_a)
	ret z ;RET NZ			; not pressed => return
; Decelerate key pressed
	ld a,(DiverObj+$0E)
	CP $14
	jp NZ,LE337
	push af	; clear "moving" bit - diver stopped
	ld a,(DiverObj+$10)
	and (~(1<<(0)))&255
	ld (DiverObj+$10),a
	pop af
	RET
LE337:
	ld (il_hl),hl
	ld hl,DiverObj+$0E
	inc (hl)
	ld hl,(il_hl)
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
LE364:
	ld (il_a),a
	ld a,(DiverObj+$10)
	and 1<<(5)
	ld a,(il_a)
	RET NZ
	ld (il_a),a
	ld a,(DiverObj+$10)
	and 1<<(7)
	ld a,(il_a)
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
	ld (il_a),a	; HL = [Oxygen] - LEVEL * 8 - 10
	ld a,l
	sbc a,e
	ld l,a
	ld a,h
	sbc a,d
	ld h,a
	ld a,(il_a)
	LD (OXYGEN),HL		; set Oxygen level
	CP H
	CALL NZ,UpdateOxygen	; => Update Oxygen indicator
  ENDIF
	LD A,(OXYGEN+1)		; get Oxygen high byte
	AND $F0			; out of Oxygen?
	jp NZ,LE393
	CALL DiverExplosion	; Diver explosion
	RET
LE393:
	ld a,(DiverObj+$22)
	OR A
	jp Z,LE39C
	call z80_inc_X
	defb $22
LE39C:
	ld (il_a),a
	ld a,(DiverObj+$10)
	and 1<<(4)
	ld a,(il_a)
	CALL NZ,LE41B
	LD HL,LDF11
LE3A6	LD A,(HL)
	CP $FF
	RET Z
	ld (il_a),a
	ld a,(DiverObj+$10)
	and 1<<(7)
	ld a,(il_a)
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
	call z80_bitX
	defb $10
	and 1<<(4)
	ld a,(il_a)
	jp NZ,LE418
	call z80_lda_X
	defb $22
	CP $FF
	jp NZ,LE3D2
;
LE3CD	CALL DiverExplosion	; Diver explosion
	jp LE418
LE3D2	OR A
	jp NZ,LE418
	rst 30h	; = call z80_setX
	defb $10
	defb 1<<(3)
	rst 28h	; = call z80_stn_X
	defb $0E
	defb $0A
	call z80_resX	; clear "moving" bit
	defb $10
	defb (~(1<<(0)))&255
	rst 30h	; = call z80_setX
	defb $10
	defb 1<<(4)
	call z80_lda_X	; get Angle 0..15
	defb $06
	INC A
	AND $0C			; 0 / 4 / 8 / 12
	ADD A,A			; 0 / 8 / 16 / 24
	ADD A,A			; 0 / 16 / 32 / 48
	ADD A,A			; 0 / 32 / 64 / 96
	LD C,A
	LD B,$00
	LD HL,SprDrowned	; Base address for 4 sprites of drowned diver
	ADD HL,BC
	call z80_stl_X
	defb $09
	call z80_stl_X
	defb $0B
	call z80_sth_X
	defb $0A
	call z80_sth_X
	defb $0C
	rst 28h	; = call z80_stn_X
	defb $21
	defb $E6
	LD HL,$0000
	LD (HELD),HL		; reset HELD value
	CALL PrintHeld		; Print HELD number
	call z80_resX
	defb $10
	defb (~(1<<(6)))&255
	LD HL,LE604		; Melody address
	CALL PlayMelody		; Play melody
;
LE418	POP HL
	jp LE3A6

; I: IX = Diver object record address
LE41B:
	call z80_inc_X
	defb $21
	RET NZ
	call z80_lda_X	; get Angle
	defb $06
	ADD A,$08		; rotate 180 degree
	AND $0F			; 0..15
	rst 20h	; = call z80_sta_X
	defb $06
	rst 28h	; = call z80_stn_X
	defb $22
	defb $F5
	call z80_resX
	defb $10
	defb (~(1<<(4)))&255
	call z80_resX
	defb $10
	defb (~(1<<(3)))&255
	rst 28h	; = call z80_stn_X
	defb $0E
	defb $14
	RET

; Diver explosion
; I: IX = Diver object address = DiverObj
DiverExplosion
	ld (il_a),a
	ld a,(DiverObj+$26)
	and 1<<(3)
	ld a,(il_a)
	RET NZ
	push af
	ld a,(DiverObj+$10)
	or 1<<(5)
	ld (DiverObj+$10),a
	pop af
	push af
	ld a,(DiverObj+$10)
	or 1<<(3)
	ld (DiverObj+$10),a
	pop af
	push af	; clear "moving" bit
	ld a,(DiverObj+$10)
	and (~(1<<(0)))&255
	ld (DiverObj+$10),a
	pop af
	ld a,(DiverObj+$06)	; get Angle 0..15
	INC A
	LD HL,SprExplosion	; Explosion sprite address
	LD BC,$0020		; 32
	ld (il_a),a
	and 1<<(2)
	ld a,(il_a)
	jp Z,LE45A
	ADD HL,BC		; use the other explosion sprite
LE45A:
	ld (il_a),a
	ld a,l
	ld (DiverObj+$09),a
	ld a,(il_a)
	ld (il_a),a	; set sprite address
	ld a,l
	ld (DiverObj+$0B),a
	ld a,(il_a)
	ld (il_a),a
	ld a,h
	ld (DiverObj+$0A),a
	ld a,(il_a)
	ld (il_a),a	; set sprite address
	ld a,h
	ld (DiverObj+$0C),a
	ld a,(il_a)
	LD HL,LE61C		; Melody address
	CALL PlayMelody		; Play melody
	LD HL,$0000
	LD (HELD),HL		; reset HELD value
	CALL PrintHeld		; Print HELD number
	RET

; Interact with object - like take Oxygen or pick up pearls
; I: IX = Diver object address = DiverObj
; I: HL = column and row
LE476:
	ld (il_hl),hl	; Table of objects on the screen
	ld hl,LB07D
	ld (z80_iy),hl
	ld hl,(il_hl)
LE47A:
	call z80_lda_Y	; get address hi
	defb $01
	CP $FF			; end of list marker?
	JP Z,LE915		; yes => exit
	call z80_ldd_Y	; get row
	defb $03
	call z80_lde_Y	; get column
	defb $02
	LD B,A			; record address hi (in LA27E table)
	call z80_ldc_Y	; record address lo
	defb $00
	LD A,(BC)		; get record flags
	ld (il_a),a	; check "oxygen" bit
	and 1<<(5)
	ld a,(il_a)
	jp Z,LE4B2	; not oxygen => jump
	LD A,D
	CP H			; same row?
	jp NZ,LE4AB	; no => jump
	LD A,E
	CP L			; same column?
	jp NZ,LE4AB	; no => jump
; We've got Oxygen object
	LD HL,(OXYGEN)		; get Oxygen level
	LD BC,$00C8		; 200
	ADD HL,BC
	jp NC,LE4A5
	LD HL,$FFFF		; maximum Oxygen
LE4A5	CALL UpdateOxygen	; Update Oxygen indicator
	JP LE418
LE4AB	LD BC,$0004
	ld (il_hl),hl	; next record in LB07D table
	ld hl,(z80_iy)
	add hl,bc
	ld (z80_iy),hl
	ld hl,(il_hl)
	jp LE47A	; continue the loop
LE4B2:
	ld (il_a),a	; check "chest" bit
	and 1<<(6)
	ld a,(il_a)
	JP Z,LE553		; no => jump
	LD A,H
	CP D			; same row?
	jp NZ,LE4AB
	LD A,L
	CP E			; same column?
	jp Z,LE4C3
	DEC A
	CP E			; previous column?
	jp NZ,LE4AB	; no => continue
; We've got Chest object
LE4C3:
	call z80_bitX
	defb $10
	and 1<<(6)
	ld a,(il_a)
	JP NZ,LE418
	call z80_bitX
	defb $10
	and 1<<(4)
	ld a,(il_a)
	JP NZ,LE418
	LD A,(BC)
	ld (il_a),a
	and 1<<(3)
	ld a,(il_a)
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
	ld (il_a),a
	ld a,l
	sbc a,c
	ld l,a
	ld a,h
	sbc a,b
	ld h,a
	ld a,(il_a)
	POP BC
	POP HL
	jp Z,LE4FB
	jp C,LE533
	jp LE509
LE4FB:
	ld (il_hl),hl	; get value 25 / 50 / 75 / 100 depending of LEVEL
	ld hl,(L5B33)
	ld c,l
	ld b,h
	ld hl,(il_hl)
	ld (il_a),a	; set HELD value
	ld a,c
	ld (HELD),a
	ld a,b
	ld (HELD+1),a
	ld a,(il_a)
	rst 30h	; = call z80_setX
	defb $10
	defb 1<<(6)
	jp LE510
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
	push af
	or 1<<(3)
	ld (il_a),a
	pop af
	ld a,(il_a)
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
	ld (il_a),a
	ld a,l
	sbc a,c
	ld l,a
	ld a,h
	sbc a,b
	ld h,a
	ld a,(il_a)
	LD A,L
	LD (DE),A
	INC DE
	LD A,H
	LD (DE),A
	LD HL,(L5B33)		; get value 25 / 50 / 75 / 100 depending of LEVEL
	LD (HELD),HL		; set HELD value
	rst 30h	; = call z80_setX
	defb $10
	defb 1<<(6)
	POP DE
	POP BC
	CALL PrintHeld		; Print HELD number
	CALL LE615		; Play melody LE60B
	JP LE418
; We've got a shell, big or small
LE553:
	ld (il_a),a	; check "big/small" bit
	and 1<<(1)
	ld a,(il_a)
	jp Z,LE5A9	; big => jump
	LD A,H
	CP D			; same row?
	JP NZ,LE4AB
	LD A,L
	CP E			; same column?
	JP NZ,LE4AB
; We've got small shell object
	call z80_bitX
	defb $10
	and 1<<(6)
	ld a,(il_a)
	JP NZ,LE418
	call z80_bitX
	defb $10
	and 1<<(4)
	ld a,(il_a)
	JP NZ,LE418
	LD A,(BC)
	ld (il_a),a
	and 1<<(3)
	ld a,(il_a)
	JP NZ,LE418
	LD HL,(L5B27)		; get value 2 / 4 / 6 / 8, depending on LEVEL
; Update HELD value; HL = value to add
LE578	LD A,(BC)
	ld (il_a),a
	and 1<<(4)
	ld a,(il_a)
	JP NZ,LE418
	PUSH BC
	CALL LE5D2		; DE = (L5B33) - HELD
	POP BC
	EX DE,HL
	OR A
	ld (il_a),a
	ld a,l
	sbc a,e
	ld l,a
	ld a,h
	sbc a,d
	ld h,a
	ld a,(il_a)
	JP C,LE418
	LD HL,(HELD)		; get HELD value
	ADD HL,DE
	LD (HELD),HL		; set HELD value
	LD A,(BC)
	push af
	or 1<<(4)
	ld (il_a),a
	pop af
	ld a,(il_a)
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
	jp Z,LE5B2
	INC A
	CP D			; next row?
	JP NZ,LE4AB
LE5B2	LD A,L
	CP E			; same column?
	jp Z,LE5BB
	DEC A
	CP E			; previous column?
	JP NZ,LE4AB
; We've got big shell object
LE5BB	LD A,(BC)
	ld (il_a),a
	and 1<<(3)
	ld a,(il_a)
	JP NZ,LE3C0
	LD A,L
	CP E
	JP NZ,LE418
	call z80_bitX
	defb $10
	and 1<<(6)
	ld a,(il_a)
	JP NZ,LE418
	LD HL,(L5B29)		; get value 5 / 10 / 15 / 20, depending on LEVEL
	jp LE578	; jump to update HELD value

; DE = (L5B33) - HELD
LE5D2:
	ld (il_hl),hl	; get HELD value
	ld hl,(HELD)
	ld c,l
	ld b,h
	ld hl,(il_hl)
	ld (il_hl),hl	; get value 25 / 50 / 75 / 100 depending of LEVEL
	ld hl,(L5B33)
	ld e,l
	ld d,h
	ld hl,(il_hl)
	EX DE,HL
	OR A
	ld (il_a),a
	ld a,l
	sbc a,c
	ld l,a
	ld a,h
	sbc a,b
	ld h,a
	ld a,(il_a)
	EX DE,HL		; DE = (L5B33) - HELD
	RET

; Dividers used to print decimal number
LE5E0	DEFW 10000,1000,100,10,1
	DEFB $FF,$FF

; Play melody
; I: HL = Melody address
; ЭТАП 4. Было: цикл по тройкам с CALL ROM_BEEPER на каждую ноту, а ROM_BEEPER
; в порте nzeemin — `ret ;STUB`, то есть звука не было вовсе, а под заглушкой
; лежала ZX-процедура с DI и busy-петлями. Стало: мелодия ОТДАЁТСЯ драйверу
; ВИ53 (snd_start в scubacod0.asm) и управление возвращается сразу — игра не
; ждёт ни такта, формат таблиц мелодий не тронут.
PlayMelody
	LD A,(HL)
	INC A
	RET Z			; сразу $FF — играть нечего
	jp snd_start		; запомнить указатель и вернуться

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
	jp NZ,LE68A
	LD HL,LA41B		; empty sprite address
	jp LE697
LE68A	LD HL,LE652		; Divers on the boat sprite address base
	LD DE,$0010		; shift to next sprite
	DEC A
	jp Z,LE697
	LD B,A			; B = loop counter
LE694	ADD HL,DE
	dec b
	jp nz,LE694
LE697	LD B,$06		; repeat 6 times
	LD DE,SprBoat+60	; $8CD6 = $8C9A + 60
LE69C	PUSH BC
	ld (il_a),a	; copy pixels
	ld a,(hl)
	ld (de),a
	inc hl
	inc de
	dec bc
	ld a,(il_a)
	ld (il_a),a	; copy pixels
	ld a,(hl)
	ld (de),a
	inc hl
	inc de
	dec bc
	ld a,(il_a)
	LD BC,$0005
	EX DE,HL
	ADD HL,BC
	EX DE,HL
	POP BC
	dec b
	jp nz,LE69C
	RET

LE6AB:
	ld (il_hl),hl	; Diver object address
	ld hl,DiverObj
	ld (z80_ix),hl
	ld hl,(il_hl)
	LD HL,$FFFF		; maximum Oxygen
	LD (OXYGEN),HL		; reset Oxygen level
	LD A,(LIVES)		; get Number of lives
	DEC A			; one less = lives left
	CALL LE682		; Draw Divers on the Boat
	LD A,(LC4F0)
	LD C,A
	and a
	rra
	and a
	rra
	and a
	rra
	DEC A
	AND $1F			; column 0..31
	LD L,A
	LD H,$00
	LD (L5B03),HL		; set Screen position on mini-map
	ld (il_a),a
	ld a,$00
	ld (DiverObj+$1E),a
	ld a,(il_a)
	ld (il_a),a
	ld a,$FE
	ld (DiverObj+$11),a
	ld a,(il_a)
	ld (il_a),a
	ld a,$00
	ld (DiverObj+$12),a
	ld a,(il_a)
	ld (il_a),a
	ld a,$00
	ld (DiverObj+$0D),a
	ld a,(il_a)
	ld (il_a),a
	ld a,$06
	ld (DiverObj+$01),a
	ld a,(il_a)
	ld (il_a),a	; set Y value = 12
	ld a,$0C
	ld (DiverObj+$14),a
	ld a,(il_a)
	push af
	ld a,(DiverObj+$10)
	or 1<<(3)
	ld (DiverObj+$10),a
	pop af
	LD A,(LC4F0+2)
	ld (DiverObj+$27),a
	ld (il_a),a	; clear DX value
	ld a,$00
	ld (DiverObj+$04),a
	ld a,(il_a)
	ld (il_a),a	; clear DY value
	ld a,$00
	ld (DiverObj+$05),a
	ld a,(il_a)
	ld (il_a),a
	ld a,$00
	ld (DiverObj+$28),a
	ld a,(il_a)
	ld (il_a),a
	ld a,$06
	ld (DiverObj+$1A),a
	ld a,(il_a)
	ld (il_a),a
	ld a,$00
	ld (DiverObj+$10),a
	ld a,(il_a)
	ld (il_a),a	; speed factor = min speed
	ld a,$14
	ld (DiverObj+$0E),a
	ld a,(il_a)
	ld (il_a),a
	ld a,$00
	ld (DiverObj+$12),a
	ld a,(il_a)
	ld (il_a),a
	ld a,$FF
	ld (DiverObj+$11),a
	ld a,(il_a)
	LD A,L			; get screen position on mini-map (column)
	ADD A,A
	ADD A,A
	ADD A,A			; *8
	LD L,A
	LD A,C
	SUB L
	ADD A,$03
	ld (DiverObj+$00),a	; set Column value
	LD C,A
	LD A,(LC4F0+2)
	ADD A,$03
	ld (il_a),a
	and 1<<(3)
	ld a,(il_a)
	jp Z,LE72C
	call z80_inc_X	; one Column right
	defb $00
	AND $07			; 0..7
LE72C	ADD A,A
	ld (DiverObj+$13),a	; set X value
	LD A,(LIVES)		; get Number of lives
	CP $03
	jp Z,LE759
	LD B,$0A
	CP $02
	jp Z,LE73F
	LD B,$14
LE73F:
	ld a,(DiverObj+$13)	; get X value
	ADD A,B
LE743	SUB $10
	jp C,LE74C
	ld (il_hl),hl	; one Column right
	ld hl,DiverObj+$00
	inc (hl)
	ld hl,(il_hl)
	jp LE743
LE74C	ADD A,$10
	ld (DiverObj+$13),a	; set X value
	ld (il_a),a
	ld a,$01
	ld (DiverObj+$20),a
	ld a,(il_a)
	ld (il_a),a
	ld a,$02
	ld (DiverObj+$0F),a
	ld a,(il_a)
LE759	LD HL,SprDiverSit	; Sprite diver sitting on the boat
	ld (il_a),a	; set sprite address
	ld a,l
	ld (DiverObj+$24),a
	ld a,(il_a)
	ld (il_a),a
	ld a,h
	ld (DiverObj+$25),a
	ld a,(il_a)
	push af	; set "moving" bit
	ld a,(DiverObj+$10)
	or 1<<(0)
	ld (DiverObj+$10),a
	pop af
	RET

LE767:
	ld (il_a),a
	ld a,(DiverObj+$26)
	and 1<<(0)
	ld a,(il_a)
	jp NZ,LE7E0
	ld (il_a),a
	ld a,$03
	ld (DiverObj+$20),a
	ld a,(il_a)
	ld (il_a),a
	ld a,$03
	ld (DiverObj+$0F),a
	ld a,(il_a)
	ld (il_a),a	; clear DX value
	ld a,$00
	ld (DiverObj+$04),a
	ld a,(il_a)
	ld (il_a),a	; clear DY value
	ld a,$00
	ld (DiverObj+$05),a
	ld a,(il_a)
	LD A,(LC4F0+2)
	ld (il_hl),hl
	ld hl,DiverObj+$27
	cp (hl)
	ld hl,(il_hl)
	jp Z,LE78C
	rst 20h	; = call z80_sta_X
	defb $27
	rst 28h	; = call z80_stn_X
	defb $04
	defb $FE
LE78C	;LD BC,(L5B3E)		; get port for Accelerate key
	;LD A,(L5B40)		; get bit mask for Accelerate key
	;LD L,A
	;IN A,(C)		; Read from port for the key
	;AND L
	ei ;HACK to make keyboard working
	call DecodeKeyboard
	ld (il_a),a
	and 1<<(3)
	ld a,(il_a)
	ret z ;RET NZ		; Return if not pressed
	LD HL,LE634		; Melody address
	CALL PlayMelody		; Play melody
	ld (il_a),a
	ld a,(DiverObj+$26)
	and 1<<(2)
	ld a,(il_a)
	jp NZ,LE7C2
	ld (il_a),a
	ld a,$0C
	ld (DiverObj+$0E),a
	ld a,(il_a)
	LD HL,SprDiverSit	; Sprite diver sitting on the boat
	ld (il_a),a	; set sprite address
	ld a,l
	ld (DiverObj+$24),a
	ld a,(il_a)
	ld (il_a),a
	ld a,h
	ld (DiverObj+$25),a
	ld a,(il_a)
	push af
	ld a,(DiverObj+$26)
	or 1<<(0)
	ld (DiverObj+$26),a
	pop af
	ld (il_a),a	; set DX value = -1
	ld a,$FF
	ld (DiverObj+$04),a
	ld a,(il_a)
	ld (il_a),a	; set DY value = +2
	ld a,$02
	ld (DiverObj+$05),a
	ld a,(il_a)
	push af
	ld a,(DiverObj+$26)
	or 1<<(1)
	ld (DiverObj+$26),a
	pop af
	RET
	IFNDEF EVICT
LE7C2	LD HL,SprDiver1		; Sprite diver directing up-right
	ELSE
LE7C2	LD HL,DIVER_A1		; тот же угол 1, но по адресу ломтя зоны
	ENDIF
	rst 28h	; = call z80_stn_X
	defb $0E
	defb $14
	call z80_stl_X	; set sprite address
	defb $24
	call z80_sth_X
	defb $25
	rst 30h	; = call z80_setX
	defb $26
	defb 1<<(0)
	rst 28h	; = call z80_stn_X
	defb $04
	defb $02
	rst 28h	; = call z80_stn_X
	defb $05
	defb $02
	rst 30h	; = call z80_setX
	defb $26
	defb 1<<(1)
	RET
LE7E0:
	ld (il_a),a
	ld a,(DiverObj+$26)
	and 1<<(2)
	ld a,(il_a)
	jp NZ,LE837
	ld (il_a),a
	ld a,(DiverObj+$26)
	and 1<<(1)
	ld a,(il_a)
	jp Z,LE7F1
	push af
	ld a,(DiverObj+$26)
	and (~(1<<(1)))&255
	ld (DiverObj+$26),a
	pop af
	RET
LE7F1:
	push af
	ld a,(DiverObj+$26)
	or 1<<(1)
	ld (DiverObj+$26),a
	pop af
	ld (il_a),a	; get sprite address
	ld a,(DiverObj+$25)
	ld h,a
	ld a,(il_a)
	ld (il_a),a
	ld a,(DiverObj+$24)
	ld l,a
	ld a,(il_a)
	LD BC,$0020
	ADD HL,BC
	ld (il_a),a	; set sprite address
	ld a,l
	ld (DiverObj+$24),a
	ld a,(il_a)
	ld (il_a),a
	ld a,h
	ld (DiverObj+$25),a
	ld a,(il_a)
	LD DE,L9C4C		; address right after last diver sprite
	OR A
	ld (il_a),a
	ld a,l
	sbc a,e
	ld l,a
	ld a,h
	sbc a,d
	ld h,a
	ld a,(il_a)
	RET NZ
	ld (il_a),a
	ld a,$14
	ld (DiverObj+$0E),a
	ld a,(il_a)
	ld (il_a),a	; clear DX value
	ld a,$00
	ld (DiverObj+$04),a
	ld a,(il_a)
	ld (il_a),a	; clear DY value
	ld a,$00
	ld (DiverObj+$05),a
	ld a,(il_a)
	ld (il_a),a	; set initial Angle = 4
	ld a,$04
	ld (DiverObj+$06),a
	ld a,(il_a)
	push af
	ld a,(DiverObj+$10)
	or 1<<(7)
	ld (DiverObj+$10),a
	pop af
	push af	; clear "moving" bit
	ld a,(DiverObj+$10)
	and (~(1<<(0)))&255
	ld (DiverObj+$10),a
	pop af
	LD A,(LEVEL)		; LEVEL
	LD C,A
	LD A,$05
	SUB C			; A = 5 - LEVEL
	ld (DiverObj+$1E),a
	ld (il_a),a
	ld a,$07
	ld (DiverObj+$28),a
	ld a,(il_a)
	push af
	ld a,(DiverObj+$10)
	and (~(1<<(3)))&255
	ld (DiverObj+$10),a
	pop af
	RET
LE837:
	call z80_bitX
	defb $26
	and 1<<(3)
	ld a,(il_a)
	jp NZ,LE88A
	call z80_bitX
	defb $26
	and 1<<(1)
	ld a,(il_a)
	jp Z,LE848
	call z80_resX
	defb $26
	defb (~(1<<(1)))&255
	RET
LE848:
	rst 30h	; = call z80_setX
	defb $26
	defb 1<<(1)
	call z80_ldh_X	; get sprite address
	defb $25
	call z80_ldl_X
	defb $24
	IFNDEF EVICT
	LD BC,$0080
	ADD HL,BC
	ELSE
; ШАГ АНИМАЦИИ +128 — ЭТО ОДИН УГОЛ, а угол в зоне занимает ДВЕ страницы, значит
; шаг сводится к H += 2, младший байт не трогается вовсе (он и так 192).
; НО указатель (IX+$24/$25) держит не только наш массив: LE93C кладёт сюда
; SprDiverClimb («влезание в лодку»), а тот не выселяется. Безусловное H += 2
; сломало бы этот случай молча, поэтому ряд зоны отделён сравнением старшего
; байта, и невыселенный указатель шагает как прежде. Тракт холодный (единицы
; заходов за прогон), цена — десяток тактов.
; BC здесь мертво по построению: штатный путь сам затирает его константой, а
; ниже C заново берут из LEVEL. Поэтому B годится под сохранение A.
	ld b,a
	ld a,h
	cp DIVER_A
	jp c,LE848o		; старший байт ниже ряда зоны — чужой массив
	add a,2
	ld h,a
	ld a,b
	jp LE848n
LE848o:
	ld a,b
	LD BC,$0080
	ADD HL,BC
LE848n:
	ENDIF
	call z80_stl_X	; set sprite address
	defb $24
	call z80_sth_X
	defb $25
	IFNDEF EVICT
	LD DE,SprDiver5
	ELSE
; ОГРАНИЧИТЕЛЬ — тот же угол 5, но в зоне. Пара sbc a,e / sbc a,d ставит Z ТОЛЬКО
; по старшему байту (на Z80 sbc hl,de ставил бы по всем шестнадцати) — мина
; рекомпиляции, до сих пор безвредная лишь потому, что младшие байты совпадали.
; В новой адресации младший байт равен 192 у обоих операндов ПО ПОСТРОЕНИЮ шага
; H += 2, то есть сравнение по старшему байту становится единственно верным, и
; правка эту мину заодно обезвреживает.
	LD DE,DIVER_A5
	ENDIF
	OR A
	ld (il_a),a
	ld a,l
	sbc a,e
	ld l,a
	ld a,h
	sbc a,d
	ld h,a
	ld a,(il_a)
	RET NZ
	rst 28h	; = call z80_stn_X
	defb $04
	defb $00
	rst 28h	; = call z80_stn_X
	defb $05
	defb $00
	rst 28h	; = call z80_stn_X
	defb $06
	defb $04
	rst 30h	; = call z80_setX
	defb $10
	defb 1<<(7)
	call z80_resX	; clear "moving" bit
	defb $10
	defb (~(1<<(0)))&255
	LD A,(LEVEL)		; LEVEL
	LD C,A
	LD A,$05
	SUB C			; A = 5 - LEVEL
	rst 20h	; = call z80_sta_X
	defb $1E
	rst 28h	; = call z80_stn_X
	defb $28
	defb $07
	call z80_resX
	defb $10
	defb (~(1<<(3)))&255
	RET
LE88A:
	rst 28h	; = call z80_stn_X
	defb $1E
	defb $00
	LD HL,LE632
	INC (HL)
	DEC HL
	DEC HL			; HL = LE630
	CALL PlayMelody		; Play melody
	call z80_lda_X
	defb $1A
	CP $06
	jp NZ,LE8FA
	call z80_lda_X_3
	CP $07
	jp NZ,LE8FA
	LD HL,(HELD)		; get HELD value
	ld (il_hl),hl	; get Score number
	ld hl,(SCORE)
	ld e,l
	ld d,h
	ld hl,(il_hl)
	ADD HL,DE
	LD (SCORE),HL		; set Score number
	LD HL,$0000
	LD (HELD),HL		; reset HELD value
	CALL PrintHeld		; Print HELD number
	CALL PrintScore		; Print score number
	LD HL,$FFFF
	CALL UpdateOxygen	; Update Oxygen indicator
	call z80_resX
	defb $10
	defb (~(1<<(6)))&255
	call z80_resX
	defb $26
	defb (~(1<<(3)))&255
	call z80_resX
	defb $26
	defb (~(1<<(0)))&255
	LD A,(L5B00)
	CP $08
	jp NZ,LE8FA
	LD A,(L5B0F)
	CP $03
	jp NZ,LE8FA
	LD HL,(L5B31)		; get value depending on LEVEL
	ld (il_hl),hl	; get Score number
	ld hl,(SCORE)
	ld e,l
	ld d,h
	ld hl,(il_hl)
	ADD HL,DE
	LD (SCORE),HL		; set Score number
	CALL PrintScore		; Print score number
	rst 30h	; = call z80_setX
	defb $26
	defb 1<<(4)
	LD HL,LE638		; Melody address
	CALL PlayMelody		; Play melody
	LD HL,LE638		; Melody address
	CALL PlayMelody		; Play melody
LE8FA:
	rst 28h	; = call z80_stn_X
	defb $04
	defb $00
	rst 28h	; = call z80_stn_X
	defb $0F
	defb $03
	rst 28h	; = call z80_stn_X
	defb $20
	defb $03
	LD A,(LC4F0+2)
	call z80_cp_X
	defb $27
	RET Z
	rst 20h	; = call z80_sta_X
	defb $27
	rst 28h	; = call z80_stn_X
	defb $04
	defb $FE
	RET

LE915:
	ld (il_hl),hl
	ld hl,(LC4F0)
	ld e,l
	ld d,h
	ld hl,(il_hl)
	ld (il_a),a
	ld a,(DiverObj+$10)
	and 1<<(5)
	ld a,(il_a)
	JP NZ,LE418
	ld (il_hl),hl	; get screen position on 256x256 map
	ld hl,(L5B0B)
	ld c,l
	ld b,h
	ld hl,(il_hl)
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
	jp Z,LE93C
	INC A
	CP H
	jp Z,LE93C
	INC A
	CP H
  IF CHEAT_SPECIES
	JP NZ,LE418		; CHEAT_SPECIES: ignore non-boat (living thing) collision
  ELSE
	JP NZ,LE3CD
  ENDIF
LE93C:
	rst 30h	; = call z80_setX
	defb $0D
	defb 1<<(1)
	call z80_resX
	defb $0D
	defb (~(1<<(0)))&255
	ld (il_hl),hl
	ld hl,(z80_iy)
	push hl
	ld hl,(il_hl)
	PUSH BC
	rst 28h	; = call z80_stn_X
	defb $04
	defb $00
	LD HL,(L5B03)		; get Screen position on mini-map
	PUSH HL
	CALL LDFD5
	POP HL
	call z80_resX
	defb $10
	defb (~(1<<(7)))&255
	rst 30h	; = call z80_setX
	defb $26
	defb 1<<(0)
	rst 30h	; = call z80_setX
	defb $26
	defb 1<<(2)
	rst 30h	; = call z80_setX
	defb $26
	defb 1<<(3)
	LD A,(LC4F0+2)
	rst 20h	; = call z80_sta_X
	defb $27
	rst 28h	; = call z80_stn_X
	defb $04
	defb $00
	rst 28h	; = call z80_stn_X
	defb $05
	defb $FF
	POP BC
	LD A,(L5B03)		; get Screen position (column) on mini-map
	CP L
	jp Z,LE97C
	LD A,$08
	ADD A,C
	LD C,A
LE97C:
	call z80_stc_X	; set Column value
	defb $00
	call z80_lda_X
	defb $27
	ADD A,A
	rst 20h	; = call z80_sta_X
	defb $13
	rst 28h	; = call z80_stn_X
	defb $28
	defb $00
	LD HL,SprDiverClimb	; Sprite diver climbing on the boat
	call z80_stl_X	; set sprite address
	defb $24
	call z80_sth_X	;
	defb $25
	rst 30h	; = call z80_setX
	defb $0D
	defb 1<<(0)
	call z80_resX
	defb $0D
	defb (~(1<<(1)))&255
	CALL LDFD5
	ld (il_hl),hl
	pop hl
	ld (z80_iy),hl
	ld hl,(il_hl)
	rst 28h	; = call z80_stn_X
	defb $0F
	defb $03
	rst 28h	; = call z80_stn_X
	defb $20
	defb $03
	LD HL,LE632
	LD (HL),$00
	JP LE418

; Plus one live
; I: IX = Diver object address = DiverObj
LE9B0:
	rst 30h	; = call z80_setX
	defb $26
	defb 1<<(5)
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
	ld (il_hl),hl	; get current High Score
	ld hl,(HISCORE)
	ld e,l
	ld d,h
	ld hl,(il_hl)
	LD A,L
	SUB E
	LD A,H
	SBC A,D
	jp C,LEADE	; SCORE < HISCORE => no new high score
	LD (HISCORE),HL		; SCORE >= HISCORE => store new High Score
;	fall through to LEADE (Game Over screen)
;
LEADE	LD A,$0F
	;LD (ATTR_P),A		; set ATTR-P - Permanent current colours
	call ClearGameScreen
	;LD HL,StrGameOver
	;LD BC,$0607		; row 6, column 7
	;;LD DE,PrintCharRt	; Procedure Print char and shift right
	;CALL PrintString	; Print "GAME OVER"
	ret			; => Main menu

; Redefine keys - REMOVED

; Sound??
LECEB	LD C,$FE
	LD B,C
LECEE:
	ld a,c
	ld (i80_inc_11+1),a
i80_inc_11:
	in a,(0)
	AND $1F			; 0..31
	XOR $1F
	jp NZ,LECFA
	ld (il_a),a
	ld a,B
	rlca
	ld B,a
	ld a,(il_a)
	jp LECEE
LECFA	PUSH AF
	PUSH BC
	ld (il_hl),hl
	ld hl,(z80_ix)
	push hl
	ld hl,(il_hl)
	PUSH DE
	LD HL,LEDD5
LED02	LD E,(HL)
	LD A,E
	INC A
	jp Z,LED16
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
	jp LED02
LED16	POP DE
	ld (il_hl),hl
	pop hl
	ld (z80_ix),hl
	ld hl,(il_hl)
	POP BC
	POP AF
	LD L,A
LED1C:
	ld a,c
	ld (i80_inc_12+1),a
i80_inc_12:
	in a,(0)
	AND L
	jp Z,LED1C
	LD A,L
	RET

; UDG symbols $90..$93 used for Redefine keys - REMOVED
; Text for Redefine keys - REMOVED

; Melody
LEDD5	DEFB $12,$80,$01,$1E,$00,$01,$0C,$40
	DEFB $01,$FF

; Starting point
Start
	IFDEF GEOM
	IFDEF EVICT
; ПАНЕЛЬ — ЧАСТЬ СТАРТОВОГО ЭКРАНА, А НЕ ИГРЫ (указание владельца).
; Была видна только после первого входа в игру, и меню до этого выглядело
; смещённым: текст слева, справа пусто. Здесь она рисуется ОДИН РАЗ за жизнь
; образа — Start исполняется только на бусте, из меню сюда не возвращаются
; (после game over идёт jp LEDFE, минуя Start).
; ПОРЯДОК С РАСКЛАДКОЙ. Распаковщик dzx0 проходит все 2048 Б и протирает нулями
; зонные строки своих восьми столбцов — это ломти рельефа 22..29. Поэтому
; раскладка обязана идти ПОСЛЕ панели — и идёт, прямо здесь, следующей строкой.
; Развёртка под выселением одна на всё (ScrollVal = 0xBF с буста), поэтому в меню
; панель встаёт ровно туда же, куда в игре, без сдвига на 64 строки.
	call ShowGamePanel
; --- РАСКЛАДКА ЛОМТЕЙ В БУТЕ, А НЕ ПРИ ПЕРВОМ ВХОДЕ В ИГРУ -------------------
; ЭТО ФИКС ЗАВИСАНИЯ ДЕМО-РЕЖИМА, а не косметика. Меню через ~20 с простоя само
; уходит в демо (LEEAD: `LD A,(FRAMES+1) / CP 4`) и зовёт PrepareMiniMap с
; закрытыми прерываниями. Внутри неё LA193 рождает ракушки из тайлов рельефа
; $1C..$1F, а рельеф под -DEVICT лежит в ЛОМТЯХ — и до этой правки их
; раскладывал только вход в Game, то есть ПОЗЖЕ. Замер на входе в демо
; (tools/verify/attract_probe.js на образе d7664ebb): ненулевых байт в ломтях
; рельефа 0 из 1920, кандидатов $1C..$1F ноль, в TableStatics три записи и все
; три — сундуки. Дальше LB1D4 ищет запись со строкой >= $48 и флагами без $60,
; не находит ни одной и крутится вечно; прерывания закрыты тем самым DI, и
; машина мертва целиком. Эталонная Z80-сборка на том же месте даёт 32 записи,
; из них 29 годных, и демо доигрывает — значит зависание принесло выселение.
; ПОЧЕМУ ИМЕННО ЗДЕСЬ, а не раньше и не позже:
;   * ПОСЛЕ панели — иначе её распаковщик протрёт ломти рельефа 22..29;
;   * ДО меню — демо стартует из менюшного цикла, и к тому моменту рельеф
;     обязан лежать;
;   * ОДИН раз за жизнь образа — Start исполняется только на бусте, а источник
;     ломтей лежит в доме пула 0xA0..0xAF и после первой же игры (в том числе
;     демонстрационной) законно затирается буферами save-under.
; Признак ставится ЗДЕСЬ ЖЕ и обязателен: без него страховочная раскладка в
; PrepareGame сработала бы на первой игре и разложила уже затёртый демо-режимом
; источник.
	call ZoneCopy
	ld a,0FFh
	ld (ZoneLaid),a
	ENDIF
	ENDIF
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
	;LD DE,LEF70
	;LD BC,$000F
	;CALL ROM_PRSTRING	; ROM call PR-STRING
; СКЛЕЙКА ЭКРАНОВ: заголовок и строки версии переехали сюда с бывшего первого
; экрана, который после снятия титульной картинки остался пустым.
	LD HL,StrBigTitle
; СТОЛБЕЦ ЗАГОЛОВКА. 10 знаков по два столбца = 20 столбцов. Без панели он стоял
; на 6 (центр 32-столбцового экрана), под панелью поле сузилось до столбцов
; 0..23, и центр там — столбец 2. Со столбца 6 хвост «VE» уезжал на панель, где
; его уже никто не стирал.
MenuBigPos:				; операнд MenuBigPos+1 — точка подсадки гейта столбцов
	LD BC,$0100+MENU_BIGCOL+MENU_ROWS*256
	CALL PrintBig
	LD HL,StrTitle1
	LD BC,$0401+MENU_ROWS*256		; строка 4, столбец 1
	CALL PrintString
	LD HL,StrTitle2
	LD BC,$0500+MENU_ROWS*256		; строка 5, столбец 0: строка автора ровно 32 знака,
				; со столбца 1 последний ушёл бы в плоскость 0xE000
	CALL PrintString
	LD HL,StrControls
	LD BC,$0800+MENU_ROWS*256		; row, column
	;LD DE,PrintCharRt	; Procedure Print char and shift right
	CALL PrintString
	inc HL ;LD HL,StrControls1
	LD BC,$0900+MENU_ROWS*256		; row, column
	CALL PrintString
	inc HL ;LD HL,StrControls2
	LD BC,$0B00+MENU_ROWS*256		; row, column
	CALL PrintString
	inc HL ;LD HL,StrControls3
	LD BC,$0C00+MENU_ROWS*256		; row, column
	CALL PrintString
	inc HL ;LD HL,StrControls4
	LD BC,$0D02+MENU_ROWS*256		; row, column
	CALL PrintString
	inc HL ;LD HL,StrControls5
	LD BC,$0E00+MENU_ROWS*256		; row, column
	CALL PrintString
	inc HL ;LD HL,StrControls6
	LD BC,$0F02+MENU_ROWS*256		; row, column
	CALL PrintString
	inc HL ;LD HL,StrPrompt1
	LD BC,$1500+MENU_ROWS*256		; row, column
	CALL PrintString
	inc HL ;LD HL,StrPrompt2
	LD BC,$1600+MENU_ROWS*256		; row, column
	CALL PrintString
LEE07:	LD HL,StrSkill		; "SKILL"
	LD BC,$1204+MENU_ROWS*256		; row, column
	;LD DE,PrintCharRt	; Procedure Print char and shift right
	CALL PrintString
	EI
;
; 	LD B,$0A		; repeat 10 times
; LEE12	PUSH BC
; 	LD HL,LEDD5
; 	CALL PlayMelody		; Play melody
; 	POP BC
; 	DJNZ LEE12

LEE1C
; ОЖИДАНИЕ ОТПУСКАНИЯ. Здесь в исходнике стоял ;TODO: WaitKeyUp — и это не
; украшение. Без него кнопка, которой игрок вышел из заставки, ЕЩЁ УДЕРЖИВАЕТСЯ,
; когда меню начинает читать ввод: «газ» срабатывает мгновенно, экран выбора
; мелькает один кадр и игра стартует сама. Замер на стенде с УДЕРЖАННОЙ кнопкой:
; меню на кадре 194 и START_GAME на кадре 194 же, то есть ноль кадров на выбор.
; Прежний поток спасал WaitAnyKey перед меню; сборка -DNOTITLE его потеряла.
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
	jp z,.notskill
	add $10			; skill number -> digit char '1'..'4'
	ld (SkillChar),A	; update the SKILL SELECTED line
	jp LEE07		; re-print SKILL and keep waiting
.notskill:
	LD A,(KSTATE5)		; movement / fire key pressed?
	OR A
	jp Z,LEE2C	; nothing pressed => keep waiting
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
;	LD A,$01
;	OUT ($FE),A
	ld (il_hl),hl
	ld hl,(z80_ix)
	push hl
	ld hl,(il_hl)
	ld (il_hl),hl
	ld hl,(z80_iy)
	push hl
	ld hl,(il_hl)
	DI
	CALL PrepareMiniMap	; Prepare the world MiniMap table
	CALL InitLevelVars	; Initialize variables depending of LEVEL
	CALL LBEDB
	LD HL,$0518
	LD (L5B03),HL		; set Screen position on mini-map
	CALL DrawGameScr	; Draw game screen
	LD BC,$1405+MENU_ROWS*256		; row/column
	;LD DE,PrintCharRt	; Procedure Print char and shift right
	LD HL,StrPressAny	; "PRESS ANY KEY"
	CALL PrintString	; Print string
	CALL LBDBA
	ld (il_hl),hl
	pop hl
	ld (z80_iy),hl
	ld hl,(il_hl)
	ld (il_hl),hl
	pop hl
	ld (z80_ix),hl
	ld hl,(il_hl)
LEF12:
	ld (il_hl),hl
	ld hl,(z80_ix)
	push hl
	ld hl,(il_hl)
	ld (il_hl),hl
	ld hl,(z80_iy)
	push hl
	ld hl,(il_hl)
	CALL LB213
	CALL LBDEA
	ld (il_hl),hl
	pop hl
	ld (z80_iy),hl
	ld hl,(il_hl)
	ld (il_hl),hl
	pop hl
	ld (z80_ix),hl
	ld hl,(il_hl)
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
	jp Z,LEF12
	;EI
; key pressed - leave the attract demo and go back to the menu
MenuFromDemo
	call DecodeKeyboard	; wait until the key is released
	or a
	jp nz,MenuFromDemo
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
