local _, Spynon = ...
local Store, Settings = {}, Spynon.SettingsFactory
local scopes = { global = true, character = true, spec = true }
function Store.SameSnapshot(a, b)
  if type(a) ~= "table" or type(b) ~= "table" or type(a.values) ~= "table" or type(b.values) ~= "table" then
    return false
  end
  if a.scope ~= b.scope or a.character ~= b.character or a.specId ~= b.specId then return false end
  for key, value in pairs(a.values) do if b.values[key] ~= value then return false end end
  for key, value in pairs(b.values) do if a.values[key] ~= value then return false end end
  return true
end
local function validCharacter(context)
  return type(context) == "table" and type(context.character) == "string" and #context.character <= 128
    and context.character:match("^Player%-%d+%-%x+$") ~= nil
end
local function validSpec(context)
  return validCharacter(context) and Spynon.Contracts.Validation.IsPositiveInteger(context.specId)
    and context.specId <= 100000
end
function Store.Create(source, skin)
  skin = skin or Spynon.Skin
  local store = {}
  local writable = type(source) == "table" and source.schemaVersion == 1
    and type(source.global) == "table" and type(source.characters) == "table"
  local data = writable and source or { global = {}, characters = {} }
  local function character(context, create)
    if not validCharacter(context) then return nil end
    local row = data.characters[context.character]
    if row == nil and create then
      row = { values = {}, specs = {}, scope = "global" }; data.characters[context.character] = row
    end
    if type(row) ~= "table" or type(row.values) ~= "table" or type(row.specs) ~= "table"
      or scopes[row.scope] ~= true then return nil end
    return row
  end
  local function layer(scope, context, create)
    if scope == "global" then return data.global end
    if not scopes[scope] or (scope == "spec" and not validSpec(context)) then return nil end
    local row = character(context, create)
    if not row then return nil end
    if scope == "character" then return row.values end
    local key = tostring(context.specId)
    if row.specs[key] == nil and create then row.specs[key] = {} end
    return type(row.specs[key]) == "table" and row.specs[key] or nil
  end
  function store.GetScope(_, context)
    local row = character(context)
    return row and scopes[row.scope] and row.scope or "global"
  end
  function store.CanUse(_, scope, context)
    if not writable or scopes[scope] ~= true or not validCharacter(context)
      or (scope == "spec" and not validSpec(context)) then return false end
    local row = data.characters[context.character]
    if row ~= nil and not character(context) then return false end
    if scope == "spec" and row and row.specs[tostring(context.specId)] ~= nil
      and type(row.specs[tostring(context.specId)]) ~= "table" then return false end
    return true
  end
  function store.Resolve(_, context, scope, omit)
    local value = skin and skin:Resolve() or Settings.Defaults()
    scope = scope or store:GetScope(context)
    local function merge(name)
      for key, item in pairs(layer(name, context) or {}) do
        if Settings.IsValue(key, item) and not (name == scope and omit and omit[key]) then value[key] = item end
      end
    end
    merge("global")
    if scope == "character" or scope == "spec" then merge("character") end
    if scope == "spec" then merge("spec") end
    return value
  end
  function store.Select(_, scope, context)
    if not store:CanUse(scope, context) then return false end
    local row = character(context, true)
    if not row then return false end
    row.scope = scope; return true
  end
  function store.Set(_, key, value, context)
    local scope = store:GetScope(context)
    if not store:CanUse(scope, context) or not Settings.IsValue(key, value) then return false end
    local target = layer(scope, context, true)
    if not target then return false end
    target[key] = value; return true
  end
  function store.Copy(_, from, context)
    local scope = store:GetScope(context)
    if from == scope or not store:CanUse(from, context) or not store:CanUse(scope, context) then return false end
    local values, target = store:Resolve(context, from), layer(scope, context, true)
    if not target then return false end
    for key, item in pairs(values) do target[key] = item end
    return true
  end
  function store.Reset(_, context)
    local scope = store:GetScope(context)
    if not store:CanUse(scope, context) then return false end
    local target = layer(scope, context, true)
    if not target then return false end
    -- Reset supported preferences only. Unknown extension data and sibling profiles survive.
    for key in pairs(Settings.Defaults()) do target[key] = nil end
    return true
  end
  function store.Capture(_, context)
    local scope = store:GetScope(context)
    if not store:CanUse(scope, context) then return nil end
    local values = {}
    for key, value in pairs(layer(scope, context) or {}) do
      if Settings.IsValue(key, value) then values[key] = value end
    end
    return { scope = scope, character = context.character, specId = context.specId, values = values }
  end
  local function validKeys(keys)
    if type(keys) ~= "table" or next(keys) == nil then return false end
    local defaults = Settings.Defaults()
    for key, enabled in pairs(keys) do if defaults[key] == nil or enabled ~= true then return false end end
    return true
  end
  function store.PreviewReset(_, keys, context)
    if not validKeys(keys) or not store:Capture(context) then return nil end
    return store:Resolve(context, nil, keys)
  end
  function store.ResetFields(_, keys, expected, preview, context)
    if not validKeys(keys) or not Store.SameSnapshot(store:Capture(context), expected)
      or not Settings.Validate(preview) then return false end
    local proposed = store:PreviewReset(keys, context)
    for key, value in pairs(preview) do if proposed[key] ~= value then return false end end
    local target = layer(store:GetScope(context), context, true)
    if not target then return false end
    for key in pairs(keys) do target[key] = nil end
    return true
  end
  function store.Restore(_, target, expected, context)
    local current = store:Capture(context)
    if not Store.SameSnapshot(current, expected) or type(target) ~= "table" or type(target.values) ~= "table"
      or target.scope ~= current.scope or target.character ~= current.character or target.specId ~= current.specId then
      return false
    end
    for key, value in pairs(target.values) do if not Settings.IsValue(key, value) then return false end end
    local values = layer(current.scope, context, true)
    if not values then return false end
    for key in pairs(Settings.Defaults()) do
      if current.values[key] ~= target.values[key] then values[key] = target.values[key] end
    end
    return true
  end
  function store.Apply(_, expected, changes, context)
    if type(changes) ~= "table" then return false end
    local target = store:Capture(context)
    if not Store.SameSnapshot(target, expected) then return false end
    for key, value in pairs(changes) do
      if not Settings.IsValue(key, value) then return false end
      target.values[key] = value
    end
    return store:Restore(target, expected, context)
  end
  function store.IsWritable(_) return writable end
  return store
end
Spynon.ProfileStoreFactory = Store
