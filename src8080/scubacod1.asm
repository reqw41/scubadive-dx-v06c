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
; НАДПИСИ МЕНЮ НЕ ЗАХОДЯТ ЗА СТОЛБЕЦ 23.
; Столбцы 24..31 — битмап панели Зимина, и чистка экрана их НЕ ТРОГАЕТ (клип по
; столбцам в ClearScreen, там же и объяснение — иначе панель приходилось бы
; распаковывать заново на каждой постановке уровня). Значит всё, что меню
; напечатает правее столбца 23, не стирает никто НИКОГДА: при старте игры куски
; заголовка и строк версии остаются висеть поверх панели. Ровно это владелец и
; видел на железе.
; Замер до правки (tools/verify/menucols_gate.js): 242 записи пикселей и столько
; же записей цвета в столбцы 24..31 от PrintChar, плюс 88 от PrintBigChar.
; Кто заходил за 23: заголовок 2x2 «SCUBA DIVE» со столбца 6 (10 знаков по два
; столбца = 6..25) и обе строки версии по 29 знаков (0..28 и 1..29).
; Правка — перепись координат и укорочение строк, без гашения панели: владелец
; принял её видимой и в меню.
	IFNDEF MENUHUD
StrTitle1
	ABYTE	-$20 "SPECTRUM VERSION 1983 DURRELL"
	BYTE	$FF
	ENDIF
StrBigTitle
	ABYTE	-$20 "SCUBA DIVE"
	BYTE	$FF
	IFNDEF MENUHUD
StrTitle2
	ABYTE	-$20 "I8080 PORT - NZEEMIN Z80 BASE"
	BYTE	$FF
	ENDIF
	IFNDEF MENUHUD
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
	ENDIF
	IFDEF MENUHUD
; Строки меню под HUD: все не длиннее 32 знаков, столбцы заданы в LEDFE.
MenuStr1
	ABYTE	-$20 "VECTOR-06C PORT 2026 BY NZEEMIN"	; 31
	BYTE	$FF
MenuStr2
	ABYTE	-$20 "BASED ON ZX SPECTRUM 1983"		; 25
	BYTE	$FF
MenuStr3
	ABYTE	-$20 "DURELL SOFTWARE"			; 15
	BYTE	$FF
MenuStr4
	ABYTE	-$20 "CONTROLS: KEYBOARD OR JOYSTICK"	; 30
	BYTE	$FF
MenuStr5
	ABYTE	-$20 "ROTATE      LEFT/RIGHT"		; 22
	BYTE	$FF
MenuStr6
	ABYTE	-$20 "ACCELERATE  UP/US/SS/RUSLAT/ZB"	; 30
	BYTE	$FF
MenuStr7
	ABYTE	-$20 "DECELERATE  DOWN/SPACE/TAB"		; 26
	BYTE	$FF
MenuStr8
	ABYTE	-$20 "PRESS 1-4 TO SELECT SKILL"		; 25
	BYTE	$FF
MenuStr9
	ABYTE	-$20 "ACCELERATE TO START"			; 19
	BYTE	$FF
	ENDIF

; ---- ХОЛОДНЫЙ КОД И ДАННЫЕ, ВЫНЕСЕННЫЕ ПОД ПОТОЛОК 0xA000 (2026-08-27) ------
; Код упирался в потолок 0xA000; всё, что не зависит от собственного адреса,
; переехало сюда — в область до ALIGN 256, где есть запас. Здесь не только
; таблицы и строки: рядом лежит и КОД — редкие и холодные пути, которым место в
; горячем теле не нужно. КТО ЗОВЁТ — перечислено у каждого куска: искать
; вызывателя по всему дереву не надо.
; SH_lotab — данные: маска FF>>k, читает настройка прохода SH_k (scubacodb.asm).
; Цепочка rrca + SH_rot0 — КОД, вход в неё ВЫЧИСЛЯЕТСЯ: `call SH_rot0` в SH_k
; (scubacodb.asm) патчится на SH_rot0-k, то есть k поворотов, а сама цепочка
; кончается ret. Сводка самомодификаций — в шапке scubacodb.asm.
SH_lotab:
	DEFB 0FFh,07Fh,03Fh,01Fh,00Fh,007h,003h,001h,000h	; FF>>k, k=0..8
	rrca
	rrca
	rrca
	rrca
	rrca
	rrca
	rrca
	rrca			; вход SH_rot0-k = k поворотов
SH_rot0:
	ret
	IFDEF SKYFILL
	IFDEF SKYGRAD
SKY_TAB:			; строка 191 (верх) — первая. Градиент сжат в верхние 36 строк,
				; нижние 28 — сплошная синева: там стоит лодка (строки 41..63 неба)
	DEFB 000h,000h,011h,000h,000h	; 1/16
	DEFB 011h,000h,044h,000h,011h	; 1/8
	DEFB 011h,044h,011h,044h,011h	; 1/4
	DEFB 055h,022h,055h,088h,055h	; 3/8
	DEFB 055h,0AAh,055h,0AAh,055h	; 1/2
	DEFB 077h,0DDh,077h,0DDh,077h	; 3/4
	DEFB 0FFh,0DDh,0FFh,077h,0FFh,0DDh	; 7/8
	DEFB 0FFh,0FFh,0FFh,0FFh,0FFh,0FFh,0FFh,0FFh	; сплошь
	DEFB 0FFh,0FFh,0FFh,0FFh,0FFh,0FFh,0FFh,0FFh
	DEFB 0FFh,0FFh,0FFh,0FFh,0FFh,0FFh,0FFh,0FFh
	DEFB 0FFh,0FFh,0FFh,0FFh
	ENDIF
	ENDIF
	IFDEF BLUESHARK
LB4F0_bluetab:
	DEFW LC0EA, LC102, LC182, LC19E, LC1BA, LC1D6	; рыба, акула, угорь x2, змея x2
BLUETAB_N	EQU 6
	ENDIF
	IFDEF MIRROR
; ТИПЫ, У КОТОРЫХ НАБОР «ВЛЕВО» НЕ ХРАНИТСЯ, А ПОЛУЧАЕТСЯ ОТРАЖЕНИЕМ.
; Список — из tools/verify/mirror_census.js, ровно те восемь, чьи зеркальные
; наборы сняты. Нужен потому, что признак зеркальности живёт в СТАРШЕМ БИТЕ
; базы набора, а этот бит НЕ СВОБОДЕН: под -DHIDVRAM кадры дайвера и взрыва
; лежат в скрытой плоскости 0xA000..0xAFF8, и у них бит 15 стоит сам собой.
; Без этой таблицы дайвер рисовался зеркально, стоило ему повернуться на набор
; из скрытой плоскости (замер: с 439-го тика, 45..64 % тиков на всех уровнях).
; Отличить по адресу нельзя: зеркальные наборы с признаком тоже попадают в
; 0xA000..0xAFFF (L8285 = 0x2B86 -> 0xAB86). Значит вопрос не «где лежит», а
; «бывает ли этот ТИП зеркальным», и ответ даёт только список.
LB4F0_mirtab:
	DEFW LC0B2, LC0EA, LC102, LC11A		; круглая рыба, рыба, акула, длинная рыба
	DEFW LC14A, LC182, LC1BA, LC1F2		; малый кальмар г., угорь г., змейка г., кальмар
MIRTAB_N	EQU 8
	ENDIF
	IFDEF REDINK
; КРАСНЫЕ ТИПЫ (-DREDINK). Дескрипторы тех, кто рисуется в ОБЕИХ плоскостях и
; потому получает индекс 3. Список — по решению владельца 2026-08-31: маленькие
; кальмары, горизонтальный и вертикальный. Формат тот же, что у синих: полный
; адрес дескриптора, а не диапазон — дескрипторы лежат в разных страницах, и
; сравнение по старшему байту однажды уже покрасило чужих (см. LB4F0).
LB4F0_redtab:
	DEFW LC14A, LC166			; малый кальмар: горизонтальный, вертикальный
REDTAB_N DEFL 2
	IFNDEF CLOUDINK
; Без -DCLOUDINK стайка красится ЦЕЛИКОМ: в блоке кадров лежит исходный кадр, и
; разделить особей по чернилам нечем. С флагом она идёт своим телом (LB500C) и
; в таблице красных ей делать нечего — иначе выбор тела достался бы красному.
	DEFW LC132				; стайка рыб — целиком, одним чернилом
REDTAB_N DEFL 3
	ENDIF
	IFDEF REDTEST
; ДИАГНОСТИЧЕСКИЙ ФЛАГ. Малых кальмаров стенд не показывает: они живут в группах,
; до которых дайвера довести нечем (разбор — oracle.js, сценарий deep). Проверять
; тракт красного на невидимом существе нельзя, поэтому под -DREDTEST в таблицу
; добавляется круглая рыба — самый массовый тип в сценах стенда (15..38 особей).
	DEFW LC0B2				; круглая рыба — только для гейтов
REDTAB_N DEFL REDTAB_N+1
	ENDIF
	ENDIF
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
; рабочие ячейки вывода ныряльщика (ЭТАП G3)
dhit	DEFB 0		; биты задетых клеток текущей знакоместной строки (столбцы 0..2)
dv_rows	DEFB 0		; счётчик знакоместных строк кадра
	IFDEF MENUHUD
; Геометрия меню под HUD (HUD снизу): текст со строки 0, SKILL в строке 26.
MENU_Y		EQU 1		; текст в строках 5..16, HUD с 24-й
MENU_SKILL_ROW	EQU $1A
MENU_TITLE_ROW	EQU 1		; заголовок у самого верха (владелец, 2026-08-27)
; Заголовок SCUBA DIVE — коралловый: PrintBig пишет в 0xC000, здесь те же байты
; дублируются в 0xE000 (индекс 3 = ColorBoth). Область: столбцы 6..25, 16 строк.
; ЗОВЁТ меню LEDFE (scubacodc.asm) — один раз, при отрисовке экрана меню.
MenuTitleInk:
	ld h,$C6
MenuTitleInk_col:
	ld l,255-8*MENU_TITLE_ROW
	ld b,16
MenuTitleInk_row:
	ld a,(hl)
	ld d,a
	ld a,h
	xor $20
	ld h,a
	ld (hl),d
	xor $20
	ld h,a
	dec l
	dec b
	jp nz,MenuTitleInk_row
	inc h
	ld a,h
	cp $DA
	jp nz,MenuTitleInk_col
	ret
; Подсветка выбранного уровня в строке SKILL HUD на экране меню: четыре клетки
; цифр в строке MENU_SKILL_ROW ($1A = 26 — та же строка SKILL, что и в игре),
; столбцы 22+HUDX + (k-1)*2. Выбранная заливается в 0xE000 (как HighlightChar в
; игре), остальные гасятся; так повторное нажатие 1..4 не оставляет старую
; подсветку.
; ЗОВЁТ меню LEE07 (scubacodc.asm): при отрисовке экрана меню и по нажатию 1..4.
MenuSkillMark:
	ld a,(SkillChar)
	sub $10			; 1..4
	ld c,a
	ld b,1
MenuSkillMark_1:
	push bc
	ld a,b
	dec a
	add a,a
	add a,$16+HUDX		; столбец 22+HUDX + (k-1)*2 — как в GaugeInit
	ld l,a
	ld h,MENU_SKILL_ROW	; строка SKILL
	call GetScrAddr
	pop bc
	ld a,h
	xor $20
	ld h,a			; подсветка живёт в 0xE000
	ld a,b
	cp c
	ld a,0
	jp nz,MenuSkillMark_2
	ld a,$FF
MenuSkillMark_2:
	push bc
	ld b,8
MenuSkillMark_3:
	ld (hl),a
	dec l
	dec b
	jp nz,MenuSkillMark_3
	pop bc
	inc b
	ld a,b
	cp 5
	jp nz,MenuSkillMark_1
	ret
	ENDIF
; Редкий путь скана: счётчик дошёл до нуля — тень z80_ix на запись и LB737.
; B, DE и HL берегутся здесь, а не на каждой записи.
; ЗОВУТ развёртки сканов LBE48 и LBE75 (scubacodb.asm), по четыре call на
; развёртку; у третьей развёртки, LBEA2, свой SCAN_HIT21 — он остался там.
SCAN_HIT26:
	push bc
	push hl
	ld bc,0FFF1h		; -15: от поля +0x0F к началу записи
	add hl,bc
	ld (z80_ix),hl		; тень нужна ТОЛЬКО здесь — LB737 читает её
	CALL LB737
	pop hl
	pop bc
	ld de,001Ah		; LB737 мог затереть DE
	ret
StrSkill
SkillChar = StrSkill + 16
	ABYTE	-$20 "SKILL SELECTED: 1"
	BYTE	$FF
; StrGameOver
; 	ABYTE	-$20 "GAME OVER"
; 	BYTE	$FF

;----------------------------------------------------------------------------

; [МУСОР 5/5] WaitAnyKey СОБИРАЕТСЯ ТОЛЬКО В СБОРКЕ С ТИТУЛОМ — 16 Б.
; Единственный `call WaitAnyKey` стоит выше под `IFNDEF NOTITLE` (картинку надо
; кому-то показать и дождаться клавиши). В боевой сборке -DNOTITLE эта строка не
; ассемблируется вовсе — в листинге она помечена `~`, — а процедура оставалась.
; Слово 0x045E встречалось в образе РОВНО ОДИН раз, по адресу 0x0464, то есть в
; собственном `jp nz,WaitAnyKey` внутри неё самой: сторонних вызывателей нет.
; Скан помечал её грязной именно из-за этой самоссылки — сканом можно только
; отвергать подозрение, а снял его разбор листинга.
	IFNDEF NOTITLE
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

	ENDIF
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

; [D.0] Тело ZX-бипера УДАЛЕНО ещё раньше (90 Б). Оно лежало за безусловным ret и
; не исполнялось ни разу (профиль: 0 исполнений, JP (IX) внутри него тоже 0), а
; звук у нас давно аппаратный на ВИ53 (scubacod0.asm).
; [МУСОР 3/5] Теперь ушла и сама заглушка `ROM_BEEPER: ret` — 1 байт. Звать её
; стало некому: единственный `CALL ROM_BEEPER` жил внутри ZX-плеера мелодии
; LECEB..LED1C, вырезанного тем же заходом (scubacodc.asm).


	INCLUDE "scubasymb.asm"

;----------------------------------------------------------------------------
; Переменная системной области ZX, которой пользуется код игры. Её ZX-адрес
; ($1C05) в комментарий не вынесен намеренно: у нас это обычная ячейка, которую
; расставляет ассемблер, и адрес ZX-образа только сбивал бы с толку (см. такую
; же оговорку в шапке scubacoda.asm).

KSTATE5	DB 0	; последний код клавиши от DecodeKeyboard

;----------------------------------------------------------------------------

; Variables
	DISPLAY "Variables start: ", /A, $
	INCLUDE "scubacoda.asm"

	ALIGN 256
	INCLUDE "scubammap.asm" ; MiniMap

	ALIGN 256
; SCRATTR — ЭТО КАРТА ЗАНЯТОСТИ КЛЕТОК, А НЕ ЦВЕТА (подробно в README). Имя и
; значения ($02 рельеф, $06 свободно) достались от ZX-атрибутов, но на Векторе
; цвет задаёт палитра, а таблицу читает игровая логика: существа проверяют и
; метят свою клетку (LB6B4/LB71B), тракты ходоков спрашивают «клетка свободна?»
; (LB89F_attr, LB972_attr), дайвер — «под ногами рельеф?». Вырезать нельзя.
SCRATTR:
; РАЗМЕР $300 = 32 столбца x 24 строки: поле занимает знакоместные строки 0..23.
; Строк HUD (24..31) в таблице НЕТ, и это безопасно: перепись стенда (4 уровня по
; 12000 тиков + game over, меню и аттракт) показала, что к ним обращалась только
; печать символов HUD — запись атрибута под текстом, ни одного чтения. Печать для
; строк >= 24 атрибут больше не пишет (ранний выход в PrintChar по `cp $18`),
; поэтому за хвост таблицы — в код, который начинается сразу за ней, — никто не
; пишет.
	DS $300

; Столбец большого заголовка: центр 32 столбцов.
MENU_BIGCOL	EQU 6
; ---- БАЗА ПУЛА БУФЕРОВ SAVE-UNDER ------------------------------------------
; Раздатчик LB655 отдаёт индексу k ПОЛНУЮ СТРАНИЦУ 256 Б: `AND $0F / OR база`.
; Так было в стоке (0xB000..0xBFFF), и так снова сделано здесь — потому что
; буфер РЕАЛЬНО занимает до 256 байт: чистка LB48D/LB48E пишет (IY+$09)*(IY+$0A)
; байт безусловно, а по таблице шаблонов это 256 у лодки и акулы, 192 у кальмара,
; 168 у рыбы (замер tools/verify/poolfoot_probe.js, раздел 36 плана). Ломоть в
; 48 или 64 байта под такой буфер не годится ни при каком предикате.
POOL_HI		EQU 0B0h
	ALIGN 256
	INCLUDE "scubacodb.asm"
	;ALIGN 256
	INCLUDE "scubacodc.asm"

; Битмап боковой панели Зимина не подключается: HUD целиком рисуют DrawHud и
; PrintString.
SCUBACOD1_ENDA

; библиотека рекомпиляции Z80 -> i8080 (хелперы (IX+d), ГПСЧ вместо LD A,R,
; рабочие ячейки). Сгенерирована tools/z80to8080.py, дальше правится руками.
	INCLUDE "scubai80.asm"

; --- МОДУЛИ, КОТОРЫЕ РАНЬШЕ ЖИЛИ В ВЕРХНИХ СТРАНИЦАХ ПУЛА ------------------
; Оба модуля стояли ЗА SCUBACOD1_END, по фиксированным адресам 0xBE00 и 0xBF10,
; и держали занятыми две страницы пула буферов (14 и 15) вместе с DS-набивкой на
; полторы тысячи байт. Причина была одна: код упирался в потолок 0xA000 (Top был
; 0x9F61). После чистки мёртвой обвязки рекомпилятора места хватает, и модули
; переехали в обычный код: пул получил обратно две рабочие страницы, а образ —
; минус набивка. Ни одной привязки к адресу в самих модулях нет; единственный
; фиксированный адрес — BOAT_PAGE (кадр лодки), и он остаётся страницей 13 пула.
	IFDEF BOATFAST
; BOATFAST БОЛЬШЕ НЕ ЗАВИСИТ ОТ BLUESHARK, И ASSERT ЗДЕСЬ СНЯТ (2026-08-30).
; До правки диспетчер быстрого пути лодки читал blue_this и ждал там 2, а
; единственный, кто ставил двойку (BoatThis), стоял внутри блока IFDEF BLUESHARK.
; Без BLUESHARK взвода не было, и вся оснастка BOATFAST (страница BOAT_PAGE, кэш
; ключа сборки, столбцовый блит) попадала в образ, но не исполнялась НИ РАЗУ:
; образ рос, скорость оставалась прежней, и заметить это можно было только замером.
; Теперь диспетчер спрашивает IsBoatIY напрямую, и связки нет.
; ПРОВЕРЕНО СБОРКОЙ БЕЗ BLUESHARK: боевой набор минус BLUESHARK, с BOATFAST и без
; него, дают одинаковую видеопамять 600 тиков на уровнях 1 и 4 (romdiff_pix), а
; счётчик заходов в BoatCol на той же сцене ненулевой — то есть быстрый путь
; действительно исполняется и картинки не меняет.
	INCLUDE "scubaboat.asm"
	ENDIF
	IFDEF MENUART
	INCLUDE "scubamenu.asm"
	ENDIF
	IFDEF MIRROR
	INCLUDE "scubamirror.asm"	; отражённая сборка кадра из зеркального набора
	ENDIF
	IFDEF CURTAIN
	INCLUDE "scubacurtain.asm"	; шторка: экран собирается полосами в один тайл
	ENDIF
	IFDEF CLOUDINK
	INCLUDE "scubacloud_code.asm"	; тракт второй плоскости для стайки
	INCLUDE "scubacloud.asm"	; упакованные маски второй плоскости для стайки
	ENDIF

;----------------------------------------------------------------------------
SCUBACOD1_END
; --- СКРЫТАЯ ПЛОСКОСТЬ 1 (-DHIDVRAM): рельеф + дайвер + взрыв сплошняком -----
; Плоскость 0xA000 невидима (палитра периодом 4). Сюда уезжает то, что на main
; сидело в верхних 64 строках видимого ВЗУ. Видимые C000/E000 остаются картинкой:
; небо / вода / нижний HUD. Пул — как у Зимина, 0xB000..0xBFFF.
	IFDEF HIDVRAM
	ASSERT $ <= 0A000h
	DS 0A000h-$, 0
	INCLUDE "scubarelb.asm"		; LA4DD @ 0xA000, 30×64 = 1920
	INCLUDE "scubadivr.asm"		; SprDiver0 @ 0xA780, 16×128 = 2048
SprExplosion
	DEFB $01,$00,$01,$00,$10,$10,$08,$20,$00,$00,$20,$08,$00,$00,$00,$00	; explosion0
	DEFB $38,$38,$00,$00,$20,$08,$00,$00,$08,$20,$10,$10,$01,$00,$01,$00
	DEFB $00,$00,$00,$00,$05,$20,$21,$04,$11,$08,$00,$00,$00,$00,$C0,$03	; explosion1
	DEFB $00,$00,$00,$00,$11,$08,$21,$04,$05,$20,$00,$00,$00,$00,$00,$00
	IFDEF CLOUDS
; Облака (DrawClouds, scubacodb.asm): столбец в НЕБЕСНОЙ ПОЛОСЕ 0..63, строка от
; верха неба, ширина, высота, байты построчно сверху вниз; 0FFh — конец. Лежат в
; дыре перед пулом (0xAFC0..0xB000): под 0xA000 места нет. Полоса вдвое шире
; экрана; окно ездит по ней с параллаксом 1/4 от столбца карты, облако за краем
; экрана обрезается (не рвётся надвое, как при прежнем кольце mod 32).
CloudShapes:
	defb  4, 6, 4, 5		; широкое плоское
	defb 000h,03Eh,00Fh,080h
	defb 007h,0FFh,09Fh,0F0h
	defb 03Fh,0FFh,0FFh,0FCh
	defb 0FFh,0FFh,0FFh,0FFh
	defb 03Fh,0FFh,0FFh,0F0h
	defb 26, 3, 2, 4		; клочок
	defb 003h,0C0h
	defb 01Fh,0FCh
	defb 07Fh,0FFh
	defb 01Fh,0F8h
	defb 48, 12, 3, 5		; среднее, скошенное
	defb 000h,01Eh,000h
	defb 007h,0FFh,0C0h
	defb 03Fh,0FFh,0F8h
	defb 0FFh,0FFh,0FFh
	defb 03Fh,0FFh,0FCh
	defb 0FFh
	ENDIF
	ASSERT $ <= 0B000h
	DISPLAY "HIDVRAM data end: ", /A, $
	ENDIF
; СТОРОЖ ПОТОЛКА КОДА. Область $B000-$BFFF — рабочие буферы спрайтов времени
; выполнения (LB7B9 хранит там адрес, LBEC7 ставит HL=$B000, задержка LC4D7 тоже
; топчется в этом диапазоне). Код обязан закончиться ДО неё.
; Почему сторож нужен: ассемблер об этом не знает и молча выпускает образ, который
; собирается без единой ошибки, проходит сборочные проверки — и не запускается.
; Именно так и случилось при первом заходе специализации хелперов: +431 байт увели
; Top address на 0xB0F8, игра встала на главном цикле, и понять это можно было
; только по падению стенда.
	IFDEF HIDVRAM
	ASSERT SCUBACOD1_END <= 0A000h	; дыра DS до 0xA000, данные скрытой плоскости
	ENDIF
; ПУЛ БУФЕРОВ НАЧИНАЕТСЯ СРАЗУ ЗА КОДОМ: код обязан кончиться ДО POOL_HI*256,
; иначе первый же выданный буфер пишет по коду. Раньше это свойство держалось
; только приёмочным правилом «Top < 0xA000», теперь его держит ассемблер.
	ASSERT SCUBACOD1_END <= POOL_HI*256
	DISPLAY "Top address: ", /A, SCUBACOD1_END
	OUTEND
	END