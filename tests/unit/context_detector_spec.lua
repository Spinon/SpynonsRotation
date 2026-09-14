local total, passed, failures = 0, 0, {}
local function eq(a, b) assert(a == b, "expected " .. tostring(b) .. ", got " .. tostring(a)) end
local function test(name, fn)
  total = total + 1
  local ok, err = pcall(fn)
  if ok then passed = passed + 1 else failures[#failures + 1] = name .. ": " .. tostring(err) end
  print((ok and "[PASS] " or "[FAIL] ") .. name)
end
function CreateFrame() return { RegisterEvent = function() end, SetScript = function() end } end
local ns = {}
for line in io.lines("addon/SpynonRotation.toc") do
  local file = line:match("^([^#].*%.lua)%s*$")
  if file then assert(loadfile("addon/" .. file))("SpynonRotation", ns) end
end
local SECRET = {}
local guard = { IsPublic = function(_, value) return not rawequal(value, SECRET) end }
local function fixture()
  local signal = { ok = true, capability = "ADDON_AVAILABLE", value = 1 }
  local adapter = { calls = 0 }
  function adapter:ReadEnemyCount() self.calls = self.calls + 1; return signal end
  return ns.ContextDetectorFactory.Create(adapter, guard), signal, adapter
end
test("public enemy counts map deterministically at every threshold", function()
  local detector, signal = fixture()
  for _, case in ipairs({ { 0, "SINGLE_TARGET" }, { 1, "SINGLE_TARGET" }, { 2, "CLEAVE" },
    { 3, "CLEAVE" }, { 4, "AOE" }, { 40, "AOE" } }) do
    signal.value = case[1]
    local context, diagnostics = detector:Capture()
    eq(context.mode, "AUTO")
    eq(context.resolvedMode, case[2])
    eq(context.isOverride, false)
    eq(context.capability, "ADDON_AVAILABLE")
    eq(diagnostics.count, case[1])
  end
end)
test("restricted, SIM_ONLY and malformed counts degrade without inventing one target", function()
  local detector, signal = fixture()
  for _, capability in ipairs({ "CONDITIONALLY_SECRET", "SIM_ONLY", "UNKNOWN" }) do
    signal.capability, signal.value = capability, 8
    local context, detail = detector:Capture()
    eq(context.resolvedMode, "SINGLE_TARGET")
    eq(detail.count, nil)
    eq(detail.source, "SAFE_FALLBACK")
  end
  signal.capability = "ADDON_AVAILABLE"
  for _, value in ipairs({ -1, 1.5, 41, "8", SECRET, 0 / 0 }) do
    signal.value = value
    eq(select(2, detector:Capture()).source, "SAFE_FALLBACK")
  end
end)
test("manual overrides never read unavailable automatic inputs", function()
  local detector, _, adapter = fixture()
  for _, mode in ipairs({ "SINGLE_TARGET", "CLEAVE", "AOE" }) do
    eq(detector:SetMode(mode), true)
    local context, detail = detector:Capture()
    eq(context.mode, mode)
    eq(context.resolvedMode, mode)
    eq(context.isOverride, true)
    eq(detail.source, "MANUAL_OVERRIDE")
  end
  eq(adapter.calls, 0)
end)
test("invalid modes and thresholds preserve the previous configuration", function()
  local detector, signal = fixture()
  eq(detector:SetMode("AOE"), true)
  eq(detector:SetMode("bad"), false)
  eq(detector:SetMode(SECRET), false)
  eq(detector:Capture().resolvedMode, "AOE")
  eq(detector:SetMode("AUTO"), true)
  eq(detector:SetThresholds(3, 5), true)
  eq(detector:SetThresholds(5, 3), false)
  eq(detector:SetThresholds(SECRET, 4), false)
  signal.value = 2
  eq(detector:Capture().resolvedMode, "SINGLE_TARGET")
  signal.value = 4
  eq(detector:Capture().resolvedMode, "CLEAVE")
end)
test("default Retail adapter is explicitly unavailable until a count source is validated", function()
  local detector = ns.ContextDetectorFactory.Create(ns.Compat.Context, guard)
  local context, detail = detector:Capture()
  eq(context.resolvedMode, "SINGLE_TARGET")
  eq(context.isOverride, false)
  eq(detail.count, nil)
  eq(detail.source, "SAFE_FALLBACK")
end)
test("controller only republishes actual mode changes and exposes isolated status", function()
  local detector, signal = fixture()
  local callback, applied, writes = nil, {}, {}
  local console = { RegisterRoute = function() end, Write = function(_, text) writes[#writes + 1] = text end }
  local controller = ns.ContextControllerFactory.Create(detector, {
    Subscribe = function(_, fn) callback = fn; return function() callback = nil end end,
  }, { SetContext = function(_, context) applied[#applied + 1] = context; return true end }, console)
  controller:Start()
  callback()
  eq(#applied, 1)
  signal.value = 4
  callback()
  eq(#applied, 2)
  eq(applied[2].resolvedMode, "AOE")
  eq(controller:HandleCommand("context st"), true)
  eq(applied[3].resolvedMode, "SINGLE_TARGET")
  local status = controller:GetStatus()
  status.resolvedMode = "mutated"
  eq(controller:GetStatus().resolvedMode, "SINGLE_TARGET")
  eq(controller:HandleCommand("context nonsense"), false)
  controller:Stop()
  eq(callback, nil)
end)
test("context slash route coexists with test commands", function()
  local env = { issecretvalue = function() return false end }
  local console = ns.CompatFactory.Create(env).Console
  local fallback, routed
  console:RegisterRoute("context", function(message) routed = message end)
  console:Register(function(message) fallback = message end)
  env.SlashCmdList.SPYNONROTATION("context aoe")
  eq(routed, "context aoe")
  env.SlashCmdList.SPYNONROTATION("test")
  eq(fallback, "test")
end)
print(string.format("Context detector: %d/%d passed", passed, total))
for _, failure in ipairs(failures) do print(failure) end
if total ~= passed then os.exit(1) end
