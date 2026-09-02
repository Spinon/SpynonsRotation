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

local Capability = namespace.Contracts.Capability
local Result = namespace.CompatInternal.Result
local CompatFactory = namespace.CompatFactory

local function createEnvironment()
  return {
    GetBuildInfo = function()
      return "12.1.0", "69587", "Sep 2 2026", 120100, "12.1.0", "Release"
    end,
    C_SpecializationInfo = {
      IsInitialized = function()
        return true
      end,
      GetSpecialization = function()
        return 2
      end,
      GetSpecializationInfo = function(index)
        return 9101, "Neutral", "Fixture specialization", 1001, "DAMAGER", index
      end,
      GetClassIDFromSpecID = function()
        return 91
      end,
    },
    C_ClassTalents = {
      GetActiveConfigID = function()
        return 7001
      end,
      GetActiveHeroTalentSpec = function()
        return 8001
      end,
      GetTraitTreeForSpec = function()
        return 6001
      end,
    },
    C_Traits = {
      GetConfigInfo = function(configId)
        return { ID = configId, treeIDs = { 6001 } }
      end,
      GetTreeNodes = function()
        return { 1, 2, 3 }
      end,
      GetNodeInfo = function(configId, nodeId)
        return { configId = configId, ID = nodeId, activeRank = 1 }
      end,
      GetEntryInfo = function(configId, entryId)
        return { configId = configId, ID = entryId, definitionID = 3001 }
      end,
      GetDefinitionInfo = function(definitionId)
        return { ID = definitionId, spellID = 4001 }
      end,
    },
    C_Secrets = {
      HasSecretRestrictions = function()
        return false
      end,
      ShouldCooldownsBeSecret = function()
        return false
      end,
      ShouldSpellCooldownBeSecret = function()
        return false
      end,
      ShouldAurasBeSecret = function()
        return false
      end,
      ShouldSpellAuraBeSecret = function()
        return false
      end,
      ShouldUnitPowerBeSecret = function()
        return false
      end,
    },
  }
end

test("TOC exposes the default Compat facade and injectable factory", function()
  assertTrue(type(namespace.Compat) == "table")
  assertTrue(type(CompatFactory.Create) == "function")
  assertTrue(type(namespace.Compat.Build.GetInfo) == "function")
  assertTrue(type(namespace.Compat.Specialization.GetActiveIndex) == "function")
  assertTrue(type(namespace.Compat.Talents.GetActiveConfigId) == "function")
  assertTrue(type(namespace.Compat.Secrets.GetRestrictionState) == "function")
end)

test("missing APIs do not break facade creation", function()
  local compat = CompatFactory.Create({})
  local result = compat.Build:GetInfo()
  assertFalse(result.ok)
  assertEqual(result.code, Result.Code.API_UNAVAILABLE)
  assertEqual(result.capability, Capability.CONDITIONALLY_SECRET)
  assertEqual(result.fallback, Result.Fallback.SKIP)
end)

test("API exceptions become controlled failures without leaking details", function()
  local compat = CompatFactory.Create({
    GetBuildInfo = function()
      error("private failure details")
    end,
  })
  local result = compat.Build:GetInfo()
  assertFalse(result.ok)
  assertEqual(result.code, Result.Code.CALL_FAILED)
  assertNil(result.error)
  assertNil(result.value)
end)

test("Build returns normalized current client metadata", function()
  local result = CompatFactory.Create(createEnvironment()).Build:GetInfo()
  assertTrue(result.ok)
  assertEqual(result.capability, Capability.ADDON_AVAILABLE)
  assertEqual(result.value.version, "12.1.0")
  assertEqual(result.value.number, "69587")
  assertEqual(result.value.interface, 120100)
end)

test("Build rejects malformed return data", function()
  local compat = CompatFactory.Create({
    GetBuildInfo = function()
      return "12.1.0", nil, "Sep 2 2026", 120100, "12.1.0", "Release"
    end,
  })
  local result = compat.Build:GetInfo()
  assertFalse(result.ok)
  assertEqual(result.code, Result.Code.INVALID_DATA)
end)

test("Specialization exposes initialization state", function()
  local compat = CompatFactory.Create(createEnvironment())
  local result = compat.Specialization:IsInitialized()
  assertTrue(result.ok)
  assertTrue(result.value)
end)

test("Specialization reads active index, metadata and class independently", function()
  local compat = CompatFactory.Create(createEnvironment())
  local active = compat.Specialization:GetActiveIndex()
  local info = compat.Specialization:GetInfo(active.value)
  local class = compat.Specialization:GetClassId(info.value.specId)
  assertEqual(active.value, 2)
  assertEqual(info.value.specId, 9101)
  assertEqual(info.value.name, "Neutral")
  assertEqual(class.value, 91)
end)

test("Specialization treats zero active index as explicit absence", function()
  local environment = createEnvironment()
  environment.C_SpecializationInfo.GetSpecialization = function()
    return 0
  end
  local result = CompatFactory.Create(environment).Specialization:GetActiveIndex()
  assertFalse(result.ok)
  assertEqual(result.code, Result.Code.NO_DATA)
  assertEqual(result.capability, Capability.ADDON_AVAILABLE)
end)

test("Specialization validates arguments before calling WoW", function()
  local called = false
  local environment = createEnvironment()
  environment.C_SpecializationInfo.GetSpecializationInfo = function()
    called = true
  end
  local result = CompatFactory.Create(environment).Specialization:GetInfo(0)
  assertFalse(result.ok)
  assertEqual(result.code, Result.Code.INVALID_ARGUMENT)
  assertFalse(called)
end)

test("Specialization handles missing namespaces safely", function()
  local result = CompatFactory.Create({}).Specialization:GetActiveIndex()
  assertFalse(result.ok)
  assertEqual(result.code, Result.Code.API_UNAVAILABLE)
end)

test("Talents exposes active config, hero selection and trait tree", function()
  local talents = CompatFactory.Create(createEnvironment()).Talents
  assertEqual(talents:GetActiveConfigId().value, 7001)
  assertEqual(talents:GetActiveHeroTreeId().value, 8001)
  assertEqual(talents:GetTreeIdForSpec(9101).value, 6001)
end)

test("Talents represents no active hero tree as a valid selection state", function()
  local environment = createEnvironment()
  environment.C_ClassTalents.GetActiveHeroTalentSpec = function()
    return nil
  end
  local result = CompatFactory.Create(environment).Talents:GetActiveHeroTreeId()
  assertTrue(result.ok)
  assertNil(result.value)
  assertEqual(result.code, Result.Code.NO_SELECTION)
  assertEqual(result.capability, Capability.ADDON_AVAILABLE)
end)

test("Talents passes trait structures through without transforming them", function()
  local talents = CompatFactory.Create(createEnvironment()).Talents
  assertEqual(talents:GetConfigInfo(7001).value.ID, 7001)
  assertEqual(talents:GetTreeNodes(6001).value[3], 3)
  assertEqual(talents:GetNodeInfo(7001, 1).value.activeRank, 1)
  assertEqual(talents:GetEntryInfo(7001, 2).value.definitionID, 3001)
  assertEqual(talents:GetDefinitionInfo(3001).value.spellID, 4001)
end)

test("Talents reports missing trait data explicitly", function()
  local environment = createEnvironment()
  environment.C_Traits.GetNodeInfo = function()
    return nil
  end
  local result = CompatFactory.Create(environment).Talents:GetNodeInfo(7001, 1)
  assertFalse(result.ok)
  assertEqual(result.code, Result.Code.NO_DATA)
  assertEqual(result.fallback, Result.Fallback.SKIP)
end)

test("Talents rejects invalid IDs before calling WoW", function()
  local called = false
  local environment = createEnvironment()
  environment.C_Traits.GetConfigInfo = function()
    called = true
  end
  local result = CompatFactory.Create(environment).Talents:GetConfigInfo(-1)
  assertFalse(result.ok)
  assertEqual(result.code, Result.Code.INVALID_ARGUMENT)
  assertFalse(called)
end)

test("Secrets marks unrestricted values as runtime available", function()
  local result = CompatFactory.Create(createEnvironment()).Secrets:GetRestrictionState()
  assertTrue(result.ok)
  assertFalse(result.value)
  assertEqual(result.code, Result.Code.OK)
  assertEqual(result.capability, Capability.ADDON_AVAILABLE)
  assertNil(result.fallback)
end)

test("Secrets marks protected values and supplies SKIP fallback", function()
  local environment = createEnvironment()
  environment.C_Secrets.HasSecretRestrictions = function()
    return true
  end
  local result = CompatFactory.Create(environment).Secrets:GetRestrictionState()
  assertTrue(result.ok)
  assertTrue(result.value)
  assertEqual(result.code, Result.Code.SECRET_RESTRICTED)
  assertEqual(result.capability, Capability.CONDITIONALLY_SECRET)
  assertEqual(result.fallback, Result.Fallback.SKIP)
end)

test("Secrets selects global and spell-specific cooldown probes", function()
  local environment = createEnvironment()
  local receivedSpell
  environment.C_Secrets.ShouldCooldownsBeSecret = function()
    return true
  end
  environment.C_Secrets.ShouldSpellCooldownBeSecret = function(spellIdentifier)
    receivedSpell = spellIdentifier
    return false
  end
  local secrets = CompatFactory.Create(environment).Secrets
  assertEqual(secrets:ClassifyCooldown().code, Result.Code.SECRET_RESTRICTED)
  assertEqual(secrets:ClassifyCooldown(4001).code, Result.Code.OK)
  assertEqual(receivedSpell, 4001)
end)

test("Secrets selects global and spell-specific aura probes", function()
  local environment = createEnvironment()
  local receivedSpell
  environment.C_Secrets.ShouldAurasBeSecret = function()
    return false
  end
  environment.C_Secrets.ShouldSpellAuraBeSecret = function(spellIdentifier)
    receivedSpell = spellIdentifier
    return true
  end
  local secrets = CompatFactory.Create(environment).Secrets
  assertEqual(secrets:ClassifyAura().code, Result.Code.OK)
  assertEqual(secrets:ClassifyAura("neutral_aura").code, Result.Code.SECRET_RESTRICTED)
  assertEqual(receivedSpell, "neutral_aura")
end)

test("Secrets forwards only validated unit power inputs", function()
  local receivedUnit
  local receivedPowerType
  local environment = createEnvironment()
  environment.C_Secrets.ShouldUnitPowerBeSecret = function(unit, powerType)
    receivedUnit = unit
    receivedPowerType = powerType
    return false
  end
  local result = CompatFactory.Create(environment).Secrets:ClassifyUnitPower("player", 11)
  assertTrue(result.ok)
  assertEqual(receivedUnit, "player")
  assertEqual(receivedPowerType, 11)
end)

test("Secrets rejects invalid identifiers before invoking protected probes", function()
  local called = false
  local environment = createEnvironment()
  environment.C_Secrets.ShouldSpellCooldownBeSecret = function()
    called = true
  end
  local secrets = CompatFactory.Create(environment).Secrets
  local cooldown = secrets:ClassifyCooldown(false)
  local power = secrets:ClassifyUnitPower("", -1)
  assertEqual(cooldown.code, Result.Code.INVALID_ARGUMENT)
  assertEqual(power.code, Result.Code.INVALID_ARGUMENT)
  assertFalse(called)
end)

test("Secrets degrades safely when capability probes are unavailable", function()
  local result = CompatFactory.Create({}).Secrets:ClassifyAura()
  assertFalse(result.ok)
  assertEqual(result.code, Result.Code.API_UNAVAILABLE)
  assertEqual(result.capability, Capability.CONDITIONALLY_SECRET)
  assertEqual(result.fallback, Result.Fallback.SKIP)
end)

test("Secrets degrades safely when a capability probe throws", function()
  local environment = createEnvironment()
  environment.C_Secrets.ShouldAurasBeSecret = function()
    error("restricted probe failed")
  end
  local result = CompatFactory.Create(environment).Secrets:ClassifyAura()
  assertFalse(result.ok)
  assertEqual(result.code, Result.Code.CALL_FAILED)
  assertEqual(result.fallback, Result.Fallback.SKIP)
end)

test("Secrets rejects malformed probe results", function()
  local environment = createEnvironment()
  environment.C_Secrets.ShouldAurasBeSecret = function()
    return "unknown"
  end
  local result = CompatFactory.Create(environment).Secrets:ClassifyAura()
  assertFalse(result.ok)
  assertEqual(result.code, Result.Code.INVALID_DATA)
end)

if #failures > 0 then
  print("")
  print("Failures:")
  for _, failure in ipairs(failures) do
    print("- " .. failure)
  end
  print("")
  print(string.format("Compat layer: %d/%d passed", passed, total))
  os.exit(1)
end

print("")
print(string.format("Compat layer: %d/%d passed", passed, total))
