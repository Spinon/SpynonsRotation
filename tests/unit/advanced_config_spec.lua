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


local function has(objects, text)
  for _, object in ipairs(objects) do if object.text == text and visible(object) then return true end end
  return false
end
local function advance(config, objects, category)
  config:GetPanel():Select("queue"); click(objects, "Personalizar animações"); click(objects, category); click(objects, "Avançado")
end
local function runner(values, mode)
  local state = {active=false, released=false}
  local animator = ns.AnimatorFactory.Create(function() end, function() state.released=true end,
    function(active) state.active=active end)
  animator:Configure(values or ns.SettingsFactory.Defaults()); animator:SetMode(mode or "NORMAL")
  local slot = {visual={x=0, width=80, alpha=1, scale=1}}
  return animator, slot, state
end

test("technical controls require Fila then animation category then Advanced", function()
  local _, _, _, _, _, config, objects = fixture()
  config:GetPanel():Select(nil); eq(has(objects, "Duração"), false); eq(has(objects, "Avançado"), false)
  config:GetPanel():Select("queue"); eq(has(objects, "Duração"), false)
  click(objects, "Personalizar animações"); eq(has(objects, "Duração"), false); eq(has(objects, "Avançado"), false)
  click(objects, "Movimento"); eq(has(objects, "Duração"), false); eq(has(objects, "Avançado"), true)
  click(objects, "Avançado"); eq(has(objects, "Duração"), true); eq(has(objects, "Ritmo do movimento"), true)
  click(objects, "< Voltar"); eq(has(objects, "Duração"), false)
  click(objects, "< Animações"); click(objects, "< Fila"); eq(config:GetPanel():GetSection(), "queue")
end)

test("all five categories expose only relevant human-named controls", function()
  local _, _, _, _, _, config, objects = fixture()
  for _, category in ipairs({"Movimento", "Entrada", "Saída", "Mudança de prioridade", "Ação utilizada"}) do
    advance(config, objects, category); eq(has(objects, "Duração"), true)
    eq(has(objects, "Ritmo do movimento"), category ~= "Ação utilizada")
    eq(has(objects, "Recomendações"), false)
  end
end)

test("default animation values remain exactly the approved pre-customization timings", function()
  local defaults = ns.SettingsFactory.Defaults()
  eq(defaults.moveDuration, 160); eq(defaults.enterDuration, 180); eq(defaults.exitDuration, 120)
  eq(defaults.promoteDuration, 220); eq(defaults.consumeDuration, 100)
  eq(defaults.moveCurve, "CUBIC"); eq(defaults.enterCurve, "CUBIC")
end)

test("advanced values persist and participate in ordinary undo redo", function()
  local history, model, _, saved, _, config, objects = fixture()
  advance(config, objects, "Movimento"); click(objects, "220 ms"); click(objects, "Constante")
  eq(saved.profiles.global.moveDuration, 220); eq(saved.profiles.global.moveCurve, "LINEAR")
  history:Undo(); eq(model:Get().moveCurve, "CUBIC"); history:Redo(); eq(model:Get().moveCurve, "LINEAR")
  local _, restored = fixture(saved); eq(restored:Get().moveDuration, 220)
end)

test("advanced experiments remain temporary and cancel on navigation", function()
  local history, model, _, saved, _, config, objects = fixture()
  advance(config, objects, "Entrada"); click(objects, "Experimentar"); click(objects, "260 ms")
  eq(model:Get().enterDuration, 260); eq(saved.profiles.global.enterDuration, nil); eq(history:GetStatus().undo, 0)
  click(objects, "< Voltar"); eq(model:Get().enterDuration, 180); eq(history:GetStatus().active, false)
end)

test("advanced section reset preserves other animations and queue reset includes all animations", function()
  local history, model, _, saved, _, config, objects = fixture()
  history:Execute("moveDuration", 220); history:Execute("enterDuration", 260); history:Execute("keys", "off")
  advance(config, objects, "Movimento"); click(objects, "Restaurar seção"); click(objects, "Confirmar restauração")
  eq(model:Get().moveDuration, 160); eq(model:Get().enterDuration, 260)
  config:GetPanel():Select("queue"); click(objects, "Restaurar seção"); click(objects, "Confirmar restauração")
  eq(saved.profiles.global.enterDuration, nil); eq(model:Get().keys, "off")
end)

test("duration controls reject non-enumerated negative and nonfinite values", function()
  local model = ns.SettingsFactory.Create()
  for _, value in ipairs({0, -1, 999, math.huge, 0/0, "160"}) do eq(model:Set("moveDuration", value), false) end
  eq(model:Set("moveCurve", "arbitrary code"), false); eq(model:Get().moveDuration, 160)
end)

test("all spatial transitions finish at their configured duration and release retirees", function()
  local cases = {MOVE={"moveDuration",220}, ENTER={"enterDuration",260}, EXIT={"exitDuration",180},
    PROMOTE={"promoteDuration",280}}
  for kind, definition in pairs(cases) do
    local values = ns.SettingsFactory.Defaults(); values[definition[1]]=definition[2]
    local animator, slot, state = runner(values)
    if kind == "ENTER" then slot.visual=nil end
    animator:Animate(slot, {x=100,width=80,alpha=1,scale=1}, kind, kind=="EXIT")
    animator:Step(definition[2]/1000-0.001, {slot}); eq(state.active, true)
    animator:Step(0.002, {slot}); eq(state.active, false); eq(state.released, kind=="EXIT")
  end
end)

test("interpolation curves follow explicit formulas without overshoot", function()
  for curve, expected in pairs({LINEAR=25, SMOOTH=15.625, CUBIC=57.8125}) do
    local values=ns.SettingsFactory.Defaults(); values.moveDuration=160; values.moveCurve=curve
    local animator, slot = runner(values)
    animator:Animate(slot, {x=100,width=80,alpha=1,scale=1}, "MOVE"); animator:Step(0.04, {slot})
    assert(math.abs(slot.visual.x-expected)<0.000001)
    animator:Step(1, {slot}); eq(slot.visual.x, 100)
  end
end)

test("reduced and off modes override advanced durations and preserve accessibility", function()
  local values=ns.SettingsFactory.Defaults(); values.moveDuration=220; values.enterDuration=260
  for _, mode in ipairs({"REDUCED","OFF"}) do
    local animator, slot, state = runner(values, mode)
    animator:Animate(slot, {x=100,width=80,alpha=1,scale=1}, "MOVE")
    eq(slot.visual.x, 100); eq(state.active, false)
    slot.visual=nil; animator:Animate(slot, {x=100,width=80,alpha=1,scale=1}, "ENTER")
    animator:Step(0.1, {slot}); eq(state.active, false); eq(slot.visual.alpha, 1)
  end
end)

test("consume timing is configurable but reduced mode caps the local accent", function()
  local values=ns.SettingsFactory.Defaults(); values.consumeDuration=140
  for _, mode in ipairs({"NORMAL","REDUCED","OFF"}) do
    local animator, slot, state = runner(values, mode)
    eq(animator:Consume(slot), mode~="OFF")
    if mode~="OFF" then
      eq(slot.consumeDuration, mode=="REDUCED" and 0.1 or 0.14)
      animator:Step(0.11, {slot}); eq(state.active, mode=="NORMAL")
      animator:Step(0.04, {slot}); eq(slot.consumeTime, nil); eq(state.active, false)
    end
  end
end)

test("changing preferences does not mutate an already running pure animator track", function()
  local values=ns.SettingsFactory.Defaults(); values.moveDuration=220
  local animator, slot, state = runner(values)
  animator:Animate(slot, {x=100,width=80,alpha=1,scale=1}, "MOVE")
  values.moveDuration=100; animator:Configure(values)
  animator:Step(0.11, {slot}); eq(state.active, true)
  animator:Step(0.12, {slot}); eq(state.active, false)
end)

test("queue uses new timing without recreating frames or leaving idle timers", function()
  local model=ns.SettingsFactory.Create(); model:Set("enterDuration", 260)
  local createFrame, objects = factory(); local view=ns.QueueFactory.Create(createFrame, {}, nil, model)
  local rec=ns.Contracts.Recommendation.Create({id="fixture.one",action={id="fixture.one",kind="spell",
    gameId=101,icon=123,label="One",capability="ADDON_AVAILABLE"},priority=1,
    reason={code="FIXTURE",capability="ADDON_AVAILABLE"}})
  view:SetRecommendations({rec}); local count=#objects; local frame=view:GetFrameForId("fixture.one")
  view:GetRoot().scripts.OnUpdate(view:GetRoot(), 0.18); assert(frame.alpha<1)
  view:GetRoot().scripts.OnUpdate(view:GetRoot(), 0.09); eq(view:GetRoot().scripts.OnUpdate, nil)
  for index=1,100 do model:Set("moveDuration", index%2==0 and 100 or 220) end
  eq(#objects, count); eq(view:GetFrameForId("fixture.one"), frame); eq(view:GetRoot().scripts.OnUpdate, nil)
end)

test("legacy profiles inherit the new fields without copying them into storage", function()
  local _, model, _, saved = fixture({profiles={schemaVersion=1,global={count=2},characters={}}})
  eq(model:Get().moveDuration, 160); eq(model:Get().moveCurve, "CUBIC")
  eq(saved.profiles.global.moveDuration, nil); eq(saved.profiles.global.count, 2)
end)

print(string.format("Advanced animation panels: %d/%d passed", passed, total))
for _, failure in ipairs(failures) do print(failure) end
if passed ~= total then os.exit(1) end

