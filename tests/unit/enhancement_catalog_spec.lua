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

local Enhancement = namespace.Classes.Shaman.Enhancement
local Catalog = Enhancement.Catalog
local Module = Enhancement.Module

local function containsAction(actions, id)
  for index = 1, #actions do
    if actions[index].id == id then
      return true
    end
  end
  return false
end

local function snapshot(spellIds, heroTreeId)
  local ranks = {}
  for index = 1, #spellIds do
    ranks[spellIds[index]] = 1
  end
  local value = { activeSpellRanks = ranks }
  if heroTreeId ~= nil then
    value.heroTree = { id = heroTreeId }
  end
  return value
end

test("catalog and module expose the Enhancement identity", function()
  assertEqual(Catalog.id, "shaman.enhancement")
  assertEqual(Catalog.classId, 7)
  assertEqual(Catalog.specId, 263)
  assertEqual(Module.id, Catalog.id)
  assertTrue(namespace.Specs:GetBySpecId(263) == Module)
end)

test("catalog contains the curated inventory without rotation rules", function()
  assertEqual(#Catalog.actions, 18)
  assertEqual(#Catalog.talents, 79)
  assertEqual(#Catalog.heroTrees, 2)
  assertEqual(#Catalog.resources, 2)
  assertEqual(#Catalog.auras, 10)
  assertEqual(#Module.getRules(), 0)
end)

test("every exposed action satisfies the generic Action contract", function()
  local activeTalents = {}
  for index = 1, #Catalog.talents do
    activeTalents[#activeTalents + 1] = Catalog.talents[index].spellId
  end
  local actions = Module.getActions(snapshot(activeTalents, 54))
  for index = 1, #actions do
    local valid, validationError = namespace.Contracts.Action.Validate(actions[index])
    assertTrue(valid, validationError)
    assertEqual(actions[index].capability, namespace.Contracts.Capability.ADDON_AVAILABLE)
  end
end)

test("missing talent snapshot fails closed for conditional actions", function()
  local actions = Module.getActions()
  assertEqual(#actions, 4)
  assertTrue(containsAction(actions, "enhancement.flame_shock"))
  assertTrue(containsAction(actions, "enhancement.lightning_bolt"))
  assertTrue(containsAction(actions, "enhancement.lightning_shield"))
  assertTrue(containsAction(actions, "enhancement.stormstrike"))
  assertFalse(containsAction(actions, "enhancement.crash_lightning"))
end)

test("Voltaic Blaze replaces Flame Shock in the available action set", function()
  local actions = Module.getActions(snapshot({ 470057 }))
  assertTrue(containsAction(actions, "enhancement.voltaic_blaze"))
  assertFalse(containsAction(actions, "enhancement.flame_shock"))
end)

test("Hero actions require both their talent and active Hero Tree", function()
  local wrongTree = Module.getActions(snapshot({ 455630, 454009 }, 55))
  assertFalse(containsAction(wrongTree, "enhancement.surging_totem"))
  assertTrue(containsAction(wrongTree, "enhancement.tempest"))

  local correctTree = Module.getActions(snapshot({ 455630, 454009 }, 54))
  assertTrue(containsAction(correctTree, "enhancement.surging_totem"))
  assertFalse(containsAction(correctTree, "enhancement.tempest"))
end)

test("Windstrike accepts either direct Ascendance or Deeply Rooted Elements", function()
  assertTrue(containsAction(Module.getActions(snapshot({ 114051 })), "enhancement.windstrike"))
  assertTrue(containsAction(Module.getActions(snapshot({ 378270 })), "enhancement.windstrike"))
  assertFalse(containsAction(Module.getActions(snapshot({})), "enhancement.windstrike"))
end)

test("Maelstrom Weapon remains an aura stack mechanic distinct from Mana", function()
  assertEqual(Catalog.resources[1].id, "enhancement.maelstrom_weapon")
  assertEqual(Catalog.resources[1].kind, "aura_stacks")
  assertEqual(Catalog.resources[1].auraId, 344179)
  assertEqual(Catalog.resources[1].maxStacks, 10)
  assertEqual(Catalog.resources[2].id, "enhancement.mana")
  assertEqual(Catalog.resources[2].kind, "power")
  assertEqual(Catalog.resources[2].powerType, 0)
end)

test("getActions returns an isolated list", function()
  local first = Module.getActions()
  first[1] = nil
  local second = Module.getActions()
  assertEqual(#second, 4)
end)

if #failures > 0 then
  print("")
  print("Failures:")
  for _, failure in ipairs(failures) do
    print("- " .. failure)
  end
  print("")
  print(string.format("Enhancement catalog: %d/%d passed", passed, total))
  os.exit(1)
end

print("")
print(string.format("Enhancement catalog: %d/%d passed", passed, total))
