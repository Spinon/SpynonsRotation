local passed, total, failures = 0, 0, {}
local function eq(a, b)
  if a ~= b then error("expected " .. tostring(b) .. ", got " .. tostring(a)) end
end
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
local function rec()
  return ns.Contracts.Recommendation.Create({ id = "test.a", action = { id = "test.a", kind = "spell",
    label = "Fixture", gameId = 101, icon = 123, capability = "ADDON_AVAILABLE" }, priority = 1,
    reason = { code = "TEST", capability = "ADDON_AVAILABLE" } })
end
local function fixture()
  local secret = {}
  local opaque = setmetatable({}, { __index = function() error("duration internals inspected") end,
    __tostring = function() error("duration serialized") end })
  local data = { clock = 10.5, start = 10, duration = 2, modRate = 1, opaque = opaque, auraStacks = 3 }
  local env = {
    issecretvalue = function(v) return rawequal(v, secret) end,
    GetTime = function() return data.clock end,
    C_Secrets = { ShouldSpellCooldownBeSecret = function() return data.restricted or false end,
      ShouldSpellAuraBeSecret = function() return data.restricted or false end },
    UnitExists = function() return true end, UnitIsVisible = function() return true end,
    C_UnitAuras = { GetUnitAuraBySpellID = function()
      return { applications = data.auraStacks, duration = 10, expirationTime = 20 }
    end },
    C_Spell = {
      GetSpellCooldownDuration = function(id, ignoreGCD)
        data.requested, data.ignoreGCD = id, ignoreGCD; return data.opaque
      end,
      GetSpellChargeDuration = function() data.usedCharges = true; return data.opaque end,
      GetSpellCharges = function() return data.charges end,
      GetSpellCooldown = function(id)
        data.gcdId = id
        return { startTime = data.start, duration = data.duration, modRate = data.modRate, isEnabled = true }
      end,
    },
  }
  local createFrame, objects = factory()
  return ns.CompatFactory.Create(env).Cooldowns, env, data, secret, createFrame, objects
end
test("duration is forwarded opaquely with ignoreGCD and clear-if-zero", function()
  local adapter, _, data, _, createFrame = fixture()
  local widget = createFrame("Cooldown")
  local count = adapter:Apply(widget, rec().action)
  eq(widget.durationObject, data.opaque); eq(widget.clearIfZero, true)
  eq(data.ignoreGCD, true); eq(data.requested, 101)
  eq(count.kind, "stacks"); eq(count.value, 3)
end)
test("protected numeric state can still use the permitted native duration sink", function()
  local adapter, _, data, _, createFrame = fixture()
  data.restricted = true
  local widget = createFrame("Cooldown")
  eq(adapter:Apply(widget, rec().action), nil)
  eq(widget.durationObject, data.opaque)
  eq(adapter:ReadGCD(), nil)
end)
test("missing duration API, secret handles and rejected objects clear earlier cooldowns", function()
  local adapter, env, data, secret, createFrame = fixture()
  local widget = createFrame("Cooldown")
  adapter:Apply(widget, rec().action); data.opaque = secret
  adapter:Apply(widget, rec().action); eq(widget.durationObject, nil)
  env.C_Spell.GetSpellCooldownDuration = nil
  adapter:Apply(widget, rec().action); eq(widget.durationObject, nil)
  data.opaque = {}; env.C_Spell.GetSpellCooldownDuration = function() return data.opaque end
  widget.SetCooldownFromDurationObject = function(self) self.durationObject = {}; error("unsupported") end
  adapter:Apply(widget, rec().action); eq(widget.durationObject, nil)
end)
test("partial recharge has priority only with public positive remaining charges", function()
  local adapter, _, data, _, createFrame = fixture()
  data.charges = { currentCharges = 1, maxCharges = 2, cooldownStartTime = 10, cooldownDuration = 20, chargeModRate = 1 }
  local count = adapter:Apply(createFrame("Cooldown"), rec().action)
  eq(count.kind, "charges"); eq(count.value, 1); eq(data.usedCharges, true)
  data.charges.currentCharges, data.usedCharges = 0, nil
  eq(adapter:Apply(createFrame("Cooldown"), rec().action), nil); eq(data.usedCharges, nil)
end)
test("zero or protected aura stacks are not displayed and no count is invented", function()
  local adapter, _, data, secret, createFrame = fixture()
  data.auraStacks = 0; eq(adapter:Apply(createFrame("Cooldown"), rec().action), nil)
  data.auraStacks = secret; eq(adapter:Apply(createFrame("Cooldown"), rec().action), nil)
end)
test("items do not get queried as spell IDs", function()
  local adapter, _, data, _, createFrame = fixture()
  local action = rec().action; action.kind = "item"
  eq(adapter:Apply(createFrame("Cooldown"), action), nil); eq(data.requested, nil)
end)
test("GCD uses public observed time and stops exactly at the end", function()
  local adapter, _, data = fixture()
  local timing = adapter:ReadGCD(); eq(data.gcdId, 61304)
  eq(adapter:GCDProgress(timing), 0.25)
  data.clock = 12; eq(adapter:GCDProgress(timing), nil)
  data.clock = 9; eq(adapter:GCDProgress(timing), nil)
  data.duration = 0; eq(adapter:ReadGCD(), nil)
end)
test("unavailable clocks, protected cooldowns and unsupported rates hide GCD fill", function()
  local adapter, env, data, secret = fixture()
  local timing = adapter:ReadGCD()
  data.clock = secret; eq(adapter:GCDProgress(timing), nil)
  env.GetTime = nil; eq(adapter:GCDProgress(timing), nil)
  data.start = secret; eq(adapter:ReadGCD(), nil)
  data.start, data.modRate = 10, 2; eq(adapter:ReadGCD(), nil)
end)
test("native cooldown is confined to icon and text layers are above the swipe", function()
  local _, _, _, _, createFrame, objects = fixture()
  local frame = createFrame("Frame"); local icon = frame:CreateTexture(nil, "BACKGROUND")
  local view = ns.CooldownOverlayFactory.Create(createFrame, frame, icon)
  local cooldown
  for _, object in ipairs(objects) do if object.kind == "Cooldown" then cooldown = object end end
  eq(cooldown.allPoints, icon); eq(cooldown.drawSwipe, true); eq(cooldown.drawEdge, false)
  eq(cooldown.drawBling, false); eq(cooldown.reverse, false)
  assert(view:GetLabelParent():GetFrameLevel() > cooldown:GetFrameLevel())
  view:SetNumbers(false); eq(cooldown.hideNumbers, true); eq(cooldown.drawSwipe, true)
end)
test("GCD and motion share one timer which stops on completion or hide", function()
  local adapter, _, data, _, createFrame = fixture()
  local view = ns.QueueFactory.Create(createFrame, {}, "OFF")
  view:SetRecommendations({ rec() }); view:RefreshOverlays(adapter)
  local root = view:GetRoot(); assert(root.scripts.OnUpdate)
  data.clock = 12; root.scripts.OnUpdate(root, 0.02); eq(root.scripts.OnUpdate, nil)
  data.clock = 10.5; view:RefreshOverlays(adapter); assert(root.scripts.OnUpdate)
  view:Hide(); eq(root.scripts.OnUpdate, nil)
end)
test("refresh clearing removes count, duration handles and GCD without discarding identity", function()
  local adapter, _, _, _, createFrame, objects = fixture()
  local view = ns.QueueFactory.Create(createFrame, {}, "OFF")
  view:SetRecommendations({ rec() }); view:RefreshOverlays(adapter)
  local identity = view:GetFrameForId("test.a")
  view:ClearOverlays(); eq(view:GetFrameForId("test.a"), identity)
  eq(view:GetRoot().scripts.OnUpdate, nil)
  for _, object in ipairs(objects) do
    if object.kind == "Cooldown" then eq(object.durationObject, nil) end
    if object.kind == "FontString" then assert(object.text ~= "3") end
  end
end)
test("controller refreshes unchanged identities and clears restrictions without bindings", function()
  local adapter, _, data, _, createFrame, objects = fixture()
  local callback
  local source = {
    Subscribe = function(_, fn) callback = fn; return function() callback = nil end end,
    GetRecommendations = function() return { rec() } end,
  }
  local controller = ns.QueueControllerFactory.Create(source, ns.CompatFactory.Create({}).Media,
    createFrame, nil, nil, adapter)
  controller:Start()
  local view, root = controller:GetView(), controller:GetView():GetRoot()
  view:SetMotionMode("OFF")
  local identity = view:GetFrameForId("test.a")
  data.auraStacks = 4; callback({ rec() })
  eq(view:GetFrameForId("test.a"), identity)
  local updated = false
  for _, object in ipairs(objects) do if object.kind == "FontString" and object.text == "4" then updated = true end end
  eq(updated, true); eq(root.events.ADDON_RESTRICTION_STATE_CHANGED, true)
  data.requested = nil
  root.scripts.OnEvent(root, "ADDON_RESTRICTION_STATE_CHANGED")
  eq(data.requested, nil); eq(root.scripts.OnUpdate, nil)
  for _, object in ipairs(objects) do if object.kind == "Cooldown" then eq(object.durationObject, nil) end end
  controller:Stop(); eq(callback, nil)
end)
print(string.format("Cooldown overlays: %d/%d passed", passed, total))
for _, failure in ipairs(failures) do print(failure) end
if total ~= passed then os.exit(1) end
