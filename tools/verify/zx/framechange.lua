-- СМЕНА КАДРА АНИМАЦИИ + СКОРОСТЬ В ZX-ОРИГИНАЛЕ (MAME). Отличие от
-- creature_speed.lua: дополнительно считаем, как часто МЕНЯЕТСЯ указатель кадра
-- (+0B/0C записи) — это то, что видит игрок как взмах плавника, в отличие от
-- числа перерисовок (их считает anim_rate и они привязаны к тику). Ввод/старт игры — как в
-- tempo_game.lua. Каждый кадр читаем записи группы I (LC4F0=0xC4F0, счёт 0x5B15,
-- 21 байт: col,row,sx,sy — позиция в пикселях col*8+sx, row*8+sy) и ныряльщика
-- (DiverObj=0xE33B: +1/+2 клетка, +$13/$14 значение, +$15/$16 сдвиг 0..7) и
-- копим смещения; раз в 5 с печатаем px/с и событий/с.
--   SD_LEVEL=1 SD_WINDOWS=6 mame spectrum -rompath R -cass tape -autoboot_script this.lua -nothrottle -video none -sound none
local function hold(porttag, prefix, on)
  -- имя поля MAME длиннее клавиши («j  LOAD»): ищем по префиксу, как zxload.lua
  local port = manager.machine.ioport.ports[porttag]
  for n, f in pairs(port.fields) do if n:sub(1, #prefix) == prefix then f:set_value(on and 1 or 0) return end end
  error("нет поля " .. prefix .. " в " .. porttag)
end
local LEVEL = tonumber(os.getenv("SD_LEVEL") or "1")
local GS    = tonumber(os.getenv("SD_MENU_FRAME") or "13000")
local WINS  = tonumber(os.getenv("SD_WINDOWS") or "6")
local WARM  = tonumber(os.getenv("SD_WARMUP") or "250")
local DIG   = tostring(LEVEL)
_G.step,_G.t = 0,0
_G.dtot,_G.dmark,_G.seen = 0,0,0
_G.win,_G.wstart,_G.games = 0,nil,0
_G.script = { {250,{}}, {12,{{":LINE6","j"}}}, {12,{}},
  {12,{{":LINE7","SYMBOL SHIFT"},{":LINE5","p"}}}, {12,{}},
  {12,{{":LINE7","SYMBOL SHIFT"},{":LINE5","p"}}}, {12,{}},
  {12,{{":LINE6","ENTER"}}}, {12,{}} }
_G.init = false
_G.prevpos, _G.prevdiv = {}, nil
_G.acc = {cpx=0, cev=0, cmov={}, dpx=0, dev=0, dcell=0, frames=0, ch={}, dh={}, ty={}}
_G.frame_sub = emu.add_machine_frame_notifier(function()
  local f = manager.machine.screens[":screen"]:frame_number()
  local cpu = manager.machine.devices[":maincpu"]
  if not _G.init then
    _G.init = true
    local op = cpu.spaces["opcodes"]
    _G.t2 = op:install_read_tap(0xE2A8,0xE2A8,"diver",function(o,d) _G.dtot=_G.dtot+1 return d end)
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
    if _G.wstart then print(string.format("кадр %6d: игра кончилась, окно отброшено", f)); _G.wstart = nil end
    hold(":LINE7", "SPACE", false); hold(":LINE0", "x", false)
    hold(":LINE3", DIG, (f % 90) < 10)
    _G.gamestart = nil; _G.prevpos = {}; _G.prevdiv = nil
    return
  end
  hold(":LINE3", DIG, false)
  if os.getenv("SD_OXY") == "1" then   -- вечный кислород: окно замера не обрывается гибелью
    prog0 = cpu.spaces["program"]; prog0:write_u8(0xDE5B, 0xFF); prog0:write_u8(0xDE5C, 0xFF)
  end
  if not _G.gamestart then _G.gamestart = f; _G.games = _G.games + 1
    print(string.format("кадр %6d: игра #%d пошла (LEVEL=%d)", f, _G.games, cpu.spaces["program"]:read_u8(0x5B10))) end
  local ph = (f - _G.gamestart) % 400
  if os.getenv("SD_IDLE") ~= "1" then
    hold(":LINE7", "SPACE", ph < 250)
    hold(":LINE0", "x", ph >= 120 and ph < 170)
  end
  if f - _G.gamestart < WARM then return end
  local prog = cpu.spaces["program"]
  -- выборка позиций
  local n = prog:read_u8(0x5B15)
  local a = _G.acc
  for i = 0, n-1 do
    local b = 0xC4F0 + i*21
    local x = prog:read_u8(b)*8 + prog:read_u8(b+2)
    local y = prog:read_u8(b+1)*8 + prog:read_u8(b+3)
    local fp = prog:read_u8(b+11) + prog:read_u8(b+12)*256
    local p = _G.prevpos[i]
    if p and _G.wstart then
      local d = math.abs(x-p[1]) + math.abs(y-p[2])
      if d > 0 and d < 64 then a.cpx = a.cpx + d; a.cev = a.cev + 1; a.cmov[i] = true; a.ch[d] = (a.ch[d] or 0) + 1; local ty = string.format("%02x", prog:read_u8(b+0x0A)); local T = a.ty[ty] or {px=0, ev=0, ids={}}; a.ty[ty] = T; T.px = T.px + d; T.ev = T.ev + 1; T.ids[i] = true end
    end
    if p and _G.wstart and p[3] and fp ~= p[3] then a.fch = (a.fch or 0) + 1 end
    _G.prevpos[i] = {x, y, fp}
  end
  local D = 0xE33B
  local dx = prog:read_u8(D+0x13)*8 + prog:read_u8(D+0x15)
  local dy = prog:read_u8(D+0x14)*8 + prog:read_u8(D+0x16)
  local dc = prog:read_u8(D+1)*256 + prog:read_u8(D+2)
  if _G.prevdiv and _G.wstart then
    local d = math.abs(dx-_G.prevdiv[1]) + math.abs(dy-_G.prevdiv[2])
    if d > 0 and d < 64 then a.dpx = a.dpx + d; a.dev = a.dev + 1; a.dh[d] = (a.dh[d] or 0) + 1 end
    if dc ~= _G.prevdiv[3] then a.dcell = a.dcell + 1 end
  end
  _G.prevdiv = {dx, dy, dc}
  if not _G.wstart then _G.wstart = f; return end
  a.frames = a.frames + 1
  if f - _G.wstart >= 250 then
    _G.win = _G.win + 1
    local nm = 0; for _ in pairs(a.cmov) do nm = nm + 1 end
    local s = a.frames/50
    print(string.format("окно %d: существ гр.I %d, двигались %d: %6.1f px/с всего, %5.1f px/с на существо, %5.1f шагов/с на существо | ныряльщик %5.1f px/с, %5.1f шагов/с, клетка %4.1f смен/с",
      _G.win, n, nm, a.cpx/s, nm>0 and a.cpx/s/nm or 0, nm>0 and a.cev/s/nm or 0, a.dpx/s, a.dev/s, a.dcell/s))
    local function hist(h) local s = {} for k, v in pairs(h) do s[#s+1] = string.format("%2dpx:%d", k, v) end table.sort(s) return table.concat(s, " ") end
    print(string.format("   СМЕН КАДРА АНИМАЦИИ: %.2f в секунду на существо (всего %d за %.1f с)", (a.fch or 0)/s/n, a.fch or 0, s))
    print("   шаги существ по длине: " .. hist(a.ch) .. " | шаги ныряльщика: " .. hist(a.dh))
    local parts = {}
    for k, T in pairs(a.ty) do local c = 0 for _ in pairs(T.ids) do c = c + 1 end parts[#parts+1] = string.format("%s: %d шт, %.1f px/с, %.1f шаг/с", k, c, T.px/s/c, T.ev/s/c) end
    table.sort(parts); print("   по типам (страница спрайта): " .. table.concat(parts, " | "))
    _G.wstart = f; _G.acc = {cpx=0, cev=0, cmov={}, dpx=0, dev=0, dcell=0, frames=0, ch={}, dh={}, ty={}}
    if _G.win >= WINS then manager.machine:exit() end
  end
end)
