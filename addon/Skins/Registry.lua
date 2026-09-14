local _, Spynon = ...
local Registry = {}
function Registry.Create()
  local registry, entries, count = {}, {}, 1
  local builtin = Spynon.SkinFactory.DefaultDefinition()
  entries[builtin.id] = {owner="SpynonRotation", definition=builtin, skin=assert(Spynon.SkinFactory.Create(builtin))}
  local function validOwner(owner)
    return type(owner) == "string" and #owner > 0 and #owner <= 64 and owner:match("^[%w_%-]+$") ~= nil
  end
  local function ownsTextures(owner, tokens)
    local paths = {tokens.queue.current.texture, tokens.queue.queued.texture,
      tokens.auras.background, tokens.auras.channel, tokens.auras.shelf}
    for _, path in ipairs(paths) do
      local package = path:match("^Interface\\AddOns\\([^\\]+)\\")
      if package ~= owner and package ~= "SpynonRotation" then return false end
    end
    return true
  end
  function registry.Register(_, owner, definition)
    if not validOwner(owner) then return false, "INVALID_OWNER" end
    if type(definition) ~= "table" or getmetatable(definition) then return false, "INVALID_DEFINITION" end
    if definition.schemaVersion ~= 1 then return false, "UNSUPPORTED_VERSION" end
    if type(definition.id) ~= "string" then return false, "INVALID_IDENTITY" end
    local prefix = owner:lower() .. "."
    if definition.id:sub(1, #prefix) ~= prefix then return false, "NAMESPACE_MISMATCH" end
    if entries[definition.id] then return false, "DUPLICATE_ID" end
    if count >= 32 then return false, "REGISTRY_FULL" end
    local skin, problem = Spynon.SkinFactory.Create(definition)
    if not skin then return false, problem end
    local tokens = skin:GetTokens()
    if not ownsTextures(owner, tokens) then return false, "FOREIGN_ASSET_PACKAGE" end
    local id, label = skin:GetIdentity()
    entries[id] = {owner=owner, skin=skin,
      definition={schemaVersion=1, id=id, label=label, tokens=tokens, defaults=skin:Resolve()}}
    count = count + 1
    return true, "REGISTERED"
  end
  function registry.Get(_, id)
    local entry = type(id) == "string" and entries[id] or nil
    if not entry then return nil, "UNKNOWN_SKIN" end
    local key, label = entry.skin:GetIdentity()
    return {schemaVersion=1, id=key, label=label, defaults=entry.skin:Resolve(),
      tokens=entry.skin:GetTokens()}, entry.owner
  end
  function registry.Resolve(_, id)
    local entry = type(id) == "string" and entries[id] or nil
    if entry then return entry.skin, "REGISTERED" end
    return entries[builtin.id].skin, "FALLBACK_UNKNOWN_SKIN"
  end
  function registry.List(_)
    local result = {}
    for id, entry in pairs(entries) do
      result[#result+1] = {id=id, label=entry.definition.label, owner=entry.owner, schemaVersion=1}
    end
    table.sort(result, function(a,b) return a.id < b.id end)
    return result
  end
  return registry
end
Spynon.SkinRegistryFactory = Registry
Spynon.SkinRegistry = Registry.Create()
