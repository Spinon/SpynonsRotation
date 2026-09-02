local _, Spynon = ...

local Capability = Spynon.Contracts.Capability
local Validation = Spynon.Contracts.Validation
local SafeCall = Spynon.CompatInternal.SafeCall
local Result = Spynon.CompatInternal.Result

local Talents = {}

local function invalidArgument()
  return Result.Failure(Result.Code.INVALID_ARGUMENT, Capability.ADDON_AVAILABLE)
end

local function noData()
  return Result.Failure(Result.Code.NO_DATA, Capability.ADDON_AVAILABLE)
end

local function callPositiveInteger(environment, path, ...)
  local called, value = SafeCall.Call(environment, path, ...)
  if called == nil then
    return Result.Failure(value)
  end
  if value == nil then
    return noData()
  end
  if not Validation.IsPositiveInteger(value) then
    return Result.Failure(Result.Code.INVALID_DATA)
  end
  return Result.Success(value)
end

local function callTable(environment, path, ...)
  local called, value = SafeCall.Call(environment, path, ...)
  if called == nil then
    return Result.Failure(value)
  end
  if value == nil then
    return noData()
  end
  if type(value) ~= "table" then
    return Result.Failure(Result.Code.INVALID_DATA)
  end
  return Result.Success(value)
end

function Talents.Create(environment)
  local adapter = {}

  function adapter.GetActiveConfigId(_)
    return callPositiveInteger(environment, "C_ClassTalents.GetActiveConfigID")
  end

  function adapter.GetActiveHeroTreeId(_)
    local called, heroTreeId = SafeCall.Call(environment, "C_ClassTalents.GetActiveHeroTalentSpec")
    if called == nil then
      return Result.Failure(heroTreeId)
    end
    if heroTreeId == nil then
      return Result.Success(nil, Capability.ADDON_AVAILABLE, Result.Code.NO_SELECTION)
    end
    if not Validation.IsPositiveInteger(heroTreeId) then
      return Result.Failure(Result.Code.INVALID_DATA)
    end
    return Result.Success(heroTreeId)
  end

  function adapter.GetTreeIdForSpec(_, specId)
    if not Validation.IsPositiveInteger(specId) then
      return invalidArgument()
    end
    return callPositiveInteger(environment, "C_ClassTalents.GetTraitTreeForSpec", specId)
  end

  function adapter.GetConfigInfo(_, configId)
    if not Validation.IsPositiveInteger(configId) then
      return invalidArgument()
    end
    return callTable(environment, "C_Traits.GetConfigInfo", configId)
  end

  function adapter.GetTreeNodes(_, treeId)
    if not Validation.IsPositiveInteger(treeId) then
      return invalidArgument()
    end
    return callTable(environment, "C_Traits.GetTreeNodes", treeId)
  end

  function adapter.GetNodeInfo(_, configId, nodeId)
    if not Validation.IsPositiveInteger(configId) or not Validation.IsPositiveInteger(nodeId) then
      return invalidArgument()
    end
    return callTable(environment, "C_Traits.GetNodeInfo", configId, nodeId)
  end

  function adapter.GetEntryInfo(_, configId, entryId)
    if not Validation.IsPositiveInteger(configId) or not Validation.IsPositiveInteger(entryId) then
      return invalidArgument()
    end
    return callTable(environment, "C_Traits.GetEntryInfo", configId, entryId)
  end

  function adapter.GetDefinitionInfo(_, definitionId)
    if not Validation.IsPositiveInteger(definitionId) then
      return invalidArgument()
    end
    return callTable(environment, "C_Traits.GetDefinitionInfo", definitionId)
  end

  function adapter.GetSubTreeInfo(_, configId, subTreeId)
    if not Validation.IsPositiveInteger(configId) or not Validation.IsPositiveInteger(subTreeId) then
      return invalidArgument()
    end
    return callTable(environment, "C_Traits.GetSubTreeInfo", configId, subTreeId)
  end

  return adapter
end

Spynon.CompatInternal.Talents = Talents
