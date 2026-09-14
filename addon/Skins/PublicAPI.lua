local _, Spynon = ...
local Public = {}
function Public.Export(environment, registry)
  -- Never replace a pre-existing global, including another incompatible API provider.
  if rawget(environment, "SpynonRotationSkins") ~= nil then return false, "GLOBAL_CONFLICT" end
  local api = {apiVersion=1}
  function api.Register(owner, definition) return registry:Register(owner, definition) end
  function api.Get(id) return registry:Get(id) end
  function api.List() return registry:List() end
  rawset(environment, "SpynonRotationSkins", api)
  return true, "EXPORTED"
end
Spynon.SkinPublicAPI = Public
Spynon.SkinPublicAPIExported, Spynon.SkinPublicAPIStatus = Public.Export(_G, Spynon.SkinRegistry)
