local _, Spynon = ...

local Enhancement = Spynon.Classes.Shaman.Enhancement
local Catalog = Enhancement.Catalog
local Action = Spynon.Contracts.Action
local SpecModule = Spynon.Contracts.SpecModule

local heroSubTreeById = {}
for index = 1, #Catalog.heroTrees do
  local heroTree = Catalog.heroTrees[index]
  heroSubTreeById[heroTree.id] = heroTree.subTreeId
end

local actions = {}
for index = 1, #Catalog.actions do
  local definition = Catalog.actions[index]
  local action, actionError = Action.Create({
    id = definition.id,
    kind = definition.kind,
    label = definition.label,
    capability = definition.capability,
    gameId = definition.spellId,
    tags = definition.tags,
  })
  if action == nil then
    error("invalid Enhancement action " .. definition.id .. ": " .. actionError)
  end
  actions[index] = action
end

local function hasTalent(snapshot, spellId)
  if type(snapshot) ~= "table" or type(snapshot.activeSpellRanks) ~= "table" then
    return false
  end
  local rank = snapshot.activeSpellRanks[spellId]
  return type(rank) == "number" and rank > 0
end

local function actionIsAvailable(definition, snapshot)
  local availability = definition.availability

  for index = 1, #(availability.requiredTalentSpellIds or {}) do
    if not hasTalent(snapshot, availability.requiredTalentSpellIds[index]) then
      return false
    end
  end

  local anyTalentSpellIds = availability.anyTalentSpellIds or {}
  if #anyTalentSpellIds > 0 then
    local found = false
    for index = 1, #anyTalentSpellIds do
      if hasTalent(snapshot, anyTalentSpellIds[index]) then
        found = true
        break
      end
    end
    if not found then
      return false
    end
  end

  for index = 1, #(availability.forbiddenTalentSpellIds or {}) do
    if hasTalent(snapshot, availability.forbiddenTalentSpellIds[index]) then
      return false
    end
  end

  if availability.heroTreeId ~= nil then
    local activeHeroTree = type(snapshot) == "table" and snapshot.heroTree or nil
    if type(activeHeroTree) ~= "table"
      or activeHeroTree.id ~= heroSubTreeById[availability.heroTreeId]
    then
      return false
    end
  end

  return true
end

local function getActions(snapshot)
  local available = {}
  for index = 1, #Catalog.actions do
    if actionIsAvailable(Catalog.actions[index], snapshot) then
      available[#available + 1] = actions[index]
    end
  end
  return available
end

local module, moduleError = SpecModule.Create({
  id = Catalog.id,
  classId = Catalog.classId,
  specId = Catalog.specId,
  displayName = Catalog.displayName,
  version = Catalog.version,
  getActions = getActions,
  getStateQueries = function(snapshot)
    local queries = { resources = {}, auras = {}, cooldowns = {}, talents = {} }
    for _, resource in ipairs(Catalog.resources) do
      queries.resources[#queries.resources + 1] = {
        id = resource.id, kind = resource.kind, powerType = resource.powerType,
        auraId = resource.auraId, maxStacks = resource.maxStacks,
      }
    end
    for _, aura in ipairs(Catalog.auras) do
      if actionIsAvailable(aura, snapshot) then
        queries.auras[#queries.auras + 1] = { id = aura.id, unit = aura.unit, spellId = aura.spellId }
      end
    end
    for _, action in ipairs(getActions(snapshot)) do
      if action.kind == "spell" then
        queries.cooldowns[#queries.cooldowns + 1] = { id = action.id, spellId = action.gameId }
      end
    end
    for _, talent in ipairs(Catalog.talents) do
      queries.talents[#queries.talents + 1] = { id = talent.id, spellId = talent.spellId }
    end
    return queries
  end,
  getRules = function(selection, state, context)
    if not selection or not state or not context or not selection.heroTree then return {} end
    if state.capabilities.inCombat ~= "ADDON_AVAILABLE" or state.inCombat ~= true then return {} end
    local heroId = selection.heroTree.id
    if heroId ~= heroSubTreeById["enhancement.stormbringer"]
      and heroId ~= heroSubTreeById["enhancement.totemic"] then return {} end
    local list = heroId == heroSubTreeById["enhancement.stormbringer"] and "single_sb" or "single_totemic"
    local mode = context.resolvedMode or context.mode
    if mode == "CLEAVE" or mode == "AOE" then list = "aoe" end
    local bundle = Enhancement.RotationBundle
    return { schemaVersion = bundle.schemaVersion, entrypoint = list, lists = bundle.lists, source = bundle.source }
  end,
})
if module == nil then
  error("invalid Enhancement SpecModule: " .. moduleError)
end

local registered, registrationError = Spynon.Specs:Register(module)
if registered == nil then
  error("could not register Enhancement SpecModule: " .. registrationError)
end

Enhancement.Module = module
