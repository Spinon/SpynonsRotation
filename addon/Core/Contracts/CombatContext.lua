local _, Spynon = ...

local Contracts = Spynon.Contracts
local Validation = Contracts.Validation
local Capability = Contracts.Capability

local CombatContext = {
  AUTO = "AUTO",
  SINGLE_TARGET = "SINGLE_TARGET",
  CLEAVE = "CLEAVE",
  AOE = "AOE",
}

local VALID_MODES = {
  [CombatContext.AUTO] = true,
  [CombatContext.SINGLE_TARGET] = true,
  [CombatContext.CLEAVE] = true,
  [CombatContext.AOE] = true,
}

local CONCRETE_MODES = {
  [CombatContext.SINGLE_TARGET] = true,
  [CombatContext.CLEAVE] = true,
  [CombatContext.AOE] = true,
}

local ALLOWED_FIELDS = {
  mode = true,
  resolvedMode = true,
  isOverride = true,
  capability = true,
}

function CombatContext.IsMode(value)
  return VALID_MODES[value] == true
end

function CombatContext.IsConcreteMode(value)
  return CONCRETE_MODES[value] == true
end

function CombatContext.Validate(value)
  if type(value) ~= "table" then
    return false, "combat context must be a table"
  end

  local known, knownError = Validation.HasOnlyFields(value, ALLOWED_FIELDS)
  if not known then
    return false, knownError
  end

  if not CombatContext.IsMode(value.mode) then
    return false, "mode is invalid"
  end

  if value.resolvedMode ~= nil and not CombatContext.IsConcreteMode(value.resolvedMode) then
    return false, "resolvedMode must be a concrete mode"
  end

  if value.mode ~= CombatContext.AUTO
    and value.resolvedMode ~= nil
    and value.resolvedMode ~= value.mode then
    return false, "resolvedMode must match an explicit mode"
  end

  if value.isOverride ~= nil and type(value.isOverride) ~= "boolean" then
    return false, "isOverride must be a boolean"
  end

  if value.capability ~= nil and not Capability.IsValid(value.capability) then
    return false, "capability is invalid"
  end

  return true
end

function CombatContext.Create(value)
  local valid, validationError = CombatContext.Validate(value)
  if not valid then
    return nil, validationError
  end

  local resolvedMode = value.resolvedMode
  if value.mode ~= CombatContext.AUTO then
    resolvedMode = value.mode
  end

  return {
    mode = value.mode,
    resolvedMode = resolvedMode,
    isOverride = value.isOverride == true,
    capability = value.capability or Capability.ADDON_AVAILABLE,
  }
end

function CombatContext.Resolve(value, fallbackMode)
  local valid, validationError = CombatContext.Validate(value)
  if not valid then
    return nil, validationError
  end

  if value.mode ~= CombatContext.AUTO then
    return value.mode
  end

  if CombatContext.IsConcreteMode(value.resolvedMode) then
    return value.resolvedMode
  end

  if CombatContext.IsConcreteMode(fallbackMode) then
    return fallbackMode
  end

  return nil, "AUTO context requires a resolvedMode or concrete fallback"
end

Contracts.CombatContext = CombatContext
