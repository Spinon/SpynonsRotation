local _, Spynon = ...

local Validation = Spynon.Contracts.Validation
local Result = Spynon.CompatInternal.Result
local Factory = {}

local FULL_EVENTS = {
  PLAYER_ENTERING_WORLD = true, PLAYER_SPECIALIZATION_CHANGED = true, PLAYER_TALENT_UPDATE = true,
  TRAIT_CONFIG_UPDATED = true, ACTIVE_TALENT_GROUP_CHANGED = true, SPELLS_CHANGED = true,
}
local POWER_EVENTS = {
  UNIT_POWER_UPDATE = true, UNIT_POWER_FREQUENT = true, UNIT_MAXPOWER = true, UNIT_DISPLAYPOWER = true,
}
Factory.Events = {
  "PLAYER_ENTERING_WORLD", "PLAYER_SPECIALIZATION_CHANGED", "PLAYER_TALENT_UPDATE", "TRAIT_CONFIG_UPDATED",
  "ACTIVE_TALENT_GROUP_CHANGED", "SPELLS_CHANGED", "UNIT_POWER_UPDATE", "UNIT_POWER_FREQUENT", "UNIT_MAXPOWER",
  "UNIT_DISPLAYPOWER", "UNIT_AURA", "SPELL_UPDATE_COOLDOWN", "SPELL_UPDATE_CHARGES", "PLAYER_TARGET_CHANGED",
  "PLAYER_REGEN_DISABLED", "PLAYER_REGEN_ENABLED", "PLAYER_EQUIPMENT_CHANGED",
  "ADDON_RESTRICTION_STATE_CHANGED",
  "SPELL_UPDATE_USABLE",
}
local EVENTS = {}
for _, event in ipairs(Factory.Events) do EVENTS[event] = true end
local GROUPS = { "resources", "auras", "cooldowns", "talents" }

local function copy(value)
  if type(value) ~= "table" then return value end
  local result = {}
  for key, item in pairs(value) do result[key] = copy(item) end
  return result
end

local function emptyQueries()
  return { resources = {}, auras = {}, cooldowns = {}, talents = {} }
end

-- Queries are module-owned, public configuration, never raw game API objects.
local function normalizeQueries(value)
  if type(value) ~= "table" then return nil end
  local normalized = emptyQueries()
  for _, group in ipairs(GROUPS) do
    local entries = value[group]
    if entries == nil then entries = {} end
    if type(entries) ~= "table" then return nil end
    local ids = {}
    local groupEntries = {}
    for key, entry in pairs(entries) do
      if not Validation.IsPositiveInteger(key) or key > #entries or type(entry) ~= "table"
        or not Validation.IsNonEmptyString(entry.id) or ids[entry.id]
      then return nil end
      ids[entry.id] = true
      local query = { id = entry.id }
      if group == "resources" then
        query.kind = entry.kind
        if entry.kind == "power" and Validation.IsNonNegativeInteger(entry.powerType) then
          query.powerType = entry.powerType
        elseif entry.kind == "aura_stacks" and Validation.IsPositiveInteger(entry.auraId)
          and Validation.IsPositiveInteger(entry.maxStacks)
        then
          query.auraId, query.maxStacks = entry.auraId, entry.maxStacks
        else return nil end
      else
        if not Validation.IsPositiveInteger(entry.spellId) then return nil end
        query.spellId = entry.spellId
        if group == "auras" then
          if entry.unit ~= "player" and entry.unit ~= "target" then return nil end
          query.unit = entry.unit
        end
      end
      groupEntries[#groupEntries + 1] = query
    end
    if #groupEntries ~= #entries then return nil end
    table.sort(groupEntries, function(a, b) return a.id < b.id end)
    normalized[group] = groupEntries
  end
  return normalized
end

function Factory.Create(compat, detector)
  local engine = {}
  local api = compat.State
  local queries = emptyQueries()
  local state = Spynon.Contracts.PlayerState.Create({ revision = 0, capturedAt = 0, inCombat = false })
  local diagnostics = {}
  local listeners, listenerSequence = {}, 0
  local updating = false
  local volatileInvalidated = false
  local selection

  local function record(key, result)
    state.capabilities[key] = result.capability
    diagnostics[key] = { code = result.code, fallback = result.fallback }
    -- A capability classification alone is not authorization to consume a value.
    if result.ok and result.capability == Spynon.Contracts.Capability.ADDON_AVAILABLE then
      return result.value
    end
  end

  local function refreshSpec()
    selection = nil
    queries = emptyQueries()
    for _, group in ipairs(GROUPS) do state[group] = {} end
    state.capabilities, diagnostics = {}, {}
    local detection = detector:Capture()
    local snapshot = record("specId", detection)
    state.specId = snapshot and snapshot.specialization.specId or nil
    if not snapshot then return end
    selection = {
      specId = state.specId, activeSpellRanks = copy(snapshot.activeSpellRanks or {}),
      heroTree = snapshot.heroTree and { id = snapshot.heroTree.id } or nil,
    }
    local provider = snapshot.module.getStateQueries
    if not provider then return end
    local ok, candidate = pcall(provider, snapshot)
    local normalized = ok and normalizeQueries(candidate) or nil
    if not normalized then
      record("queries", Result.Failure(Result.Code.INVALID_DATA))
      return
    end
    queries = normalized
    record("queries", Result.Success(true))
    for _, query in ipairs(queries.talents) do
      local rank = (snapshot.activeSpellRanks or {})[query.spellId]
      if rank == nil then rank = 0 end
      local result = Validation.IsNonNegativeInteger(rank) and Result.Success(rank)
        or Result.Failure(Result.Code.INVALID_DATA)
      state.talents[query.id] = record("talents." .. query.id, result)
    end
  end

  local function refreshResources(kind)
    for _, query in ipairs(queries.resources) do
      if kind == nil or kind == query.kind then
        local result
        if query.kind == "power" then
          result = api:ReadPower(query.powerType)
        else
          result = api:ReadAura("player", query.auraId)
          if result.ok and result.capability == Spynon.Contracts.Capability.ADDON_AVAILABLE then
            if result.value.applications > query.maxStacks then
              result = Result.Failure(Result.Code.INVALID_DATA)
            else
              result = Result.Success({ current = result.value.applications, maximum = query.maxStacks })
            end
          end
        end
        state.resources[query.id] = record("resources." .. query.id, result)
      end
    end
  end

  local function refreshAuras(unit)
    for _, query in ipairs(queries.auras) do
      if unit == nil or unit == query.unit then
        state.auras[query.id] = record("auras." .. query.id, api:ReadAura(query.unit, query.spellId))
      end
    end
  end

  local function refreshCooldowns(event)
    for _, query in ipairs(queries.cooldowns) do
      local key = "cooldowns." .. query.id
      local cooldown = record(key, api:ReadCooldown(query.spellId))
      local charges = record(key .. ".charges", api:ReadCharges(query.spellId))
      local status = record(key .. ".status", api:ReadCooldownStatus(query.spellId, event))
      -- These reads have independent capabilities. A public child can survive a
      -- restricted parent, but no old cooldown timing is carried into the new container.
      if not cooldown and (charges or status) then cooldown = {} end
      if cooldown then cooldown.charges, cooldown.status = charges, status end
      state.cooldowns[query.id] = cooldown
    end
  end

  local function refreshUsability()
    for _, query in ipairs(queries.cooldowns) do
      local usable = record("cooldowns." .. query.id .. ".usable", api:ReadUsable(query.spellId))
      if not state.cooldowns[query.id] and usable ~= nil then state.cooldowns[query.id] = {} end
      if state.cooldowns[query.id] then state.cooldowns[query.id].usable = usable end
    end
  end

  local function invalidateVolatile()
    local unavailable = Result.Failure(Result.Code.SECRET_RESTRICTED)
    state.inCombat = false
    record("inCombat", unavailable)
    for _, group in ipairs({ "resources", "auras", "cooldowns" }) do
      state[group] = {}
      for _, query in ipairs(queries[group]) do
        record(group .. "." .. query.id, unavailable)
        if group == "cooldowns" then
          record(group .. "." .. query.id .. ".charges", unavailable)
          record(group .. "." .. query.id .. ".usable", unavailable)
          record(group .. "." .. query.id .. ".status", unavailable)
        end
      end
    end
    volatileInvalidated = true
  end

  function engine.GetSnapshot(_)
    return copy(state)
  end

  function engine.GetDiagnostics(_)
    return copy(diagnostics)
  end

  function engine.GetSelection(_)
    return copy(selection)
  end

  function engine.Subscribe(_, listener)
    assert(type(listener) == "function", "listener must be a function")
    listenerSequence = listenerSequence + 1
    local id = listenerSequence
    listeners[id] = listener
    return function() listeners[id] = nil end
  end

  function engine.HandleEvent(_, event, unit)
    if updating or not api:IsPublic(event) or not EVENTS[event] then return false end
    if POWER_EVENTS[event] or event == "PLAYER_SPECIALIZATION_CHANGED" or event == "UNIT_AURA" then
      if not api:IsPublic(unit) then return false end
      if unit ~= "player" and not (event == "UNIT_AURA" and unit == "target") then return false end
    end
    updating = true
    if FULL_EVENTS[event] then refreshSpec() end
    local full = FULL_EVENTS[event] or event == "PLAYER_REGEN_DISABLED" or event == "PLAYER_REGEN_ENABLED"
      or event == "PLAYER_EQUIPMENT_CHANGED" or volatileInvalidated
    if event == "ADDON_RESTRICTION_STATE_CHANGED" then
      -- This event can precede activation. Never reacquire volatile values in its dispatch.
      invalidateVolatile()
    elseif full then
      state.inCombat = record("inCombat", api:ReadCombat()) or false
      refreshResources()
      refreshAuras()
      refreshCooldowns(event)
      volatileInvalidated = false
    elseif POWER_EVENTS[event] then
      refreshResources("power")
    elseif event == "UNIT_AURA" then
      refreshAuras(unit)
      if unit == "player" then refreshResources("aura_stacks") end
    elseif event == "PLAYER_TARGET_CHANGED" then
      refreshAuras("target")
    elseif event ~= "SPELL_UPDATE_USABLE" then
      refreshCooldowns(event)
    end
    if event ~= "ADDON_RESTRICTION_STATE_CHANGED" then refreshUsability() end
    state.capturedAt = record("capturedAt", api:ReadClock()) or 0
    state.revision = state.revision + 1
    -- Freeze delivery order; callback failures/mutations cannot corrupt another consumer.
    local pending = {}
    for id, listener in pairs(listeners) do pending[#pending + 1] = { id, listener } end
    table.sort(pending, function(a, b) return a[1] < b[1] end)
    for _, entry in ipairs(pending) do
      if listeners[entry[1]] then pcall(entry[2], copy(state), copy(diagnostics)) end
    end
    updating = false
    return true
  end

  return engine
end

Spynon.StateEngineFactory = Factory
Spynon.StateEngine = Factory.Create(Spynon.Compat, Spynon.SpecDetector)
