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

local SpecModule = namespace.Contracts.SpecModule
local SpecRegistry = namespace.SpecRegistry

local function createModule(id, classId, specId)
  return SpecModule.Create({
    id = id,
    classId = classId,
    specId = specId,
    displayName = id,
    version = "test-1",
    getActions = function()
      return {}
    end,
    getRules = function()
      return {}
    end,
  })
end

test("TOC exposes a registry factory and default registry", function()
  assertTrue(type(SpecRegistry.Create) == "function")
  assertTrue(type(namespace.Specs.Register) == "function")
  assertEqual(namespace.Specs:Count(), 0)
end)

test("registry indexes a valid module by id and specId", function()
  local registry = SpecRegistry.Create()
  local module = createModule("vanguard.alpha", 91, 9101)
  local registered, registrationError = registry:Register(module)
  assertNil(registrationError)
  assertTrue(registered == module)
  assertTrue(registry:GetById("vanguard.alpha") == module)
  assertTrue(registry:GetBySpecId(9101) == module)
  assertEqual(registry:Count(), 1)
end)

test("registry rejects descriptors outside the SpecModule contract", function()
  local registry = SpecRegistry.Create()
  local registered, registrationError = registry:Register({
    id = "invalid.module",
    specId = 9101,
  })
  assertNil(registered)
  assertContains(registrationError, "invalid SpecModule")
  assertEqual(registry:Count(), 0)
end)

test("registry rejects duplicate module ids deterministically", function()
  local registry = SpecRegistry.Create()
  local original = createModule("vanguard.alpha", 91, 9101)
  local duplicate = createModule("vanguard.alpha", 92, 9201)
  registry:Register(original)
  local registered, registrationError = registry:Register(duplicate)
  assertNil(registered)
  assertEqual(registrationError, "duplicate SpecModule id: vanguard.alpha")
  assertTrue(registry:GetById("vanguard.alpha") == original)
  assertEqual(registry:Count(), 1)
end)

test("registry rejects duplicate specIds without replacing the owner", function()
  local registry = SpecRegistry.Create()
  local original = createModule("vanguard.alpha", 91, 9101)
  local conflicting = createModule("sentinel.beta", 92, 9101)
  registry:Register(original)
  local registered, registrationError = registry:Register(conflicting)
  assertNil(registered)
  assertEqual(registrationError, "duplicate SpecModule specId: 9101 already registered by vanguard.alpha")
  assertTrue(registry:GetBySpecId(9101) == original)
  assertEqual(registry:Count(), 1)
end)

test("missing id lookup returns an explicit result", function()
  local registry = SpecRegistry.Create()
  local module, lookupError = registry:GetById("vanguard.missing")
  assertNil(module)
  assertEqual(lookupError, "SpecModule not found for id: vanguard.missing")
end)

test("missing specId lookup returns an explicit result", function()
  local registry = SpecRegistry.Create()
  local module, lookupError = registry:GetBySpecId(9999)
  assertNil(module)
  assertEqual(lookupError, "SpecModule not found for specId: 9999")
end)

test("invalid lookup keys return validation errors", function()
  local registry = SpecRegistry.Create()
  local byId, idError = registry:GetById(91)
  local bySpecId, specIdError = registry:GetBySpecId(0)
  assertNil(byId)
  assertContains(idError, "id must")
  assertNil(bySpecId)
  assertContains(specIdError, "specId must")
end)

test("list order is stable regardless of registration order", function()
  local registry = SpecRegistry.Create()
  registry:Register(createModule("vanguard.zeta", 91, 9103))
  registry:Register(createModule("sentinel.beta", 92, 9201))
  registry:Register(createModule("vanguard.alpha", 91, 9101))
  local modules = registry:List()
  assertEqual(modules[1].id, "sentinel.beta")
  assertEqual(modules[2].id, "vanguard.alpha")
  assertEqual(modules[3].id, "vanguard.zeta")
end)

test("list returns a copy of registry ordering", function()
  local registry = SpecRegistry.Create()
  registry:Register(createModule("vanguard.alpha", 91, 9101))
  local first = registry:List()
  first[1] = nil
  local second = registry:List()
  assertEqual(#second, 1)
  assertEqual(second[1].id, "vanguard.alpha")
end)

test("register invalidates an already built list cache", function()
  local registry = SpecRegistry.Create()
  registry:Register(createModule("vanguard.zeta", 91, 9103))
  assertEqual(#registry:List(), 1)
  registry:Register(createModule("vanguard.alpha", 91, 9101))
  local modules = registry:List()
  assertEqual(#modules, 2)
  assertEqual(modules[1].id, "vanguard.alpha")
  assertEqual(modules[2].id, "vanguard.zeta")
end)

test("registry instances keep isolated ownership", function()
  local first = SpecRegistry.Create()
  local second = SpecRegistry.Create()
  first:Register(createModule("vanguard.alpha", 91, 9101))
  assertEqual(first:Count(), 1)
  assertEqual(second:Count(), 0)
end)

test("neutral fixture plugs into the default registry without Core changes", function()
  local fixture, fixtureError = loadfile("tests/fixtures/specs/neutral_vanguard.lua")
  if not fixture then
    error(fixtureError)
  end
  fixture("NeutralFixture", namespace)
  local module, lookupError = namespace.Specs:GetById("vanguard.neutral")
  assertNil(lookupError)
  assertEqual(module.specId, 9101)
  assertEqual(#module.getActions(), 0)
  assertEqual(#module.getRules(), 0)
end)

if #failures > 0 then
  print("")
  print("Failures:")
  for _, failure in ipairs(failures) do
    print("- " .. failure)
  end
  print("")
  print(string.format("Spec registry: %d/%d passed", passed, total))
  os.exit(1)
end

print("")
print(string.format("Spec registry: %d/%d passed", passed, total))
