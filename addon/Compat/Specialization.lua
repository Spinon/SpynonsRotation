local _, Spynon = ...

local Capability = Spynon.Contracts.Capability
local Validation = Spynon.Contracts.Validation
local SafeCall = Spynon.CompatInternal.SafeCall
local Result = Spynon.CompatInternal.Result

local Specialization = {}

local function invalidArgument()
  return Result.Failure(Result.Code.INVALID_ARGUMENT, Capability.ADDON_AVAILABLE)
end

local function noData()
  return Result.Failure(Result.Code.NO_DATA, Capability.ADDON_AVAILABLE)
end

function Specialization.Create(environment)
  local adapter = {}

  function adapter.IsInitialized(_)
    local called, initialized = SafeCall.Call(environment, "C_SpecializationInfo.IsInitialized")
    if called == nil then
      return Result.Failure(initialized)
    end
    if type(initialized) ~= "boolean" then
      return Result.Failure(Result.Code.INVALID_DATA)
    end
    return Result.Success(initialized)
  end

  function adapter.GetActiveIndex(_)
    local called, index = SafeCall.Call(environment, "C_SpecializationInfo.GetSpecialization")
    if called == nil then
      return Result.Failure(index)
    end
    if index == nil or index == 0 then
      return noData()
    end
    if not Validation.IsPositiveInteger(index) then
      return Result.Failure(Result.Code.INVALID_DATA)
    end
    return Result.Success(index)
  end

  function adapter.GetInfo(_, index)
    if not Validation.IsPositiveInteger(index) then
      return invalidArgument()
    end

    local called, specId, name, description, icon, role =
      SafeCall.Call(environment, "C_SpecializationInfo.GetSpecializationInfo", index)
    if called == nil then
      return Result.Failure(specId)
    end
    if specId == nil or specId == 0 then
      return noData()
    end
    if not Validation.IsPositiveInteger(specId) then
      return Result.Failure(Result.Code.INVALID_DATA)
    end

    return Result.Success({
      index = index,
      specId = specId,
      name = name,
      description = description,
      icon = icon,
      role = role,
    })
  end

  function adapter.GetClassId(_, specId)
    if not Validation.IsPositiveInteger(specId) then
      return invalidArgument()
    end

    local called, classId = SafeCall.Call(
      environment,
      "C_SpecializationInfo.GetClassIDFromSpecID",
      specId
    )
    if called == nil then
      return Result.Failure(classId)
    end
    if classId == nil then
      return noData()
    end
    if not Validation.IsPositiveInteger(classId) then
      return Result.Failure(Result.Code.INVALID_DATA)
    end
    return Result.Success(classId)
  end

  return adapter
end

Spynon.CompatInternal.Specialization = Specialization
