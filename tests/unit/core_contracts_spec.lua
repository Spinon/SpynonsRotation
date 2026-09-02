local total = 0
local passed = 0
local failures = {}

local function fail(message)
  error(message, 2)
end

local function assertTrue(value, message)
  if value ~= true then
    fail(message or "expected true")
  end
end

local function assertFalse(value, message)
  if value ~= false then
    fail(message or "expected false")
  end
end

local function assertEqual(actual, expected, message)
  if actual ~= expected then
    fail((message or "values differ") .. ": expected " .. tostring(expected) .. ", got " .. tostring(actual))
  end
end

local function assertNil(value, message)
  if value ~= nil then
    fail((message or "expected nil") .. ": got " .. tostring(value))
  end
end

local function assertContains(value, fragment, message)
  if type(value) ~= "string" or not value:find(fragment, 1, true) then
    fail((message or "string does not contain fragment") .. ": " .. tostring(value))
  end
end

local function test(name, callback)
  total = total + 1
  local success, testError = pcall(callback)
  if success then
    passed = passed + 1
    print("[PASS] " .. name)
  else
    failures[#failures + 1] = name .. ": " .. tostring(testError)
    print("[FAIL] " .. name)
  end
end

local frameStub = {}
function frameStub:RegisterEvent(event)
  self.registeredEvent = event
end
function frameStub:SetScript(scriptName, callback)
  self[scriptName] = callback
end

function CreateFrame()
  return frameStub
end

local namespace = {}
for line in io.lines("addon/SpynonRotation.toc") do
  local addonPath = line:match("^([^#].*%.lua)%s*$")
  if addonPath then
    local chunk, loadError = loadfile("addon/" .. addonPath)
    if not chunk then
      error(loadError)
    end
    chunk("SpynonRotation", namespace)
  end
end

local Contracts = namespace.Contracts
local Capability = Contracts.Capability
local CombatContext = Contracts.CombatContext
local Action = Contracts.Action
local Recommendation = Contracts.Recommendation
local PlayerState = Contracts.PlayerState
local SpecModule = Contracts.SpecModule

local function createAction(overrides)
  local value = {
    id = "spell:1001",
    kind = Action.Kind.SPELL,
    label = "Primary Strike",
    capability = Capability.ADDON_AVAILABLE,
    gameId = 1001,
    icon = 2001,
    tags = { "damage", "primary" },
  }

  if overrides then
    for key, entry in pairs(overrides) do
      value[key] = entry
    end
  end

  return Action.Create(value)
end

test("TOC loads namespace and all six public contracts", function()
  assertEqual(namespace.name, "SpynonRotation")
  assertEqual(frameStub.registeredEvent, "ADDON_LOADED")
  assertTrue(type(Capability) == "table")
  assertTrue(type(CombatContext) == "table")
  assertTrue(type(Action) == "table")
  assertTrue(type(Recommendation) == "table")
  assertTrue(type(PlayerState) == "table")
  assertTrue(type(SpecModule) == "table")
end)

test("Capability exposes the three canonical values", function()
  assertEqual(Capability.ADDON_AVAILABLE, "ADDON_AVAILABLE")
  assertEqual(Capability.SIM_ONLY, "SIM_ONLY")
  assertEqual(Capability.CONDITIONALLY_SECRET, "CONDITIONALLY_SECRET")
end)

test("Capability validates known and rejects unknown values", function()
  assertTrue(Capability.IsValid(Capability.ADDON_AVAILABLE))
  assertFalse(Capability.IsValid("UNKNOWN"))
end)

test("Capability only allows directly observable runtime state", function()
  assertTrue(Capability.AllowsRuntime(Capability.ADDON_AVAILABLE))
  assertFalse(Capability.AllowsRuntime(Capability.SIM_ONLY))
  assertFalse(Capability.AllowsRuntime(Capability.CONDITIONALLY_SECRET))
end)

test("Capability identifies when a safe fallback is required", function()
  assertTrue(Capability.RequiresFallback(Capability.CONDITIONALLY_SECRET))
  assertFalse(Capability.RequiresFallback(Capability.ADDON_AVAILABLE))
end)

test("CombatContext creates explicit modes deterministically", function()
  local context, contextError = CombatContext.Create({ mode = CombatContext.CLEAVE })
  assertNil(contextError)
  assertEqual(context.mode, CombatContext.CLEAVE)
  assertEqual(context.resolvedMode, CombatContext.CLEAVE)
  assertFalse(context.isOverride)
end)

test("CombatContext resolves AUTO from an observable signal", function()
  local context = CombatContext.Create({
    mode = CombatContext.AUTO,
    resolvedMode = CombatContext.AOE,
    capability = Capability.ADDON_AVAILABLE,
  })
  assertEqual(CombatContext.Resolve(context), CombatContext.AOE)
end)

test("CombatContext uses a concrete safe fallback", function()
  local context = CombatContext.Create({
    mode = CombatContext.AUTO,
    capability = Capability.CONDITIONALLY_SECRET,
  })
  assertEqual(CombatContext.Resolve(context, CombatContext.SINGLE_TARGET), CombatContext.SINGLE_TARGET)
end)

test("CombatContext rejects AUTO without resolution or fallback", function()
  local context = CombatContext.Create({ mode = CombatContext.AUTO })
  local resolved, resolveError = CombatContext.Resolve(context)
  assertNil(resolved)
  assertContains(resolveError, "requires")
end)

test("CombatContext rejects contradictory explicit modes", function()
  local context, contextError = CombatContext.Create({
    mode = CombatContext.CLEAVE,
    resolvedMode = CombatContext.AOE,
  })
  assertNil(context)
  assertContains(contextError, "must match")
end)

test("Action creates a generic spell action", function()
  local action, actionError = createAction()
  assertNil(actionError)
  assertEqual(action.id, "spell:1001")
  assertEqual(action.kind, Action.Kind.SPELL)
  assertEqual(action.gameId, 1001)
end)

test("Action supports non-spell utility without special cases", function()
  local action, actionError = Action.Create({
    id = "utility:marker",
    kind = Action.Kind.UTILITY,
    label = "Place Marker",
    capability = Capability.ADDON_AVAILABLE,
    icon = "Interface/Icons/INV_Misc_QuestionMark",
  })
  assertNil(actionError)
  assertEqual(action.kind, Action.Kind.UTILITY)
  assertNil(action.gameId)
end)

test("Action copies tag arrays instead of retaining input ownership", function()
  local tags = { "damage" }
  local action = createAction({ tags = tags })
  tags[1] = "mutated"
  assertEqual(action.tags[1], "damage")
end)

test("Action rejects missing stable identity", function()
  local action, actionError = createAction({ id = "" })
  assertNil(action)
  assertContains(actionError, "id")
end)

test("Action rejects unknown kinds", function()
  local action, actionError = createAction({ kind = "combo" })
  assertNil(action)
  assertContains(actionError, "kind")
end)

test("Action rejects unknown capabilities", function()
  local action, actionError = createAction({ capability = "MAYBE" })
  assertNil(action)
  assertContains(actionError, "capability")
end)

test("Action rejects undeclared spec-specific fields", function()
  local action, actionError = createAction({ classMechanic = 5 })
  assertNil(action)
  assertContains(actionError, "unknown field")
end)

test("Recommendation references a validated Action", function()
  local action = createAction()
  local recommendation, recommendationError = Recommendation.Create({
    id = "recommendation:primary",
    action = action,
    priority = 1,
    reason = {
      code = "ready_now",
      text = "Available now",
      capability = Capability.ADDON_AVAILABLE,
    },
  })
  assertNil(recommendationError)
  assertTrue(recommendation.action == action)
  assertEqual(recommendation.priority, 1)
end)

test("Recommendation keeps visual identity independent from priority", function()
  local action = createAction()
  local first = Recommendation.Create({
    id = "recommendation:stable",
    action = action,
    priority = 1,
    reason = { code = "first", capability = Capability.ADDON_AVAILABLE },
  })
  local moved = Recommendation.Create({
    id = "recommendation:stable",
    action = action,
    priority = 4,
    reason = { code = "moved", capability = Capability.ADDON_AVAILABLE },
  })
  assertEqual(first.id, moved.id)
  assertEqual(moved.priority, 4)
end)

test("Recommendation is runtime-safe only with observable inputs", function()
  local action = createAction()
  local recommendation = Recommendation.Create({
    id = "recommendation:safe",
    action = action,
    priority = 1,
    reason = { code = "observable", capability = Capability.ADDON_AVAILABLE },
  })
  assertTrue(Recommendation.IsRuntimeSafe(recommendation))
end)

test("Recommendation marks simulation-only reasons unsafe at runtime", function()
  local action = createAction()
  local recommendation = Recommendation.Create({
    id = "recommendation:sim",
    action = action,
    priority = 1,
    reason = { code = "future_knowledge", capability = Capability.SIM_ONLY },
  })
  assertFalse(Recommendation.IsRuntimeSafe(recommendation))
end)

test("Recommendation rejects a missing Action", function()
  local recommendation, recommendationError = Recommendation.Create({
    id = "recommendation:invalid",
    priority = 1,
    reason = { code = "invalid", capability = Capability.ADDON_AVAILABLE },
  })
  assertNil(recommendation)
  assertContains(recommendationError, "action is invalid")
end)

test("Recommendation rejects non-positive priorities", function()
  local action = createAction()
  local recommendation, recommendationError = Recommendation.Create({
    id = "recommendation:invalid-priority",
    action = action,
    priority = 0,
    reason = { code = "invalid", capability = Capability.ADDON_AVAILABLE },
  })
  assertNil(recommendation)
  assertContains(recommendationError, "priority")
end)

test("PlayerState creates a normalized empty snapshot", function()
  local state, stateError = PlayerState.Create({
    revision = 0,
    capturedAt = 0,
    inCombat = false,
  })
  assertNil(stateError)
  assertEqual(state.revision, 0)
  assertTrue(type(state.resources) == "table")
  assertTrue(type(state.auras) == "table")
  assertTrue(type(state.cooldowns) == "table")
  assertTrue(type(state.talents) == "table")
end)

test("PlayerState copies top-level observable maps", function()
  local resources = { primary = { current = 10 } }
  local state = PlayerState.Create({
    revision = 1,
    capturedAt = 12.5,
    inCombat = true,
    resources = resources,
  })
  resources.secondary = { current = 3 }
  assertNil(state.resources.secondary)
  assertEqual(state.resources.primary.current, 10)
end)

test("PlayerState records capability provenance by signal", function()
  local state, stateError = PlayerState.Create({
    revision = 2,
    capturedAt = 20,
    inCombat = true,
    capabilities = {
      resource_primary = Capability.ADDON_AVAILABLE,
      target_context = Capability.CONDITIONALLY_SECRET,
    },
  })
  assertNil(stateError)
  assertEqual(state.capabilities.target_context, Capability.CONDITIONALLY_SECRET)
end)

test("PlayerState rejects invalid revisions", function()
  local state, stateError = PlayerState.Create({
    revision = -1,
    capturedAt = 0,
    inCombat = false,
  })
  assertNil(state)
  assertContains(stateError, "revision")
end)

test("PlayerState rejects unknown capability provenance", function()
  local state, stateError = PlayerState.Create({
    revision = 1,
    capturedAt = 0,
    inCombat = false,
    capabilities = { target_context = "UNKNOWN" },
  })
  assertNil(state)
  assertContains(stateError, "target_context")
end)

test("SpecModule creates a generic plug-in descriptor", function()
  local action = createAction()
  local module, moduleError = SpecModule.Create({
    id = "vanguard.example",
    classId = 1,
    specId = 101,
    displayName = "Example Vanguard",
    version = "1",
    getActions = function()
      return { action }
    end,
    getRules = function()
      return {}
    end,
  })
  assertNil(moduleError)
  assertEqual(module.id, "vanguard.example")
  assertEqual(module.getActions()[1].id, action.id)
end)

test("SpecModule rejects non-namespaced IDs", function()
  local module, moduleError = SpecModule.Create({
    id = "example",
    classId = 1,
    specId = 101,
    displayName = "Example",
    version = "1",
    getActions = function() return {} end,
    getRules = function() return {} end,
  })
  assertNil(module)
  assertContains(moduleError, "class.spec")
end)

test("SpecModule requires action and rule providers", function()
  local module, moduleError = SpecModule.Create({
    id = "vanguard.example",
    classId = 1,
    specId = 101,
    displayName = "Example",
    version = "1",
    getActions = true,
    getRules = function() return {} end,
  })
  assertNil(module)
  assertContains(moduleError, "getActions")
end)

if #failures > 0 then
  print("")
  print("Failures:")
  for _, failure in ipairs(failures) do
    print("- " .. failure)
  end
  print("")
  print(string.format("Core contracts: %d/%d passed", passed, total))
  os.exit(1)
end

print("")
print(string.format("Core contracts: %d/%d passed", passed, total))
