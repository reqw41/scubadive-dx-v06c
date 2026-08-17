-- РАЗВЕДКА: какое значение направления ныряльщика (DiverObj+6, 0xE341) ведёт ВНИЗ.
-- Грузим ленту, стартуем игру клавишей уровня, держим ГАЗ (SPACE) и принудительно
-- пишем направление 0..15, меняя его каждые 300 кадров; печатаем строку/столбец
-- позиции экрана на мини-карте (0x5B03: L=столбец, H=строка) — по ним видно снос.
local function field(pt, pre)
  for n, f in pairs(manager.machine.ioport.ports[pt].fields) do
    if n:sub(1,#pre) == pre then return f end end
  return nil
end
local function hold(pt, pre, on)
  local x = field(pt, pre); if x then x:set_value(on and 1 or 0) end
end
local LEVEL = tonumber(os.getenv("SD_LEVEL") or "1")
local GS    = tonumber(os.getenv("SD_MENU_FRAME") or "13000")
local DIG   = tostring(LEVEL)
_G.step,_G.t,_G.dtot,_G.dmark,_G.seen = 0,0,0,0,0
_G.script = { {250,{}}, {12,{{":LINE6","j"}}}, {12,{}},
  {12,{{":LINE7","SYMBOL SHIFT"},{":LINE5","p"}}}, {12,{}},
  {12,{{":LINE7","SYMBOL SHIFT"},{":LINE5","p"}}}, {12,{}},
  {12,{{":LINE6","ENTER"}}}, {12,{}} }
_G.init = false
_G.frame_sub = emu.add_machine_frame_notifier(function()
  local f = manager.machine.screens[":screen"]:frame_number()
  local cpu = manager.machine.devices[":maincpu"]
  local prog = cpu.spaces["program"]
  if not _G.init then
    _G.init = true
    _G.t2 = cpu.spaces["opcodes"]:install_read_tap(0xE2A8,0xE2A8,"diver",
      function(o,d) _G.dtot=_G.dtot+1 return d end)
  end
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
  if _G.dtot > _G.dmark then _G.dmark = _G.dtot; _G.seen = f end
  local ingame = (f - _G.seen) <= 60 and _G.dtot > 0
  if not ingame then
    hold(":LINE7","SPACE",false)
    hold(":LINE3", DIG, (f % 90) < 10)
    _G.gs = nil
    return
  end
  hold(":LINE3", DIG, false)
  if not _G.gs then _G.gs = f end
  hold(":LINE7","SPACE",true)
  local d = math.floor((f - _G.gs) / 300) % 16
  prog:write_u8(0xE341, d)                 -- DiverObj+6 = направление
  if (f % 100) == 0 then
    print(string.format("кадр %6d dir=%2d  мини-карта строка=%02x столбец=%02x  карта256 строка=%02x столбец=%02x  жизни=%d",
      f, d, prog:read_u8(0x5B04), prog:read_u8(0x5B03),
      prog:read_u8(0x5B0C), prog:read_u8(0x5B0B), prog:read_u8(0x5B37)))
  end
  if f > GS + 5000 then manager.machine:exit() end
end)
