_G.done = false
_G.sub = emu.add_machine_frame_notifier(function()
  if _G.done then return end
  _G.done = true
  for ptag, port in pairs(manager.machine.ioport.ports) do
    local names = {}
    for ftag, field in pairs(port.fields) do names[#names+1] = ftag end
    table.sort(names)
    print(ptag .. " : " .. table.concat(names, " | "))
  end
  manager.machine:exit()
end)
