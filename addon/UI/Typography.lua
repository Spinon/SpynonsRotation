local _, Spynon = ...
local Typography = {}
function Typography.Resolve(values, role)
  local defaults, result = Spynon.SettingsFactory.Defaults(), {}
  for _, suffix in ipairs({"Font", "Size", "Outline", "Shadow"}) do
    local key = role .. suffix
    local value = values[key]
    if not Spynon.SettingsFactory.IsValue(key, value) or value == "INHERIT" then value = values["text" .. suffix] end
    if not Spynon.SettingsFactory.IsValue("text" .. suffix, value) then value = defaults["text" .. suffix] end
    result[suffix] = value
  end
  return result
end
function Typography.Bind(target, fallback, adapter)
  adapter = adapter or Spynon.Compat.Fonts
  local binding, lastFile, lastSize, lastFlags, lastShadow = {}, nil, nil, nil, nil
  local cachedValues, cachedRole, style
  function binding.Apply(_, values, role, baseSize)
    if values ~= cachedValues or role ~= cachedRole then
      style = Typography.Resolve(values, role); cachedValues, cachedRole = values, role
    end
    local file = adapter:Resolve(style.Font, fallback)
    local size = math.max(8, math.min(32, math.floor(baseSize * style.Size + 0.5)))
    local flags = style.Outline == "NONE" and "" or style.Outline
    if not file then return false end
    if file ~= lastFile or size ~= lastSize or flags ~= lastFlags then
      local ok, success = pcall(target.SetFont, target, file, size, flags)
      if not ok or success == false then
        if not fallback then return false end
        ok, success = pcall(target.SetFont, target, fallback, size, flags)
        if not ok or success == false then return false end
        file = fallback
      end
      lastFile, lastSize, lastFlags = file, size, flags
    end
    if style.Shadow ~= lastShadow then
      local shadow = style.Shadow == "SOFT"
      target:SetShadowColor(0, 0, 0, shadow and 0.8 or 0)
      target:SetShadowOffset(shadow and 1 or 0, shadow and -1 or 0)
      lastShadow = style.Shadow
    end
    return true
  end
  return binding
end
Spynon.Typography = Typography
