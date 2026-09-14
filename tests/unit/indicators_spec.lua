local total, passed, failures = 0, 0, {}
local function eq(a,b) if a ~= b then error("expected " .. tostring(b) .. ", got " .. tostring(a)) end end
local function test(name, fn)
  total = total + 1
  local ok, err = pcall(fn)
  if ok then passed = passed + 1 else failures[#failures+1] = name .. ": " .. tostring(err) end
  print((ok and "[PASS] " or "[FAIL] ") .. name)
end
local factory = assert(loadfile("tests/fixtures/specs/frame_environment.lua"))()
CreateFrame = factory()
local ns = {}
for line in io.lines("addon/SpynonRotation.toc") do
  local file = line:match("^([^#].*%.lua)%s*$")
  if file then assert(loadfile("addon/" .. file))("SpynonRotation", ns) end
end
local function definition(id)
  return { id = id or "n.a", auraId = id or "n.a", label = "Signal", spellId = 101,
    kind = "buff", showAbsent = true, refreshRecommended = false }
end
local function fixture()
  local secret = {}
  local data = { now = 10 }
  local compat = ns.CompatFactory.Create({ issecretvalue = function(v) return rawequal(v, secret) end,
    GetTime = function() return data.now end })
  local state = { capturedAt = 10, inCombat = true, specId = 263,
    auras = { ["n.a"] = { active = true, duration = 10, expirationTime = 20, applications = 5, unit = "player" } },
    capabilities = { capturedAt = "ADDON_AVAILABLE", inCombat = "ADDON_AVAILABLE", specId = "ADDON_AVAILABLE",
      ["auras.n.a"] = "ADDON_AVAILABLE" } }
  local createFrame, objects = factory()
  return state, compat, secret, data, createFrame, objects
end
local function indicator(id, state, expiry)
  return { id = id, label = id, kind = "buff", spellId = 101, state = state or "STABLE",
    expiresAt = expiry, attentionSeconds = 3 }
end
test("resolver exposes only guarded aura data and preserves snapshots", function()
  local state, compat = fixture()
  local result = ns.IndicatorEngine.Resolve({ definition() }, state, compat.State)
  eq(#result, 1); eq(result[1].state, "STABLE"); eq(result[1].stacks, 5); eq(result[1].expiresAt, 20)
  result[1].stacks = 8; eq(state.auras["n.a"].applications, 5)
  assert(ns.Contracts.Indicator.Validate(result[1]))
end)
test("absence and unavailable signals are never conflated", function()
  local state, compat = fixture()
  state.auras["n.a"].active = false
  eq(ns.IndicatorEngine.Resolve({ definition() }, state, compat.State)[1].state, "ABSENT")
  state.capabilities["auras.n.a"] = "CONDITIONALLY_SECRET"
  local value = ns.IndicatorEngine.Resolve({ definition() }, state, compat.State)[1]
  eq(value.state, "UNAVAILABLE"); eq(value.stacks, nil); eq(value.expiresAt, nil)
end)
test("secret scalar fields and narrower capabilities cannot escape through display metadata", function()
  local state, compat, secret = fixture()
  state.auras["n.a"].applications = secret
  eq(ns.IndicatorEngine.Resolve({ definition() }, state, compat.State)[1].stacks, nil)
  state.capabilities["auras.n.a.expirationTime"] = "CONDITIONALLY_SECRET"
  eq(ns.IndicatorEngine.Resolve({ definition() }, state, compat.State)[1].state, "UNAVAILABLE")
  state.capabilities["auras.n.a.expirationTime"] = nil
  state.auras["n.a"].active = secret
  eq(ns.IndicatorEngine.Resolve({ definition() }, state, compat.State)[1].state, "UNAVAILABLE")
end)
test("target aura requires public player ownership", function()
  local state, compat = fixture()
  state.auras["n.a"].unit = "target"
  local def = definition(); def.kind = "debuff"
  eq(ns.IndicatorEngine.Resolve({ def }, state, compat.State)[1].state, "UNAVAILABLE")
  state.auras["n.a"].playerOwned = true
  eq(ns.IndicatorEngine.Resolve({ def }, state, compat.State)[1].state, "STABLE")
end)
test("timeless buffs do not invent infinity and expired snapshots do not invent absence", function()
  local state, compat = fixture()
  local aura = state.auras["n.a"]
  aura.duration, aura.expirationTime = 0, 0
  local result = ns.IndicatorEngine.Resolve({ definition() }, state, compat.State)[1]
  eq(result.state, "STABLE"); eq(result.expiresAt, nil)
  aura.duration, aura.expirationTime = 10, 9
  eq(ns.IndicatorEngine.Resolve({ definition() }, state, compat.State)[1].state, "UNAVAILABLE")
end)
test("malformed definitions and duplicates fail closed; hidden absences are omitted", function()
  local state, compat = fixture()
  eq(#ns.IndicatorEngine.Resolve({ definition(), definition() }, state, compat.State), 0)
  local def = definition(); def.spellId = -1
  eq(#ns.IndicatorEngine.Resolve({ def }, state, compat.State), 0)
  def = definition(); def.showAbsent = false; state.auras["n.a"].active = false
  eq(#ns.IndicatorEngine.Resolve({ def }, state, compat.State), 0)
end)
test("status bands use explicit refresh and public time, with expiry as unavailable", function()
  local value = indicator("a", "STABLE", 20)
  eq(ns.Contracts.Indicator.At(value, 10), "STABLE")
  eq(ns.Contracts.Indicator.At(value, 17), "ATTENTION")
  value.refreshRecommended = true; eq(ns.Contracts.Indicator.At(value, 17), "REFRESH")
  eq(ns.Contracts.Indicator.At(value, 20), "UNAVAILABLE")
  eq(ns.Contracts.Indicator.At(value, nil), "UNAVAILABLE")
end)
test("unavailable display payloads cannot carry stale counts or lifetimes", function()
  local value = indicator("a", "UNAVAILABLE", 20)
  eq(ns.Contracts.Indicator.Validate(value), false)
  value.expiresAt, value.stacks = nil, 4; eq(ns.Contracts.Indicator.Validate(value), false)
  value.stacks = nil; eq(ns.Contracts.Indicator.Validate(value), true)
end)
test("provider is optional and cannot publish outside combat or on selection mismatch", function()
  local state, compat = fixture()
  local selection = { specId = 263 }
  local source = { GetSnapshot = function() return state end, GetSelection = function() return selection end }
  local module = { getIndicators = function() return { definition() } end }
  local registry = { GetBySpecId = function() return module end }
  local provider = ns.IndicatorEngine.Create(source, registry, compat.State, compat.Media)
  local recs = { ns.Contracts.Recommendation.Create({ id = "n.a", priority = 1,
    action = { id = "n.a", kind = "spell", label = "A", capability = "ADDON_AVAILABLE" },
    reason = { code = "TEST", capability = "ADDON_AVAILABLE" } }) }
  eq(#provider:ForRecommendations(recs), 1)
  eq(#provider:ForRecommendations({ {} }), 0)
  eq(#provider:ForRecommendations({}), 0)
  state.inCombat = false; eq(#provider:ForRecommendations(recs), 0)
  state.inCombat = true; selection.specId = 264; eq(#provider:ForRecommendations(recs), 0)
  selection.specId = 263; module.getIndicators = nil; eq(#provider:ForRecommendations(recs), 0)
  module.getIndicators = function() error("bad provider") end; eq(#provider:ForRecommendations(recs), 0)
end)
test("spec derives aura inputs only from selected compiled rules, respecting talents", function()
  local module = ns.Classes.Shaman.Enhancement.Module
  local selection = { activeSpellRanks = {}, heroTree = { id = 55 } }
  local rec = { reason = { code = "enhancement.aoe_lava_lash_1" }, action = { id = "enhancement.lava_lash" } }
  eq(#module.getIndicators(selection, { rec }), 0)
  selection.activeSpellRanks[201900] = 1
  local result = module.getIndicators(selection, { rec })
  eq(#result, 1); eq(result[1].auraId, "enhancement.hot_hand")
  rec.action.id = "different"; eq(#module.getIndicators(selection, { rec }), 0)
  rec.action.id = "enhancement.lava_lash"; rec.reason.code = "DEMO_ONLY_PHASE_1"
  eq(#module.getIndicators(selection, { rec }), 0)
end)
test("aura stack resources map through module catalog without a UI spec condition", function()
  local module = ns.Classes.Shaman.Enhancement.Module
  local selection = { activeSpellRanks = { [187880] = 1, [454009] = 1 }, heroTree = { id = 55 } }
  local result = module.getIndicators(selection,
    { { reason = { code = "enhancement.aoe_tempest_1" }, action = { id = "enhancement.tempest" } } })
  local found = false
  for _, value in ipairs(result) do if value.auraId == "enhancement.maelstrom_weapon" then found = true end end
  eq(found, true)
end)
test("urgency ordering is stable within bands and defaults to three with a ceiling of five", function()
  local _, compat, _, data, createFrame = fixture()
  local view = ns.AuraIndicatorsFactory.Create(createFrame, {}, compat.State)
  local values = { indicator("z", "UNAVAILABLE"), indicator("b", "STABLE", 25),
    indicator("a", "STABLE", 30), indicator("missing", "ABSENT"), indicator("refresh", "STABLE", 40) }
  values[5].refreshRecommended = true
  view:Set(values)
  eq(view:GetFrameForId("missing").point[4], 0)
  eq(view:GetFrameForId("refresh").point[4], 128)
  eq(view:GetFrameForId("a").point[4], 256); eq(view:GetFrameForId("b"), nil)
  eq(view:SetLimit(5), true); eq(view:SetLimit(6), false)
  local a = view:GetFrameForId("a"); data.now = 11
  view:GetRoot().scripts.OnUpdate(view:GetRoot(), 0.2)
  eq(view:GetFrameForId("a"), a); eq(a.point[4], 256)
end)
test("countdown stops on expiration without showing absent and clear releases timer", function()
  local _, compat, _, data, createFrame, objects = fixture()
  local view = ns.AuraIndicatorsFactory.Create(createFrame, {}, compat.State)
  view:Set({ indicator("a", "STABLE", 11) }); assert(view:GetRoot().scripts.OnUpdate)
  data.now = 11; view:GetRoot().scripts.OnUpdate(view:GetRoot(), 0.2)
  eq(view:GetRoot().scripts.OnUpdate, nil)
  local unavailable = false
  for _, object in ipairs(objects) do if object.text == "—" then unavailable = true end; assert(object.text ~= "AUSENTE") end
  eq(unavailable, true); view:Clear(); eq(view:GetFrameForId("a"), nil); eq(view:GetRoot().visible, false)
end)
test("updates reuse cells and copy inputs; empty or invalid data removes all indicators", function()
  local _, compat, _, _, createFrame, objects = fixture()
  local view = ns.AuraIndicatorsFactory.Create(createFrame, {}, compat.State)
  local input = { indicator("a", "STABLE", 20) }; view:Set(input)
  local count = #objects; input[1].label = "changed"
  view:GetRoot().scripts.OnUpdate(view:GetRoot(), 0.2)
  for _, object in ipairs(objects) do assert(object.text ~= "Buff: changed") end
  for _ = 1, 100 do view:Set({ indicator("b", "ABSENT"), indicator("a", "STABLE", 20) }) end
  eq(#objects, count)
  eq(view:Set({ indicator("a"), indicator("a") }), false); eq(view:GetRoot().visible, false)
  view:Set({ indicator("a") }); view:Set({}); eq(view:GetRoot().scripts.OnUpdate, nil)
end)
test("all demo checkpoints carry valid isolated states for the aura renderer", function()
  local timeline = ns.DemoTimeline.Create({})
  local states = {}
  for time = 0, 15.9, 0.1 do
    for _, value in ipairs(timeline:At(time).indicators) do
      assert(ns.Contracts.Indicator.Validate(value)); states[ns.Contracts.Indicator.At(value, time)] = true
    end
  end
  for _, name in ipairs({ "STABLE", "ATTENTION", "REFRESH", "ABSENT", "UNAVAILABLE" }) do eq(states[name], true) end
end)
test("SpecModule indicator provider is optional and must be callable", function()
  local value = { id = "neutral.test", classId = 99, specId = 999, displayName = "Neutral", version = "1",
    getActions = function() return {} end, getRules = function() return {} end }
  assert(ns.Contracts.SpecModule.Create(value))
  value.getIndicators = true; eq(ns.Contracts.SpecModule.Create(value), nil)
  value.getIndicators = function() return {} end
  assert(ns.Contracts.SpecModule.Create(value).getIndicators)
end)
test("live queue restriction and stop clear the indicator timer without recreating frames", function()
  local _, compat, _, _, createFrame, objects = fixture()
  local rec = ns.Contracts.Recommendation.Create({ id = "n.a", priority = 1,
    action = { id = "n.a", kind = "spell", label = "A", capability = "ADDON_AVAILABLE" },
    reason = { code = "TEST", capability = "ADDON_AVAILABLE" } })
  local callback
  local service = { GetRecommendations = function() return { rec } end,
    Subscribe = function(_, fn) callback = fn; return function() callback = nil end end }
  local provider = { ForRecommendations = function() return { indicator("a", "STABLE", 20) } end }
  local controller = ns.QueueControllerFactory.Create(service, compat.Media, createFrame,
    nil, nil, nil, provider, compat.State)
  controller:Start(); controller:GetView():SetMotionMode("OFF")
  local count = #objects
  controller:GetView():GetRoot().scripts.OnEvent(nil, "ADDON_RESTRICTION_STATE_CHANGED")
  for _, object in ipairs(objects) do if object.scripts then eq(object.scripts.OnUpdate, nil) end end
  callback({ rec }); eq(#objects, count)
  controller:Stop(); eq(callback, nil)
  for _, object in ipairs(objects) do if object.scripts then eq(object.scripts.OnUpdate, nil) end end
end)
print(string.format("Aura indicators: %d/%d passed", passed, total))
for _, failure in ipairs(failures) do print(failure) end
if total ~= passed then os.exit(1) end
