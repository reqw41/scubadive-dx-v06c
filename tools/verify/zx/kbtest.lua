-- Доходит ли нажатие до порта 0xFE? Держим J (LINE6) постоянно и читаем строку
-- клавиатуры глазами процессора: адрес 0xBFFE выбирает полуряд ENTER,L,K,J,H.
-- Бит 3 = J, активный ноль. Заодно смотрим системную переменную LAST-K (0x5C08).
local function field(porttag, prefix)
  local port = manager.machine.ioport.ports[porttag]
  for name, f in pairs(port.fields) do
    if name:sub(1, #prefix) == prefix then return f end
  end
  error("нет поля " .. prefix)
end
_G.prev = 0
_G.frame_sub = emu.add_machine_frame_notifier(function()
  local f = manager.machine.screens[":screen"]:frame_number()
  if f > 200 then field(":LINE6", "j"):set_value(1) end
  if f - _G.prev >= 100 then
    _G.prev = f
    local cpu = manager.machine.devices[":maincpu"]
    local io = cpu.spaces["io"]
    local prog = cpu.spaces["program"]
    print(string.format("кадр %5d  строка 0xBFFE=%02x  LAST-K(0x5C08)=%02x  PC=%04x  держим J=%s",
      f, io:read_u8(0xBFFE), prog:read_u8(0x5C08), cpu.state["PC"].value, tostring(f > 200)))
  end
  if f > 700 then manager.machine:exit() end
end)
