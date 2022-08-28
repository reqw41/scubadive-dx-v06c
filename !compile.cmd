@echo off
if exist scubacod0.bin del scubacod0.bin
if exist scubacod0.txt del scubacod0.txt
if exist scubacod1.bin del scubacod1.bin
if exist scubacod1.txt del scubacod1.txt

rem Define ESCchar to use in ANSI escape sequences
rem https://stackoverflow.com/questions/2048509/how-to-echo-with-different-colors-in-the-windows-command-line
for /F "delims=#" %%E in ('"prompt #$E# & for %%E in (1) do rem"') do set "ESCchar=%%E"

@echo on
tools\tasm -85 -b scubacod0.asm scubacod0.bin scubacod0.txt
@if errorlevel 1 goto Failed

powershell -Command "(gc scubacod0.exp) -replace '.EQU', 'EQU' | Out-File -encoding ASCII scubacod0.inc"
@if errorlevel 1 goto Failed

tools\pasmo scubacod1.asm scubacod1.bin scubacod1.txt
@if errorlevel 1 goto Failed
@echo off

dir /-c scubacod?.bin|findstr /R /C:"scubacod"

if exist scubacod0.exp del scubacod0.exp

copy /b scubacod0.bin+scubacod1.bin scuba.rom >nul
@if errorlevel 1 goto Failed
dir /-c scuba.rom|findstr /R /C:"scuba.rom"

echo %ESCchar%[92mSUCCESS%ESCchar%[0m
exit

:Failed
@echo off
echo %ESCchar%[91mFAILED%ESCchar%[0m
exit /b
