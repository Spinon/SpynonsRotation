local _, Spynon = ...
local Skin = {}
local blueprint = Spynon.DefaultSkinDefinition
local function copy(value)
  if type(value) ~= "table" then return value end
  local result = {}; for key, item in pairs(value) do result[key] = copy(item) end; return result
end
local function merge(template, candidate)
  if type(template) ~= "table" then
    if candidate == nil then return template end
    if type(template) ~= type(candidate) then return nil end
    if type(candidate) == "number" and not Spynon.Contracts.Validation.IsFiniteNumber(candidate) then return nil end
    return candidate
  end
  if candidate == nil then return copy(template) end
  if type(candidate) ~= "table" or getmetatable(candidate) then return nil end
  for key in pairs(candidate) do if template[key] == nil then return nil end end
  local result = {}
  for key, value in pairs(template) do
    result[key] = merge(value, candidate[key])
    if result[key] == nil then return nil end
  end
  return result
end
local function unitArray(value)
  for _, number in ipairs(value) do if number < 0 or number > 1 then return false end end
  return true
end
local function texture(value)
  return #value <= 240 and value:match("^Interface\\AddOns\\[%w_%-]+\\[%w_%-\\]+%.tga$") ~= nil
end
local function uv(value) return unitArray(value) and value[1] < value[2] and value[3] < value[4] end
local function validTokens(tokens)
  local queue = tokens.queue
  if math.abs(queue.offsetY) > 600 or queue.rowInset < 0 or queue.rowInset > 32
    or queue.iconTrim < 0 or queue.iconTrim > 0.1 then return false end
  for _, component in ipairs({queue.current, queue.queued}) do
    if component.width < 16 or component.width > 512 or component.height < 16 or component.height > 512
      or component.iconX < 0 or component.iconY < 0 or component.iconWidth < 1 or component.iconHeight < 1
      or component.iconX + component.iconWidth > component.width
      or component.iconY + component.iconHeight > component.height
      or not texture(component.texture) or not uv(component.uv) then return false end
  end
  for _, color in pairs(tokens.colors) do if not unitArray(color) then return false end end
  for _, key in ipairs({"background", "channel", "shelf"}) do
    if not texture(tokens.auras[key]) then return false end
  end
  return uv(tokens.auras.uv) and (tokens.typography.fontObject == "GameFontNormalSmall"
    or tokens.typography.fontObject == "GameFontNormal")
end
function Skin.Create(definition)
  if type(definition) ~= "table" or getmetatable(definition) then return nil, "INVALID_DEFINITION" end
  local allowed = {schemaVersion=true, id=true, label=true, defaults=true, tokens=true}
  for key in pairs(definition) do if not allowed[key] then return nil, "UNKNOWN_FIELD" end end
  if definition.schemaVersion ~= 1 or type(definition.id) ~= "string" or #definition.id > 64
    or not definition.id:match("^[a-z][a-z0-9_.%-]+$") or type(definition.label) ~= "string"
    or #definition.label > 80 or not definition.label:match("%S") then return nil, "INVALID_IDENTITY" end
  local tokens = merge(blueprint.tokens, definition.tokens)
  if not tokens or not validTokens(tokens) then return nil, "INVALID_TOKENS" end
  local defaults = Spynon.SettingsFactory.Defaults()
  if definition.defaults ~= nil then
    if type(definition.defaults) ~= "table" or getmetatable(definition.defaults) then return nil, "INVALID_DEFAULTS" end
    for key, value in pairs(definition.defaults) do
      if not Spynon.SettingsFactory.IsValue(key, value) then return nil, "INVALID_DEFAULTS" end
      defaults[key] = value
    end
  end
  local skin, id, label = {}, definition.id, definition.label
  function skin.GetIdentity(_) return id, label end
  function skin.GetTokens(_) return copy(tokens) end
  function skin.Resolve(_, overrides)
    if overrides ~= nil and (type(overrides) ~= "table" or getmetatable(overrides)) then return nil end
    local values = copy(defaults)
    for key, value in pairs(overrides or {}) do
      if Spynon.SettingsFactory.IsValue(key, value) then values[key] = value end
    end
    return values
  end
  return skin
end
function Skin.DefaultDefinition() return copy(blueprint) end
Spynon.SkinFactory = Skin
Spynon.Skin = assert(Skin.Create(blueprint))
rawset(Spynon, "DefaultSkinDefinition", nil)
