; СГЕНЕРИРОВАНО tools/music/packmarch.py — РУКАМИ НЕ ПРАВИТЬ.
; Марш Men of Harlech (public domain) для стартового меню, три голоса.
; Формат и выбор управляющих байтов — в шапке упаковщика.
	IFDEF MENUMUS

mm_melody_f0:
	defb 050h,00Eh,04Dh,00Eh,030h,031h,032h,030h,033h,032h,031h,030h
	defb 02Eh,02Dh,02Eh,02Ch,050h,00Eh,04Dh,00Eh,030h,031h,032h,035h
	defb 014h,052h,051h,012h,070h,07Fh,0FEh
mm_melody:
	defb 0BFh,0BFh,07Fh
	defb 0FFh
	defw mm_melody_f0
	defb 0FFh
	defw mm_melody_f0
	defb 051h,010h,04Fh,010h,031h,031h,07Fh,054h,013h,052h,013h,034h
	defb 034h,07Fh,054h,013h,052h,013h,054h,013h,052h,013h,014h,015h
	defb 014h,013h,012h,011h,012h,013h,034h,034h,07Fh,035h,035h,034h
	defb 034h,033h,033h,032h,032h,031h,013h,012h,031h,030h,02Fh,02Dh
	defb 02Fh,02Ch,050h,00Eh,04Dh,00Eh,030h,031h,032h,035h,014h,052h
	defb 051h,012h,0B0h,03Fh
	defb 0FFh
	defw mm_melody_f0
	defb 0FFh
	defw 0
mm_bass_f0:
	defb 021h,023h,025h,027h,022h,025h,022h,028h,022h,025h,022h,028h
	defb 021h,023h,025h,027h,022h,025h,022h,028h,022h,025h,022h,028h
	defb 022h,025h,022h,028h,020h,022h,024h,026h,021h,023h,025h,027h
	defb 022h,025h,022h,028h,022h,025h,022h,028h,021h,023h,025h,027h
	defb 022h,025h,022h,028h,0FEh
mm_bass_f1:
	defb 022h,025h,022h,028h,022h,025h,022h,028h,0FEh
mm_bass_f2:
	defb 021h,023h,025h,027h,021h,023h,025h,027h,0FEh
mm_bass:
	defb 0BFh,0BFh,07Fh
	defb 0FFh
	defw mm_bass_f1
	defb 020h,022h,024h,026h
	defb 0FFh
	defw mm_bass_f0
	defb 0FFh
	defw mm_bass_f2
	defb 0FFh
	defw mm_bass_f1
	defb 0FFh
	defw mm_bass_f1
	defb 0FFh
	defw mm_bass_f2
	defb 020h,022h,024h,026h,022h,025h,022h,028h,021h,023h,025h,027h
	defb 0FFh
	defw mm_bass_f0
	defb 0FFh
	defw 0
mm_harm_f0:
	defb 025h,027h,029h,02Ch,028h,02Ah,02Ch,030h,028h,02Ah,02Ch,030h
	defb 025h,027h,029h,02Ch,028h,02Ah,02Ch,030h,028h,02Ah,02Ch,030h
	defb 028h,02Ah,02Ch,030h,02Bh,02Dh,030h,033h,025h,027h,029h,02Ch
	defb 028h,02Ah,02Ch,030h,028h,02Ah,02Ch,030h,025h,027h,029h,02Ch
	defb 028h,02Ah,02Ch,030h,0FEh
mm_harm_f1:
	defb 028h,02Ah,02Ch,030h,028h,02Ah,02Ch,030h,0FEh
mm_harm_f2:
	defb 025h,027h,029h,02Ch,025h,027h,029h,02Ch,0FEh
mm_harm:
	defb 0BFh,0BFh,07Fh
	defb 0FFh
	defw mm_harm_f1
	defb 02Bh,02Dh,030h,033h
	defb 0FFh
	defw mm_harm_f0
	defb 0FFh
	defw mm_harm_f2
	defb 0FFh
	defw mm_harm_f1
	defb 0FFh
	defw mm_harm_f1
	defb 0FFh
	defw mm_harm_f2
	defb 02Bh,02Dh,030h,033h,028h,02Ah,02Ch,030h,025h,027h,029h,02Ch
	defb 0FFh
	defw mm_harm_f0
	defb 0FFh
	defw 0
mm_div:
	defb 096h,059h,0CFh,04Fh,0CAh,03Bh,044h,035h,0CBh,02Ch,0E8h,027h
	defb 08Dh,023h,0ACh,01Fh,0E5h,01Dh,0A2h,01Ah,0BAh,017h,065h,016h
	defb 0F4h,013h,0C7h,011h,0C7h,010h,0D6h,00Fh,0F3h,00Eh,051h,00Dh
	defb 0DDh,00Bh,033h,00Bh,0FAh,009h,0E3h,008h
mm_ay_tab:
	defb 084h,006h,0CEh,005h,059h,004h,0E0h,003h,042h,003h,0E7h,002h
	defb 096h,002h,04Eh,002h,02Dh,002h,0F0h,001h,0BAh,001h,0A1h,001h
	defb 073h,001h,04Bh,001h,038h,001h,027h,001h,016h,001h,0F8h,000h
	defb 0DDh,000h,0D0h,000h,0BAh,000h,0A5h,000h
	ENDIF
