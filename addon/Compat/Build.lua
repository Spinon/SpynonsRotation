local _, Spynon = ...

local Validation = Spynon.Contracts.Validation
local SafeCall = Spynon.CompatInternal.SafeCall
local Result = Spynon.CompatInternal.Result

local Build = {}

function Build.Create(environment)
  local adapter = {}

  function adapter.GetInfo(_)
    local called, version, number, date, interfaceVersion, localizedVersion, buildInfo =
      SafeCall.Call(environment, "GetBuildInfo")
    if called == nil then
      return Result.Failure(version)
    end

    local valid = Validation.IsNonEmptyString(version)
      and Validation.IsNonEmptyString(number)
      and Validation.IsNonEmptyString(date)
      and Validation.IsPositiveInteger(interfaceVersion)
      and Validation.IsNonEmptyString(localizedVersion)
      and type(buildInfo) == "string"
    if not valid then
      return Result.Failure(Result.Code.INVALID_DATA)
    end

    return Result.Success({
      version = version,
      number = number,
      date = date,
      interface = interfaceVersion,
      localizedVersion = localizedVersion,
      buildInfo = buildInfo,
    })
  end

  return adapter
end

Spynon.CompatInternal.Build = Build
