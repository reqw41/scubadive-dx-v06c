; ГЕНЕРИРУЕТСЯ tools/mkzone.py — РУКАМИ НЕ ПРАВИТЬ.
; Блоки данных, выселенные в ломти верхней зоны. Каждый ломоть — 64 байта,
; ассемблируется по адресу ломтя (DISP), а в образе лежит упакованным подряд;
; бут раскладывает их циклом с шагом 256 (см. RZONE_COPY в scubacod0.asm).
SCUBAZONE_SRC:
; --- ломоть 0: 0xC0C0, занято 64 из 64 Б
	DISP 0C0C0h
L79EB	DEFB $00,$00,$81,$00,$00,$42,$00,$00,$18,$00,$00,$78,$00,$00,$58,$00
	DEFB $00,$40,$00,$00,$24,$00,$00,$42,$00,$00,$00,$00,$03,$C0,$00,$02
	DEFB $40,$00,$32,$48,$00,$1E,$78,$00,$00,$00,$00,$00,$00,$00,$00,$00
L8254	DEFB $00,$18,$3C,$3C,$5F,$FE,$4F,$FF	; roundf0
	DEFB $5F,$FF,$30,$FE,$00,$3E,$00,$1C
	ENT
; --- ломоть 1: 0xC1C0, занято 64 из 64 Б
	DISP 0C1C0h
L7A7C	DEFB $81,$00,$00,$42,$00,$00,$18,$00,$00,$1E,$00,$00,$1A,$00,$00,$02
	DEFB $00,$00,$24,$00,$00,$42,$00,$00,$00,$00,$00,$03,$C0,$00,$02,$40
	DEFB $00,$12,$4C,$00,$1E,$78,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
L8264	DEFB $00,$1C,$07,$FE,$0B,$FF,$09,$FF	; roundf1
	DEFB $0B,$FF,$0C,$FE,$00,$3C,$00,$1C
	ENT
; --- ломоть 2: 0xC7C0, занято 64 из 64 Б
	DISP 0C7C0h
L7B56	DEFB $80,$41,$02,$38,$38,$12,$5D,$80,$00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$18,$08,$08,$78,$40
	DEFB $40,$78,$08,$08,$18,$10,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
L8274	DEFB $03,$E0,$05,$F0,$08,$F8,$08,$F8	; roundf2
	DEFB $08,$F8,$08,$F0,$05,$F0,$03,$E0
	ENT
; --- ломоть 3: 0xC8C0, занято 64 из 64 Б
	DISP 0C8C0h
L7B9E	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
	DEFB $80,$5D,$12,$38,$38,$02,$41,$80,$00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$10,$18,$08,$08,$78,$40,$40,$78,$08,$08,$18,$00,$00,$00

; Long fish sprites
L8285	DEFB $18,$00,$3C,$3C,$7F,$FA,$FF,$F2	; roundf3
	DEFB $FF,$FA,$7F,$0C,$7C,$00,$38,$00
	ENT
; --- ломоть 4: 0xC9C0, занято 64 из 64 Б
	DISP 0C9C0h
L7BCE	DEFB $00,$0C,$00,$00,$00,$0E,$02,$04,$07,$FF,$FE,$0C,$3D,$FF,$FF,$DC	; longfish0
	DEFB $07,$FF,$FF,$FE,$38,$08,$06,$1C,$00,$04,$00,$0C,$00,$00,$00,$00
L7BEE	DEFB $00,$0C,$00,$00,$00,$0E,$02,$00,$07,$FF,$FE,$10,$3D,$FF,$FF,$10	; longfish1
	DEFB $3F,$FF,$FF,$B0,$00,$08,$06,$F0,$00,$08,$00,$30,$00,$00,$00,$10
	ENT
; --- ломоть 5: 0xCAC0, занято 64 из 64 Б
	DISP 0CAC0h
L7C0E	DEFB $00,$00,$00,$00,$00,$0C,$00,$04,$00,$0E,$02,$0C,$07,$FF,$FE,$1C	; longfish2
	DEFB $3D,$FF,$FF,$F8,$3F,$FF,$FF,$DC,$00,$08,$06,$0C,$00,$04,$00,$00
L7C2E	DEFB $00,$00,$00,$10,$00,$0C,$00,$10,$00,$0E,$02,$30,$07,$FF,$FF,$F0	; longfish3
	DEFB $3D,$FF,$FF,$30,$07,$FF,$FE,$10,$38,$0C,$06,$00,$00,$00,$00,$00
	ENT
; --- ломоть 6: 0xCBC0, занято 64 из 64 Б
	DISP 0CBC0h
L7C4F	DEFB $00,$00,$30,$00,$20,$40,$70,$00,$30,$7F,$FF,$E0,$3B,$FF,$FF,$BC	; longfish4
	DEFB $1F,$FF,$FF,$E0,$38,$60,$10,$1C,$30,$00,$20,$00,$00,$00,$00,$00
L7C6F	DEFB $00,$00,$30,$00,$00,$40,$70,$00,$08,$7F,$FF,$E0,$08,$FF,$FF,$BC	; longfish5
	DEFB $0D,$FF,$FF,$FC,$0F,$60,$10,$00,$0C,$00,$10,$00,$08,$00,$00,$00
	ENT
; --- ломоть 7: 0xCCC0, занято 64 из 64 Б
	DISP 0CCC0h
L7C8F	DEFB $00,$00,$00,$00,$20,$00,$30,$00,$30,$40,$70,$00,$38,$7F,$FF,$E0	; longfish6
	DEFB $1F,$FF,$FF,$BC,$3B,$FF,$FF,$FC,$30,$60,$00,$00,$00,$00,$00,$00
L7CAF	DEFB $08,$00,$00,$00,$08,$00,$30,$00,$0C,$40,$70,$00,$0F,$FF,$FF,$E0	; longfish7
	DEFB $0C,$FF,$FF,$BC,$08,$7F,$FF,$E0,$00,$60,$30,$1C,$00,$00,$00,$00
	ENT
; --- ломоть 8: 0xCDC0, занято 64 из 64 Б
	DISP 0CDC0h
L7CD0	DEFB $01,$00,$00,$00,$01,$84,$04,$00,$1F,$FC,$0C,$00,$6F,$FF,$9C,$00	; longfish8
	DEFB $1F,$FF,$F8,$00,$61,$00,$FC,$00,$01,$00,$0C,$00,$00,$00,$00,$00
L7CF0	DEFB $20,$00,$00,$00,$20,$20,$00,$00,$20,$60,$00,$00,$76,$E0,$00,$00	; longfish9
	DEFB $8B,$C0,$00,$00,$70,$E0,$00,$00,$88,$60,$00,$00,$84,$00,$00,$00
	ENT
; --- ломоть 9: 0xCEC0, занято 64 из 64 Б
	DISP 0CEC0h
L7D10	DEFB $10,$20,$00,$00,$60,$60,$00,$00,$7F,$FC,$00,$00,$FF,$FB,$00,$00	; longfishA
	DEFB $7F,$FC,$00,$00,$60,$23,$00,$00,$10,$40,$00,$00,$00,$00,$00,$00
L7D30	DEFB $80,$00,$00,$00,$80,$0C,$00,$00,$C4,$1C,$00,$00,$FF,$FF,$F8,$00	; longfishB
	DEFB $EF,$FF,$EF,$00,$87,$FF,$F8,$00,$04,$04,$07,$00,$00,$08,$00,$00
	ENT
; --- ломоть 10: 0xCFC0, занято 64 из 64 Б
	DISP 0CFC0h
L7D50	DEFB $00,$00,$00,$80,$00,$20,$21,$80,$00,$30,$3F,$F8,$00,$39,$FF,$F6	; longfishC
	DEFB $00,$1F,$FF,$F8,$00,$38,$00,$86,$00,$30,$00,$80,$00,$00,$00,$00
L7D70	DEFB $00,$00,$00,$04,$00,$00,$04,$04,$00,$00,$06,$04,$00,$00,$07,$6E	; longfishD
	DEFB $00,$00,$03,$D1,$00,$00,$07,$0E,$00,$00,$06,$11,$00,$00,$00,$21
	ENT
; --- ломоть 11: 0xD0C0, занято 64 из 64 Б
	DISP 0D0C0h
L7D90	DEFB $00,$00,$04,$08,$00,$00,$06,$06,$00,$00,$3F,$FE,$00,$00,$DF,$FF	; longfishE
	DEFB $00,$00,$3F,$FE,$00,$00,$C4,$06,$00,$00,$02,$08,$00,$00,$00,$00
L7DB0	DEFB $00,$00,$00,$01,$00,$00,$30,$01,$00,$00,$38,$23,$00,$1F,$FF,$FF	; longfishF
	DEFB $00,$F7,$FF,$F7,$00,$1F,$FF,$E1,$00,$E0,$20,$20,$00,$00,$10,$00

; Snake fish horizontal sprites
	ENT
; --- ломоть 12: 0xD1C0, занято 64 из 64 Б
	DISP 0D1C0h
L7DD0	DEFB $70,$0F,$00,$00,$50,$1F,$00,$38,$98,$19,$81,$EF,$08,$31,$C7,$F0	; snakef0
	DEFB $0C,$30,$CE,$75,$04,$60,$EC,$1F,$07,$C0,$7C,$00,$03,$80,$38,$00
L7DF0	DEFB $00,$70,$0F,$00,$00,$F8,$1F,$B8,$81,$8C,$3B,$EF,$83,$0E,$30,$F0	; snakef1
	DEFB $43,$06,$70,$75,$46,$07,$60,$1F,$6C,$03,$E0,$00,$38,$01,$C0,$00
	ENT
; --- ломоть 13: 0xD2C0, занято 64 из 64 Б
	DISP 0D2C0h
L7E10	DEFB $03,$80,$78,$00,$07,$C0,$FC,$00,$06,$61,$DC,$78,$0C,$61,$8C,$EF	; snakef2
	DEFB $18,$33,$8F,$F0,$B0,$3B,$07,$9F,$B0,$1F,$00,$00,$60,$0E,$00,$00
L7E30	DEFB $0E,$03,$C0,$00,$1F,$07,$E0,$38,$1B,$0E,$E1,$EF,$33,$0C,$63,$F0	; snakef3
	DEFB $61,$98,$67,$1F,$41,$D8,$76,$00,$80,$F8,$3E,$00,$00,$70,$1C,$00
	ENT
; --- ломоть 14: 0xD3C0, занято 64 из 64 Б
	DISP 0D3C0h
L7E51	DEFB $00,$00,$C3,$00,$00,$01,$E7,$B8,$00,$43,$67,$EF,$00,$43,$66,$F0	; snakef4
	DEFB $00,$26,$76,$75,$00,$26,$76,$1F,$00,$36,$3C,$00,$00,$1C,$1C,$00
L7E71	DEFB $00,$00,$E1,$C0,$00,$01,$B3,$9E,$00,$01,$B7,$B7,$00,$09,$B6,$3F	; snakef5
	DEFB $00,$05,$B6,$20,$00,$05,$B6,$15,$00,$07,$36,$0E,$00,$00,$1C,$00
	ENT
; --- ломоть 15: 0xD4C0, занято 64 из 64 Б
	DISP 0D4C0h
L7E91	DEFB $00,$00,$00,$03,$00,$00,$00,$F9,$00,$00,$01,$7A,$00,$00,$03,$FE	; snakef6
	DEFB $00,$00,$24,$00,$00,$00,$25,$54,$00,$00,$14,$F8,$00,$00,$1C,$00
L7EB1	DEFB $00,$00,$01,$86,$00,$03,$C3,$C9,$00,$07,$67,$C9,$00,$07,$E6,$C2	; snakef7
	DEFB $00,$00,$26,$C2,$00,$05,$5E,$6C,$00,$03,$9E,$6C,$00,$00,$0C,$78
	ENT
; --- ломоть 16: 0xD5C0, занято 64 из 64 Б
	DISP 0D5C0h
L7ED1	DEFB $00,$00,$70,$38,$00,$E0,$F8,$6C,$07,$B0,$D8,$C6,$00,$78,$D8,$C2	; snakef8
	DEFB $05,$7D,$CD,$81,$07,$CD,$8D,$81,$00,$0F,$87,$80,$00,$07,$03,$00
L7EF1	DEFB $00,$00,$F0,$0E,$1C,$00,$F8,$0A,$F7,$81,$98,$19,$0F,$E3,$8C,$10	; snakef9
	DEFB $AE,$73,$0C,$30,$F8,$37,$06,$20,$00,$3E,$03,$E0,$00,$1C,$01,$C0
	ENT
; --- ломоть 17: 0xD6C0, занято 64 из 64 Б
	DISP 0D6C0h
L7F11	DEFB $00,$F0,$0E,$00,$1D,$F8,$1F,$00,$F7,$DC,$31,$81,$0F,$0C,$70,$C1	; snakefA
	DEFB $AE,$0E,$60,$C2,$F8,$06,$E0,$62,$00,$07,$C0,$36,$00,$03,$80,$1C
L7F31	DEFB $00,$1E,$03,$80,$00,$3F,$03,$E0,$1E,$3B,$86,$60,$F7,$31,$86,$30	; snakefB
	DEFB $0F,$F1,$CC,$18,$F9,$E0,$DC,$0D,$00,$00,$F8,$0D,$00,$00,$70,$06
	ENT
; --- ломоть 18: 0xD7C0, занято 64 из 64 Б
	DISP 0D7C0h
L7F51	DEFB $00,$03,$C0,$70,$1C,$07,$E0,$F8,$F7,$87,$70,$D8,$0F,$C6,$30,$CC	; snakefC
	DEFB $F8,$E6,$19,$16,$00,$6E,$1B,$82,$00,$7C,$1F,$01,$00,$38,$0E,$00
L7F72	DEFB $00,$C3,$00,$00,$1D,$E7,$80,$00,$F7,$E6,$C2,$00,$0F,$66,$C2,$00	; snakefD
	DEFB $AE,$6E,$64,$00,$F8,$6E,$64,$00,$00,$3C,$6C,$00,$00,$38,$38,$00
	ENT
; --- ломоть 19: 0xD8C0, занято 64 из 64 Б
	DISP 0D8C0h
L7F92	DEFB $03,$87,$00,$00,$79,$CD,$80,$00,$ED,$ED,$80,$00,$FC,$6D,$90,$00	; snakefE
	DEFB $04,$6D,$A0,$00,$A8,$6D,$90,$00,$70,$6C,$E0,$00,$00,$38,$00,$00
L7FB2	DEFB $C0,$00,$00,$00,$9F,$00,$00,$00,$2E,$80,$00,$00,$7F,$C0,$00,$00	; snakefF
	DEFB $00,$24,$00,$00,$2A,$A4,$00,$00,$1F,$28,$00,$00,$00,$38,$00,$00
	ENT
; --- ломоть 20: 0xD9C0, занято 64 из 64 Б
	DISP 0D9C0h
L7FD2	DEFB $61,$80,$00,$00,$93,$C3,$C0,$00,$93,$E6,$E0,$00,$43,$67,$E0,$00	; snakefG
	DEFB $43,$64,$00,$00,$36,$7A,$A0,$00,$36,$79,$C0,$00,$1E,$30,$00,$00
L7FF2	DEFB $1C,$0E,$00,$00,$36,$1F,$07,$00,$63,$1B,$0D,$E0,$43,$1B,$1E,$00	; snakefH
	DEFB $81,$B3,$BE,$A0,$81,$B1,$B3,$E0,$01,$E1,$F0,$00,$00,$C0,$E0,$00

; Snake fish vertical sprites
	ENT
; --- ломоть 21: 0xDAC0, занято 64 из 64 Б
	DISP 0DAC0h
L8012	DEFB $2C,$24,$2C,$64,$5C,$78,$38,$30	; snakefv0
	DEFB $30,$18,$1E,$0F,$03,$07,$1E,$3C
	DEFB $F0,$C0,$C0,$E0,$78,$1C,$06,$03
	DEFB $03,$03,$0E,$38,$E0,$80,$C0,$40
L8032	DEFB $2C,$24,$2C,$64,$5C,$78,$38,$70	; snakefv1
	DEFB $E0,$E0,$C0,$E0,$78,$3E,$0F,$03
	DEFB $07,$1E,$3C,$70,$C0,$C0,$C0,$60
	DEFB $38,$1C,$06,$03,$01,$03,$0E,$30
	ENT
; --- ломоть 22: 0xDBC0, занято 64 из 64 Б
	DISP 0DBC0h
L8052	DEFB $14,$14,$14,$34,$2C,$38,$38,$1C	; snakefv2
	DEFB $0C,$0C,$7C,$F8,$E0,$C0,$E0,$78
	DEFB $3E,$0F,$03,$07,$0E,$3C,$70,$C0
	DEFB $C0,$E0,$70,$18,$0E,$07,$01,$06
L8072	DEFB $28,$28,$28,$68,$58,$70,$30,$30	; snakefv3
	DEFB $38,$1E,$0F,$03,$07,$7E,$FC,$E0
	DEFB $C0,$E0,$70,$3E,$0F,$03,$07,$0E
	DEFB $7C,$F0,$C0,$E0,$70,$18,$0C,$02
	ENT
; --- ломоть 23: 0xDCC0, занято 64 из 64 Б
	DISP 0DCC0h
L8093	DEFB $2C,$24,$2C,$64,$5C,$78,$38,$70	; snakefv5
	DEFB $E0,$FC,$7F,$03,$0F,$7E,$FC,$C0
	DEFB $70,$3E,$0F,$01,$03,$0E,$C0,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00
L80B3	DEFB $34,$72,$76,$52,$74,$38,$80,$E0	; snakefv6
	DEFB $E0,$7E,$3F,$01,$7F,$FE,$80,$FC
	DEFB $7E,$02,$0E,$10,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00
	ENT
; --- ломоть 24: 0xDDC0, занято 64 из 64 Б
	DISP 0DDC0h
L80D3	DEFB $C0,$90,$34,$52,$76,$72,$76,$52	; snakefv7
	DEFB $34,$10,$0F,$01,$03,$0C,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00
L80F3	DEFB $60,$98,$86,$67,$01,$07,$7F,$F8	; snakefv8
	DEFB $E0,$7E,$3F,$07,$06,$38,$74,$52
	DEFB $76,$72,$34,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00
	ENT
; --- ломоть 25: 0xDEC0, занято 64 из 64 Б
	DISP 0DEC0h
L8113	DEFB $0C,$30,$60,$C0,$80,$C0,$70,$3E	; snakefv9
	DEFB $0F,$03,$0E,$7C,$F0,$C0,$F8,$7E
	DEFB $0F,$03,$0F,$1E,$38,$78,$5C,$64
	DEFB $2C,$24,$2C,$00,$00,$00,$00,$00
L8133	DEFB $20,$C0,$80,$E0,$38,$0E,$03,$03	; snakefvA
	DEFB $03,$06,$1C,$78,$E0,$C0,$C0,$F0
	DEFB $3C,$1E,$07,$03,$0F,$1E,$18,$30
	DEFB $30,$38,$78,$5C,$64,$2C,$24,$2C
	ENT
; --- ломоть 26: 0xDFC0, занято 64 из 64 Б
	DISP 0DFC0h
L8153	DEFB $30,$0E,$03,$01,$03,$06,$1C,$38	; snakefvB
	DEFB $60,$C0,$C0,$C0,$70,$3C,$1E,$07
	DEFB $03,$0F,$3E,$78,$E0,$C0,$E0,$E0
	DEFB $70,$38,$78,$5C,$64,$2C,$24,$2C
L8173	DEFB $06,$01,$07,$0E,$18,$70,$60,$C0	; snakefvC
	DEFB $C0,$F0,$3C,$0E,$07,$03,$0F,$3E
	DEFB $78,$E0,$C0,$E0,$F8,$7C,$0C,$0C
	DEFB $1C,$38,$38,$2C,$34,$14,$14,$14
	ENT
; --- ломоть 27: 0xE0C0, занято 64 из 64 Б
	DISP 0E0C0h
L8193	DEFB $02,$0C,$18,$70,$E0,$C0,$F0,$7C	; snakefvD
	DEFB $0E,$07,$03,$0F,$3E,$70,$E0,$C0
	DEFB $E0,$FC,$7E,$07,$03,$0F,$1E,$38
	DEFB $30,$30,$70,$58,$68,$28,$28,$28
L81B4	DEFB $00,$00,$00,$00,$00,$00,$00,$00	; snakefvE
	DEFB $00,$30,$0E,$03,$01,$0F,$3E,$70
	DEFB $C0,$FC,$7E,$0F,$03,$7F,$FC,$E0
	DEFB $70,$38,$78,$5C,$64,$2C,$24,$2C
	ENT
; --- ломоть 28: 0xE1C0, занято 64 из 64 Б
	DISP 0E1C0h
L81D4	DEFB $00,$00,$00,$00,$00,$00,$00,$00	; snakefvF
	DEFB $00,$00,$00,$00,$10,$0E,$02,$7E
	DEFB $FC,$80,$FE,$7F,$01,$3F,$7E,$E0
	DEFB $E0,$80,$38,$74,$52,$76,$72,$34
L81F4	DEFB $00,$00,$00,$00,$00,$00,$00,$00	; snakefvG
	DEFB $00,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$0C,$03,$01,$0F,$10,$34
	DEFB $52,$76,$72,$76,$52,$34,$90,$C0
	ENT
; --- ломоть 29: 0xE2C0, занято 64 из 64 Б
	DISP 0E2C0h
L8214	DEFB $00,$00,$00,$00,$00,$00,$00,$00	; snakefvH
	DEFB $00,$00,$00,$00,$00,$34,$72,$76
	DEFB $52,$74,$3A,$06,$07,$3F,$7E,$E0
	DEFB $F8,$7F,$07,$01,$67,$86,$98,$60
L8234	DEFB $00,$00,$00,$00,$00,$2C,$24,$2C	; snakefvI
	DEFB $64,$5C,$78,$38,$1E,$0F,$03,$0F
	DEFB $7E,$F8,$C0,$F0,$7C,$0E,$03,$0F
	DEFB $3E,$70,$C0,$80,$C0,$60,$30,$0C

; Round fish sprites
	ENT
; --- ломоть 30: 0xE3C0, занято 64 из 64 Б
	DISP 0E3C0h
SprDiverClimb
	DEFB $30,$00,$78,$00,$78,$00,$30,$00,$3C,$00,$FC,$00,$3C,$00,$3C,$00	; divervar0
	DEFB $3C,$00,$78,$00,$60,$00,$E0,$00,$E0,$00,$00,$00,$00,$00,$00,$00
SprDiverSit
	DEFB $00,$00,$00,$00,$01,$80,$03,$C0,$03,$C0,$01,$80,$03,$C0,$03,$C0	; divervar1
	DEFB $03,$C0,$03,$C0,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
	ENT
; --- ломоть 31: 0xE4C0, занято 64 из 64 Б
	DISP 0E4C0h
L9BCC	DEFB $00,$00,$00,$00,$00,$00,$04,$20,$25,$A0,$13,$C4,$03,$C0,$25,$A0	; divervar2
	DEFB $17,$E4,$07,$E8,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
L9BEC	DEFB $80,$00,$40,$01,$00,$00,$80,$00,$40,$01,$00,$02,$04,$20,$04,$20	; divervar3
	DEFB $04,$60,$07,$E0,$07,$C0,$07,$C0,$01,$80,$00,$00,$00,$00,$00,$00
	ENT
; --- ломоть 32: 0xE5C0, занято 64 из 64 Б
	DISP 0E5C0h
L9C0C	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$04,$00,$24,$00	; divervar4
	DEFB $28,$00,$1F,$00,$0F,$60,$07,$F0,$07,$F0,$00,$60,$00,$00,$00,$00
L9C2C	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$08,$00	; divervar5
	DEFB $08,$00,$2B,$80,$2B,$80,$3F,$B0,$07,$F8,$01,$78,$01,$30,$01,$00
	ENT
; --- ломоть 33: 0xE6C0, занято 64 из 64 Б
	DISP 0E6C0h
L6000	DEFB $0F,$00,$00,$50,$91,$C0,$2C,$6F,$E0,$73,$FF,$F8	; smsquidh0
	DEFB $99,$6F,$F0,$26,$93,$80,$1C,$80,$00,$03,$00,$00
L6018	DEFB $00,$00,$00,$00,$00,$00,$00,$C2,$70,$3F,$3D,$FC	; smsquidh1
	DEFB $5B,$FF,$FF,$FD,$7D,$FE,$03,$C2,$38,$00,$00,$00
L8295	DEFB $38,$00,$7F,$E0,$FF,$D0,$FF,$90	; roundf4
	DEFB $FF,$D0,$7F,$30,$3C,$00,$38,$00
	ENT
; --- ломоть 34: 0xE7C0, занято 64 из 64 Б
	DISP 0E7C0h
L6030	DEFB $00,$00,$00,$00,$00,$00,$00,$02,$70,$70,$ED,$FE	; smsquidh2
	DEFB $0F,$1F,$FF,$3F,$F5,$FC,$00,$02,$38,$00,$00,$00
L6048	DEFB $9E,$00,$00,$69,$C4,$38,$67,$FB,$FC,$13,$FF,$FE	; smsquidh3
	DEFB $0C,$FB,$F8,$31,$84,$E0,$4E,$00,$00,$00,$00,$00
L82A5	DEFB $07,$C0,$0F,$A0,$1F,$10,$1F,$10	; roundf5
	DEFB $1F,$10,$0F,$10,$0F,$A0,$07,$C0
	ENT
; --- ломоть 35: 0xE8C0, занято 64 из 64 Б
	DISP 0E8C0h
L6061	DEFB $00,$58,$00,$00,$A5,$30,$00,$12,$F8,$01,$6F,$FC	; smsquidh4
	DEFB $00,$8A,$F8,$00,$55,$60,$00,$B4,$00,$00,$08,$00
L6079	DEFB $00,$06,$00,$00,$09,$00,$00,$00,$A8,$00,$03,$5C	; smsquidh5
	DEFB $00,$04,$FE,$00,$03,$5C,$00,$04,$A8,$00,$03,$00
L82B6	DEFB $00,$60,$00,$B8,$01,$1C,$02,$0C	; roundf6
	DEFB $02,$0C,$01,$18,$00,$B8,$00,$60
	ENT
; --- ломоть 36: 0xE9C0, занято 64 из 64 Б
	DISP 0E9C0h
L6091	DEFB $00,$00,$C3,$00,$00,$2A,$00,$00,$2C,$00,$00,$1E	; smsquidh6
	DEFB $00,$00,$3D,$00,$00,$1A,$00,$00,$2A,$00,$01,$C2
L60A9	DEFB $00,$00,$06,$00,$00,$09,$00,$01,$50,$00,$03,$AC	; smsquidh7
	DEFB $00,$07,$F2,$00,$03,$AC,$00,$01,$52,$00,$00,$0C
L82C6	DEFB $00,$F0,$01,$F8,$03,$9C,$03,$0C	; roundf7
	DEFB $03,$0C,$03,$9C,$01,$F8,$00,$F0
	ENT
; --- ломоть 37: 0xEAC0, занято 64 из 64 Б
	DISP 0EAC0h
L60C1	DEFB $00,$00,$D0,$00,$65,$28,$00,$FA,$40,$01,$FF,$B4	; smsquidh8
	DEFB $00,$FA,$88,$00,$35,$50,$00,$01,$68,$00,$00,$80
L60D9	DEFB $00,$00,$F0,$03,$89,$0A,$07,$F6,$34,$1F,$FF,$CE	; smsquidh9
	DEFB $0F,$F6,$98,$01,$C9,$64,$00,$01,$38,$00,$00,$C0
L82D6	DEFB $03,$00,$0E,$80,$1C,$40,$18,$20	; roundf8
	DEFB $18,$20,$0C,$40,$0E,$80,$03,$00
	ENT
; --- ломоть 38: 0xEBC0, занято 64 из 64 Б
	DISP 0EBC0h
L60F1	DEFB $00,$00,$00,$00,$00,$00,$0E,$43,$00,$3F,$BC,$FC	; smsquidhA
	DEFB $FF,$FF,$DA,$7F,$BE,$BF,$1C,$43,$C0,$00,$00,$00
L6109	DEFB $00,$00,$00,$00,$00,$00,$0E,$40,$00,$7F,$B7,$0E	; smsquidhB
	DEFB $FF,$F8,$F0,$3F,$AF,$FC,$1C,$40,$00,$00,$00,$00
L82E6	DEFB $06,$00,$1D,$00,$30,$80,$30,$40	; roundf9
	DEFB $30,$40,$18,$80,$1D,$00,$06,$00
	ENT
; --- ломоть 39: 0xECC0, занято 64 из 64 Б
	DISP 0ECC0h
L6121	DEFB $00,$00,$79,$1C,$23,$96,$3F,$DF,$E6,$7F,$FF,$C8	; smsquidhC
	DEFB $1F,$DF,$30,$07,$21,$8C,$00,$00,$72,$00,$00,$00
L613A	DEFB $00,$1A,$00,$0C,$A5,$00,$1F,$48,$00,$3F,$F6,$80	; smsquidhD
	DEFB $1F,$51,$00,$06,$AA,$00,$00,$2D,$00,$00,$10,$00
L82F6	DEFB $0F,$00,$1F,$80,$39,$C0,$30,$C0	; roundfA
	DEFB $30,$C0,$39,$C0,$1F,$80,$0F,$00
	ENT
; --- ломоть 40: 0xEDC0, занято 64 из 64 Б
	DISP 0EDC0h
L6152	DEFB $00,$60,$00,$00,$90,$00,$15,$00,$00,$3A,$C0,$00	; smsquidhE
	DEFB $7F,$20,$00,$3A,$C0,$00,$15,$20,$00,$00,$C0,$00
L616A	DEFB $43,$80,$00,$54,$00,$00,$58,$00,$00,$BC,$00,$00	; smsquidhF
	DEFB $78,$00,$00,$34,$00,$00,$D4,$00,$00,$83,$00,$00
L8306	DEFB $01,$80,$02,$E0,$04,$70,$08,$30	; roundfB
	DEFB $08,$30,$04,$60,$02,$E0,$01,$80

; Round fish vertical sprites
	ENT
; --- ломоть 41: 0xEEC0, занято 64 из 64 Б
	DISP 0EEC0h
L6182	DEFB $60,$00,$00,$90,$00,$00,$0A,$80,$00,$35,$C0,$00	; smsquidhG
	DEFB $4F,$E0,$00,$35,$C0,$00,$4A,$80,$00,$30,$00,$00
L619A	DEFB $0B,$00,$00,$14,$A6,$00,$02,$5F,$00,$2D,$FF,$80	; smsquidhH
	DEFB $11,$5F,$00,$0A,$AC,$00,$16,$80,$00,$01,$00,$00

; Small squid vertical sprites; width 1 height 3 chars, 24 bytes each
L8316	DEFB $18,$3E,$7F,$FF,$FF,$7E,$3C,$3C	; roundv0
	DEFB $38,$38,$78,$78,$6C,$44,$38,$00
	ENT
; --- ломоть 42: 0xEFC0, занято 64 из 64 Б
	DISP 0EFC0h
L61B2	DEFB $00,$00,$00,$10,$18,$38,$78,$7C	; smsquidv0
	DEFB $7C,$3C,$38,$38,$54,$38,$38,$56
	DEFB $99,$95,$A6,$AA,$5A,$34,$50,$08
L61CA	DEFB $08,$0C,$1C,$1E,$3E,$3E,$3C,$1C	; smsquidv1
	DEFB $1C,$2A,$1C,$1C,$1C,$1C,$2E,$2A
	DEFB $1E,$1A,$14,$1C,$1C,$14,$0C,$04
L8326	DEFB $38,$7C,$FF,$FF,$FF,$7E,$7C,$7C	; roundv1
	DEFB $78,$68,$44,$3C,$00,$00,$00,$00
	ENT
; --- ломоть 43: 0xF0C0, занято 64 из 64 Б
	DISP 0F0C0h
L61E2	DEFB $08,$18,$1C,$1E,$3E,$3E,$3C,$1C	; smsquidv2
	DEFB $1C,$2A,$1C,$18,$0C,$14,$14,$14
	DEFB $0C,$0C,$0C,$0C,$14,$14,$10,$00
L61FA	DEFB $00,$10,$30,$78,$78,$7C,$7C,$3C	; smsquidv3
	DEFB $38,$38,$54,$38,$38,$38,$78,$7C
	DEFB $74,$B2,$AA,$CA,$94,$64,$62,$80
L8336	DEFB $00,$00,$00,$38,$7E,$FF,$FF,$FF	; roundv2
	DEFB $C3,$81,$42,$3C,$00,$00,$00,$00
	ENT
; --- ломоть 44: 0xF1C0, занято 64 из 64 Б
	DISP 0F1C0h
L6213	DEFB $00,$00,$10,$38,$78,$7C,$3C,$38	; smsquidv4
	DEFB $54,$38,$56,$99,$A6,$52,$94,$4A
	DEFB $10,$00,$00,$00,$00,$00,$00,$00
L622B	DEFB $00,$08,$1C,$3E,$1C,$2A,$1C,$2A	; smsquidv5
	DEFB $55,$95,$8A,$40,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00
L8347	DEFB $00,$38,$44,$6C,$78,$78,$38,$38	; roundv3
	DEFB $3C,$3C,$7E,$FF,$FF,$7F,$3E,$18
	ENT
; --- ломоть 45: 0xF2C0, занято 64 из 64 Б
	DISP 0F2C0h
L6243	DEFB $88,$D7,$38,$7E,$1C,$6A,$81,$81	; smsquidv6
	DEFB $01,$00,$00,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00
L625B	DEFB $40,$8A,$95,$55,$2A,$1C,$2A,$1C	; smsquidv7
	DEFB $3E,$1C,$08,$00,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00
L8357	DEFB $00,$00,$00,$00,$3C,$44,$68,$78	; roundv4
	DEFB $7C,$7C,$7E,$FF,$FF,$FF,$7C,$38
	ENT
; --- ломоть 46: 0xF3C0, занято 64 из 64 Б
	DISP 0F3C0h
L6273	DEFB $00,$00,$10,$4A,$94,$52,$A6,$99	; smsquidv8
	DEFB $56,$38,$54,$38,$3C,$7C,$78,$38
	DEFB $10,$00,$00,$00,$00,$00,$00,$00
L628B	DEFB $00,$50,$34,$5A,$AA,$A6,$95,$99	; smsquidv9
	DEFB $56,$38,$38,$54,$38,$38,$3C,$7C
	DEFB $7C,$78,$38,$18,$10,$00,$00,$00
L8367	DEFB $00,$00,$00,$00,$3C,$42,$81,$C3	; roundv5
	DEFB $FF,$FF,$FF,$7E,$38,$00,$00,$00
	ENT
; --- ломоть 47: 0xF4C0, занято 64 из 64 Б
	DISP 0F4C0h
L62A3	DEFB $04,$0C,$14,$1C,$1C,$14,$1A,$1E	; smsquidvA
	DEFB $2A,$2E,$1C,$1C,$1C,$1C,$2A,$1C
	DEFB $1C,$3C,$3E,$3E,$1E,$1C,$0C,$08
L62BB	DEFB $00,$10,$14,$14,$0C,$0C,$0C,$0C	; smsquidvB
	DEFB $14,$14,$14,$0C,$18,$1C,$2A,$1C
	DEFB $1C,$3C,$3E,$3E,$1E,$1C,$18,$08
L8378	DEFB $00,$00,$38,$7E,$66,$C3,$81,$42	; roundv6
	DEFB $24,$18,$00,$00,$00,$00,$00,$00
	ENT
; --- ломоть 48: 0xF5C0, занято 64 из 64 Б
	DISP 0F5C0h
L62D3	DEFB $80,$62,$64,$94,$CA,$AA,$B2,$74	; smsquidvC
	DEFB $7C,$78,$38,$38,$38,$54,$38,$38
	DEFB $3C,$3C,$7C,$78,$78,$30,$10,$00
L62EC	DEFB $00,$00,$00,$00,$00,$00,$00,$10	; smsquidvD
	DEFB $4A,$94,$52,$A6,$99,$56,$38,$54
	DEFB $38,$3C,$7C,$78,$38,$10,$00,$00
L8388	DEFB $00,$00,$3C,$7E,$E7,$C3,$C3,$E7	; roundv7
	DEFB $7E,$3C,$00,$00,$00,$00,$00,$00
	ENT
; --- ломоть 49: 0xF6C0, занято 64 из 64 Б
	DISP 0F6C0h
L6304	DEFB $00,$00,$00,$00,$00,$00,$00,$00	; smsquidvE
	DEFB $00,$00,$00,$00,$40,$8A,$95,$55
	DEFB $2A,$1C,$2A,$1C,$3E,$1C,$08,$00
L631C	DEFB $00,$00,$00,$00,$00,$00,$00,$00	; smsquidvF
	DEFB $00,$00,$00,$00,$00,$00,$00,$80
	DEFB $81,$81,$56,$38,$7E,$1C,$EA,$13
L8398	DEFB $00,$00,$00,$00,$00,$18,$24,$42	; roundv8
	DEFB $81,$C3,$66,$7E,$38,$00,$00,$00
	ENT
; --- ломоть 50: 0xF7C0, занято 64 из 64 Б
	DISP 0F7C0h
L6334	DEFB $00,$00,$00,$00,$00,$00,$00,$00	; smsquidvG
	DEFB $00,$00,$00,$00,$00,$08,$1C,$3E
	DEFB $1C,$2A,$1C,$2A,$55,$95,$8A,$40
L634C	DEFB $00,$00,$00,$00,$00,$00,$00,$10	; smsquidvH
	DEFB $38,$78,$7C,$3C,$38,$54,$38,$56
	DEFB $99,$A6,$52,$94,$4A,$08,$00,$00

; Fish sprites; width 6 height 3 chars, 96 bytes each
L83A8	DEFB $00,$00,$00,$00,$00,$00,$18,$24	; roundv9
	DEFB $42,$81,$C3,$46,$7E,$38,$00,$00
	ENT
; --- ломоть 51: 0xF8C0, занято 64 из 64 Б
	DISP 0F8C0h
L79D3	DEFB $00,$00,$00,$00,$00,$00,$00,$0F,$3C,$00,$09,$26,$00,$01,$20,$00
	DEFB $01,$E0,$00,$00,$00,$00,$00,$00
L7A64	DEFB $00,$00,$00,$00,$00,$00,$3C,$F0,$00,$64,$90,$00,$04,$80,$00,$07
	DEFB $80,$00,$00,$00,$00,$00,$00,$00
L83B8	DEFB $00,$00,$00,$00,$00,$00,$3C,$7E	; roundvA
	DEFB $E7,$C3,$C3,$E7,$7E,$3C,$00,$00
	ENT
; --- ломоть 52: 0xF9C0, занято 64 из 64 Б
	DISP 0F9C0h
L7B3E	DEFB $00,$10,$30,$20,$20,$3C,$04,$04,$3C,$20,$20,$30,$00,$00,$00,$00
	DEFB $00,$00,$00,$00,$00,$00,$00,$00
L7B86	DEFB $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$30,$20,$20,$3C
	DEFB $04,$04,$3C,$20,$20,$30,$10,$00
L83C8	DEFB $00,$00,$00,$00,$38,$7E,$66,$C3	; roundvB
	DEFB $81,$42,$24,$18,$00,$00,$00,$00

; Squid sprites; width 7 height 2 chars; 112 bytes each
	ENT
; --- ломоть 53: 0xFAC0, занято 64 из 64 Б
	DISP 0FAC0h
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
LA011	LD A,$09
	CP H
	JP Z,L9F90
	DEC H
	CALL MiniMap_Check	; Check value in MiniMap table
	jp Z,LA021
	INC H
	JP L9F90
LA0CB	LD A,$09
	CP H
	JP Z,LA04A
	DEC H
	CALL MiniMap_Check	; Check value in MiniMap table
	jp Z,LA0DB
	INC H
	JP LA04A
FillBlock
	LD (HL),A
	INC HL
	dec b
	jp nz,FillBlock
	RET

; Prepare the MiniMap table
	ENT
; --- ломоть 54: 0xFBC0, занято 64 из 64 Б
	DISP 0FBC0h
LB43E:
	ld (il_a),a
	ld a,(DiverObj+$11)
	and 1<<(7)
	ld a,(il_a)
	jp NZ,LB43A
	jp LB438
L8D43	DEFB $0C,$3E,$FF,$55,$55,$55,$95,$A5	; meduza0
	DEFB $A4,$94,$48,$48,$08,$08,$08,$04
L8D53	DEFB $0C,$3E,$FF,$A5,$A5,$95,$95,$A5	; meduza1
	DEFB $A5,$95,$54,$44,$08,$08,$08,$08
LA02C	LD A,$0E
	INC L
	CALL MiniMap_Set	; Calc address in MiniMap and Set block number
	INC H
	INC A
	CALL MiniMap_Set	; Calc address in MiniMap and Set block number
	DEC H
	JP L9F84

	ENT
; --- ломоть 55: 0xFCC0, занято 64 из 64 Б
	DISP 0FCC0h
L8D63	DEFB $0C,$3E,$FF,$55,$55,$95,$A5,$A5	; meduza2
	DEFB $A5,$6A,$8A,$88,$08,$08,$08,$10
GetScrAddr
	PUSH DE
	ld a,h		; row
;	and $1F
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

; То же самое, но для ПОЛЯ: столбцы поля 0..23 ложатся на столбцы экрана 4..27.
; Это и есть центрирование — по 32 px чёрного слева и справа.
; Именно КОПИЯ, а не обёртка `jp GetScrAddr`: обёртка добавила бы CALL/RET в
; горячий спрайтовый блит LB4F0, а бюджет изменения темпа — ноль.
; Столбец на входе гарантированно 0..23 (клип LB4BB: столбец+ширина < 24,
; клип строки LB4D7/LB4BB: строка < 24), значит $C4+23 = $DB — плоскость 0xC000
; не покидаем.
LB151	LD A,(HL)
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
LA0BC	DEC L
	LD A,$0F
	CALL MiniMap_Set	; Calc address in MiniMap and Set block number
	DEC H
	DEC A
	CALL MiniMap_Set	; Calc address in MiniMap and Set block number
	INC H
	JP LA03E
L6060	DEFB $FF
	ENT
; --- ломоть 56: 0xFDC0, занято 64 из 64 Б
	DISP 0FDC0h
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
LBE0F	CP $06			; row 5..6 ?
	jp NC,LBE1D	; no => jump
	CALL LBE6D
	LD A,(L5B1C)		; 2
	CALL LC4D5		; Delay
	RET
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
LA021	DEC L
	CALL MiniMap_Check	; Check value in MiniMap table
	jp Z,LA02C
	INC L
	INC H
	JP L9F90
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
	ENT
; --- ломоть 57: 0xFEC0, занято 64 из 64 Б
	DISP 0FEC0h
LA0B2	INC L
	CALL MiniMap_Check	; Check value in MiniMap table
	jp Z,LA0BC
	DEC L
	DEC H
	jp LA04A
LA0DB	INC L
	CALL MiniMap_Check	; Check value in MiniMap table
	jp Z,LA0E6
	INC H
	DEC L
	JP LA04A
LBDCB	CP $04
	jp NC,LBDD6
	CALL LBE58
	CALL LBE85
	RET
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
L9FE0	LD A,D
	AND $03			; 0..3
	ADD A,$10		; $10..$13
	CALL MiniMap_Set	; Calc address in MiniMap and Set block number
	JP L9F84
LB43A	LD B,$08
	jp LB446
L6139	DEFB $FF
	ENT
; --- ломоть 58: 0xFFC0, занято 64 из 64 Б
	DISP 0FFC0h
LA09A	LD A,D
	AND $03			; 0..3
	ADD A,$10		; $10..$13
	CALL MiniMap_Set	; Calc address in MiniMap and Set block number
	JP LA03E
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
GetTileInBlock
	PUSH HL
	PUSH DE
	CALL LA0F5		; Calculate address in relief block
	LD A,(HL)		; get tile number
	POP DE
	POP HL
	RET

; LA132	DEFB $E5,$D5,$F5,$CD,$F5,$A0,$F1,$5F
; 	DEFB $7E,$E6,$3F,$7B,$D1,$E1,$C9,$E5
; 	DEFB $D5,$F5,$CD,$F5,$A0,$F1,$D1,$BE
; 	DEFB $E1,$C9

; Get screen attribute address
LBDD6	CP $06
	jp NC,LBDDE
	CALL LBE85
	RET
L92C4	DEFB $00,$00,$00,$00,$00,$00,$00,$00

; Scuba diver sprites; width 2 height 2 chars
L9C4C	DEFB $00,$00,$00,$00

L6212	DEFB $FF
L62EB	DEFB $FF
L64E4	DEFB $FF
L6665	DEFB $FF
L6CC6	DEFB $FF
L7357	DEFB $FF
L7C4E	DEFB $FF
L7CCF	DEFB $FF
L7E50	DEFB $FF
L7F71	DEFB $FF
L8092	DEFB $FF
L81B3	DEFB $FF
L8284	DEFB $FF
	ENT
; --- ломоть 59: 0xB2C0, занято 9 из 64 Б
	DISP 0B2C0h
L82B5	DEFB $FF
L8346	DEFB $FF
L8377	DEFB $FF
L8598	DEFB $FF
L89F9	DEFB $FF
L8D42	DEFB $FF

; Meduza sprites; width 1
L8D73	DEFB $FF

; Octopus phases 0..4, each phase 4*6*8 = 192 bytes
LB7B8	RET

LB836	RET

; I: IX = object address in LC4F0 area
; I: IY = record address in LC092 area
	DS 55,0
	ENT
SCUBAZONE_END:
SCUBAZONE_N23	EQU 59	; ломтей в плоскостях 2 и 3 (кладутся напрямую)
