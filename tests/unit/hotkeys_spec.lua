local passed, total, failures = 0, 0, {}
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
local function rec(id, kind)
  return ns.Contracts.Recommendation.Create({ id = "test.a",
    action = { id = "test.a", kind = kind or "spell", label = "Fixture", gameId = id, icon = 123,
      capability = "ADDON_AVAILABLE" }, priority = 1, reason = { code = "TEST", capability = "ADDON_AVAILABLE" } })
end
local function fixture()
  local data = { slot = 1, id = 101, kind = "spell", visible = true, key = "SHIFT-3", reads = 0 }
  local secret = setmetatable({}, { __eq = function() error("secret comparison") end })
  local env = { issecretvalue = function(value) return rawequal(value, secret) end }
  env.ActionButton1 = { action = 1, bindingAction = "ACTIONBUTTON1", IsVisible = function() return data.visible end }
  env.GetActionInfo = function(slot) data.reads = data.reads + 1; data.slot = slot; return data.kind, data.id end
  env.GetBindingKey = function(command)
    if command == "ACTIONBUTTON1" then return data.key, data.second end
    return data.click
  end
  env.GetBindingAction = function(key)
    if key == data.click then return "CLICK ActionButton1:LeftButton" end
    return data.override or "ACTIONBUTTON1"
  end
  env.C_Spell = { GetBaseSpell = function(id) return id == 202 and 101 or id end }
  return ns.CompatFactory.Create(env).Bindings, env, data, secret
end
test("native visible action resolves the actual binding and compact form", function()
  local bindings = fixture()
  local keys = bindings:ForRecommendations({ rec(101) })
  eq(keys["test.a"], "SHIFT-3"); eq(ns.Hotkeys.Format(keys["test.a"], true), "S3")
end)
test("compact formatting covers modifiers, mouse, wheel, numpad and punctuation", function()
  for key, text in pairs({ ["CTRL-Q"] = "CQ", ["ALT-E"] = "AE", BUTTON4 = "M4",
    ["CTRL-SHIFT-BUTTON5"] = "CSM5", MOUSEWHEELUP = "WU", NUMPAD1 = "N1", ["SHIFT-;"] = "S;" }) do
    eq(ns.Hotkeys.Format(key, true), text); eq(ns.Hotkeys.Format(key, false), key)
  end
  eq(ns.Hotkeys.Format("|Tbad:1|t", true), nil)
  eq(ns.Hotkeys.Format("CTRL-\nQ", true), nil)
end)
test("snapshot caches scans until an invalidation and follows actual page slots", function()
  local bindings, env, data = fixture()
  bindings:ForRecommendations({ rec(101) }); local reads = data.reads
  bindings:ForRecommendations({ rec(101) }); eq(data.reads, reads)
  env.ActionButton1.action, data.id = 13, 303
  bindings:Invalidate(false)
  eq(bindings:ForRecommendations({ rec(101) })["test.a"], nil); eq(data.slot, 13)
  eq(bindings:ForRecommendations({ rec(303) })["test.a"], "SHIFT-3")
end)
test("changed bindings replace cached labels after invalidation", function()
  local bindings, _, data = fixture()
  eq(bindings:ForRecommendations({ rec(101) })["test.a"], "SHIFT-3")
  data.key = "ALT-E"; bindings:Invalidate(false)
  eq(bindings:ForRecommendations({ rec(101) })["test.a"], "ALT-E")
end)
test("effective overrides reject obsolete keys and click bindings are supported", function()
  local bindings, _, data = fixture()
  data.override = "OTHER_ACTION"
  eq(bindings:ForRecommendations({ rec(101) })["test.a"], nil)
  data.click = "BUTTON4"; bindings:Invalidate(false)
  eq(bindings:ForRecommendations({ rec(101) })["test.a"], "BUTTON4")
end)
test("secondary binding survives missing or secret first key", function()
  local bindings, _, data, secret = fixture()
  data.key, data.second = secret, "CTRL-Q"
  eq(bindings:ForRecommendations({ rec(101) })["test.a"], "CTRL-Q")
  data.key = nil; bindings:Invalidate(false)
  eq(bindings:ForRecommendations({ rec(101) })["test.a"], "CTRL-Q")
end)
test("base spell aliases resolve while missing metadata only allows exact matches", function()
  local bindings, env = fixture()
  eq(bindings:ForRecommendations({ rec(202) })["test.a"], "SHIFT-3")
  env.C_Spell = {}; bindings:Invalidate(false)
  eq(bindings:ForRecommendations({ rec(202) })["test.a"], nil)
  eq(bindings:ForRecommendations({ rec(101) })["test.a"], "SHIFT-3")
end)
test("items and spells with the same number remain separate; macros are omitted", function()
  local bindings, _, data = fixture()
  eq(bindings:ForRecommendations({ rec(101, "trinket") })["test.a"], nil)
  data.kind = "item"; bindings:Invalidate(false)
  eq(bindings:ForRecommendations({ rec(101, "trinket") })["test.a"], "SHIFT-3")
  eq(bindings:ForRecommendations({ rec(101) })["test.a"], nil)
  data.kind = "macro"; bindings:Invalidate(false)
  eq(bindings:ForRecommendations({ rec(101) })["test.a"], nil)
end)
test("secret action identities, slots and visibility are not inspected", function()
  local bindings, env, data, secret = fixture()
  data.id = secret; eq(bindings:ForRecommendations({ rec(101) })["test.a"], nil)
  data.id, data.kind = 101, secret; bindings:Invalidate(false)
  eq(bindings:ForRecommendations({ rec(101) })["test.a"], nil)
  data.kind, data.visible = "spell", secret; bindings:Invalidate(false)
  eq(bindings:ForRecommendations({ rec(101) })["test.a"], nil)
  data.visible, env.ActionButton1.action = true, secret; bindings:Invalidate(false)
  eq(bindings:ForRecommendations({ rec(101) })["test.a"], nil)
end)
test("restrictions clear the cache without reading APIs before the state transition", function()
  local bindings, _, data = fixture()
  bindings:ForRecommendations({ rec(101) }); local reads = data.reads
  bindings:Invalidate(true); eq(bindings:ForRecommendations({ rec(101) })["test.a"], nil)
  eq(data.reads, reads)
  bindings:Invalidate(false); eq(bindings:ForRecommendations({ rec(101) })["test.a"], "SHIFT-3")
end)
test("missing APIs, hidden native bars and errors omit rather than invent a key", function()
  eq(ns.CompatFactory.Create({}).Bindings:ForRecommendations({ rec(101) })["test.a"], nil)
  local bindings, env, data = fixture()
  data.visible = false; eq(bindings:ForRecommendations({ rec(101) })["test.a"], nil)
  data.visible = true; env.GetActionInfo = function() error("unavailable") end; bindings:Invalidate(false)
  eq(bindings:ForRecommendations({ rec(101) })["test.a"], nil)
end)
test("overlay is top-right, outlined, follows identity and hides absent or oversized labels", function()
  local createFrame, objects = factory()
  local view = ns.QueueFactory.Create(createFrame, {}, "OFF")
  view:SetRecommendations({ rec(101) }); view:SetHotkeys({ ["test.a"] = "SHIFT-3" })
  local text
  for _, object in ipairs(objects) do
    if object.kind == "FontString" and object.text == "S3" then text = object end
  end
  assert(text); eq(text.fontFlags, "OUTLINE"); eq(text.point[1], "TOPRIGHT"); eq(text.visible, true)
  view:SetHotkeyStyle(true, false); eq(text.text, "SHIFT-3")
  view:SetHotkeys({ ["test.a"] = string.rep("W", 64) }); eq(text.visible, false)
  view:SetHotkeys({}); eq(text.text, ""); eq(text.visible, false)
  view:SetHotkeys({ ["test.a"] = "CTRL-Q" }); view:SetHotkeyStyle(false, true); eq(text.visible, false)
end)
print(string.format("Hotkeys: %d/%d passed", passed, total))
for _, failure in ipairs(failures) do print(failure) end
if total ~= passed then os.exit(1) end
