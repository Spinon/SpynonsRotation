local passed, total, failures = 0, 0, {}
local function eq(a, b) assert(a == b, "expected " .. tostring(b) .. ", got " .. tostring(a)) end
local function test(name, fn)
  total = total + 1
  local ok, err = pcall(fn)
  if ok then passed = passed + 1 else failures[#failures + 1] = name .. ": " .. tostring(err) end
  print((ok and "[PASS] " or "[FAIL] ") .. name)
end
function CreateFrame() return { RegisterEvent = function() end, SetScript = function() end } end
local ns = {}
for line in io.lines("addon/SpynonRotation.toc") do
  local file = line:match("^([^#].*%.lua)%s*$")
  if file then assert(loadfile("addon/" .. file))("SpynonRotation", ns) end
end
local SECRET = setmetatable({}, { __tostring = function() error("secret conversion") end })
local guard = { IsPublic = function(_, value) return not rawequal(value, SECRET) end }
local E, P = ns.RecommendationEngine, ns.RotationProgram
local function literal(value) return { op = "PUSH_LITERAL", value = value } end
local function read(path) return { op = "READ_STATE", capability = "CONDITIONALLY_SECRET", path = path } end
local function fixture()
  local actions = {}
  local state = ns.Contracts.PlayerState.Create({ revision = 1, capturedAt = 10, inCombat = true, specId = 9101 })
  state.capabilities.capturedAt, state.capabilities.inCombat = "ADDON_AVAILABLE", "ADDON_AVAILABLE"
  state.capabilities.specId = "ADDON_AVAILABLE"
  for _, id in ipairs({ "neutral.burst", "neutral.strike", "neutral.filler" }) do
    actions[#actions + 1] = ns.Contracts.Action.Create({ id = id, kind = "spell", label = id,
      gameId = #actions + 100, capability = "ADDON_AVAILABLE" })
    state.cooldowns[id] = { startTime = 0, duration = 0, modRate = 1, isEnabled = true, usable = true }
    state.capabilities["cooldowns." .. id] = "ADDON_AVAILABLE"
    state.capabilities["cooldowns." .. id .. ".usable"] = "ADDON_AVAILABLE"
  end
  state.resources.energy = { current = 60 }
  state.auras.proc = { active = true, expirationTime = 15 }
  state.capabilities["resources.energy"], state.capabilities["auras.proc"] = "ADDON_AVAILABLE", "ADDON_AVAILABLE"
  local rules = {
    { id = "neutral.filler_rule", action = "neutral.filler", priority = 40,
      capability = "ADDON_AVAILABLE", program = { literal(true) } },
    { id = "neutral.burst_rule", action = "neutral.burst", priority = 10,
      capability = "CONDITIONALLY_SECRET", onUnavailable = "skip_rule", program = {
        read({ "resources", "energy", "current" }), literal(50), { op = "COMPARE", operator = "gte" },
        read({ "auras", "proc", "active" }), { op = "TRUTHY" }, { op = "ALL", count = 2 },
      } },
    { id = "neutral.strike_rule", action = "neutral.strike", priority = 20,
      capability = "ADDON_AVAILABLE", program = { literal(true) } },
    { id = "neutral.strike_duplicate", action = "neutral.strike", priority = 30,
      capability = "ADDON_AVAILABLE", program = { literal(true) } },
  }
  return { schemaVersion = 1, entrypoint = "default", lists = { { id = "default", rules = rules } } }, actions, state
end
local function order(output)
  local ids = {}
  for _, rec in ipairs(output.recommendations) do
    eq(ns.Contracts.Recommendation.IsRuntimeSafe(rec), true)
    ids[#ids + 1] = rec.id
    eq(rec.priority, #ids)
  end
  return table.concat(ids, ",")
end
for _, golden in ipairs(assert(loadfile("tests/fixtures/specs/neutral_recommendations.lua"))()) do
  test("golden queue: " .. golden.name, function()
    local bundle, actions, state = fixture()
    state.resources.energy.current, state.auras.proc.active = golden.energy, golden.proc
    if golden.restricted then state.capabilities["resources.energy"] = "CONDITIONALLY_SECRET" end
    eq(order(E.Evaluate(bundle, actions, state, nil, guard)), golden.expected)
    eq(order(E.Evaluate(bundle, actions, state, nil, guard)), golden.expected)
  end)
end
test("public cooldown flags permit our own queue without timing or an official assistant", function()
  local bundle, actions, state = fixture()
  for _, action in ipairs(actions) do
    state.cooldowns[action.id] = { usable = true, status = { isEnabled = true, isActive = false } }
    state.capabilities["cooldowns." .. action.id] = "CONDITIONALLY_SECRET"
    state.capabilities["cooldowns." .. action.id .. ".status"] = "ADDON_AVAILABLE"
  end
  state.capabilities["auras.proc"] = "CONDITIONALLY_SECRET"
  eq(order(E.Evaluate(bundle, actions, state, nil, guard)), "neutral.strike,neutral.filler")
  local reader = ns.StateReader.Create(state, guard)
  eq(reader:Read({"cooldowns","neutral.strike","remains"}), nil)
  eq(reader:Read({"cooldowns","neutral.strike","ready"}), true)
  state.cooldowns["neutral.strike"].status.isActive = true
  eq(order(E.Evaluate(bundle, actions, state, nil, guard)), "neutral.filler")
  state.cooldowns["neutral.filler"].status.isEnabled = false
  eq(#E.Evaluate(bundle, actions, state, nil, guard).recommendations, 0)
end)
test("status readiness respects nested restrictions, secret flags and explicit readiness denial", function()
  local _, _, state = fixture()
  local id, key = "neutral.strike", "cooldowns.neutral.strike"
  state.cooldowns[id] = {usable=true,status={isEnabled=true,isActive=false}}
  state.capabilities[key], state.capabilities[key .. ".status"] = "CONDITIONALLY_SECRET", "ADDON_AVAILABLE"
  local reader = ns.StateReader.Create(state, guard)
  state.capabilities[key .. ".status.isActive"] = "CONDITIONALLY_SECRET"
  eq(reader:Read({"cooldowns",id,"ready"}), nil)
  state.capabilities[key .. ".status.isActive"] = nil
  state.cooldowns[id].status.isActive = SECRET
  eq(reader:Read({"cooldowns",id,"ready"}), nil)
  state.cooldowns[id].status.isActive = false
  state.capabilities[key .. ".ready"] = "CONDITIONALLY_SECRET"
  eq(reader:Read({"cooldowns",id,"ready"}), nil)
  state.capabilities[key .. ".ready"] = nil
  eq(reader:Read({"cooldowns",id,"ready"}), true)
end)

test("zero is false under SimC truthiness and numeric comparisons cover all operators", function()
  local reader = { Read = function() return 0 end }
  eq(P.Evaluate({ read({ "x" }), { op = "TRUTHY" } }, reader), false)
  for op, expected in pairs({ eq = false, ne = true, lt = true, lte = true, gt = false, gte = false }) do
    eq(P.Evaluate({ literal(1), literal(2), { op = "COMPARE", operator = op } }, reader), expected)
  end
end)
test("NOT and ANY never promote unknown or protected inputs", function()
  local reader = { Read = function() return nil end }
  eq(P.Evaluate({ read({ "x" }), { op = "NOT" } }, reader), nil)
  eq(P.Evaluate({ read({ "x" }), literal(true), { op = "ANY", count = 2 } }, reader), nil)
  eq(P.Evaluate({ { op = "HAS_STATE", path = { "x" }, capability = "ADDON_AVAILABLE" }, { op = "NOT" } }, reader), nil)
  eq(P.Evaluate({ literal(false), literal(true), { op = "ANY", count = 2 } }, reader), true)
end)
test("invalid bytecode, types, stack and sparse programs fail closed", function()
  for _, program in ipairs({ {}, { { op = "NOT" } }, { literal(true), literal(false) },
    { literal(true), literal(1), { op = "COMPARE", operator = "eq" } },
    { literal(1), literal(2), { op = "COMPARE", operator = "bad" } },
    { { op = "EXECUTE_LUA" } }, { [1] = literal(true), [3] = literal(false) },
    { { op = "READ_STATE", path = { "x" }, capability = "SIM_ONLY" } },
  }) do eq(P.Evaluate(program, { Read = function() return true end }), nil) end
end)
test("raw secret values remain unavailable even with a public capability", function()
  local bundle, actions, state = fixture()
  state.resources.energy.current = SECRET
  eq(order(E.Evaluate(bundle, actions, state, nil, guard)), "neutral.strike,neutral.filler")
  state.resources.energy = SECRET
  eq(order(E.Evaluate(bundle, actions, state, nil, guard)), "neutral.strike,neutral.filler")
end)
test("most-specific restricted capabilities override public parents", function()
  local _, _, state = fixture()
  state.capabilities["resources.energy.current"] = "CONDITIONALLY_SECRET"
  eq(ns.StateReader.Create(state, guard):Read({ "resources", "energy", "current" }), nil)
end)
test("derived state honors clock, charges and talent provenance", function()
  local _, _, state = fixture()
  state.talents.test, state.capabilities["talents.test"] = 2, "ADDON_AVAILABLE"
  local reader = ns.StateReader.Create(state, guard)
  eq(reader:Read({ "talents", "test", "enabled" }), true)
  eq(reader:Read({ "auras", "proc", "remains" }), 5)
  local cd = state.cooldowns["neutral.strike"]
  cd.startTime, cd.duration = 5, 10
  eq(reader:Read({ "cooldowns", "neutral.strike", "remains" }), 5)
  cd.charges = { currentCharges = 1, maxCharges = 2, cooldownStartTime = 5, cooldownDuration = 10, chargeModRate = 1 }
  eq(reader:Read({ "cooldowns", "neutral.strike", "charges_fractional" }), nil)
  state.capabilities["cooldowns.neutral.strike.charges"] = "ADDON_AVAILABLE"
  eq(reader:Read({ "cooldowns", "neutral.strike", "charges_fractional" }), 1.5)
  state.capabilities.capturedAt = "CONDITIONALLY_SECRET"
  eq(reader:Read({ "auras", "proc", "remains" }), nil)
  eq(reader:Read({ "cooldowns", "neutral.strike", "charges_fractional" }), nil)
end)
test("another player's target aura cannot satisfy an owned debuff condition", function()
  local _, _, state = fixture()
  local reader = ns.StateReader.Create(state, guard)
  state.auras.proc.unit = "target"
  eq(reader:Read({ "auras", "proc", "active" }), nil)
  state.auras.proc.playerOwned = false
  eq(reader:Read({ "auras", "proc", "active" }), nil)
  state.auras.proc.playerOwned = true
  eq(reader:Read({ "auras", "proc", "active" }), true)
  state.auras.proc.active = false
  eq(reader:Read({ "auras", "proc", "active" }), false)
end)
test("cooldown, unusable spells and unknown rate are not recommended", function()
  local bundle, actions, state = fixture()
  state.cooldowns["neutral.burst"].usable = false
  state.cooldowns["neutral.strike"].duration = 20
  state.cooldowns["neutral.filler"].modRate = 2
  eq(#E.Evaluate(bundle, actions, state, nil, guard).recommendations, 0)
end)
test("readiness details explain rejection without relaxing readiness or exposing values", function()
  local bundle, actions, state = fixture()
  state.cooldowns["neutral.burst"].usable = false
  state.cooldowns["neutral.strike"].duration = 20
  state.cooldowns["neutral.filler"].modRate = 2
  local output = E.Evaluate(bundle, actions, state, nil, guard)
  eq(#output.recommendations, 0); eq(output.entrypoint, "default"); eq(output.actionCount, 3)
  eq(output.diagnostics[1].detail, "NOT_USABLE")
  eq(output.diagnostics[2].detail, "COOLDOWN_ACTIVE")
  eq(output.diagnostics[4].detail, "COOLDOWN_UNAVAILABLE")
  state.cooldowns["neutral.burst"].usable = SECRET
  eq(E.Evaluate(bundle, actions, state, nil, guard).diagnostics[1].detail, "USABILITY_UNAVAILABLE")
end)

test("SIM_ONLY, absent actions and missing fallback cannot enter the queue", function()
  local bundle, actions, state = fixture()
  bundle.lists[1].rules[1].capability = "SIM_ONLY"
  bundle.lists[1].rules[2].onUnavailable = nil
  table.remove(actions, 2)
  eq(#E.Evaluate(bundle, actions, state, nil, guard).recommendations, 0)
end)
test("stable identity survives promotion and output does not mutate its inputs", function()
  local bundle, actions, state = fixture()
  local first = E.Evaluate(bundle, actions, state, nil, guard)
  first.recommendations[1].action.label = "mutated"
  state.auras.proc.active = false
  local second = E.Evaluate(bundle, actions, state, nil, guard)
  eq(second.recommendations[1].id, first.recommendations[2].id)
  eq(actions[1].label, "neutral.burst")
  eq(bundle.lists[1].rules[1].priority, 40)
end)
test("queue limit and selected list are explicit and deterministic", function()
  local bundle, actions, state = fixture()
  eq(#E.Evaluate(bundle, actions, state, nil, guard, 1).recommendations, 1)
  eq(#E.Evaluate(bundle, actions, state, nil, guard, 0).recommendations, 0)
  bundle.lists[2] = { id = "other", rules = {} }
  bundle.entrypoint = "other"
  eq(#E.Evaluate(bundle, actions, state, nil, guard).recommendations, 0)
  bundle.entrypoint = "missing"
  eq(E.Evaluate(bundle, actions, state, nil, guard).diagnostics[1].code, "ENTRYPOINT_MISSING")
end)
test("production module chooses audited Hero Tree lists and never assumes one", function()
  local module = ns.Classes.Shaman.Enhancement.Module
  local _, _, state = fixture()
  local context = { mode = "SINGLE_TARGET" }
  eq(module.getRules({ heroTree = { id = 55 } }, state, context).entrypoint, "single_sb")
  eq(module.getRules({ heroTree = { id = 54 } }, state, context).entrypoint, "single_totemic")
  eq(module.getRules({ heroTree = { id = 54 } }, state, { mode = "CLEAVE" }).entrypoint, "aoe")
  eq(next(module.getRules({}, state, context)), nil)
  state.inCombat = false
  eq(next(module.getRules({ heroTree = { id = 55 } }, state, context)), nil)
end)
test("service observes state, clears failed providers and isolates subscribers", function()
  local bundle, actions, state = fixture()
  local callback, selections = nil, { specId = 9101 }
  local source = {
    GetSnapshot = function() return state end,
    GetSelection = function() return selections end,
    Subscribe = function(_, fn) callback = fn; return function() callback = nil end end,
  }
  local module = { getActions = function() return actions end, getRules = function() return bundle end }
  local service = E.Create(source, { GetBySpecId = function() return module end }, guard)
  local received
  service:Subscribe(function(queue) queue[1].action.label = "mutated"; error("isolated") end)
  service:Subscribe(function(queue) received = queue end)
  service:Start()
  local info = service:GetEvaluationInfo()
  eq(info.entrypoint, "default"); eq(info.actionCount, 3); eq(info.stateRevision, state.revision)
  info.context.mode = "mutated"; eq(service:GetEvaluationInfo().context.mode, "AUTO")
  eq(#received, 3)
  eq(received[1].action.label, "neutral.burst")
  selections = nil
  callback(state)
  eq(#service:GetRecommendations(), 0)
  selections = { specId = 9101 }
  module.getRules = function() error("provider error") end
  callback(state)
  eq(service:GetDiagnostics()[1].code, "EVALUATION_FAILED")
  eq(service:GetEvaluationInfo().entrypoint, nil)
  service:Stop()
  eq(callback, nil)
end)
print(string.format("Recommendation engine: %d/%d passed", passed, total))
for _, failure in ipairs(failures) do print(failure) end
if passed ~= total then os.exit(1) end
