local _, Spynon = ...
local V = Spynon.Contracts.Validation
local Indicator = { Rank = { ABSENT = 1, REFRESH = 2, ATTENTION = 3, STABLE = 4, UNAVAILABLE = 5 } }
local FIELDS = { id = true, label = true, kind = true, spellId = true, icon = true, state = true,
  expiresAt = true, stacks = true, attentionSeconds = true, refreshRecommended = true }
function Indicator.Validate(value)
  if type(value) ~= "table" or not V.HasOnlyFields(value, FIELDS)
    or not V.IsNonEmptyString(value.id) or not V.IsNonEmptyString(value.label)
    or (value.kind ~= "buff" and value.kind ~= "debuff") or not Indicator.Rank[value.state]
    or not V.IsPositiveInteger(value.spellId) then return false end
  if value.icon ~= nil and not V.IsPositiveInteger(value.icon) then return false end
  if value.expiresAt ~= nil and (not V.IsFiniteNumber(value.expiresAt) or value.expiresAt <= 0) then return false end
  if value.stacks ~= nil and (not V.IsPositiveInteger(value.stacks) or value.stacks > 9999) then return false end
  if value.attentionSeconds ~= nil
    and (not V.IsFiniteNumber(value.attentionSeconds) or value.attentionSeconds < 0) then
    return false
  end
  if value.refreshRecommended ~= nil and type(value.refreshRecommended) ~= "boolean" then return false end
  if (value.state == "ABSENT" or value.state == "UNAVAILABLE") and (value.expiresAt or value.stacks) then
    return false
  end
  return true
end
function Indicator.At(value, now)
  if not Indicator.Validate(value) then return "UNAVAILABLE" end
  if value.state == "ABSENT" or value.state == "UNAVAILABLE" then return value.state end
  local remaining
  if value.expiresAt then
    if not V.IsFiniteNumber(now) or now < 0 or now >= value.expiresAt then return "UNAVAILABLE" end
    remaining = value.expiresAt - now
  end
  if value.refreshRecommended then return "REFRESH", remaining end
  if remaining and remaining <= (value.attentionSeconds or 0) then return "ATTENTION", remaining end
  return "STABLE", remaining
end
Spynon.Contracts.Indicator = Indicator
