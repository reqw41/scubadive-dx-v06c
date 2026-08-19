#!/usr/bin/env python3
# ГЕНЕРАТОР ВЫСЕЛЕНИЯ В ЛОМТИ ВЕРХНЕЙ ЗОНЫ.
#
# Что делает: выбирает блоки данных из scubasprt.asm, набивает ими ломти по 64
# байта под завязку и выносит их ИЗ непрерывной области — от этого весь код
# съезжает вниз, а конец кода опускается ниже 0xA000.
#
# Почему выемка выборочная, а не один разрез: в области спрайтов 95 блоков
# крупнее 64 байт, и сплошной хвост в ломти не режется ни при каком месте
# разреза (замер). Поэтому берутся только блоки, которые в ломоть влезают.
#
# Почему нельзя просто DS-дырами: ломти доходят до 0xF7FF, распаковщик писал бы
# поверх собственного сжатого потока (он лежит под 0xC000). Схема такая: блоки
# ассемблируются ПО АДРЕСАМ ЛОМТЕЙ через DISP/ENT, а в образе лежат упакованными
# подряд; бут раскладывает их циклом с шагом 256.
#
# СКЛЕЙКИ: игра ходит через границы блоков (замер: 38 границ из 690). Склеенные
# соседи объединяются в неразрывную единицу; единица крупнее 64 Б выбывает.
#
# ПРОТУХАНИЕ. После ЛЮБОЙ правки плана прежние образы и вердикты набора
# недействительны: состав корпуса меняется, а с ним адреса, Top и поведение.
# Состояние фиксируется тройкой «план + Top address + вердикт старта»; число
# ломтей само по себе сборку не характеризует (проверено дважды: тот же номер
# при другом плане давал другой состав и другой исход).
#
#   python3 tools/mkzone.py <sym> <ломтей>
import re, sys, os

SYM = sys.argv[1] if len(sys.argv) > 1 else "build/gz/scubacod1.sym"
NSLICE = int(sys.argv[2]) if len(sys.argv) > 2 else 8
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Файлы-доноры. Список задаётся снаружи (ZFILES), по умолчанию только спрайты.
FILES = os.environ.get("ZFILES", "scubasprt.asm").split(",")
OUT = os.path.join(ROOT, "src8080", "scubazone.asm")
# Склейки, найденные замером tools/verify/zone_pack.js. Блок, ЧЬЁ ИМЯ здесь,
# читается впритык за предыдущим — разносить их нельзя.
# ИМЕНА, А НЕ АДРЕСА: прежний список был набором адресов и протух от правки в
# другом файле — все адреса уехали на 2 байта, и генератор молча склеивал НЕ ТЕ
# пары. Имена от таких сдвигов не страдают. Пустой список означает «замер не
# проводился для этого корпуса», и это состояние честнее протухшего.
WELD_NAMES = set()
_wf = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "build", "weld_names.txt")
if os.path.exists(_wf):
    WELD_NAMES = {l.strip() for l in open(_wf, encoding="utf-8") if l.strip()}

sym = {}
for line in open(SYM, encoding="latin1"):
    m = re.match(r"^(\S+):\s+EQU\s+0x([0-9A-Fa-f]+)\s*$", line)
    if m: sym[m.group(1)] = int(m.group(2), 16)

# метки, ОПРЕДЕЛЁННЫЕ в scubasprt.asm, и их строки
# ИДЕМПОТЕНТНОСТЬ: обёртки прошлого прогона снимаются ПЕРЕД разбором. Без этого
# второй запуск разбирал уже обёрнутый файл, вытаскивал чужой ENDIF в выходной
# файл и ронял сборку, а третий добавлял Duplicate label.
# Снимаются ТОЛЬКО обёртки, поставленные этим генератором — они помечены
# комментарием. Прежняя версия ловила любую строку, начинающуюся с
# «\tIFNDEF EVICT», и съедала РУЧНУЮ конструкцию `IFNDEF EVICT / ... / ELSE /
# ... / ENDIF` (клип под ломти в ClearScreen): открывающая директива исчезала,
# ELSE оставался без IF, и сторож ловил разрыв, которого никто не делал. Донос
# при этом молчал — тело директив не уносило, их уносила подготовка текста.
WRAP_MARK = "; выселен в ломоть зоны (tools/mkzone.py)"
_IFRE = re.compile(r"^(IFDEF|IFNDEF|IF|IFUSED|IFNUSED)\b")
def strip_wrappers(raw):
    # Снимается ПАРНЫЙ ENDIF, а не первый попавшийся. Прежняя версия обрывалась
    # на ближайшем ENDIF — и если тело содержало СВОЮ условную конструкцию
    # (GetScrAddrF несёт внутри IFNDEF GEOM/ELSE/ENDIF), снимался внутренний
    # ENDIF чужой конструкции. Структура ехала, часть строк выпадала, код тела
    # укорачивался на 10 байт, а вместе с ним расходились ZONE- и RASTER-образы:
    # набор краснел 13 провалами, не имевшими к выселению никакого отношения.
    out, depth = [], 0
    for l in raw:
        if depth == 0:
            if l.startswith("\tIFNDEF EVICT") and WRAP_MARK in l: depth = 1; continue
            out.append(l); continue
        u = l.strip().upper()
        if _IFRE.match(u): depth += 1
        elif u.startswith("ENDIF"):
            depth -= 1
            if depth == 0: continue          # это наш парный ENDIF — снимаем
        out.append(l)
    if depth: sys.exit("strip_wrappers: обёртка не закрыта — файл повреждён")
    return out
src = {}
for f in FILES:
    fp = os.path.join(ROOT, "src8080", f)
    if not os.path.exists(fp): sys.exit(f"нет файла-донора {fp}")
    src[f] = strip_wrappers(open(fp, encoding="utf-8").read().split("\n"))
    if not any(l.strip() for l in src[f]): sys.exit(f"донор {f} пуст")
raw = []
# ИДЕМПОТЕНТНОСТЬ: снимаем обёртки прошлого прогона. Без этого второй запуск
# генератора разбирал уже обёрнутый файл, вытаскивал чужой ENDIF в scubazone.asm
# и ронял сборку ошибкой «ENDIF without IF».

# КРОСС-ФАЙЛОВЫЕ МЕТКИ: границы блока считаются ВНУТРИ файла, а размер берётся
# из .sym по соседней метке — она может лежать в другом файле. Совпадение
# проверяется ниже, блоки с расхождением выбывают.
# УСЛОВНАЯ ГЛУБИНА. Тело, лежащее внутри чужого IFDEF/IFNDEF, трогать нельзя:
# обёртка `IFNDEF EVICT ... ENDIF` встаёт внутрь чужой конструкции и рвёт её —
# sjasmplus отвечает «ELSE without IF» и «Duplicate label». Метки, попавшие под
# любое условие, из корпуса исключаются целиком.
own = {}          # имя -> [файл, первая строка, последняя строка]
cond_names = set()
for f in FILES:
    lines, cur, depth = src[f], None, 0
    for i, l in enumerate(lines):
        u = l.strip().upper()
        if re.match(r"^(IFDEF|IFNDEF|IF|IFUSED|IFNUSED)\b", u): depth += 1
        elif re.match(r"^ENDIF\b", u): depth = max(0, depth - 1)
        m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)\b", l)
        if m:
            if cur: own[cur][2] = i - 1
            cur = m.group(1); own[cur] = [f, i, len(lines) - 1]
            if depth > 0: cond_names.add(cur)
    if cur: own[cur][2] = len(lines) - 1
# Второй запрет: тело, ПЕРЕСЕКАЮЩЕЕ границу условной конструкции.
# Средний путь между двумя крайностями, обе проверены числом:
#   «любое условие внутри тела запрещено» — безопасно, но корпус падает до 28;
#   «лишь бы директивы были сбалансированы» — пропускает случай, когда тело
#   само сбалансировано, а вырезание уносит открывающий IFNDEF соседа: половина
#   конструкции уезжает в ломоть, ELSE остаётся на месте.
# Правило: конструкция IF..ENDIF обязана лежать ЦЕЛИКОМ внутри тела ЛИБО
# ЦЕЛИКОМ вне его. Любое пересечение границы тела — тело выбывает.
for f in FILES:
    lines = src[f]
    stack, spans = [], []            # spans: (строка IF, строка ENDIF)
    for i, l in enumerate(lines):
        u = l.strip().upper()
        if re.match(r"^(IFDEF|IFNDEF|IF|IFUSED|IFNUSED)\b", u): stack.append(i)
        elif re.match(r"^ENDIF\b", u) and stack: spans.append((stack.pop(), i))
    for i0 in stack: spans.append((i0, len(lines) - 1))   # незакрытая — считаем до конца
    for nm, (ff, a0, a1) in own.items():
        if ff != f: continue
        for (c0, c1) in spans:
            inside = c0 >= a0 and c1 <= a1
            outside = c1 < a0 or c0 > a1
            if not (inside or outside): cond_names.add(nm); break
        # ВРЕМЕННО ОТКЛЮЧЁН строгий запрет (см. ниже) — вернём средний путь и
        # дадим виновнику проявиться под доносом.
        if False:
          pass
        # Дополнительно: НИ ОДНОЙ условной директивы в вырезаемых строках.
        # Правило «конструкция целиком внутри либо целиком вне» логично, но
        # сторож всё равно ловил разрыв, а донос не показывал виновника — то
        # есть границы тел по .sym и реальные вырезаемые строки расходятся.
        # Пока расхождение не названо точно, действует строгий запрет: он
        # заведомо безопасен, а недобор ломтей возмещается расширением корпуса.
        if os.environ.get("ZSTRICT") == "1":
          for l in lines[a0:a1 + 1]:
            if re.match(r"^(IFDEF|IFNDEF|IF|IFUSED|IFNUSED|ELSE|ENDIF)\b", l.strip().upper()):
                cond_names.add(nm); break
    if os.environ.get("ZDBG"):
        print(f"  {f}: конструкций {len(spans)}, меток файла "
              f"{sum(1 for n,(ff2,_,_) in own.items() if ff2==f)}, "
              f"в запрете {sum(1 for n in cond_names if own.get(n,[None])[0]==f)}")

# Третий запрет: ДВОЙНЫЕ МЕТКИ. Имя, определённое в обеих ветках условия (как
# LDA42 в ClearScreen: своя версия под GEOM и своя без него), в own попадает
# один раз — последним определением. Вырезание по этим границам уносит чужую
# половину. Такие имена переносятся только вместе со всей конструкцией, то есть
# на практике — не переносятся.
for f in FILES:
    seen = {}
    for i, l in enumerate(src[f]):
        m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)\b", l)
        if m: seen[m.group(1)] = seen.get(m.group(1), 0) + 1
    for nm, n in seen.items():
        if n > 1: cond_names.add(nm)

# СТРАЖ ВХОДА: .sym обязан быть от сборки БЕЗ выселения. В EVICT-сборке уже
# выселенные тела лежат по адресам ломтей (0xC0C0 и выше), соседство по адресам
# перемешано с соседством в файле, и размеры блоков считаются от чужих соседей.
# Симптом, стоивший разбирательства: «следующий по .sym» и «следующий по файлу»
# указывали на разные метки, генератор объявлял единицу вдвое крупнее, чем
# вырезал, а сторож ловил разорванную условную конструкцию.
# Считаются только метки САМИХ ДОНОРОВ: адреса вида 0xE72C встречаются и в
# чистой сборке — это законные EQU на видеопамять, к выселению не относящиеся.
_inzone = [k for k, v in sym.items()
           if k in own and 0xA000 <= v < 0x10000 and (v & 0xff) >= 192]
# Порог 20, а не 4: полтора десятка меток доноров законно живут в видеопамяти
# и в чистой сборке (буферы, EQU на экран). Признаком подменённого .sym служит
# МАССОВОЕ попадание — при выселении их сразу под сотню.
if len(_inzone) > 20:
    sys.exit(f"СТРАЖ: {SYM} — это .sym сборки С выселением ({len(_inzone)} меток уже в "
             f"ломтях, например {_inzone[0]}). Нужен .sym чистой сборки, обычно "
             f"build/gz/scubacod1.sym.")

# размеры блоков из .sym в адресном порядке
addrs = sorted((v, k) for k, v in sym.items() if 0x1000 <= v < 0x8E90)
size = {}
for i in range(len(addrs) - 1):
    size[addrs[i][1]] = addrs[i + 1][0] - addrs[i][0]

# единицы: подряд идущие блоки, склеенные между собой, объединяются
units = []
i = 0
while i < len(addrs) - 1:
    j = i
    while j + 1 < len(addrs) - 1 and addrs[j + 1][1] in WELD_NAMES: j += 1
    names = [addrs[k][1] for k in range(i, j + 1)]
    sz = addrs[j + 1][0] - addrs[i][0]
    if sz > 0 and all(n in own for n in names):
        units.append({"sz": sz, "names": names, "addr": addrs[i][0]})
    i = j + 1

# КОРПУС КОДОВЫХ ТЕЛ (ZPLAN=<файл>). План выгружает tools/verify/exec_census.js:
# TSV «имя, нужен-шов(0/1), метка-соседа». Тела кода переносятся ТЕМ ЖЕ
# механизмом DISP/ENT, что и данные, — ассемблер пересчитывает ссылки
# символически. Разница ровно одна: тело, которое кончается НЕ безусловным
# переходом, на старом месте проваливалось в соседа, а в ломте соседа нет.
# Такому телу дописывается ШОВ `jp <сосед>` — 3 байта, и на размер единицы они
# тоже считаются, иначе ломоть переполнится.
# Отбор жёсткий: из файлов КОДА берутся только тела, названные в плане. Именно
# отсутствие такого отбора выселило когда-то метки циклов L9C69/L9C6C/L9CAA из
# DrawGameScr — это были не процедуры, а метки внутри чужого тела.
PLAN = {}
if os.environ.get("ZPLAN"):
    pf = os.environ["ZPLAN"]
    if not os.path.exists(pf): sys.exit(f"нет файла плана {pf}")
    for ln in open(pf, encoding="utf-8"):
        parts = ln.rstrip("\n").split("\t")
        if len(parts) >= 3 and parts[0]: PLAN[parts[0]] = (parts[1] == "1", parts[2])
    if not PLAN: sys.exit("план кодовых тел пуст — отбор не состоится")
    DATA_FILES = {"scubasprt.asm", "scubammap.asm"}
    _b = len(units)
    def allowed(u):
        if any(n in cond_names for n in u["names"]): return False
        f0 = own[u["names"][0]][0]
        if f0 in DATA_FILES: return True
        return len(u["names"]) == 1 and u["names"][0] in PLAN
    _rej = [u["names"][0] for u in units if not allowed(u)]
    units = [u for u in units if allowed(u)]
    print(f"отвергнуто отбором: {len(_rej)}; условных/двойных меток всего {len(cond_names)}"
          + (f"; пример: {_rej[0]}" if _rej else ""))
    for u in units:
        nm = u["names"][0]
        if nm in PLAN and PLAN[nm][0]:
            u["seam"] = PLAN[nm][1]
            u["sz"] += 3                      # место под jp в ломте
    nseam = sum(1 for u in units if u.get("seam"))
    print(f"корпус по плану: единиц {_b} -> {len(units)}, из них со швом jp {nseam}")

# ФИЛЬТР СЫРЫХ УКАЗАТЕЛЕЙ (CLEAN=1). Перенос блока меняет его адрес, а слово,
# лежащее в таблице цифрами, ассемблер не правит. Скан ищет адрес блока сырым
# словом в образе. ЧЕСТНАЯ ОГОВОРКА: скан НЕ ДОКАЗАТЕЛЬСТВО — вероятность
# случайного совпадения двухбайтового слова в 44 КБ около 67%, поэтому он метит
# «грязными» и невиновных. Он годится ровно на одно: собрать заведомо ЧИСТУЮ
# выборку для решающего эксперимента.
if os.environ.get("CLEAN") == "1":
    img = open(os.path.join(ROOT, "build", "gz", "scubacod1.bin"), "rb").read()
    def clean(u):
        for n in u["names"]:
            a = sym.get(n)
            if a is None: return False
            if img.find(bytes([a & 0xff, a >> 8])) >= 0: return False
        return True
    units = [u for u in units if clean(u)]
    print(f"фильтр CLEAN: осталось единиц {len(units)}, {sum(u['sz'] for u in units)} Б")

# ФИЛЬТР ИНДЕКСИРУЕМЫХ МАССИВОВ. Блок, чей адрес код грузит В ПАРУ и складывает
# (LD BC,МЕТКА ... ADD HL,BC), адресуется АРИФМЕТИКОЙ от базы: смещение считается,
# а не берётся из таблицы, и ассемблер такую ссылку не правит. Разнести такой
# массив по ломтям нельзя — обращения уедут в чужие данные.
# Так и вышло с рельефом: он набирал недостающие ломти, но LA4DD читается как
# LD BC,LA4DD / ADD HL,BC / 16 раз LD A,(HL) — и 70-ломтевый образ не доходил до
# главного цикла (PrepareMiniMap не возвращалась). Ни фильтр указателей, ни
# склейки этого не ловят: указателя в таблице нет, границ блоков чтение не
# пересекает — оно ходит ВНУТРИ массива, просто массива больше нет.
CODE_FILES = ["scubacoda.asm", "scubacodb.asm", "scubacodc.asm", "scubacod0.asm",
              "scubacod1.asm"]
codetext = []
for f in CODE_FILES:
    fp = os.path.join(ROOT, "src8080", f)
    if os.path.exists(fp): codetext.append(open(fp, encoding="utf-8").read())
codetext = "\n".join(codetext)
if not codetext: sys.exit("не прочитан ни один файл кода — фильтр индексации мертвецки пуст")
def indexed(name):
    # LD BC,ИМЯ / LD DE,ИМЯ / LD HL,ИМЯ, а следом в пределах 6 строк ADD HL,...
    for m in re.finditer(r"(?im)^\s*LD\s+(BC|DE|HL)\s*,\s*" + re.escape(name) + r"\s*(?:;.*)?$",
                         codetext):
        tail = codetext[m.end(): m.end() + 240]
        if re.search(r"(?im)^\s*ADD\s+HL\s*,", tail): return True
    return False
_before = len(units)
_idx = sorted({n for u in units for n in u["names"] if indexed(n)})
units = [u for u in units if not any(n in _idx for n in u["names"])]
print(f"фильтр индексации: единиц {_before} -> {len(units)}, "
      f"отвергнуто баз-массивов {len(_idx)}" + (f": {', '.join(_idx[:6])}" if _idx else ""))

# ФИЛЬТР «НА МЕТКУ НЕТ НИ ОДНОЙ ССЫЛКИ» — КЛАСС СВЯЗЕЙ №5 ЦЕЛИКОМ.
# Фильтр индексации метит БАЗУ массива (LD rr,МЕТКА + ADD HL), но массив ШИРЕ
# базы: следом за базой лежат кадры, на которые в коде нет ни одной ссылки —
# до них доходят арифметикой от базы. Именно так разъехался массив «Scuba diver
# various sprites»: SprDiverClimb/SprDiverSit названы в коде, а L9BCC/L9BEC/
# L9C0C — НЕТ НИ РАЗУ, и при этом замер показал 45/48/44 чтения за 901 тик, а
# максимальное смещение чтения от SprDiverSit — 127 байт при кадре в 32, то есть
# чтение уходит на четыре кадра вперёд. Выселенные в разные ломти, они дали
# мусорный спрайт героя НА ЖЕЛЕЗЕ, и ни один гейт этого не увидел.
# Правило простое и общее: если имени нет в коде ни разу, блок либо мёртв, либо
# следует за базой. Оба случая — «не трогать».
_ref_cache = {}
def referenced(name):
    if name not in _ref_cache:
        _ref_cache[name] = re.search(r"\b" + re.escape(name) + r"\b", codetext) is not None
    return _ref_cache[name]
_before = len(units)
_unref = sorted({n for u in units for n in u["names"] if not referenced(n)})
units = [u for u in units if all(referenced(n) for n in u["names"])]
print(f"фильтр «нет ссылок в коде»: единиц {_before} -> {len(units)}, "
      f"отвергнуто безымянных {len(_unref)}" + (f": {', '.join(_unref[:6])}" if _unref else ""))

# набивка ломтя под завязку
avail = sorted([u for u in units if u["sz"] <= 64], key=lambda u: -u["sz"])
used, slices = set(), []
while len(slices) < NSLICE:
    rest, items = 64, []
    for u in avail:
        if u["names"][0] in used or u["sz"] > rest: continue
        used.update(u["names"]); items.append(u); rest -= u["sz"]
        if rest == 0: break
    if not items: break
    slices.append(items)
if len(slices) < NSLICE:
    sys.exit(f"не набралось {NSLICE} ломтей, только {len(slices)}")

# Адреса ломтей: СНАЧАЛА плоскости 2 и 3 (по 24 столбца), и только потом
# плоскость 1 (32 столбца). Порядок не косметика: ломти плоскости 1 лежат в
# 0xA000..0xBFFF, то есть внутри кода, пока тот не съехал ниже 0xA000. При
# частичном выселении раскладка в плоскость 1 затирает сам код — проверено,
# образ до главного цикла не доходил.
# КАРТА ЗАНЯТОСТИ. Ломти плоскости 0xC000 в столбцах 2..6 уже заняты буферами
# save-under (этап 2: индекс страницы = столбец, младшие 208..255). Наложение
# ловилось не сразу: данные ложились верно, а портились через сотни тиков, когда
# игра начинала сохранять фон под спрайтом. Занятые столбцы пропускаются.
POOL_COLS = {2, 3, 4, 5, 6}
# КАРТА АДРЕСОВ — ДОСЛОВНЫЙ ДВОЙНИК ЦИКЛА zcopy (scubacod1.asm). Их расхождение
# уже стоило прогона: бут шагал подряд, а генератор пропускал столбцы, и из 240
# байт разошлось 131. Поэтому здесь не «свой порядок обхода», а тот же автомат:
#   старт 0xC0; шаг +1; 0xC2 -> 0xC7 (буферы пула); переполнение 0xFF -> 0xA0
#   (плоскости 2 и 3 кончились); 0xB0 -> 0xB2 (страницы пула 0xB000/0xB100).
# Плоскость 1 идёт ПОСЛЕДНЕЙ не для красоты: её ломти лежат в 0xA000..0xBFFF,
# то есть внутри кода, пока тот не съехал ниже 0xA000. При частичном выселении
# раскладка туда затирает сам код — образ до главного цикла не доходил.
# Столбцы 24..31 плоскостей 2 и 3 вернулись в оборот после выравнивания панели.
# Старт плоскости 1 берётся из .sym (ZN_P1), а не зашит числом: ассемблер
# считает его как первую целую страницу ЗА концом кода. Зашитый 0xA0 раздавал
# ломти поверх кода — гейт границ поймал это на коде до 0xAD3E.
P1 = sym.get("ZN_P1")
if P1 is None:
    sys.exit("в .sym нет ZN_P1 — пересобери с EVICT; без него карта ляжет на код")
# ГРАНИЦА РЕЛЬЕФА. Страницы RELIEF_HI..0xFF (30 столбцов плоскости 3) отданы
# рельефу ЦЕЛИКОМ — он переезжает одним куском, блок n в ломоть n, и разрывов в
# этом ряду быть не может. Значение берётся из .sym, а не зашито числом: тот же
# символ читают автомат zcopy и гейт границ, и расхождение любых двух из трёх
# ловится zone_bounds_gate. Отсутствие символа — падение, а не молчаливый 0x100
# (урок №8: фильтр по несуществующей метке — тихо пустой фильтр).
RHI = sym.get("RELIEF_HI")
if RHI is None:
    sys.exit("в .sym нет RELIEF_HI — карта ломтей залезет на ломти рельефа")
def slice_addrs(n):
    out, d, in_p1 = [], 0xC0, False
    while len(out) < n:
        out.append(d * 256 + 192)
        a = (d + 1) & 0xff
        if a == RHI: a, in_p1 = P1, True  # дальше рельеф -> плоскость 1
        elif a == 0xC2: a = 0xC7          # буферы пула, столбцы 2..6
        if a == 0xB0: a = 0xB2            # страницы пула 0xB000/0xB100
        if in_p1 and a >= 0xC0: break     # плоскость 1 кончилась — ёмкость исчерпана
        d = a
    return out
sa = slice_addrs(len(slices))

# 1) файл выселенных блоков
buf = ["; ГЕНЕРИРУЕТСЯ tools/mkzone.py — РУКАМИ НЕ ПРАВИТЬ.",
       "; Блоки данных, выселенные в ломти верхней зоны. Каждый ломоть — 64 байта,",
       "; ассемблируется по адресу ломтя (DISP), а в образе лежит упакованным подряд;",
       "; бут раскладывает их циклом с шагом 256 (см. RZONE_COPY в scubacod0.asm).",
       "SCUBAZONE_SRC:"]
for k, items in enumerate(slices):
    tot = sum(u["sz"] for u in items)
    buf.append(f"; --- ломоть {k}: 0x{sa[k]:04X}, занято {tot} из 64 Б")
    buf.append(f"\tDISP 0{sa[k]:04X}h")
    for u in items:
        f0 = own[u["names"][0]][0]
        a, b = own[u["names"][0]][1], own[u["names"][-1]][2]
        buf.extend(src[f0][a:b + 1])
        if u.get("seam"):                     # тело проваливалось в соседа —
            buf.append(f"\tjp {u['seam']}\t\t; ШОВ: на старом месте был провал")
    if tot < 64: buf.append(f"\tDS {64 - tot},0")
    buf.append("\tENT")
buf.append("SCUBAZONE_END:")
n23 = sum(1 for a in sa if a >= 0xC000)
buf.append(f"SCUBAZONE_N23\tEQU {n23}\t; ломтей в плоскостях 2 и 3 (кладутся напрямую)")
buf.append("")
open(OUT, "w", encoding="utf-8").write("\n".join(buf))

# СТРАЖ НЕПЕРЕКРЫТИЯ. Логика вырезания (skip_to) построена на предположении, что
# тела идут строго друг за другом и не вкладываются. Предположение нигде не
# проверялось — и оказалось неверным: генератор терял по нескольку строк, код
# ZONE-сборки укоротился на 10 байт, а набор краснел 13 провалами, которые к
# выселению отношения не имели вовсе. Предположение обязано проверяться.
for _f in FILES:
    _own = sorted(((v[1], v[2], k) for k, v in own.items() if v[0] == _f))
    for _i in range(len(_own) - 1):
        if _own[_i][1] >= _own[_i + 1][0]:
            sys.exit(f"СТРАЖ: в {_f} тела {_own[_i][2]} ({_own[_i][0]+1}..{_own[_i][1]+1}) и "
                     f"{_own[_i+1][2]} ({_own[_i+1][0]+1}..) ПЕРЕКРЫВАЮТСЯ — вырезание "
                     f"потеряет строки.")

# ТРЕТИЙ СТРАЖ: НЕСЖАТЫЕ БИНАРИ ВСЕХ БОЕВЫХ КОНФИГУРАЦИЙ ДО И ПОСЛЕ ГЕНЕРАЦИИ.
# Обёртки IFNDEF EVICT обязаны быть невидимы для сборок БЕЗ выселения: тело
# внутри компилируется как прежде. Если хоть один несжатый бинарь изменился —
# генератор задел то, чего трогать не должен, и правка откатывается целиком.
# Этот страж поймал бы разом обе беды подготовки текста (съеденную ручную
# конструкцию в ClearScreen и непарный ENDIF внутри GetScrAddrF) на первом же
# прогоне — вместо двух красных наборов и долгого разбора.
# Сверяется ИМЕННО НЕСЖАТЫЙ бинарь: размер сжатого ROM однажды совпал случайно
# и потерю в десять байт скрыл бы.
if os.environ.get("ZNOVERIFY") != "1":
    import subprocess, shutil, tempfile
    CFGS = [("штатная", {}), ("GEOM", {"GEOM": "1"}), ("ZONE", {"ZONE": "1"}),
            ("RASTER", {"RASTER": "1"}), ("GEOM+ZONE", {"GEOM": "1", "ZONE": "1"})]
    def build_bins(tag):
        res = {}
        for name, fl in CFGS:
            env = dict(os.environ, DET="1", SRC="src8080", OUT=f"build/_v{tag}", **fl)
            env.pop("EVICT", None)
            r = subprocess.run(["./tools/build.sh"], cwd=ROOT, env=env,
                               capture_output=True)
            b = os.path.join(ROOT, f"build/_v{tag}", "scubacod1.bin")
            res[name] = open(b, "rb").read() if (r.returncode == 0 and os.path.exists(b)) else None
        return res
    before = build_bins("a")
    backup = {f: open(os.path.join(ROOT,'src8080',f),'rb').read() for f in FILES}

# 2) исходный файл: выселенные блоки прячутся под флагом
for f in FILES:
    lines, out, skip_to = src[f], [], -1
    for i, l in enumerate(lines):
        m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)\b", l)
        if m and m.group(1) in used and own[m.group(1)][0] == f and own[m.group(1)][1] == i:
            nm = m.group(1)
            # ДОНОС НА ВИНОВНИКА: печатаем тело, в чьи вырезаемые строки попала
            # условная директива. Офлайн-анализ по границам тел и реальное
            # вырезание могут расходиться (между телами лежат нелейбловые строки),
            # поэтому смотрим ровно то, что уходит, а не то, что должно уходить.
            # ДВЕ ВЕЛИЧИНЫ ГРАНИЦ. Тело живёт в двух системах отсчёта сразу:
            # размер берётся по .sym (следующий АДРЕС), а вырезаются СТРОКИ до
            # следующей метки в файле. Если следующий по .sym и следующий по
            # файлу — разные метки, границы разъехались, и вырезание уносит
            # чужое. Печатаем обе, чтобы назвать виновника, а не гадать.
            _ai = sym.get(nm)
            _nx_sym = None
            if _ai is not None:
                _after = [(v, k) for k, v in sym.items() if v > _ai]
                if _after: _nx_sym = min(_after)[1]
            _nx_file = None
            for _j in range(own[nm][2] + 1, len(lines)):
                _m2 = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)\b", lines[_j])
                if _m2: _nx_file = _m2.group(1); break
            if _nx_sym != _nx_file:
                print(f"РАСХОЖДЕНИЕ ГРАНИЦ: {nm} ({f}) — следующий по .sym "
                      f"{_nx_sym}, по файлу {_nx_file}; вырезаются строки "
                      f"{own[nm][1]+1}..{own[nm][2]+1}")
            _cut = lines[own[nm][1]:own[nm][2] + 1]
            _dir = [(own[nm][1] + k + 1, ln.strip()) for k, ln in enumerate(_cut)
                    if re.match(r"^(IFDEF|IFNDEF|IF|IFUSED|IFNUSED|ELSE|ENDIF)\b",
                                ln.strip().upper())]
            if _dir:
                print(f"ДОНОС: тело {nm} ({f}, строки {own[nm][1]+1}..{own[nm][2]+1}) "
                      f"уносит директивы: " + "; ".join(f"{n}:{t}" for n, t in _dir[:4]))
            out.append("\tIFNDEF EVICT\t; выселен в ломоть зоны (tools/mkzone.py)")
            out.extend(lines[own[nm][1]:own[nm][2] + 1]); out.append("\tENDIF")
            skip_to = own[nm][2]; continue
        if i <= skip_to: continue
        out.append(l)
    # СТРАЖ СОХРАННОСТИ: строк на выходе обязано быть столько же, сколько на
    # входе, плюс по две на каждую обёртку (IFNDEF + ENDIF). Любая иная разница —
    # потерянные строки, и файл записывать нельзя.
    _wrapped = sum(1 for l in out if l.startswith("\tIFNDEF EVICT") and WRAP_MARK in l)
    if len(out) != len(lines) + 2 * _wrapped:
        sys.exit(f"СТРАЖ: в {f} на входе {len(lines)} строк, на выходе {len(out)} при "
                 f"{_wrapped} обёртках — ожидалось {len(lines) + 2 * _wrapped}. "
                 f"Вырезание потеряло строки, файл НЕ записан.")
    open(os.path.join(ROOT, "src8080", f), "w", encoding="utf-8").write("\n".join(out))


# --- третий страж, часть вторая: сверка и откат -------------------------------
if os.environ.get("ZNOVERIFY") != "1":
    after = build_bins("b")
    bad = [n for n in after if after[n] != before[n]]
    if bad:
        for f in FILES:
            open(os.path.join(ROOT, "src8080", f), "wb").write(backup[f])
        sys.exit(f"СТРАЖ: генерация изменила несжатый бинарь конфигураций {', '.join(bad)} — "
                 f"обёртки обязаны быть невидимы вне EVICT. Правка ОТКАЧЕНА.")
    print(f"страж бинарей: {len(after)} конфигураций без изменений")

# СТОРОЖ БАЛАНСА УСЛОВИЙ. Вырезание тела может унести половину чужой
# конструкции: IFNDEF уедет в ломоть, а ELSE/ENDIF останутся на месте. Ошибка
# всплывает уже у ассемблера («ELSE without IF», «Duplicate label»), причём в
# файле, который генератор правил, — и выглядит как поломка исходника, а не
# генератора. Проверяем баланс сразу после записи и падаем внятно.
for f in FILES:
    d, ln = 0, 0
    for i, l in enumerate(open(os.path.join(ROOT, "src8080", f), encoding="utf-8")):
        u = l.strip().upper()
        if re.match(r"^(IFDEF|IFNDEF|IF|IFUSED|IFNUSED)\b", u): d += 1
        elif re.match(r"^ENDIF\b", u):
            d -= 1
            if d < 0: sys.exit(f"СТОРОЖ: в {f} строка {i+1} — ENDIF без IF. "
                               f"Генератор унёс половину условной конструкции.")
        elif re.match(r"^ELSE\b", u) and d == 0:
            sys.exit(f"СТОРОЖ: в {f} строка {i+1} — ELSE без IF. "
                     f"Генератор унёс половину условной конструкции.")
    if d != 0: sys.exit(f"СТОРОЖ: в {f} осталось {d} незакрытых IF после правки генератора.")
print(f"ломтей {len(slices)}, единиц {len(used)}, байт {sum(sum(u['sz'] for u in it) for it in slices)}")
open(os.path.join(ROOT, "build", "zone_map.txt"), "w").write("\n".join(f"{a:04x}" for a in sa) + "\n")
print(f"адреса ломтей: 0x{sa[0]:04X} .. 0x{sa[-1]:04X} (карта -> build/zone_map.txt)")
