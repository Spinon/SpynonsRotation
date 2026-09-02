local _, Spynon = ...

local Contracts = Spynon.Contracts
local Validation = Contracts.Validation
local Capability = Contracts.Capability

local PlayerState = {}

local ALLOWED_FIELDS = {
  revision = true,
  capturedAt = true,
  inCombat = true,
  specId = true,
  resources = true,
  auras = true,
  cooldowns = true,
  talents = true,
  capabilities = true,
}

local MAP_FIELDS = {
  "resources",
  "auras",
  "cooldowns",
  "talents",
}

local function validateCapabilities(capabilities)
  if capabilities == nil then
    return true
  end

  if type(capabilities) ~= "table" then
    return false, "capabilities must be a table"
  end

  for key, capability in pairs(capabilities) do
    if not Validation.IsNonEmptyString(key) then
      return false, "capability keys must be non-empty strings"
    end
    if not Capability.IsValid(capability) then
      return false, "capability is invalid for key: " .. key
    end
  end

  return true
end

function PlayerState.Validate(value)
  if type(value) ~= "table" then
    return false, "player state must be a table"
  end

  local known, knownError = Validation.HasOnlyFields(value, ALLOWED_FIELDS)
  if not known then
    return false, knownError
  end

  if not Validation.IsNonNegativeInteger(value.revision) then
    return false, "revision must be a non-negative integer"
  end

  if not Validation.IsFiniteNumber(value.capturedAt) or value.capturedAt < 0 then
    return false, "capturedAt must be a non-negative finite number"
  end

  if type(value.inCombat) ~= "boolean" then
    return false, "inCombat must be a boolean"
  end

  if value.specId ~= nil and not Validation.IsPositiveInteger(value.specId) then
    return false, "specId must be a positive integer"
  end

  for _, field in ipairs(MAP_FIELDS) do
    if value[field] ~= nil and type(value[field]) ~= "table" then
      return false, field .. " must be a table"
    end
  end

  return validateCapabilities(value.capabilities)
end

function PlayerState.Create(value)
  local valid, validationError = PlayerState.Validate(value)
  if not valid then
    return nil, validationError
  end

  return {
    revision = value.revision,
    capturedAt = value.capturedAt,
    inCombat = value.inCombat,
    specId = value.specId,
    resources = Validation.CopyMap(value.resources or {}),
    auras = Validation.CopyMap(value.auras or {}),
    cooldowns = Validation.CopyMap(value.cooldowns or {}),
    talents = Validation.CopyMap(value.talents or {}),
    capabilities = Validation.CopyMap(value.capabilities or {}),
  }
end

Contracts.PlayerState = PlayerState
