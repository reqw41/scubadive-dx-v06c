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
-- ГЛАВНАЯ ГРАБЛЯ: emu.add_machine_reset_notifier НЕ срабатывает — autoboot_script
-- запускается уже ПОСЛЕ сброса машины, колбэк не зовётся никогда, и tap'ы просто
-- не ставились. Ставим их на первом же кадре. Пространство — "opcodes": у Z80 в
-- MAME выборка команды идёт через него, а не через "program".
_G.init = false
_G.frame_sub = emu.add_machine_frame_notifier(function()
  local f = manager.machine.screens[":screen"]:frame_number()
  if not _G.init then
    _G.init = true
    local op = manager.machine.devices[":maincpu"].spaces["opcodes"]
    _G.t1 = op:install_read_tap(0xB213,0xB213,"tick", function(o,d) _G.tick=_G.tick+1 return d end)
    _G.t2 = op:install_read_tap(0xE2A8,0xE2A8,"diver",function(o,d) _G.diver=_G.diver+1 return d end)
    _G.t3 = op:install_read_tap(0xD9C0,0xD9C0,"loop", function(o,d) _G.loop=(_G.loop or 0)+1 return d end)
    print("ЗОНД: tap на 0xB213 / 0xE2A8 / 0xD9C0 поставлены")
  end
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
  -- Жмём ОДИН раз и больше не трогаем: демо-режим выходит обратно в меню по
  -- ЛЮБОЙ клавише (в порте это MenuFromDemo), поэтому периодические нажатия
  -- держали игру в меню — PC так и стоял на 0xEE2F.
  if f > 13000 and f <= 13040 then
    local k = field(":LINE7","m"); if k then k:set_value(1) end
  elseif f > 13040 and f <= 13060 then
    local k = field(":LINE7","m"); if k then k:set_value(0) end
  end
  if f - _G.prev >= 250 and f > 12500 then
    _G.prev = f
    print(string.format("кадры %6d..%6d (5 с): тик %5d = %6.1f/с | ныряльщик %5d = %6.1f/с | PC=%04x",
      f-250, f, _G.tick, _G.tick/5.0, _G.diver, _G.diver/5.0,
      manager.machine.devices[":maincpu"].state["PC"].value) ..
      string.format("  LD9C0=%d", _G.loop or 0))
    _G.tick, _G.diver, _G.loop = 0, 0, 0
  end
end)
