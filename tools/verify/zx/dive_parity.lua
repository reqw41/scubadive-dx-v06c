-- ДАЙВЕР В ZX-ОРИГИНАЛЕ: клеток/с и смен угла/с на погружении, окно длинное за счёт
-- «бессмертия» — каждый кадр доливаем кислород (0xDE5B) и держим жизни (0x5B37).
-- Гибель от рельефа всё равно возможна: окно обрывается, длина печатается.
--   SD_LEVEL=1 mame spectrum ... -autoboot_script tools/verify/zx/dive_parity.lua
local function hold(pt, pre, on) local p = manager.machine.ioport.ports[pt]
  for n, fld in pairs(p.fields) do if n:sub(1,#pre)==pre then fld:set_value(on and 1 or 0) return end end end
local LEVEL = tonumber(os.getenv("SD_LEVEL") or "1"); local DIG = tostring(LEVEL)
local WIN   = tonumber(os.getenv("SD_WIN") or "2200")   -- кадров в окне
_G.step,_G.t,_G.dtot,_G.dmark,_G.seen,_G.gs = 0,0,0,0,0,nil
_G.script = { {250,{}}, {12,{{":LINE6","j"}}}, {12,{}}, {12,{{":LINE7","SYMBOL SHIFT"},{":LINE5","p"}}}, {12,{}},
  {12,{{":LINE7","SYMBOL SHIFT"},{":LINE5","p"}}}, {12,{}}, {12,{{":LINE6","ENTER"}}}, {12,{}} }
_G.init=false; _G.tick=0; _G.cells=0; _G.turns=0; _G.pc=nil; _G.pa=nil; _G.f0=nil; _G.done=false
_G.rowchk=nil; _G.rot=nil
_G.frame_sub = emu.add_machine_frame_notifier(function()
  local f = manager.machine.screens[":screen"]:frame_number(); local cpu = manager.machine.devices[":maincpu"]
  if not _G.init then _G.init=true
    _G.t1 = cpu.spaces["opcodes"]:install_read_tap(0xB213,0xB213,"t",function(o,d) _G.tick=_G.tick+1 return d end)
    _G.t2 = cpu.spaces["opcodes"]:install_read_tap(0xE2A8,0xE2A8,"d",function(o,d) _G.dtot=_G.dtot+1 return d end) end
  if _G.step < #_G.script then local e=_G.script[_G.step+1]
    for _,k in ipairs(e[2]) do hold(k[1],k[2],true) end; _G.t=_G.t+1
    if _G.t>=e[1] then for _,k in ipairs(e[2]) do hold(k[1],k[2],false) end; _G.step=_G.step+1; _G.t=0
      if _G.step==#_G.script then for tag,c in pairs(manager.machine.cassettes) do c:play() end end end return end
  if f < 13000 or _G.done then return end
  local prog = cpu.spaces["program"]
  if _G.dtot > _G.dmark then _G.dmark=_G.dtot; _G.seen=f end
  if (f-_G.seen)>60 or _G.dtot==0 then
    if _G.f0 then print(string.format("окно оборвано на %.0f с (гибель/конец игры)", (f-_G.f0)/50)); _G.f0=nil end
    hold(":LINE7","SPACE",false); hold(":LINE0","x",false); hold(":LINE3",DIG,(f%90)<10); _G.gs=nil; return end
  hold(":LINE3",DIG,false); if not _G.gs then _G.gs=f end
  -- «бессмертие»: кислород полный, жизней три
  prog:write_u8(0xDE5B, 0xFF); prog:write_u8(0xDE5C, 0xFF); prog:write_u8(0x5B37, 3)
  local row = prog:read_u8(0x5B04)
  if not _G.rowchk then _G.rowprev, _G.rowchk = row, f end
  hold(":LINE7","SPACE", true)
  hold(":LINE0","x", _G.rot ~= nil and f < _G.rot)
  if f - _G.rowchk >= 60 then
    if row <= _G.rowprev then _G.rot = f + 25 end
    _G.rowprev, _G.rowchk = row, f
  end
  if f - _G.gs < 200 then return end
  local D = 0xE33B
  local c = prog:read_u8(D+1)*256 + prog:read_u8(D+2)
  local a = prog:read_u8(D+6)
  if not _G.f0 then _G.f0=f; _G.tick=0; _G.pc=c; _G.pa=a; return end
  if c ~= _G.pc then _G.cells = _G.cells + 1 end; _G.pc = c
  if a ~= _G.pa then _G.turns = _G.turns + 1 end; _G.pa = a
  if f - _G.f0 >= WIN then
    local s=(f-_G.f0)/50
    print(string.format("ZX ур.%d: тиков/с %.1f, клеток/с %.1f, смен угла/с %.1f (окно %.0f с)",
      LEVEL, _G.tick/s, _G.cells/s, _G.turns/s, s))
    _G.done=true; manager.machine:exit()
  end
end)
