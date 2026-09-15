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
    GetTime = function() return 100 end, UIParent = createFrame("Frame") }
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
          for amount = 1, 6 do
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
      assert(math.abs(object.width/object.height - 1) < 0.001)
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
test("production panel has no slider and exposes movement and coupling without advanced panels", function()
  local controller, _, _, objects = fixture(); controller:Open()
  for _, object in ipairs(objects) do assert(object.kind ~= "Slider") end
  controller:GetPanel():Select("queue")
  assert(label(objects, "Mover conjunto")); assert(label(objects, "Organização e encaixe"))
  label(objects, "Mover conjunto").parent.scripts.OnClick()
  eq(controller:GetPanel():GetSection(), "position"); assert(label(objects, "Mover conjunto  ↔"))
  controller:GetPanel():Select("layout"); assert(label(objects, "Acoplado")); assert(label(objects, "6"))
end)

test("all coupled layouts have touching frame boundaries for one to six recommendations", function()
  local function near(a, b) assert(math.abs(a-b) < 0.00001) end
  local controller, harness, model = fixture(); controller:Edit(); model:Set("motion", "OFF")
  local view = harness:GetPreview()
  model:Set("coupled", true)
  for _, size in ipairs({0.85, 1, 1.15}) do
    model:Set("mainScale", size)
    for _, direction in ipairs({"STACKED", "LEFT", "RIGHT"}) do
      model:Set("direction", direction)
      for amount = 1, 6 do
        model:Set("count", amount)
        for index = 1, amount do
          local frame = assert(view:GetFrameForId("test.slot_" .. index))
          assert(frame.point[4] >= -0.001)
          assert(frame.point[4]+frame.width <= view:GetRoot().width+0.001)
          assert(-frame.point[5]+frame.height <= view:GetRoot().height+0.001)
          if index > 1 then
            local previous = view:GetFrameForId("test.slot_" .. (index-1))
            if direction == "STACKED" and index == 2 then near(-frame.point[5], previous.height)
            elseif direction == "LEFT" then near(frame.point[4]+frame.width, previous.point[4])
            else near(frame.point[4], previous.point[4]+previous.width) end
          end
        end
      end
    end
  end
  model:Set("coupled", false); model:Set("direction", "RIGHT"); model:Set("spacing", 16)
  local a, b = view:GetFrameForId("test.slot_1"), view:GetFrameForId("test.slot_2")
  near(b.point[4]-a.width, 16)
end)

test("drag normalizes scales and commits both axes as one undoable action", function()
  for _, scale in ipairs({0.75, 1, 1.25}) do
    local controller, harness, model, objects, _, _, env = fixture(); controller:Edit()
    model:Set("scale", scale)
    local root, handle = harness:GetPreview():GetRoot(), label(objects, "Mover conjunto  ↔").parent
    env.UIParent.centerX, env.UIParent.centerY, env.UIParent.effectiveScale = 800, 450, 0.8
    root.effectiveScale = scale*0.8
    handle.scripts.OnDragStart(); eq(root.moving, true); eq(root.clamped, true)
    root.centerX, root.centerY = 800/scale+120, 450/scale-90
    handle.scripts.OnDragStop(); eq(root.moving, false); eq(root.userPlaced, false)
    eq(model:Get().positionX, 120); eq(model:Get().positionY, 40)
    eq(root.point[4], 120); eq(root.point[5], -90)
    local history = controller:GetHistory(); eq(history:GetStatus().undo, 1)
    history:Undo(); eq(model:Get().positionX, 0); eq(model:Get().positionY, 0)
    history:Redo(); eq(model:Get().positionX, 120); eq(model:Get().positionY, 40)
  end
end)

test("closing navigation combat and external settings cancel movement and stale release", function()
  for _, finish in ipairs({"close", "navigate", "combat", "external", "demo"}) do
    local controller, harness, model, objects, data = fixture(); controller:Edit()
    local root, handle = harness:GetPreview():GetRoot(), label(objects, "Mover conjunto  ↔").parent
    handle.scripts.OnDragStart(); root.centerX, root.centerY = 200, -50
    if finish == "close" then controller:Close()
    elseif finish == "navigate" then controller:GetPanel():Select("information")
    elseif finish == "external" then model:Set("scale", 1.25)
    elseif finish == "demo" then harness:HandleDemo("demo")
    else data.combat = true end
    handle.scripts.OnDragStop()
    eq(root.moving, false); eq(model:Get().positionX, 0); eq(model:Get().positionY, 0)
    eq(controller:GetHistory():GetStatus().undo, 0)
  end
end)

test("position and six-slot preferences survive profile reconstruction without altering ancestors", function()
  local saved = {schemaVersion=1, global={scale=0.75}, characters={}}
  local identity = {character="Player-99-ABC", specId=9101}
  local store = ns.ProfileStoreFactory.Create(saved)
  eq(store:Resolve(identity).positionX, 0); eq(store:Resolve(identity).coupled, false)
  for key, value in pairs({positionX=123, positionY=-456, coupled=true, count=6}) do
    assert(store:Set(key, value, identity))
  end
  local restored = ns.ProfileStoreFactory.Create(saved):Resolve(identity)
  eq(restored.positionX, 123); eq(restored.positionY, -456); eq(restored.count, 6)
  eq(restored.coupled, true); eq(restored.scale, 0.75)
  for _, invalid in ipairs({8193, -8193, 1.5, math.huge, 0/0, "10"}) do
    eq(store:Set("positionX", invalid, identity), false)
  end
end)

test("unavailable malformed or secret frame geometry never enters saved preferences", function()
  local createFrame = factory(); local root, parent = createFrame("Frame"), createFrame("Frame")
  local secret = setmetatable({}, {__sub=function() error("secret arithmetic") end})
  local env = {UIParent=parent, issecretvalue=function(value) return value == secret end}
  local media = ns.CompatFactory.Create(env).Media
  for _, value in ipairs({secret, math.huge, "300", 0/0}) do
    root.centerX = value; eq(media:ReadHUDPosition(root), nil)
  end
  root.centerX = 0; root.effectiveScale = 0; eq(media:ReadHUDPosition(root), nil)
  root.effectiveScale = 1; env.issecretvalue = nil; eq(media:ReadHUDPosition(root), nil)
  env.UIParent = {}; eq(media:ReadHUDPosition(root), nil)
end)

test("demo has six unique entries at every phase and complete replacements retain a bounded pool", function()
  local timeline = ns.DemoTimeline.Create({})
  local controller, harness, model, objects = fixture(); controller:Edit()
  model:Set("count", 6); model:Set("motion", "NORMAL")
  local view, objectCount = harness:GetPreview(), #objects
  for index = 0, 159 do
    local scene, ids = timeline:At(index/10), {}
    eq(#scene.recommendations, 6)
    for _, rec in ipairs(scene.recommendations) do assert(not ids[rec.id]); ids[rec.id] = true end
    assert(view:SetRecommendations(scene.recommendations))
    tick(objects, 0.01)
  end
  for round = 1, 40 do
    local recs = timeline:At(0).recommendations
    for index, rec in ipairs(recs) do rec.id = "replacement_" .. round .. "_" .. index end
    assert(view:SetRecommendations(recs))
  end
  eq(#objects, objectCount); tick(objects, 1)
end)

test("position reset targets only the axes and can be cancelled", function()
  local controller, _, model, objects = fixture(); controller:Edit()
  controller:Change("positionX", 200); controller:Change("positionY", 50); controller:Change("count", 6)
  controller:GetPanel():Select("position")
  label(objects, "Restaurar seção").parent.scripts.OnClick()
  eq(model:Get().positionX, 0); eq(model:Get().positionY, 0); eq(model:Get().count, 6)
  label(objects, "Cancelar prévia").parent.scripts.OnClick(); eq(model:Get().positionX, 200)
end)

test("config button rectangles remain inside the panel and do not overlap on contextual pages", function()
  local controller, _, _, objects = fixture(); controller:Edit()
  for _, page in ipairs({"queue", "information", "current", "hotkey", "layout", "position",
    "animations", "type_text", "typography_roles", "type_hotkey", "advanced_move", "motion_consume"}) do
    controller:GetPanel():Select(page)
    for _, mode in ipairs({"normal", "explore"}) do
      if mode == "explore" then controller:GetHistory():Begin(page, "explore") end
      local boxes = {}
      for _, object in ipairs(objects) do
        if object.kind == "Button" and visible(object) and object.point and object.point[1] == "TOPLEFT" then
          local x, y, w, h = object.point[4], -object.point[5], object.width, object.height
          assert(x >= 0 and y >= 0 and x+w <= 510 and y+h <= 560, page .. " out of bounds")
          for _, box in ipairs(boxes) do
            assert(x+w <= box.x+0.001 or box.x+box.w <= x+0.001 or y+h <= box.y+0.001 or box.y+box.h <= y+0.001,
              page .. " overlapping controls: " .. x .. "," .. y .. " / " .. box.x .. "," .. box.y)
          end
          boxes[#boxes+1] = {x=x,y=y,w=w,h=h}
        end
      end
      controller:GetHistory():Cancel()
    end
  end
end)

print(string.format("HUD editor: %d/%d passed", passed, total))
for _, failure in ipairs(failures) do print(failure) end
if passed ~= total then os.exit(1) end
