;============================================================================
; ПРАВИЛО ФАЙЛА: «Z ПО СТАРШЕМУ БАЙТУ».
; Рекомпилятор разворачивает Z80-инструкцию `sbc hl,de` в пару
;       ld a,l / sbc a,e / ld l,a / ld a,h / sbc a,d / ld h,a
; Разность 16-битная и верная, а вот ФЛАГИ — нет: Z остаётся от ПОСЛЕДНЕЙ
; операции, то есть от СТАРШЕГО байта разности. На Z80 `sbc hl,de` ставит Z по
; всем шестнадцати битам. Читать это надо так:
;       Z (i8080-развёртка)  <=>  HL - DE попало в 0..255
;       Z (Z80 sbc hl,de)    <=>  HL - DE == 0
; То есть `jp z` срабатывает не на одном значении, а на диапазоне из 256 —
; ПЕРЕЛЁТ через искомую точку меньше чем на 256 неотличим от попадания в неё.
; C (перенос) при этом ВЕРЕН — он сквозной, и ветвления по C безопасны везде.
; В файле три живых места с `jp z` после такой развёртки; каждое помечено на
; месте и каждое безвредно не случайно, а по проверяемому условию:
;   * шаг анимации «влезание в лодку» (LE7F1, ограничитель L9C4C) — указатель
;     идёт шагом $20 и попадает в ограничитель РОВНО: ASSERT кратности рядом;
;   * ограничитель анимации ныряльщика (LE848, SprDiver5) — то же шагом $80:
;     ASSERT кратности рядом;
;   * приём сундука (LE4FB) — по таблице цен LDDF0 разность «остаток ёмкости
;     минус цена» никогда не бывает положительной (разбор и числа на месте).
; ЛЮБОЙ НОВЫЙ `jp z` после развёртки sbc hl,de обязан получить такое же
; обоснование; проще всего — сравнивать через C или по одному байту явно.
;============================================================================
; ЧАСТЬ КОДОВ ШРИФТА — НЕ БУКВЫ. Шрифт (ROM_CHARSET, scubasymb.asm) содержит 59
; глифов, коды $20..$5A по 8 байт. Печатаемый текст пользуется буквами и цифрами,
; а глифы, доказанно мёртвые по переписи, отданы под графику и таблицы — поэтому
; ни рамка HUD, ни крупный заголовок не стоят НИ ОДНОГО байта данных сверх шрифта.
; ЗАНЯТЫЕ КОДЫ — ПОЛНЫЙ СПИСОК:
;   $21           — корыто полосы-индикатора (TILE_TROUGH, DrawHudTrough)
;   $22, $23      — НЕ глифы: 16-байтная таблица «полубайт -> удвоенный байт»
;                   крупной печати 2x2 (BIG_TBL, ExpandNib)
;   $3B..$40      — рамка HUD: палочки H/V и четыре уголка (TILE_H..TILE_BR)
; Строки игры этих кодов не содержат: в исходном шрифте на $21..$23 стояли
; '!', '"', '#', а на $3B..$40 — ';' '<' '=' '>' '?' '@'.
; ЛЮБОЙ НОВЫЙ ТАЙЛ обязан занять код из этого же диапазона и попасть в список.
;============================================================================

; HUDX: подписи и числа HUD отодвинуты от левой кромки на одно знакоместо
; (владелец: справа оставалось много пустоты). Только наш стиль HUD (THINGAUGE);
; штатная сборка — ноль, байт в байт с Z80.
	IFDEF THINGAUGE
HUDX	EQU 1		; числа — на два знакоместа (пробел после подписи)
	ELSE
HUDX	EQU 0
	ENDIF
;----------------------------------------------------------------------------

	;ASSERT $ < $9900
	;DS $9900 - $
	;ORG $9900
	DISPLAY "Code start: ", /A, $

; Game; returns on Game Over
; ДИСЦИПЛИНА ПРЕРЫВАНИЙ. Этот DI закрывает подготовку партии (PrepareMiniMap,
; InitLevelVars, LBEDB, PrepareGame, LE6AB, DrawGameScr) — она строит мир и
; перерисовывает экран, и KEYINT внутри неё не нужен. Парный EI стоит ЗДЕСЬ ЖЕ,
; сразу за CALL DrawGameScr (см. ниже): раньше прерывания открывал единственный
; `ei` в хвосте DrawGameScr — в чужом файле и без пометки, так что пара DI/EI не
; читалась ни из одного места. Второй EI — на выходе по game over (LDA33).
; ЗАМЕР окна (tools/verify/iff_probe.js, боевая сборка): KEYINT молчит 203 кадра
; на уровне 1 и 294 на уровне 4 — это и есть подготовка партии, других окон в
; игре нет.
Game	DI
	ld hl,(z80_ix)
	push hl
	ld hl,(z80_iy)
	push hl
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
	EI			; парный к `Game DI`: подготовка партии кончилась
	CALL LBDBA
LD9C0
	CALL LB213
	CALL LBDEA
	CALL LE2A8
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
	CALL LB213
	CALL LBDEA
	CALL LE2A8
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
	ld (il_hl),hl	; Ending the Game routine, the game is over
	pop hl
	ld (z80_iy),hl
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
ClearScreenFillAttr_attr:
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
LDA42	xor a
	ld l,a			; 256 байт столбца
LDA44	dec l
	LD (HL),a		; clear pixels
	jp nz,LDA44
	inc h
	ld a,h
	or a			; h завернулся из $FF в $00 => прошли $C000..$FFFF
	jp nz,LDA42
	ret

; Стереть ТОЛЬКО ПОЛЕ (знакоместные строки 0..23 = lo 64..255) и залить атрибуты;
; HUD в строках 24..31 (lo 0..63) остаётся. Зовёт демо-режим (LEEAD): он чистил
; экран целиком, и HUD исчезал на всё демо — игра после чистки рисует его сама
; (DrawHud при старте), а демо нет. Владелец, 2026-08-29: «HUD не стирать,
; только игровое поле».
ClearFieldFillAttr
	LD (L5B4A),A
	ld h,$C0
ClearField_col
	xor a
	ld l,64
ClearField_row
	ld (hl),a
	inc l
	jp nz,ClearField_row
	inc h
	ld a,h
	or a			; h завернулся из $FF в $00 => прошли $C000..$FFFF
	jp nz,ClearField_col
	jp ClearScreenFillAttr_attr


; Print char and shift current position right
PrintCharRt
	LD HL,(LDC7E)
	INC L
	LD (LDC7E),HL
	DEC L
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
; [МУСОР 1/5] ВЕТКА ВЫБОРА БАЗЫ УБРАНА ВМЕСТЕ С ТАЙЛАМИ $89..$AE.
; Было: если у кода символа взведён бит 7, глиф брался не из ROM_CHARSET, а из
; таблицы тайлов LDC80. Таблицу выкинули (см. ниже, на месте LDCC8), потому что
; печатать её нечем: во всём образе нет ни одной $FF-терминированной строки,
; составленной из кодов $80..$AE, и за 12 сцен спектра из неё не прочитан ни один
; байт. Это остаток ТИТУЛЬНОГО ЭКРАНА ZX — его логотип набирался именно этими
; тайлами.
	LD BC,ROM_CHARSET	; ROM font address, for chars $20..$5A (см. список кодов в шапке файла)
	ADD HL,BC
	LD B,$08		; repeat 8 times
LDA89	LD A,(HL)		; get char pixels
	LD (DE),A		; put on the screen
	INC HL
	dec e ;INC D			; next row
	dec b
	jp nz,LDA89
	POP HL			; restore char coords
	ld a,h
	cp $18
	ret nc			; строки 24..31 (HUD): таблица атрибутов туда не доходит
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
PrintString
	ld a,c
	ld (LDC7E),a
	ld a,b
	ld (LDC7E+1),a
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
	ld a,h
	xor $20			; подсветка ложится в ДРУГУЮ плоскость, не поверх цифры:
	ld h,a			; фон знакоместа синий, цифра на нём красная
	LD B,$08		; 8 pixel lines
HighlightChar_1
	LD (HL),$FF
	dec l			; next line down
	dec b
	jp nz,HighlightChar_1
	RET

; ПОДСВЕТКА ЧИСЛА ЖИЗНЕЙ В HUD (строка "1 2 3 4" под подписью LIVES).
; Ставит подсветку на цифру (LIVES) и СНИМАЕТ её с остальных трёх. Снимать
; обязательно: бонусная жизнь (LE9B0) увеличивает LIVES прямо посреди партии, и
; без гашения на панели горели бы две цифры сразу. Раньше подсветку ставила
; только PrepareGame — она рисует HUD по чистому экрану и о старой не знала;
; на месте бонуса стояло `;TODO: UpdateLives`, и HUD врал до следующей смерти.
; Механизм ОДИН: PrepareGame зовёт эту же процедуру.
; Устройство — как у MenuSkillMark (подсветка SKILL в меню): четыре клетки, в
; выбранную $FF, в прочие 0, всё в той же плоскости, что у HighlightChar.
; Портит A, BC, HL. DE берегут GetScrAddr и цикл.
; Знакоместная строка HUD с цифрами "1 2 3 4" под подписью LIVES. Вынесена в EQU,
; а не вписана числом: по ней стенд находит клетки подсветки (tools/verify/lives_gate.js).
LIVES_ROW	EQU $1B		; HUD снизу: строка 27
UpdateLives:
	LD A,(LIVES)		; 1..4 — какую цифру подсветить
	ld c,a
	ld b,1			; b = перебираемая цифра
UpdateLives_1:
	push bc
	ld a,b
	dec a
	add a,a			; *2 — два знакоместа на цифру в строке "1 2 3 4"
	ADD A,$16+HUDX		; column = 22+HUDX + (k-1)*2 => 23 / 25 / 27 / 29 при HUDX=1
	LD L,A
	LD H,LIVES_ROW
	CALL GetScrAddr		; HL = адрес клетки цифры
	pop bc
	ld a,h
	xor $20			; та же плоскость, что выбирает HighlightChar
	ld h,a
	ld a,b
	cp c
	ld a,0			; не эта цифра — погасить
	jp nz,UpdateLives_2
	ld a,$FF		; эта — залить
UpdateLives_2:
	push bc
	ld b,8			; 8 пиксельных строк знакоместа
UpdateLives_3:
	ld (hl),a
	dec l
	dec b
	jp nz,UpdateLives_3
	pop bc
	inc b
	ld a,b
	cp 5
	jp nz,UpdateLives_1
	RET

; MenuSkillMark/MenuTitleInk и константы MENU_* — в scubacod1.asm (до ALIGN)

; Базы полос-индикаторов HUD: левый верхний байт полосы в плоскости 0xC000,
; столбец 8+HUDX (в боевой сборке 9 — слагаемое 256*HUDX прибавляется к старшему
; байту, то есть к столбцу). Полоса горизонтальная, 128 пикселей = 16 столбцов
; (9..24), высота 4 строки.
	IFDEF BLUESHARK
; Младший байт адреса строки поверхности воды: её рисует DrawSurface в 0xE000,
; и только она мешает считать столкновение по второй плоскости.
BLUE_WATER_LO	EQU 0BFh	; штатная геометрия: поверхность на экранной строке 64
blue_on		DEFB 0		; 1 = на экране есть синее (вторая плоскость): проверять её в LE233
	ENDIF
	IFDEF THINGAUGE
GAUGE_OXY	EQU $C815+256*HUDX	; OXYGEN прижат к DEPTH: знакоместная строка 29 (владелец, 2026-08-27)
	ELSE
GAUGE_OXY	EQU $C81D+256*HUDX
	ENDIF	; столбец 8+HUDX, lo $1D = экранная строка 226 (знакоместная 28)
GAUGE_DEPTH	EQU $C80D+256*HUDX	; столбец 8+HUDX, lo $0D = экранная строка 242 (знакоместная 30)

; Нарисовать неподвижную часть HUD: рамку, подписи, корыта полос и цифры 1 2 3 4.
; Заменяет распаковку битмапа вертикальной панели scubapanl (ShowGamePanel),
; которого больше нет.
; ВЫЗЫВАЮЩИХ ДВА: PrepareGame (вход в игру) и LEDFE (главное меню под MENUHUD —
; HUD стоит там же, что и в игре, с настоящим рекордом).
;
; РАСКЛАДКА БОЕВОЙ СБОРКИ (-DTHINGAUGE, отсюда HUDX=1; знакоместные строки
; 24..31, столбцы 0..31). Столбцы ниже — уже с учётом HUDX:
;   24: верхняя кромка рамки во всю ширину; 31: нижняя; 25..30: боковые
;       палочки в столбцах 0 и 31 (DrawHudFrame)
;   25: SCORE (2..6)   число 5 цифр (8..12)
;   26: HELD  (2..5)   число 3 цифры (10..12)   SKILL (17..21)  1 2 3 4 (23..29)
;   27: HIGH  (2..5)   число 5 цифр (8..12)     LIVES (17..21)  1 2 3 4 (23..29)
;   29: OXYGEN (2..7)  полоса 128 px = столбцы 9..24
;   30: DEPTH  (2..6)  полоса 128 px = столбцы 9..24
; Строка 28 пустая: OXYGEN прижат к DEPTH по просьбе владельца.
; Правые края чисел SCORE / HIGH / HELD совпадают (столбец 12): HELD печатается
; на два разряда короче (B=$02 в PrintDec) и на два столбца правее.
; Подписи сдвинуты от кромки на HUDX, числа — на 2*HUDX (слагаемое 512*HUDX в
; PrintScore/PrintHighScore/PrintHeld — это два столбца старшего байта адреса).
; Ни одна строка не выходит за 32 столбца.
; ЦВЕТ: рамка и подписи после HudToPlane уезжают в 0xE000 (синие), цифры и числа
; печатаются позже и остаются в 0xC000 (жёлтые) — см. FIDELITY ниже.
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
	IFDEF THINGAUGE
; УЗКИЕ ШКАЛЫ (-DTHINGAUGE), как в вертикальной панели. Корыто было 8 px, а
; заполнение внутри — 4 px (GaugeSet/GaugeClr гоняют ровно `ld b,$04`), отсюда
; и толщина: половина корыта всегда пустая. Теперь корыто ровно 4 px и стоит на
; тех же строках, что и ползунок, — шкала становится вдвое уже, а заполнение
; занимает её целиком.
	ld hl,GAUGE_OXY+$2000
	call DrawHudTrough
	ld hl,GAUGE_DEPTH+$2000
	call DrawHudTrough
	ELSE
	ld hl,GAUGE_OXY+$2002	; +2: корыто 8 px от верха знакоместа, заполнение 4 px внутри
	call DrawHudTrough
	ld hl,GAUGE_DEPTH+$2002
	call DrawHudTrough
	ENDIF
; подписи; строки лежат в памяти подряд, поэтому после PrintString (HL стоит на
; терминаторе $FF) следующую даёт один inc hl вместо трёхбайтного ld hl,nn
	ld hl,StrHudHigh
	IFDEF THINGAUGE
	ld bc,$1B01+HUDX	; порядок владельца: SCORE / HELD / HIGH друг под другом (строки 25..27)
	ELSE
	ld bc,$1901
	ENDIF
	call PrintString
	inc hl			; StrHudScore
	IFDEF THINGAUGE
	ld bc,$1901+HUDX	; SCORE — первая строка, левый столбец
	ELSE
	ld bc,$1910
	ENDIF
	call PrintString
	inc hl			; StrHudHeld
	ld bc,$1A01+HUDX
	call PrintString
	inc hl			; StrHudSkill
	ld bc,$1A10+HUDX
	call PrintString
	inc hl			; StrHudLives
	ld bc,$1B10+HUDX
	call PrintString
	inc hl			; StrHudOxygen
	IFDEF THINGAUGE
	ld bc,$1D01+HUDX	; OXYGEN — строка 29, вплотную к DEPTH
	ELSE
	ld bc,$1C01+HUDX
	ENDIF
	call PrintString
	inc hl			; StrHudDepth
	ld bc,$1E01+HUDX
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
	IFNDEF THINGAUGE
; Штатная сборка: цифры до HudToPlane, как в Z80-эталоне (pixgate байт в байт).
	ld hl,StrHud1234
	ld bc,$1A16+HUDX
	call PrintString
	ld hl,StrHud1234
	ld bc,$1B16+HUDX
	call PrintString
	ENDIF
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
	IFDEF THINGAUGE
; ЦИФРЫ 1 2 3 4 — ПОСЛЕ HudToPlane: они остаются в 0xC000 (жёлтые), как и
; числа очков; подписи и рамка ушли в 0xE000 (синие). Подсветка выбранного
; уровня кладёт синий фон в 0xE000 — цифра на нём красная.
	ld hl,StrHud1234
	ld bc,$1A16+HUDX
	call PrintString
	ld hl,StrHud1234
	ld bc,$1B16+HUDX
	call PrintString
	ENDIF
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
	IFDEF THINGAUGE
; СПЛОШНОЕ КОРЫТО (2026-08-27): без ячеек и зазоров — заполнение (жёлтое в
; 0xC000) поверх синего корыта читается как сплошная красная полоса, пустая
; часть — синяя. Прежние коробки 4 px с зазорами давали жёлтые штрихи.
	ld b,$04		; узкое корыто — 4 строки, ровно под ползунок
DrawHudTrough_2
	ld (hl),$FF
	dec l			; строка ниже
	dec b
	jp nz,DrawHudTrough_2
	ELSE
	ld de,ROM_CHARSET+TILE_TROUGH*8
	ld b,$08		; глиф 8 строк
DrawHudTrough_2
	ld a,(de)
	ld (hl),a
	inc de
	dec l			; строка ниже
	dec b
	jp nz,DrawHudTrough_2
	ENDIF
	pop hl
	inc h			; next column
	dec c
	jp nz,DrawHudTrough_1
	ret

; StrHud* — в scubacod1.asm

; Prepare game screen, indicators, and some variables
PrepareGame
	LD A,$30
	CALL ClearScreenFillAttr	; Clear screen with attribute A = $30
	xor a ; LD A,$01
	out ($00),a ; OUT ($FE),A
	call DrawHud		; неподвижная часть HUD вместо битмапа панели
	xor A
	ld (LDE55),a		; полосы стёрты чисткой экрана — состояние тоже в ноль,
	ld (LDE57),a		; иначе на второй игре полоса не перерисуется
	call UpdateDepth1	; reset the Depth indicator
	ld hl,$FFFF
	call UpdateOxygen
; UpdateLevel: highlight the current skill (LEVEL) digit
	LD A,(LEVEL)		; LEVEL 1..4
	DEC A			; 0..3
	ADD A,A			; *2 — два столбца на цифру в строке "1 2 3 4"
	ADD A,$16+HUDX		; column = 22+HUDX + (LEVEL-1)*2 => 23 / 25 / 27 / 29 при HUDX=1
	LD L,A			; column
	LD H,$1A		; row 26
	CALL GetScrAddr		; HL = Vector screen address of the digit cell
	CALL HighlightChar
; Подсветка числа жизней — общей процедурой (была копия этих же вычислений;
; расходились бы при любой правке геометрии HUD, а бонусная жизнь звала бы одну
; из двух). Экран здесь только что очищен, так что гашение трёх лишних цифр
; внутри UpdateLives пишет нули в уже нулевые клетки.
	CALL UpdateLives
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
i80_ldir_10:
	ld a,(hl)
	ld (de),a
	inc hl
	inc de
	dec bc
	ld a,b
	or c
	jp nz,i80_ldir_10
	LD A,(LEVEL)		; LEVEL
	LD C,A
	LD A,$05
	SUB C			; A = 5 - LEVEL => 4 / 3 / 2 / 1
	ld (DiverObj+$1C),a
	ld (DiverObj+$1E),a
	LD C,A
	LD A,$16
	SUB C			; A => 18 / 19 / 20 / 21 (нижний предел строки)
	ld (DiverObj+$1D),a
	IFDEF WIDE
	ADD A,$08		; правый предел столбца: поле на 8 знакомест шире
	ENDIF
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

LDC7E	DEFW $0000	; Char coords for printing on the screen

; [МУСОР 1/5] ТАЙЛЫ 8x8 ДЛЯ КОДОВ $89..$AE УДАЛЕНЫ — 296 Б памяти, 249 Б образа.
; Девять из них автор порта уже вычеркнул руками («NOT USED»), остальные 37
; остались. Печатать их нечем (см. разбор у PrintChar выше), чтений за спектр
; ноль, слова 0x8167 в образе нет ни разу. Разбор: docs/memory_audit.md §3.2.
LDDF0	DEFW $0002,$0005,$004B,$0019,$0032,$00FA,$0019,$0000	; Level 1
	DEFW $0004,$000A,$0032,$0096,$0064,$01F4,$0032,$0000	; Level 2
	DEFW $0006,$000F,$0096,$00E1,$004B,$02EE,$004B,$0000	; Level 3
	DEFW $0008,$0014,$0064,$00C8,$012C,$03E8,$0064		; Level 4

; Адрес байта полосы и маска пикселя.
; I: A = номер пикселя 0..127, DE = база полосы
; O: HL = адрес байта, A = маска пикселя
; Портит A, BC, HL; DE цело.
GaugeByte
	IFDEF THINGAUGE
; ОТСЧЁТ СПРАВА НАЛЕВО (2026-08-27): пиксель i полосы лежит на экране в
; позиции 127-i. OXYGEN (остаток) прижат к правому краю и тает слева,
; DEPTH растёт от правого края влево.
	cpl
	and $7F			; 127 - i
	ENDIF
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

; Update Depth indicator
UpdateDepth
	LD A,(L5B03+1)		; get screen position on mini-map, row value
UpdateDepth1
	add a,a
	add a,a
	AND $7F			; 0..127
	LD DE,GAUGE_DEPTH
	LD HL,LDE55
	jp UpdateGauge		; полоса растёт вместе с глубиной

LDE55	DEFB $00	; прошлое значение полосы DEPTH
LDE57	DEFB $00	; прошлое значение полосы OXYGEN
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
	IFDEF THINGAUGE
LDE7E				; полоса показывает РАСХОД: пустая синяя заполняется красным
				; справа налево по мере траты кислорода (зеркало в GaugeByte)
	ELSE
LDE7E	xor $7F			; полоса показывает ОСТАТОК, а не расход: 127 - A
	ENDIF
	LD DE,GAUGE_OXY
	LD HL,LDE57
	jp UpdateGauge

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
	ld a,c			; C := C*8 (развёрнутый SLA C x3); A и флаги дальше
	add a,a			; мертвы: A перезапишет LD A,(HL) в LDEC7, флаги — dec b
	add a,a
	add a,a
	ld c,a
	LD HL,ROM_CHARSET+$80		; +$80 = глиф '0': код $30, по 8 байт на глиф
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
	IFDEF THINGAUGE
	LD DE,$C627+512*HUDX	; HIGH — третья строка HUD (27), столбец 6+2*HUDX
	ELSE
	LD DE,$C637
	ENDIF
	CALL PrintDec		; Print decimal number
	RET

; Print score number
PrintScore
	LD B,$00
	LD HL,(SCORE)		; get Score number
	IFDEF THINGAUGE
	LD DE,$C637+512*HUDX	; SCORE — первая строка HUD (25), столбец 6+2*HUDX
	ELSE
	LD DE,$D637
	ENDIF
	CALL PrintDec		; Print decimal number
	RET

; Print HELD number
PrintHeld
	LD B,$02
	LD HL,(HELD)		; get HELD value
	LD DE,$C82F+512*HUDX	; HELD — вторая строка HUD (26), столбец 8+2*HUDX.
			; На два столбца правее SCORE и на два разряда короче (B=$02
			; выше), поэтому последняя цифра HELD стоит ровно под последней
			; цифрой SCORE (владелец, 2026-08-29); было со столбца 6+2*HUDX
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
	ld hl,LDF01
	ld (z80_iy),hl
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
	ld a,(DiverObj+$04)
	ld e,a
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
	ld a,(DiverObj+$05)
	ld e,a
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
	ld a,(DiverObj+$06)
	ld h,a
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
	ld a,L
	rra
	ld L,a
	ld a,(il_a)
	LD DE,SprDiver0		; Diver sprites base address
	ADD HL,DE		; now HL = diver sprite address
DvSprCalc:			; метка для замеров: здесь HL = адрес кадра дайвера
	ld (il_a),a
	ld a,h
	ld (DiverObj+$0A),a
	ld a,h
	ld (DiverObj+$0C),a
	ld a,l
	ld (DiverObj+$09),a
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
	ld a,(DiverObj+$07)
	ld e,a
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
; ЭТАП G3 (2026-08-28): кадр ныряльщика обходится ПОСТРОЧНО — 24 строки по три
; байта, строка развёрнута. Указатели буфера (DE) и маски (BC) идут подряд по
; одному байту (было: по три на байт и откат на столбец), экран — inc h внутри
; строки и откат на два столбца в конце; счётчик — сравнение L с концом
; знакоместной строки раз на три байта. ~130 тактов на байт против ~180.
; Задетые клетки копятся битами в dhit и записываются в список LDF0F после
; знакоместной строки в том же порядке (столбцы 0,1,2), что и прежний обход по
; столбцам. Побочные поля DiverObj+$18/$19 ведутся, как раньше.
	IFDEF BLUESHARK
; Проверка соседней плоскости: три площадки LE_P2_k патчатся раз на отрисовку:
; без синего — сразу LE_Ck; верхний экран — LE_E2Tk (ватерлиния и небо не
; препятствие); глубина — LE_E2Dk.
	push de			; DE = буфер старого кадра — ниже он затирается
	ld hl,LE_p2tab		; строка таблицы: 0 — без синего, 6 — верх, 12 — глубина
	ld a,(blue_on)
	or a
	jp z,LE21A_p
	ld de,12
	add hl,de
	ld a,(L5B03+1)
	or a
	jp nz,LE21A_p
	ld de,-6
	add hl,de
LE21A_p:
	ld e,(hl)
	inc hl
	ld d,(hl)
	inc hl
	ex de,hl
	ld (LE_P2_0+1),hl
	ex de,hl
	ld e,(hl)
	inc hl
	ld d,(hl)
	inc hl
	ex de,hl
	ld (LE_P2_1+1),hl
	ex de,hl
	ld e,(hl)
	inc hl
	ld d,(hl)
	ex de,hl
	ld (LE_P2_2+1),hl
	pop de
	jp LE21A
LE_p2tab:
	DEFW LE_C0,LE_C1,LE_C2
	DEFW LE_E2T0,LE_E2T1,LE_E2T2
	DEFW LE_E2D0,LE_E2D1,LE_E2D2
	ENDIF
LE21A:
	ld a,3
	ld (dv_rows),a		; три знакоместные строки
	ld a,(DiverObj+$00)
	ld (DiverObj+$18),a	; set Column
	LD L,A
	ld a,(DiverObj+$19)
	ld h,a
	CALL GetScrAddrF		; HL = экран: столбец кадра, верхняя строка
	push hl
	ld hl,(z80_iy)
	ld b,h
	ld c,l			; BC = маска (новый кадр), DE = буфер (старый)
	pop hl
LE21C:
	xor a
	ld (dhit),a
	ld a,l
	sub 8
	ld (LE_rowend+1),a	; конец знакоместной строки (код в ОЗУ)
LE_row:
; --- байт 0 строки ---
	LD A,(DE)		; буфер (старый кадр)
	XOR (HL)		; t = буфер XOR экран = фон под старым кадром
	LD (HL),A		; t на экран — временный операнд
	ld a,(bc)		; маска (новый кадр)
	and (hl)		; маска AND t
	call nz,LE_hit0
	IFDEF BLUESHARK
LE_P2_0	jp LE_C0		; операнд патчится в LE21A: LE_E2T0 / LE_E2D0 / LE_C0
LE_E2T0:				; верхний экран: ватерлиния и небо — не препятствие
	ld a,l
	cp BLUE_WATER_LO
	jp nc,LE_C0
LE_E2D0:				; соседняя плоскость (синие существа)
	ld a,h
	xor 20h
	ld h,a
	ld a,(bc)
	and (hl)
	jp z,LE_N0
	ld a,(dhit)
	or 1
	ld (dhit),a
LE_N0:
	ld a,h
	xor 20h
	ld h,a
	ENDIF
LE_C0:
	ld a,(bc)		; маска
	xor (hl)		; маска XOR t
	LD (HL),A
	INC DE
	inc bc
	inc h			; следующий столбец
; --- байт 1 строки ---
	LD A,(DE)		; буфер (старый кадр)
	XOR (HL)		; t = буфер XOR экран = фон под старым кадром
	LD (HL),A		; t на экран — временный операнд
	ld a,(bc)		; маска (новый кадр)
	and (hl)		; маска AND t
	call nz,LE_hit1
	IFDEF BLUESHARK
LE_P2_1	jp LE_C1		; операнд патчится в LE21A: LE_E2T1 / LE_E2D1 / LE_C1
LE_E2T1:				; верхний экран: ватерлиния и небо — не препятствие
	ld a,l
	cp BLUE_WATER_LO
	jp nc,LE_C1
LE_E2D1:				; соседняя плоскость (синие существа)
	ld a,h
	xor 20h
	ld h,a
	ld a,(bc)
	and (hl)
	jp z,LE_N1
	ld a,(dhit)
	or 2
	ld (dhit),a
LE_N1:
	ld a,h
	xor 20h
	ld h,a
	ENDIF
LE_C1:
	ld a,(bc)		; маска
	xor (hl)		; маска XOR t
	LD (HL),A
	INC DE
	inc bc
	inc h			; следующий столбец
; --- байт 2 строки ---
	LD A,(DE)		; буфер (старый кадр)
	XOR (HL)		; t = буфер XOR экран = фон под старым кадром
	LD (HL),A		; t на экран — временный операнд
	ld a,(bc)		; маска (новый кадр)
	and (hl)		; маска AND t
	call nz,LE_hit2
	IFDEF BLUESHARK
LE_P2_2	jp LE_C2		; операнд патчится в LE21A: LE_E2T2 / LE_E2D2 / LE_C2
LE_E2T2:				; верхний экран: ватерлиния и небо — не препятствие
	ld a,l
	cp BLUE_WATER_LO
	jp nc,LE_C2
LE_E2D2:				; соседняя плоскость (синие существа)
	ld a,h
	xor 20h
	ld h,a
	ld a,(bc)
	and (hl)
	jp z,LE_N2
	ld a,(dhit)
	or 4
	ld (dhit),a
LE_N2:
	ld a,h
	xor 20h
	ld h,a
	ENDIF
LE_C2:
	ld a,(bc)		; маска
	xor (hl)		; маска XOR t
	LD (HL),A
	INC DE
	inc bc
	dec l			; следующая пиксельная строка
	ld a,h
	sub 2
	ld h,a			; назад в первый столбец кадра
	ld a,l
LE_rowend	cp 0
	jp nz,LE_row
; задетые клетки этой знакоместной строки — в список LDF0F
	ld a,(dhit)
	or a
	jp z,LE_next
	push hl
	push bc
	or 020h			; маркер: после трёх поворотов встанет в бит 2
	ld c,a
	ld a,(DiverObj+$18)
	ld b,a			; столбец клетки
	ld hl,(LDF0F)
LE_recl:
	ld a,c
	rrca			; бит столбца -> CY
	ld c,a
	jp nc,LE_recn
	ld a,(DiverObj+$19)
	ld (hl),a		; строка
	inc hl
	ld (hl),b		; столбец
	inc hl
LE_recn:
	inc b
	ld a,c
	and 4
	jp z,LE_recl		; три столбца
	ld (LDF0F),hl
	pop bc
	pop hl
LE_next:
	ld a,(DiverObj+$19)
	inc a
	ld (DiverObj+$19),a	; one Row down
	ld a,(dv_rows)
	dec a
	ld (dv_rows),a
	jp nz,LE21C
	ld a,(DiverObj+$18)
	add a,3
	ld (DiverObj+$18),a	; как после прежнего обхода: столбец + 3
	ld h,b
	ld l,c
	ld (z80_iy),hl		; тень маски: + 72, как раньше
	jp LE_done
LE_hit0:
	ld a,(dhit)
	or 1
	ld (dhit),a
	ret
LE_hit1:
	ld a,(dhit)
	or 2
	ld (dhit),a
	ret
LE_hit2:
	ld a,(dhit)
	or 4
	ld (dhit),a
	ret
LE_done:
	LD HL,(LB7B9)
	ld (il_hl),hl
	ld hl,(L5B35)
	ld c,l
	ld b,h
	ld hl,(il_hl)
	ld (il_a),a
	ld a,(DiverObj+$08)
	ld d,a
	ld a,(DiverObj+$07)
	ld e,a
	ld a,c
	ld (LB7B9),a
	ld a,b
	ld (LB7B9+1),a
	ld a,e
	ld (L5B35),a
	ld a,d
	ld (L5B35+1),a
	ld a,h
	ld (DiverObj+$08),a
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
; `ei` СНЯТ (2026-08-30; у автора он был помечен «to make keyboard working»).
; Он был страховкой от того, что сюда придут с закрытыми прерываниями.
; Приходят не так: единственный вызывающий — LE2CC (из LE2A8, из главного цикла
; LD9C0), а туда управление попадает только ПОСЛЕ EI, закрывающего окно
; подготовки партии в Game. Титул, который раньше действительно зависел от этого
; `ei`, давно зовёт DecodeKeyboard со своим `ei` (scubacod1.asm, WaitAnyKey).
; ДОКАЗАНО ЗАМЕРОМ (tools/verify/iff_probe.js, боевая сборка, шесть сцен: меню,
; демо, игра ур.1 и ур.4, game over -> меню, полный заплыв с гибелями):
; 741 исполнение этой точки, IFF=1 во ВСЕХ, IFF=0 ни разу.
	call z80_bitX
	defb $10
	and 1<<(3)
	ld a,(il_a)
	RET NZ
	call DecodeKeyboard
	ld d,a
	call z80_lde_X	; get Angle
	defb $06
	ld (il_a),a
	and 1<<(2)
	ld a,(il_a)
	jp z,LE2F1	;JR NZ,LE2F1		; not pressed => skip rotate
; Clockwise key pressed
	INC E			; rotate clockwise
LE2F1
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
LE31F
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
	ld a,l
	ld (DiverObj+$0B),a
	ld a,h
	ld (DiverObj+$0A),a
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
; Z ПО СТАРШЕМУ БАЙТУ (см. правило в шапке файла): «сундук вошёл ровно» здесь
; сработает не только на разности 0, но и на любой разности 1..255.
; БЕЗВРЕДНО ПО ТАБЛИЦЕ ЦЕН LDDF0. Разность = (ёмкость L5B33 − HELD) − цена, а
; ёмкость НЕ ПРЕВЫШАЕТ ни одной из двух цен своего уровня — снято прямо из
; памяти после InitLevelVars на всех четырёх уровнях:
;   ур.1 ёмкость 25 при ценах 75/25 -> макс. разность  0
;   ур.2 ёмкость 50 при ценах 50/150 -> макс. разность  0
;   ур.3 ёмкость 75 при ценах 150/225 -> макс. разность −75
;   ур.4 ёмкость 100 при ценах 100/200 -> макс. разность  0
; HELD неотрицателен, значит (ёмкость − HELD) ≤ ёмкость, и разность всегда ≤ 0:
; либо ровно ноль (сундук забирает остаток ёмкости целиком) — это и есть
; законный случай Z, либо отрицательная, и тогда решает C, а он верен.
; ASSERT здесь невозможен: цены лежат в DEFW-таблице LDDF0, а её содержимое
; ассемблер не читает — сторожем служит только этот разбор.
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
	ld a,l
	sbc a,c
	ld l,a
	ld a,h
	sbc a,b
	ld h,a
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
LE682:
	IFDEF BOATFAST
	push hl
	ld hl,boat_key
	ld (hl),0FFh		; источник кадра лодки меняется — ключ сборки сброшен
	pop hl
	ENDIF
	OR A
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
	LD DE,SprBoat+60	; кадр лодки: 7 байт в строке, 60 = строка 8, байт 4 —
				; левый верхний угол места дайверов. Шесть строк по
				; два байта, шаг строки 7 (ниже LD BC,$0005 после двух inc)
LE69C	PUSH BC
	ld a,(hl)		; copy pixels; A мёртв у обоих вызывающих LE682,
	ld (de),a		; dec bc мертвы: BC целиком задаёт LD BC,$0005
	inc hl
	inc de
	ld a,(hl)
	ld (de),a
	inc hl
	inc de
	LD BC,$0005
	EX DE,HL
	ADD HL,BC
	EX DE,HL
	POP BC
	dec b
	jp nz,LE69C
	RET

LE6AB:
	ld hl,DiverObj
	ld (z80_ix),hl
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
	ld a,$FE
	ld (DiverObj+$11),a
	ld a,$00
	ld (DiverObj+$12),a
	ld a,$00
	ld (DiverObj+$0D),a
	ld a,$06
	ld (DiverObj+$01),a
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
	ld a,$00
	ld (DiverObj+$04),a
	ld a,$00
	ld (DiverObj+$05),a
	ld a,$00
	ld (DiverObj+$28),a
	ld a,$06
	ld (DiverObj+$1A),a
	ld a,$00
	ld (DiverObj+$10),a
	ld a,$14
	ld (DiverObj+$0E),a
	ld a,$00
	ld (DiverObj+$12),a
	ld a,$FF
	ld (DiverObj+$11),a
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
	ld a,$02
	ld (DiverObj+$0F),a
	ld a,(il_a)
LE759	LD HL,SprDiverSit	; Sprite diver sitting on the boat
	ld (il_a),a	; set sprite address
	ld a,l
	ld (DiverObj+$24),a
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
	ld a,$03
	ld (DiverObj+$20),a
	ld a,$03
	ld (DiverObj+$0F),a
	ld a,$00
	ld (DiverObj+$04),a
	ld a,$00
	ld (DiverObj+$05),a
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
LE78C
; `ei` СНЯТ (2026-08-30; у автора помечен «to make keyboard working») по той
; же причине, что и близнец в ReadKeyboard: сюда приходят только из тракта
; дайвера (LE767), то есть из главного цикла, где прерывания уже открыты.
; ЗАМЕР (tools/verify/iff_probe.js): 229 исполнений этой точки, IFF=1 во всех.
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
	ld a,$02
	ld (DiverObj+$05),a
	ld a,(il_a)
	push af
	ld a,(DiverObj+$26)
	or 1<<(1)
	ld (DiverObj+$26),a
	pop af
	RET
LE7C2	LD HL,SprDiver1		; Sprite diver directing up-right
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
	ld a,(DiverObj+$24)
	ld l,a
	ld a,(il_a)
	LD BC,$0020
	ADD HL,BC
	ld (il_a),a	; set sprite address
	ld a,l
	ld (DiverObj+$24),a
	ld a,h
	ld (DiverObj+$25),a
	ld a,(il_a)
	LD DE,L9C4C		; address right after last diver sprite
; Z ПО СТАРШЕМУ БАЙТУ (см. правило в шапке файла): здесь Z означает не «адрес
; равен L9C4C», а «адрес попал в L9C4C .. L9C4C+255». Указатель растёт шагом $20
; от SprDiverSit (или SprDiverClimb), поэтому опасен ровно один случай —
; ПЕРЕЛЁТ через ограничитель. Его не бывает, пока длина ряда кратна шагу:
	ASSERT ((L9C4C-SprDiverSit) % 20h) == 0		; ряд кончается РОВНО на ограничителе
	ASSERT ((L9C4C-SprDiverClimb) % 20h) == 0	; и от второго возможного начала тоже
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
	ld a,$00
	ld (DiverObj+$04),a
	ld a,$00
	ld (DiverObj+$05),a
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
	LD BC,$0080
	ADD HL,BC
	call z80_stl_X	; set sprite address
	defb $24
	call z80_sth_X
	defb $25
	LD DE,SprDiver5
; Z ПО СТАРШЕМУ БАЙТУ (см. правило в шапке файла): Z здесь означает «указатель
; попал в SprDiver5 .. SprDiver5+255». Указатель растёт шагом $80 от SprDiver1
; (LE7C2), значит опасен только перелёт — а его нет, пока расстояние кратно шагу:
	ASSERT ((SprDiver5-SprDiver1) % 80h) == 0	; ряд кончается РОВНО на ограничителе
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
; ЗДЕСЬ СТОЯЛО `;TODO: UpdateLives` (и над ним — закомментированная ZX-версия,
; двигавшая указатель LDE59 по атрибутам). Пока его не было, HUD врал: жизнь
; прибавлялась, а подсвеченная цифра оставалась прежней до следующей смерти,
; когда PrepareGame перерисовывала панель заново. Ячейка LDE59 так и остаётся
; мёртвой: наша подсветка считает адрес клетки, а не хранит его.
	LD HL,LIVES		; address for Number of lives
	LD A,(HL)		; get number of lives
	INC (HL)		; one more live
	PUSH BC
	CALL LE682		; Draw Divers on the Boat
	CALL UpdateLives	; подсветка переезжает на новую цифру (A уже мёртв)
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

; [МУСОР 3/5] ZX-ПЛЕЕР МЕЛОДИИ УДАЛЁН — 92 Б памяти, 76 Б образа.
; Здесь лежал блок LECEB..LED1C: опрос клавиатуры через `in a,(0)` и цикл по
; тройкам нот с `CALL ROM_BEEPER`. В нашей сборке ROM_BEEPER — однобайтовая
; заглушка `ret`, а мелодии давно отдаются драйверу ВИ53 (PlayMelody -> snd_start,
; scubacod0.asm), поэтому блок не издавал ни звука.
; Мёртв по обоим признакам сразу: за 12 сцен спектра ноль исполнений, и слова
; 0x94E4 в образе нет ни одного — ни `call`, ни `jp` на LECEB в исходнике нет,
; а стоящий выше LEADE кончается `ret`. Внутренние метки (LECFA, LED02, LED1C)
; ссылались только друг на друга, из-за чего автоматический скан помечал блок
; «грязным»: сканом можно только отвергать подозрение, а снял его разбор кода.
; Разбор: docs/memory_audit.md §2.
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
	IFDEF MENUHUD
; МЕНЮ ПОД HUD (2026-08-27, предложение владельца): HUD рисуется сразу, как в
; игре, с реальным рекордом; выбранный SKILL подсвечивается прямо в HUD
; (MenuSkillMark), а текст лежит в окне поля — знакоместные строки 8..31.
LEDFE:
	call DrawHud		; неподвижная часть HUD: рамка, подписи, корыта, цифры 1 2 3 4
	CALL PrintHighScore	; рекорд — в HUD
	CALL PrintScore		; и нули SCORE/HELD, чтобы HUD не стоял полупустым
	CALL PrintHeld
	LD HL,StrBigTitle
MenuBigPos:				; операнд MenuBigPos+1 — точка подсадки гейта столбцов
	LD BC,MENU_TITLE_ROW*256+6	; столбец 6: 10 знаков по два столбца = 6..25
	CALL PrintBig
	call MenuTitleInk	; заголовок коралловый
	LD HL,MenuStr1
	LD BC,(MENU_Y+4)*256+0		; 31 знак со столбца 0
	CALL PrintString
	inc hl			; MenuStr2
	LD BC,(MENU_Y+5)*256+3		; 25 знаков, центр
	CALL PrintString
	inc hl			; MenuStr3
	LD BC,(MENU_Y+6)*256+8		; 15 знаков, центр
	CALL PrintString
	inc hl			; MenuStr4 — CONTROLS
	LD BC,(MENU_Y+8)*256+1
	CALL PrintString
	inc hl			; MenuStr5 — ROTATE
	LD BC,(MENU_Y+9)*256+1
	CALL PrintString
	inc hl			; MenuStr6 — ACCELERATE
	LD BC,(MENU_Y+10)*256+1
	CALL PrintString
	inc hl			; MenuStr7 — DECELERATE
	LD BC,(MENU_Y+11)*256+1
	CALL PrintString
	inc hl			; MenuStr8 — выбор уровня
	LD BC,(MENU_Y+14)*256+3
	CALL PrintString
	inc hl			; MenuStr9 — старт
	LD BC,(MENU_Y+15)*256+6
	CALL PrintString
	IFDEF MENUART
	call DrawMenuBottom	; риф, ракушки, кислород, сундук под текстом (scubamenu.asm)
	ENDIF
LEE07:	call MenuSkillMark	; подсветка выбранного SKILL в HUD (сюда же по нажатию 1..4)
	EI
	ELSE
LEDFE:
; СКЛЕЙКА ЭКРАНОВ: заголовок и строки версии переехали сюда с бывшего первого
; экрана, который после снятия титульной картинки остался пустым.
	LD HL,StrBigTitle
; СТОЛБЕЦ ЗАГОЛОВКА. 10 знаков по два столбца = 20 столбцов, столбец 6 — центр
; 32-столбцового экрана.
MenuBigPos:				; операнд MenuBigPos+1 — точка подсадки гейта столбцов
	LD BC,$0100+MENU_BIGCOL
	CALL PrintBig
	LD HL,StrTitle1
	LD BC,$0401		; строка 4, столбец 1
	CALL PrintString
	LD HL,StrTitle2
	LD BC,$0500		; строка 5, столбец 0: строка автора ровно 32 знака,
				; со столбца 1 последний ушёл бы в плоскость 0xE000
	CALL PrintString
	LD HL,StrControls
	LD BC,$0800		; row, column
	;LD DE,PrintCharRt	; Procedure Print char and shift right
	CALL PrintString
	inc HL ;LD HL,StrControls1
	LD BC,$0900		; row, column
	CALL PrintString
	inc HL ;LD HL,StrControls2
	LD BC,$0B00		; row, column
	CALL PrintString
	inc HL ;LD HL,StrControls3
	LD BC,$0C00		; row, column
	CALL PrintString
	inc HL ;LD HL,StrControls4
	LD BC,$0D02		; row, column
	CALL PrintString
	inc HL ;LD HL,StrControls5
	LD BC,$0E00		; row, column
	CALL PrintString
	inc HL ;LD HL,StrControls6
	LD BC,$0F02		; row, column
	CALL PrintString
	inc HL ;LD HL,StrPrompt1
	LD BC,$1500		; row, column
	CALL PrintString
	inc HL ;LD HL,StrPrompt2
	LD BC,$1600		; row, column
	CALL PrintString
LEE07:	LD HL,StrSkill		; "SKILL"
	LD BC,$1204		; row, column
	;LD DE,PrintCharRt	; Procedure Print char and shift right
	CALL PrintString
	EI
	ENDIF

LEE1C
; Сброс таймера простоя перед циклом меню; защита от УДЕРЖАННОЙ кнопки, которой
; игрок вышел из заставки, — WaitUnpress (scubacod1.asm), не здесь (в исходнике
; тут стоял ;TODO: WaitKeyUp).
	LD HL,$0000
	LD (FRAMES),HL		; reset FRAMES - Frame counter
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
	CALL ClearFieldFillAttr	; только поле: HUD остаётся на всё демо (владелец, 2026-08-29)
;	LD A,$01
;	OUT ($FE),A
	ld (il_hl),hl
	ld hl,(z80_ix)
	push hl
	ld hl,(z80_iy)
	push hl
	ld hl,(il_hl)
; ДИСЦИПЛИНА ПРЕРЫВАНИЙ ДЕМО. Окно DI..EI закрывает ровно ту же подготовку, что и
; в Game: PrepareMiniMap, InitLevelVars, LBEDB, DrawGameScr. Открывать их ОБЯЗАНО
; именно демо: выйти из него можно только по клавише, а клавиатуру сканирует
; KEYINT — оставь прерывания закрытыми, и стартовый экран умрёт навсегда (ровно
; это и было дефектом d7664ebb). Раньше открытие делал `ei` в хвосте DrawGameScr
; — в другом файле; теперь пара видна здесь целиком.
; ЗАМЕР окна (tools/verify/iff_probe.js): KEYINT молчит 307 кадров — это ~6 с
; чёрного экрана перед демо, поведение авторское и не менялось.
	DI
	CALL PrepareMiniMap	; Prepare the world MiniMap table
	CALL InitLevelVars	; Initialize variables depending of LEVEL
	CALL LBEDB
	LD HL,$0518
	LD (L5B03),HL		; set Screen position on mini-map
	CALL DrawGameScr	; Draw game screen
	EI			; парный к DI выше: без него из демо не выйти
	LD BC,$1405		; row/column
	;LD DE,PrintCharRt	; Procedure Print char and shift right
	LD HL,StrPressAny	; "PRESS ANY KEY"
	CALL PrintString	; Print string
	CALL LBDBA
	ld (il_hl),hl
	pop hl
	ld (z80_iy),hl
	pop hl
	ld (z80_ix),hl
	ld hl,(il_hl)
LEF12:
	ld (il_hl),hl
	ld hl,(z80_ix)
	push hl
	ld hl,(z80_iy)
	push hl
	ld hl,(il_hl)
	CALL LB213
	CALL LBDEA
	ld (il_hl),hl
	pop hl
	ld (z80_iy),hl
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
; ИНВАРИАНТ: LEEAD вызывается РОВНО ИЗ ОДНОГО МЕСТА (LEE2C, цикл ожидания в меню)
; и ровно одним уровнем вложенности — всё демо живёт внутри этого CALL. Возврат
; в меню идёт не через RET, а прыжком на LEDFE, поэтому адрес возврата в LEE2C
; снимается со стека здесь; иначе стек рос бы на два байта за каждый заход в
; демо. Появится второй вызывающий — снятие станет неверным.
	pop hl			; адрес возврата из LEEAD (в цикл ожидания LEE2C)
	jp LEDFE		; redraw the menu signs and wait for input

