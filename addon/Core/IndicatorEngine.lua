local _, Spynon = ...
local V, Indicator = Spynon.Contracts.Validation, Spynon.Contracts.Indicator
local Engine = {}
function Engine.Resolve(definitions, state, guard)
  if not Spynon.RotationProgram.IsList(definitions, 12) then return {} end
  local reader, output, seen = Spynon.StateReader.Create(state, guard), {}, {}
  for _, definition in ipairs(definitions) do
    if type(definition) ~= "table" or not V.IsNonEmptyString(definition.id)
      or not V.IsNonEmptyString(definition.label) or not V.IsNonEmptyString(definition.auraId)
      or not V.IsPositiveInteger(definition.spellId)
      or (definition.kind ~= "buff" and definition.kind ~= "debuff")
      or type(definition.showAbsent) ~= "boolean" or type(definition.refreshRecommended) ~= "boolean"
      or seen[definition.id] then return {} end
    seen[definition.id] = true
    local value = { id = definition.id, label = definition.label, kind = definition.kind,
      spellId = definition.spellId, state = "UNAVAILABLE", attentionSeconds = 3,
      refreshRecommended = definition.refreshRecommended }
    local active = reader:Read({ "auras", definition.auraId, "active" })
    if active == false then value.state = "ABSENT"
    elseif active == true then
      local expires = reader:Read({ "auras", definition.auraId, "expirationTime" })
      local duration = reader:Read({ "auras", definition.auraId, "duration" })
      local now = reader:Read({ "capturedAt" })
      if expires == nil or (expires == 0 and (duration == nil or duration == 0)) then
        -- Public presence without public timing is active, not an invented countdown.
        value.state = "STABLE"
      elseif V.IsFiniteNumber(expires) and V.IsFiniteNumber(now) and now >= 0 and expires > now then
        value.state, value.expiresAt = "STABLE", expires
      end
      if value.state ~= "UNAVAILABLE" then
        local stacks = reader:Read({ "auras", definition.auraId, "applications" })
        if V.IsPositiveInteger(stacks) and stacks <= 9999 then value.stacks = stacks end
      end
    end
    if value.state ~= "ABSENT" or definition.showAbsent then output[#output + 1] = value end
  end
  return output
end
function Engine.Create(stateEngine, registry, guard, media)
  local provider = {}
  function provider.ForRecommendations(_, recommendations)
    if not Spynon.RotationProgram.IsList(recommendations, 12) then return {} end
    for _, rec in ipairs(recommendations) do
      if not Spynon.Contracts.Recommendation.IsRuntimeSafe(rec) then return {} end
    end
    local state, selection = stateEngine:GetSnapshot(), stateEngine:GetSelection()
    local reader = Spynon.StateReader.Create(state, guard)
    if reader:Read({ "inCombat" }) ~= true or not selection
      or reader:Read({ "specId" }) ~= selection.specId then return {} end
    local module = registry:GetBySpecId(selection.specId)
    if not module or not module.getIndicators then return {} end
    local ok, definitions = pcall(module.getIndicators, selection, recommendations)
    if not ok then return {} end
    local result = Engine.Resolve(definitions, state, guard)
    for _, value in ipairs(result) do
      value.icon = media:ResolveIcon({ id = value.id, kind = "spell", label = value.label,
        gameId = value.spellId, capability = "ADDON_AVAILABLE" })
      if not Indicator.Validate(value) then return {} end
    end
    return result
  end
  return provider
end
Spynon.IndicatorEngine = Engine
Spynon.Indicators = Engine.Create(Spynon.StateEngine, Spynon.Specs, Spynon.Compat.State, Spynon.Compat.Media)
