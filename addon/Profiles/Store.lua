local _, Spynon = ...
local Store, Settings = {}, Spynon.SettingsFactory
local scopes = { global = true, character = true, spec = true }
local function validCharacter(context)
  return type(context) == "table" and type(context.character) == "string" and #context.character <= 128
    and context.character:match("^Player%-%d+%-%x+$") ~= nil
end
local function validSpec(context)
  return validCharacter(context) and Spynon.Contracts.Validation.IsPositiveInteger(context.specId)
    and context.specId <= 100000
end
function Store.Create(source)
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
  function store.Resolve(_, context, scope)
    local value = Settings.Defaults()
    scope = scope or store:GetScope(context)
    local function merge(overrides)
      for key, item in pairs(overrides or {}) do if Settings.IsValue(key, item) then value[key] = item end end
    end
    merge(layer("global", context))
    if scope == "character" or scope == "spec" then merge(layer("character", context)) end
    if scope == "spec" then merge(layer("spec", context)) end
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
  function store.IsWritable(_) return writable end
  return store
end
Spynon.ProfileStoreFactory = Store
