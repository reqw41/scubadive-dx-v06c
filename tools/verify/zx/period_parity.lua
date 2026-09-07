-- ПЕРИОДЫ СКОРОСТИ ПО ТИПАМ В ZX-ОРИГИНАЛЕ (см. period_parity.js). Снимок сразу
-- после старта партии: раскладка записей та же, счётчики 0x5B15..0x5B19.
local function hold(pt,pre,on) local p=manager.machine.ioport.ports[pt]
  for n,f in pairs(p.fields) do if n:sub(1,#pre)==pre then f:set_value(on and 1 or 0) return end end end
local LEVEL=tonumber(os.getenv("SD_LEVEL") or "1"); local DIG=tostring(LEVEL)
local NAME={[0xC092]="лодка",[0xC0A2]="медуза",[0xC0B2]="круглая рыба",[0xC0EA]="рыба",[0xC102]="акула",
  [0xC11A]="длинная рыба",[0xC14A]="кальмар малый г.",[0xC166]="кальмар малый в.",[0xC182]="угорь г.",
  [0xC19E]="угорь в.",[0xC1BA]="змейка г.",[0xC1D6]="змейка в.",[0xC1F2]="кальмар",
  [0xC0CE]="LC0CE",[0xC132]="LC132"}
_G.step,_G.t,_G.dtot,_G.dmark,_G.seen,_G.gs=0,0,0,0,0,nil
_G.script={ {250,{}}, {12,{{":LINE6","j"}}}, {12,{}}, {12,{{":LINE7","SYMBOL SHIFT"},{":LINE5","p"}}}, {12,{}},
  {12,{{":LINE7","SYMBOL SHIFT"},{":LINE5","p"}}}, {12,{}}, {12,{{":LINE6","ENTER"}}}, {12,{}} }
_G.init=false; _G.done=false
_G.frame_sub=emu.add_machine_frame_notifier(function()
  local f=manager.machine.screens[":screen"]:frame_number(); local cpu=manager.machine.devices[":maincpu"]
  local prog=cpu.spaces["program"]
  if not _G.init then _G.init=true
    _G.t3=cpu.spaces["opcodes"]:install_read_tap(0xE2A8,0xE2A8,"d",function(o,d) _G.dtot=_G.dtot+1 return d end) end
  if _G.step<#_G.script then local e=_G.script[_G.step+1]
    for _,k in ipairs(e[2]) do hold(k[1],k[2],true) end; _G.t=_G.t+1
    if _G.t>=e[1] then for _,k in ipairs(e[2]) do hold(k[1],k[2],false) end; _G.step=_G.step+1; _G.t=0
      if _G.step==#_G.script then for tag,c in pairs(manager.machine.cassettes) do c:play() end end end return end
  if f<13000 or _G.done then return end
  if _G.dtot>_G.dmark then _G.dmark=_G.dtot; _G.seen=f end
  if (f-_G.seen)>60 or _G.dtot==0 then hold(":LINE3",DIG,(f%90)<10); _G.gs=nil; return end
  hold(":LINE3",DIG,false); if not _G.gs then _G.gs=f end
  if f-_G.gs<60 then return end
  local function W(a) return prog:read_u8(a)+prog:read_u8(a+1)*256 end
  local b4=W(0x5B23); local n4=prog:read_u8(0x5B18)
  local gs={ {0xC4F0,21,prog:read_u8(0x5B15)}, {W(0x5B1F),26,prog:read_u8(0x5B16)},
             {W(0x5B21),26,prog:read_u8(0x5B17)}, {b4,26,n4}, {b4+26*n4,28,prog:read_u8(0x5B19)} }
  local per={}
  for _,gr in ipairs(gs) do local base,sz,n=gr[1],gr[2],gr[3]
    if base>=0x4000 and base<0xFF00 and n>0 and n<200 then
      for i=0,n-1 do local r=base+i*sz; local t=NAME[W(r+19)]
        if t then local p=prog:read_u8(r+0x0E)
          per[t]=per[t] or {}; per[t][p]=(per[t][p] or 0)+1 end end end end
  print(string.format("ZX уровень %d: задержка осьминога (0x5B0E)=%d, задержка группы (0x5B0D)=%d",
    LEVEL, prog:read_u8(0x5B0E), prog:read_u8(0x5B0D)))
  print(string.format("ZX уровень %d: период (+0E) -> сколько существ",LEVEL))
  local names={} for t in pairs(per) do names[#names+1]=t end table.sort(names)
  for _,t in ipairs(names) do
    local ks={} for p in pairs(per[t]) do ks[#ks+1]=p end table.sort(ks)
    local s={} for _,p in ipairs(ks) do s[#s+1]=string.format("%dx%d",p,per[t][p]) end
    print(string.format("  %-17s %s",t,table.concat(s," "))) end
  _G.done=true; manager.machine:exit()
end)
