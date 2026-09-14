local passed, total, failures = 0, 0, {}
local function eq(a,b) if a ~= b then error("expected " .. tostring(b) .. ", got " .. tostring(a)) end end
local function test(name, fn)
  total = total + 1; local ok, err = pcall(fn)
  if ok then passed = passed + 1 else failures[#failures+1] = name .. ": " .. tostring(err) end
  print((ok and "[PASS] " or "[FAIL] ") .. name)
end
local factory = assert(loadfile("tests/fixtures/specs/frame_environment.lua"))()
CreateFrame = factory(); local ns = {}
for line in io.lines("addon/SpynonRotation.toc") do
  local file = line:match("^([^#].*%.lua)%s*$")
  if file then assert(loadfile("addon/" .. file))("SpynonRotation", ns) end
end
local guid = "Player-999-ABCDEF"
local function fixture(saved)
  local createFrame, objects = factory()
  local data = { combat = false, guid = guid, specId = 9101 }
  local env = { SpynonRotationDB = saved, issecretvalue = function() return false end,
    UnitAffectingCombat = function() return data.combat end, UnitGUID = function() return data.guid end,
    GetTime = function() return 100 end, UIParent = {}, C_SpecializationInfo = {
      GetSpecialization = function() return 1 end, GetSpecializationInfo = function() return data.specId end } }
  local compat, model = ns.CompatFactory.Create(env), ns.SettingsFactory.Create()
  ns.Settings = model
  local profiles = ns.ProfileControllerFactory.Create(compat, createFrame, model); profiles:Start()
  local live = { Start = function() end, Stop = function() end }
  local harness = ns.InGameHarnessFactory.Create(compat, {GetSelection = function() return nil end},
    {GetRecommendations = function() return {} end}, live, ns.Specs, createFrame)
  harness:Start()
  local config = ns.ConfigControllerFactory.Create(compat, createFrame, model, harness, profiles)
  config:Start(); config:Edit()
  return config:GetHistory(), model, profiles, env.SpynonRotationDB, data, config, objects
end
local function sliderOf(objects)
  for _, object in ipairs(objects) do if object.kind == "Slider" then return object end end
  error("slider missing")
end

local function visible(object)
  if object.visible == false then return false end
  return not object.parent or visible(object.parent)
end
local function click(objects, text)
  for _, object in ipairs(objects) do
    if object.text == text and visible(object) and object.parent.scripts and object.parent.scripts.OnClick then
      object.parent.scripts.OnClick(); return
    end
  end
  error("visible button not found: " .. text)
end

test("exploration groups several preference clicks into one confirmed action", function()
  local history, model, _, saved, _, config, objects = fixture()
  config:GetPanel():Select("queue"); click(objects, "Experimentar")
  config:Change("count", 2); config:Change("scale", 0.75)
  eq(model:Get().count, 2); eq(saved.profiles.global.count, nil); eq(history:GetStatus().undo, 0)
  click(objects, "Manter mudanças")
  eq(saved.profiles.global.count, 2); eq(saved.profiles.global.scale, 0.75); eq(history:GetStatus().undo, 1)
  history:Undo(); eq(model:Get().count, 4); eq(model:Get().scale, 1)
  history:Redo(); eq(model:Get().count, 2); eq(model:Get().scale, 0.75)
end)

test("cancel exploration restores preferences while preserving the existing redo branch", function()
  local history, model, _, saved, _, config, objects = fixture()
  history:Execute("count", 2); history:Undo()
  config:GetPanel():Select("information"); click(objects, "Experimentar")
  config:Change("numbers", false); config:Change("keys", "off")
  eq(model:Get().numbers, false); click(objects, "Cancelar prévia")
  eq(model:Get().numbers, true); eq(model:Get().keys, "compact")
  eq(saved.profiles.global.numbers, nil); eq(history:GetStatus().redo, 1)
end)

test("slider release does not prematurely commit the broader exploration", function()
  local history, model, _, saved, _, config, objects = fixture()
  config:GetPanel():SelectElement("current"); click(objects, "Experimentar")
  local slider = sliderOf(objects)
  slider.scripts.OnMouseDown(slider, "LeftButton"); slider:SetValue(3)
  slider.scripts.OnMouseUp(slider, "LeftButton")
  eq(history:GetStatus().mode, "explore"); eq(saved.profiles.global.mainScale, nil)
  eq(model:Get().mainScale, 1.15); click(objects, "Manter mudanças")
  eq(saved.profiles.global.mainScale, 1.15); eq(history:GetStatus().undo, 1)
end)

test("navigation or close discards exploration without any persisted intermediate values", function()
  local history, model, _, saved, _, config, objects = fixture()
  config:GetPanel():Select("queue"); click(objects, "Experimentar"); config:Change("count", 1)
  config:GetPanel():Select("information"); eq(model:Get().count, 4); eq(history:GetStatus().active, false)
  click(objects, "Experimentar"); config:Change("keys", "off"); config:Close()
  eq(model:Get().keys, "compact"); eq(next(saved.profiles.global), nil)
end)

test("element reset previews only the selected component and cancels losslessly", function()
  local history, model, _, saved, _, config, objects = fixture()
  history:Execute("mainScale", 1.15); history:Execute("count", 2)
  config:GetPanel():SelectElement("current"); click(objects, "Restaurar elemento")
  eq(model:Get().mainScale, 1); eq(model:Get().count, 2); eq(saved.profiles.global.mainScale, 1.15)
  eq(history:GetStatus().undo, 2); click(objects, "Cancelar prévia")
  eq(model:Get().mainScale, 1.15); eq(history:GetStatus().undo, 2)
end)

test("confirmed element reset clears only its overrides and is distinct from undo", function()
  local history, model, _, saved, _, config, objects = fixture()
  history:Execute("mainScale", 1.15); history:Execute("count", 2)
  config:GetPanel():SelectElement("current"); click(objects, "Restaurar elemento")
  click(objects, "Confirmar restauração")
  eq(model:Get().mainScale, 1); eq(saved.profiles.global.mainScale, nil); eq(saved.profiles.global.count, 2)
  eq(history:GetStatus().undo, 0); eq(history:GetStatus().redo, 0); eq(history:Undo(), false)
end)

test("queue section reset includes its layout and current icon but preserves information", function()
  local history, model, _, saved, _, config, objects = fixture()
  for key, value in pairs({count=2, scale=0.75, mainScale=1.15, spacing=16, alignment="END", keys="off"}) do
    history:Execute(key, value)
  end
  config:GetPanel():Select("queue"); click(objects, "Restaurar seção")
  eq(model:Get().count, 4); eq(model:Get().mainScale, 1); eq(model:Get().spacing, 8); eq(model:Get().keys, "off")
  click(objects, "Confirmar restauração")
  eq(saved.profiles.global.keys, "off"); eq(saved.profiles.global.count, nil); eq(saved.profiles.global.alignment, nil)
end)

test("information section and hotkey element have deliberately different reset scopes", function()
  local history, model, _, _, _, config, objects = fixture()
  for key, value in pairs({keys="off", keyPosition="BOTTOMLEFT", numbers=false, indicators=false}) do
    history:Execute(key, value)
  end
  config:GetPanel():SelectElement("hotkey"); click(objects, "Restaurar elemento")
  eq(model:Get().keys, "compact"); eq(model:Get().keyPosition, "TOPRIGHT"); eq(model:Get().numbers, false)
  click(objects, "Confirmar restauração")
  config:GetPanel():Select("information"); click(objects, "Restaurar seção")
  eq(model:Get().numbers, true); eq(model:Get().indicators, true)
end)

test("profile reset previews inherited preferences and preserves ancestors siblings and extensions", function()
  local history, model, profiles, saved, data, config, objects = fixture()
  model:Set("count", 2); profiles:Select("spec")
  history:Execute("count", 1); history:Execute("keys", "off")
  local row = saved.profiles.characters[guid]
  row.specs["9101"].extension = {keep=true}; row.specs["9102"] = {count=3}
  config:GetPanel():Select("profiles"); click(objects, "Restaurar este perfil")
  eq(model:Get().count, 2); eq(row.specs["9101"].count, 1)
  click(objects, "Confirmar restauração")
  eq(row.specs["9101"].count, nil); eq(row.specs["9101"].extension.keep, true)
  eq(row.specs["9102"].count, 3); eq(saved.profiles.global.count, 2); eq(data.specId, 9101)
end)

test("combat and specialization changes cancel pending reset without applying it", function()
  local history, model, profiles, saved, data, config, objects = fixture()
  profiles:Select("spec"); history:Execute("count", 2)
  config:GetPanel():Select("queue"); click(objects, "Restaurar seção")
  data.specId = 9102; profiles:Refresh(); eq(history:GetStatus().active, false)
  eq(saved.profiles.characters[guid].specs["9101"].count, 2); eq(model:Get().count, 4)
  data.specId = 9101; profiles:Refresh(); click(objects, "Restaurar seção")
  data.combat = true; eq(history:Commit(), false)
  eq(saved.profiles.characters[guid].specs["9101"].count, 2); eq(model:Get().count, 2)
end)

test("ancestor drift refuses a reset whose preview is no longer what was shown", function()
  local history, model, profiles, saved = fixture()
  model:Set("count", 2); profiles:Select("spec"); history:Execute("count", 1)
  history:PreviewReset({count=true}); eq(model:Get().count, 2)
  saved.profiles.global.count = 3
  eq(history:Commit(), false); eq(saved.profiles.characters[guid].specs["9101"].count, 1)
  eq(model:Get().count, 1); eq(history:GetStatus().active, false)
end)

test("reset guards validate the complete key set before changing any data", function()
  local history, _, profiles, saved = fixture()
  history:Execute("count", 2); local snapshot = profiles:Capture()
  eq(history:PreviewReset({count=true, unknown=true}), false)
  eq(history:PreviewReset({count=false}), false); eq(history:PreviewReset({}), false)
  eq(profiles:ResetFields({count=true, unknown=true}, snapshot, ns.SettingsFactory.Defaults()), false)
  eq(saved.profiles.global.count, 2)
end)

test("editing another value cancels a pending reset rather than silently confirming it", function()
  local history, model, _, saved, _, config, objects = fixture()
  history:Execute("count", 2); config:GetPanel():Select("queue"); click(objects, "Restaurar seção")
  config:Change("scale", 0.75)
  eq(history:GetStatus().active, false); eq(model:Get().count, 2); eq(saved.profiles.global.count, 2)
  eq(saved.profiles.global.scale, 0.75); eq(history:GetStatus().undo, 2)
end)

test("readonly storage rejects experimentation and reset without changing the preview", function()
  local history, model, _, _, _, config, objects = fixture({profiles={schemaVersion=2}})
  config:GetPanel():Select("queue"); click(objects, "Experimentar"); eq(history:GetStatus().active, false)
  click(objects, "Restaurar seção"); eq(history:GetStatus().active, false); eq(model:Get().count, 4)
end)

test("a net-zero exploration preserves the redo branch and does not create overrides", function()
  local history, _, _, saved = fixture()
  history:Execute("count", 2); history:Undo(); history:Begin("queue", "explore")
  history:Execute("count", 1); history:Execute("count", 4); history:Commit()
  eq(history:GetStatus().undo, 0); eq(history:GetStatus().redo, 1); eq(saved.profiles.global.count, nil)
end)

test("slider cannot change or accidentally confirm a pending reset", function()
  local history, model, _, saved, _, config, objects = fixture()
  history:Execute("mainScale", 1.15); config:GetPanel():SelectElement("current")
  click(objects, "Restaurar elemento"); local slider = sliderOf(objects)
  slider:SetValue(1); slider.scripts.OnMouseUp(slider, "LeftButton")
  eq(history:GetStatus().mode, "reset"); eq(model:Get().mainScale, 1); eq(saved.profiles.global.mainScale, 1.15)
end)

test("reset removes a malformed requested field but preserves unrelated malformed fields", function()
  local history, _, _, saved = fixture({profiles={schemaVersion=1,global={count=99, keys="bad"},characters={}}})
  history:PreviewReset({count=true}); history:Commit()
  eq(saved.profiles.global.count, nil); eq(saved.profiles.global.keys, "bad")
end)

test("switching back to a demo cancels temporary edits while leaving saved preferences intact", function()
  local history, model, _, saved, _, config, objects = fixture()
  config:GetPanel():Select("queue"); click(objects, "Experimentar"); config:Change("count", 1)
  config:Edit()
  eq(history:GetStatus().active, false); eq(model:Get().count, 4); eq(saved.profiles.global.count, nil)
end)

test("reconstruction during exploration sees only saved values not the temporary snapshot", function()
  local history, _, _, saved = fixture()
  history:Execute("count", 2); history:Begin("queue", "explore"); history:Execute("count", 1)
  local restored, model = fixture(saved)
  eq(model:Get().count, 2); eq(restored:GetStatus().active, false); eq(restored:GetStatus().undo, 0)
end)

test("session-only binding supports cancellation and atomic reset without profiles", function()
  local settings = ns.SettingsFactory.Create()
  local history = ns.HistoryBinding.Create(settings, nil, function() return true end)
  history:Execute("count", 2); history:Execute("keys", "off")
  history:PreviewReset({count=true}); eq(settings:Get().count, 4); history:Cancel()
  eq(settings:Get().count, 2); eq(history:GetStatus().undo, 2)
  history:PreviewReset({count=true}); eq(history:Commit(), true)
  eq(settings:Get().count, 4); eq(settings:Get().keys, "off"); eq(history:GetStatus().undo, 0)
end)

test("unexpected target drift refuses a stale reset even if inheritance is unchanged", function()
  local history, model, _, saved = fixture()
  history:Execute("count", 2); history:PreviewReset({count=true}); saved.profiles.global.count = 3
  eq(history:Commit(), false); eq(model:Get().count, 3); eq(saved.profiles.global.count, 3)
end)

test("typography exploration commits once and supports undo redo and cancel", function()
  local history, model, _, saved, _, config, objects = fixture()
  config:GetPanel():Select("type_text"); click(objects,"Experimentar")
  config:Change("textSize",1.15); config:Change("textShadow","NONE")
  eq(saved.profiles.global.textSize,nil); click(objects,"Manter mudanças")
  eq(saved.profiles.global.textSize,1.15); eq(history:GetStatus().undo,1)
  history:Undo(); eq(model:Get().textSize,1); eq(model:Get().textShadow,"SOFT")
  history:Redo(); eq(model:Get().textSize,1.15)
  click(objects,"Experimentar"); config:Change("textFont","NUMBERS"); click(objects,"Cancelar prévia")
  eq(model:Get().textFont,"WOW"); eq(saved.profiles.global.textFont,nil)
end)
test("typography section reset leaves per-role overrides and unrelated preferences intact", function()
  local history, model, _, saved, _, config, objects = fixture()
  history:Execute("textSize",1.15); history:Execute("hotkeySize",0.85); history:Execute("count",2)
  config:GetPanel():Select("type_text"); click(objects,"Restaurar seção")
  eq(model:Get().textSize,1); eq(model:Get().hotkeySize,0.85)
  click(objects,"Confirmar restauração"); eq(saved.profiles.global.textSize,nil)
  eq(saved.profiles.global.hotkeySize,0.85); eq(saved.profiles.global.count,2)
  config:GetPanel():Select("type_hotkey"); click(objects,"Restaurar seção")
  eq(model:Get().hotkeySize,"INHERIT"); click(objects,"Cancelar prévia")
  eq(model:Get().hotkeySize,0.85)
end)
print(string.format("Safe exploration and reset: %d/%d passed", passed, total))
for _, failure in ipairs(failures) do print(failure) end
if passed ~= total then os.exit(1) end
