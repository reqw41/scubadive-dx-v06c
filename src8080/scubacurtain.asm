	IFDEF CURTAIN
; =====================================================================
; ШТОРКА: ЭКРАН СОБИРАЕТСЯ ПОЛОСАМИ В ОДИН ТАЙЛ (-DCURTAIN)
;
; Перерисовка поля занимает 52 кадра (замер drawscr_cost: 3 141 464 такта), и
; луч всё это время показывает промежуточное состояние — то есть переход УЖЕ
; виден. Штатный обход идёт блоками 64x64: двенадцать ступеней, каждая по четыре
; кадра, и картинка собирается мозаикой. -DSCRDIR разворачивал порядок БЛОКОВ в
; сторону движения, то есть делал три ступени по вертикали вместо трёх наоборот.
; Здесь шаг мельче в восемь раз: полоса — один тайл, 24 полосы по вертикали и 32
; по горизонтали, каждая около двух кадров. Это уже настоящая шторка.
;
; РЕЗУЛЬТАТ ОБЯЗАН ОСТАТЬСЯ БАЙТ В БАЙТ. Меняется только ПОРЯДОК записи: каждая
; клетка получает тот же байт из того же тайла того же блока. Проверка —
; romdiff_pix (экран) и state_cmp (состояние игры).
;
; ЧТО ЗДЕСЬ ЛЕГКО СЛОМАТЬ. Адрес клетки в трёх пространствах связан жёстко:
;   строка тайлов R = by*8 + ty (0..23), столбец c = bx*8 + tx (0..FIELD_W-1);
;   экран      H = FIELD_COL0 + c,  L = 0xFF - 8*R  (строки Вектора идут вниз
;              убыванием младшего байта);
;   атрибут    SCRATTR + R*32 + c;
;   тайл       адрес блока + ty*8 + tx.
; Штатный обход получал всё это инкрементами и ни разу не считал напрямую —
; поэтому связь и не была нигде записана.
; =====================================================================

; I: HL = положение экрана на мини-карте (H = строка, L = столбец).
; Зовётся из DrawGameScr вместо блочного двойного цикла; тени z80_ix/z80_iy уже
; сохранены вызывающим, портить можно всё.
CurtainDraw:
	ld a,h
	ld (cu_row0),a
	ld a,l
	ld (cu_col0),a
	call CU_octo
	ld a,(cu_dir)
	cp 2
	jp c,CU_rows
	jp CU_cols

; ОСЬМИНОГ ИЩЕТСЯ ОТДЕЛЬНЫМ ПРОХОДОМ ПО ДВЕНАДЦАТИ БЛОКАМ ЭКРАНА.
; В штатном обходе блок посещается один раз, и проверка «блок $1C» стояла прямо
; в его шапке. В шторке блок посещается ВОСЕМЬ раз — по разу на полосу, — и та же
; врезка сработала бы восемь раз или потребовала бы условия «первая полоса
; блока». Отдельный проход стоит двенадцати чтений карты (около полутора тысяч
; тактов из трёх миллионов) и читается сам по себе.
; Порядок обхода тот же, что у штатной перерисовки — сверху вниз, слева направо:
; если блоков $1C вдруг окажется два, побеждает последний, как и раньше.
CU_octo:
	ld c,$00		; C = by, строка блоков
CU_o_row:
	ld b,$00		; B = bx, столбец блоков
CU_o_col:
	push bc
	ld a,(cu_row0)
	add a,c
	ld h,a
	ld a,(cu_col0)
	add a,b
	AND $1F			; столбец карты 0..31 (строку штатный обход тоже не маскирует)
	ld l,a
	CALL MiniMap_Get
	pop bc
	CP $1C			; place for Octopus?
	jp nz,CU_o_next
; адрес экрана верхнего левого байта блока: столбец bx*8, строка растра by*64
	ld a,b
	add a,a
	add a,a
	add a,a			; bx*8
	add a,FIELD_COL0
	ld h,a
	ld a,c
	add a,a
	add a,a
	add a,a
	add a,a
	add a,a
	add a,a			; by*64 (by <= 2, переполнения нет)
	cpl			; 0xFF - by*64
	ld l,a
	ld (L9C51),hl		; save the Octopus screen address
	ld hl,LA41B		; empty sprite address
	ld (L9C53),hl		; set previous sprite
	ld a,$01
	ld (L9C50),a		; we have the Octopus on the screen
CU_o_next:
	inc b
	ld a,b
	cp FIELD_BLOCKS
	jp c,CU_o_col
	inc c
	ld a,c
	cp 3
	jp c,CU_o_row
	ret

; АДРЕС БЛОКА РЕЛЬЕФА ПО ЕГО НОМЕРУ: HL = LA4DD + A*64.
; Тот же счёт, что в шапке штатного блока (A*256, сдвинутое вправо на два).
; I: A = номер блока. O: HL = адрес. Портит A, DE.
CU_blkaddr:
	ld h,a
	ld l,$00
	ld a,h
	and a
	rra
	ld h,a
	ld a,l
	rra
	ld l,a
	ld a,h
	and a
	rra
	ld h,a
	ld a,l
	rra
	ld l,a
cu_blkbase:
	ld de,LA4DD		; base address for relief blocks (операнд — точка подсадки
				; дефекта для негативного контроля гейта, CT_INJECT)
	add hl,de
	ret

; --- ПОЛОСЫ ПО СТРОКАМ ТАЙЛОВ: вертикальный переход ------------------------
; Внутри полосы соседние тайлы стоят В РЯД, а TileOne двигает все три указателя
; ровно на один тайл вправо (столбец экрана +1, атрибут +1, тайл в блоке +1).
; Значит перезадавать их надо только на границе блока — раз в восемь тайлов, и
; полоса обходится почти даром.
CU_rows:
	ld a,(cu_dir)
	or a
	ld a,0			; вниз: шторка идёт сверху
	jp z,CU_r_set
	ld a,23			; вверх: снизу
CU_r_set:
	ld (cu_band),a
CU_r_loop:
	ld a,(cu_band)
	add a,a
	add a,a
	add a,a			; 8*R (R <= 23, переполнения нет)
	cpl			; L = 0xFF - 8*R
	ld l,a
	ld h,FIELD_COL0
	ld (cu_scr),hl
	ld a,(cu_band)
	ld l,a
	ld h,$00
	add hl,hl
	add hl,hl
	add hl,hl
	add hl,hl
	add hl,hl		; R*32
	ld de,SCRATTR
	add hl,de
	ld (z80_ix),hl		; атрибут первой клетки полосы
	xor a
	ld (cu_bx),a
	ld hl,(cu_scr)
CU_r_blk:
	ld (cu_scr),hl		; HL нужен под адрес карты — экран паркуется
	ld a,(cu_band)
	AND $18
	rrca
	rrca
	rrca			; by = R>>3 (после AND биты 3-4 доходят до 0-1 без переноса)
	ld b,a
	ld a,(cu_row0)
	add a,b
	ld h,a
	ld a,(cu_bx)
	ld b,a
	ld a,(cu_col0)
	add a,b
	AND $1F
	ld l,a
	CALL MiniMap_Get	; Calc address in MiniMap and Get block number
	call CU_blkaddr
	ld a,(cu_band)
	and 7
	add a,a
	add a,a
	add a,a			; ty*8 — строка тайлов внутри блока
	ld c,a
	ld b,$00
	add hl,bc
	ld (z80_iy),hl
	ld hl,(cu_scr)
	ld b,$08		; восемь тайлов блока в этой полосе
CU_r_tile:
	push bc
	call TileOne
	pop bc
	dec b
	jp nz,CU_r_tile
	ld a,(cu_bx)
	inc a
	ld (cu_bx),a
	cp FIELD_BLOCKS
	jp c,CU_r_blk
; полоса дорисована — следующая, в сторону движения
	ld a,(cu_dir)
	or a
	ld a,(cu_band)		; ld не трогает флаги от `or a`
	jp nz,CU_r_up
	inc a
	ld (cu_band),a
	cp 24
	jp c,CU_r_loop
	ret
CU_r_up:
	or a
	ret z			; полоса 0 дорисована — конец
	dec a
	ld (cu_band),a
	jp CU_r_loop

; --- ПОЛОСЫ ПО СТОЛБЦАМ ТАЙЛОВ: боковой переход ----------------------------
; Здесь соседние тайлы полосы стоят ДРУГ ПОД ДРУГОМ, а TileOne двигает все три
; указателя ВПРАВО. Пересчитывать их из номера клетки на каждом тайле не нужно:
; шаг вниз — это ровно поправка к тому, что TileOne уже сделал.
;   экран      H -= 1 (отменить шаг вправо), L -= 8 (строка растра ниже);
;   атрибут    += 31 = 32 - 1;
;   тайл       += 7  = 8 - 1.
; Поправка не знает про границу блока и знать не должна: экран и атрибут идут
; насквозь по всем 24 строкам полосы, а тайл всё равно перезадаётся на каждом
; блоке — блоки в памяти не подряд.
CU_cols:
	ld a,(cu_dir)
	cp 2
	ld a,0			; вправо: шторка идёт слева
	jp z,CU_c_set
	ld a,FIELD_W-1		; влево: справа
CU_c_set:
	ld (cu_band),a		; полоса = столбец тайлов c
CU_c_loop:
	ld a,(cu_band)
	add a,FIELD_COL0
	ld h,a
	ld l,$FF		; строка тайлов 0 — верх поля
	ld (cu_scr),hl
	ld a,(cu_band)
	ld l,a
	ld h,high SCRATTR	; SCRATTR выровнен на страницу, c <= 31 — младший байт и есть c
	ld (z80_ix),hl
	xor a
	ld (cu_by),a
CU_c_blk:
	ld a,(cu_by)
	ld b,a
	ld a,(cu_row0)
	add a,b
	ld h,a
	ld a,(cu_band)
	AND $18
	rrca
	rrca
	rrca			; bx = c>>3
	ld b,a
	ld a,(cu_col0)
	add a,b
	AND $1F
	ld l,a
	CALL MiniMap_Get	; Calc address in MiniMap and Get block number
	call CU_blkaddr
	ld a,(cu_band)
	and 7			; tx — столбец тайла внутри блока
	ld c,a
	ld b,$00
	add hl,bc
	ld (z80_iy),hl
	ld hl,(cu_scr)
	ld b,$08		; восемь тайлов столбца в этом блоке
CU_c_tile:
	push bc
	call TileOne
	pop bc
	dec h			; отменить шаг вправо
	ld a,l
	sub 8
	ld l,a			; строкой растра ниже
	push hl
	ld hl,(z80_ix)
	ld de,31
	add hl,de
	ld (z80_ix),hl		; атрибут: строкой ниже
	ld hl,(z80_iy)
	ld de,7
	add hl,de
	ld (z80_iy),hl		; тайл: строкой ниже внутри блока
	pop hl
	dec b
	jp nz,CU_c_tile
	ld (cu_scr),hl		; экран уже стоит на первой строке следующего блока
	ld a,(cu_by)
	inc a
	ld (cu_by),a
	cp 3
	jp c,CU_c_blk
	ld a,(cu_dir)
	cp 2
	ld a,(cu_band)		; ld не трогает флаги от `cp 2`
	jp nz,CU_c_left
	inc a
	ld (cu_band),a
	cp FIELD_W
	jp c,CU_c_loop
	ret
CU_c_left:
	or a
	ret z			; столбец 0 дорисован — конец
	dec a
	ld (cu_band),a
	jp CU_c_loop

; рабочие ячейки шторки
cu_dir		DEFB 0		; 0 вниз, 1 вверх, 2 вправо, 3 влево (ставит LE120)
cu_row0		DEFB 0		; строка карты левого верхнего блока экрана
cu_col0		DEFB 0		; столбец карты
cu_band		DEFB 0		; номер полосы: строка тайлов 0..23 или столбец 0..FIELD_W-1
cu_bx		DEFB 0		; столбец блоков внутри строковой полосы
cu_by		DEFB 0		; строка блоков внутри столбцовой полосы
cu_scr		DEFW 0		; парковка адреса экрана на время чтения карты
	ENDIF
