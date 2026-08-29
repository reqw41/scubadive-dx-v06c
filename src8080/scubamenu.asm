; scubamenu.asm — УКРАШЕНИЯ СТАРТОВОГО ЭКРАНА (-DMENUART), 2026-08-29.
; Владелец: «на стартовом экране, где текст, добавить внизу риф, пару ракушек,
; кислород и сундук».
;
; ГДЕ ЖИВЁТ. В обычном коде, адреса не выбирает. (До 2026-08-30 — хвост 15-й
; страницы пула 0xBF10..0xBFFF: код игры тогда упирался в потолок 0xA000, Top
; был 0x9F61. После чистки мёртвой обвязки рекомпилятора место нашлось, и
; страница вернулась в пул буферов.) Зовётся только из меню (LEDFE).
;
; ЧТО РИСУЕТ. Знакоместные строки 17..23 под текстом меню (текст кончается в
; 16-й, HUD начинается с 24-й). Риф — профиль высот по столбцам (ReefTab, 32 Б):
; плоскость 0xC000 сплошь, 0xE000 — маска вкраплений L9CBF_noise, вращаемая по
; строкам, как в L9CBF: тело индекса 3 (коралл) с жёлтыми точками, ровно как
; рельеф уровня. Верхняя строка столбца — гребень (Crest), чтобы край не был
; ровной чертой. Предметы — штатными DrawTile16x8/DrawTile8x8 из тех же спрайтов,
; что в игре: большая ракушка и сундук синие (shell_ink, -DSHELLBLUE), кислород
; и малая ракушка жёлтые. Под каждым предметом высота рифа кратна 8 и равна
; нижней кромке его знакоместа: предмет стоит на рифе, а гасящий проход
; DrawTile* (другая плоскость в ноль) риф не режет.
;
; Столбцы предметов заданы экранными (0..31); DrawTile* идут через GetScrAddrF,
; который прибавляет FIELD_COL0-0C0h (0 под -DWIDE, 4 без него) — вычитаем.
	IFNDEF MENUHUD
	ASSERT 0	; раскладка строк 17..23 — только у меню под HUD
	ENDIF
	IFDEF HUDTOP
	ASSERT 0	; под верхним HUD низ экрана — не место под текстом
	ENDIF
	IFDEF EVICT
	ASSERT 0	; под -DEVICT своя композиция DrawMenuArt (scubacodc.asm)
	ENDIF

REEF_BOT	EQU 64		; lo нижней строки поля (экранная 191); HUD ниже — lo 0..63
MENU_FCOL	EQU FIELD_COL0-0C0h

DrawMenuBottom:
	ld hl,ReefTab
	ld d,0C0h		; D = старший байт столбца (плоскость 0xC000)
MbCol:
	ld b,(hl)		; высота столбца в пикселях
	push hl
	ld a,d
	add a,a
	add a,a
	add a,d
	ld c,a			; C = бегущий индекс шума: столбец*5, +3 на строку —
				; как клетка*5 + блок*3 в L9CBF; одна маска, вращаемая по
				; строкам, давала диагональную полоску (первый снимок)
	ld e,REEF_BOT
MbRow:
	ld a,0FFh
	ld (de),a		; тело в 0xC000
	IFDEF DITHER
	ld a,c
	add a,3
	ld c,a
	and 15
	ld hl,L9CBF_noise
	add a,l
	ld l,a
	ld a,h
	adc a,0
	ld h,a
	ld h,(hl)		; H = маска вкраплений этой строки
	ELSE
	ld h,0FFh
	ENDIF
	ld a,d
	xor 20h
	ld d,a
	ld a,h
	ld (de),a		; вкрапления в 0xE000
	ld a,d
	xor 20h
	ld d,a
	inc e
	dec b
	jp nz,MbRow
; гребень: верхняя строка столбца — узор по столбцу, в обе плоскости (коралл)
	ld a,d
	and 3
	ld hl,Crest
	add a,l
	ld l,a
	ld a,h
	adc a,0
	ld h,a
	ld a,(hl)
	ld (de),a
	ld h,a
	ld a,d
	xor 20h
	ld d,a
	ld a,h
	ld (de),a
	ld a,d
	xor 20h
	ld d,a
	pop hl
	inc hl
	inc d
	ld a,d
	cp 0E0h
	jp nz,MbCol
; Предметы. Синие — как в игре (LB121/LB151): сундук и большая ракушка.
	IFDEF SHELLBLUE
	ld a,1
	ld (shell_ink),a
	ENDIF
	ld hl,21*256+(4-MENU_FCOL)	; большая ракушка закрытая: низ в строке 21 …
	ld de,LB18C
	call DrawTile16x8
	ld hl,20*256+(4-MENU_FCOL)	; … верх в 20-й (как LB12B: «−32»)
	ld de,LB19C
	call DrawTile16x8
	ld hl,20*256+(14-MENU_FCOL)	; сундук
	ld de,LB1B4
	call DrawTile16x8
	IFDEF SHELLBLUE
	xor a
	ld (shell_ink),a
	ENDIF
	ld hl,19*256+(11-MENU_FCOL)	; кислород
	ld de,LB1AC
	call DrawTile8x8
	ld hl,20*256+(25-MENU_FCOL)	; малая ракушка открытая (с жемчужиной)
	ld de,LB1CC
	jp DrawTile8x8

; Гребень по столбцу (col & 3).
Crest:	defb 07Eh,0BDh,0DBh,0E7h
; Высота рифа на столбец 0..31, пикселей от нижней строки поля. Под предметами
; ровно: 16 — большая ракушка (столбцы 4..5, строки 20..21); 32 — кислород
; (столбец 11, строка 19); 24 — сундук (14..15, строка 20) и малая ракушка
; (25, строка 20).
ReefTab:
	defb  6,10,14,18, 16,16, 20,26,30,34,36, 32, 30,26, 24,24
	defb 22,18,15,12,10,13,19,23, 24,24, 21,18,16,12, 8, 6
DrawMenuBottomEnd:
