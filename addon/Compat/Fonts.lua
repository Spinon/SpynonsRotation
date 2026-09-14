local _, Spynon = ...
local Fonts = {}
function Fonts.Create(environment)
  local adapter, serial = {}, 0
  function adapter.Resolve(_, family, fallback)
    local source = environment[family == "NUMBERS" and "NumberFontNormal" or "GameFontNormalSmall"]
    if (type(source) == "table" or type(source) == "userdata") and type(source.GetFont) == "function" then
      local ok, file = pcall(source.GetFont, source)
      if ok and type(file) == "string" and file ~= "" then return file end
    end
    return fallback
  end
  function adapter.NewCountdown(_)
    if type(environment.CreateFont) ~= "function" then return nil end
    -- Bounded lifetime pool. Never borrow or mutate Blizzard/external font objects.
    while serial < 64 do
      serial = serial + 1
      local name = "SpynonRotationCountdownFont" .. serial
      if environment[name] == nil then
        local ok, font = pcall(environment.CreateFont, name)
        if ok and font then return font, name end
        return nil
      end
    end
    return nil
  end
  return adapter
end
Spynon.CompatInternal.Fonts = Fonts
