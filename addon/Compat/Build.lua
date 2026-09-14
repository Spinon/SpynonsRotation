local _, Spynon = ...

local Validation = Spynon.Contracts.Validation
local SafeCall = Spynon.CompatInternal.SafeCall
local Result = Spynon.CompatInternal.Result

local Build = {}

function Build.Create(environment)
  local adapter = {}
  function adapter.IsDevelopmentSupported(_, info)
    local policy = Spynon.CompatInternal.ClientPolicy
    return type(info) == "table" and info.version == "12.1.0" and info.interface == policy.interface
      and policy.developmentBuilds[info.number] == true
  end

  function adapter.GetInfo(_)
    local called, version, number, date, interfaceVersion, localizedVersion, buildInfo =
      SafeCall.Call(environment, "GetBuildInfo")
    if called == nil then
      return Result.Failure(version)
    end

    -- Identity is mandatory. Descriptive text is not part of compatibility policy.
    local invalidField
    if not Validation.IsNonEmptyString(version) then invalidField = "version"
    elseif not Validation.IsNonEmptyString(number) then invalidField = "number"
    elseif not Validation.IsPositiveInteger(interfaceVersion) then invalidField = "interface" end
    if invalidField then
      local failure = Result.Failure(Result.Code.INVALID_DATA)
      failure.invalidField = invalidField
      return failure
    end

    return Result.Success({
      version = version,
      number = number,
      date = type(date) == "string" and date or nil,
      interface = interfaceVersion,
      localizedVersion = type(localizedVersion) == "string" and localizedVersion or nil,
      buildInfo = type(buildInfo) == "string" and buildInfo or nil,
    })
  end

  return adapter
end

Spynon.CompatInternal.Build = Build
