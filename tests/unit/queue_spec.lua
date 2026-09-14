local total, passed, failures = 0, 0, {}
local function eq(a, b) assert(a == b, "expected " .. tostring(b) .. ", got " .. tostring(a)) end
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
local function recommendation(id, icon)
  return ns.Contracts.Recommendation.Create({ id = id,
    action = { id = id, kind = "spell", label = id, gameId = 100, icon = icon, capability = "ADDON_AVAILABLE" },
    priority = 1, reason = { code = "test", capability = "ADDON_AVAILABLE" },
  })
end
local function fixture()
  local createFrame, objects = factory()
  return ns.QueueFactory.Create(createFrame, {}, "OFF"), objects
end
test("four recommendations use one current row and three smaller queued icons", function()
  local view = fixture()
  eq(view:SetRecommendations({ recommendation("n.a", 1), recommendation("n.b", 2),
    recommendation("n.c", 3), recommendation("n.d", 4) }), true)
  eq(view:GetRoot().visible, true)
  eq(view:GetFrameForId("n.a").width, 200)
  eq(view:GetFrameForId("n.a").height, 120)
  for i, id in ipairs({ "n.b", "n.c", "n.d" }) do
    local frame = view:GetFrameForId(id)
    eq(frame.width, 80)
    eq(frame.point[4], (i - 1) * 88)
    eq(frame.point[5], -134)
  end
end)
test("surviving actions keep their actual frames through promotion and replacement", function()
  local view, objects = fixture()
  view:SetRecommendations({ recommendation("n.a", 1), recommendation("n.b", 2),
    recommendation("n.c", 3), recommendation("n.d", 4) })
  local a, b, count = view:GetFrameForId("n.a"), view:GetFrameForId("n.b"), #objects
  view:SetRecommendations({ recommendation("n.b", 2), recommendation("n.e", 5), recommendation("n.a", 1) })
  eq(view:GetFrameForId("n.b"), b)
  eq(b.width, 200)
  eq(view:GetFrameForId("n.a"), a)
  eq(a.width, 80)
  eq(view:GetFrameForId("n.d"), nil)
  eq(#objects, count)
end)
test("empty queues hide all content and never fabricate filler recommendations", function()
  local view = fixture()
  view:SetRecommendations({ recommendation("n.a", 1) })
  local old = view:GetFrameForId("n.a")
  view:SetRecommendations({})
  eq(view:GetRoot().visible, false)
  eq(old.visible, false)
  eq(view:GetFrameForId("n.a"), nil)
end)
test("native icon crop keeps artwork aspect and uses approved content UVs", function()
  local view, objects = fixture()
  view:SetRecommendations({ recommendation("n.a", 1), recommendation("n.b", 2) })
  for _, item in ipairs(objects) do
    if item.kind == "Texture" and item.texture == 1 then
      local uv = item.uv
      local sourceRatio = (uv[2] - uv[1]) / (uv[4] - uv[3])
      eq(math.abs(sourceRatio - item.width / item.height) < 0.0001, true)
    elseif item.kind == "Texture" and item.layer == "OVERLAY" and item.parent == view:GetFrameForId("n.a")
      and item.texture:find("action-current", 1, true) then
      eq(item.uv[1], 0.109375)
      eq(item.uv[4], 0.96875)
    end
  end
end)
test("missing icons use local neutral placeholders and retain layout", function()
  local view, objects = fixture()
  view:SetRecommendations({ recommendation("n.a") })
  local frame = view:GetFrameForId("n.a")
  local placeholders = 0
  for _, object in ipairs(objects) do
    if object.parent == frame and object.kind == "FontString" and object.layer == "ARTWORK" then
      eq(object.visible, true); eq(object.text, "?"); placeholders = placeholders + 1
    end
  end
  eq(placeholders, 1)
  view:SetRecommendations({ recommendation("n.a", 1) })
  eq(view:GetFrameForId("n.a"), frame)
end)
test("invalid or restricted Recommendations are not rendered", function()
  local view = fixture()
  local value = recommendation("n.a", 1)
  value.reason.capability = "SIM_ONLY"
  eq(view:SetRecommendations({ value }), false)
  eq(view:GetRoot().visible, false)
  eq(view:SetRecommendations({ recommendation("n.a", 1), recommendation("n.a", 1) }), false)
end)
test("media resolution supports generic spell and item identities without mutating inputs", function()
  local calls = {}
  local media = ns.CompatFactory.Create({
    issecretvalue = function() return false end,
    C_Spell = { GetSpellTexture = function(id) calls.spell = id; return 1234 end },
    C_Item = { GetItemIconByID = function(id) calls.item = id; return 5678 end },
  }).Media
  local spell, item = recommendation("n.spell"), recommendation("n.item")
  item.action.kind = "trinket"
  local result = media:Present({ spell, item })
  eq(result[1].action.icon, 1234)
  eq(result[2].action.icon, 5678)
  eq(spell.action.icon, nil)
  eq(calls.spell, 100)
  eq(calls.item, 100)
end)
test("missing and protected media resolve to a placeholder, never a raw icon value", function()
  local secret = {}
  local media = ns.CompatFactory.Create({ issecretvalue = function(value) return value == secret end,
    C_Spell = { GetSpellTexture = function() return secret end } }).Media
  eq(media:ResolveIcon(recommendation("n.a").action), nil)
  eq(ns.CompatFactory.Create({}).Media:ResolveIcon(recommendation("n.a").action), nil)
end)
test("controller subscribes once and releases its subscription without recreating frames", function()
  local createFrame, objects = factory()
  local callback, subscriptions = nil, 0
  local source = {
    Subscribe = function(_, fn) subscriptions = subscriptions + 1; callback = fn; return function() callback = nil end end,
    GetRecommendations = function() return { recommendation("n.a", 1) } end,
  }
  local controller = ns.QueueControllerFactory.Create(source, ns.CompatFactory.Create({}).Media, createFrame)
  controller:Start(); controller:Start()
  eq(subscriptions, 1)
  local count = #objects
  callback({ recommendation("n.b", 2) })
  eq(controller:GetView():GetFrameForId("n.b").visible, true)
  controller:Stop()
  eq(callback, nil)
  eq(controller:GetView():GetRoot().visible, false)
  controller:Start()
  eq(#objects, count)
end)
print(string.format("Queue UI: %d/%d passed", passed, total))
for _, failure in ipairs(failures) do print(failure) end
if total ~= passed then os.exit(1) end
