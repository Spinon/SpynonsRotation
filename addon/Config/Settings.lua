local _, Spynon = ...
local Settings = {}
local defaults = { count = 4, scale = 1, direction = "STACKED", motion = "NORMAL",
  keys = "compact", numbers = true, indicators = true }
local choices = { count = { 1, 2, 3, 4 }, scale = { 0.75, 1, 1.25 },
  direction = { "STACKED", "RIGHT", "LEFT" }, motion = { "NORMAL", "REDUCED", "OFF" },
  keys = { "compact", "full", "off" }, numbers = { true, false }, indicators = { true, false } }
local function copy(source)
  local result = {}; for key, value in pairs(source) do result[key] = value end; return result
end
function Settings.IsValue(key, value)
  for _, candidate in ipairs(choices[key] or {}) do if candidate == value then return true end end
  return false
end
function Settings.Validate(value)
  if type(value) ~= "table" then return false end
  for key, item in pairs(value) do if not Settings.IsValue(key, item) then return false end end
  for key in pairs(defaults) do if value[key] == nil then return false end end
  return true
end
function Settings.Defaults() return copy(defaults) end
function Settings.Create()
  local model, values, listeners = {}, copy(defaults), {}
  local writer
  function model.Get(_) return copy(values) end
  function model.Replace(_, nextValues)
    if not Settings.Validate(nextValues) then return false end
    local changed = false
    for key, value in pairs(values) do if nextValues[key] ~= value then changed = true; break end end
    if not changed then return true end
    values = copy(nextValues)
    local pending = {}; for listener in pairs(listeners) do pending[#pending + 1] = listener end
    for _, listener in ipairs(pending) do if listeners[listener] then listener(copy(values)) end end
    return true
  end
  function model.Set(_, key, value)
    if not Settings.IsValue(key, value) then return false end
    if writer then return writer(key, value) end
    local nextValues = copy(values); nextValues[key] = value
    return model:Replace(nextValues)
  end
  function model.SetWriter(_, callback)
    assert(type(callback) == "function", "settings writer must be callable")
    writer = callback
  end
  function model.Subscribe(_, listener)
    assert(type(listener) == "function", "settings listener must be callable")
    listeners[listener] = true
    return function() listeners[listener] = nil end
  end
  return model
end
Spynon.SettingsFactory = Settings
Spynon.Settings = Settings.Create()
