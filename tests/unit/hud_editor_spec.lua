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
local function visible(object)
  if object.visible == false then return false end
  return not object.parent or visible(object.parent)
end
local function label(objects, text)
  for _, object in ipairs(objects) do if object.text == text and visible(object) then return object end end
end
local function tick(objects, delta)
  for _, object in ipairs(objects) do
    if object.scripts and object.scripts.OnUpdate then object.scripts.OnUpdate(object, delta) end
  end
end
local function fixture()
  local createFrame, objects = factory()
  local data = { combat = false }
  local env = { issecretvalue = function() return false end, UnitAffectingCombat = function() return data.combat end,
    GetTime = function() return 100 end, UIParent = {} }
  local compat, model = ns.CompatFactory.Create(env), ns.SettingsFactory.Create()
  ns.Settings = model
  local live = { starts = 0, stops = 0 }
  function live:Start() self.starts = self.starts + 1 end
  function live:Stop() self.stops = self.stops + 1 end
  local harness = ns.InGameHarnessFactory.Create(compat, {GetSelection = function() return nil end},
    {GetRecommendations = function() return {} end}, live, ns.Specs, createFrame)
  harness:Start()
  local controller = ns.ConfigControllerFactory.Create(compat, createFrame, model, harness)
  controller:Start()
  return controller, harness, model, objects, data, live, env
end
local function hitFor(objects, frame)
  for _, object in ipairs(objects) do
    if object.kind == "Button" and object.allPoints == frame and visible(object) then return object end
  end
  error("hit region missing")
end
test("edit command starts a fixed labeled preview instead of a moving demo sequence", function()
  local controller, harness, _, objects, _, _, env = fixture()
  env.SlashCmdList.SPYNONROTATION("edit")
  eq(controller:IsOpen(), true); eq(harness:IsDemoActive(), false); eq(harness:IsPreviewActive(), true)
  eq(controller:GetPanel():GetSection(), "layout")
  assert(label(objects, "TESTE VISUAL - DADOS SIMULADOS"))
  assert(label(objects, "Clique no HUD • prévia parada"))
  tick(objects, 20); eq(harness:GetPreview():GetFrameForId("demo.action_1"), nil)
  assert(harness:GetPreview():GetFrameForId("test.slot_1"))
end)
test("main icon selects only its own size controls without exposing queue or key fields", function()
  local controller, harness, _, objects = fixture(); controller:Edit()
  local frame = harness:GetPreview():GetFrameForId("test.slot_1")
  hitFor(objects, frame).scripts.OnClick(nil, "LeftButton")
  eq(controller:GetPanel():GetSection(), "current")
  assert(label(objects, "Tamanho do ícone principal"))
  eq(label(objects, "Recomendações"), nil); eq(label(objects, "Exibição das teclas"), nil)
  label(objects, "Maior").parent.scripts.OnClick(); tick(objects, 1)
  assert(math.abs(frame.width-230) < 0.001)
end)
test("queued icon and queue background select layout controls", function()
  local controller, harness, _, objects = fixture(); controller:Edit()
  hitFor(objects, harness:GetPreview():GetFrameForId("test.slot_2")).scripts.OnClick(nil, "LeftButton")
  eq(controller:GetPanel():GetSection(), "layout")
  assert(label(objects, "Espaçamento")); assert(label(objects, "Alinhamento"))
  local background = hitFor(objects, harness:GetPreview():GetRoot())
  background.scripts.OnClick(nil, "LeftButton"); eq(controller:GetPanel():GetSection(), "layout")
  eq(label(objects, "Tamanho do ícone principal"), nil)
end)
test("explicit Tecla edit targets exist even without bindings and select only key controls", function()
  local controller, _, model, objects = fixture(); controller:Edit()
  local target = assert(label(objects, "Tecla")).parent
  target.scripts.OnClick(nil, "LeftButton")
  eq(controller:GetPanel():GetSection(), "hotkey"); assert(label(objects, "Posição no ícone"))
  eq(label(objects, "Espaçamento"), nil)
  label(objects, "↙").parent.scripts.OnClick(); eq(model:Get().keyPosition, "BOTTOMLEFT")
  eq(target.point[1], "BOTTOMLEFT"); eq(target.point[3], "BOTTOMLEFT")
end)
test("non-left clicks do not change the selection", function()
  local controller, harness, _, objects = fixture(); controller:Edit()
  hitFor(objects, harness:GetPreview():GetFrameForId("test.slot_1")).scripts.OnClick(nil, "RightButton")
  eq(controller:GetPanel():GetSection(), "layout")
end)
test("close removes all edit mouse targets and restores live presentation", function()
  local controller, harness, _, objects, _, live = fixture(); controller:Edit()
  local old = hitFor(objects, harness:GetPreview():GetFrameForId("test.slot_1"))
  controller:Close(); eq(old.mouseEnabled, false); eq(visible(old), false); eq(live.starts, 1)
  old.scripts.OnClick(nil, "LeftButton"); eq(controller:IsOpen(), false)
  eq(harness:IsPreviewActive(), false)
end)
test("edit targets are lazy and reused across mode changes without intercepting demo", function()
  local controller, harness, _, objects = fixture(); controller:Open()
  eq(label(objects, "Tecla"), nil)
  controller:Edit(); local count = #objects
  local old = hitFor(objects, harness:GetPreview():GetFrameForId("test.slot_1"))
  harness:HandleDemo("demo"); eq(visible(old), false); eq(old.mouseEnabled, false)
  assert(label(objects, "Prévia simulada • mudanças imediatas"))
  controller:Edit(); eq(#objects, count); assert(label(objects, "Tecla"))
end)
test("combat interrupts editing and stale clicks cannot modify any preference", function()
  local controller, harness, model, objects, data = fixture(); controller:Edit()
  local old = hitFor(objects, harness:GetPreview():GetFrameForId("test.slot_1"))
  data.combat = true; old.scripts.OnClick(nil, "LeftButton")
  eq(controller:IsOpen(), false); eq(harness:IsPreviewActive(), false)
  eq(controller:Change("mainScale", 1.15), false); eq(model:Get().mainScale, 1)
  eq(controller:Edit(), false)
end)
test("every supported layout fits bounds and retains current hierarchy", function()
  local controller, harness, model, objects = fixture(); controller:Edit(); model:Set("motion", "OFF")
  local view, count = harness:GetPreview(), #objects
  for _, size in ipairs({0.85, 1, 1.15}) do
    model:Set("mainScale", size)
    for _, gap in ipairs({4,8,16}) do
      model:Set("spacing", gap)
      for _, align in ipairs({"START","CENTER","END"}) do
        model:Set("alignment", align)
        for _, direction in ipairs({"STACKED","LEFT","RIGHT"}) do
          model:Set("direction", direction)
          for amount = 1, 4 do
            model:Set("count", amount)
            for index = 1, amount do
              local frame = view:GetFrameForId("test.slot_" .. index)
              assert(frame.point[4] >= -0.001)
              assert(frame.point[4]+frame.width <= view:GetRoot().width+0.001)
              assert(-frame.point[5]+frame.height <= view:GetRoot().height+0.001)
              assert(frame.width == (index == 1 and 200*size or 80))
            end
          end
        end
      end
    end
  end
  eq(#objects, count)
end)
test("main sizing preserves aspect and scales its icon without affecting queued icon size", function()
  local controller, harness, model, objects = fixture(); controller:Edit(); model:Set("motion", "OFF")
  local first, second = harness:GetPreview():GetFrameForId("test.slot_1"), harness:GetPreview():GetFrameForId("test.slot_2")
  model:Set("mainScale", 0.85)
  eq(first.width, 170); eq(first.height, 102); eq(second.width, 80)
  for _, object in ipairs(objects) do
    if object.parent == first and object.kind == "Texture" and object.layer == "BACKGROUND" and object.uv then
      assert(math.abs(object.width/object.height - 158/94) < 0.001)
    end
  end
end)
test("retired targets cannot remain visible after reducing the queue", function()
  local controller, harness, model, objects = fixture(); controller:Edit(); model:Set("motion", "OFF")
  local retiring = hitFor(objects, harness:GetPreview():GetFrameForId("test.slot_4"))
  model:Set("count", 1); eq(visible(retiring), false)
  model:Set("count", 4); assert(hitFor(objects, harness:GetPreview():GetFrameForId("test.slot_4")))
end)
test("new editor preferences persist as additive schema-1 overrides with old defaults intact", function()
  local saved = {schemaVersion = 1, global = {scale = 0.75}, characters = {}}
  local store = ns.ProfileStoreFactory.Create(saved)
  local identity = {character = "Player-99-ABC", specId = 9101}
  eq(store:Resolve(identity).spacing, 8); eq(store:Resolve(identity).scale, 0.75)
  store:Set("mainScale", 1.15, identity); store:Set("keyPosition", "BOTTOMLEFT", identity)
  local restored = ns.ProfileStoreFactory.Create(saved):Resolve(identity)
  eq(restored.mainScale, 1.15); eq(restored.keyPosition, "BOTTOMLEFT"); eq(restored.count, 4)
end)
print(string.format("HUD editor: %d/%d passed", passed, total))
for _, failure in ipairs(failures) do print(failure) end
if passed ~= total then os.exit(1) end
