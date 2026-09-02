local _, Spynon = ...

local SafeCall = {}
local unpackValues = unpack

local function pack(...)
  return {
    count = select("#", ...),
    ...,
  }
end

local function resolve(environment, path)
  local current = environment
  for segment in path:gmatch("[^.]+") do
    if type(current) ~= "table" then
      return nil
    end
    current = current[segment]
  end

  if type(current) ~= "function" then
    return nil
  end

  return current
end

function SafeCall.Call(environment, path, ...)
  local api = resolve(environment, path)
  if api == nil then
    return nil, "API_UNAVAILABLE"
  end

  local returned = pack(pcall(api, ...))
  if returned[1] ~= true then
    return nil, "CALL_FAILED"
  end

  return true, unpackValues(returned, 2, returned.count)
end

Spynon.CompatInternal.SafeCall = SafeCall
