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
  if not _G.wstart then _G.wstart = f; _G.tick,_G.diver,_G.loop = 0,0,0; return end
  if f - _G.wstart >= 250 then
    _G.win = _G.win + 1
    local prog = cpu.spaces["program"]
    print(string.format(
      "окно %2d  кадры %6d..%6d  тик %5d = %6.1f/с | ныряльщик %5d = %6.1f/с | цикл %5d | PC=%04x | LEVEL=%d жизни=%d карта=%02x%02x dir=%02x спид=%02x | записи I..V %d/%d/%d/%d/%d",
      _G.win, _G.wstart, f, _G.tick, _G.tick/5.0, _G.diver, _G.diver/5.0, _G.loop,
      cpu.state["PC"].value, prog:read_u8(0x5B10), prog:read_u8(0x5B37),
      prog:read_u8(0x5B04), prog:read_u8(0x5B03),
      prog:read_u8(0xE33B+6), prog:read_u8(0xE33B+0x0E),
      prog:read_u8(0x5B15), prog:read_u8(0x5B16), prog:read_u8(0x5B17),
      prog:read_u8(0x5B18), prog:read_u8(0x5B19)))
    _G.wstart = f; _G.tick,_G.diver,_G.loop = 0,0,0
    if _G.win >= WINS then manager.machine:exit() end
  end
end)
