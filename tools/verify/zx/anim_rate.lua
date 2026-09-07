-- ТЕМП АНИМАЦИИ ПО ТИПАМ В ZX-ОРИГИНАЛЕ. Тап на выборку опкода по 0xB3E9
-- (сборка кадра); чей тип — берём из регистра IY. Кислород доливаем, чтобы окно
-- не обрывалось гибелью. Печатает сборок/с по типам.
local function hold(pt,pre,on) local p=manager.machine.ioport.ports[pt]
  for n,f in pairs(p.fields) do if n:sub(1,#pre)==pre then f:set_value(on and 1 or 0) return end end end
local LEVEL=tonumber(os.getenv("SD_LEVEL") or "1"); local DIG=tostring(LEVEL)
local WIN=tonumber(os.getenv("SD_WIN") or "4000")
local NAME={[0xC092]="лодка",[0xC0A2]="медуза",[0xC0B2]="круглая рыба",[0xC0EA]="рыба",[0xC102]="акула",
  [0xC11A]="длинная рыба",[0xC14A]="кальмар малый г.",[0xC166]="кальмар малый в.",[0xC182]="угорь г.",
  [0xC19E]="угорь в.",[0xC1BA]="змейка г.",[0xC1D6]="змейка в.",[0xC1F2]="кальмар"}
_G.step,_G.t,_G.dtot,_G.dmark,_G.seen,_G.gs=0,0,0,0,0,nil
_G.script={ {250,{}}, {12,{{":LINE6","j"}}}, {12,{}}, {12,{{":LINE7","SYMBOL SHIFT"},{":LINE5","p"}}}, {12,{}},
  {12,{{":LINE7","SYMBOL SHIFT"},{":LINE5","p"}}}, {12,{}}, {12,{{":LINE6","ENTER"}}}, {12,{}} }
_G.init=false; _G.cnt={}; _G.oct=0; _G.f0=nil; _G.done=false; _G.rowchk=nil; _G.rot=nil
_G.frame_sub=emu.add_machine_frame_notifier(function()
  local f=manager.machine.screens[":screen"]:frame_number(); local cpu=manager.machine.devices[":maincpu"]
  if not _G.init then _G.init=true
    local op=cpu.spaces["opcodes"]
    _G.t1=op:install_read_tap(0xB3E9,0xB3E9,"anim",function(o,d)
      local iy=cpu.state["IY"].value; _G.cnt[iy]=(_G.cnt[iy] or 0)+1 return d end)
    _G.t2=op:install_read_tap(0xB346,0xB346,"oct",function(o,d) _G.oct=_G.oct+1 return d end)
    _G.t3=op:install_read_tap(0xE2A8,0xE2A8,"d",function(o,d) _G.dtot=_G.dtot+1 return d end) end
  if _G.step<#_G.script then local e=_G.script[_G.step+1]
    for _,k in ipairs(e[2]) do hold(k[1],k[2],true) end; _G.t=_G.t+1
    if _G.t>=e[1] then for _,k in ipairs(e[2]) do hold(k[1],k[2],false) end; _G.step=_G.step+1; _G.t=0
      if _G.step==#_G.script then for tag,c in pairs(manager.machine.cassettes) do c:play() end end end return end
  if f<13000 or _G.done then return end
  if _G.dtot>_G.dmark then _G.dmark=_G.dtot; _G.seen=f end
  if (f-_G.seen)>60 or _G.dtot==0 then hold(":LINE7","SPACE",false); hold(":LINE0","x",false)
    hold(":LINE3",DIG,(f%90)<10); _G.gs=nil; return end
  hold(":LINE3",DIG,false); if not _G.gs then _G.gs=f end
  local prog=cpu.spaces["program"]
  prog:write_u8(0xDE5B,0xFF); prog:write_u8(0xDE5C,0xFF); prog:write_u8(0x5B37,3)
  local row=prog:read_u8(0x5B04)
  if not _G.rowchk then _G.rowprev,_G.rowchk=row,f end
  hold(":LINE7","SPACE",true); hold(":LINE0","x",_G.rot~=nil and f<_G.rot)
  if f-_G.rowchk>=60 then if row<=_G.rowprev then _G.rot=f+25 end; _G.rowprev,_G.rowchk=row,f end
  if f-_G.gs<200 then return end
  if not _G.f0 then _G.f0=f; _G.cnt={}; _G.oct=0; return end
  if f-_G.f0>=WIN then
    local s=(f-_G.f0)/50; local rows={}
    for iy,n in pairs(_G.cnt) do rows[#rows+1]={NAME[iy] or string.format("?%04X",iy), n/s} end
    table.sort(rows,function(a,b) return a[2]>b[2] end)
    print(string.format("ZX уровень %d, окно %.0f с:",LEVEL,s))
    for _,r in ipairs(rows) do print(string.format("  %-18s %.1f сборок/с",r[1],r[2])) end
    print(string.format("  %-18s %.1f отрисовок/с","осьминог",_G.oct/s))
    _G.done=true; manager.machine:exit()
  end
end)
