-- СКОЛЬКО СЕКУНД ДЫШИТ НЫРЯЛЬЩИК В ZX-ОРИГИНАЛЕ. OXYGEN = 0xDE5B (слово),
-- DiverObj = 0xE33B (+0x10 бит 7 — в воде), тик — опкод по 0xB213.
--   SD_LEVEL=1 mame spectrum ... -autoboot_script this.lua
local function hold(pt, pre, on) local p = manager.machine.ioport.ports[pt]
  for n, fld in pairs(p.fields) do if n:sub(1,#pre)==pre then fld:set_value(on and 1 or 0) return end end end
local LEVEL = tonumber(os.getenv("SD_LEVEL") or "1"); local DIG = tostring(LEVEL)
_G.step,_G.t,_G.dtot,_G.dmark,_G.seen,_G.gs = 0,0,0,0,0,nil
_G.script = { {250,{}}, {12,{{":LINE6","j"}}}, {12,{}}, {12,{{":LINE7","SYMBOL SHIFT"},{":LINE5","p"}}}, {12,{}},
  {12,{{":LINE7","SYMBOL SHIFT"},{":LINE5","p"}}}, {12,{}}, {12,{{":LINE6","ENTER"}}}, {12,{}} }
_G.init=false; _G.tick=0; _G.rowchk=nil; _G.rot_until=nil; _G.inw=0; _G.drop=0; _G.n=0; _G.prev=nil; _G.f0=nil; _G.done=false
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
  if _G.dtot > _G.dmark then _G.dmark=_G.dtot; _G.seen=f end
  if (f-_G.seen)>60 or _G.dtot==0 then hold(":LINE7","SPACE",false); hold(":LINE3",DIG,(f%90)<10); _G.gs=nil; return end
  hold(":LINE3",DIG,false); if not _G.gs then _G.gs=f end
  local ph = f - _G.gs
  local prog = cpu.spaces["program"]
  -- автопилот погружения: тяга всегда, доворот если строка мини-карты не растёт
  local row = prog:read_u8(0x5B04)
  if not _G.rowchk then _G.rowprev, _G.rowchk = row, f end
  hold(":LINE7","SPACE", true)
  hold(":LINE0","x", _G.rot_until ~= nil and f < _G.rot_until)
  if f - _G.rowchk >= 60 then
    if row <= _G.rowprev then _G.rot_until = f + 25 end
    _G.rowprev, _G.rowchk = row, f
  end
  if ph < 300 then return end
  local o = prog:read_u8(0xDE5B) + prog:read_u8(0xDE5C)*256
  local w = (prog:read_u8(0xE33B+0x10) >> 7) & 1
  if not _G.f0 then _G.f0=f; _G.prev=o; _G.tick=0; return end
  if w==1 then _G.inw=_G.inw+1 end
  if w==1 and _G.prev and o < _G.prev and _G.prev-o < 4000 then _G.drop=_G.drop+(_G.prev-o); _G.n=_G.n+1 end
  _G.prev=o
  if f-_G.f0 >= 900 then
    local s=(f-_G.f0)/50; local per=LEVEL*8+10
    print(string.format("ZX уровень %d: убыль %.0f ед/с (%d за тик) -> баллон 65535 ед = %.1f с; тиков/с %.1f, под водой %d %%",
      LEVEL, _G.drop/s, per, 65535/(_G.drop/s), _G.tick/s, math.floor(100*_G.inw/(f-_G.f0))))
    _G.done=true; manager.machine:exit()
  end
end)
