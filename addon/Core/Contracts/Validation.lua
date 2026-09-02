local _, Spynon = ...

local Validation = {}
Spynon.Contracts.Validation = Validation

function Validation.IsNonEmptyString(value)
  return type(value) == "string" and value:match("%S") ~= nil
end

function Validation.IsFiniteNumber(value)
  return type(value) == "number"
    and value == value
    and value ~= math.huge
    and value ~= -math.huge
end

function Validation.IsPositiveInteger(value)
  return Validation.IsFiniteNumber(value) and value > 0 and value % 1 == 0
end

function Validation.IsNonNegativeInteger(value)
  return Validation.IsFiniteNumber(value) and value >= 0 and value % 1 == 0
end

function Validation.IsArray(value)
  if type(value) ~= "table" then
    return false
  end

  local count = 0
  local maximum = 0
  for key in pairs(value) do
    if not Validation.IsPositiveInteger(key) then
      return false
    end
    count = count + 1
    if key > maximum then
      maximum = key
    end
  end

  return count == maximum
end

function Validation.ValidateStringArray(value, fieldName)
  if not Validation.IsArray(value) then
    return false, fieldName .. " must be an array"
  end

  for index = 1, #value do
    if not Validation.IsNonEmptyString(value[index]) then
      return false, fieldName .. "[" .. index .. "] must be a non-empty string"
    end
  end

  return true
end

function Validation.HasOnlyFields(value, allowedFields)
  for field in pairs(value) do
    if not allowedFields[field] then
      return false, "unknown field: " .. tostring(field)
    end
  end

  return true
end

function Validation.CopyArray(value)
  local copy = {}
  for index = 1, #value do
    copy[index] = value[index]
  end
  return copy
end

function Validation.CopyMap(value)
  local copy = {}
  for key, entry in pairs(value) do
    copy[key] = entry
  end
  return copy
end
