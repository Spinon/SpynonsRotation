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
function frameStub:RegisterEvent() end
function frameStub:SetScript() end

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

local fixtureFactory, fixtureError = loadfile("tests/fixtures/specs/neutral_talent_environment.lua")
if fixtureFactory == nil then
  error(fixtureError)
end
local createEnvironment = fixtureFactory()

local Capability = namespace.Contracts.Capability
local SpecDetectorFactory = namespace.SpecDetectorFactory
local Status = SpecDetectorFactory.Status
local Code = SpecDetectorFactory.Code

local function createModule(classId)
  local module, moduleError = namespace.Contracts.SpecModule.Create({
    id = "vanguard.neutral",
    classId = classId or 91,
    specId = 9101,
    displayName = "Neutral Vanguard",
    version = "fixture-2",
    getActions = function()
      error("SpecDetector must not evaluate actions")
    end,
    getRules = function()
      error("SpecDetector must not evaluate rules")
    end,
  })
  if module == nil then
    error(moduleError)
  end
  return module
end

local function createDetector(environment, module)
  local registry = namespace.SpecRegistry.Create()
  if module ~= false then
    local registered, registrationError = registry:Register(module or createModule())
    if registered == nil then
      error(registrationError)
    end
  end
  local compat = namespace.CompatFactory.Create(environment)
  return SpecDetectorFactory.Create(compat, registry)
end

local function containsTalent(snapshot, nodeId)
  for index = 1, #snapshot.talents do
    if snapshot.talents[index].nodeId == nodeId then
      return snapshot.talents[index]
    end
  end
  return nil
end

test("TOC exposes default and injectable spec detectors", function()
  assertTrue(type(namespace.SpecDetector.Capture) == "function")
  assertTrue(type(SpecDetectorFactory.Create) == "function")
  assertEqual(Status.READY, "READY")
end)

test("pending specialization initialization returns an explicit safe state", function()
  local environment = createEnvironment()
  environment.C_SpecializationInfo.IsInitialized = function()
    return false
  end
  environment.C_SpecializationInfo.GetSpecialization = function()
    error("must not be called")
  end

  local result = createDetector(environment):Capture()
  assertFalse(result.ok)
  assertEqual(result.status, Status.PENDING)
  assertEqual(result.code, Code.SPECIALIZATION_NOT_INITIALIZED)
  assertEqual(result.capability, Capability.ADDON_AVAILABLE)
  assertEqual(result.fallback, "SKIP")
end)

test("Compat failures retain their code and stop the snapshot", function()
  local environment = createEnvironment()
  environment.C_SpecializationInfo.GetSpecialization = nil
  local result = createDetector(environment):Capture()
  assertFalse(result.ok)
  assertEqual(result.status, Status.UNAVAILABLE)
  assertEqual(result.code, "API_UNAVAILABLE")
  assertEqual(result.stage, "active_spec_index")
  assertEqual(result.fallback, "SKIP")
end)

test("an unregistered active spec is explicit and skips talent reads", function()
  local environment = createEnvironment()
  environment.C_ClassTalents.GetActiveConfigID = function()
    error("must not be called")
  end
  local result = createDetector(environment, false):Capture()
  assertFalse(result.ok)
  assertEqual(result.status, Status.UNREGISTERED)
  assertEqual(result.code, Code.SPEC_MODULE_NOT_REGISTERED)
  assertEqual(result.stage, "spec_registry")
end)

test("registry module class must match the detected class", function()
  local environment = createEnvironment()
  local result = createDetector(environment, createModule(92)):Capture()
  assertFalse(result.ok)
  assertEqual(result.status, Status.UNAVAILABLE)
  assertEqual(result.code, Code.SPEC_MODULE_CLASS_MISMATCH)
end)

test("valid fixture produces normalized spec, config and tree metadata", function()
  local environment = createEnvironment()
  local result = createDetector(environment):Capture()
  assertTrue(result.ok)
  assertEqual(result.status, Status.READY)
  assertEqual(result.capability, Capability.ADDON_AVAILABLE)
  assertEqual(result.value.specialization.specId, 9101)
  assertEqual(result.value.specialization.classId, 91)
  assertEqual(result.value.module.id, "vanguard.neutral")
  assertEqual(result.value.config.id, 7001)
  assertEqual(result.value.config.name, "Neutral Loadout")
  assertEqual(result.value.config.treeIds[1], 6001)
  assertEqual(result.value.config.treeIds[2], 6002)
  assertEqual(result.value.specTreeId, 6001)
  assertEqual(result.value.trees[1].kind, "CLASS_SPEC")
  assertEqual(result.value.trees[2].kind, "CONFIG")
  assertEqual(result.value.heroTree.id, 8001)
end)

test("only active and available talent nodes become snapshot entries", function()
  local environment = createEnvironment()
  local snapshot = createDetector(environment):Capture().value
  assertEqual(#snapshot.talents, 5)
  assertEqual(snapshot.talents[1].nodeId, 101)
  assertEqual(snapshot.talents[2].nodeId, 102)
  assertEqual(snapshot.talents[3].nodeId, 103)
  assertEqual(snapshot.talents[4].nodeId, 106)
  assertEqual(snapshot.talents[5].nodeId, 108)
  assertNil(containsTalent(snapshot, 104))
  assertNil(containsTalent(snapshot, 105))
  assertNil(containsTalent(snapshot, 107))
  assertNil(containsTalent(snapshot, 109))
end)

test("choice nodes read only the selected active entry", function()
  local environment, calls = createEnvironment()
  local snapshot = createDetector(environment):Capture().value
  local selected = containsTalent(snapshot, 102)
  assertEqual(selected.entryId, 1003)
  assertEqual(selected.spellId, 3003)
  assertEqual(selected.name, "Selected Choice")
  assertNil(calls.entries[1002])
  assertEqual(calls.entries[1003], 1)
end)

test("ranks and active spell availability are normalized", function()
  local environment = createEnvironment()
  local snapshot = createDetector(environment):Capture().value
  assertEqual(containsTalent(snapshot, 103).rank, 2)
  assertEqual(snapshot.activeSpellRanks[3001], 1)
  assertEqual(snapshot.activeSpellRanks[3003], 1)
  assertEqual(snapshot.activeSpellRanks[3004], 2)
  assertEqual(snapshot.activeSpellRanks[3006], 1)
  assertNil(snapshot.activeSpellRanks[3002])
  assertNil(snapshot.activeSpellRanks[3005])
  assertNil(snapshot.activeSpellRanks[3007])
  assertNil(snapshot.activeSpellRanks[3009])
end)

test("zero active rank cannot enable an entry", function()
  local environment, _, nodes = createEnvironment()
  nodes[101].activeRank = 0
  local snapshot = createDetector(environment):Capture().value
  assertNil(containsTalent(snapshot, 101))
  assertNil(snapshot.activeSpellRanks[3001])
end)

test("hero nodes and subtree selection refer only to the active hero tree", function()
  local environment = createEnvironment()
  local snapshot = createDetector(environment):Capture().value
  local heroTalent = containsTalent(snapshot, 106)
  local selection = containsTalent(snapshot, 108)
  assertEqual(heroTalent.subTreeId, 8001)
  assertEqual(heroTalent.spellId, 3006)
  assertEqual(selection.kind, "SUBTREE_SELECTION")
  assertEqual(selection.selectedSubTreeId, 8001)
end)

test("a character without a hero selection excludes all subtree talents", function()
  local environment, _, nodes = createEnvironment()
  environment.C_ClassTalents.GetActiveHeroTalentSpec = function()
    return nil
  end
  nodes[108].activeRank = 0
  nodes[108].activeEntry = nil

  local result = createDetector(environment):Capture()
  assertTrue(result.ok)
  assertNil(result.value.heroTree)
  assertNil(containsTalent(result.value, 106))
  assertNil(result.value.activeSpellRanks[3006])
end)

test("malformed config tree IDs fail closed", function()
  local environment = createEnvironment()
  environment.C_Traits.GetConfigInfo = function()
    return { ID = 7001, treeIDs = { "invalid" } }
  end
  local result = createDetector(environment):Capture()
  assertFalse(result.ok)
  assertEqual(result.code, Code.INVALID_DATA)
  assertEqual(result.stage, "config_info")
  assertEqual(result.fallback, "SKIP")
end)

test("missing listed node data fails instead of silently enabling abilities", function()
  local environment = createEnvironment()
  environment.C_Traits.GetNodeInfo = function(_, nodeId)
    if nodeId == 103 then
      return nil
    end
    return {
      ID = nodeId,
      isAvailable = false,
    }
  end
  local result = createDetector(environment):Capture()
  assertFalse(result.ok)
  assertEqual(result.code, "NO_DATA")
  assertEqual(result.stage, "trait_node")
end)

test("invalid injected dependencies return a controlled result", function()
  local result = SpecDetectorFactory.Create({}, {}):Capture()
  assertFalse(result.ok)
  assertEqual(result.code, Code.INVALID_DEPENDENCY)
  assertEqual(result.stage, "dependencies")
  assertEqual(result.fallback, "SKIP")
end)

if #failures > 0 then
  print("")
  print("Failures:")
  for _, failureMessage in ipairs(failures) do
    print("- " .. failureMessage)
  end
  print("")
  print(string.format("Spec detector: %d/%d passed", passed, total))
  os.exit(1)
end

print("")
print(string.format("Spec detector: %d/%d passed", passed, total))
