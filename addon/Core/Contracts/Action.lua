local _, Spynon = ...

local Contracts = Spynon.Contracts
local Validation = Contracts.Validation
local Capability = Contracts.Capability

local Action = {
  Kind = {
    SPELL = "spell",
    ITEM = "item",
    RACIAL = "racial",
    TRINKET = "trinket",
    POTION = "potion",
    INTERRUPT = "interrupt",
    DEFENSIVE = "defensive",
    UTILITY = "utility",
  },
}

local VALID_KINDS = {}
for _, kind in pairs(Action.Kind) do
  VALID_KINDS[kind] = true
end

local ALLOWED_FIELDS = {
  id = true,
  kind = true,
  label = true,
  capability = true,
  gameId = true,
  icon = true,
  tags = true,
}

function Action.IsKind(value)
  return VALID_KINDS[value] == true
end

function Action.Validate(value)
  if type(value) ~= "table" then
    return false, "action must be a table"
  end

  local known, knownError = Validation.HasOnlyFields(value, ALLOWED_FIELDS)
  if not known then
    return false, knownError
  end

  if not Validation.IsNonEmptyString(value.id) then
    return false, "id must be a non-empty string"
  end

  if not Action.IsKind(value.kind) then
    return false, "kind is invalid"
  end

  if not Validation.IsNonEmptyString(value.label) then
    return false, "label must be a non-empty string"
  end

  if not Capability.IsValid(value.capability) then
    return false, "capability is invalid"
  end

  if value.gameId ~= nil and not Validation.IsPositiveInteger(value.gameId) then
    return false, "gameId must be a positive integer"
  end

  local iconType = type(value.icon)
  if value.icon ~= nil
    and not Validation.IsPositiveInteger(value.icon)
    and not (iconType == "string" and Validation.IsNonEmptyString(value.icon)) then
    return false, "icon must be a positive file ID or non-empty path"
  end

  if value.tags ~= nil then
    local tagsValid, tagsError = Validation.ValidateStringArray(value.tags, "tags")
    if not tagsValid then
      return false, tagsError
    end
  end

  return true
end

function Action.Create(value)
  local valid, validationError = Action.Validate(value)
  if not valid then
    return nil, validationError
  end

  return {
    id = value.id,
    kind = value.kind,
    label = value.label,
    capability = value.capability,
    gameId = value.gameId,
    icon = value.icon,
    tags = Validation.CopyArray(value.tags or {}),
  }
end

Contracts.Action = Action
