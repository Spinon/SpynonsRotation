local _, Spynon = ...
local Binding = {}
function Binding.Create(settings, profiles, canEdit)
  local adapter = {}
  local history
  local committed = settings:Get()
  local function copy(value)
    local result = {}; for key, item in pairs(value) do result[key] = item end; return result
  end
  function adapter.CanEdit(_) return canEdit() end
  function adapter.Capture(_)
    if profiles then return profiles:Capture() end
    return { values = copy(committed) }
  end
  function adapter.Values(_) return settings:Get() end
  function adapter.PreviewReset(_, keys)
    if profiles then return profiles:PreviewReset(keys) end
    local value, defaults = copy(committed), settings:GetDefaults()
    for key in pairs(keys) do value[key] = defaults[key] end
    return value
  end
  function adapter.ResetFields(_, keys, expected, preview)
    if profiles then return profiles:ResetFields(keys, expected, preview) end
    return adapter:Restore({values=preview}, expected)
  end
  function adapter.Preview(_, values) return settings:Replace(values) end
  function adapter.Refresh(_)
    if profiles then profiles:Refresh() else settings:Replace(committed) end
    return true
  end
  function adapter.Apply(_, expected, changes)
    if profiles then return profiles:Apply(expected, changes) end
    if not Spynon.HistoryFactory.Equal(adapter:Capture(), expected) then return false end
    local value = copy(committed)
    for key, item in pairs(changes) do value[key] = item end
    if not Spynon.SettingsFactory.Validate(value) then return false end
    committed = value; return settings:Replace(value)
  end
  function adapter.Restore(_, target, expected)
    if profiles then return profiles:Restore(target, expected) end
    if not Spynon.HistoryFactory.Equal(adapter:Capture(), expected)
      or type(target) ~= "table" or not Spynon.SettingsFactory.Validate(target.values) then return false end
    committed = copy(target.values); return settings:Replace(committed)
  end
  history = Spynon.HistoryFactory.Create(adapter)
  if profiles then profiles:Subscribe(function() history:Invalidate() end)
  else settings:Subscribe(function(value)
    if not history:IsInternal() then committed = copy(value); history:Invalidate() end
  end) end
  return history
end
Spynon.HistoryBinding = Binding
