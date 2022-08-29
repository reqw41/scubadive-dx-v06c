@echo off
if exist scubacod0.bin del scubacod0.bin
if exist scubacod0.txt del scubacod0.txt
if exist scubacod1.bin del scubacod1.bin
if exist scubacod1.txt del scubacod1.txt

rem Define ESCchar to use in ANSI escape sequences
rem https://stackoverflow.com/questions/2048509/how-to-echo-with-different-colors-in-the-windows-command-line
for /F "delims=#" %%E in ('"prompt #$E# & for %%E in (1) do rem"') do set "ESCchar=%%E"

@echo on
tools\salvador.exe -classic scubascrn.bin scubascrn.zx0
@if errorlevel 1 goto Failed
@echo off
dir /-c scubascrn.zx0|findstr /R /C:"scubascrn.zx0"

call :FileSize scubascrn.zx0
set lzsizes=%fsize%

rem First pass on TASM, ZX0 stream sizes are not known yet
@echo on
tools\tasm -85 -b scubacod0.asm scubacod0.bin scubacod0.txt -dLZSIZES=%lzsizes% -dLZSIZE1=9999
@if errorlevel 1 goto Failed
@echo off

powershell -Command "(gc scubacod0.exp) -replace '.EQU', 'EQU' | Out-File -encoding ASCII scubacod0.inc"
if exist scubacod0.exp del scubacod0.exp
@if errorlevel 1 goto Failed

@echo on
tools\pasmo scubacod1.asm scubacod1.bin scubacod1.txt
@if errorlevel 1 goto Failed
@echo off

@echo on
tools\salvador.exe -classic scubacod1.bin scubacod1.zx0
@if errorlevel 1 goto Failed
@echo off

call :FileSize scubacod1.zx0
set lzsize1=%fsize%

rem Second pass on TASM, now we know ZX0 stream sizes
@echo on
tools\tasm -85 -b scubacod0.asm scubacod0.bin scubacod0.txt -dLZSIZES=%lzsizes% -dLZSIZE1=%lzsize1%
@if errorlevel 1 goto Failed
@echo off

dir /-c scubacod?.bin|findstr /R /C:"scubacod"
dir /-c scuba*.zx0|findstr /R /C:".zx0"

copy /b scubacod0.bin+scubacod1.zx0+scubascrn.zx0 scuba.rom >nul
@if errorlevel 1 goto Failed
dir /-c scuba.rom|findstr /R /C:"scuba.rom"

echo %ESCchar%[92mSUCCESS%ESCchar%[0m
exit

:Failed
@echo off
echo %ESCchar%[91mFAILED%ESCchar%[0m
exit /b

:FileSize
set fsize=%~z1
exit /b 0
