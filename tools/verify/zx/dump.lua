-- СНЯТЬ ДАМП ПАМЯТИ ОРИГИНАЛА В МЕНЮ.
-- Грузим ленту тем же скриптом, что и tempo.lua, ждём меню и пишем 0x4000..0xFFFF
-- в файл, чтобы дизассемблировать опрос клавиатуры (z80dasm) и узнать раскладку.
local function field(pt, pre)
  for n, f in pairs(manager.machine.ioport.ports[pt].fields) do
    if n:sub(1,#pre) == pre then return f end end
  return nil
end
local OUT = os.getenv("SD_DUMP") or "/tmp/scuba_menu.bin"
local AT  = tonumber(os.getenv("SD_DUMP_FRAME") or "13000")
_G.step,_G.t = 0,0
_G.script = { {250,{}}, {12,{{":LINE6","j"}}}, {12,{}},
  {12,{{":LINE7","SYMBOL SHIFT"},{":LINE5","p"}}}, {12,{}},
  {12,{{":LINE7","SYMBOL SHIFT"},{":LINE5","p"}}}, {12,{}},
  {12,{{":LINE6","ENTER"}}}, {12,{}} }
_G.done = false
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
  if f >= AT and not _G.done then
    _G.done = true
    local prog = manager.machine.devices[":maincpu"].spaces["program"]
    local fh = assert(io.open(OUT, "wb"))
    local buf = {}
    for a = 0x4000, 0xFFFF do
      buf[#buf+1] = string.char(prog:read_u8(a))
      if #buf == 4096 then fh:write(table.concat(buf)); buf = {} end
    end
    if #buf > 0 then fh:write(table.concat(buf)) end
    fh:close()
    print(string.format("ДАМП: кадр %d, PC=%04x, файл %s", f,
      manager.machine.devices[":maincpu"].state["PC"].value, OUT))
    -- контроль редакции
    local s = ""
    for a = 0xD9C0, 0xD9C8 do s = s .. string.format("%02x ", prog:read_u8(a)) end
    print("0xD9C0: " .. s)
    manager.machine:exit()
  end
end)
