#!/bin/sh
# КАССЕТНАЯ СБОРКА: из готовых образов делает звук магнитофонной ленты.
#
# Вектор грузился с обычного кассетника, и на живом железе это единственный путь
# без квазидиска и без MiSTer: подать .wav в магнитофонный вход. Эмуляторы тоже
# умеют — Emu80 принимает .wav для платформы «Вектор» напрямую (VectorFileLoader:
# нажимает F1 и отдаёт файл своему WavReader, а декодирует его уже ПЗУ Вектора,
# как настоящую ленту).
#
# ДВА ФОРМАТА, И ЭТО НЕ ПРИХОТЬ:
#   штатный (v06c-rom)   — тот, что понимает ПЗУ без всякой подготовки. Медленный:
#                          20 КБ игры идут две с половиной минуты, как на железе
#                          восемьдесят восьмого года;
#   турбо (v06c-turbo)   — загрузчик loadfm (ivagor) вписывается в начало ленты
#                          сам, дальше данные идут вчетверо плотнее: те же 20 КБ
#                          за восемнадцать секунд. Для работы удобнее, но это уже
#                          не «как было».
#
#   tools/tape/mktape.sh [каталог_сборки]      по умолчанию build/prod
set -e
cd "$(dirname "$0")/../.."
B=${1:-build/prod}
BIN2WAV="node tools/tape/vendor/bin2wav.js"
OUT="$B/tape"
mkdir -p "$OUT"

made=""
for src in scuba.rom scuba_splash.rom scuba_splash_redink.rom; do
  [ -f "$B/$src" ] || continue
  name=$(basename "$src" .rom)
  # Имя на ленте — то, что покажет ПЗУ при загрузке; в заголовок влезает немного,
  # поэтому берётся короткое SCUBA, а не имя файла.
  $BIN2WAV "$B/$src" "$OUT/$name.wav"       -m v06c-rom   -n SCUBA -s 0x100 >/dev/null 2>&1
  $BIN2WAV "$B/$src" "$OUT/$name.turbo.wav" -m v06c-turbo -n SCUBA -s 0x100 >/dev/null 2>&1
  made="$made $name"
done

[ -n "$made" ] || { echo "в $B нет ни одного образа для ленты"; exit 1; }
echo "кассетные версии ->$OUT"
for f in "$OUT"/*.wav; do
  # длительность считается из заголовка WAV, а не из размера файла: у штатного
  # формата 22050 Гц, у турбо 44100, и «килобайты» тут ничего не говорят
  node -e '
    const fs=require("fs"),f=process.argv[1],b=fs.readFileSync(f);
    const rate=b.readUInt32LE(24),bits=b.readUInt16LE(34),ch=b.readUInt16LE(22),data=b.readUInt32LE(40);
    const sec=data/(rate*ch*bits/8);
    console.log("  "+f.split("/").pop().padEnd(28)+" "+String(rate).padStart(5)+" Гц  "+
                (sec>=60?Math.floor(sec/60)+" мин "+Math.round(sec%60)+" с":sec.toFixed(1)+" с"));
  ' "$f"
done
