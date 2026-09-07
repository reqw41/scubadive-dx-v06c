-- НОРМИРОВАННАЯ СКОРОСТЬ СУЩЕСТВ В ZX-ОРИГИНАЛЕ, ВСЕ ГРУППЫ I..V.
-- Раскладка та же, что в порту (метки = адреса ZX): записи гр.I по 21 байту с
-- 0xC4F0, гр.II..IV по 26 байт по адресам из 0x5B1F/0x5B21/0x5B23, гр.V по 28
-- байт сразу за гр.IV; счётчики 0x5B15..0x5B19; описатель — 19-й байт записи;
-- (+0)=столбец, (+1)=строка, (+2)/(+3)=сдвиг; экран на карте 256x256 — 0x5B0B.
-- Кислород доливаем, чтобы окно не обрывалось гибелью.
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
_G.init=false; _G.acc={}; _G.prev={}; _G.f0=nil; _G.done=false; _G.rowchk=nil; _G.rot=nil
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
  if (f-_G.seen)>60 or _G.dtot==0 then hold(":LINE7","SPACE",false); hold(":LINE0","x",false)
    hold(":LINE3",DIG,(f%90)<10); _G.gs=nil; return end
  hold(":LINE3",DIG,false); if not _G.gs then _G.gs=f end
  prog:write_u8(0xDE5B,0xFF); prog:write_u8(0xDE5C,0xFF); prog:write_u8(0x5B37,3)
  local row=prog:read_u8(0x5B04)
  if not _G.rowchk then _G.rowprev,_G.rowchk=row,f end
  hold(":LINE7","SPACE",true); hold(":LINE0","x",_G.rot~=nil and f<_G.rot)
  if f-_G.rowchk>=60 then if row<=_G.rowprev then _G.rot=f+25 end; _G.rowprev,_G.rowchk=row,f end
  if f-_G.gs<200 then return end
  if not _G.f0 then _G.f0=f; _G.acc={}; _G.prev={}; return end
  local function W(a) return prog:read_u8(a)+prog:read_u8(a+1)*256 end
  local b4=W(0x5B23); local n4=prog:read_u8(0x5B18)
  local gs={ {0xC4F0,21,prog:read_u8(0x5B15)}, {W(0x5B1F),26,prog:read_u8(0x5B16)},
             {W(0x5B21),26,prog:read_u8(0x5B17)}, {b4,26,n4}, {b4+26*n4,28,prog:read_u8(0x5B19)} }
  local scol,srow=prog:read_u8(0x5B0B),prog:read_u8(0x5B0C)
  for _,gr in ipairs(gs) do local base,sz,n=gr[1],gr[2],gr[3]
    if base>=0x4000 and base<0xFF00 and n>0 and n<200 then
      for i=0,n-1 do local r=base+i*sz
        local col,rw=prog:read_u8(r),prog:read_u8(r+1)
        local dc,dr=(col-scol)%256,(rw-srow)%256
        local key=base.."/"..i
        if dc>=36 or dr>=24 then _G.prev[key]=nil else
          local t=NAME[W(r+19)]
          if t then
            local x,y=col*8+prog:read_u8(r+2), rw*8+prog:read_u8(r+3)
            local A=_G.acc[t]; if not A then A={fr=0,steps=0,px=0,ids={}}; _G.acc[t]=A end
            A.fr=A.fr+1; A.ids[key]=true
            local p=_G.prev[key]
            if p then local d=math.abs(x-p[1])+math.abs(y-p[2])
              if d>0 and d<64 then A.steps=A.steps+1; A.px=A.px+d end end
            _G.prev[key]={x,y}
          end
        end
      end
    end
  end
  if f-_G.f0>=WIN then
    local s=(f-_G.f0)/50
    print(string.format("ZX уровень %d, окно %.0f с:",LEVEL,s))
    print(string.format("  лодка: период (+0E)=%d счётчик (+0F)=%d, описатель LC092+0C=%d",
      prog:read_u8(0xC4F0+0x0E), prog:read_u8(0xC4F0+0x0F), prog:read_u8(0xC092+0x0C)))
    local rows={}
    for t,A in pairs(_G.acc) do local c=0 for _ in pairs(A.ids) do c=c+1 end
      rows[#rows+1]={t,A.fr/50,A.steps/(A.fr/50),A.px/(A.fr/50),c} end
    table.sort(rows,function(a,b) return a[2]>b[2] end)
    for _,r in ipairs(rows) do
      print(string.format("  %-17s %.2f шаг/с  %.1f px/с  (на экране %.0f существо-с, разных %d)",r[1],r[3],r[4],r[2],r[5])) end
    _G.done=true; manager.machine:exit()
  end
end)
