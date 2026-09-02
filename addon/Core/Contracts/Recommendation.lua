local _, Spynon = ...

local Contracts = Spynon.Contracts
local Validation = Contracts.Validation
local Capability = Contracts.Capability
local CombatContext = Contracts.CombatContext
local Action = Contracts.Action

local Recommendation = {}

local ALLOWED_FIELDS = {
  id = true,
  action = true,
  priority = true,
  reason = true,
  context = true,
}

local ALLOWED_REASON_FIELDS = {
  code = true,
  text = true,
  capability = true,
}

local function validateReason(reason)
  if type(reason) ~= "table" then
    return false, "reason must be a table"
  end

  local known, knownError = Validation.HasOnlyFields(reason, ALLOWED_REASON_FIELDS)
  if not known then
    return false, "reason " .. knownError
  end

  if not Validation.IsNonEmptyString(reason.code) then
    return false, "reason.code must be a non-empty string"
  end

  if reason.text ~= nil and not Validation.IsNonEmptyString(reason.text) then
    return false, "reason.text must be a non-empty string when provided"
  end

  if not Capability.IsValid(reason.capability) then
    return false, "reason.capability is invalid"
  end

  return true
end

function Recommendation.Validate(value)
  if type(value) ~= "table" then
    return false, "recommendation must be a table"
  end

  local known, knownError = Validation.HasOnlyFields(value, ALLOWED_FIELDS)
  if not known then
    return false, knownError
  end

  if not Validation.IsNonEmptyString(value.id) then
    return false, "id must be a non-empty string"
  end

  local actionValid, actionError = Action.Validate(value.action)
  if not actionValid then
    return false, "action is invalid: " .. actionError
  end

  if not Validation.IsPositiveInteger(value.priority) then
    return false, "priority must be a positive integer"
  end

  local reasonValid, reasonError = validateReason(value.reason)
  if not reasonValid then
    return false, reasonError
  end

  if value.context ~= nil then
    local contextValid, contextError = CombatContext.Validate(value.context)
    if not contextValid then
      return false, "context is invalid: " .. contextError
    end
  end

  return true
end

function Recommendation.Create(value)
  local valid, validationError = Recommendation.Validate(value)
  if not valid then
    return nil, validationError
  end

  return {
    id = value.id,
    action = value.action,
    priority = value.priority,
    reason = {
      code = value.reason.code,
      text = value.reason.text,
      capability = value.reason.capability,
    },
    context = value.context,
  }
end

function Recommendation.IsRuntimeSafe(value)
  local valid = Recommendation.Validate(value)
  if not valid then
    return false
  end

  if not Capability.AllowsRuntime(value.action.capability)
    or not Capability.AllowsRuntime(value.reason.capability) then
    return false
  end

  return value.context == nil or Capability.AllowsRuntime(value.context.capability)
end

Contracts.Recommendation = Recommendation
