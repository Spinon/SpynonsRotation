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
function Settings.Create()
  local model, values, listeners = {}, copy(defaults), {}
  function model.Get(_) return copy(values) end
  function model.Set(_, key, value)
    if not Settings.IsValue(key, value) then return false end
    if values[key] == value then return true end
    values[key] = value
    local pending = {}; for listener in pairs(listeners) do pending[#pending + 1] = listener end
    for _, listener in ipairs(pending) do if listeners[listener] then listener(copy(values)) end end
    return true
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
