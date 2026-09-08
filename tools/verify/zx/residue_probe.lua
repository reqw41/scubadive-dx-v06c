-- ОСТАТКИ НА ПУСТОМ МЕСТЕ — В НАСТОЯЩЕМ ZX-ОРИГИНАЛЕ.
--
-- Владелец: «странно, в оригинале ZX не видел такого». Проверяем на самой игре
-- 1983 года, а не на её порте: наш «эталон» src_ref — это Z80-порт Зимина под
-- Вектор, и остатки, которые он показывает, могли появиться при переносе.
--
-- Детектор тот же, что в tools/verify/residue_probe.js: клетка с чернилами,
-- которой нет в эталоне фона этого экрана, за которую не отвечает ни рельеф
-- (атрибут 02), ни предмет из списка на экране (LB07D=0xB07D), ни живое
-- существо (у него выдан буфер), ни ныряльщик (DiverObj=0xE33B) — и которая
-- держится подряд много замеров.
--
-- Экран ZX: битовая карта 0x4000 (три трети), атрибуты 0x5800 + строка*32 + столбец.
-- Записи существ: LC4F0=0xC4F0, счётчики 0x5B15..0x5B19, адреса групп 0x5B1F/21/23,
-- размеры записей 21/26/26/26/28, буфер +7/+8, клетка +0/+1.
--
-- ЗАМЕР ТЕМПА ZX-ОРИГИНАЛА НА ГЛУБИНЕ.
--
-- Автопилот вниз не доходит: он тонет за 15-20 с, а с бесконечным кислородом
-- (SD_OXY=1) просто крутится у поверхности — проверено, десять окон подряд
-- карта=001d/001e. Поэтому здесь:
--   * БЕССМЕРТИЕ: по адресу процедуры взрыва ныряльщика (0xE43A в оригинале)
--     кладём C9 (ret) — гибели не происходит вовсе;
--   * РУЛЬ ВНИЗ: угол ныряльщика (DiverObj+6 = 0xE341) выставляем в 8 («вниз»)
--     каждый кадр и держим тягу, пока экран (0x5B04) не опустится на нужную
--     строку; дальше замер обычным вводом.
-- Адрес взрыва получен из дизассемблера оригинала: LE41B по 0xE41B занимает 31
-- байт, дальше идёт DiverExplosion (src/scubacodc.asm), то есть 0xE43A.
--
-- ЗАМЕР ТЕМПА ZX-ОРИГИНАЛА В НАСТОЯЩЕЙ ИГРЕ (не в демо).
--
-- Вход в игру разобран по дизассемблеру дампа памяти (dump.lua + z80dasm):
--   0xEE2C: CALL 0xEEAD / LD A,(0x5C05) / EI / OR A / JR Z,0xEE2C   -- цикл меню
--   0xEE36: LD A,(0x5C08)   -- LAST-K, ASCII нажатой клавиши
--   0xEE7D: SUB 0x31 / JR C,0xEE1C / CP 4 / JR NC,0xEE1C / INC A
--           LD (0x5B10),A   -- LEVEL := 1..4, дальше CALL 0xD990 (Game)
-- То есть клавиши '1'..'4' в меню И выбирают уровень, И сразу стартуют игру.
-- '1'..'4' в матрице ZX = полуряд 0xF7FE = :LINE3, биты 0..3.
--
-- Управление в игре читается напрямую портами, таблица переопределяемая,
-- 0x5B38..0x5B43 (по 3 байта: адрес порта LO,HI + маска), код 0xE2DB..0xE337:
--   0x5B38 = FE FE 04 -> порт 0xFEFE бит2 = X  -- поворот (INC направления)
--   0x5B3B = FE FE 02 -> порт 0xFEFE бит1 = Z  -- поворот (DEC направления)
--   0x5B3E = FE 7F 01 -> порт 0x7FFE бит0 = SPACE        -- ГАЗ  (DEC IX+0Eh)
--   0x5B41 = FE 7F 02 -> порт 0x7FFE бит1 = SYMBOL SHIFT -- ТОРМОЗ (INC IX+0Eh)
-- IX+0Eh — делитель кадров ныряльщика, 8 (быстро) .. 0x14 (медленно).
--
-- Ныряльщик в игре гибнет за 15-20 с случайного ввода, поэтому скрипт сам
-- перезапускает игру: пропажа вызовов 0xE2A8 = мы в меню => снова жмём цифру.
-- Окно засчитывается, только если ВСЁ окно игра шла (иначе выбрасывается).
local function field(pt, pre)
  for n, f in pairs(manager.machine.ioport.ports[pt].fields) do
    if n:sub(1,#pre) == pre then return f end end
  return nil
end
local function hold(pt, pre, on)
  local x = field(pt, pre); if x then x:set_value(on and 1 or 0) end
end

local LEVEL = tonumber(os.getenv("SD_LEVEL") or "1")
local GS    = tonumber(os.getenv("SD_MENU_FRAME") or "13000")  -- кадр, когда меню готово
local WINS  = tonumber(os.getenv("SD_WINDOWS") or "8")         -- сколько окон по 5 с
local WARM  = tonumber(os.getenv("SD_WARMUP") or "250")        -- пропуск после старта игры
local DIVE  = (os.getenv("SD_DIVE") or "0") ~= "0"      -- автопилот «нырять глубже»
local DIG   = tostring(LEVEL)
local WANTROW = tonumber(os.getenv("SD_ROW") or "4")   -- до какой строки экрана нырять
local EXPL  = 0xE43A                                   -- DiverExplosion оригинала
local ANGLE = 0xE341                                   -- DiverObj+6, угол 0..15 (8 = вниз)
local SCRROW = 0x5B04

_G.step,_G.t = 0,0
_G.tick,_G.diver,_G.loop = 0,0,0
_G.dtot,_G.dmark,_G.seen = 0,0,0
_G.win,_G.wstart,_G.games = 0,nil,0
_G.script = { {250,{}}, {12,{{":LINE6","j"}}}, {12,{}},
  {12,{{":LINE7","SYMBOL SHIFT"},{":LINE5","p"}}}, {12,{}},
  {12,{{":LINE7","SYMBOL SHIFT"},{":LINE5","p"}}}, {12,{}},
  {12,{{":LINE6","ENTER"}}}, {12,{}} }
_G.init = false
_G.frame_sub = emu.add_machine_frame_notifier(function()
  local f = manager.machine.screens[":screen"]:frame_number()
  local cpu = manager.machine.devices[":maincpu"]
  if not _G.init then
    _G.init = true
    local op = cpu.spaces["opcodes"]
    _G.t1 = op:install_read_tap(0xB213,0xB213,"tick", function(o,d) _G.tick=_G.tick+1 return d end)
    _G.t2 = op:install_read_tap(0xE2A8,0xE2A8,"diver",function(o,d)
      _G.diver=_G.diver+1 _G.dtot=_G.dtot+1 return d end)
    _G.t3 = op:install_read_tap(0xD9C0,0xD9C0,"loop", function(o,d) _G.loop=_G.loop+1 return d end)
    print(string.format("ЗОНД: tap 0xB213/0xE2A8/0xD9C0; уровень %d, окон %d", LEVEL, WINS))
  end
  -- загрузка с ленты
  if _G.step < #_G.script then
    local e = _G.script[_G.step+1]
    for _,k in ipairs(e[2]) do hold(k[1],k[2],true) end
    _G.t = _G.t + 1
    if _G.t >= e[1] then
      for _,k in ipairs(e[2]) do hold(k[1],k[2],false) end
      _G.step = _G.step + 1; _G.t = 0
      if _G.step == #_G.script then for tag,c in pairs(manager.machine.cassettes) do c:play() end end
    end
    return
  end
  if f < GS then return end
  -- живёт ли игра: растёт ли счётчик вызовов обработчика ныряльщика
  if _G.dtot > _G.dmark then _G.dmark = _G.dtot; _G.seen = f end
  local ingame = (f - _G.seen) <= 60 and _G.dtot > 0

  if not ingame then
    -- мы в меню (или в заставке после game over): жмём цифру уровня пачками
    if _G.wstart then
      print(string.format("кадр %6d: игра кончилась, окно отброшено", f))
      _G.wstart = nil
    end
    hold(":LINE7", "SPACE", false)
    hold(":LINE0", "x", false)
    local ph = f % 90
    hold(":LINE3", DIG, ph < 10)
    _G.gamestart = nil
    _G.rowchk, _G.rot_until = nil, nil
    return
  end
  hold(":LINE3", DIG, false)
  if not _G.gamestart then
    _G.gamestart = f; _G.games = _G.games + 1
    print(string.format("кадр %6d: игра #%d пошла (LEVEL=%d)", f, _G.games,
      cpu.spaces["program"]:read_u8(0x5B10)))
  end
  -- БЕССМЕРТИЕ И СПУСК (см. шапку). Взрыв ныряльщика превращаем в ret, иначе
  -- спуск обрывается гибелью; пока экран выше нужной строки — держим нос вниз
  -- и не считаем окна замера.
  local pr = cpu.spaces["program"]
  pr:write_u8(EXPL, 0xC9)
  local scrrow = pr:read_u8(SCRROW)
  if scrrow < WANTROW then
    pr:write_u8(ANGLE, 8)                 -- нос вниз, угол 8
    hold(":LINE7", "SPACE", true)         -- тяга
    hold(":LINE0", "x", false)
    if _G.divelog ~= scrrow then
      _G.divelog = scrrow
      print(string.format("кадр %6d: спуск, экран строка %d", f, scrrow))
    end
    _G.wstart = nil
    return
  end
  if not _G.deep then _G.deep = f
    print(string.format("кадр %6d: ГЛУБИНА достигнута, строка %d", f, scrrow)) end

  -- скриптованный ввод
  if DIVE then
    -- автопилот «вниз»: держим газ, и если строка мини-карты (0x5B04) за 60 кадров
    -- не выросла — довернём. Опрос клавиш у игры раз в 20 кадров (IX+20h=0x14),
    -- поэтому удержание X на 25 кадров = ровно один шаг поворота.
    local row = cpu.spaces["program"]:read_u8(0x5B04)
    if not _G.rowchk then _G.rowprev, _G.rowchk = row, f end
    hold(":LINE7", "SPACE", true)
    hold(":LINE0", "x", _G.rot_until ~= nil and f < _G.rot_until)
    if f - _G.rowchk >= 60 then
      if row <= _G.rowprev then _G.rot_until = f + 25 end
      _G.rowprev, _G.rowchk = row, f
    end
  elseif os.getenv("SD_IDLE") == "1" then
    -- покой: ныряльщик у лодки, ввода нет (сверка темпа существ с портом)
  elseif os.getenv("SD_THRUST") == "1" then
    hold(":LINE7", "SPACE", true)   -- тяга без поворотов: плывёт вдоль поверхности
  else
    local ph = (f - _G.gamestart) % 400
    hold(":LINE7", "SPACE", ph < 250)
    hold(":LINE0", "x", ph >= 120 and ph < 170)
  end

  if f - _G.gamestart < WARM then return end
  -- ===================== ДЕТЕКТОР ОСТАТКОВ =====================
  if f % 10 ~= 0 then return end
  local pr2 = cpu.spaces["program"]
  local scrkey = pr2:read_u8(0x5B03) .. "," .. pr2:read_u8(0x5B04)
  if scrkey ~= _G.scrkey then _G.scrkey = scrkey; _G.base = nil; _G.settle = 3; _G.streak = {}; return end
  if _G.settle and _G.settle > 0 then _G.settle = _G.settle - 1; return end
  local function ink(r, c)
    for line = 0, 7 do
      local a = 0x4000 + ((r & 0x18) << 8) + ((line & 7) << 8) + ((r & 7) << 5) + c
      if pr2:read_u8(a) ~= 0 then return true end
    end
    return false
  end
  if not _G.base then _G.base = {}
    for r = 0, 23 do for c = 0, 31 do if ink(r, c) then _G.base[r * 32 + c] = true end end end
    return
  end
  _G.samples = (_G.samples or 0) + 1
  local busy = {}
  local function mark(r, c, rad)
    for dr = -rad, rad do for dc = -rad, rad do busy[(r + dr) * 32 + (c + dc)] = true end end
  end
  mark(pr2:read_u8(0xE33B + 1), pr2:read_u8(0xE33B), 3)
  local groups = {
    {0xC4F0, 21, pr2:read_u8(0x5B15)},
    {pr2:read_u8(0x5B1F) + pr2:read_u8(0x5B20) * 256, 26, pr2:read_u8(0x5B16)},
    {pr2:read_u8(0x5B21) + pr2:read_u8(0x5B22) * 256, 26, pr2:read_u8(0x5B17)},
    {pr2:read_u8(0x5B23) + pr2:read_u8(0x5B24) * 256, 26, pr2:read_u8(0x5B18)},
  }
  for _, g in ipairs(groups) do
    local base, sz, n = g[1], g[2], g[3]
    if base >= 0x4000 and n <= 200 then
      for i = 0, n - 1 do local r = base + i * sz
        if pr2:read_u8(r + 7) ~= 0 or pr2:read_u8(r + 8) ~= 0 then mark(pr2:read_u8(r + 1), pr2:read_u8(r), 3) end
      end
    end
  end
  for i = 0, 47 do local e = 0xB07D + i * 4
    if pr2:read_u8(e) ~= 0 or pr2:read_u8(e + 1) ~= 0 then mark(pr2:read_u8(e + 3), pr2:read_u8(e + 2), 2) end
  end
  _G.streak = _G.streak or {}; _G.worst = _G.worst or {}
  for r = 0, 23 do for c = 0, 31 do
    local k = r * 32 + c
    if (not ink(r, c)) or pr2:read_u8(0x5800 + k) == 0x02 or busy[k] or _G.base[k] then
      _G.streak[k] = nil
    else
      _G.streak[k] = (_G.streak[k] or 0) + 1
      if _G.streak[k] > (_G.worst[k] or 0) then _G.worst[k] = _G.streak[k] end
    end
  end end
  if _G.samples % 40 == 0 then
    local list = {}
    local HOLD = tonumber(os.getenv('SD_HOLD') or '30')   -- порог держания, замеров
    for k, s in pairs(_G.worst) do if s >= HOLD then list[#list + 1] = {k, s} end end
    table.sort(list, function(a, b) return a[2] > b[2] end)
    print(string.format("кадр %6d: замеров %d, остатков (>=%d замеров подряд): %d", f, _G.samples, HOLD, #list))
    for i = 1, math.min(#list, 6) do
      print(string.format("   клетка %d,%d: %d замеров", list[i][1] // 32, list[i][1] % 32, list[i][2]))
    end
    if _G.samples >= 200 then manager.machine:exit() end
  end
end)
