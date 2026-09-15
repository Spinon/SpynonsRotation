local passed, total, failures = 0, 0, {}
local function eq(a, b) if a ~= b then error("expected " .. tostring(b) .. ", got " .. tostring(a)) end end
local function test(name, fn)
  total = total + 1
  local ok, err = pcall(fn)
  if ok then passed = passed + 1 else failures[#failures + 1] = name .. ": " .. tostring(err) end
  print((ok and "[PASS] " or "[FAIL] ") .. name)
end
local factory = assert(loadfile("tests/fixtures/specs/frame_environment.lua"))()
CreateFrame = factory()
local ns = {}
for line in io.lines("addon/SpynonRotation.toc") do
  local file = line:match("^([^#].*%.lua)%s*$")
  if file then assert(loadfile("addon/" .. file))("SpynonRotation", ns) end
end
local function advance(objects, delta)
  for _, object in ipairs(objects) do
    if object.scripts and object.scripts.OnUpdate then object.scripts.OnUpdate(object, delta) end
  end
end
local function visible(object)
  if object.visible == false then return false end
  return not object.parent or visible(object.parent)
end
local function findText(objects, text)
  for _, object in ipairs(objects) do if object.text == text and visible(object) then return object end end
end
local function queueFixture()
  local createFrame, objects = factory()
  local settings = ns.SettingsFactory.Create(); settings:Set("motion", "OFF")
  local view = ns.QueueFactory.Create(createFrame, {}, nil, settings)
  local recs = ns.DemoTimeline.Create({}):At(0).recommendations
  view:SetRecommendations(recs)
  return view, settings, objects, recs
end
local function configFixture()
  local createFrame, objects = factory()
  local data = { combat = false, time = 100 }
  local env = { UnitAffectingCombat = function() return data.combat end, GetTime = function() return data.time end,
    issecretvalue = function(value) return value == data.secret end, UIParent = {}, SpynonRotationDB = { preserved = true } }
  local compat = ns.CompatFactory.Create(env)
  local live = { starts = 0, stops = 0 }
  function live:Start() self.starts = self.starts + 1 end
  function live:Stop() self.stops = self.stops + 1 end
  local model = ns.SettingsFactory.Create()
  -- Queue is shared by harness and runtime; isolate the singleton for this fixture.
  ns.Settings = model
  local harness = ns.InGameHarnessFactory.Create(compat, { GetSelection = function() return nil end },
    { GetRecommendations = function() return {} end }, live, ns.Specs, createFrame)
  harness:Start()
  local controller = ns.ConfigControllerFactory.Create(compat, createFrame, model, harness)
  controller:Start()
  return controller, harness, model, objects, data, live, env
end
test("settings defaults work without configuration and snapshots are isolated", function()
  local a, b = ns.SettingsFactory.Create(), ns.SettingsFactory.Create()
  eq(a:Get().count, 4); eq(a:Get().scale, 1); eq(a:Get().motion, "NORMAL")
  assert(ns.SettingsFactory.Validate(a:Get()))
  local copy = a:Get(); copy.count = 1; eq(a:Get().count, 4)
  a:Set("count", 2); eq(b:Get().count, 4)
end)
test("settings reject unknown, unbounded and malformed values without notification", function()
  local model, events = ns.SettingsFactory.Create(), 0
  model:Subscribe(function() events = events + 1 end)
  for _, value in ipairs({ -1, 0, 7, 1.5, math.huge, 0/0, "4", {} }) do eq(model:Set("count", value), false) end
  eq(model:Set("advancedDuration", 2), false); eq(model:Set("numbers", 1), false)
  eq(model:Set("count", 4), true); eq(events, 0)
  eq(ns.SettingsFactory.Validate({ count = 4 }), false)
  eq(ns.SettingsFactory.Validate(nil), false)
end)
test("subscriptions receive independent snapshots and unsubscribe cleanly", function()
  local model, seen = ns.SettingsFactory.Create(), {}
  model:Subscribe(function(value) value.count = 99 end)
  local unsubscribe = model:Subscribe(function(value) seen[#seen+1] = value.count end)
  model:Set("count", 2); eq(seen[1], 2); eq(model:Get().count, 2)
  unsubscribe(); model:Set("count", 3); eq(#seen, 1)
end)
test("quantity shrinks and restores recommendation identities without growing the pool", function()
  local view, model, objects = queueFixture()
  local first, count = view:GetFrameForId("demo.action_1"), #objects
  model:Set("count", 1)
  eq(view:GetFrameForId("demo.action_1"), first); eq(view:GetFrameForId("demo.action_2"), nil)
  eq(view:GetRoot().width, 200); eq(view:GetRoot().height, 120); eq(first.point[4], 0)
  model:Set("count", 4); eq(view:GetFrameForId("demo.action_1"), first)
  eq(view:GetFrameForId("demo.action_4") ~= nil, true); eq(#objects, count)
end)
test("all counts and directions fit within the declared bounds and keep current hierarchy", function()
  local view, model = queueFixture()
  for _, direction in ipairs({ "STACKED", "RIGHT", "LEFT" }) do
    model:Set("direction", direction)
    for count = 1, 4 do
      model:Set("count", count)
      for index = 1, count do
        local frame = view:GetFrameForId("demo.action_" .. index)
        assert(frame.point[4] >= 0 and frame.point[4] + frame.width <= view:GetRoot().width)
        assert(-frame.point[5] + frame.height <= view:GetRoot().height)
        eq(frame.width, index == 1 and 200 or 80)
      end
    end
  end
end)
test("right and left mirror geometry; scale is inherited without altering native icon crop", function()
  local view, model = queueFixture()
  model:Set("direction", "RIGHT"); eq(view:GetFrameForId("demo.action_1").point[4], 0)
  eq(view:GetFrameForId("demo.action_2").point[4], 208)
  model:Set("direction", "LEFT"); eq(view:GetFrameForId("demo.action_1").point[4], 264)
  eq(view:GetFrameForId("demo.action_2").point[4], 176)
  model:Set("scale", 0.75); eq(view:GetRoot().scale, 0.75)
end)
test("keys and countdown visibility apply immediately and persist across subsequent data", function()
  local view, model, objects, recs = queueFixture()
  local keys = { [recs[1].id] = "SHIFT-3" }
  view:SetHotkeys(keys); assert(findText(objects, "S3"))
  model:Set("keys", "off"); eq(findText(objects, "S3"), nil)
  model:Set("keys", "full"); assert(findText(objects, "SHIFT-3"))
  model:Set("numbers", false)
  for _, object in ipairs(objects) do if object.kind == "Cooldown" then eq(object.hideNumbers, true) end end
  view:SetRecommendations(recs); view:SetHotkeys(keys); assert(findText(objects, "SHIFT-3"))
end)
test("aura toggle clears its timer and restores only the latest cached public sidecar", function()
  local view, model, objects = queueFixture()
  local clock = { ReadClock = function() return { ok = true, value = 100 } end }
  view:SetIndicators({ { id = "fixture.a", kind = "buff", label = "Signal", spellId = 1,
    state = "STABLE", expiresAt = 110 } }, clock)
  assert(findText(objects, "Buff: Signal")); local count = #objects
  model:Set("indicators", false); eq(findText(objects, "Buff: Signal"), nil)
  for _, object in ipairs(objects) do if object.scripts then eq(object.scripts.OnUpdate, nil) end end
  model:Set("indicators", true); assert(findText(objects, "Buff: Signal")); eq(#objects, count)
  view:SetIndicators(false, clock); model:Set("scale", 0.75); eq(findText(objects, "Buff: Signal"), nil)
  view:ClearOverlays(); model:Set("scale", 1.25); eq(findText(objects, "Buff: Signal"), nil)
end)
test("changing preferences cannot resurrect a withdrawn recommendation queue", function()
  local view, model = queueFixture(); view:Hide()
  model:Set("count", 1); model:Set("direction", "LEFT"); model:Set("scale", 1.25)
  eq(view:GetRoot().visible, false); eq(view:GetFrameForId("demo.action_1"), nil)
end)
test("config starts with subject cards, exposing only the selected section", function()
  local controller, harness, _, objects = configFixture()
  eq(controller:Open(), true); eq(harness:IsDemoActive(), true)
  assert(findText(objects, "Fila")); assert(findText(objects, "Informações"))
  eq(findText(objects, "Recomendações"), nil); eq(findText(objects, "Movimento"), nil)
  local panel = controller:GetPanel(); panel:Select("queue")
  assert(findText(objects, "Recomendações")); eq(findText(objects, "Tempo restante"), nil)
  panel:Select("information"); assert(findText(objects, "Tempo restante"))
  eq(findText(objects, "Recomendações"), nil); eq(panel:Select("advanced"), false)
end)
test("button clicks update demo immediately and closing preserves this session only", function()
  local controller, harness, model, objects, _, live, env = configFixture()
  controller:Open(); controller:GetPanel():Select("queue")
  local small = assert(findText(objects, "Pequeno")); small.parent.scripts.OnClick()
  eq(model:Get().scale, 0.75)
  local scaled = false
  for _, object in ipairs(objects) do if object.scale == 0.75 and visible(object) then scaled = true end end
  eq(scaled, true); controller:Close(); eq(harness:IsDemoActive(), false); eq(live.starts, 1)
  eq(model:Get().scale, 0.75); eq(env.SpynonRotationDB.preserved, true); eq(env.SpynonRotationDB.config, nil)
end)
test("Escape closes once, ordinary keys propagate, and reopening reuses every frame", function()
  local controller, _, _, objects, _, live = configFixture()
  controller:Open(); local root, count = controller:GetPanel():GetRoot(), #objects
  root.scripts.OnKeyDown(root, "W"); eq(root.propagateKeyboardInput, true); eq(controller:IsOpen(), true)
  root.scripts.OnKeyDown(root, "ESCAPE"); eq(root.propagateKeyboardInput, false)
  eq(controller:IsOpen(), false); eq(live.starts, 1)
  controller:Open(); eq(root.propagateKeyboardInput, true); eq(#objects, count)
  controller:Close(); eq(live.starts, 2)
end)
test("combat or unavailable combat blocks opening and stale clicks", function()
  local controller, harness, model, _, data = configFixture()
  data.combat = true; eq(controller:Open(), false)
  data.secret = {}; data.combat = data.secret; eq(controller:Open(), false)
  data.combat = false; controller:Open(); data.combat = true
  eq(controller:Change("count", 1), false); eq(model:Get().count, 4)
  eq(harness:IsDemoActive(), false); eq(controller:IsOpen(), false)
end)
test("all shutdown events stop demo and config with either event delivery order", function()
  for _, event in ipairs({ "PLAYER_REGEN_DISABLED", "ADDON_RESTRICTION_STATE_CHANGED", "PLAYER_ENTERING_WORLD" }) do
    for _, reversed in ipairs({ false, true }) do
      local controller, harness, _, objects, _, live = configFixture(); controller:Open()
      local start, finish, step = 1, #objects, 1
      if reversed then start, finish, step = #objects, 1, -1 end
      for i = start, finish, step do
        local object = objects[i]
        if object.events and object.events[event] then object.scripts.OnEvent(object, event) end
      end
      eq(controller:IsOpen(), false); eq(harness:IsDemoActive(), false); eq(live.starts, 1)
      for _, object in ipairs(objects) do if object.scripts then eq(object.scripts.OnUpdate, nil) end end
    end
  end
end)
test("stopping the preview through slash command also closes configuration", function()
  local controller, harness, _, _, _, _, env = configFixture()
  env.SlashCmdList.SPYNONROTATION("config"); eq(controller:IsOpen(), true)
  env.SlashCmdList.SPYNONROTATION("demo stop"); eq(controller:IsOpen(), false)
  eq(harness:IsPreviewActive(), false)
  env.SlashCmdList.SPYNONROTATION("config nonsense"); eq(controller:IsOpen(), false)
end)
test("many changes and demo scenes reuse the pool without resetting the timeline", function()
  local controller, harness, _, objects = configFixture(); controller:Open()
  local count = #objects
  for index = 1, 100 do
    controller:Change("count", index%4+1); controller:Change("direction", index%2 == 0 and "LEFT" or "RIGHT")
    advance(objects, 0.1)
  end
  eq(#objects, count); eq(harness:IsDemoActive(), true)
  advance(objects, 0.01) -- Pass the exact boundary despite floating-point accumulation.
  assert(findText(objects, "DEMO - DADOS SIMULADOS\nAOE - contagem removida"))
end)
print(string.format("Contextual configuration: %d/%d passed", passed, total))
for _, failure in ipairs(failures) do print(failure) end
if passed ~= total then os.exit(1) end
