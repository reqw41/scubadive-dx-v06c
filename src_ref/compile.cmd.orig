@echo off
if exist scubacod0.bin del scubacod0.bin
if exist scubacod0.inc del scubacod0.inc
if exist scubacod0.lst del scubacod0.lst
if exist scubacod1.bin del scubacod1.bin
if exist scubacod1.lst del scubacod1.lst

rem Define ESCchar to use in ANSI escape sequences
rem https://stackoverflow.com/questions/2048509/how-to-echo-with-different-colors-in-the-windows-command-line
for /F "delims=#" %%E in ('"prompt #$E# & for %%E in (1) do rem"') do set "ESCchar=%%E"

echo Compressing screen...
tools\salvador.exe -classic scubascrn.bin scubascrn.zx0
if errorlevel 1 goto Failed
dir /-c scubascrn.zx0|findstr /R /C:"scubascrn.zx0"

call :FileSize scubascrn.zx0
set lzsizes=%fsize%
REM echo lzsizes=%lzsizes%

rem First pass on TASM, ZX0 stream sizes are not known yet
echo Compiling code0, first pass...
tools\sjasmplus --nologo --msg=err --i8080 -DLZSIZES=%lzsizes% -DLZSIZE1=12345 scubacod0.asm --lst=scubacod0.lst --exp=scubacod0.inc
if errorlevel 1 goto Failed

echo Compiling code...
tools\sjasmplus --nologo --msg=err scubacod1.asm --lst=scubacod1.lst
if errorlevel 1 goto Failed

echo Compressing code...
tools\salvador.exe -classic scubacod1.bin scubacod1.zx0
if errorlevel 1 goto Failed
dir /-c scubacod1.zx0|findstr /R /C:"scubacod1.zx0"

call :FileSize scubacod1.zx0
set lzsize1=%fsize%
REM echo lzsize1=%lzsize1%

rem Second pass on TASM, now we know ZX0 stream sizes
echo Compiling code0, second pass...
tools\sjasmplus --nologo --msg=err --i8080 -DLZSIZES=%lzsizes% -DLZSIZE1=%lzsize1% scubacod0.asm --lst=scubacod0.lst --exp=scubacod0.inc
if errorlevel 1 goto Failed

dir /-c scubacod?.bin|findstr /R /C:"scubacod"

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
