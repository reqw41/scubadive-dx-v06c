-- РЕЦЕПТ ЗАГРУЗКИ ZX-ЛЕНТЫ В MAME БЕЗ natural keyboard (переиспользуемый).
-- autoboot_command и natkeyboard:post до Бейсика не доходили (PC оставался в
-- 0x15E1 — цикл ожидания клавиши). Дёргаем матрицу напрямую через ioport.
-- На 48К в режиме ключевых слов: J = LOAD, SYMBOL SHIFT + P = кавычка, ENTER.
-- ВАЖНО: все подписки держим в _G, иначе сборщик мусора снимает их через
-- несколько кадров (симптом «первая печать вышла, дальше тишина»).
local function field(porttag, prefix)
  local port = manager.machine.ioport.ports[porttag]
  for name, f in pairs(port.fields) do
    if name:sub(1, #prefix) == prefix then return f end
  end
  error("нет поля " .. prefix .. " в " .. porttag)
end
_G.step, _G.t, _G.hits, _G.sec, _G.prev = 0, 0, 0, 0, 0
-- сценарий: [кадров держать] {порт,поле} ...
-- ЗАМЕР: до кадра ~200 Бейсик клавиш не принимает (проверено kbtest.lua: при
-- нажатии с 200-го кадра строка 0xBFFE уходит bf->b7, LAST-K=0xEF = токен LOAD,
-- PC уходит в печать). Раньше я жал с 40-го — отсюда четыре «неудачных» пути ввода.
_G.script = {
  {250, {}},                                    -- дать Бейсику проснуться
  {12,  {{":LINE6","j"}}},                      -- LOAD
  {12,  {}},
  {12,  {{":LINE7","SYMBOL SHIFT"},{":LINE5","p"}}},  -- "
  {12,  {}},
  {12,  {{":LINE7","SYMBOL SHIFT"},{":LINE5","p"}}},  -- "
  {12,  {}},
  {12,  {{":LINE6","ENTER"}}},                  -- запуск
  {12,  {}},
}
_G.reset_sub = emu.add_machine_reset_notifier(function()
  local mem = manager.machine.devices[":maincpu"].spaces["program"]
  _G.tap = mem:install_read_tap(0xD9C0, 0xD9C0, "t", function(o,d) _G.hits=_G.hits+1 return d end)
end)
_G.frame_sub = emu.add_machine_frame_notifier(function()
  local f = manager.machine.screens[":screen"]:frame_number()
  local cpu = manager.machine.devices[":maincpu"]
  if cpu.state["PC"].value == 0xD9C0 then _G.hits = _G.hits + 1 end
  -- проигрывание сценария ввода
  if _G.step < #_G.script then
    local entry = _G.script[_G.step + 1]
    -- Выставляем КАЖДЫЙ кадр: система ввода MAME пересчитывает поля покадрово и
    -- затирает разовую установку — разовый set_value до машины не доезжает.
    for _, k in ipairs(entry[2]) do field(k[1], k[2]):set_value(1) end
    _G.t = _G.t + 1
    if _G.t >= entry[1] then
      for _, k in ipairs(entry[2]) do field(k[1], k[2]):set_value(0) end
      _G.step = _G.step + 1; _G.t = 0
      if _G.step == #_G.script then
        for tag, cass in pairs(manager.machine.cassettes) do cass:play() end
        print("ЗОНД: ввод завершён, лента пущена, кадр " .. f)
      end
    end
  end
  if f - _G.prev >= 250 then
    _G.prev = f; _G.sec = _G.sec + 5
    print(string.format("сек %3d PC=%04x (0xD9C0)=%02x тиков=%d", _G.sec,
      cpu.state["PC"].value, cpu.spaces["program"]:read_u8(0xD9C0), _G.hits))
    _G.hits = 0
  end
end)
