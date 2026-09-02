local _, Spynon = ...

local Contracts = Spynon.Contracts
local Validation = Contracts.Validation

local SpecModule = {}

local ALLOWED_FIELDS = {
  id = true,
  classId = true,
  specId = true,
  displayName = true,
  version = true,
  getActions = true,
  getRules = true,
}

local function isModuleId(value)
  return Validation.IsNonEmptyString(value)
    and value:match("^[a-z][a-z0-9_]*%.[a-z][a-z0-9_]*$") ~= nil
end

function SpecModule.Validate(value)
  if type(value) ~= "table" then
    return false, "spec module must be a table"
  end

  local known, knownError = Validation.HasOnlyFields(value, ALLOWED_FIELDS)
  if not known then
    return false, knownError
  end

  if not isModuleId(value.id) then
    return false, "id must use the class.spec format"
  end

  if not Validation.IsPositiveInteger(value.classId) then
    return false, "classId must be a positive integer"
  end

  if not Validation.IsPositiveInteger(value.specId) then
    return false, "specId must be a positive integer"
  end

  if not Validation.IsNonEmptyString(value.displayName) then
    return false, "displayName must be a non-empty string"
  end

  if not Validation.IsNonEmptyString(value.version) then
    return false, "version must be a non-empty string"
  end

  if type(value.getActions) ~= "function" then
    return false, "getActions must be a function"
  end

  if type(value.getRules) ~= "function" then
    return false, "getRules must be a function"
  end

  return true
end

function SpecModule.Create(value)
  local valid, validationError = SpecModule.Validate(value)
  if not valid then
    return nil, validationError
  end

  return {
    id = value.id,
    classId = value.classId,
    specId = value.specId,
    displayName = value.displayName,
    version = value.version,
    getActions = value.getActions,
    getRules = value.getRules,
  }
end

Contracts.SpecModule = SpecModule
