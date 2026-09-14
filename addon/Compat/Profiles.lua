local _, Spynon = ...
local Internal, V = Spynon.CompatInternal, Spynon.Contracts.Validation
local Profiles = {}
function Profiles.Create(environment)
  local adapter, guard = {}, Internal.State.Create(environment)
  local function read(path, ...)
    local ok, value = Internal.SafeCall.Call(environment, path, ...)
    if not ok or not guard:IsPublic(value) then return nil end
    return value
  end
  function adapter.ReadIdentity(_)
    local result = {}
    local guid = read("UnitGUID", "player")
    if type(guid) == "string" and #guid <= 128 and guid:match("^Player%-%d+%-%x+$") then result.character = guid end
    local index = read("C_SpecializationInfo.GetSpecialization")
    if V.IsPositiveInteger(index) and index <= 10 then
      local specId = read("C_SpecializationInfo.GetSpecializationInfo", index)
      if V.IsPositiveInteger(specId) and specId <= 100000 then result.specId = specId end
    end
    return result
  end
  function adapter.GetDatabase(_)
    -- This namespace belongs to the addon. Never replace another field or a malformed/future database.
    if environment.SpynonRotationDB == nil then environment.SpynonRotationDB = {} end
    if type(environment.SpynonRotationDB) ~= "table" then return nil end
    if environment.SpynonRotationDB.profiles == nil then
      environment.SpynonRotationDB.profiles = { schemaVersion = 1, global = {}, characters = {} }
    end
    return environment.SpynonRotationDB.profiles
  end
  return adapter
end
Internal.Profiles = Profiles
