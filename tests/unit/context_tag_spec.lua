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
local function fixture()
  local createFrame, objects = factory()
  local data = {combat = false, available = false, count = 1}
  local env = {issecretvalue = function() return false end, UIParent = createFrame("Frame"),
    UnitAffectingCombat = function() return data.combat end, GetTime = function() return 100 end}
  local compat, settings = ns.CompatFactory.Create(env), ns.SettingsFactory.Create()
  compat.Console:Register(function() end)
  local source, callback = {applied = 0}, nil
  function source:GetRecommendations() return {} end
  function source:Subscribe(fn) callback = fn; return function() callback = nil end end
  function source:SetContext(context)
    self.last = context; self.applied = self.applied + 1
    if callback then callback({}) end
    return true
  end
  local state = {GetSelection = function() return nil end}
  function state:Subscribe(fn) self.callback = fn; return function() self.callback = nil end end
  local detector = ns.ContextDetectorFactory.Create({ReadEnemyCount = function()
    return {ok = data.available, value = data.count, capability = "ADDON_AVAILABLE"}
  end}, compat.State)
  local context = ns.ContextControllerFactory.Create(detector, state, source, compat.Console)
  context:Start()
  local controller = ns.QueueControllerFactory.Create(source, compat.Media, createFrame,
    nil, nil, nil, nil, nil, settings, context)
  controller:Start()
  local button = controller:GetContextTag():GetRoot()
  local label
  for _, object in ipairs(objects) do
    if object.parent == button and object.kind == "FontString" and object.text:find("Auto:", 1, true) then
      label = object
    end
  end
  assert(label)
  return {controller = controller, context = context, source = source, settings = settings,
    button = button, label = label, objects = objects, data = data, env = env, state = state,
    compat = compat, createFrame = createFrame}
end
test("empty real queue retains a bounded sibling control with explicit automatic fallback", function()
  local f = fixture(); local root = f.controller:GetView():GetRoot()
  eq(root.visible, false); eq(f.button.visible, true); eq(f.button.mouseEnabled, true)
  eq(f.button.parent, f.env.UIParent); eq(f.button.point[2], root); eq(f.button.clamped, true)
  eq(f.button.point[1], "BOTTOM"); eq(f.button.point[3], "TOP")
  eq(f.label.text, "Auto: ST · fallback  >")
  eq(root.mouseEnabled, false); eq(f.button.keyboard, nil)
  assert(f.button.width >= f.label:GetStringWidth() + 24)
end)
test("left click cycles every mode once and immediately reapplies context with an empty queue", function()
  local f = fixture()
  for index, mode in ipairs({"SINGLE_TARGET", "CLEAVE", "AOE", "AUTO"}) do
    f.button.scripts.OnClick(f.button, "LeftButton")
    eq(f.context:GetStatus().mode, mode); eq(f.source.last.mode, mode); eq(f.source.applied, index+1)
    eq(f.button.visible, true)
    assert(f.label.text:find(mode == "AUTO" and "fallback" or "manual", 1, true))
  end
  f.button.scripts.OnClick(f.button, "RightButton"); eq(f.context:GetStatus().mode, "AUTO")
end)
test("slash and automatic diagnostic changes update the same tag without polling", function()
  local f = fixture()
  f.env.SlashCmdList.SPYNONROTATION("context aoe"); eq(f.label.text, "AoE · manual  >")
  f.env.SlashCmdList.SPYNONROTATION("context auto"); eq(f.label.text, "Auto: ST · fallback  >")
  local applied = f.source.applied
  f.data.available = true; f.state.callback()
  eq(f.source.applied, applied); eq(f.label.text, "Auto: ST · observado  >")
  f.data.count = 5; f.state.callback(); eq(f.label.text, "Auto: AoE · observado  >")
  eq(f.button.scripts.OnUpdate, nil)
end)
test("tag follows HUD scale and anchor and accommodates configured typography", function()
  local f = fixture(); local root = f.controller:GetView():GetRoot()
  f.settings:Set("scale", 0.75); f.settings:Set("positionX", 140); f.settings:Set("positionY", -35)
  eq(f.button.scale, root.scale); eq(f.button.point[2], root); eq(root.point[4], 140)
  f.settings:Set("direction", "LEFT"); f.settings:Set("count", 6); f.settings:Set("textSize", 1.25)
  assert(f.button.width >= f.label:GetStringWidth()+24)
  eq(f.button.point[2], root); eq(f.button.scale, 0.75)
end)
test("stop removes interactions and subscriptions while restart reuses controls with fresh state", function()
  local f = fixture(); local count, text = #f.objects, f.label.text
  f.controller:Stop(); eq(f.button.visible, false); eq(f.button.mouseEnabled, false)
  f.button.scripts.OnClick(f.button, "LeftButton"); eq(f.context:GetStatus().mode, "AUTO")
  f.context:SetMode("AOE"); eq(f.label.text, text)
  f.settings:Set("scale", 1.25); eq(f.button.scale, 1)
  f.controller:Start(); eq(f.label.text, "AoE · manual  >"); eq(f.button.scale, 1.25)
  for _ = 1, 50 do f.controller:Stop(); f.controller:Start(); f.controller:Start() end
  eq(#f.objects, count); eq(f.button.visible, true)
  local applied = f.source.applied
  f.button.scripts.OnClick(f.button, "LeftButton"); eq(f.source.applied, applied+1)
end)
test("demo config and edit hide the real tag and restore it including on simulated combat entry", function()
  local f = fixture(); ns.Settings = f.settings
  local harness = ns.InGameHarnessFactory.Create(f.compat, f.state, f.source, f.controller, ns.Specs, f.createFrame)
  harness:Start()
  local config = ns.ConfigControllerFactory.Create(f.compat, f.createFrame, f.settings, harness)
  config:Start()
  config:Open(); eq(f.button.visible, false)
  f.button.scripts.OnClick(f.button, "LeftButton"); eq(f.context:GetStatus().mode, "AUTO")
  config:Close(); eq(f.button.visible, true)
  config:Edit(); eq(f.button.visible, false)
  f.data.combat = true
  for _, object in ipairs(f.objects) do
    if object.events and object.events.PLAYER_REGEN_DISABLED then
      object.scripts.OnEvent(object, "PLAYER_REGEN_DISABLED")
    end
  end
  eq(config:IsOpen(), false); eq(f.button.visible, true)
  -- The fixture cannot validate native lockdown/taint. It proves no combat gate is added to mode choice.
  f.button.scripts.OnClick(f.button, "LeftButton"); eq(f.context:GetStatus().mode, "SINGLE_TARGET")
end)
print(string.format("Context tag: %d/%d passed", passed, total))
for _, failure in ipairs(failures) do print(failure) end
if passed ~= total then os.exit(1) end
