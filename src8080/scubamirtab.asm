; MIR_TAB — таблица переворота битов для отражённой сборки (scubamirror.asm).
; Подключается из scubacod1.asm сразу за SCRATTR, где адрес уже кратен 256.
; ПЕРЕВОРОТ БИТОВ В БАЙТЕ — ТАБЛИЦЕЙ, А НЕ СДВИГАМИ. Восемь сдвигов на байт
; стоят ~90 тактов, и на кадре акулы (168 байт) это лишние 15 000 тактов при
; каждом обновлении. Таблица требует выравнивания на 256: старший байт адреса
; постоянен, младший — сам байт.
	ASSERT LOW $ = 0		; страница: старший байт постоянен, младший — сам байт
MIR_TAB:
	DEFB 000h,080h,040h,0C0h,020h,0A0h,060h,0E0h,010h,090h,050h,0D0h,030h,0B0h,070h,0F0h
	DEFB 008h,088h,048h,0C8h,028h,0A8h,068h,0E8h,018h,098h,058h,0D8h,038h,0B8h,078h,0F8h
	DEFB 004h,084h,044h,0C4h,024h,0A4h,064h,0E4h,014h,094h,054h,0D4h,034h,0B4h,074h,0F4h
	DEFB 00Ch,08Ch,04Ch,0CCh,02Ch,0ACh,06Ch,0ECh,01Ch,09Ch,05Ch,0DCh,03Ch,0BCh,07Ch,0FCh
	DEFB 002h,082h,042h,0C2h,022h,0A2h,062h,0E2h,012h,092h,052h,0D2h,032h,0B2h,072h,0F2h
	DEFB 00Ah,08Ah,04Ah,0CAh,02Ah,0AAh,06Ah,0EAh,01Ah,09Ah,05Ah,0DAh,03Ah,0BAh,07Ah,0FAh
	DEFB 006h,086h,046h,0C6h,026h,0A6h,066h,0E6h,016h,096h,056h,0D6h,036h,0B6h,076h,0F6h
	DEFB 00Eh,08Eh,04Eh,0CEh,02Eh,0AEh,06Eh,0EEh,01Eh,09Eh,05Eh,0DEh,03Eh,0BEh,07Eh,0FEh
	DEFB 001h,081h,041h,0C1h,021h,0A1h,061h,0E1h,011h,091h,051h,0D1h,031h,0B1h,071h,0F1h
	DEFB 009h,089h,049h,0C9h,029h,0A9h,069h,0E9h,019h,099h,059h,0D9h,039h,0B9h,079h,0F9h
	DEFB 005h,085h,045h,0C5h,025h,0A5h,065h,0E5h,015h,095h,055h,0D5h,035h,0B5h,075h,0F5h
	DEFB 00Dh,08Dh,04Dh,0CDh,02Dh,0ADh,06Dh,0EDh,01Dh,09Dh,05Dh,0DDh,03Dh,0BDh,07Dh,0FDh
	DEFB 003h,083h,043h,0C3h,023h,0A3h,063h,0E3h,013h,093h,053h,0D3h,033h,0B3h,073h,0F3h
	DEFB 00Bh,08Bh,04Bh,0CBh,02Bh,0ABh,06Bh,0EBh,01Bh,09Bh,05Bh,0DBh,03Bh,0BBh,07Bh,0FBh
	DEFB 007h,087h,047h,0C7h,027h,0A7h,067h,0E7h,017h,097h,057h,0D7h,037h,0B7h,077h,0F7h
	DEFB 00Fh,08Fh,04Fh,0CFh,02Fh,0AFh,06Fh,0EFh,01Fh,09Fh,05Fh,0DFh,03Fh,0BFh,07Fh,0FFh
