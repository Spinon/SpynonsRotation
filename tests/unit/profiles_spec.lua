local passed, total, failures = 0, 0, {}
local function eq(a, b) if a ~= b then error("expected " .. tostring(b) .. ", got " .. tostring(a)) end end
local function test(name, fn)
  total = total + 1; local ok, err = pcall(fn)
  if ok then passed = passed + 1 else failures[#failures + 1] = name .. ": " .. tostring(err) end
  print((ok and "[PASS] " or "[FAIL] ") .. name)
end
local factory = assert(loadfile("tests/fixtures/specs/frame_environment.lua"))()
CreateFrame = factory(); local ns = {}
for line in io.lines("addon/SpynonRotation.toc") do
  local file = line:match("^([^#].*%.lua)%s*$")
  if file then assert(loadfile("addon/" .. file))("SpynonRotation", ns) end
end
local one = { character = "Player-999-ABCDEF", specId = 9101 }
local two = { character = "Player-999-FEDCBA", specId = 9101 }
local alternate = { character = one.character, specId = 9102 }
local function database() return { schemaVersion = 1, global = {}, characters = {} } end
local function fixture(db)
  local data = { guid = one.character, specId = one.specId, index = 1, combat = false }
  local env = { SpynonRotationDB = db, UnitGUID = function(unit) eq(unit, "player"); return data.guid end,
    UnitAffectingCombat = function() return data.combat end, issecretvalue = function(value) return value == data.secret end,
    C_SpecializationInfo = { GetSpecialization = function() return data.index end,
      GetSpecializationInfo = function() return data.specId end } }
  local compat = ns.CompatFactory.Create(env)
  local createFrame, objects = factory(); local model = ns.SettingsFactory.Create()
  local profiles = ns.ProfileControllerFactory.Create(compat, createFrame, model)
  profiles:Start()
  return profiles, model, env, data, compat, objects, createFrame
end
test("default global profile works without opening configuration or creating character entries", function()
  local _, model, env = fixture()
  eq(model:Get().count, 4); eq(model:Get().motion, "NORMAL")
  eq(next(env.SpynonRotationDB.profiles.characters), nil)
end)
test("preferences survive reconstruction from the same SavedVariables namespace", function()
  local _, model, env = fixture({ lastSmokeReport = { retained = true }, other = 17 })
  eq(model:Set("scale", 0.75), true)
  local _, restored, second = fixture(env.SpynonRotationDB)
  eq(restored:Get().scale, 0.75); eq(second.SpynonRotationDB.lastSmokeReport.retained, true)
  eq(second.SpynonRotationDB.other, 17)
end)
test("scope resolution applies default then global then character then specialization", function()
  local db = database(); local store = ns.ProfileStoreFactory.Create(db)
  store:Set("scale", 0.75, one); store:Set("count", 3, one)
  store:Select("character", one); store:Set("count", 2, one)
  store:Select("spec", one); store:Set("count", 1, one); store:Set("numbers", false, one)
  local value = store:Resolve(one)
  eq(value.count, 1); eq(value.scale, 0.75); eq(value.numbers, false); eq(value.motion, "NORMAL")
  eq(store:Resolve(one, "character").count, 2); eq(store:Resolve(one, "global").count, 3)
end)
test("choosing global preserves but temporarily excludes more specific overrides", function()
  local db = database(); local store = ns.ProfileStoreFactory.Create(db)
  store:Select("spec", one); store:Set("count", 1, one)
  store:Select("global", one); eq(store:Resolve(one).count, 4)
  store:Select("spec", one); eq(store:Resolve(one).count, 1)
end)
test("characters and specs remain isolated and scope choice is per character", function()
  local store = ns.ProfileStoreFactory.Create(database())
  store:Select("character", one); store:Set("count", 2, one)
  store:Select("spec", one); store:Set("scale", 0.75, one)
  eq(store:Resolve(two).count, 4); eq(store:GetScope(two), "global")
  eq(store:Resolve(alternate).count, 2); eq(store:Resolve(alternate).scale, 1)
  store:Set("scale", 1.25, alternate); eq(store:Resolve(one).scale, 0.75)
end)
test("a write equal to inherited value becomes an explicit override", function()
  local store = ns.ProfileStoreFactory.Create(database())
  store:Select("character", one); store:Set("count", 4, one)
  store:Select("global", one); store:Set("count", 2, one)
  store:Select("character", one); eq(store:Resolve(one).count, 4)
end)
test("copy snapshots effective source values without sharing or changing source", function()
  local store = ns.ProfileStoreFactory.Create(database())
  store:Set("count", 2, one); store:Select("character", one)
  eq(store:Copy("global", one), true); eq(store:Resolve(one).count, 2)
  store:Set("count", 1, one); eq(store:Resolve(one, "global").count, 2)
  store:Select("global", one); store:Set("scale", 1.25, one)
  store:Select("character", one); eq(store:Resolve(one).scale, 1)
  eq(store:Copy("character", one), false)
end)
test("reset removes supported overrides only and exposes inherited values", function()
  local db = database(); local store = ns.ProfileStoreFactory.Create(db)
  store:Set("count", 2, one); store:Select("character", one); store:Set("count", 3, one)
  store:Select("spec", one); store:Set("count", 1, one)
  db.characters[one.character].specs["9101"].extension = { preserved = true }
  store:Set("count", 4, alternate); eq(store:Reset(one), true)
  eq(store:Resolve(one).count, 3); eq(store:Resolve(alternate).count, 4)
  eq(db.characters[one.character].specs["9101"].extension.preserved, true)
  store:Select("character", one); store:Reset(one); eq(store:Resolve(one).count, 2)
  store:Select("global", one); store:Reset(one); eq(store:Resolve(one).count, 4)
end)
test("resolved snapshots cannot mutate storage", function()
  local store = ns.ProfileStoreFactory.Create(database()); store:Set("count", 2, one)
  local snapshot = store:Resolve(one); snapshot.count = 99; eq(store:Resolve(one).count, 2)
end)
test("malformed known values are ignored but preserved and invalid writes do not mutate", function()
  local db = database(); db.global.count = 99; db.global.extension = "preserved"
  local store = ns.ProfileStoreFactory.Create(db); eq(store:Resolve(one).count, 4)
  eq(store:Set("count", 7, one), false); eq(store:Set("extension", "overwrite", one), false)
  eq(db.global.count, 99); eq(db.global.extension, "preserved")
end)
test("future or malformed schema remains read-only and is never overwritten", function()
  for _, value in ipairs({ 7, "invalid", { schemaVersion = 2, marker = true }, { schemaVersion = 1, global = {} } }) do
    local store = ns.ProfileStoreFactory.Create(value)
    eq(store:IsWritable(), false); eq(store:Set("count", 2, one), false); eq(store:Select("spec", one), false)
    eq(store:Resolve(one).count, 4)
    local _, model, env = fixture({ profiles = value }); eq(model:Set("count", 2), false)
    eq(env.SpynonRotationDB.profiles, value)
  end
  local _, model, env = fixture("do not replace"); eq(model:Set("count", 2), false)
  eq(env.SpynonRotationDB, "do not replace")
end)
test("malformed nested profiles cannot redirect writes to global or be copied over", function()
  local db = database(); db.characters[one.character] = false
  local store = ns.ProfileStoreFactory.Create(db)
  eq(store:Set("count", 2, one), false); eq(store:Select("spec", one), false)
  eq(db.characters[one.character], false); eq(db.global.count, nil)
  db.characters[one.character] = { scope = "spec", values = {}, specs = { ["9101"] = false } }
  eq(store:Set("count", 2, one), false); eq(store:Copy("global", one), false)
  eq(store:Reset(one), false); eq(db.characters[one.character].specs["9101"], false)
  db.characters[one.character].scope = "unknown"
  eq(store:Set("count", 2, one), false); eq(db.global.count, nil)
end)
test("identity reads reject secrets before comparing or using them as keys", function()
  local _, _, _, data, compat = fixture()
  data.secret = {}; data.guid = data.secret; eq(compat.Profiles:ReadIdentity().character, nil)
  data.guid = one.character; data.index = data.secret; eq(compat.Profiles:ReadIdentity().specId, nil)
  data.index = 1; data.specId = data.secret; eq(compat.Profiles:ReadIdentity().specId, nil)
  data.guid = "Creature-123"; eq(compat.Profiles:ReadIdentity().character, nil)
end)
test("unavailable APIs or secret guard do not fabricate identity", function()
  local _, _, env, _, compat = fixture()
  env.issecretvalue = nil; eq(compat.Profiles:ReadIdentity().character, nil)
  eq(compat.Profiles:ReadIdentity().specId, nil)
  env.issecretvalue = function() return false end; env.UnitGUID = function() error("failure") end
  eq(compat.Profiles:ReadIdentity().character, nil)
end)
test("missing specialization falls back for display but never writes to the inherited scope", function()
  local profiles, model, env, data = fixture(); profiles:Select("spec"); model:Set("count", 2)
  data.index = 0; profiles:Refresh(); eq(model:Get().count, 4); eq(profiles:GetStatus().writable, false)
  eq(model:Set("count", 1), false); eq(env.SpynonRotationDB.profiles.global.count, nil)
  data.index = 1; profiles:Refresh(); eq(model:Get().count, 2)
end)
test("spec changes resolve atomically and stale clicks never write to either spec", function()
  local profiles, model, env, data = fixture(); profiles:Select("spec"); model:Set("count", 2)
  local notifications = 0; model:Subscribe(function() notifications = notifications + 1 end)
  data.specId = 9102; eq(model:Set("scale", 0.75), false); eq(model:Get().count, 4)
  eq(notifications, 1); eq(env.SpynonRotationDB.profiles.characters[one.character].specs["9102"], nil)
  eq(model:Set("scale", 1.25), true)
  data.specId = 9101; profiles:Refresh(); eq(model:Get().count, 2); eq(model:Get().scale, 1)
end)
test("combat and uncertain combat reject setting, copy, reset and scope changes", function()
  local profiles, model, _, data = fixture()
  for _, combat in ipairs({ true, "not a boolean" }) do
    data.combat = combat
    eq(model:Set("count", 2), false); eq(profiles:Select("character"), false)
    eq(profiles:Copy("character"), false); eq(profiles:Reset(), false)
    eq(model:Get().count, 4)
  end
end)
test("startup is idempotent, events restore scope and subscriptions can detach", function()
  local profiles, model, _, data, _, objects = fixture(); local count = #objects
  profiles:Start(); eq(#objects, count)
  profiles:Select("spec"); model:Set("count", 2)
  local calls = 0; local unsubscribe = profiles:Subscribe(function() calls = calls + 1 end)
  data.specId = 9102; objects[1].scripts.OnEvent(); eq(model:Get().count, 4); eq(calls, 1)
  unsubscribe(); data.specId = 9101; objects[1].scripts.OnEvent(); eq(model:Get().count, 2); eq(calls, 1)
end)
local function visible(object)
  if object.visible == false then return false end
  return not object.parent or visible(object.parent)
end
local function click(objects, text)
  for _, object in ipairs(objects) do
    if object.text == text and visible(object) and object.parent.scripts and object.parent.scripts.OnClick then
      object.parent.scripts.OnClick(); return true
    end
  end
  error("visible button not found: " .. text)
end
test("profile card copies and resets only after a second explicit confirmation", function()
  local profiles, model, _, _, _, objects, createFrame = fixture()
  model:Set("count", 2)
  local panel = ns.ConfigPanelFactory.Create(createFrame, {}, model, function(k,v) model:Set(k,v) end, nil, profiles)
  panel:Show(); click(objects, "Perfis"); click(objects, "Personagem"); model:Set("count", 1)
  click(objects, "De: Todos"); eq(model:Get().count, 1)
  click(objects, "Confirmar"); eq(model:Get().count, 2)
  model:Set("count", 3); click(objects, "Restaurar este perfil"); eq(model:Get().count, 3)
  click(objects, "Confirmar"); eq(model:Get().count, 2)
end)
test("pending destructive confirmation is disarmed by navigation or profile context changes", function()
  local profiles, model, _, data, _, objects, createFrame = fixture()
  profiles:Select("spec"); model:Set("count", 2)
  local panel = ns.ConfigPanelFactory.Create(createFrame, {}, model, function(k,v) model:Set(k,v) end, nil, profiles)
  panel:Show(); panel:Select("profiles"); click(objects, "Restaurar este perfil")
  panel:Select(nil); panel:Select("profiles"); click(objects, "Restaurar este perfil"); eq(model:Get().count, 2)
  data.specId = 9102; profiles:Refresh(); model:Set("count", 3)
  click(objects, "Restaurar este perfil"); eq(model:Get().count, 3)
  panel:Hide(); panel:Show(); click(objects, "Restaurar este perfil"); eq(model:Get().count, 3)
end)
print(string.format("Saved profiles: %d/%d passed", passed, total))
for _, failure in ipairs(failures) do print(failure) end
if passed ~= total then os.exit(1) end
