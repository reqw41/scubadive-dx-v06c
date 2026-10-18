#!/bin/sh
# Build scuba.rom for a plain Vector-06C (i8080), the same steps as !compile.cmd.
# Needs sjasmplus and salvador: by default tools/sjasmplus and tools/salvador
# (as in !compile.cmd), or set SJASMPLUS / SALVADOR.
# ZXSOUND=0 sh build.sh builds without sound, exactly as the Z80 original.
set -e
cd "$(dirname "$0")"
SJ=${SJASMPLUS:-tools/sjasmplus}
SALV=${SALVADOR:-tools/salvador}
SND=""
if [ "${ZXSOUND:-1}" = "1" ]; then SND="-DZXSOUND=1"; fi

"$SALV" -classic scubascrn.bin scubascrn.zx0 >/dev/null
LZSIZES=$(wc -c < scubascrn.zx0 | tr -d ' ')
# first pass: the size of the code stream is not known yet
"$SJ" --nologo --msg=err --i8080 $SND -DLZSIZES=$LZSIZES -DLZSIZE1=12345 scubacod0.asm --lst=scubacod0.lst --exp=scubacod0.inc
# --i8080: the assembler itself rejects any Z80-only opcode
"$SJ" --nologo --msg=err --i8080 $SND scubacod1.asm --lst=scubacod1.lst
"$SALV" -classic scubacod1.bin scubacod1.zx0 >/dev/null
LZSIZE1=$(wc -c < scubacod1.zx0 | tr -d ' ')
# second pass: now the boot code gets the right addresses
"$SJ" --nologo --msg=err --i8080 $SND -DLZSIZES=$LZSIZES -DLZSIZE1=$LZSIZE1 scubacod0.asm --lst=scubacod0.lst --exp=scubacod0.inc
cat scubacod0.bin scubacod1.zx0 scubascrn.zx0 > scuba.rom
mkdir -p rom
cp scuba.rom rom/scuba-nzeemin8080.rom
echo "scuba.rom: $(wc -c < scuba.rom | tr -d ' ') bytes (sound: ${ZXSOUND:-1})"
