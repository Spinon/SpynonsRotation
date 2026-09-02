local _, Spynon = ...

local Capability = Spynon.Contracts.Capability

local Result = {
  Code = {
    OK = "OK",
    API_UNAVAILABLE = "API_UNAVAILABLE",
    CALL_FAILED = "CALL_FAILED",
    INVALID_ARGUMENT = "INVALID_ARGUMENT",
    INVALID_DATA = "INVALID_DATA",
    NO_DATA = "NO_DATA",
    NO_SELECTION = "NO_SELECTION",
    SECRET_RESTRICTED = "SECRET_RESTRICTED",
  },
  Fallback = {
    SKIP = "SKIP",
  },
}

function Result.Success(value, capability, code)
  return {
    ok = true,
    value = value,
    capability = capability or Capability.ADDON_AVAILABLE,
    code = code or Result.Code.OK,
  }
end

function Result.Failure(code, capability)
  return {
    ok = false,
    capability = capability or Capability.CONDITIONALLY_SECRET,
    code = code,
    fallback = Result.Fallback.SKIP,
  }
end

function Result.FromSecretFlag(isSecret)
  if type(isSecret) ~= "boolean" then
    return Result.Failure(Result.Code.INVALID_DATA)
  end

  if isSecret then
    return {
      ok = true,
      value = true,
      capability = Capability.CONDITIONALLY_SECRET,
      code = Result.Code.SECRET_RESTRICTED,
      fallback = Result.Fallback.SKIP,
    }
  end

  return Result.Success(false)
end

Spynon.CompatInternal.Result = Result
