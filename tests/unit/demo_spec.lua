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
local function fixture()
  local data = { time = 100, combat = false, liveReads = 0 }
  local env = { issecretvalue = function(v) return v == data.secret end, GetTime = function() return data.time end,
    UnitAffectingCombat = function() return data.combat end,
    SpynonRotationDB = { preserved = true }, UIParent = {},
    C_Spell = { GetSpellCooldownDuration = function()
      data.liveReads = data.liveReads + 1; error("demo queried a live cooldown")
    end },
  }
  local controller = { starts = 0, stops = 0 }
  function controller:Start() self.starts = self.starts + 1 end
  function controller:Stop() self.stops = self.stops + 1 end
  local service = { GetRecommendations = function() return {} end }
  local source = { GetSelection = function() return nil end }
  local createFrame, objects = factory()
  local compat = ns.CompatFactory.Create(env)
  local harness = ns.InGameHarnessFactory.Create(compat, source, service, controller, ns.Specs, createFrame)
  harness:Start()
  local function advance(seconds)
    data.time = data.time + seconds
    for _, object in ipairs(objects) do
      if object.scripts and object.scripts.OnUpdate then object.scripts.OnUpdate(object, seconds) end
    end
  end
  return harness, data, objects, controller, env, advance, compat
end
test("timeline is deterministic, public, isolated and loops at exactly 16 seconds", function()
  local timeline = ns.DemoTimeline.Create({})
  for time = 0, 32, 0.25 do
    local a, b = timeline:At(time), timeline:At(time + 16)
    eq(a.phase, b.phase); eq(a.label, b.label)
    for i, rec in ipairs(a.recommendations) do
      assert(ns.Contracts.Recommendation.IsRuntimeSafe(rec))
      eq(rec.id, b.recommendations[i].id); assert(rec.reason.code:find("DEMO_ONLY", 1, true))
    end
  end
  eq(timeline:At(16).phase, 1); eq(timeline:At(-1), nil); eq(timeline:At(0/0), nil)
end)
test("promotion, entry, consume, counts and all contexts have fixed checkpoints", function()
  local timeline = ns.DemoTimeline.Create({})
  eq(timeline:At(0).recommendations[1].id, "demo.action_1")
  eq(timeline:At(2).recommendations[1].id, "demo.action_2")
  eq(timeline:At(2).overlays["demo.action_2"].count, 5)
  eq(timeline:At(4).recommendations[3].id, "demo.action_5")
  eq(timeline:At(6).consume, "demo.action_2")
  eq(timeline:At(6.07).recommendations[1].id, "demo.action_3")
  eq(timeline:At(8).recommendations[1].context.mode, "AOE")
  eq(timeline:At(4).recommendations[1].context.mode, "CLEAVE")
  eq(timeline:At(12).recommendations[1].context.mode, "SINGLE_TARGET")
  eq(timeline:At(10).overlays["demo.action_5"].count, nil)
end)
test("catalog artwork is copied without changing source identity or requiring a spec", function()
  local original = { id = "fixture.spell", kind = "spell", label = "Fixture", gameId = 123,
    capability = "ADDON_AVAILABLE", tags = { "original" } }
  local timeline = ns.DemoTimeline.Create({ original })
  local state = timeline:At(0)
  eq(state.recommendations[1].action.gameId, 123); eq(original.id, "fixture.spell")
  state.recommendations[1].action.tags[1] = "changed"
  eq(timeline:At(0).recommendations[1].action.tags[1], "original")
  eq(state.recommendations[2].action.gameId, nil)
end)
test("slash demo starts labeled synthetic cooldowns and stop restores the live controller", function()
  local harness, _, objects, controller, env = fixture()
  env.SlashCmdList.SPYNONROTATION("demo")
  eq(harness:IsDemoActive(), true); eq(controller.stops, 1)
  local labeled, cooldown, count = false, false, false
  for _, object in ipairs(objects) do
    if object.text and object.text:find("DEMO - DADOS SIMULADOS", 1, true) then labeled = true end
    if object.kind == "Cooldown" and object.cooldownStart == 100 and object.cooldownDuration == 4 then cooldown = true end
    if object.text == "2" then count = true end
  end
  eq(labeled, true); eq(cooldown, true); eq(count, true)
  env.SlashCmdList.SPYNONROTATION("demo stop")
  eq(harness:IsDemoActive(), false); eq(harness:IsPreviewActive(), false); eq(controller.starts, 1)
  eq(env.SpynonRotationDB.preserved, true); eq(env.SpynonRotationDB.lastSmokeReport, nil)
  for _, object in ipairs(objects) do if object.scripts then eq(object.scripts.OnUpdate, nil) end end
end)
test("synthetic cooldown sink rejects secret and invalid values and clears old data", function()
  local _, data, _, _, _, _, compat = fixture()
  local createFrame = factory(); local widget = createFrame("Cooldown")
  eq(compat.Cooldowns:ApplyDemo(widget, 100, 4), true)
  data.secret = {}; eq(compat.Cooldowns:ApplyDemo(widget, data.secret, 4), false)
  eq(widget.cooldownStart, nil)
  eq(compat.Cooldowns:ApplyDemo(widget, 100, 0), false)
  eq(compat.Cooldowns:ApplyDemo(widget, -1, 4), false)
end)
test("combat, unavailable combat or unavailable clock cannot start a demo", function()
  local harness, data = fixture()
  data.combat = true; eq(harness:HandleDemo("demo"), false)
  data.secret = {}; data.combat = data.secret; eq(harness:HandleDemo("demo"), false)
  data.combat = false; data.time = data.secret; eq(harness:HandleDemo("demo"), false)
  eq(harness:IsDemoActive(), false)
end)
test("all shutdown events cancel demo timers and restore real presentation once", function()
  for _, event in ipairs({ "PLAYER_REGEN_DISABLED", "ADDON_RESTRICTION_STATE_CHANGED", "PLAYER_ENTERING_WORLD" }) do
    local harness, _, objects, controller = fixture()
    harness:HandleDemo("demo")
    objects[1].scripts.OnEvent(objects[1], event)
    eq(harness:IsDemoActive(), false); eq(controller.starts, 1)
    objects[1].scripts.OnEvent(objects[1], event); eq(controller.starts, 1)
    for _, object in ipairs(objects) do if object.scripts then eq(object.scripts.OnUpdate, nil) end end
  end
end)
test("restart resets the sequence without allocating more frames", function()
  local harness, _, objects, _, _, advance = fixture()
  harness:HandleDemo("demo"); local count = #objects
  advance(8); harness:HandleDemo("demo restart")
  eq(#objects, count)
  local initial = false
  for _, object in ipairs(objects) do if object.text and object.text:find("ST - cooldown e 2 cargas", 1, true) then initial = true end end
  eq(initial, true)
end)
test("many cycles reuse the same pool and zero counts do not leave stale labels", function()
  local harness, data, objects, _, _, advance = fixture()
  harness:HandleDemo("demo"); local count = #objects
  advance(8)
  local stacked = false
  for _, object in ipairs(objects) do if object.text == "10" then stacked = true end end
  eq(stacked, true); advance(2)
  for _, object in ipairs(objects) do assert(object.text ~= "10") end
  for _ = 1, 1000 do advance(0.1) end
  eq(#objects, count); eq(harness:IsDemoActive(), true); eq(data.liveReads, 0)
end)
test("switching between static preview and demo leaves only the selected mode active", function()
  local harness, _, objects, _, _, advance = fixture()
  harness:Show(); harness:HandleDemo("demo reduced"); advance(2)
  eq(harness:IsDemoActive(), true)
  harness:Show(); eq(harness:IsDemoActive(), false); eq(harness:IsPreviewActive(), true)
  for _, object in ipairs(objects) do if object.scripts then eq(object.scripts.OnUpdate, nil) end end
  harness:HandleDemo("demo off"); eq(harness:IsDemoActive(), true)
  eq(harness:HandleDemo("demo unknown"), false)
  harness:Handle("test hide"); eq(harness:IsDemoActive(), false)
end)
test("clock loss at a loop boundary exits instead of leaving live recommendations suspended", function()
  local harness, _, objects, controller, env = fixture()
  harness:HandleDemo("demo")
  env.GetTime = nil
  for _, object in ipairs(objects) do
    if object.scripts and object.scripts.OnUpdate then object.scripts.OnUpdate(object, 17) end
  end
  eq(harness:IsDemoActive(), false); eq(harness:IsPreviewActive(), false); eq(controller.starts, 1)
end)
print(string.format("Demo mode: %d/%d passed", passed, total))
for _, failure in ipairs(failures) do print(failure) end
if total ~= passed then os.exit(1) end
