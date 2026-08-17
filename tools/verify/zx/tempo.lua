-- ЗАМЕР ТЕМПА ZX-ОРИГИНАЛА. Считаем LB213 (0xB213) — он вызывается ровно раз за
-- итерацию и в игровом цикле LD9C0, и в демо-режиме LEF12, то есть это тик в обоих.
-- Отдельно считаем LE2A8 (0xE2A8, обработка ныряльщика): он есть только в
-- настоящей игре, по нему видно, демо перед нами или игра.
local function field(pt, pre)
  for n, f in pairs(manager.machine.ioport.ports[pt].fields) do
    if n:sub(1,#pre) == pre then return f end end
  return nil
end
_G.step,_G.t,_G.tick,_G.diver,_G.prev = 0,0,0,0,0
_G.script = { {250,{}}, {12,{{":LINE6","j"}}}, {12,{}},
  {12,{{":LINE7","SYMBOL SHIFT"},{":LINE5","p"}}}, {12,{}},
  {12,{{":LINE7","SYMBOL SHIFT"},{":LINE5","p"}}}, {12,{}},
  {12,{{":LINE6","ENTER"}}}, {12,{}} }
_G.reset_sub = emu.add_machine_reset_notifier(function()
  -- ВАЖНО: tap ставим в пространство "opcodes", а не "program". У Z80 в MAME
  -- опкодная выборка идёт через отдельное пространство, и пассивный tap на
  -- program её НЕ ВИДИТ — счётчик молчал именно поэтому.
  local mem = manager.machine.devices[":maincpu"].spaces["opcodes"]
  _G.t1 = mem:install_read_tap(0xB213,0xB213,"tick", function(o,d) _G.tick=_G.tick+1 return d end)
  _G.t2 = mem:install_read_tap(0xE2A8,0xE2A8,"diver",function(o,d) _G.diver=_G.diver+1 return d end)
end)
_G.frame_sub = emu.add_machine_frame_notifier(function()
  local f = manager.machine.screens[":screen"]:frame_number()
  if _G.step < #_G.script then
    local e = _G.script[_G.step+1]
    for _,k in ipairs(e[2]) do local x=field(k[1],k[2]); if x then x:set_value(1) end end
    _G.t = _G.t + 1
    if _G.t >= e[1] then
      for _,k in ipairs(e[2]) do local x=field(k[1],k[2]); if x then x:set_value(0) end end
      _G.step = _G.step + 1; _G.t = 0
      if _G.step == #_G.script then for tag,c in pairs(manager.machine.cassettes) do c:play() end end
    end
    return
  end
  -- периодически бьём по клавише "m" (ей меню реагировало) и по пробелу
  if f > 13000 then
    local k = (math.floor(f/500) % 2 == 0) and field(":LINE7","m") or field(":LINE7","SPACE")
    if k then k:set_value((f % 500) < 30 and 1 or 0) end
  end
  if f - _G.prev >= 250 and f > 12500 then
    _G.prev = f
    print(string.format("кадры %6d..%6d (5 с): тик %5d = %6.1f/с | ныряльщик %5d = %6.1f/с | PC=%04x",
      f-250, f, _G.tick, _G.tick/5.0, _G.diver, _G.diver/5.0,
      manager.machine.devices[":maincpu"].state["PC"].value))
    _G.tick, _G.diver = 0, 0
  end
end)
