local passed, total, failures = 0, 0, {}
local function eq(a, b) assert(a == b, "expected " .. tostring(b) .. ", got " .. tostring(a)) end
local function near(a, b) assert(math.abs(a - b) < 0.000001, "not near: " .. a .. ", " .. b) end
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
local function rec(id, spell)
  return ns.Contracts.Recommendation.Create({ id = "test." .. id,
    action = { id = "test." .. id, kind = "spell", label = id, gameId = spell or 101, icon = 123,
      capability = "ADDON_AVAILABLE" }, priority = 1, reason = { code = "FIXTURE", capability = "ADDON_AVAILABLE" } })
end
local function fixture(mode)
  local createFrame, objects = factory()
  local view = ns.QueueFactory.Create(createFrame, {}, mode)
  local function update(ids)
    local queue = {}
    for _, id in ipairs(ids) do queue[#queue + 1] = rec(id) end
    view:SetRecommendations(queue)
  end
  local function step(dt)
    local callback = view:GetRoot().scripts.OnUpdate
    if callback then callback(view:GetRoot(), dt) end
  end
  return view, update, step, objects
end
test("diff distinguishes entry, exit, movement and promotion without inventing consumption", function()
  local classify = ns.AnimatorFactory.Classify
  eq(classify(nil, 1), "ENTER"); eq(classify(2, 1), "PROMOTE")
  eq(classify(3, 2), "MOVE"); eq(classify(1, 3), "MOVE")
  eq(classify(1, nil), "EXIT"); eq(classify(2, 2), nil)
end)
test("entry fades in from the right and stops its shared timer at 180ms", function()
  local view, update, step = fixture()
  update({ "a", "b" })
  local frame = view:GetFrameForId("test.b")
  eq(view:GetTransition("test.b"), "ENTER")
  eq(frame.alpha, 0); assert(frame.point[4] >= 20); near(frame.width, 76.8)
  step(0.09); assert(frame.alpha > 0 and frame.alpha < 1)
  step(0.09); near(frame.alpha, 1); near(frame.point[4], 0); near(frame.width, 80)
  eq(view:GetRoot().scripts.OnUpdate, nil)
end)
test("promotion keeps frame identity and smoothly reaches current geometry", function()
  local view, update, step = fixture()
  update({ "a", "b", "c", "d" }); step(1)
  local b, c = view:GetFrameForId("test.b"), view:GetFrameForId("test.c")
  update({ "b", "c", "e", "a" })
  eq(view:GetTransition("test.b"), "PROMOTE"); eq(view:GetTransition("test.c"), "MOVE")
  eq(view:GetFrameForId("test.b"), b); near(b.width, 80); near(b.point[5], -134)
  step(0.11); assert(b.width > 80 and b.width < 200); near(c.alpha, 1); near(c.width, 80)
  step(0.11); near(b.width, 200); near(b.point[4], 28); near(b.point[5], 0)
  eq(view:GetRoot().scripts.OnUpdate, nil)
end)
test("new destinations retarget from the current visual position without snapping", function()
  local view, update, step = fixture()
  update({ "a", "b", "c" }); step(1)
  update({ "b", "c", "a" }); step(0.07)
  local frame = view:GetFrameForId("test.b")
  local x, y, width = frame.point[4], frame.point[5], frame.width
  update({ "c", "a", "b" })
  near(frame.point[4], x); near(frame.point[5], y); near(frame.width, width)
  step(1); near(frame.point[4], 88); near(frame.point[5], -134); near(frame.width, 80)
end)
test("same-priority state updates do not restart animations", function()
  local view, update, step = fixture()
  update({ "a", "b" }); step(0.09)
  local alpha = view:GetFrameForId("test.b").alpha
  update({ "a", "b" }); near(view:GetFrameForId("test.b").alpha, alpha)
  step(0.09); eq(view:GetRoot().scripts.OnUpdate, nil)
end)
test("exit fades locally while new icons use other pooled frames", function()
  local view, update, step = fixture()
  update({ "a", "b" }); step(1)
  local b = view:GetFrameForId("test.b")
  update({ "a", "c" }); eq(view:GetFrameForId("test.b"), nil); eq(b.visible, true)
  assert(view:GetFrameForId("test.c") ~= b)
  step(0.06); assert(b.alpha > 0 and b.alpha < 1); assert(b.width < 80)
  near(b.point[4] + b.width / 2, 40)
  step(0.06); eq(b.visible, false)
end)
test("rapid complete replacements stay within eight pooled frames", function()
  local view, update, step, objects = fixture()
  local count = #objects
  for i = 1, 100 do
    update({ i .. "a", i .. "b", i .. "c", i .. "d" }); step(0.001)
    eq(#objects, count)
  end
  step(1); eq(view:GetRoot().scripts.OnUpdate, nil)
end)
test("an outgoing identity can return mid-exit without frame recreation", function()
  local view, update, step = fixture()
  update({ "a", "b" }); step(1)
  local b = view:GetFrameForId("test.b")
  update({ "a", "c" }); step(0.04)
  local x, alpha = b.point[4], b.alpha
  update({ "a", "b" }); eq(view:GetFrameForId("test.b"), b)
  near(b.point[4], x); near(b.alpha, alpha); step(1); near(b.alpha, 1)
end)
test("empty, invalid and hidden states cancel animations immediately", function()
  local view, update, step = fixture()
  update({ "a" }); update({}); eq(view:GetRoot().visible, false); eq(view:GetRoot().scripts.OnUpdate, nil)
  update({ "b" }); eq(view:SetRecommendations({ false }), false)
  eq(view:GetFrameForId("test.b"), nil); eq(view:GetRoot().scripts.OnUpdate, nil)
  update({ "c" }); view:GetRoot():Hide(); eq(view:GetRoot().scripts.OnUpdate, nil)
  step(1); eq(view:GetFrameForId("test.c"), nil)
end)
test("consume is a short local accent only on the confirmed current spell", function()
  local view, _, step, objects = fixture()
  view:SetRecommendations({ rec("a", 101), rec("b", 102) }); step(1)
  eq(view:ConfirmCast(102), false); eq(view:ConfirmCast(999), false)
  eq(view:ConfirmCast(101), true); step(0.05)
  local frame = view:GetFrameForId("test.a")
  near(frame.width, 192); near(frame.alpha, 0.75)
  local flashes = 0
  for _, item in ipairs(objects) do
    if item.kind == "Texture" and item.layer == "ARTWORK" and item.alpha > 0 then flashes = flashes + 1 end
  end
  eq(flashes, 1); step(0.05); near(frame.width, 200); near(frame.alpha, 1)
  eq(view:GetRoot().scripts.OnUpdate, nil)
end)
test("spell success never consumes an item with the same numeric ID", function()
  local view, _, step = fixture()
  local item = rec("a", 101); item.action.kind = "trinket"
  view:SetRecommendations({ item }); step(1); eq(view:ConfirmCast(101), false)
end)

test("consume then promote overlaps movement and completes within 360ms", function()
  local view, update, step = fixture()
  update({ "a", "b", "c", "d" }); step(1)
  local a, b = view:GetFrameForId("test.a"), view:GetFrameForId("test.b")
  view:ConfirmCast(101); update({ "b", "c", "e", "f" })
  step(0.02); near(b.point[5], -134); assert(a.alpha < 1)
  step(0.06); assert(b.point[5] > -134)
  step(0.28); eq(a.visible, false); eq(view:GetRoot().scripts.OnUpdate, nil)
  near(b.width, 200)
end)

test("controller routes only public success events and supports session motion preferences", function()
  local createFrame = factory()
  local env = { issecretvalue = function(value) return type(value) == "table" end,
    DEFAULT_CHAT_FRAME = { AddMessage = function() end } }
  local compat = ns.CompatFactory.Create(env)
  local source = { GetRecommendations = function() return { rec("a", 101) } end,
    Subscribe = function() return function() end end }
  local controller = ns.QueueControllerFactory.Create(source, compat.Media, createFrame, compat.Console)
  controller:Start()
  local root = controller:GetView():GetRoot()
  root.scripts.OnUpdate(root, 1)
  root.scripts.OnEvent(root, "UNIT_SPELLCAST_SUCCEEDED", "target", nil, 101)
  eq(root.scripts.OnUpdate, nil)
  root.scripts.OnEvent(root, "UNIT_SPELLCAST_SUCCEEDED", "player", nil, {})
  eq(root.scripts.OnUpdate, nil)
  root.scripts.OnEvent(root, "UNIT_SPELLCAST_SUCCEEDED", "player", nil, 101)
  assert(root.scripts.OnUpdate)
  eq(controller:HandleMotion("motion off"), true); eq(root.scripts.OnUpdate, nil)
  root.scripts.OnEvent(root, "UNIT_SPELLCAST_SUCCEEDED", "player", nil, 101)
  eq(root.scripts.OnUpdate, nil)
  eq(controller:HandleMotion("motion invalid"), false)
  controller:Stop(); root.scripts.OnEvent(root, "UNIT_SPELLCAST_SUCCEEDED", "player", nil, 101)
  eq(root.scripts.OnUpdate, nil)
end)
test("reduced motion removes travel and flashes while preserving promotion identity", function()
  local view, update, step = fixture("REDUCED")
  update({ "a", "b", "c" }); local b = view:GetFrameForId("test.b")
  near(b.point[4], 0); near(b.width, 80); step(1)
  update({ "b", "c", "a" }); near(view:GetFrameForId("test.c").point[4], 0)
  step(0.025); near(b.point[5], -134); near(b.alpha, 0.5)
  step(0.05); near(b.point[5], 0); near(b.alpha, 0.5); step(0.025)
  eq(view:GetFrameForId("test.b"), b); near(b.alpha, 1)
  view:ConfirmCast(101); step(0.05); near(b.width, 200); near(b.alpha, 0.75)
end)
test("off mode and mid-animation mode changes settle without residual accents", function()
  local view, update, step = fixture("OFF")
  update({ "a", "b" }); near(view:GetFrameForId("test.a").alpha, 1)
  eq(view:ConfirmCast(101), false); eq(view:GetRoot().scripts.OnUpdate, nil)
  eq(view:SetMotionMode("bad"), false); eq(view:SetMotionMode("NORMAL"), true)
  view:ConfirmCast(101); step(0.05); view:SetMotionMode("OFF")
  near(view:GetFrameForId("test.a").alpha, 1); eq(view:GetRoot().scripts.OnUpdate, nil)
end)
test("cast adapter checks secret payloads before comparisons and ignores other units", function()
  local secret = setmetatable({}, { __eq = function() error("secret compared") end })
  local media = ns.CompatFactory.Create({ issecretvalue = function(value) return rawequal(value, secret) end }).Media
  eq(media:ConfirmedPlayerSpell("player", 101), 101)
  eq(media:ConfirmedPlayerSpell("target", 101), nil)
  eq(media:ConfirmedPlayerSpell(secret, 101), nil)
  eq(media:ConfirmedPlayerSpell("player", secret), nil)
  eq(media:ConfirmedPlayerSpell("player", "101"), nil)
  eq(ns.CompatFactory.Create({}).Media:ConfirmedPlayerSpell("player", 101), nil)
end)
print(string.format("Animator: %d/%d passed", passed, total))
for _, failure in ipairs(failures) do print(failure) end
if total ~= passed then os.exit(1) end
