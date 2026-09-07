; ШИРИНА ПОЛЯ В ЗНАКОМЕСТАХ (-DWIDE=1: 32, четыре блока рельефа; штатно 24).
; ИНВАРИАНТ: ВСЯ горизонтальная геометрия поля выражена через FIELD_W /
; FIELD_COL0, числа 24 и $C4 в проверках столбцов не встречаются. Проверки СТРОК
; остаются жёсткой 24-й: поле — знакоместные строки 0..23 при любой ширине.
	IFDEF WIDE
FIELD_W		EQU 32
FIELD_BLOCKS	EQU 4
FIELD_COL0	EQU $C0		; поле начинается со столбца 0
	ELSE
FIELD_W		EQU 24
FIELD_BLOCKS	EQU 3
FIELD_COL0	EQU $C4		; поле начинается со столбца 4
	ENDIF
;----------------------------------------------------------------------------
; САМОМОДИФИКАЦИЯ ОПЕРАНДОВ — ПОЛНЫЙ СПИСОК ПЛОЩАДОК (сводка, 2026-08-30).
; Все они лежат в ОЗУ (код игры распаковывается туда), патч всегда делается ДО
; входа в цикл, который эту площадку исполняет, и живёт до следующего патча.
;
;   площадка          | кто пишет                  | что пишет
;   ------------------+----------------------------+---------------------------
;   SH_b1..SH_b7 +2   | SH_k (настройка прохода)   | SH_rot0-k: вход в цепочку
;                     |                            | RRC, k поворотов до RET
;   SH_b1..SH_b7 +6   | SH_k                       | FF>>k из SH_lotab: маска
;                     |                            | младших битов после поворота
;   SH_row+1          | SH_ent_d                   | SH_b{w}: вход в развёртку
;                     |                            | строки по её ширине w=1..7
;   SH_end+1          | SH_k                       | младший байт конца буфера
;   SH_padn+1         | начало этапа F.2           | C — длина хвоста нулей
;   LB500_end+1       | код перед LB4FB            | H конца строки блита
;                     |                            | (= H + (IY+$0E))
;   BoatCol_end+1     | BoatCol (scubaboat.asm)    | L после восьми строк
;   LE_P2_0/1/2 +1    | LE21A (scubacodc.asm)      | адрес проверки соседней
;                     |                            | плоскости: LE_Ck / LE_E2Tk /
;                     |                            | LE_E2Dk по blue_on и экрану
;
; MenuBigPos+1 (scubacodc.asm) кодом НЕ патчится: это именованная точка подсадки
; для гейта столбцов заголовка меню, площадка стенда, а не игры.
;----------------------------------------------------------------------------
; Sprites

	DISPLAY "Sprites start: ", /A, $
	INCLUDE "scubasprt.asm"

;----------------------------------------------------------------------------

L9C50	DEFB $00	; $00 = no Octopus, $01 = we have Octopus on the game screen
L9C51	DEFW $0000	; Octopus screen address
L9C53	DEFW LA41B	; Octopus previous sprite address or LA41B for empty sprite
L9C55	DEFB $04	; Octopus phase
	IFDEF DITHER
oct_scr	DEFB $00	; байт экрана до записи осьминога — для дельты во вторую плоскость
	ENDIF

	IFDEF DITHER
; ГОТОВЫЕ ~МАСКИ: в каждом байте ровно один нулевой бит — это и есть жёлтое
; вкрапление в красном теле рифа. Позиций бита восемь, каждая входит в таблицу
; дважды, порядок перемешан руками: важна не стойкость последовательности, а
; отсутствие видимого периода на 8 и 16 шагах — именно он давал «ёлочки».
L9CBF_noise	DEFB 0F7h,0BFh,0FDh,0DFh,07Fh,0FBh,0EFh,0FEh
		DEFB 0BFh,0FDh,0EFh,07Fh,0FEh,0DFh,0FBh,0F7h
L9CBF_idx	DEFB 0		; курсор по таблице: на КАЖДОМ тайле задаётся заново из
				; хеша клетки (см. ниже), внутри тайла — инкремент по строкам
	ENDIF

; Draw game screen
; Draws 3x3 blocks = 24x24 tiles, draws Octopus if present, draws static objects on the screen.
; I: HL	Screen position on mini-map
; ПРЕРЫВАНИЯ: НЕ ТРОГАЕТ. Входит с каким дали, выходит с тем же. Кто закрывал их
; перед вызовом (Game, демо LEEAD), тот и открывает — EI стоит у них сразу за
; `CALL DrawGameScr`. Раньше здесь был `ei` в хвосте, и это была единственная
; половина сразу двух пар DI/EI, лежавшая в чужом файле.
DrawGameScr
; DI СНЯТ (2026-08-27). Перерисовка экрана шла с закрытыми прерываниями до ei
; после DrawStatics: KEYINT не тикал, и звук (snd_tick — раз в кадр из KEYINT)
; растягивал текущую ноту на всю перерисовку. KEYINT трогает только порты
; 0/1, джойстик, FRAMES и ячейки драйвера звука, регистры бережёт; трюков со
; стеком в тракте перерисовки нет (ld sp только в буте). Оригинальный DI —
; наследие ZX-прерывания, которое здесь ни при чём.
	LD DE,FIELD_COL0*256+$FF	; левый верхний байт поля: столбец 4 (WIDE: 0), lo $FF = экранная строка 0
	IFDEF SCRDIR
; --- ПЕРЕРИСОВКА В СТОРОНУ ДВИЖЕНИЯ (-DSCRDIR) -----------------------------
; Перерисовка экрана занимает 52 кадра (замер drawscr_cost: 3 141 464 такта), и
; луч всё это время показывает промежуточное состояние. То есть переход УЖЕ
; виден — но собирается он всегда сверху вниз, куда бы ни ушёл дайвер, и при
; всплытии картинка «наезжает» против движения. Здесь при переходе ВВЕРХ обход
; строк блоков разворачивается: экран приходит снизу, оттуда, откуда всплыли.
; Порядок ЗАПИСИ меняется, результат — нет: та же перерисовка, тот же байт в
; каждой клетке (сверка romdiff_pix), поэтому логика и гейты не шелохнутся.
; Горизонтальное направление здесь не трогается: шаг столбца карты (INC E) сидит
; внутри тела блока, и разворот по X — отдельная работа (docs/plan_scroll.md).
	ld a,(scr_up)
	or a
	jp z,SD_down
	ld e,$7F		; нижняя строка блоков: 0xFF - 128
SD_down:
	ENDIF
	XOR A
	LD (L9C50),A		; no Octopus by default
	IFDEF BLUESHARK
; ЕДИНСТВЕННЫЙ СБРОС blue_on — здесь. Флаг ЛИПКИЙ: взводят его DrawSky, синие
; статические предметы и блит синего существа, а гасит только начало следующей
; перерисовки экрана. Значит между перерисовками он может быть взведён, хотя
; синее уже стёрто, — ложноположительный ДОПУСТИМ и стоит лишь лишней проверки
; второй плоскости в коллайдере дайвера LE233. Ложноотрицательный недопустим:
; дайвер прошёл бы сквозь синее.
	ld (blue_on),a		; новый экран: синего пока нет, DrawSky и синие предметы взведут
	ENDIF
	ld (il_hl),hl
	ld hl,(z80_ix)
	push hl
	ld hl,(z80_iy)
	push hl
	ld hl,SCRATTR
	ld (z80_ix),hl
	ld hl,(il_hl)
	IFDEF CURTAIN
; ШТОРКА (-DCURTAIN) ВМЕСТО БЛОЧНОГО ОБХОДА. Обе тени уже на стеке, HL — всё ещё
; положение экрана на мини-карте; хвост (вода, осьминог, статика, небо) общий и
; на порядок обхода не завязан. Разбор — scubacurtain.asm, docs/plan_scroll.md.
	call CurtainDraw
	jp DGS_water
	ENDIF
	LD B,$03		; loop counter; game screen 3 blocks high = 24 tiles
	EX DE,HL		; now DE = screen position, HL = address on the screen
	IFDEF SCRDIR
	ld a,(scr_up)
	or a
	jp z,SD_down2
	ld a,d
	add a,2
	ld d,a			; строка карты — тоже с нижнего блока
SD_down2:
	ENDIF
L9C69	PUSH BC
	LD B,FIELD_BLOCKS	; loop counter; game screen 3 blocks wide = 24 tiles (WIDE: 4)
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
; АДРЕС БЛОКА РЕЛЬЕФА ПО ЕГО НОМЕРУ (A): HL = A*256, HL >>= 2 (то есть A*64),
; плюс база LA4DD. Смещения внутри блока (IY бежит по 64 тайлам инкрементом).
	LD H,A
	LD L,$00
	ld a,H		; A дальше мёртв: первым его пишет z80_lda_Y
	and a
	rra
	ld H,a
	ld a,L
	rra
	ld L,a
	ld a,H
	and a
	rra
	ld H,a
	ld a,L
	rra
	ld L,a
	LD DE,LA4DD		; base address for relief blocks, 8x8 tiles each block
	ADD HL,DE		; now HL = address of the block
	ld (z80_iy),hl	; now IY = address of the block (HL уже в HL)
	POP HL
	LD B,$08		; repeat 8 times - block height in tiles
L9CA7	PUSH BC
	LD B,$08		; repeat 8 times - block width in tiles
L9CAA	PUSH BC
	call TileOne		; один тайл: пиксели в обе плоскости, атрибут в SCRATTR
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
	sub FIELD_W		; назад в первый столбец поля (было: and $E0 — сброс в столбец 0,
	ld h,a			; но теперь поле начинается со столбца 4, а не 0; WIDE: 32)
	IFDEF SCRDIR
	ld a,(scr_up)
	or a
	jp z,SD_step_down
; ВВЕРХ: экранная строка растёт (адресация Вектора считает строки сверху вниз
; убыванием младшего байта), карта и атрибуты идут на строку блоков назад.
	ld a,l
	add a,64
	ld l,a
	LD BC,-(256+FIELD_W)
	ld (il_hl),hl
	ld hl,(z80_ix)
	add hl,bc
	ld (z80_ix),hl
	ld hl,(il_hl)
	DEC D
	jp SD_step_done
SD_step_down:
	ENDIF
	ld a,l
	sub 64
	ld l,a
	LD BC,256-FIELD_W	; атрибуты: на строку блоков вниз (8 строк по 32) минус пройденные столбцы
	ld (il_hl),hl
	ld hl,(z80_ix)
	add hl,bc
	ld (z80_ix),hl
	ld hl,(il_hl)
	INC D
	IFDEF SCRDIR
SD_step_done:
	ENDIF
	DEC E
	DEC E
	DEC E
	IFDEF WIDE
	DEC E			; четвёртый блок
	ENDIF
	LD A,E
	AND $1F			; 0..31
	LD E,A
	POP BC
	DEC B
	JP NZ,L9C69		; continue vertical loop for blocks on the screen
; ЛИНИЯ ВОДЫ — ОДИН РАЗ НА ПЕРЕРИСОВКУ (было 192 из цикла тайлов, см. выше).
; Условие то же самое, что стояло в цикле: только верхний экран карты.
DGS_water:
	LD A,(L5B03+1)		; строка положения экрана на мини-карте
	OR A
	call z,DrawSurface
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
	IFDEF SKYFILL
; НЕБО ЗАЛИВАЕТСЯ ПОСЛЕ ВСЕГО ПОЛЯ, А НЕ ИЗ DrawSurface. Оттуда оно звалось
; внутри цикла блоков, и следующие блоки затирали уже залитое: на снимке небо
; выходило рваными прямоугольниками. Здесь поле дорисовано целиком.
; Только на верхнем экране — там же, где рисуется сама линия воды.
	ld a,(L5B03+1)
	or a
	call z,DrawSky
	ENDIF
; `ei` ОТСЮДА СНЯТ (2026-08-30). Он был единственным, кто открывал прерывания за
; ОБА DI-контекста — `Game DI` и демо LEEAD, — то есть пара DI/EI не читалась ни
; из одного места, а находилась в чужом файле. Теперь оба вызывающих ставят EI
; сами, сразу за `CALL DrawGameScr`. Третий вызывающий (прокрутка экрана в
; LE120) приходит сюда с УЖЕ открытыми прерываниями, и для него `ei` был пустым.
; Поведение то же: EI отодвинулся на один RET, окно закрытых прерываний по
; замеру не изменилось (iff_probe.js: 203/294/307 кадров до и после).
	RET


; ОДИН ТАЙЛ ЭКРАНА — ОТДЕЛЬНОЙ ПРОЦЕДУРОЙ.
; Тело вынесено из двойного цикла по тайлам блока не ради красоты: порядок
; обхода экрана перестал быть единственным (перерисовка идёт в сторону движения,
; -DSCRDIR), и следующий шаг — шторка по столбцам тайлов — требует звать это же
; тело из другого обхода. Пока вызывающий один, цена вызова — call/ret на тайл,
; около 9800 тактов на перерисовку из 3 141 464, то есть три десятых процента.
; I: HL = адрес байта экрана (столбец), z80_iy = адрес тайла в блоке,
;    z80_ix = место в SCRATTR.
; O: HL на следующий столбец, z80_iy и z80_ix продвинуты на один тайл.
TileOne:
	IFDEF FASTTILE
; ===== БЫСТРЫЙ ТАЙЛ (-DFASTTILE, 2026-09-07) ==================================
; Замер draw_profile.js: перерисовка экрана 3.24 млн тактов = 54 кадра, из них
; 72 % — цикл строк тайла (~3000 тактов на тайл), при этом 86 % тайлов экрана
; ПУСТЫЕ (номер 0 или $32: 4575+33 из 5376 на ур.4) и стоят столько же, сколько
; рельеф. Здесь: (1) пустой тайл — 16 нулей без всякого дизера; (2) остальные —
; два прохода: плоскость 0xC000 как есть, плоскость 0xE000 с дизером, курсор
; шума в регистре C, без push/pop и переключения плоскости на каждой строке;
; (3) номер тайла читается прямо из (z80_iy), без хелпера z80_lda_Y (~200 т).
; Семантика та же: те же байты в обеих плоскостях (порядок обхода курсора шума
; по строкам сохранён — проверено сверкой видеопамяти со старым кодом), тот же
; атрибут (хвост L9CD5/L9CEB общий). Требует DITHER.
	IFNDEF DITHER
	.ERROR "FASTTILE рассчитан на DITHER"
	ENDIF
	ASSERT (L9CBF_noise & 0FF00h) = ((L9CBF_noise+15) & 0FF00h)	; таблица в одной странице
	ex de,hl		; DE = адрес экрана (столбец, плоскость 0xC000)
	ld hl,(z80_iy)
	ld a,(hl)		; номер тайла
	and 7Fh
	jp z,FT_empty
	cp 32h
	jp z,FT_empty
; хеш курсора шума — как раньше: клетка*5 + блок*3 по байтам адреса (IY)
	ld c,a			; номер тайла
	ld a,l
	ld b,a
	add a,a
	add a,a
	add a,b			; клетка*5
	add a,h
	add a,h
	add a,h			; + блок*3
	and 15
	ld b,a			; B = курсор
	ld a,c
; адрес тайла: L9134 + A*8
	ld l,a
	ld h,0
	add hl,hl
	add hl,hl
	add hl,hl
	ld c,b			; C = курсор шума
	ld b,L9134>>8
	ld a,L9134&255
	add a,l
	ld l,a
	ld a,h
	adc a,b
	ld h,a			; HL = байты тайла
	push de			; адрес экрана — для атрибута
	push hl			; начало тайла — для второго прохода
; проход 1: плоскость 0xC000 — байты тайла как есть (по ней считается столкновение)
	ld a,(hl)
	ld (de),a
	inc hl
	dec e
	ld a,(hl)
	ld (de),a
	inc hl
	dec e
	ld a,(hl)
	ld (de),a
	inc hl
	dec e
	ld a,(hl)
	ld (de),a
	inc hl
	dec e
	ld a,(hl)
	ld (de),a
	inc hl
	dec e
	ld a,(hl)
	ld (de),a
	inc hl
	dec e
	ld a,(hl)
	ld (de),a
	inc hl
	dec e
	ld a,(hl)
	ld (de),a
; проход 2: плоскость 0xE000 — кайма плотно, тело с вкраплениями (маска по курсору)
	pop hl			; начало тайла
	ld a,e
	add a,7
	ld e,a
	ld a,d
	xor 20h
	ld d,a			; DE = та же строка в плоскости 0xE000
	call FT_row
	call FT_row
	call FT_row
	call FT_row
	call FT_row
	call FT_row
	call FT_row
	call FT_row
	pop hl			; адрес экрана
	jp FT_attr
; одна строка второго прохода: C = курсор, HL = байт тайла, DE = экран. Портит A,B.
FT_row:
	ld a,c
	inc a
	and 15
	ld c,a
	add a,L9CBF_noise&255
	ld b,l
	ld l,a
	push hl
	ld l,a
	ld h,L9CBF_noise>>8
	ld a,(hl)		; ~маска строки
	pop hl
	ld l,b
	ld b,a
	ld a,(hl)		; байт тайла
	cp 0FFh
	jp nz,FT_shape
	ld a,b			; сплошное тело: красное с жёлтым вкраплением
FT_put:
	ld (de),a
	inc hl
	dec e
	ret
FT_shape:
; кайма в один пиксель плотно, нутро как у тела: A & ~(inner & маска),
; inner = A & (A<<1) & (A>>1) — та же формула, что в стоковом L9CBF_shape.
; В стоке байт жил в C, здесь C — курсор шума, поэтому байт кладём на стек отдельно.
	push bc			; ~маска, курсор
	ld c,a			; C = байт
	add a,a
	and c			; байт & байт<<1
	push bc			; байт (C); B пока ещё ~маска
	ld b,a
	ld a,c
	or a
	rra
	and b			; inner
	pop bc			; B = ~маска, C = байт
	cpl
	or b			; ~inner | ~маска
	and c			; & байт
	pop bc			; B = ~маска, C = курсор
	jp FT_put
; пустой тайл: 16 нулей, обе плоскости
FT_empty:
	xor a
	ld (de),a
	dec e
	ld (de),a
	dec e
	ld (de),a
	dec e
	ld (de),a
	dec e
	ld (de),a
	dec e
	ld (de),a
	dec e
	ld (de),a
	dec e
	ld (de),a
	ld a,e
	add a,7
	ld e,a
	ld a,d
	xor 20h
	ld d,a
	xor a
	ld (de),a
	dec e
	ld (de),a
	dec e
	ld (de),a
	dec e
	ld (de),a
	dec e
	ld (de),a
	dec e
	ld (de),a
	dec e
	ld (de),a
	dec e
	ld (de),a
	ld a,e
	add a,7			; обратно на верхнюю строку тайла: вызывающий ждёт L нетронутым
	ld e,a
	ld a,d
	xor 20h
	ld d,a
	ex de,hl		; HL = адрес экрана (столбец, плоскость 0xC000)
FT_attr:
	ELSE
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
	IFDEF DITHER
; МАСКА ВКРАПЛЕНИЙ СЧИТАЕТСЯ РАЗ НА ТАЙЛ, А НЕ НА КАЖДУЮ СТРОКУ.
; Первая версия гоняла хеш и цикл сдвига внутри строкового цикла — восемь раз на
; тайл; отрисовка экрана стала настолько дорогой, что снимок заставал её
; недорисованной. Здесь хеш берётся один раз, а по строкам маска просто
; ВРАЩАЕТСЯ (rrca), и вкрапления сами расходятся внутри тайла.
	push hl
	push de
	ld a,(z80_iy)
	ld b,a
	add a,a
	add a,a
	add a,b			; клетка*5 — линейный XOR давал диагональные «ёлочки»
	ld hl,z80_iy+1
	add a,(hl)
	add a,(hl)
	add a,(hl)		; + блок*3
	and 15
	ld (L9CBF_idx),a	; курсор таблицы на эту клетку карты
	pop de
	pop hl
	ENDIF
	LD B,$08		; repeat 8 times - tile height
L9CBF	LD A,(HL)		; get tile pixels
	LD (DE),A		; write to the screen
	ld a,d
	xor $20		; switch screen plane
	ld d,a
	IFDEF DITHER
; --- ДВУХЦВЕТНЫЙ РЕЛЬЕФ (-DDITHER) -----------------------------------------
; Тайл кладётся в обе плоскости одинаковыми битами, поэтому рельеф был сплошным
; индексом 3. Здесь ВТОРАЯ плоскость получает только КАЙМУ — тело рифа остаётся
; индексом 2. Новых цветов в палитре не нужно ни одного.
; ДИЗЕРИМ ИМЕННО ВТОРУЮ ПЛОСКОСТЬ, И ЭТО НЕ ВСЁ РАВНО: первая (0xC000) — та, по
; которой считается столкновение дайвера (LE233 берёт пересечение своей маски с
; её содержимым). Прореди её — и дайвер начнёт проваливаться сквозь камень.
; Маска чередуется по строкам, иначе вместо шахматки выйдут вертикальные полосы.
; РИФ ЖЁЛТО-КРАСНЫЙ С КРАСНОЙ КАЙМОЙ (решение владельца).
; Тело — красное (индекс 3) с редкими жёлтыми вкраплениями (индекс 2), по одному
; пикселю на строку тайла; кайма — плотно красная. Регулярная шахматка отсюда
; убрана: она читалась как рябь.
; Различать их не нужно ничем внешним — это видно по самому байту тайла. ЗАМЕР
; на level4 (4608 байт, ушедших на экран): 0x00 пусто — 75.2 %, 0xFF сплошь —
; 20.9 %, байты С ФОРМОЙ — 3.9 %. Сплошные и есть тело, байты с формой — кромка,
; где тайл переходит в воду. Поэтому правило одно: 0xFF -> шахматка, остальное
; -> как есть. Пустой байт при этом сам собой остаётся пустым.
	push bc
	push hl
	ld a,(L9CBF_idx)
	inc a
	and 15
	ld (L9CBF_idx),a	; курсор дальше по строкам тайла; на следующем тайле
				; его задаст заново хеш клетки
	ld l,a
	ld h,0
	ld bc,L9CBF_noise
	add hl,bc
	ld a,(hl)
	pop hl
	ld b,a			; B = ~маска этой строки
	ld a,(hl)		; байт тайла
	cp 0FFh
	jp nz,L9CBF_shape
; СПЛОШНОЕ ТЕЛО: красное с жёлтым вкраплением.
	ld a,b
	jp L9CBF_put
L9CBF_shape:
; БАЙТ С ФОРМОЙ: кайма в один пиксель плотно красная, нутро — как у тела.
;   inner = A & (A<<1) & (A>>1)      — пиксели с соседями и слева, и справа
;   результат = A & ~(inner & маска) — вкрапление выбивается только изнутри
; Края БАЙТА тут считаются краем формы (сдвиг вносит нули, соседа из следующего
; байта не видно) — потому сплошное тело и разобрано отдельной веткой выше:
; иначе по нему пошли бы красные линии каждые 8 пикселей.
	ld c,a			; C = исходный байт
	add a,a			; A<<1
	and c
	push bc
	ld b,a
	ld a,c
	or a			; сбросить перенос перед логическим сдвигом
	rra			; A>>1
	and b			; A = inner
	pop bc
	cpl			; ~inner
	or b			; | ~маска  =>  ~(inner & маска)
	and c
L9CBF_put:
	pop bc
	ELSE
	LD A,(HL)
	ENDIF
	LD (DE),A	; write to the other plane
	IFDEF DITHER
; ВЕРНУТЬ ПЛОСКОСТЬ. Цикл переключает её каждую строку (`xor $20` выше) и НЕ
; возвращает: в стоке это безразлично, туда идёт один и тот же байт. Нам — нет:
; через строку маска уезжала в 0xC000, и вкрапления выходили синими (индекс 1)
; вместо жёлтых — ЗАМЕР показал 598 таких пикселей, писателем значился
; L9CBF_put+2 по адресам 0xC000. Хуже цвета то, что дырявой становилась ИМЕННО
; та плоскость, по которой считается столкновение дайвера.
	ld a,d
	xor $20
	ld d,a
	ENDIF
	INC HL			; next tile byte
	dec e ;INC D		; next pixel row
	dec b
	jp nz,L9CBF
	POP HL
	ENDIF			; FASTTILE
	LD A,(L5B03+1)		; get Screen position on mini-map, row value
	OR A
	jp NZ,L9CD5
	LD A,H
	AND $18			; 0 / 8 / 16 / 24
	jp NZ,L9CD5
; `call DrawSurface` ОТСЮДА СНЯТ (2026-08-30). Условие ZX по СТРОКЕ было
; приложено к СТОЛБЦУ, и линия воды перерисовывалась целиком 192 раза за одну
; перерисовку экрана (замер drawscr_cost.js: ровно 192 вызова на заход) — 191
; раз впустую. Вызов переехал за блочный цикл, ПЕРЕД проверкой осьминога, то
; есть порядок с осьминогом / DrawStatics / DrawSky сохранён.
; ПОЧЕМУ ЭТО ТО ЖЕ САМОЕ. DrawSurface пишет $FF в строку lo $BF — это ВЕРХНЯЯ
; пиксельная строка знакоместной строки 8, то есть первого ряда второго блока.
; Внутри перерисовки в неё пишут только DrawSurface и сам цикл тайлов, а после
; ПОСЛЕДНЕГО вызова из цикла (знакоместная строка 23, столбец 7) цикл в неё уже
; не пишет: строка 23 занимает lo $47..$40. Значит итоговое содержимое строки
; задавал последний вызов — а теперь его задаёт единственный, стоящий ещё позже.
; Условие `AND $18` и выбор `LD C,$29` ОСТАЮТСЯ: атрибут $29 в столбцах 0..7
; верхнего экрана — часть семантики, а не побочный эффект вызова.
	LD C,$29		; blue on cyan (sky)
	jp L9CEB
; ВЫБОР АТРИБУТА ЗНАКОМЕСТА — НАПРЯМУЮ, БЕЗ IX/IY-ХЕЛПЕРОВ.
; Хелперы z80_lda_Y/z80_stc_X универсальны (произвольное смещение d, полная
; сохранность флагов, A, BC и DE) и стоят под сотню тактов каждый. Здесь ничего
; этого не нужно: смещение всегда 0, а единственный регистр, который надо было
; уберечь, — HL с адресом экрана. Его паркуем в DE.
; ПОЧЕМУ DE МОЖНО ЗАНЯТЬ. В окне «вход в выбор атрибута .. конец инкрементов»
; DE мёртв: он был сохранён `PUSH DE` в начале блока (L9C89) и восстанавливается
; `POP DE` только на выходе из блока, а внутри тайла его перезаписывает `POP DE`
; в начале следующей итерации (L9CAA). Замер: порча DE на входе в окно (2688
; попаданий на уровне 4, 1344 на уровне 1) не меняет 0xC000..0xFFFF ни на байт
; за 600 тиков; тот же пробник с порчей HL вместо DE ломает картинку на 2250
; байт — то есть мера работает.
L9CD5	LD C,$06		; yellow on black
	EX DE,HL		; адрес экрана — в DE
	ld hl,(z80_iy)
	ld a,(hl)		; номер тайла = (IY+0)
	EX DE,HL
	OR A
	jp Z,L9CEB
	CP $32
	jp Z,L9CEB
	LD C,$02		; red on black (color for relief)
; БИТ 7 ТАЙЛА — ПО САМОМУ A, БЕЗ ХЕЛПЕРА. Рекомпилятор выпустил здесь
; `call z80_bitY / defb 0 / and 1<<7 / ld a,(il_a)` — девять байт и второе
; чтение (IY+0). Оно лишнее: A уже РАВЕН (IY+0) — его положил z80_lda_Y тремя
; командами выше, а `OR A`, `CP $32` и `LD C` A не трогают (замер аналитика:
; A == (IY+0) на 222 попаданиях из 222). Флаг Z у `and 80h` тот же, что был у
; `and 1<<7` внутри развёртки, а восстановление A из il_a не нужно: дальше идёт
; L9CEB, где A никто не читает — следующий его писатель z80_lda_Y на новом тайле.
	and 80h
	jp Z,L9CEB
	LD C,$06		; yellow on black
; ЗАПИСЬ АТРИБУТА И ОБА ИНКРЕМЕНТА — ОДНОЙ ПАРКОВКОЙ HL В DE.
; Было: z80_stc_X (сотня тактов ради сохранности флагов и A, которые здесь
; никому не нужны) плюс пять команд инкрементов, каждая со своей парой
; ld (il_hl),hl / ld hl,(il_hl). Семантика та же: те же байты в SCRATTR, тот же
; порядок; после L9CEB флаги читает только `dec b`, который ставит их сам.
; Вторая площадка входа сюда — ветка неба (`LD C,$29 / jp L9CEB`), там HL тоже
; адрес экрана, а DE так же мёртв.
L9CEB:
	EX DE,HL
	ld hl,(z80_ix)
	ld (hl),c		; атрибут знакоместа
	inc hl
	ld (z80_ix),hl
	ld hl,(z80_iy)
	inc hl
	ld (z80_iy),hl
	EX DE,HL
	inc h ;INC L		; next column
	ret

; Линия поверхности воды: $FF по всей ширине поля в одной пиксельной строке
; плоскости 0xE000. HL сохраняет, а B ПОРТИТ (счётчик столбцов) — контракта на
; него нет и не было; единственный вызывающий (DrawGameScr, сразу за блочным
; циклом) свой B к этому моменту уже снял со стека и не читает.
DrawSurface
	push hl
	ld hl,(FIELD_COL0+$20)*256+$BF	; линия поверхности воды: столбец 4 (WIDE: 0), lo $BF = экранная строка 64
	ld b,FIELD_W
DrawSurface_1
	ld (hl),$FF
	inc h			; next column
	dec b
	jp nz,DrawSurface_1
	pop hl
	ret

	IFDEF SKYFILL
; --- НЕБО НАД ВАТЕРЛИНИЕЙ (-DSKYFILL) --------------------------------------
; Фон выше линии воды заливается в 0xE000 — это индекс 1, наш сине-голубой.
; Поверх идут жёлтые вкрапления: там, где ставится бит 0xC000, бит 0xE000
; ГАСИТСЯ, иначе вышел бы индекс 3 (красный), а не 2 (жёлтый).
; Плотность вкраплений растёт книзу — отсюда градиент: у верхней кромки небо
; чистое, у самой воды рябит жёлтым. Рисунок берётся из той же таблицы масок,
; что и риф, и сдвигается по строке, чтобы точки не встали в столбик.
; Зовётся из DrawSurface, то есть только на верхнем экране и только при
; перерисовке поля — в кадре не стоит ни такта.
SKY_TOP		EQU 255		; верх поля: экранная строка 0 (HUD снизу)
; ИНВАРИАНТ: небо пишется ТОЛЬКО в плоскость 0xE000 (индекс 1). Узор строки
; берётся из SKY_TAB по номеру строки сверху и одинаков по всем столбцам поля.
; 0xC000 сама заливка не трогает НИКОГДА: по ней считает столкновение коллайдер
; дайвера (LE233), и любой бит неба в ней стал бы для дайвера препятствием.
; Единственное исключение — облака (DrawClouds, вызов в хвосте): они жёлтые, то
; есть по определению в 0xC000, и рисуются заведомо выше зоны коллайдера.
DrawSky:
	push bc
	push hl
	IFDEF BLUESHARK
	ld a,1
	ld (blue_on),a		; небо лежит во второй плоскости — проверка LE233 обязана его видеть
	ENDIF
	IFDEF SKYGRAD
; ГРАДИЕНТ (-DSKYGRAD, эксперимент 2026-08-27 по образцу zombi_sky_water.png):
; плотность синих точек растёт сверху вниз — от 1/16 у HUD до сплошной синевы у
; воды, восемь полос по восемь строк. ТОЛЬКО вторая плоскость: жёлтые точки в
; 0xC000 ловил бы коллайдер дайвера, когда тот сидит на лодке выше ватерлинии.
; Узор строки берётся из SKY_TAB по номеру строки сверху и одинаков по столбцам:
; чередование 55h/AAh по строкам само даёт шахматку.
	ld h,FIELD_COL0+$20	; первый столбец поля в плоскости 0xE000 — синей
skyg_col:
	ld de,SKY_TAB
	ld l,SKY_TOP		; верх поля
	ld b,64			; до ватерлинии — 64 строки
skyg_row:
	ld a,(de)
	ld (hl),a
	inc de
	dec l
	dec b
	jp nz,skyg_row
	inc h
	ld a,h
	cp (FIELD_COL0+$20+FIELD_W)&$FF	; за последним столбцом поля (WIDE: $00 после $FF)
	jp nz,skyg_col
	IFDEF CLOUDS
	call DrawClouds
	ENDIF
	pop hl
	pop bc
	ret
; SKY_TAB — в scubacod1.asm
	ELSE
; БЕЗ SKYGRAD — СПЛОШНАЯ ЗАЛИВКА, БЕЗ ВКРАПЛЕНИЙ. Небо = чистый индекс 1.
; Так оно и выглядело до градиента: ранний дизеринг неба владелец посмотрел на
; железе и отверг — рябь читалась не как градиент. SKYGRAD вернул его полосами
; нарастающей плотности, и боевая сборка идёт по ветке выше.
	ld h,FIELD_COL0+$20	; первый столбец поля в плоскости 0xE000 — синей
sky_col:
	ld l,SKY_TOP		; верх поля
	ld b,64			; до ватерлинии — 64 строки
	ld a,0FFh
sky_row:
	ld (hl),a
	dec l
	dec b
	jp nz,sky_row
	inc h
	ld a,h
	cp (FIELD_COL0+$20+FIELD_W)&$FF	; за последним столбцом поля (WIDE: $00 после $FF)
	jp nz,sky_col
	IFDEF CLOUDS
	call DrawClouds
	ENDIF
	pop hl
	pop bc
	ret
	ENDIF
	IFDEF CLOUDS
; --- ОБЛАКА (-DCLOUDS, владелец 2026-08-29: «жёлтые, просто выше корабля») ---
; Три облака РАЗНОЙ формы (CloudShapes, scubacod1.asm: столбец, строка, ширина,
; высота, байты) закреплены в НЕБЕСНОЙ ПОЛОСЕ шириной 64 знакоместа — вдвое шире
; экрана. Окно смотрит на полосу с ПАРАЛЛАКСОМ 1/4 (владелец, 2026-08-31,
; «двигать по перспективе движения»): переход окна на блок карты — это 8
; знакомест мира, облака в окне сдвигаются на 2 в противоположную сторону, как
; далёкий фон. Смещение считается из столбца карты L5B03 — состояния нет, при
; возврате на тот же экран облака те же. Полный круг карты (32 столбца) = полный
; круг полосы (64 знакоместа): шов не накапливается.
; Столбец за краем экрана (виртуальный >= 32) ПРОПУСКАЕТСЯ: облако у края
; обрезается, как любой предмет, а не рвётся на две половины у обоих краёв,
; как при прежнем кольце по экрану (mod 32). В типичный момент видно 2 из 3.
; Прежние версии: (1) положение от столбца карты — облака менялись при каждой
; перерисовке; (2) дрейф-«ветер» с кольцом по экрану — облака рвались у края.
; В кадре — ноль тактов: рисуется из DrawSky, только верхний экран, только при
; перерисовке поля.
; Жёлтые = плоскость 0xC000; бит 0xE000 под ними ГАСИТСЯ, иначе на точках
; градиента вышел бы индекс 3 (коралл). Строки 2..23 от верха неба: верх лодки
; с сидящим дайвером — строка 49 (замер снимком старта), коллайдер LE233 до
; облаков не достаёт.
; Экранные столбцы — все 32 столбца плоскости 0xC000 (`or 0C0h`), не FIELD_*:
; под WIDE это одно и то же; в узкой раскладке (без WIDE) механизм не проверялся.
DrawClouds:
	ld a,(L5B03)		; столбец карты 0..31
	add a,a			; ×2 — параллакс 1/4
	ld b,a
	xor a
	sub b
	ld c,a			; C = −смещение окна по полосе (mod 64 берётся ниже)
	ld de,CloudShapes
CloudNext:
	ld a,(de)		; столбец облака в полосе 0..63; 0FFh — конец
	cp 0FFh
	ret z
	add a,c
	and 3Fh
	ld (cloud_v0),a		; виртуальный столбец первого байта облака
	inc de
	ld a,(de)		; строка от верха неба
	cpl			; lo = 255 - y
	ld l,a
	inc de
	ld a,(de)
	ld (cloud_w),a		; ширина в байтах
	inc de
	ld a,(de)
	ld b,a			; высота в строках
	inc de
Cloud_row:
	push bc			; B = счётчик строк, C = −смещение (нужен следующему облаку)
	ld a,(cloud_v0)
	ld b,a			; B = виртуальный столбец
	ld a,(cloud_w)
	ld c,a			; C = счётчик ширины
Cloud_byte:
	ld a,b
	cp 32
	jp nc,Cloud_skip	; столбец за краем экрана: байт формы пропускается (клип)
	or 0C0h
	ld h,a
	ld a,(de)
	or (hl)
	ld (hl),a		; 0xC000 |= форма
	ld a,h
	xor 20h
	ld h,a
	ld a,(de)
	cpl
	and (hl)
	ld (hl),a		; 0xE000 &= ~форма — чисто жёлтое на градиенте
Cloud_skip:
	inc de
	ld a,b
	inc a
	and 3Fh
	ld b,a
	dec c
	jp nz,Cloud_byte
	pop bc
	dec l			; следующая пиксельная строка вниз
	dec b
	jp nz,Cloud_row
	jp CloudNext
cloud_v0:	defb 0		; рабочие ячейки DrawClouds (никто больше не трогает)
cloud_w:	defb 0
	ENDIF
	ENDIF

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
	ld a,L
	rra
	ld L,a
	ld a,H
	and a
	rra
	ld H,a
	ld a,L
	rra
	ld L,a
	ld a,H
	and a
	rra
	ld H,a
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

; Get screen attribute address
; ЭТАП G2: адрес атрибута = SCRATTR + строка*32 + столбец (SCRATTR выровнен
; на страницу). Было шесть сдвигов пары через il_a (~290 тактов), стало ~100.
; DE не трогается, как и раньше.
GetScrAttrAddr
	ld a,h
	rrca
	rrca
	rrca			; (H>>3) | (H<<5)
	ld h,a
	and 0E0h
	or l			; + столбец (0..31)
	ld l,a
	ld a,h
	and 01Fh
	add a,high SCRATTR
	ld h,a
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

; То же самое, но для ПОЛЯ: столбец поля c ложится на столбец экрана
; FIELD_COL0+c. Штатно (FIELD_COL0=$C4, FIELD_W=24) это центрирование по 32 px
; чёрного слева и справа; в боевой сборке (-DWIDE) поле занимает экран целиком,
; FIELD_COL0=$C0, FIELD_W=32, и сдвига нет.
; Именно КОПИЯ, а не обёртка `jp GetScrAddr`: обёртка добавила бы CALL/RET в
; горячий спрайтовый блит LB4F0, а бюджет изменения темпа — ноль.
; Столбец на входе гарантированно 0..FIELD_W-1 (клип LB4BB: столбец+ширина <
; FIELD_W; клип строки LB4D7/LB4BB: строка < 24), значит старший байт адреса не
; выходит за FIELD_COL0+FIELD_W-1 — плоскость 0xC000 не покидаем.
GetScrAddrF
	PUSH DE
	ld a,h		; row
	add a,a
	add a,a
	add a,a		; *8
	cpl		; lo = 255 - 8*row
	ld e,a		; lo byte
	ld a,l		; column
	and $1F
	add a,FIELD_COL0	; +4 столбца: поле начинается со столбца 4 (WIDE: 0)
	ld d,a		; hi byte
	ex de,hl
	POP DE
	RET

; Draw tile 16x8 at the screen; used for static objects: Big Shell, Chest
; I: HL = Char coords: H = row 0..23, L = column 0..31
; I: DE = Tile address; 16 bytes
DrawTile16x8
	CALL GetScrAddrF		; поле: столбец 0..FIELD_W-1 -> FIELD_COL0+столбец
	IFDEF SHELLBLUE
; СИНИЙ ПРЕДМЕТ (-DSHELLBLUE): переключаем плоскость ДО отрисовки. Тогда пиксели
; лягут в 0xE000 (индекс 1, сине-голубой), а штатный гасящий проход, который
; всегда идёт по «другой» плоскости, погасит 0xC000 — предмет выходит чисто
; синим, без примеси. Кайму не рисуем: приём себя не оправдал.
	ld a,(shell_ink)
	or a
	jp z,DrawTileBlue_no1
	ld a,h
	xor $20
	ld h,a
DrawTileBlue_no1:
	ENDIF
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
	IFDEF SHELLBLUE
; ПЕРЕМЕННАЯ ПОСЛЕ RET, А НЕ ПЕРЕД НИМ. Она стояла между jp nz и RET: при нуле
; это NOP и всё работало, а во время отрисовки синей ракушки shell_ink = 1 —
; опкод LXI B, который съедал RET и два байта дальше; процессор уезжал в
; DrawTile8x8 с чужими регистрами. Ракушки рисовались мусором (демо-экран).
shell_ink	defb 0		; 1 = предмет рисуется синим (вторая плоскость)
	ENDIF

; Draw tile 8x8 at the screen; used to draw static objects: Oxygen, Small shell
; I: HL = Char coords: H = row 0..23, L = column 0..31
; I: DE = Tile address; 8 bytes
DrawTile8x8
	CALL GetScrAddrF		; поле: столбец 0..FIELD_W-1 -> FIELD_COL0+столбец
	IFDEF SHELLBLUE
; СИНИЙ ПРЕДМЕТ (-DSHELLBLUE): переключаем плоскость ДО отрисовки. Тогда пиксели
; лягут в 0xE000 (индекс 1, сине-голубой), а штатный гасящий проход, который
; всегда идёт по «другой» плоскости, погасит 0xC000 — предмет выходит чисто
; синим, без примеси. Кайму не рисуем: приём себя не оправдал.
	ld a,(shell_ink)
	or a
	jp z,DrawTileBlue_no2
	ld a,h
	xor $20
	ld h,a
DrawTileBlue_no2:
	ENDIF
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
LA1F6	LD H,C
	LD L,$C0
	ld a,H		; A дальше мёртв: LA209 начинается с LD A,(HL)
	and a
	rra
	ld H,a
	ld a,L
	rra
	ld L,a
	ld a,H
	and a
	rra
	ld H,a
	ld a,L
	rra
	ld L,a
	LD BC,LA4DD
	PUSH HL
	ADD HL,BC
	POP BC
	LD B,$10		; repeat 16 times
LA209	LD A,(HL)
	INC HL
	INC C
	SUB $1C
	jp C,LA278
	CP $04
	jp NC,LA278
	LD A,(HL)
	INC HL
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
	INC HL
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
	IFDEF CLOUDINK
; ПОД CLOUDINK ПУСТОЙ СПРАЙТ ДЛИННЕЕ. При стирании стайки обе плоскости читают
; отсюда, и хотя смещение маски обнулено (LB496), сам обход у стайки длиннее
; всех: слот 128 Б плюс сдвиг клипа. Запас держим кратно строке.
	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
	ENDIF

;----------------------------------------------------------------------------

	IFNDEF HIDVRAM
	INCLUDE "scubarelb.asm"
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
	ld (il_hl),hl
	ld hl,(z80_iy)
	push hl
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
	CP FIELD_W			; столбец в поле?
	jp NC,LB148	; no => skip
	LD E,A			; now E = column on the screen, 0..FIELD_W-1
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
	ld hl,(z80_iy)
	inc hl
	ld (z80_iy),hl
	ld hl,(z80_iy)
	inc hl
	ld (z80_iy),hl
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
LB121
	IFDEF SHELLBLUE
	ld a,1
	ld (shell_ink),a	; синей делаем ТОЛЬКО большую ракушку
	IFDEF BLUESHARK
	ld (blue_on),a		; дайверу есть с чем столкнуться во второй плоскости
	ENDIF
	ENDIF
	LD DE,LB16C		; Sprite 16x16 Big shell opened
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
LB148
	IFDEF SHELLBLUE
	xor a
	ld (shell_ink),a
	ENDIF
	POP DE
	POP HL
	LD BC,$0004		; record size
	ADD HL,BC		; next record
	JP LB0C5		; continue the loop
; Draw Chest object
LB151
	IFDEF OPENCHEST
; ОПУСТОШЁННЫЙ СУНДУК — ДРУГИМ ТАЙЛОМ (2026-09-07, предложение владельца).
; В ZX-оригинале взятый сундук не исчезает, а ТУСКНЕЕТ: LE510 перекрашивает обе
; его клетки с атрибута 046h (яркий жёлтый) на 006h (обычный). У нас цвет задают
; плоскости, а не атрибут, и подсказка терялась — сундук оставался синим. Здесь
; тот же смысл передан рисунком: у пустого поднята крышка, и он не синий (в ZX
; он тоже становился тусклее прочих предметов).
; Бит 3 записи предмета — «уже взят», его ставит LE510.
	ld a,(hl)
	and 1<<(3)
	jp z,LB151_full
	ld de,LB1B4_open	; пустой сундук: крышка поднята
	jp LB151_ink		; и без синей краски
LB151_full:
	ENDIF
	IFDEF SHELLBLUE
; Взвод стоит ЗДЕСЬ, а не у выбора атрибута выше: там он выполнялся ДО проверки
; бита «сундук», и если объект сундуком не оказывался, флаг доживал до
; следующего предмета — малая ракушка красилась синей заодно.
	ld a,1
	ld (shell_ink),a	; сундук — синий
	IFDEF BLUESHARK
	ld (blue_on),a
	ENDIF
	ENDIF
	IFDEF OPENCHEST
LB151_ink:
	ENDIF
	LD A,(HL)
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
	IFDEF OPENCHEST
; Пустой сундук: та же коробка, крышка поднята над ней, нутро выбрано.
LB1B4_open
	DEFB $0F,$F8,$08,$08,$00,$00,$1F,$FC
	DEFB $10,$04,$10,$04,$1F,$FC,$1F,$FC
	ENDIF

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

LB213:
	IFDEF TIMEBASE
	call tb_tick		; Δ этого тика — первое дело тика
	ENDIF
	CALL LB2C0		; Octopus delay and process
	LD HL,LB211
	IFDEF TIMEBASE
	call tb_dec
	RET C
	LD A,(L5B0D)		; get value 7 / 5 / 3 / 1, depending on LEVEL
	call tb_reload
	ENDIF
	IFNDEF TIMEBASE
	DEC (HL)
	RET NZ
	LD A,(L5B0D)		; get value 7 / 5 / 3 / 1, depending on LEVEL
	LD (HL),A
	ENDIF
	LD A,(LB212)
	ld (il_a),a
	and 1<<(7)
	ld a,(il_a)
	jp NZ,LB230
	INC A
	CP $07
	jp NZ,LB237
	or 1<<(7)		; SET 7,A; флаги дальше мёртвы (первое чтение — jp NZ после CP H)
	jp LB237
LB230	DEC A
	CP $83
	jp NZ,LB237
	and (~(1<<(7)))&255	; RES 7,A; флаги дальше мёртвы
LB237	LD (LB212),A
	ld (il_hl),hl
	ld hl,(z80_iy)
	push hl
	ld hl,LB079
	ld (z80_iy),hl
	ld hl,(il_hl)
LB240	LD DE,$0004
	ld hl,(L5B0B)		; get screen position on 256x256 map
	ld c,l
	ld b,h
LB247:
	ld hl,(z80_iy)
	add hl,de
	ld (z80_iy),hl
	ld a,(hl)
	inc hl
	ld h,(hl)
	ld l,a			; HL = (IY+$00/$01); A дальше перезаписывается
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
	ld hl,(z80_iy)
	inc hl
	inc hl
	ld a,(hl)
	inc hl
	ld h,(hl)
	ld l,a			; HL = (IY+$02/$03)
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
	IFDEF SHELLBLUE
; Открытие/закрытие большой ракушки — XOR-дельта между кадрами. Сама ракушка
; под SHELLBLUE лежит во второй плоскости, значит и дельта обязана ложиться
; туда же: иначе половина ракушки становилась жёлто-красной.
	ld a,1
	ld (shell_ink),a
	ENDIF
	PUSH HL
	CALL DrawTileXor16x8	; Draw tile 16x8 with XOR
	POP HL
	DEC H			; one line upper
	CALL DrawTileXor16x8	; Draw tile 16x8 with XOR
	IFDEF SHELLBLUE
	xor a
	ld (shell_ink),a
	ENDIF
	POP HL
	jp LB240

; Octopus delay and process
LB2C0	LD HL,LB2CD
	IFDEF TIMEBASE
	call tb_dec
	RET C
	LD A,(L5B0E)		; get value 10 / 8 / 6 / 4, depending on LEVEL
	call tb_reload
	ENDIF
	IFNDEF TIMEBASE
	DEC (HL)
	RET NZ
	LD A,(L5B0E)		; get value 10 / 8 / 6 / 4, depending on LEVEL
	LD (HL),A
	ENDIF
	CALL LB317		; Process Octopus, draw if needed
	RET
LB2CD	DEFB $08

; Draw tile 8x8 with XOR
; I: HL = Char coords: H = 0..23, L = 0..31
; I: DE = Tile address
DrawTileXor8x8
	CALL GetScrAddrF		; поле: столбец 0..FIELD_W-1 -> FIELD_COL0+столбец
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
	CALL GetScrAddrF		; поле: столбец 0..FIELD_W-1 -> FIELD_COL0+столбец
	IFDEF SHELLBLUE
	ld a,(shell_ink)
	or a
	jp z,DrawTileXorBlue_no
	ld a,h
	xor $20			; синий предмет — во вторую плоскость
	ld h,a
DrawTileXorBlue_no:
	ENDIF
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
; ДАЛЬШЕ ПАДАЕМ В DrawOctopusSprite: в оригинале здесь стояли CALL и RET.

; Draw Octopus sprite on the screen
; I: DE = Octopus sprite address, 6x4 tiles 8x8 pixels, 192 bytes
DrawOctopusSprite
	ld (il_hl),hl
	ld hl,(z80_iy)
	push hl
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
LB376
	IFDEF DITHER
	ld a,(hl)
	ld (oct_scr),a		; что было на экране до нас — понадобится для дельты
	ENDIF
	LD A,(DE)		; get pixels
	XOR (HL)		; XOR with screen pixels
	call z80_xor_Y	; XOR with previous sprite pixels
	defb $00
	LD (HL),A		; write to the screen
	IFDEF DITHER
; --- ОСЬМИНОГ КРАСНЫЙ (просьба владельца) ----------------------------------
; Он рисуется XOR-ом только в 0xC000 и потому был индексом 2. Чтобы стал 3,
; те же биты нужны и во второй плоскости. Тракт у него не «нарисовать», а
; «переключить»: экран = новый ^ экран ^ прошлый кадр. Значит во вторую
; плоскость надо отправить ту же ДЕЛЬТУ — то, что здесь изменилось:
;   дельта = записанное ^ бывшее на экране = новый ^ прошлый.
; Тогда биты встают и снимаются синхронно с первой плоскостью, и осьминог
; появляется и исчезает целиком, не оставляя половины цвета.
	push hl
	ld hl,oct_scr
	xor (hl)		; A = дельта
	pop hl
	push af
	ld a,h
	add a,20h
	ld h,a			; -> та же клетка во второй плоскости
	pop af
	xor (hl)
	ld (hl),a
	ld a,h
	sub 20h
	ld h,a			; вернуть указатель
	ENDIF
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
LB3A6:
	IFDEF BOATFAST
	call BoatBuf		; стейджинг, для лодки — своя страница
	ELSE
	LD HL,(LB7B9)
	ENDIF
	jp LB3B1
;
LB3AB:
	ld a,(DiverObj+$08)	; A дальше мёртв: LB3B1 пишет его через z80_lda_X_3
	ld h,a
	ld a,(DiverObj+$07)
	ld l,a
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
	IFDEF CLOUDINK
	ld (cl_pref),a		; строк префикса: маска второй плоскости ляжет так же
	ENDIF
	push hl
	ld hl,(z80_iy)
	ld de,0007h
	add hl,de
	ld c,(hl)		; (IY+$07)
	ld de,0003h
	add hl,de
	ld d,(hl)		; (IY+$0A)
	pop hl
	XOR A
LB3D8:
	add a,c
	dec b
	jp nz,LB3D8		; A = B * (IY+$07)
	LD B,A
	LD C,A
	ld a,d
	SUB C
	LD C,A
	XOR A
LB3E5	LD (HL),A	; clear buffer byte
	INC HL
	dec b
	jp nz,LB3E5
LB3E9	PUSH HL
	IFDEF MIRROR
; ЗЕРКАЛЬНОСТЬ НАБОРА — СТАРШИЙ БИТ ЕГО БАЗЫ (IX+$09/$0A). Адреса игры лежат ниже
; 0x8000, бит 15 свободен, а свободного поля в записи нет: (IX+$04), которое
; docs/colour_plan считал свободным, читает LB686. Текущий кадр (IX+$0B/$0C)
; держится ЧИСТЫМ — по нему идёт вся арифметика анимации (шаг на кадр, сравнение
; с $FF), и признак пришлось бы снимать в трёх местах вместо одного.
	call z80_lda_X
	defb $0A
	and 80h
	jp z,MIR_off		; бита нет — точно не зеркало
	call IsMirrorIY		; бит есть, но у этого ли ТИПА он что-то значит
	ld a,80h
	jp z,MIR_set
MIR_off:
	xor a
MIR_set:
	ld (mir_on),a
	ENDIF
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
	IFDEF MIRROR
; СНИМАТЬ БИТ 15 МОЖНО ТОЛЬКО У ЗЕРКАЛЬНОГО ТИПА. У дайвера база набора лежит в
; скрытой плоскости (0xA9xx), и `and 7Fh` превратил бы её в 0x29xx — цепочка
; кадров пошла бы по чужим данным.
	ld a,(mir_on)
	or a
	jp z,MIR_keep
	ld a,d
	and 7Fh
	ld d,a			; откат на начало набора — адрес без признака
MIR_keep:
	ENDIF
LB3FA:
	ld a,e
	ld (L5B11),a
	ld a,d
	ld (L5B11+1),a
; ЭТАП F.2: КОПИРОВАНИЕ КАДРА В БУФЕР И ЕГО СДВИГ НА k ПИКСЕЛЕЙ — ОДНИМ ПРОХОДОМ.
; Было: копия построчно (LDIR + нулевой байт в конце строки), потом сдвиг всей
; строки байтов (IY+$0D) как одной битовой цепочки: по нибблу через z80_rrd
; (~208 тактов на байт) и по биту проходами RRA (48 тактов на байт за проход).
; При типичном k=4..7 это 300..440 тактов на байт, всего ~5000 тактов на тик
; на 4-м уровне. Раз сдвигается ровно скопированное (инвариант 1 ниже), копию и
; сдвиг можно делать сразу: out = (in >> k) | (prev << (8-k)), перенос в C,
; следующий байт строки — нулевой, он принимает хвост последнего.
; Тело на байт: ~110 тактов + 4k. Ширина строки w = 1..7 байт: тело развёрнуто
; семь раз, строка входит в развёртку с байта SH_b{w} (патч перехода SH_row).
; Поворот на k — вход в цепочку из восьми RRC на k команд до RET (адрес
; SH_rot0-k патчится в семь вызовов), маска младших битов FF>>k — в семь AND.
; Всё это делается раз на кадр (~350 тактов), код лежит в ОЗУ.
; Побочные эффекты прежнего пути сохранены дословно: SET 5,(IX+$0D) на ветке
; k=0, выбор k=8 по битам (IX+$0D)/(IX+$11)/(DiverObj+$11), C нулевых байт за
; кадром, конец кадра в (IX+$0B/$0C), HL на выходе = начало буфера.
; ДВА ИНВАРИАНТА ПРОХОДА.
;   1. (IY+$0D) = (w+1)*rows ВСЕГДА — сдвигается ровно то, что скопировано
;      (проба tools/verify/shift_probe.js, 361 вызов, уровни 1 и 4).
;   2. ХВОСТ НУЛЕЙ — ЭТО C, А НЕ ШИРИНА. Слот буфера вдвое больше кадра: кадр
;      стоит в нём на (IX+$03) строк ниже верха (префикс обнулён до LB3E9), а
;      всё, что ниже кадра до конца слота, обнуляет хвост — C = (IY+$0A) минус
;      префикс, посчитан в LB3B1/LB3D8 и доживает сюда через PUSH BC / POP BC.
;      Возьми хвост из описателя вместо регистра — остаток слота сохранит мусор
;      прошлого кадра, и существо начнёт «цеплять» дайвера ниже своего кадра.
; История замеров и отвергнутых вариантов — docs/speed_2026_08_27.md.
	ld a,c
	ld (SH_padn+1),a	; C — хвост нулей; A здесь мёртв (LB41B пересчитывал его)
; 1. Величина сдвига k — теперь ДО копирования (прежний LB41B/LB43E).
;    DE (адрес кадра) хелперы этой логики затирают — раньше он к этому моменту
;    был уже сохранён в (IX+$0B/$0C), теперь бережём его на стеке.
	push de			; источник (текущий кадр)
	call z80_ldb_X
	defb $02
	LD A,B
	OR A
	jp NZ,SH_k
	rst 30h	; = call z80_setX
	defb $0D
	defb 1<<(5)
	call z80_bitX_13
	and 1<<(4)
	ld a,(il_a)
	jp Z,SH_43E
	call z80_bitX_17
	and 1<<(7)
	ld a,(il_a)
	jp Z,SH_k8
	jp SH_k			; B = 0: копия без сдвига
SH_43E:
	ld (il_a),a
	ld a,(DiverObj+$11)
	and 1<<(7)
	ld a,(il_a)
	jp Z,SH_k		; B = 0
SH_k8	LD B,$08		; сдвиг на целый байт
SH_k:
	IFDEF BOATFAST
	call BoatKey		; Z — лодка с прежним ключом: кадр уже собран
	jp z,BoatSkip		; уход в scubaboat.asm (BOATFAST), вернётся на SH_tail1
	ENDIF
; 2. Настройка тела прохода под k и ширину.
	ld hl,SH_rot0
	ld a,l
	sub b
	ld l,a
	ld a,h
	sbc a,0
	ld h,a			; HL = вход в цепочку RRC: k поворотов до RET
	IFDEF MIRROR
	ld (MR_rot+1),hl	; отражённый проход крутит ту же цепочку RRC
	ENDIF
	ld (SH_b7+2),hl
	ld (SH_b6+2),hl
	ld (SH_b5+2),hl
	ld (SH_b4+2),hl
	ld (SH_b3+2),hl
	ld (SH_b2+2),hl
	ld (SH_b1+2),hl
	ld hl,SH_lotab
	ld a,l
	add a,b
	ld l,a
	ld a,h
	adc a,0
	ld h,a
	ld a,(hl)		; FF>>k — маска младших битов после поворота
	IFDEF MIRROR
	ld (MR_lo+1),a		; та же маска в обеих ветках отражённого прохода
	ld (MR_lo2+1),a
	ENDIF
	ld (SH_b7+6),a
	ld (SH_b6+6),a
	ld (SH_b5+6),a
	ld (SH_b4+6),a
	ld (SH_b3+6),a
	ld (SH_b2+6),a
	ld (SH_b1+6),a
	call z80_ldc_Y
	defb $06		; C = ширина строки в байтах, 1..7
	IFDEF MIRROR
	ld a,c
	ld (mir_w),a
	ENDIF
	ld hl,SH_b1
	ld de,-SH_BODY
	ld a,c
SH_ent:	dec a
	jp z,SH_ent_d
	add hl,de		; на тело раньше за каждый байт ширины сверх одного
	jp SH_ent
SH_ent_d:
	ld (SH_row+1),hl
	pop de			; источник
	pop hl			; буфер
	push hl			; LB438 вернёт его в HL, как раньше
	call z80_lda_Y
	defb $0D		; размер буфера (w+1)*rows, до 192
	add a,l
	ld (SH_end+1),a		; младший байт конца буфера: область короче 256 байт
	IFDEF MIRROR
	ld (MR_end+1),a		; отражённый проход кончается там же
	ENDIF
	ex de,hl		; HL = источник, DE = буфер
	ld c,0			; перенос: младшие k битов предыдущего байта, уже наверху
; 3. Проход. Тело: X = rotr_k(in); out = (X & lo) | C; C' = X & ~lo = X ^ (X & lo).
;    После OR C / записи A ^ C возвращает X & lo (C и lo не пересекаются),
;    ещё XOR B даёт X ^ (X & lo) — так обходится вторая маска.
	MACRO SH_BODY_M
	ld a,(hl)
	call SH_rot0		; операнд патчится: SH_rot0-k
	ld b,a
	and 0FFh		; операнд патчится: FF>>k
	or c
	ld (de),a
	xor c
	xor b
	ld c,a
	inc hl
	inc de
	ENDM
SH_BODY	EQU 14			; длина одного тела, байт
i80_ldir_1:			; старое имя тракта копирования: крючки стенда бьют раз на СТРОКУ
	IFDEF MIRROR
; Кадр зеркального набора собирается отражённым проходом (scubamirror.asm):
; байты строки читаются справа налево и в каждом переворачиваются биты. Сдвиг на
; k — тот же и теми же настройками; отражать после сдвига было бы неверно,
; отражение меняет его направление.
	ld a,(mir_on)
	or a
	jp z,SH_row
	call MirrorRow
	jp i80_ldir_end
	ENDIF
SH_row:	jp 0			; операнд патчится: SH_b{w}
SH_b7:	SH_BODY_M
SH_b6:	SH_BODY_M
SH_b5:	SH_BODY_M
SH_b4:	SH_BODY_M
SH_b3:	SH_BODY_M
SH_b2:	SH_BODY_M
SH_b1:	SH_BODY_M
	ld a,c
	ld (de),a		; нулевой байт строки принимает хвост последнего байта
	inc de
	ld c,0
	ld a,e
SH_end:	cp 0			; операнд патчится
	jp nz,SH_row
i80_ldir_end:
	ASSERT SH_b6-SH_b7 = SH_BODY
; 4. Хвост как раньше: C нулевых байт до конца слота, конец кадра в (IX+$0B/$0C).
SH_padn	LD B,0			; операнд ставится в начале: C на входе
	LD A,B
	OR A
	jp Z,SH_tail
	XOR A
SH_pad:	ld (de),a
	inc de
	dec b
	jp nz,SH_pad
SH_tail:
	ex de,hl		; DE = конец кадра = адрес следующего, как после прежней копии
	IFDEF BOATFAST
	call BoatEnd		; лодка: запомнить конец источника
SH_tail1:			; сюда возвращается BoatSkip (scubaboat.asm)
	ENDIF
	call z80_std_X
	defb $0C
	call z80_ste_X
	defb $0B
	IFDEF CLOUDINK
; ВТОРАЯ ПЛОСКОСТЬ РАСКРАШЕННОГО СУЩЕСТВА СОБИРАЕТСЯ ЗДЕСЬ ЖЕ.
; Кадр стайки разделён надвое: то, что идёт в 0xC000, лежит в блоке кадров и
; собрано выше обычным трактом; то, что идёт в 0xE000, лежит упакованным и
; разворачивается прямо в ВЕРХНЮЮ ПОЛОВИНУ той же страницы стейджинга. Места
; хватает без всякого пула: слот стайки — 128 байт из 256-байтовой страницы.
; Адрес кадра берётся из L5B11 — его положил туда сам тракт сборки.
	push hl
	push de
; ld de,(nn) у i8080 нет — только ld hl,(nn); отсюда пляска через ex de,hl.
	ld hl,(L5B11)
	ex de,hl		; DE = адрес кадра — его положил сюда сам тракт сборки
	call CloudFind		; Z и HL = упакованная маска, если тип раскрашен
	jp nz,CL_nomask
	push hl			; маска
	ld hl,(LB7B9)		; стейджинг: слот A в нижней половине страницы
	ld a,l
	add a,80h
	ld l,a
	ld a,h
	adc a,0
	ld h,a
	ex de,hl		; DE = слот D, вторая половина той же страницы
	pop hl			; HL = упакованная маска
	call CloudUnpack
CL_nomask:
	pop de
	pop hl
	ENDIF
LB438	POP HL
	RET
; SH_lotab / цепочка RRC / SH_rot0 — переехали в scubacod1.asm (данные до ALIGN)

; Процедура стоит ЗДЕСЬ — за RET в LB438 и перед шапкой блита LB470. Раньше её
; 38 байт лежали в разрыве тела цикла блита, между jp LB4D7 и LB4F0, и цикл
; читался как две несвязанные половины. Провала сверху нет (перед ней RET),
; сама она кончается RET, обе ссылки — абсолютные call, адрес роли не играет.
; ПОИСК ДЕСКРИПТОРА В ТАБЛИЦЕ ТИПОВ — ОДИН НА ВСЕ ЧЕРНИЛА.
; Таблиц две (синие LB4F0_bluetab, красные LB4F0_redtab), и обе спрашиваются
; одним и тем же вопросом: лежит ли в них адрес дескриптора текущего существа.
; Тело поиска общее; прологи только подставляют таблицу и её длину. Дублировать
; его на каждое чернило нельзя — под потолком 0xA000 счёт идёт на байты.
NEEDDESC DEFL 0
	IFDEF BLUESHARK
NEEDDESC DEFL 1
	ENDIF
	IFDEF REDINK
NEEDDESC DEFL 1
	ENDIF
	IFDEF MIRROR
NEEDDESC DEFL 1
	ENDIF
; ТЕЛО ВНУТРЕННЕГО ЦИКЛА БЛИТА ВЫБИРАЕТСЯ ПАТЧЕМ, если у какого-то типа оно своё:
; красное (LB500R, дельта во вторую плоскость) или облачное (LB500C, две
; плоскости со своими буферами). Без обоих флагов тело одно и переход не нужен.
NEEDBODY DEFL 0
	IFDEF REDINK
NEEDBODY DEFL 1
	ENDIF
	IFDEF CLOUDINK
NEEDBODY DEFL 1
	ENDIF
	IFDEF BLUESHARK
; Z — описатель в z80_iy принадлежит синему типу (таблица LB4F0_bluetab).
; Регистры HL/DE/BC целы. Зовут блит (выбор плоскости) и SkyGuard в LB972.
IsBlueIY:
	push hl
	push de
	push bc
	ld hl,LB4F0_bluetab
	ld b,BLUETAB_N
	jp DescInTab
	ENDIF
	IFDEF MIRROR
; Z — у типа в z80_iy набор «влево» не хранится, и старший бит базы набора у него
; ЗНАЧИТ зеркальность, а не часть адреса. Зовёт сборка кадра (LB3E9) и разворот
; существа (LB95D) — оба только тогда, когда бит уже стоит, так что в обычном
; случае поиск не стоит ничего.
IsMirrorIY:
	push hl
	push de
	push bc
	ld hl,LB4F0_mirtab
	ld b,MIRTAB_N
	jp DescInTab
	ENDIF
	IFDEF REDINK
; Z — описатель в z80_iy принадлежит красному типу (таблица LB4F0_redtab).
; Зовёт только блит: красное существо идёт вторым проходом по 0xE000.
IsRedIY:
	push hl
	push de
	push bc
	ld hl,LB4F0_redtab
	ld b,REDTAB_N
	ENDIF
	IF NEEDDESC
; I: HL = таблица дескрипторов, B = сколько в ней слов; на стеке — HL/DE/BC.
; O: Z — нашли. Портит A.
DescInTab:
	ld a,(z80_iy)
	ld e,a
	ld a,(z80_iy+1)
	ld d,a			; DE = дескриптор
DescInTab_1:
	ld a,(hl)
	inc hl
	cp e
	jp nz,DescInTab_2
	ld a,(hl)
	cp d
	jp z,DescInTab_yes	; Z
DescInTab_2:
	inc hl
	dec b
	jp nz,DescInTab_1
	or 1			; NZ — в этой таблице типа нет
DescInTab_yes:
	pop bc
	pop de
	pop hl
	ret
	ENDIF

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
	IFDEF CLOUDINK
; У СТАЙКИ ВТОРОЙ БУФЕР SAVE-UNDER — во второй половине той же страницы пула.
; Чистится он тем же порядком и по тому же условию: мусор в нём вернулся бы на
; экран при стирании ровно так же, как мусор в первом.
	call IsCloudIY
	jp nz,LB496
	push de
	ld a,e
	xor 80h
	ld e,a			; слот второй плоскости (страница выровнена, слот 128 Б)
	call z80_ldc_Y
	defb $09
	call z80_ldl_Y
	defb $0A
	XOR A
cl_clr1	LD B,L
cl_clr2	LD (DE),A
	INC DE
	dec b
	jp nz,cl_clr2
	DEC C
	jp NZ,cl_clr1
	pop de
	ENDIF
LB496:
	IFDEF BOATFAST
	call BoatBuf		; маска: стейджинг, для лодки — своя страница
	ELSE
	LD HL,(LB7B9)
	ENDIF
	call z80_bitX_13
	and 1<<(0)
	ld a,(il_a)
	jp NZ,LB4A2
	LD HL,LA41B		; empty sprite address
	IFDEF CLOUDINK
	xor a			; стирание: маски нет вовсе — обе плоскости читают пустой спрайт
	jp cl_mset
	ENDIF
LB4A2:
	IFDEF CLOUDINK
; СМЕЩЕНИЕ МАСКИ ВТОРОЙ ПЛОСКОСТИ — ОПЕРАНДОМ, РАЗ НА ВЫЗОВ БЛИТА.
; При рисовании маска D лежит во второй половине страницы стейджинга (её кладёт
; туда CloudUnpack при сборке кадра), при стирании маски нет: HL показывает на
; пустой спрайт, и вторая плоскость обязана читать ТОТ ЖЕ адрес. Смещение нельзя
; зашить константой: у пустого спрайта младший байт произвольный, xor 80h увёл
; бы чтение в соседние данные. Проверка в теле цикла стоила бы её на каждом
; байте — поэтому операнд ставится здесь, а в теле остаётся голый xor.
	ld a,80h
cl_mset:
	ld (cl_mx1+1),a
	ld (cl_mx2+1),a
	ENDIF
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
LB4BB	CP FIELD_W			; < FIELD_W ?
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
	ld (z80_ix),hl	; HL уже в HL — пляска через стек не нужна
	call z80_ldb_Y	; get sprite char width
	defb $09
; --- ЧЕРНИЛА — ОДИН РАЗ НА СУЩЕСТВО (2026-09-03, вынос из LB4F0) ------------
; Цвет существа задают таблицы типов (IsBlueIY/IsRedIY, перебор описателей), а
; ответ один на всё существо. Раньше оба поиска шли в LB4F0 — на КАЖДУЮ пару
; «столбец × видимая полоса», у существа 4×3 — двенадцать раз. Здесь мы до
; цикла по столбцам: результат — в ink_hi (сдвиг старшего байта экрана, 20h у
; синих) и в операндах тела блита (LB4FB_body). Оба хелпера берегут BC/DE/HL.
	IFDEF BLUESHARK
	xor a
	ld (ink_hi),a
	call IsBlueIY		; Z — тип из таблицы синих
	jp nz,LB4C4_nb
	ld a,20h
	ld (ink_hi),a		; синее целиком уезжает во вторую плоскость
LB4C4_nb:
	ENDIF
	IFDEF REDINK
; Тело выбирается РАЗ НА СУЩЕСТВО: патчатся оба байта адреса в LB4FB (см. разбор
; в LB4F0). Флаг Z от IsRedIY доживает до конца: ld и jp его не трогают.
	call IsRedIY		; Z — тип из таблицы красных
	ld a,LOW LB500
	jp nz,LB4C4_nr1
	ld a,LOW LB500R
LB4C4_nr1:
	ld (LB4FB_body+1),a
	ld a,HIGH LB500
	jp nz,LB4C4_nr2
	ld a,HIGH LB500R
LB4C4_nr2:
	ld (LB4FB_body+2),a
	ENDIF
LB4D6	PUSH BC
LB4D7:
	ld hl,(z80_iy)
	inc hl
	inc hl
	inc hl
	ld a,(hl)		; (IY+$03) — строка
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
	ld hl,(z80_iy)
	inc hl
	inc hl
	ld a,(hl)
	inc hl
	ld h,(hl)
	ld l,a			; HL = (IY+$02/$03) — столбец/строка
	CALL GetScrAddrF		; поле: столбец 0..FIELD_W-1 -> FIELD_COL0+столбец
	IFDEF BLUESHARK
; --- СИНЯЯ АКУЛА (-DBLUESHARK) ---------------------------------------------
; Акула целиком уезжает во ВТОРУЮ плоскость: на чёрной воде это индекс 1, то
; есть ColorGame. Второй буфер save-under для этого НЕ нужен — буфер хранит ту
; плоскость, в которую блит пишет, а мы просто меняем адрес экрана; под акулой
; сохранится и вернётся 0xE000.
; Плата известна и мала: сам блит не дорожает ни на такт, дорожает проверка
; столкновения в тракте дайвера (LE233) — по замеру 6.5 итераций на тик.
; Над рельефом акула сливается с ним (там обе плоскости уже стоят) — ровно так
; же, как сейчас жёлтые существа над рельефом становятся красными.
; СИНИЕ ТИПЫ — ПО ПОЛНОМУ АДРЕСУ ДЕСКРИПТОРА, ПО ТАБЛИЦЕ.
; Сравнивать старший байт и потом диапазон младших НЕЛЬЗЯ: дескрипторы лежат в
; РАЗНЫХ страницах, и под условие попали чужие — лодка и мелкая живность стали
; синими. Таблица короткая, поиск идёт только при отрисовке существа.
; HL СОХРАНЯЕТСЯ: в нём адрес экрана от GetScrAddrF, а под таблицу нужен
; собственный указатель. На этих же граблях правка уже стояла один раз.
; Поиск по таблице вынесен в LB4C4 (раз на существо); здесь — готовый сдвиг.
; blue_on взводится, как и раньше, только когда видимая полоса действительно
; рисуется — поведение байт в байт.
	ld a,(ink_hi)
	or a
	jp z,LB4F0_nb
	add a,h
	ld h,a
	ld a,1
	ld (blue_on),a		; синее существо на экране — LE233 проверяет вторую плоскость
LB4F0_nb:
	ENDIF
	IFDEF REDINK
; --- КРАСНОЕ СУЩЕСТВО (-DREDINK) -------------------------------------------
; Индекс 3 = биты стоят в ОБЕИХ плоскостях, значит одного прохода мало. Второй
; проход идёт не отдельным циклом по тем же байтам, а прямо в теле: у красных
; своё тело LB500R, которое кроме экрана в 0xC000 кладёт во вторую плоскость
; ДЕЛЬТУ — то, что этот байт на экране изменил. Дельта симметрична: тот же
; тракт рисует и стирает (буфер save-under и экран меняются местами), поэтому
; во второй плоскости биты встают и снимаются вместе с первой, и ВТОРОЙ БУФЕР
; НЕ НУЖЕН — а его в пуле и нет: 14 рабочих страниц при пике 10.
; Приём взят у осьминога (DrawOctopusSprite под -DDITHER), там он с 2026-08-27
; и есть единственное красное существо в игре.
; Тело выбирается РАЗ НА ЗНАКОМЕСТНЫЙ РЯД, а не на байт: патчится операнд jp в
; LB4FB. Патчатся ОБА байта адреса, а не один младший: первая редакция ставила
; только младший и держалась на ASSERT «оба тела в одной странице» — ASSERT
; упал от правки в три байта на соседней строке, и держать расположение двух
; кусков кода в одной странице руками нельзя. Флаг Z от IsRedIY доживает до
; конца: ld и jp его не трогают.
; ВЫБОР ТЕЛА ПЕРЕЕХАЛ В LB4C4 (раз на существо, 2026-09-03); разбор выше — о нём.
	ENDIF
	IFDEF CLOUDINK
; СТАЙКА — СВОЁ ТЕЛО: обе плоскости за один проход, у каждой свой буфер и своя
; маска. Ставится ПОСЛЕ красного: под этим флагом стайки в таблице красных нет
; (scubacod1.asm), но порядок держит правило «последний пишущий выигрывает».
	IFNDEF REDINK
	ld a,LOW LB500
	ld (LB4FB_body+1),a
	ld a,HIGH LB500
	ld (LB4FB_body+2),a
	ENDIF
	call IsCloudIY
	jp nz,LB4F0_nc
	ld a,LOW LB500C
	ld (LB4FB_body+1),a
	ld a,HIGH LB500C
	ld (LB4FB_body+2),a
LB4F0_nc:
	ENDIF
	push hl
	push de
	ld hl,(z80_iy)
	ld de,000Eh
	add hl,de
	ld a,(hl)		; (IY+$0E) — ширина строки в байтах, одна на весь столбец
	pop de
	pop hl
	add a,h			; конец строки по H — один на все восемь строк столбца
	ld (LB500_end+1),a	; операнды в коде (ОЗУ)
	IFDEF REDINK
	ld (LB500R_end+1),a	; у красного тела свой операнд конца строки
	ENDIF
	IFDEF CLOUDINK
	ld (LB500C_end+1),a	; и у облачного
	ENDIF
	LD B,$08		; repeat 8 times
; ЛОДКА — ПРЯМЫМ ВОПРОСОМ, А НЕ ЧЕРЕЗ ГЛОБАЛ. Было: BoatThis взводил blue_this=2,
; здесь читалось `cp 2`. Крюк шёл через переменную чужого механизма (синее чернило)
; и стоял внутри IFDEF BLUESHARK — из-за чего BOATFAST без BLUESHARK молча не
; работал. IsBoatIY отвечает на тот же вопрос по самому IY и портит только A
; (он тут уже мёртв: обе самомодификации выше сделаны).
	IFDEF BOATFAST
	call IsBoatIY
	jp z,BoatCol		; лодка: столбец одним проходом — уход в scubaboat.asm (BOATFAST)
	ENDIF
; Сюда же возвращается BoatCol (scubaboat.asm), если лодка обрезана краем поля.
LB4FB	PUSH BC			; B = счётчик строк
	PUSH HL			; экран: начало строки
; ЭТАП F.4: внутренний цикл блита. Было ~250 тактов на байт: указатель маски
; жил в тени z80_ix и на каждом байте менялся местами с экраном через память
; (ld (il_scr),hl / ld hl,(z80_ix) / ld (z80_ix),hl / ld hl,(il_scr) = 80 тактов),
; плюс счётчик в B и временный в C. Стало ~124: маска в BC, счётчик — сравнение
; H с концом строки, а t = буфер XOR экран кладётся В САМ БАЙТ ЭКРАНА как
; временный операнд (тот же приём, что в LE233): у i8080 AND/OR/XOR с памятью
; только через (HL). Тождества: X = маска|t — новый экран; Y = X^t = маска&~t —
; новый буфер; X = Y^t. Между двумя записями байт экрана ~100 тактов держит фон
; без спрайта — луч застаёт это в одном байте на кадр редко, глазом не видно.
	ld (il_scr),hl
	ld hl,(z80_ix)
	ld b,h
	ld c,l			; BC = маска
	ld hl,(il_scr)
	IF NEEDBODY
LB4FB_body:
	jp LB500		; операнд патчится в LB4F0: обычное тело, красное или облачное
	ENDIF
LB500	LD A,(DE)		; байт буфера
	XOR (HL)		; t = буфер XOR экран
	LD (HL),A		; t на экран — временный операнд
	ld a,(bc)		; маска
	OR (HL)			; X = маска | t
	XOR (HL)		; Y = X ^ t = маска & ~t
	LD (DE),A		; новый буфер
	XOR (HL)		; X снова
	LD (HL),A		; новый экран
	inc h			; next column
	INC DE
	inc bc
	ld a,h
LB500_end	cp 0		; операнд ставит `ld (LB500_end+1),a` перед LB4FB
	jp nz,LB500
LB500_tail:
	ld h,b
	ld l,c
	ld (z80_ix),hl		; тень маски: было INC IX на каждом байте
; Хвост строки без хелперов: (IY+$07) := (IY+$06)+1 — как было (в теле цикла
; поле уже не используется, но его читают дальше), DE и маска += (IY+$0F).
	ld hl,(z80_iy)
	push de
	ld de,0006h
	add hl,de
	ld a,(hl)
	INC A
	inc hl
	ld (hl),a		; (IY+$07) := (IY+$06)+1
	ld de,0008h
	add hl,de		; -> (IY+$0F)
	ld e,(hl)
	LD D,$00		; DE = шаг строки
	ld hl,(z80_ix)
	add hl,de
	ld (z80_ix),hl		; маска += шаг
	ex de,hl		; HL = шаг
	pop de			; DE = буфер
	ADD HL,DE
	EX DE,HL		; DE = буфер + шаг
	POP HL
	dec l ;INC H		; next pixel row
	POP BC
	dec b
	jp nz,LB4FB
	IF NEEDBODY
	jp LB500_colend		; ПРОВАЛ ЗАКРЫТ: ниже лежит второе тело цикла, и без
				; этого перехода конец рядов уходил бы прямо в него.
				; Ровно тот же класс ошибки, что defb в потоке команд
				; (см. shell_ink, 2026-08-27): между двумя кусками
				; кода нет границы, если её не поставить.
; --- ТЕЛО ЦИКЛА ДЛЯ КРАСНОГО СУЩЕСТВА --------------------------------------
; Первые девять команд — точная копия LB500 (обмен экрана и буфера save-under
; через временный байт на экране, разбор — в шапке LB500). Дальше то, ради чего
; тело отдельное: ДЕЛЬТА байта уходит во вторую плоскость.
;   S — экран до нас (сохраняется первым же чтением, регистров под него нет);
;   X — экран после нас (он же в A после LD (HL),A);
;   дельта = X ^ S — ровно те биты, которые этот байт зажёг или погасил.
; Наложенная XOR-ом на 0xE000, дельта повторяет форму спрайта при рисовании и
; снимает её при стирании. Над рельефом и небом существо прорезает чужие биты
; на время показа и возвращает их при уходе — порчи не остаётся, в отличие от
; записи маски без save-under.
; ЦЕНА ЧЕСТНО: байт стоит вдвое дороже обычного (~250 тактов против ~124).
; Платят только типы из LB4F0_redtab.
LB500R:
	ld a,(hl)
	ld (red_scr),a		; S — что было на экране до нас
	LD A,(DE)		; байт буфера
	XOR (HL)		; t = буфер XOR экран
	LD (HL),A		; t на экран — временный операнд
	ld a,(bc)		; маска
	OR (HL)			; X = маска | t
	XOR (HL)		; Y = X ^ t
	LD (DE),A		; новый буфер
	XOR (HL)		; X снова
	LD (HL),A		; новый экран
	push hl
	ld hl,red_scr
	xor (hl)		; A = X ^ S = дельта
	pop hl
	push af
	ld a,h
	add a,20h
	ld h,a			; та же клетка во второй плоскости
	pop af
	xor (hl)
	ld (hl),a
	ld a,h
	sub 20h
	ld h,a			; вернуть указатель
	inc h			; next column
	INC DE
	inc bc
	ld a,h
LB500R_end	cp 0		; операнд ставит `ld (LB500R_end+1),a` перед LB4FB
	jp nz,LB500R
	jp LB500_tail
	ENDIF
	IFDEF CLOUDINK
; --- ТЕЛО ЦИКЛА ДЛЯ СТАЙКИ (-DCLOUDINK) ------------------------------------
; Стайка — единственное существо, у которого особи РАЗНОГО цвета, и одним
; проходом её не нарисовать: жёлтые рыбки идут в 0xC000, синие в 0xE000, красные
; в обе. Приём красного (дельта первой плоскости, наложенная на вторую) здесь не
; работает — он повторяет ФОРМУ первой плоскости, а нам нужна другая форма.
; Поэтому у стайки честно две плоскости, и у каждой свой save-under:
;   первая  — экран 0xC000, буфер (IX+$07), маска A из блока кадров;
;   вторая  — экран 0xE000, буфер (IX+$07)+80h, маска D из scubacloud.asm.
; ВТОРОЙ БУФЕР НЕ СТОИТ НИ СТРАНИЦЫ ПУЛА: слот стайки 128 Б (4 записи по 32,
; замер cloudpass_probe.js), страница пула выровнена — вторая половина пуста.
; Ровно то же со стейджингом: маска D лежит в его второй половине.
; Все три смещения делаются через XOR, а не add/sub: xor сам себе обратен (одна
; команда туда, одна обратно, флаг переноса не участвует) и не может утащить
; указатель в соседнюю страницу — экран 0xC0..0xDF ^ 20h = 0xE0..0xFF, младшие
; байты буфера и маски 00..7F ^ 80h = 80..FF.
; ЦЕНА ЧЕСТНО: байт стоит примерно вдвое дороже обычного. Платит одна стайка.
LB500C:
	LD A,(DE)		; байт буфера первой плоскости
	XOR (HL)		; t = буфер XOR экран
	LD (HL),A
	ld a,(bc)		; маска A
	OR (HL)
	XOR (HL)
	LD (DE),A		; новый буфер
	XOR (HL)
	LD (HL),A		; новый экран
	ld a,h
cl_sx1	xor 20h			; экран второй плоскости (метка — для негативного контроля гейта)
	ld h,a
	ld a,e
	xor 80h
	ld e,a			; буфер второй плоскости
	ld a,c
cl_mx1	xor 0			; маска D; операнд ставит LB496 (0 при стирании)
	ld c,a
	LD A,(DE)		; те же девять команд на смещённых указателях
	XOR (HL)
	LD (HL),A
	ld a,(bc)
	OR (HL)
	XOR (HL)
	LD (DE),A
	XOR (HL)
	LD (HL),A
	ld a,h
cl_sx2	xor 20h
	ld h,a
	ld a,e
	xor 80h
	ld e,a
	ld a,c
cl_mx2	xor 0
	ld c,a
	inc h			; next column
	INC DE
	inc bc
	ld a,h
LB500C_end	cp 0		; операнд ставит `ld (LB500C_end+1),a` перед LB4FB
	jp nz,LB500C
	jp LB500_tail
	ENDIF
LB500_colend:			; сюда приходит и BoatCol (scubaboat.asm), закончив столбец лодки
	POP BC
	ld hl,(z80_iy)
	inc hl
	inc hl
	inc hl
	inc (hl)		; (IY+$03)++ — следующая строка
	ld a,(hl)
	CP $18			; < 24 ?
	jp NC,LB53A
	dec b
	jp nz,LB4D6
LB53A:
	pop hl			; HL дальше мёртв: LB547 задаёт его целиком, у LB470 нет читателей HL
	ld (z80_ix),hl
	IFDEF CLOUDINK
; ХВОСТ БЛИТА — ПО ОБОИМ БУФЕРАМ СТАЙКИ. LB547/LB57E/LB5A4 сдвигают содержимое
; save-under вслед за движением существа (замер: на четырёх уровнях сдвиг
; горизонтальный срабатывает десятками раз за сотню тиков). Второй буфер обязан
; ехать тем же порядком, иначе под стайкой во второй плоскости остаётся след.
; Удваивать сам сдвиг нельзя: горизонтальный — это memmove всего слота на байт,
; и на восьми записях вместо четырёх он потащил бы первый байт второй половины
; в последний байт первой. Поэтому тракт зовётся ДВАЖДЫ, а между заходами
; переставляется указатель буфера в записи.
	call IsCloudIY
	jp nz,LB53A_1
	call LB53A_1		; первая плоскость
	call CloudBufHi		; (IX+$07) ^= 80h
	call LB53A_1		; вторая плоскость
	jp CloudBufHi		; вернуть указатель на место и выйти
LB53A_1:
	ENDIF
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
i80_ldir_2:		; A мёртв у всех вызывающих — сохранять его незачем
	ld a,(hl)
	ld (de),a
	inc hl
	inc de
	dec bc
	ld a,b
	or c
	jp nz,i80_ldir_2
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
i80_lddr_3:		; A мёртв у всех вызывающих
	ld a,(hl)
	ld (de),a
	dec hl
	dec de
	dec bc
	ld a,b
	or c
	jp nz,i80_lddr_3
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
; ЭТАП G (2026-08-28): обновление положения существа переписано нативно.
; Было: каждое обращение к полю — ld hl,(z80_ix) / ld de,n / add hl,de (~44
; тактов), плюс хелперы z80_sta_Y_*, z80_lda_X_13, rst 20h; ~1500 тактов на
; вызов. Стало: указатель на (IX+$0D) живёт на стеке, база и IY читаются раз.
; Контракт прежний: вход по теням z80_ix/z80_iy, A/B/C/D/E/H/L портятся, выход
; через RET (в том числе из LB646/LB655/LB65F). Семантика Z80 дословно:
;   LB5E0: RES 1,(IX+$0D); BIT 0 -> SET 1;  LB5EE: RES 0,(IX+$0D);
;   столбец: A=(IX+0)-E; C=A; если A<W или A+(IY+6)<W -> LB60A, иначе SET 0,A=C
;   LB60A: (IY+2)=(IY+0)=A; строка: A=(IX+1)-D; C=A; если <24 или +(IY+8)<24 -> LB62D,
;          иначе (IY+1)=A; RES 0; A=(IX+$0D); -> LB65F
;   LB62D: (IY+3)=(IY+1)=A; (IX+$0D)^=1; бит0=0 -> LB65F; бит1 -> RET; иначе пул LB646
;   LB65F: бит1=0 -> RET; бит7 -> RET; RES 7,LB676[(IX+8)&15]
LB5E0:
	ld hl,(z80_ix)
	ld de,000Dh
	add hl,de		; -> (IX+$0D)
	ld a,(hl)
	and 0FDh		; RES 1
	ld c,a
	and 1			; BIT 0
	ld a,c
	jp z,LB5EE_f
	or 2			; SET 1
; LB5EE оригинала — осадок рекомпиляции, удалён; ветка SET 1 проваливается в
; LB5EE_f (бывший jp прыгал на следующую же команду — 3 Б и 10 тактов впустую)
LB5EE_f:
	and 0FEh		; RES 0
	ld (hl),a
	push hl			; [SP] = указатель на (IX+$0D)
	ld de,0FFF3h
	add hl,de		; -> (IX+$00)
	ld a,(hl)
	inc hl
	ld b,(hl)		; B = (IX+$01)
	ld hl,(L5B0B)
	ex de,hl		; DE = начало окна: E столбец, D строка
	sub e			; столбец на экране
	ld c,a
	cp FIELD_W
	jp c,LB60A_f
	ld hl,(z80_iy)
	push de
	ld de,0006h
	add hl,de
	pop de
	add a,(hl)		; + (IY+$06) — ширина
	cp FIELD_W
	ld a,c
	jp c,LB60A_f
	ex (sp),hl		; HL = (IX+$0D)
	ld a,(hl)
	or 1			; SET 0
	ld (hl),a
	ex (sp),hl
	ld a,c
LB60A_f:
	ld hl,(z80_iy)
	inc hl
	inc hl
	ld (hl),a		; (IY+$02)
	dec hl
	dec hl
	ld (hl),a		; (IY+$00)
	ld a,b
	sub d			; строка на экране
	ld c,a
	cp 24
	jp c,LB62D_f
	ld hl,(z80_iy)
	push de
	ld de,0008h
	add hl,de
	pop de
	add a,(hl)		; + (IY+$08) — высота
	cp 24
	ld a,c
	jp c,LB62D_f
	ld hl,(z80_iy)
	inc hl
	ld (hl),a		; (IY+$01)
	pop hl			; -> (IX+$0D)
	ld a,(hl)
	and 0FEh		; RES 0
	ld (hl),a
	jp LB65F_f
LB62D_f:
	ld hl,(z80_iy)
	inc hl
	inc hl
	inc hl
	ld (hl),a		; (IY+$03)
	dec hl
	dec hl
	ld (hl),a		; (IY+$01)
	pop hl			; -> (IX+$0D)
	ld a,(hl)
	xor 1
	ld (hl),a
	ld c,a
	and 1
	ld a,c			; УТЕЧКА ПУЛА (ревизия 2026-08-29): `and 1` — это развёртка BIT 0,A,
				; но BIT регистр не портил, а `and` портит. LB65F_f получал A=0 и
				; возвращался сразу, страница save-under ушедшего за край существа
				; не освобождалась НИКОГДА (замер 12000 тиков: у оригинала 12
				; освобождений, у нас 0). Флаги ld не трогает — jp z ниже верен.
	jp z,LB65F_f
	and 2
	ret nz
	IFDEF QPOOL
; ---- QPOOL (2026-09-03): пул четвертями страницы -----------------------------
; След буфера каждого типа = ровно (IY+$09)*(IY+$0A) байт (карта записей по
; страницам, все уровни): 48, 64, 80, 128, 168, 256. Класс: <=64 — четверть,
; <=128 — половина, иначе страница. Таблица LB676 — 64 четверти: бит 7 занято,
; бит 6 — продолжение отрезка (не голова). Ищется первый снизу выровненный
; свободный отрезок. Указатель: (IX+$08) = POOL_HI|страница, (IX+$07) = четверть*64.
; На поверхности ур.4 пул держали 48-байтные медузы и рыбы — по странице каждая.
	push de
	ld hl,(z80_iy)
	ld de,0009h
	add hl,de
	ld b,(hl)		; строк
	inc hl
	ld e,(hl)		; байт в строке
	ld d,0
	ld hl,0
PQ_mul:
	add hl,de
	dec b
	jp nz,PQ_mul		; HL = строк*байт (до 256)
	pop de
	ld a,h
	or a
	jp nz,PQ_c4		; >= 256 — страница
	ld a,l
	cp 65
	jp c,PQ_c1
	IFNDEF CLOUDINK
	cp 129
	jp c,PQ_c2
	ENDIF
; под CLOUDINK половин нет: стайка держит второй буфер по (IX+$07)^80h — ей
; нужна целая страница, а класс по габариту дал бы половину.
PQ_c4:	ld c,4
	jp PQ_find
PQ_c2:	ld c,2
	jp PQ_find
PQ_c1:	ld c,1
PQ_find:			; C = класс (четвертей), шаг поиска = C — выравнивание само собой
	ld hl,LB676
	xor a			; A = индекс четверти
PQ_scan:
	push hl
	push af
	ld b,c
PQ_chk:
	ld a,(hl)
	and 1<<(7)
	jp nz,PQ_busy
	inc hl
	dec b
	jp nz,PQ_chk
	pop af			; свободный отрезок с индекса A
	pop hl
	jp PQ_take
PQ_busy:
	pop af
	pop hl
	add a,c			; следующий выровненный отрезок
	push af
	ld a,c
	add a,l
	ld l,a
	ld a,h
	adc a,0
	ld h,a
	pop af
	cp 64
	jp c,PQ_scan
	jp LB646_none
PQ_take:			; A = индекс четверти, HL = запись в таблице, C = класс
	push af
	ld (hl),1<<(7)		; голова
	ld b,c
	dec b
	jp z,PQ_marked
PQ_cont:
	inc hl
	ld (hl),0C0h		; продолжение
	dec b
	jp nz,PQ_cont
PQ_marked:
	pop af
	push af
	rrca
	rrca
	and 0Fh
	or POOL_HI		; старший байт: страница
	rst 20h	; = call z80_sta_X
	defb $08
	pop af
	rrca
	rrca
	and 0C0h		; младший байт: четверть*64
	rst 20h	; = call z80_sta_X
	defb $07
LB655_marked:
	RET
LB646_none:
	rst 30h	; = call z80_setX
	defb $0D
	defb 1<<(7)
	RET
; PQ_free: вернуть отрезок записи z80_ix. Портит A, B, DE, HL.
PQ_free:
	ld hl,(z80_ix)
	ld de,0007h
	add hl,de
	ld a,(hl)		; (IX+$07): четверть*64
	rlca
	rlca
	and 3
	ld b,a
	inc hl
	ld a,(hl)		; (IX+$08)
	and 0Fh
	add a,a
	add a,a
	or b			; индекс четверти
	ld hl,LB676
	add a,l
	ld l,a
	ld a,h
	adc a,0
	ld h,a
	ld (hl),0		; голова
	ld b,3
PQ_fr1:
	inc hl
	ld a,(hl)
	and 1<<(6)
	ret z			; не продолжение — конец отрезка
	ld (hl),0
	dec b
	jp nz,PQ_fr1
	ret
	ENDIF
	IFNDEF QPOOL
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
; База POOL_HI стоковая, 0xB0. Возврат в пул (LB65F, LBCB4) восстанавливает
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
	ENDIF
LB65F_f:			; A = (IX+$0D)
	ld c,a
	and 2
	ret z
	ld a,c
	and 80h
	ret nz
	IFDEF QPOOL
	jp PQ_free
	ENDIF
	IFNDEF QPOOL
	ld hl,(z80_ix)
	ld de,0008h
	add hl,de
	ld a,(hl)
	AND $0F			; 0..15: база пула кратна 16 страницам
	LD HL,LB676
	LD E,A
	LD D,$00
	ADD HL,DE
	ld a,(hl)
	and 07Fh
	ld (hl),a
	RET
	ENDIF

	IFDEF QPOOL
LB676	DEFS 64			; 64 четверти
	ENDIF
	IFNDEF QPOOL
LB676	DEFS $10
	ENDIF

; I: IX = record address in LC4F0 area
; I: IY = record address in LC092 area
LB686:
; Нативная редакция под i8080 (была построчным переводом Z80 через хелперы
; z80_*_X/Y — ~90 тактов на каждое поле). ЧТО делает — см. спецификацию
; tools/verify/lb686_spec.py, она доказана дифференциально на живых вызовах:
; существо шагнуло на клетку — освободить покинутый столбец/строку в карте
; занятости SCRATTR, сдвинуть координаты записи и описателя, пометить новое
; место (LB704 -> LB875). Регистры: C = 6^метка — «наша» клетка, живёт до
; самого LB70F; B — направление, потом счётчик строк; DE/HL — временные.
; ⚠️ Смещения полей: флаг «влево» — (IX+$11) (в переводе это было
; z80_bitX_17 с ДЕСЯТИЧНЫМ 17), флаг «вверх» — (IX+$12).
	ld hl,(z80_ix)
	ld de,0004h
	add hl,de
	ld a,(hl)		; (IX+$04) — метка существа
	xor 6
	ld c,a			; C = 6 ^ метка
	ld de,0009h
	add hl,de		; -> (IX+$0D) — флаги шага
	ld a,(hl)
	ld (lb686_fl),a
; --- РАННИЙ ВЫХОД: существо целиком за экраном (78 % вызовов на ур.4) ---
; Тогда все три прохода по SCRATTR ничего не трогают (доказано фаззингом в
; lb686_spec.py: offscreen/lb686_fast против полной модели), остаётся сдвиг
; координат и (IY+$0E) := 0. Критерий консервативный, ровно как в модели:
;   столбцы: col >= FIELD_W+1 и col + w + (IY+6) + 1 <= 255 (без переноса)
;   строки:  row >= 25       и row + h + (IY+8) + 1 <= 255
	ld hl,(z80_iy)
	ld e,(hl)		; E = столбец
	inc hl
	ld d,(hl)		; D = строка
	inc hl
	inc hl
	inc hl
	inc hl
	inc hl			; -> (IY+$06)
	ld a,(hl)
	inc hl
	add a,(hl)		; (IY+6) + ширина
	inc a
	add a,e			; + столбец: перенос = обёртка через 255
	jp c,LB686_cin
	ld a,e
	cp FIELD_W+1
	jp nc,LB686_skip	; столбцы целиком за полем
LB686_cin:
	inc hl			; -> (IY+$08)
	ld a,(hl)
	inc hl
	add a,(hl)		; (IY+8) + высота
	inc a
	add a,d			; + строка
	jp c,LB686_full
	ld a,d
	cp 25
	jp nc,LB686_skip	; строки целиком за полем
LB686_full:
	ld hl,(z80_ix)
	ld de,000Dh
	add hl,de		; -> (IX+$0D)
	ld a,(lb686_fl)
	and 1<<(5)
	jp Z,LB6D6
; шаг по горизонтали: освободить покинутый столбец
	ld de,0004h
	add hl,de		; -> (IX+$11): бит 7 = влево
	ld a,(hl)
	and 1<<(7)
	ld hl,(z80_ix)
	jp NZ,LB6A6
	inc (hl)		; (IX+$00)++ — на клетку вправо
	ld hl,(z80_iy)
	ld e,(hl)		; покинутый столбец = старый (IY+$00)
	inc (hl)		; (IY+$00)++
	jp LB6B1
LB6A6:
	dec (hl)		; (IX+$00)-- — на клетку влево
	ld hl,(z80_iy)
	ld a,(hl)		; старый (IY+$00)
	dec (hl)		; (IY+$00)--
	push hl
	ld de,0006h
	add hl,de
	add a,(hl)		; + (IY+$06) = покинутый правый столбец
	pop hl
	ld e,a
LB6B1:
	inc hl			; -> (IY+$01)
	ld d,(hl)		; D = строка
	push de
	ld de,0008h
	add hl,de		; -> (IY+$09)
	ld b,(hl)		; высота — счётчик строк
	pop hl			; HL = (строка, столбец)
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
	CP FIELD_W			; столбец < FIELD_W ?
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
	ld a,(lb686_fl)
	and 1<<(6)
	jp Z,LB704
; шаг по вертикали: освободить покинутую строку
	ld hl,(z80_ix)
	ld de,0012h
	add hl,de		; -> (IX+$12): бит 7 = вверх
	ld a,(hl)
	and 1<<(7)
	ld hl,(z80_ix)
	inc hl			; -> (IX+$01)
	jp NZ,LB6F6
	inc (hl)		; (IX+$01)++ — на клетку вниз
	ld hl,(z80_iy)
	ld e,(hl)		; столбец
	inc hl
	ld d,(hl)		; покинутая строка = старая (IY+$01)
	inc (hl)		; (IY+$01)++
	ex de,hl		; HL = (строка, столбец)
	jp LB701
LB6F6:
	dec (hl)		; (IX+$01)-- — на клетку вверх
	ld hl,(z80_iy)
	ld e,(hl)		; столбец
	inc hl
	ld a,(hl)		; старая (IY+$01)
	dec (hl)		; (IY+$01)--
	push de
	ld de,0007h
	add hl,de
	add a,(hl)		; + (IY+$08) = покинутая нижняя строка
	pop de
	ld d,a
	ex de,hl		; HL = (строка, столбец)
LB701	CALL LB70F		; Screen attribute change for horizontally oriented object
LB704:
	ld hl,(z80_iy)
	ld a,(hl)
	inc hl
	ld h,(hl)
	ld l,a			; HL = (IY+$00/$01)
	LD C,$06
	JP LB875
lb686_fl	defb 0		; флаги шага (IX+$0D) на время LB686
	IFDEF BLUESHARK
ink_hi	defb 0		; сдвиг старшего байта экрана для текущего существа: 20h синее, 0 иначе (LB4C4 -> LB4F0)
	ENDIF

; Ранний выход LB686: только координаты. HL = запись (IX), DE = описатель (IY).
LB686_skip:
	ld hl,(z80_iy)
	ex de,hl		; DE -> (IY+$00)
	ld hl,(z80_ix)		; HL -> (IX+$00)
	ld a,(lb686_fl)
	and 1<<(5)
	jp z,LB686_skv
	push hl
	ld bc,0011h
	add hl,bc
	ld a,(hl)		; (IX+$11): бит 7 = влево
	pop hl
	and 1<<(7)
	jp nz,LB686_skl
	inc (hl)		; (IX+$00)++
	ld a,(de)
	inc a
	ld (de),a		; (IY+$00)++
	jp LB686_skv
LB686_skl:
	dec (hl)		; (IX+$00)--
	ld a,(de)
	dec a
	ld (de),a		; (IY+$00)--
LB686_skv:
	ld a,(lb686_fl)
	and 1<<(6)
	jp z,LB686_ske
	push hl
	ld bc,0012h
	add hl,bc
	ld a,(hl)		; (IX+$12): бит 7 = вверх
	pop hl
	inc hl			; -> (IX+$01)
	inc de			; -> (IY+$01)
	and 1<<(7)
	jp nz,LB686_sku
	inc (hl)
	ld a,(de)
	inc a
	ld (de),a
	jp LB686_ske
LB686_sku:
	dec (hl)
	ld a,(de)
	dec a
	ld (de),a
LB686_ske:
	ld hl,(z80_iy)
	ld bc,000Eh
	add hl,bc
	ld (hl),0		; (IY+$0E) := 0 — как после полного прохода
	RET

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
	ld hl,(z80_iy)
	ld de,0007h
	add hl,de
	ld b,(hl)		; (IY+$07) — ширина, счётчик столбцов
	pop hl
	push hl
; Адрес клетки = SCRATTR + строка*32 + столбец: базу строки считаем ОДИН раз,
; столбец 0..31 ложится в младшие 5 бит. Было: GetScrAttrAddr на каждую клетку
; (~100 тактов) + push/pop + две проверки; клеток на вызов LB686 около 12.
; Проверка «столбец < FIELD_W» одна: при FIELD_W <= 32 она покрывает и старую
; AND $E0 (столбцы 32..255, в т.ч. «отрицательные» после переполнения).
	ASSERT FIELD_W <= 32
	ld e,l			; E = столбец
	ld l,0
	call GetScrAttrAddr	; HL = база строки (столбец 0); DE цел
	ld d,l			; D = младший байт базы: строка<<5
LB71B	ld a,e			; column
	cp FIELD_W		; < FIELD_W ?
	jp nc,LB732		; нет => пропустить клетку
	or d
	ld l,a			; HL = адрес клетки
	ld a,(hl)		; get color from the screen
	cp c			; same color?
	jp nz,LB732		; skip if not
	call z80_xor_X	; change color (BC/DE/HL целы)
	defb $04
	ld (hl),a		; write color to the screen
LB732	inc e			; next column
	dec b
	jp nz,LB71B
	POP HL
	RET

; I: IX = record address in LC4F0 area
LB737:
; ЭТАП G: шапка обновления существа нативно — база записи читается один раз,
; поля берутся ходом указателя; проверки битов (IX+$0D) без хелперов.
	ld hl,(z80_ix)
	push hl			; база записи
	ld de,0013h
	add hl,de		; -> (IX+$13)
	ld e,(hl)
	inc hl
	ld d,(hl)		; DE = адрес описателя
	ex de,hl
	ld (z80_iy),hl		; тень IY
	ex de,hl		; HL -> (IX+$14)
	ld de,0FFFAh
	add hl,de		; -> (IX+$0E)
	ld a,(hl)
	inc hl
	IFDEF WHEEL
; КОЛЕСО: из скана колеса (wh_grp ≠ 0) в +$0F пишется СРОК = часы + период;
; из линейных обходов (группы IV/V, LC431) — счётчик, как раньше.
	ld d,a
	ld a,(wh_grp)
	or a
	ld a,d
	jp z,LB737_cnt
	ld a,(wh_C)
	add a,d
LB737_cnt:
	ENDIF
	ld (hl),a		; (IX+$0F) := (IX+$0E) — счётчик заново
	dec hl
	dec hl			; -> (IX+$0D)
	ld a,(hl)
	and 09Fh		; RES 5, RES 6
	ld (hl),a
	ld de,0004h
	add hl,de		; -> (IX+$11)
	ld c,(hl)
	inc hl
	ld b,(hl)		; C = dx, B = dy
	pop hl			; база
	inc hl
	inc hl			; -> (IX+$02)
	ld a,(hl)
	add a,c
	and 007h
	ld (hl),a
	inc hl			; -> (IX+$03)
	ld a,(hl)
	add a,b
	and 007h
	ld (hl),a
	CALL LB5E0
	ld hl,(z80_ix)
	ld de,000Dh
	add hl,de		; -> (IX+$0D)
	ld a,(hl)
	and 1
	jp z,LB77B
	ld a,(hl)
	and 80h
	jp nz,LB79E
	CALL LB470
	CALL LB686
	jp LB79E
LB77B:				; HL -> (IX+$0D)
	ld a,(hl)
	and 07Fh		; RES 7
	ld (hl),a
	push hl
	ld de,0FFF5h
	add hl,de		; -> (IX+$02)
	ld a,(hl)
	or a
	jp nz,LB789
	ex (sp),hl
	ld a,(hl)
	or 020h			; SET 5,(IX+$0D)
	ld (hl),a
	ex (sp),hl
LB789:
	inc hl			; -> (IX+$03)
	ld a,(hl)
	or a
	jp nz,LB793
	ex (sp),hl
	ld a,(hl)
	or 040h			; SET 6,(IX+$0D)
	ld (hl),a
	ex (sp),hl
LB793:
	pop hl			; -> (IX+$0D)
	ld a,(hl)
	AND $60
	jp Z,LB79E
	CALL LB686
	RET
LB79E:
	ld hl,(z80_ix)
	inc hl
	inc hl			; -> (IX+$02)
	ld c,(hl)
	inc hl
	ld b,(hl)		; B = (IX+$03)
	ld de,000Ah
	add hl,de		; -> (IX+$0D)
	ld a,(hl)
	and 4
	ld a,c
	jp z,LB7AA
	ld a,b
LB7AA	CP $04
	RET NZ
	LD HL,LB7B8		; address of the return point - put on the stack
	PUSH HL
	ld hl,(z80_ix)
	ld de,0005h
	add hl,de
	ld a,(hl)
	inc hl
	ld h,(hl)
	ld l,a			; HL = адрес процедуры движения
	JP (HL)			; run the moving procedure
LB7B8	RET

; СТЕЙДЖИНГ-БУФЕР = СТРАНИЦА ИНДЕКСА 0, забронированного в LBEC7 навсегда.
; Адрес обязан следовать за базой пула (стоковый 0xB000). Литерал здесь и в
; LBEC7 — одно и то же место, и разъехаться им нельзя.
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
	push hl
	ld hl,(z80_iy)
	ld de,0009h
	add hl,de
	ld a,(hl)		; (IY+$09) — высота
	ld de,0005h
	add hl,de		; -> (IY+$0E)
	ld (hl),a		; счётчик строк
	pop hl
LB87B	CALL LB70F		; Screen attribute change for horizontally oriented object
	INC H			; next row
	push hl
	ld hl,(z80_iy)
	ld de,000Eh
	add hl,de
	dec (hl)		; (IY+$0E)--
	pop hl
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
	CP FIELD_W			; результат в 0..FIELD_W-1 ?
	jp NC,LB8D7
	LD L,A
	LD H,D			; now HL = row/column on the screen
; ЧТЕНИЕ КАРТЫ ЗАНЯТОСТИ SCRATTR горизонтальным ходоком: $06 = клетка свободна.
; Метка нужна стенду — по ней меряется покрытие этой ветки (tools/verify/drive.js,
; сценарий walk; до него ветка не исполнялась в гейтах НИ РАЗУ).
LB89F_attr:
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
	IFDEF MIRROR
; Текущий кадр держится ЧИСТЫМ — по нему идёт арифметика анимации. Но бит 15
; снимается только у зеркального типа: у прочих он часть адреса (см. LB3E9).
	push hl
	call IsMirrorIY
	pop hl
	jp nz,MIR_keep2
	ld a,h
	and 7Fh
	ld h,a			; текущий кадр — без признака зеркальности
MIR_keep2:
	ENDIF
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
	IFDEF BLUESHARK
; СИНИМ В НЕБО НЕЛЬЗЯ (владелец, 2026-08-28): строки 0..7 карты — небо верхнего
; экрана во второй плоскости; синий спрайт, зашедший туда, рисовался бы поверх
; неба. Вертикальному ходоку цель в этих строках считаем занятой.
	cp 8			; A = целевая строка
	jp nc,LB98A_ok
	call IsBlueIY
	jp z,LB9F9		; синий тип — как в стену
LB98A_ok:
	ENDIF
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
	CP FIELD_W			; FIELD_W
	jp NC,LB9C7
	LD L,A
	LD H,D
; То же чтение карты занятости SCRATTR, но вертикальным ходоком. Метка — для
; меры покрытия (см. LB89F_attr).
LB972_attr:
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
	IFDEF QPOOL
	call PQ_free
	ENDIF
	IFNDEF QPOOL
	call z80_lda_X
	defb $08
	AND $0F			; 0..15: база пула кратна 16 страницам
	LD E,A
	LD D,$00
	LD HL,LB676
	ADD HL,DE
	LD (HL),$00
	ENDIF
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
	IFDEF WHEEL
	PUSH DE
	call WH_event		; счётчик записи — через колесо (до построения: обычная запись)
	POP DE
	ENDIF
	IFNDEF WHEEL
	rst 20h	; = call z80_sta_X
	defb $0F
	ENDIF
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
; ЭТАП F.3: скан развёрнут на четыре записи, счётчик записей — раз на четыре,
; push/pop BC на быстром пути сняты (как у LBEA2: B и DE берегутся только на
; редком пути вызова LB737). Тело на запись: dec (hl) / jp nz / add hl,de —
; ~36 тактов против ~96 (LBE48) и ~56 (LBEA2). Остаток B mod 4 обрабатывается
; входом в середину развёртки (адрес входа кладётся на стек, RET прыгает).
; Тело одно на три обхода; редкий путь — общие подпрограммы SCAN_HIT26/21.
; ДЛИНА ТЕЛА ЗАШИТА ТРЕМЯ `add a,a` (остаток * 8) — и больше нигде не проверялась.
; Вход в развёртку считается как «адрес за четырьмя телами минус 8*остаток»:
; вырастет тело хоть на байт (например, SCAN_HIT сменят на что-то без CALL) — и
; RET прыгнет в середину инструкции. Сторож на это ниже, по одному на каждую из
; трёх развёрток, по образцу ASSERT SH_b6-SH_b7 = SH_BODY в сдвигателе.
SCAN_BODY	EQU 8		; dec (hl) 1 + jp nz 3 + call SCAN_HIT 3 + add hl,de 1
; РАСХОЖДЕНИЕ С Z80. У Зимина обход крутил DJNZ, а он при B=0 делает 256 итераций;
; здесь `dec b / jp nz` даёт то же самое, но B тут — ЧИСЛО ПРОХОДОВ ПО ЧЕТЫРЕ,
; то есть (записей+3)/4. Нуля не бывает: записей в группах 18..31 / 26..50 /
; 27..51 по уровням, значит проходов не меньше 5.
LBE40:
	IFDEF WHEEL
	ld hl,WH_TAB_II
	jp WH_scan
	ENDIF
	IFNDEF WHEEL
	IFDEF TIMEBASE
; TIMEBASE: счётчик -= Δ; A = t+~Δ = t-Δ-1, перенос <=> ещё не досчитал; перелёт — в перезарядку.
	ld a,(tb_delta)
	cpl
	ld c,a			; C = ~Δ на весь обход
	LD A,(NumRecsII)
	LD B,A
	ld hl,(RecsAddrII)
	ld (z80_ix),hl
	ld de,000Fh
	add hl,de		; HL -> +$0F первой записи
	ld de,001Ah
	ld a,b
	and 3
	jp nz,LBE48_tb_x11
	ld a,4
LBE48_tb_x11:
	push bc
	ld b,a
	add a,a
	add a,a
	add a,a
	add a,b
	add a,b
	add a,b			; 11 байт на тело
	pop bc
	ld (tb_ent),a
	ld a,b
	add a,3
	rrca
	rrca
	and 03Fh
	ld b,a			; проходов = (B+3)/4
	push hl
	push de
	ld hl,LBE48_tb_b4
	ld a,(tb_ent)
	ld e,a
	ld a,l
	sub e
	ld l,a
	ld a,h
	sbc a,0
	ld h,a
	pop de
	ex (sp),hl
	ret
LBE48_tb_b0:
	ld a,(hl)
	add a,c
	inc a
	ld (hl),a
	jp c,LBE48_tb_next1
	call SCAN_HIT26_TB
LBE48_tb_next1:
	add hl,de
	ld a,(hl)
	add a,c
	inc a
	ld (hl),a
	jp c,LBE48_tb_next2
	call SCAN_HIT26_TB
LBE48_tb_next2:
	add hl,de
	ld a,(hl)
	add a,c
	inc a
	ld (hl),a
	jp c,LBE48_tb_next3
	call SCAN_HIT26_TB
LBE48_tb_next3:
	add hl,de
	ld a,(hl)
	add a,c
	inc a
	ld (hl),a
	jp c,LBE48_tb_next4
	call SCAN_HIT26_TB
LBE48_tb_next4:
	add hl,de
LBE48_tb_b4:
	ASSERT LBE48_tb_b4-LBE48_tb_b0 = 4*SCAN_BODY_TB
	dec b
	jp nz,LBE48_tb_b0
	RET
	ENDIF
	IFNDEF TIMEBASE
	LD A,(NumRecsII)	; get Number of 26-byte records: 18 / 22 / 26 / 31, depending on LEVEL
	LD B,A			; loop counter
	ld hl,(RecsAddrII)
	ld (z80_ix),hl
	ld de,000Fh		; НЕ bc: в B уже лежит счётчик записей
	add hl,de		; HL -> поле +0x0F первой записи
	ld de,001Ah		; шаг записи держим в DE весь обход
	ld a,b
	and 3			; остаток: сколько записей в первом (неполном) проходе
	jp nz,LBE48_x8		; остаток есть — множим его на 8
	ld a,4			; остаток 0 — первый проход полный
LBE48_x8:
	add a,a
	add a,a
	add a,a			; 8 байт на тело
	ld c,a
	ld a,b
	add a,3
	rrca
	rrca
	and 03Fh
	ld b,a			; проходов = (B+3)/4
	push hl
	ld hl,LBE48_b4		; вход = адрес за четырьмя телами минус 8*остаток
	ld a,l
	sub c
	ld l,a
	ld a,h
	sbc a,0
	ld h,a
	ex (sp),hl		; HL = указатель, [SP] = вход
	ret			; прыжок на вход
LBE48_b0:
	dec (hl)
	jp nz,LBE48_next1		; счётчик не ноль — мимо редкого пути
	call SCAN_HIT26
LBE48_next1:
	add hl,de
	dec (hl)
	jp nz,LBE48_next2		; счётчик не ноль — мимо редкого пути
	call SCAN_HIT26
LBE48_next2:
	add hl,de
	dec (hl)
	jp nz,LBE48_next3		; счётчик не ноль — мимо редкого пути
	call SCAN_HIT26
LBE48_next3:
	add hl,de
	dec (hl)
	jp nz,LBE48_next4		; счётчик не ноль — мимо редкого пути
	call SCAN_HIT26
LBE48_next4:
	add hl,de
LBE48_b4:
	ASSERT LBE48_b4-LBE48_b0 = 4*SCAN_BODY	; вход в развёртку считается по этой длине
	dec b
	jp nz,LBE48_b0
	RET
; SCAN_HIT26 — в scubacod1.asm (до ALIGN); SCAN_HIT21 здесь
SCAN_HIT21:
	push bc
	push hl
	ld bc,0FFF1h
	add hl,bc
	ld (z80_ix),hl
	CALL LB737
	pop hl
	pop bc
	ld de,0015h
	ret

; Process 26-byte records in group II
	ENDIF
	ENDIF
LBE58	LD A,(NumRecsII)	; get Number of 26-byte records: 18 / 22 / 26 / 31, depending on LEVEL
	LD B,A
	ld hl,(RecsAddrII)	; now IX = record address in LC4F0 area; HL мёртв (LB7BB его не читает)
	ld (z80_ix),hl
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
LBE6D:
	IFDEF WHEEL
	ld hl,WH_TAB_III
	jp WH_scan
	ENDIF
	IFNDEF WHEEL
	IFDEF TIMEBASE
; TIMEBASE: счётчик -= Δ; A = t+~Δ = t-Δ-1, перенос <=> ещё не досчитал; перелёт — в перезарядку.
	ld a,(tb_delta)
	cpl
	ld c,a			; C = ~Δ на весь обход
	LD A,(NumRecsIII)
	LD B,A
	ld hl,(RecsAddrIII)
	ld (z80_ix),hl
	ld de,000Fh
	add hl,de		; HL -> +$0F первой записи
	ld de,001Ah
	ld a,b
	and 3
	jp nz,LBE75_tb_x11
	ld a,4
LBE75_tb_x11:
	push bc
	ld b,a
	add a,a
	add a,a
	add a,a
	add a,b
	add a,b
	add a,b			; 11 байт на тело
	pop bc
	ld (tb_ent),a
	ld a,b
	add a,3
	rrca
	rrca
	and 03Fh
	ld b,a			; проходов = (B+3)/4
	push hl
	push de
	ld hl,LBE75_tb_b4
	ld a,(tb_ent)
	ld e,a
	ld a,l
	sub e
	ld l,a
	ld a,h
	sbc a,0
	ld h,a
	pop de
	ex (sp),hl
	ret
LBE75_tb_b0:
	ld a,(hl)
	add a,c
	inc a
	ld (hl),a
	jp c,LBE75_tb_next1
	call SCAN_HIT26_TB
LBE75_tb_next1:
	add hl,de
	ld a,(hl)
	add a,c
	inc a
	ld (hl),a
	jp c,LBE75_tb_next2
	call SCAN_HIT26_TB
LBE75_tb_next2:
	add hl,de
	ld a,(hl)
	add a,c
	inc a
	ld (hl),a
	jp c,LBE75_tb_next3
	call SCAN_HIT26_TB
LBE75_tb_next3:
	add hl,de
	ld a,(hl)
	add a,c
	inc a
	ld (hl),a
	jp c,LBE75_tb_next4
	call SCAN_HIT26_TB
LBE75_tb_next4:
	add hl,de
LBE75_tb_b4:
	ASSERT LBE75_tb_b4-LBE75_tb_b0 = 4*SCAN_BODY_TB
	dec b
	jp nz,LBE75_tb_b0
	RET
	ENDIF
	IFNDEF TIMEBASE
	LD A,(NumRecsIII)	; get Number of 26-byte records (26 / 34 / 42 / 50) in group III
	LD B,A
	ld hl,(RecsAddrIII)
	ld (z80_ix),hl
	ld de,000Fh		; НЕ bc: в B уже лежит счётчик записей
	add hl,de		; HL -> поле +0x0F первой записи
	ld de,001Ah		; шаг записи держим в DE весь обход
	ld a,b
	and 3			; остаток: сколько записей в первом (неполном) проходе
	jp nz,LBE75_x8		; остаток есть — множим его на 8
	ld a,4			; остаток 0 — первый проход полный
LBE75_x8:
	add a,a
	add a,a
	add a,a			; 8 байт на тело
	ld c,a
	ld a,b
	add a,3
	rrca
	rrca
	and 03Fh
	ld b,a			; проходов = (B+3)/4
	push hl
	ld hl,LBE75_b4		; вход = адрес за четырьмя телами минус 8*остаток
	ld a,l
	sub c
	ld l,a
	ld a,h
	sbc a,0
	ld h,a
	ex (sp),hl		; HL = указатель, [SP] = вход
	ret			; прыжок на вход
LBE75_b0:
	dec (hl)
	jp nz,LBE75_next1		; счётчик не ноль — мимо редкого пути
	call SCAN_HIT26
LBE75_next1:
	add hl,de
	dec (hl)
	jp nz,LBE75_next2		; счётчик не ноль — мимо редкого пути
	call SCAN_HIT26
LBE75_next2:
	add hl,de
	dec (hl)
	jp nz,LBE75_next3		; счётчик не ноль — мимо редкого пути
	call SCAN_HIT26
LBE75_next3:
	add hl,de
	dec (hl)
	jp nz,LBE75_next4		; счётчик не ноль — мимо редкого пути
	call SCAN_HIT26
LBE75_next4:
	add hl,de
LBE75_b4:
	ASSERT LBE75_b4-LBE75_b0 = 4*SCAN_BODY	; вход в развёртку считается по этой длине
	dec b
	jp nz,LBE75_b0
	RET

; Process 26-byte records in group III
	ENDIF
	ENDIF
LBE85	LD A,(NumRecsIII)	; get Number of 26-byte records (26 / 34 / 42 / 50) in group III
	LD B,A
	ld hl,(RecsAddrIII)	; HL мёртв: LB7BB его не читает
	ld (z80_ix),hl
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
LBE9A:
	IFDEF WHEEL
	ld hl,WH_TAB_I
	jp WH_scan
	ENDIF
	IFNDEF WHEEL
	IFDEF TIMEBASE
; TIMEBASE: счётчик -= Δ; A = t+~Δ = t-Δ-1, перенос <=> ещё не досчитал; перелёт — в перезарядку.
	ld a,(tb_delta)
	cpl
	ld c,a			; C = ~Δ на весь обход
	LD A,(NumRecsI)
	LD B,A
	ld hl,LC4F0
	ld (z80_ix),hl
	ld de,000Fh
	add hl,de		; HL -> +$0F первой записи
	ld de,0015h
	ld a,b
	and 3
	jp nz,LBEA2_tb_x11
	ld a,4
LBEA2_tb_x11:
	push bc
	ld b,a
	add a,a
	add a,a
	add a,a
	add a,b
	add a,b
	add a,b			; 11 байт на тело
	pop bc
	ld (tb_ent),a
	ld a,b
	add a,3
	rrca
	rrca
	and 03Fh
	ld b,a			; проходов = (B+3)/4
	push hl
	push de
	ld hl,LBEA2_tb_b4
	ld a,(tb_ent)
	ld e,a
	ld a,l
	sub e
	ld l,a
	ld a,h
	sbc a,0
	ld h,a
	pop de
	ex (sp),hl
	ret
LBEA2_tb_b0:
	ld a,(hl)
	add a,c
	inc a
	ld (hl),a
	jp c,LBEA2_tb_next1
	call SCAN_HIT21_TB
LBEA2_tb_next1:
	add hl,de
	ld a,(hl)
	add a,c
	inc a
	ld (hl),a
	jp c,LBEA2_tb_next2
	call SCAN_HIT21_TB
LBEA2_tb_next2:
	add hl,de
	ld a,(hl)
	add a,c
	inc a
	ld (hl),a
	jp c,LBEA2_tb_next3
	call SCAN_HIT21_TB
LBEA2_tb_next3:
	add hl,de
	ld a,(hl)
	add a,c
	inc a
	ld (hl),a
	jp c,LBEA2_tb_next4
	call SCAN_HIT21_TB
LBEA2_tb_next4:
	add hl,de
LBEA2_tb_b4:
	ASSERT LBEA2_tb_b4-LBEA2_tb_b0 = 4*SCAN_BODY_TB
	dec b
	jp nz,LBEA2_tb_b0
	RET
	ENDIF
	IFNDEF TIMEBASE
	LD A,(NumRecsI)		; get Number of 21-byte records in group I: 27 / 35 / 43 / 51, depending on LEVEL
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
	ld a,b
	and 3			; остаток: сколько записей в первом (неполном) проходе
	jp nz,LBEA2_x8		; остаток есть — множим его на 8
	ld a,4			; остаток 0 — первый проход полный
LBEA2_x8:
	add a,a
	add a,a
	add a,a			; 8 байт на тело
	ld c,a
	ld a,b
	add a,3
	rrca
	rrca
	and 03Fh
	ld b,a			; проходов = (B+3)/4
	push hl
	ld hl,LBEA2_b4		; вход = адрес за четырьмя телами минус 8*остаток
	ld a,l
	sub c
	ld l,a
	ld a,h
	sbc a,0
	ld h,a
	ex (sp),hl		; HL = указатель, [SP] = вход
	ret			; прыжок на вход
LBEA2_b0:
	dec (hl)
	jp nz,LBEA2_next1		; счётчик не ноль — мимо редкого пути
	call SCAN_HIT21
LBEA2_next1:
	add hl,de
	dec (hl)
	jp nz,LBEA2_next2		; счётчик не ноль — мимо редкого пути
	call SCAN_HIT21
LBEA2_next2:
	add hl,de
	dec (hl)
	jp nz,LBEA2_next3		; счётчик не ноль — мимо редкого пути
	call SCAN_HIT21
LBEA2_next3:
	add hl,de
	dec (hl)
	jp nz,LBEA2_next4		; счётчик не ноль — мимо редкого пути
	call SCAN_HIT21
LBEA2_next4:
	add hl,de
LBEA2_b4:
	ASSERT LBEA2_b4-LBEA2_b0 = 4*SCAN_BODY	; вход в развёртку считается по этой длине
	dec b
	jp nz,LBEA2_b0
	RET

	ENDIF
	ENDIF
LBEB2	LD A,(NumRecsI)		; get Number of 21-byte records in group I: 27 / 35 / 43 / 51, depending on LEVEL
	LD B,A			; loop count
	ld hl,LC4F0		; record address; HL мёртв
	ld (z80_ix),hl
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
	IFDEF QPOOL
	LD (HL),$80		; страница 0 = стейджинг: четыре четверти
	INC HL
	LD (HL),$80
	INC HL
	LD (HL),$80
	INC HL
	LD (HL),$80
	INC HL
	LD B,60
	ENDIF
	IFNDEF QPOOL
	LD (HL),$80
	INC HL
	LD B,$0F		; repeat 15 times
	ENDIF
	XOR A
LBED0	LD (HL),A
	INC HL
	dec b
	jp nz,LBED0
	IFDEF EXPLFADE
	ld hl,LB676+61		; четверти 61..63 ($BF40..$BFFF): копия кадра взрыва и код (scubaexpl.asm)
	ld (hl),$80
	inc hl
	ld (hl),$80
	inc hl
	ld (hl),$80
	ENDIF
; БРОНЬ ВЕРХНИХ СТРАНИЦ ПУЛА ПОД ЖИЛЬЦОВ, КОТОРЫЕ ТАМ ДЕЙСТВИТЕЛЬНО ЕСТЬ.
; Распределитель ищет первую запись с НУЛЕВЫМ битом 7 (LB646: and 1<<7 / jp z),
; освобождение бит 7 сбрасывает. Значит выставленный бит 7 — это «занято
; навсегда», и распределитель эту страницу не выдаст никогда.
; ЖИЛЬЦЫ (2026-08-30). Страниц в пуле 16 (LB676 — 16 записей); индекс 0 занят
; безусловно циклом выше — это стейджинг-буфер (LB7B9), он не жилец брони, а
; часть механизма. Сверх него бронируется:
;   -DBOATFAST — ОДНА страница 13 (BOAT_PAGE): собранный со сдвигом кадр лодки,
;                распределителю остаётся 14 страниц (1..12, 14, 15);
;   без него   — ничего, распределителю остаются все 15 страниц 1..15.
; Прежняя бронь была на три страницы всегда: под «данные колеса таймеров» (его
; нет и не было — docs/archive/node_timer_wheel.md, «НЕ РЕАЛИЗОВАН») и под
; модули лодки и меню в страницах 14..15. Модули с 2026-08-30 переехали в
; обычный код, и бронь под них стала чистым вычетом из пула.
; ЧЕМ ЭТО БЫЛО ПЛОХО, замер pool_peak.js (12000 тиков, сид 0x0167): на уровне 4
; пик занятости упирался в потолок и ветка «пул исчерпан» (LB646_none) срабатывала
; ТРИ раза за прогон — существо, которому буфера не дали, не рисуется вовсе.
; С бронью в одну страницу исчерпаний ноль.
	IFDEF BOATFAST
	IFDEF QPOOL
	LD HL,LB676+13*4	; страница 13 = BOAT_PAGE, кадр лодки: четыре четверти
	LD (HL),$80
	INC HL
	LD (HL),$80
	INC HL
	LD (HL),$80
	INC HL
	LD (HL),$80
	ENDIF
	IFNDEF QPOOL
	LD HL,LB676+13		; страница 13 = BOAT_PAGE, кадр лодки
	LD (HL),$80
	ENDIF
	ENDIF
	LD HL,POOL_HI*256	; стейджинг = страница индекса 0 (см. LB7B9)
	LD (LB7B9),HL
	RET

LBEDB	CALL LBEC7
	LD HL,LBDAA
	LD (LBD9B+1),HL		; set table address
	LD HL,LC20A		; record template for Boat
	LD DE,LC4F0		; record address
	LD BC,21		; 21 bytes
i80_ldir_4:		; A мёртв: сразу за копией LD A,(L5B13)
	ld a,(hl)
	ld (de),a
	inc hl
	inc de
	dec bc
	ld a,b
	or c
	jp nz,i80_ldir_4
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
i80_ldir_5:		; A мёртв: NextRandom его только пишет
	ld a,(hl)
	ld (de),a
	inc hl
	inc de
	dec bc
	ld a,b
	or c
	jp nz,i80_ldir_5
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
i80_ldir_6:		; A мёртв: NextRandom его только пишет
	ld a,(hl)
	ld (de),a
	inc hl
	inc de
	dec bc
	ld a,b
	or c
	jp nz,i80_ldir_6
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
; МЛАДШИЙ БАЙТ АДРЕСА НАБОРА — СИМВОЛЬНО, А НЕ ЛИТЕРАЛОМ.
; Здесь ставится набор кадров круглой рыбы: пишется только младший байт полей
; +$09 (набор) и +$0B (текущий кадр), старший приходит из шаблона записи. У
; Зимина набор лежал по адресу, оканчивающемуся на $85, и литерал совпадал сам
; собой; у нас карта другая и меняется от правки к правке. Пока L8285
; оканчивался на $85, ошибка не проявлялась — а стоило снять зеркальные наборы,
; и данные сдвинулись на байт: записи получили адрес на единицу меньше, и
; существа стали рисовать чужой кадр. Ошибку видно только по картинке, поэтому
; ASSERT ниже держит и старший байт: если он разойдётся с шаблоном, сборка
; упадёт, а не начнёт молча рисовать не то.
	rst 28h	; = call z80_stn_X
	defb $09
	defb LOW L8285
	rst 28h	; = call z80_stn_X
	defb $0B
	defb LOW L8285
	IFDEF MIRROR
; ПЕРЕКЛЮЧАТЕЛЬ РАЗВОРАЧИВАЕТ КАЖДУЮ ВТОРУЮ РЫБУ, И ПРИЗНАК ЗЕРКАЛА НАДО СНЯТЬ.
; Условие выше — бит 0 счётчика записей: половина круглых рыб остаётся на
; шаблонном наборе, половина переставляется на L8285. У Зимина хватало младшего
; байта (L8254 и L8285 в одной странице), у нас зеркальность живёт в старшем
; бите базы — без этих двух записей переставленная рыба осталась бы отражённой.
	rst 28h	; = call z80_stn_X
	defb $0A
	defb HIGH L8285
	rst 28h	; = call z80_stn_X
	defb $0C
	defb HIGH L8285
	ENDIF
	rst 28h	; = call z80_stn_X
	defb $11
	defb $FE
LBF5D:
	dec b
	jp nz,LBF1D
	ld a,e			; save address for 26-byte records; A мёртв
	ld (RecsAddrII),a
	ld a,d
	ld (RecsAddrII+1),a
	LD A,(NumRecsII)	; get number of 26-byte records in group II
	LD HL,$0F1B
	ld (il_hl),hl	; table address with record templates, horizontal movement
	ld hl,LC2EB
	ld (z80_iy),hl
	ld hl,(il_hl)
	CALL LBFB0
	ld a,e			; save address for 26-byte records; A мёртв
	ld (RecsAddrIII),a
	ld a,d
	ld (RecsAddrIII+1),a
	LD A,(NumRecsIII)	; get number of 26-byte records in group III
	LD HL,$2A3B
	ld (il_hl),hl	; table address with record templates, horizontal movement
	ld hl,LC331
	ld (z80_iy),hl
	ld hl,(il_hl)
	CALL LBFB0
	ld a,e			; save address for 26-byte records; A мёртв
	ld (RecsAddrIV),a
	ld a,d
	ld (RecsAddrIV+1),a
	ld hl,LBFA0		; HL мёртв: ниже LD HL,LBDB2
	ld (z80_iy),hl
	LD A,(NumRecsIV)	; get number of 26-byte records in group IV
	LD HL,LBDB2
	LD (LBD9B+1),HL		; set table address
	CALL LC009
	ld hl,LBFA8		; HL мёртв: LC009 задаёт его сам (LD HL,MiniMap+$3FF)
	ld (z80_iy),hl
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
i80_ldir_7:		; A мёртв: за копией LD HL,(LC007) и LD A,(RANDOM)
	ld a,(hl)
	ld (de),a
	inc hl
	inc de
	dec bc
	ld a,b
	or c
	jp nz,i80_ldir_7
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
i80_ldir_8:		; A мёртв: за копией LD A,D
	ld a,(hl)
	ld (de),a
	inc hl
	inc de
	dec bc
	ld a,b
	or c
	jp nz,i80_ldir_8
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
	IFDEF MIRROR
	DEFW L8285,L8285+8000h,L82B6,L82E6,L82C6,L82F6		; Round fish
	ELSE
	DEFW L8285,L8254,L82B6,L82E6,L82C6,L82F6		; Round fish
	ENDIF
LC0CE	DEFW $0000,$0000,LC0B2,$0201,$0302,$1010,$2003,$0000
	DEFW L8347,L8316,L8378,L83A8,L8388,L83B8		; Round fish vertical
LC0EA	DEFW $0000,$0000,$0000,$0706,$0302,$1038,$7005,$0000
	IFDEF MIRROR
	DEFW L64E5,L64E5+8000h,L6666,L6846				; Fish
	ELSE
	DEFW L64E5,L6364,L6666,L6846				; Fish
	ENDIF
LC102	DEFW $0000,$0000,$0000,$0807,$0403,$1840,$C006,$0000
	IFDEF MIRROR
	DEFW L70B7,L70B7+8000h,L6CC7,L7358				; Shark
	ELSE
	DEFW L70B7,L6A26,L6CC7,L7358				; Shark
	ENDIF
LC11A	DEFW $0000,$0000,$0000,$0504,$0201,$0828,$2804,$0000
	IFDEF MIRROR
	DEFW L7BCE,L7BCE+8000h,L7D50,L7CD0				; Long fish
	ELSE
	DEFW L7BCE,L7C4F,L7D50,L7CD0				; Long fish
	ENDIF
LC132	DEFW $0000,$0000,$0000,$0403,$0403,$1820,$6001,$0000
	DEFW L7748,L7869,L7942,L7821				; Fish cloud
LC14A	DEFW $0000,$0000,LC166,$0403,$0201,$0820,$2005,$0000
	IFDEF MIRROR
	DEFW L60D9,L60D9+8000h,L6061,L613A,L6091,L616A		; Small squid horizontal
	ELSE
	DEFW L60D9,L6000,L6061,L613A,L6091,L616A		; Small squid horizontal
	ENDIF
LC166	DEFW $0000,$0000,LC14A,$0201,$0403,$1810,$3005,$0000
	DEFW L628B,L61B2,L6213,L62EC,L6243,L631C		; Small squid vertical
LC182	DEFW $0000,$0000,LC19E,$0403,$0201,$0820,$2003,$0000
	IFDEF NOEELMIR
	DEFW L7A1B,L798A,L79D3,L7A64,L79EB,L7A7C		; опыт: угорь со своим набором «влево»
	ELSE
	IFDEF MIRROR
	DEFW L7A1B,L7A1B+8000h,L79D3,L7A64,L79EB,L7A7C		; Electric eel horizontal
	ELSE
	DEFW L7A1B,L798A,L79D3,L7A64,L79EB,L7A7C		; Electric eel horizontal
	ENDIF
	ENDIF
LC19E	DEFW $0000,$0000,LC182,$0201,$0403,$1810,$3003,$0000
	DEFW L7AF5,L7AAC,L7B3E,L7B86,L7B56,L7B9E		; Electric eel vertical
LC1BA	DEFW $0000,$0000,LC1D6,$0504,$0201,$0828,$2805,$0000
	IFDEF MIRROR
	DEFW L7EF1,L7EF1+8000h,L7E51,L7F72,L7E91,L7FB2		; Snake fish horizontal
	ELSE
	DEFW L7EF1,L7DD0,L7E51,L7F72,L7E91,L7FB2		; Snake fish horizontal
	ENDIF
LC1D6	DEFW $0000,$0000,LC1BA,$0201,$0504,$2010,$4005,$0000
	DEFW L8133,L8012,L8093,L81B4,L80D3,L81F4		; Snake fish vertical
LC1F2	DEFW $0000,$0000,$0000,$0807,$0302,$1040,$8006,$0000
	IFDEF MIRROR
	DEFW L8839,L8839+8000h,L8599,L89FA				; Squid
	ELSE
	DEFW L8839,L83D8,L8599,L89FA				; Squid
	ENDIF

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
	IFDEF MIRROR
; Стартовый набор круглой рыбы у Зимина — L8254, то есть ЗЕРКАЛО L8285. У нас
; зеркало не хранится, поэтому здесь база помечена старшим битом; переключатель
; в LBF1D снимает признак у каждой второй рыбы (см. там же).
	DEFW L8285+8000h,L8285	; sprite address
	ELSE
	DEFW L8254,L8254	; sprite address
	ENDIF
	DEFB $18,$00,$00,$00,$02,$00
	DEFW LC0B2		; object record
; Record template for 26-byte record - Fish
LC249	DEFB $00,$00,$04,$02,$00
	DEFW LB885		; moving procedure
	DEFW $0000
	IFDEF MIRROR
	DEFW L64E5+8000h,L64E5	; зеркальный набор: признак в старшем бите базы
	ELSE
	DEFW L6364,L6364	; sprite address
	ENDIF
	DEFB $18,$00,$00,$00,$02,$00
	DEFW LC0EA		; object record
	DEFB $00,$00,$02,$00,$00,$00
; Record template for 26-byte record - Shark
LC264	DEFB $00,$00,$04,$02,$00
	DEFW LB885		; moving procedure
	DEFW $0000
	IFDEF MIRROR
	DEFW L70B7+8000h,L70B7	; зеркальный набор: признак в старшем бите базы
	ELSE
	DEFW L6A26,L6A26	; sprite address
	ENDIF
	DEFB $18,$00,$00,$00,$02,$00
	DEFW LC102		; object record
	DEFB $00,$00,$02,$00,$00,$00
; Record template for 26-byte record - Small squid horizontal
LC27F	DEFB $00,$00,$04,$02,$00
	DEFW LB885		; moving procedure
	DEFW $0000
	IFDEF MIRROR
	DEFW L60D9+8000h,L60D9	; зеркальный набор: признак в старшем бите базы
	ELSE
	DEFW L6000,L6000	; sprite address
	ENDIF
	DEFB $18,$00,$00,$00,$02,$00
	DEFW LC14A		; object record
	DEFB $00,$00,$02,$00,$00,$00
; Record template for 26-byte record - Long fish
LC29A	DEFB $00,$00,$04,$02,$00
	DEFW LB885		; moving procedure
	DEFW $0000
	IFDEF MIRROR
	DEFW L7BCE+8000h,L7BCE	; зеркальный набор: признак в старшем бите базы
	ELSE
	DEFW L7C4F,L7C4F	; sprite address
	ENDIF
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
	IFDEF MIRROR
	DEFW L7A1B+8000h,L7A1B	; зеркальный набор: признак в старшем бите базы
	ELSE
	DEFW L798A,L798A	; sprite address
	ENDIF
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
	IFDEF MIRROR
	DEFW L7EF1+8000h,L7EF1	; зеркальный набор: признак в старшем бите базы
	ELSE
	DEFW L7DD0,L7DD0	; sprite address
	ENDIF
	DEFB $18,$00,$00,$00,$02,$00
	DEFW LC1BA		; object record
	DEFB $00,$00,$02,$00,$00,$00
; Record template for 26-byte record - Squid
LC316	DEFB $00,$00,$04,$02,$00
	DEFW LB885		; moving procedure
	DEFW $0000
	IFDEF MIRROR
	DEFW L8839+8000h,L8839	; зеркальный набор: признак в старшем бите базы
	ELSE
	DEFW L83D8,L83D8	; sprite address
	ENDIF
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
	IFDEF MIRROR
; У КРУГЛОЙ РЫБЫ СТАРТОВЫЙ НАБОР — ПРЯМОЙ, И ЭТО НЕ ОПЕЧАТКА.
; Постановка уровня (LBF1D) на некоторых ветках переписывает младший байт полей
; +$09/+$0B на LOW L8285, оставляя старший из шаблона: у Зимина это переставляло
; рыбу с L8254 на L8285, потому что оба набора в одной странице. Признак зеркала
; живёт в старшем байте, и поставь мы его в шаблон — переписанная рыба осталась
; бы отражённой там, где оригинал её разворачивает. Зеркальный набор достаётся
; ей через указатель [1] дескриптора при развороте (LB95D).
; ⚠️ НЕ ЗАКРЫТО: на уровне 2 остаются 18 байт расхождения — там эта ветка
; не срабатывает, и рыба стартует прямой там, где оригинал стартует зеркальной.
; Разбор — docs/plan_scroll.md не место; см. память проекта.
	DEFW L8285,L8285	; sprite address
	ELSE
	DEFW L8254,L8254	; sprite address
	ENDIF
	DEFB $18,$00,$00,$00,$02,$00
	DEFW LC0B2		; object record
	DEFB $03,$01,$02,$00,$00,$00,$00,$00
; Record template for 28-byte record - Small squid horizontal
LC3D2	DEFB $00,$00,$04,$02,$00
	DEFW LBA64		; moving procedure
	DEFW $0000
	IFDEF MIRROR
	DEFW L60D9+8000h,L60D9	; зеркальный набор: признак в старшем бите базы
	ELSE
	DEFW L6000,L6000	; sprite address
	ENDIF
	DEFB $18,$00,$00,$00,$02,$00
	DEFW LC14A		; object record
	DEFB $04,$02,$02,$00,$00,$00,$00,$00
; Record template for 28-byte record - Electric eel horizontal
LC3EF	DEFB $00,$00,$04,$02,$00
	DEFW LBA64		; moving procedure
	DEFW $0000
	IFDEF MIRROR
	DEFW L7A1B+8000h,L7A1B	; зеркальный набор: признак в старшем бите базы
	ELSE
	DEFW L798A,L798A	; sprite address
	ENDIF
	DEFB $18,$00,$00,$00,$02,$00
	DEFW LC182		; object record
	DEFB $03,$01,$02,$00,$00,$00,$00,$00
; Record template for 28-byte record - Snake fish horizontal
LC40C	DEFB $00,$00,$04,$02,$00
	DEFW LBA64		; moving procedure
	DEFW $0000
	IFDEF MIRROR
	DEFW L7EF1+8000h,L7EF1	; зеркальный набор: признак в старшем бите базы
	ELSE
	DEFW L7DD0,L7DD0	; sprite address
	ENDIF
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
	IFDEF TIMEBASE
	ld a,(tb_delta)
	cpl
	ld c,a			; C = ~Δ
LC439	ld a,(hl)
	add a,c
	inc a
	ld (hl),a
	jp c,LC439_adv
	call SCAN_HIT26_TB
	ENDIF
	IFNDEF TIMEBASE
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
	ENDIF
LC439_adv:
	add hl,de
	dec b
	jp nz,LC439
	LD A,(NumRecsV)		; get Number of 28-byte records (12 / 27 / 42 / 57) in group V
	LD B,A			; loop counter
	ld de,$001C		; шаг записи группы V; HL уже на поле +0x0F первой записи V
	IFDEF TIMEBASE
LC44C	ld a,(hl)
	add a,c
	inc a
	ld (hl),a
	jp c,LC44C_adv
	call SCAN_HIT28_TB
	ENDIF
	IFNDEF TIMEBASE
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
	ENDIF
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
	ld hl,(RecsAddrIV)	; HL мёртв: LB7BB его не читает
	ld (z80_ix),hl
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
