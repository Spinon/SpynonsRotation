local total, passed, failures = 0, 0, {}
local function equal(actual, expected)
  assert(actual == expected, "expected " .. tostring(expected) .. ", got " .. tostring(actual))
end
local function test(name, callback)
  total = total + 1
  local ok, message = pcall(callback)
  if ok then passed = passed + 1 else failures[#failures + 1] = name .. ": " .. tostring(message) end
  print((ok and "[PASS] " or "[FAIL] ") .. name)
end

local registeredEvents, onEvent = {}, nil
function CreateFrame()
  return {
    RegisterEvent = function(_, event) registeredEvents[event] = true end,
    SetScript = function(_, _, callback) onEvent = callback end,
  }
end
local namespace = {}
for line in io.lines("addon/SpynonRotation.toc") do
  local path = line:match("^([^#].*%.lua)%s*$")
  if path then assert(loadfile("addon/" .. path))("SpynonRotation", namespace) end
end
local Result = namespace.CompatInternal.Result
local SECRET = setmetatable({}, {
  __tostring = function() error("secret stringification") end,
  __lt = function() error("secret comparison") end,
  __le = function() error("secret comparison") end,
  __add = function() error("secret arithmetic") end,
})

local function environment()
  local calls = { power = 0, aura = 0, cooldown = 0, charges = 0 }
  local data = {
    now = 10, combat = false, current = 40, maximum = 100, exists = true, visible = true, usable = true,
    aura = { applications = 3, duration = 20, expirationTime = 30 },
    cooldown = { startTime = 5, duration = 10, modRate = 1, isEnabled = true },
    charges = { currentCharges = 1, maxCharges = 2, cooldownStartTime = 5, cooldownDuration = 10, chargeModRate = 1 },
  }
  local env = {
    issecretvalue = function(value) return rawequal(value, SECRET) end,
    GetTime = function() return data.now end,
    UnitAffectingCombat = function() return data.combat end,
    UnitExists = function() return data.exists end,
    UnitIsVisible = function() return data.visible end,
    UnitPower = function() calls.power = calls.power + 1; return data.current end,
    UnitPowerMax = function() return data.maximum end,
    C_Secrets = {
      ShouldUnitPowerBeSecret = function() return false end,
      ShouldUnitPowerMaxBeSecret = function() return false end,
      ShouldSpellAuraBeSecret = function() return false end,
      ShouldSpellCooldownBeSecret = function() return false end,
    },
    C_UnitAuras = {
      GetUnitAuraBySpellID = function() calls.aura = calls.aura + 1; return data.aura end,
    },
    C_Spell = {
      IsSpellUsable = function() return data.usable end,
      GetSpellCooldown = function() calls.cooldown = calls.cooldown + 1; return data.cooldown end,
      GetSpellCharges = function() calls.charges = calls.charges + 1; return data.charges end,
    },
  }
  return env, data, calls
end

local function fixture()
  local env, data, calls = environment()
  local queryData = {
    resources = {
      { id = "neutral.stacks", kind = "aura_stacks", auraId = 100, maxStacks = 5 },
      { id = "neutral.power", kind = "power", powerType = 0 },
    },
    auras = {
      { id = "neutral.buff", spellId = 100, unit = "player" },
      { id = "neutral.debuff", spellId = 101, unit = "target" },
    },
    cooldowns = { { id = "neutral.strike", spellId = 102 } },
    talents = { { id = "neutral.selected", spellId = 103 }, { id = "neutral.absent", spellId = 104 } },
  }
  local module = { getStateQueries = function() return queryData end }
  local detection = {
    snapshot = { specialization = { specId = 9101 }, module = module, activeSpellRanks = { [103] = 2 } },
    captures = 0,
  }
  function detection:Capture()
    self.captures = self.captures + 1
    if self.failure then return Result.Failure(self.failure) end
    return Result.Success(self.snapshot)
  end
  local compat = namespace.CompatFactory.Create(env)
  return namespace.StateEngineFactory.Create(compat, detection), data, calls, env, detection, queryData
end

test("state is initialized without pretending any capability is available", function()
  local engine = fixture()
  local state = engine:GetSnapshot()
  equal(state.revision, 0)
  equal(state.specId, nil)
  equal(next(state.capabilities), nil)
  equal(namespace.Contracts.PlayerState.Validate(state), true)
end)

test("full capture produces a valid generic PlayerState", function()
  local engine = fixture()
  equal(engine:HandleEvent("PLAYER_ENTERING_WORLD"), true)
  local state = engine:GetSnapshot()
  equal(namespace.Contracts.PlayerState.Validate(state), true)
  equal(state.revision, 1)
  equal(state.capturedAt, 10)
  equal(state.specId, 9101)
  equal(state.resources["neutral.power"].current, 40)
  equal(state.resources["neutral.stacks"].current, 3)
  equal(state.auras["neutral.buff"].active, true)
  equal(state.cooldowns["neutral.strike"].charges.currentCharges, 1)
  equal(state.talents["neutral.selected"], 2)
  equal(state.talents["neutral.absent"], 0)
  equal(state.capabilities["resources.neutral.power"], "ADDON_AVAILABLE")
end)

test("power events update only power and preserve talents and cooldown observations", function()
  local engine, data, calls, _, detection = fixture()
  engine:HandleEvent("PLAYER_ENTERING_WORLD")
  data.current, data.now = 70, 12
  local auraCalls, cooldownCalls = calls.aura, calls.cooldown
  engine:HandleEvent("UNIT_POWER_UPDATE", "player")
  local state = engine:GetSnapshot()
  equal(state.revision, 2)
  equal(state.resources["neutral.power"].current, 70)
  equal(state.capturedAt, 12)
  equal(calls.aura, auraCalls)
  equal(calls.cooldown, cooldownCalls)
  equal(detection.captures, 1)
end)

test("irrelevant units, events and secret event payloads do not advance revision", function()
  local engine = fixture()
  equal(engine:HandleEvent("UNIT_AURA", "party1"), false)
  equal(engine:HandleEvent("UNIT_POWER_UPDATE", "target"), false)
  equal(engine:HandleEvent("PLAYER_SPECIALIZATION_CHANGED", "party1"), false)
  equal(engine:HandleEvent("UNIT_AURA", SECRET), false)
  equal(engine:HandleEvent(SECRET), false)
  equal(engine:HandleEvent("UNKNOWN"), false)
  equal(engine:GetSnapshot().revision, 0)
end)

test("aura updates are unit-scoped and refresh aura-stack resources", function()
  local engine, data, calls = fixture()
  engine:HandleEvent("PLAYER_ENTERING_WORLD")
  local previous = calls.aura
  data.aura.applications = 4
  engine:HandleEvent("UNIT_AURA", "target")
  equal(calls.aura, previous + 1)
  equal(engine:GetSnapshot().resources["neutral.stacks"].current, 3)
  engine:HandleEvent("UNIT_AURA", "player")
  equal(calls.aura, previous + 3)
  equal(engine:GetSnapshot().resources["neutral.stacks"].current, 4)
  equal(calls.power, 1)
end)

test("lost target clears debuffs while preserving player auras", function()
  local engine, data = fixture()
  engine:HandleEvent("PLAYER_ENTERING_WORLD")
  data.exists = false
  engine:HandleEvent("PLAYER_TARGET_CHANGED")
  local state = engine:GetSnapshot()
  equal(state.auras["neutral.debuff"], nil)
  equal(state.auras["neutral.buff"].active, true)
  equal(engine:GetDiagnostics()["auras.neutral.debuff"].fallback, "SKIP")
end)

test("protected power discards previous value without querying UnitPower", function()
  local engine, _, calls, env = fixture()
  engine:HandleEvent("PLAYER_ENTERING_WORLD")
  env.C_Secrets.ShouldUnitPowerBeSecret = function() return true end
  engine:HandleEvent("UNIT_POWER_UPDATE", "player")
  equal(calls.power, 1)
  equal(engine:GetSnapshot().resources["neutral.power"], nil)
  equal(engine:GetDiagnostics()["resources.neutral.power"].code, "SECRET_RESTRICTED")
end)

test("combat transitions recheck all volatile restrictions and recover after combat", function()
  local engine, data, _, env = fixture()
  engine:HandleEvent("PLAYER_ENTERING_WORLD")
  data.combat = true
  env.C_Secrets.ShouldSpellAuraBeSecret = function() return data.combat end
  env.C_Secrets.ShouldSpellCooldownBeSecret = function() return data.combat end
  engine:HandleEvent("PLAYER_REGEN_DISABLED")
  local state = engine:GetSnapshot()
  equal(state.inCombat, true)
  equal(state.auras["neutral.buff"], nil)
  equal(state.resources["neutral.stacks"], nil)
  equal(state.cooldowns["neutral.strike"], nil)
  data.combat = false
  engine:HandleEvent("PLAYER_REGEN_ENABLED")
  equal(engine:GetSnapshot().cooldowns["neutral.strike"].duration, 10)
end)

test("charges failure is independent of cooldown availability and cannot retain old charges", function()
  local engine, data = fixture()
  engine:HandleEvent("PLAYER_ENTERING_WORLD")
  data.charges.currentCharges = SECRET
  engine:HandleEvent("SPELL_UPDATE_CHARGES")
  local state = engine:GetSnapshot()
  equal(state.cooldowns["neutral.strike"].duration, 10)
  equal(state.cooldowns["neutral.strike"].charges, nil)
  equal(state.capabilities["cooldowns.neutral.strike.charges"], "CONDITIONALLY_SECRET")
end)

test("restriction transition invalidates immediately without trusting pre-activation predicates", function()
  local engine, _, calls, env = fixture()
  engine:HandleEvent("PLAYER_ENTERING_WORLD")
  local auraCalls, cooldownCalls = calls.aura, calls.cooldown
  engine:HandleEvent("ADDON_RESTRICTION_STATE_CHANGED", SECRET)
  local state = engine:GetSnapshot()
  equal(next(state.resources), nil)
  equal(next(state.auras), nil)
  equal(next(state.cooldowns), nil)
  equal(state.talents["neutral.selected"], 2)
  equal(calls.aura, auraCalls)
  equal(calls.cooldown, cooldownCalls)
  equal(calls.power, 1)
  env.C_Secrets.ShouldSpellAuraBeSecret = function() return true end
  engine:HandleEvent("UNIT_POWER_UPDATE", "player")
  equal(engine:GetSnapshot().auras["neutral.buff"], nil)
  equal(engine:GetSnapshot().resources["neutral.power"].current, 40)
  equal(calls.cooldown, cooldownCalls + 1)
end)

test("unavailable spec discards all previous spec data and queries", function()
  local engine, _, calls, _, detection = fixture()
  engine:HandleEvent("PLAYER_ENTERING_WORLD")
  detection.failure = "NO_SELECTION"
  engine:HandleEvent("PLAYER_SPECIALIZATION_CHANGED", "player")
  local state = engine:GetSnapshot()
  equal(state.specId, nil)
  equal(next(state.resources), nil)
  equal(next(state.auras), nil)
  equal(next(state.cooldowns), nil)
  equal(next(state.talents), nil)
  equal(state.capabilities["resources.neutral.power"], nil)
  engine:HandleEvent("UNIT_POWER_UPDATE", "player")
  equal(calls.power, 1)
end)

test("talent changes rebuild queries and remove obsolete watches", function()
  local engine, _, _, _, detection, queries = fixture()
  engine:HandleEvent("PLAYER_ENTERING_WORLD")
  detection.snapshot.activeSpellRanks = { [104] = 1 }
  queries.cooldowns = {}
  engine:HandleEvent("TRAIT_CONFIG_UPDATED")
  local state = engine:GetSnapshot()
  equal(state.talents["neutral.selected"], 0)
  equal(state.talents["neutral.absent"], 1)
  equal(next(state.cooldowns), nil)
  equal(state.capabilities["cooldowns.neutral.strike.charges"], nil)
end)

test("optional query provider preserves compatibility with existing spec modules", function()
  local engine, _, _, _, detection = fixture()
  detection.snapshot.module = {}
  engine:HandleEvent("PLAYER_ENTERING_WORLD")
  equal(engine:GetSnapshot().specId, 9101)
  equal(next(engine:GetSnapshot().resources), nil)
end)

test("invalid or failing module query providers fail closed", function()
  local engine, _, _, _, detection, queries = fixture()
  queries.auras[2].id = queries.auras[1].id
  engine:HandleEvent("PLAYER_ENTERING_WORLD")
  equal(next(engine:GetSnapshot().resources), nil)
  equal(engine:GetDiagnostics().queries.code, "INVALID_DATA")
  detection.snapshot.module.getStateQueries = function() error("bad module") end
  engine:HandleEvent("PLAYER_TALENT_UPDATE")
  equal(engine:GetDiagnostics().queries.fallback, "SKIP")
end)

test("snapshots and notifications have isolated deep ownership", function()
  local engine = fixture()
  local received, receivedPower = 0, nil
  engine:Subscribe(function(state)
    state.resources["neutral.power"].current = 999
    equal(engine:HandleEvent("PLAYER_ENTERING_WORLD"), false)
    error("consumer failure")
  end)
  local unsubscribe = engine:Subscribe(function(state)
    received = received + 1
    receivedPower = state.resources["neutral.power"].current
  end)
  engine:HandleEvent("PLAYER_ENTERING_WORLD")
  equal(received, 1)
  equal(receivedPower, 40)
  local snapshot = engine:GetSnapshot()
  snapshot.cooldowns["neutral.strike"].charges.currentCharges = 999
  equal(engine:GetSnapshot().cooldowns["neutral.strike"].charges.currentCharges, 1)
  equal(engine:GetSnapshot().resources["neutral.power"].current, 40)
  local diagnostics = engine:GetDiagnostics()
  diagnostics.specId.code = "CORRUPTED"
  equal(engine:GetDiagnostics().specId.code, "OK")
  unsubscribe()
  engine:HandleEvent("UNIT_POWER_UPDATE", "player")
  equal(received, 1)
  equal(engine:GetSnapshot().revision, 2)
end)

test("non-array query lists and invalid optional hooks are rejected", function()
  for _, invalid in ipairs({ false, { [1] = { id = "a", spellId = 100 }, [3] = { id = "b", spellId = 101 } } }) do
    local engine, _, _, _, _, queries = fixture()
    queries.talents = invalid
    engine:HandleEvent("PLAYER_ENTERING_WORLD")
    equal(engine:GetDiagnostics().queries.code, "INVALID_DATA")
  end
  local valid = namespace.Contracts.SpecModule.Validate({
    id = "neutral.test", classId = 91, specId = 9101, version = "1", displayName = "Neutral",
    getActions = function() return {} end, getRules = function() return {} end, getStateQueries = true,
  })
  equal(valid, false)
end)

test("conditional success is never promoted into an observable resource", function()
  local compat = namespace.CompatFactory.Create(environment())
  compat.State.ReadAura = function()
    return { ok = true, value = SECRET, capability = "CONDITIONALLY_SECRET", code = "SECRET_RESTRICTED", fallback = "SKIP" }
  end
  local detector = { Capture = function()
    return Result.Success({ specialization = { specId = 9101 }, module = { getStateQueries = function()
      return { resources = { { id = "neutral.stacks", kind = "aura_stacks", auraId = 100, maxStacks = 5 } } }
    end } })
  end }
  local engine = namespace.StateEngineFactory.Create(compat, detector)
  engine:HandleEvent("PLAYER_ENTERING_WORLD")
  equal(engine:GetSnapshot().resources["neutral.stacks"], nil)
  equal(engine:GetDiagnostics()["resources.neutral.stacks"].fallback, "SKIP")
end)

test("safe default scalar values carry an unavailable capability", function()
  local engine, data = fixture()
  data.combat, data.now = SECRET, SECRET
  engine:HandleEvent("PLAYER_ENTERING_WORLD")
  local state = engine:GetSnapshot()
  equal(state.inCombat, false)
  equal(state.capturedAt, 0)
  equal(state.capabilities.inCombat, "CONDITIONALLY_SECRET")
  equal(state.capabilities.capturedAt, "CONDITIONALLY_SECRET")
  equal(namespace.Contracts.PlayerState.Validate(state), true)
end)

test("maximum power has its own predicate and fails before either power API", function()
  local env, _, calls = environment()
  env.C_Secrets.ShouldUnitPowerMaxBeSecret = function() return true end
  local api = namespace.CompatFactory.Create(env).State
  equal(api:ReadPower(0).code, "SECRET_RESTRICTED")
  equal(calls.power, 0)
end)

test("actual secret scalars and fields are guarded even when predicates allow access", function()
  local env, data = environment()
  local api = namespace.CompatFactory.Create(env).State
  data.current = SECRET
  equal(api:ReadPower(0).code, "SECRET_RESTRICTED")
  data.aura.applications = SECRET
  equal(api:ReadAura("player", 100).code, "SECRET_RESTRICTED")
  data.cooldown.duration = SECRET
  equal(api:ReadCooldown(102).code, "SECRET_RESTRICTED")
  data.charges = SECRET
  equal(api:ReadCharges(102).code, "SECRET_RESTRICTED")
end)

test("missing guard, predicates, API errors and invalid numbers all fail closed", function()
  local env, data, calls = environment()
  local api = namespace.CompatFactory.Create(env).State
  env.issecretvalue = nil
  equal(api:ReadPower(0).ok, false)
  equal(calls.power, 0)
  env.issecretvalue = function() return false end
  env.C_Secrets.ShouldUnitPowerBeSecret = nil
  equal(api:ReadPower(0).code, "API_UNAVAILABLE")
  env.C_Secrets.ShouldUnitPowerBeSecret = function() error("opaque exception") end
  equal(api:ReadPower(0).code, "CALL_FAILED")
  env.C_Secrets.ShouldUnitPowerBeSecret = function() return "no" end
  equal(api:ReadPower(0).code, "INVALID_DATA")
  env.C_Secrets.ShouldUnitPowerBeSecret = function() return false end
  data.current = 0 / 0
  equal(api:ReadPower(0).code, "INVALID_DATA")
  data.current = 101
  equal(api:ReadPower(0).code, "INVALID_DATA")
end)

test("aura absence is distinct from unavailable or invisible unit", function()
  local env, data = environment()
  local api = namespace.CompatFactory.Create(env).State
  data.aura = nil
  equal(api:ReadAura("player", 100).value.active, false)
  data.visible = false
  equal(api:ReadAura("target", 101).code, "NO_DATA")
  equal(api:ReadAura("party1", 101).code, "INVALID_ARGUMENT")
end)

test("non-charge spells are distinct from unavailable charge API", function()
  local env, data = environment()
  local api = namespace.CompatFactory.Create(env).State
  data.charges = nil
  equal(api:ReadCharges(102).value.hasCharges, false)
  env.C_Spell.GetSpellCharges = nil
  equal(api:ReadCharges(102).code, "API_UNAVAILABLE")
  data.cooldown = nil
  equal(api:ReadCooldown(102).code, "NO_DATA")
end)

test("module query ordering is deterministic", function()
  local engine, _, _, env = fixture()
  local sequence = {}
  env.C_UnitAuras.GetUnitAuraBySpellID = function(unit, id)
    sequence[#sequence + 1] = unit .. ":" .. id
    return nil
  end
  engine:HandleEvent("PLAYER_ENTERING_WORLD")
  equal(table.concat(sequence, ","), "player:100,player:100,target:101")
end)

test("production module supplies declarative queries with talent-filtered actions", function()
  local module = namespace.Classes.Shaman.Enhancement.Module
  local queries = module.getStateQueries({ activeSpellRanks = {} })
  equal(#queries.resources, 2)
  equal(#queries.talents > 0, true)
  equal(#queries.cooldowns > 0, true)
  for _, query in ipairs(queries.cooldowns) do equal(type(query.spellId), "number") end
  for _, query in ipairs(queries.auras) do equal(query.id, "enhancement.flame_shock") end
end)

test("runtime selection is isolated and cleared together with an unavailable spec", function()
  local engine, _, _, _, detection = fixture()
  engine:HandleEvent("PLAYER_ENTERING_WORLD")
  local selection = engine:GetSelection()
  equal(selection.specId, 9101)
  selection.activeSpellRanks[103] = 999
  equal(engine:GetSelection().activeSpellRanks[103], 2)
  detection.failure = "NO_SELECTION"
  engine:HandleEvent("PLAYER_SPECIALIZATION_CHANGED", "player")
  equal(engine:GetSelection(), nil)
end)

test("usability is observed independently and cleared when protected or restricted", function()
  local engine, data = fixture()
  engine:HandleEvent("PLAYER_ENTERING_WORLD")
  equal(engine:GetSnapshot().cooldowns["neutral.strike"].usable, true)
  data.usable = false
  engine:HandleEvent("SPELL_UPDATE_USABLE")
  equal(engine:GetSnapshot().cooldowns["neutral.strike"].usable, false)
  data.usable = SECRET
  engine:HandleEvent("SPELL_UPDATE_USABLE")
  equal(engine:GetSnapshot().cooldowns["neutral.strike"].usable, nil)
  equal(engine:GetDiagnostics()["cooldowns.neutral.strike.usable"].code, "SECRET_RESTRICTED")
  engine:HandleEvent("ADDON_RESTRICTION_STATE_CHANGED")
  equal(engine:GetSnapshot().capabilities["cooldowns.neutral.strike.usable"], "CONDITIONALLY_SECRET")
end)

test("bootstrap registers and forwards state events only after this addon loads", function()
  equal(registeredEvents.PLAYER_ENTERING_WORLD, nil)
  onEvent(nil, "ADDON_LOADED", "UnrelatedAddon")
  equal(namespace.initialized, false)
  local handled = {}
  namespace.StateEngine = { HandleEvent = function(_, event, unit) handled[#handled + 1] = { event, unit } end }
  namespace.QueueController = { Start = function() end }
  namespace.InGameHarness = { Start = function() end }
  namespace.ConfigController = { Start = function() end }
  namespace.ContextController = { Start = function() end }
  onEvent(nil, "ADDON_LOADED", "SpynonRotation")
  equal(namespace.initialized, true)
  for _, event in ipairs(namespace.StateEngineFactory.Events) do equal(registeredEvents[event], true) end
  onEvent(nil, "UNIT_AURA", "player")
  equal(handled[1][1], "UNIT_AURA")
  equal(handled[1][2], "player")
end)

print(string.format("State engine: %d/%d passed", passed, total))
for _, failure in ipairs(failures) do print(failure) end
if passed ~= total then os.exit(1) end
