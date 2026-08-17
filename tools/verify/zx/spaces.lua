_G.done=false
_G.sub = emu.add_machine_frame_notifier(function()
  if _G.done then return end
  _G.done = true
  local cpu = manager.machine.devices[":maincpu"]
  for name, sp in pairs(cpu.spaces) do print("пространство: " .. name) end
  -- пробуем поставить tap на opcodes, если оно есть
  local ok, err = pcall(function()
    _G.t = cpu.spaces["opcodes"]:install_read_tap(0x0000,0x0000,"x",function(o,d) return d end)
  end)
  print("tap на opcodes: " .. tostring(ok) .. " " .. tostring(err))
  print("методы debug: " .. tostring(cpu.debug))
  manager.machine:exit()
end)
