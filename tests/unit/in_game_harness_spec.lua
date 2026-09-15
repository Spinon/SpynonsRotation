local passed, total, failures = 0, 0, {}
local function eq(a, b) assert(a == b, "expected " .. tostring(b) .. ", got " .. tostring(a)) end
local function test(name, fn)
  total = total + 1
  local ok, err = pcall(fn)
  if ok then passed = passed + 1 else failures[#failures + 1] = name .. ": " .. tostring(err) end
  print((ok and "[PASS] " or "[FAIL] ") .. name)
end
local frameFactory = assert(loadfile("tests/fixtures/specs/frame_environment.lua"))()
CreateFrame = frameFactory()
local ns = {}
for line in io.lines("addon/SpynonRotation.toc") do
  local file = line:match("^([^#].*%.lua)%s*$")
  if file then assert(loadfile("addon/" .. file))("SpynonRotation", ns) end
end
local function fixture()
  local messages, data = {}, { combat = false, build = "69587" }
  local env = {
    issecretvalue = function(value) return value == data.secret end,
    GetBuildInfo = function() return "12.1.0", data.build, "test date", 120100, "12.1.0", "Release" end,
    UnitAffectingCombat = function() return data.combat end,
    DEFAULT_CHAT_FRAME = { AddMessage = function(_, message) messages[#messages + 1] = message end },
    SpynonRotationDB = { preserved = true }, UIParent = {},
  }
  local state = ns.Contracts.PlayerState.Create({ revision = 1, capturedAt = 10, inCombat = false,
    capabilities = { capturedAt = "ADDON_AVAILABLE", test = "CONDITIONALLY_SECRET" } })
  local source = { GetSnapshot = function() return state end, GetSelection = function() return nil end }
  local service = { GetRecommendations = function() return {} end }
  local controller = { starts = 0, stops = 0, GetView = function() return {} end }
  function controller:Start() self.starts = self.starts + 1 end
  function controller:Stop() self.stops = self.stops + 1 end
  local createFrame, objects = frameFactory()
  local harness = ns.InGameHarnessFactory.Create(ns.CompatFactory.Create(env), source, service,
    controller, ns.Specs, createFrame)
  return harness, env, data, controller, objects, messages
end
test("report records automated checks without claiming visual or combat validation", function()
  local harness, env = fixture()
  local report = harness:Run()
  eq(report.buildMatches, true)
  eq(report.buildStatus, "SUPPORTED_SMOKE")
  eq(report.buildReadCode, "OK")
  eq(report.stateValid, true)
  eq(report.recommendationCount, 0)
  eq(report.observedSignals.available, 1)
  eq(report.observedSignals.unavailable, 1)
  eq(report.visualInspection, "PENDING")
  eq(report.taintInspection, "PENDING")
  eq(report.combatInspection, "PENDING")
  eq(env.SpynonRotationDB.preserved, true)
  eq(env.SpynonRotationDB.lastSmokeReport, report)
end)
test("debug route saves bounded metadata and does not enable a preview or change the live queue", function()
  local harness, env, _, controller, _, messages = fixture()
  harness:Start(); env.SlashCmdList.SPYNONROTATION("debug")
  local debug = env.SpynonRotationDB.lastSmokeReport.debug
  eq(debug.schemaVersion, 1); eq(debug.diagnosticsAvailable, false); eq(debug.combat, "UNAVAILABLE")
  eq(controller.starts, 0); eq(controller.stops, 0); eq(harness:IsPreviewActive(), false)
  assert(messages[4]:find("Debug:", 1, true))
  env.SlashCmdList.SPYNONROTATION("debug nonsense")
  eq(env.SpynonRotationDB.lastSmokeReport.debug, debug)
end)

test("client build drift is explicit in the report", function()
  local harness, _, data, _, _, messages = fixture()
  data.build = "99999"
  local report = harness:Run()
  eq(report.buildMatches, false)
  eq(report.buildStatus, "UNREVIEWED")
  eq(report.build.number, "99999")
  assert(messages[2]:find("12.1.0.99999 / interface 120100", 1, true))
  assert(messages[2]:find("NÃO HOMOLOGADA", 1, true))
end)

test("missing auxiliary metadata does not produce a false build warning", function()
  local harness, env, _, _, _, messages = fixture()
  env.GetBuildInfo = function() return "12.1.0", "69814", "", 120100 end
  local report = harness:Run()
  eq(report.buildMatches, true)
  eq(report.buildStatus, "SUPPORTED_SMOKE")
  assert(messages[2]:find("12.1.0.69814 / interface 120100 - aceita para smoke", 1, true))
end)

test("build read failures cannot be mistaken for a known mismatching build", function()
  local harness, env, _, _, _, messages = fixture()
  env.GetBuildInfo = nil
  local report = harness:Run()
  eq(report.buildStatus, "READ_FAILED")
  eq(report.buildReadCode, "API_UNAVAILABLE")
  eq(report.build, nil)
  eq(report.buildMatches, false)
  assert(messages[2]:find("leitura indisponível (API_UNAVAILABLE)", 1, true))
  env.GetBuildInfo = function() return "12.1.0", "69814" end
  report = harness:Run()
  eq(report.buildReadCode, "INVALID_DATA")
  eq(report.buildInvalidField, "interface")
  env.GetBuildInfo = function() error("private details") end
  report = harness:Run()
  eq(report.buildReadCode, "CALL_FAILED")
  eq(report.buildInvalidField, nil)
  for _, message in ipairs(messages) do assert(not message:find("private details", 1, true)) end
end)
test("reviewed development builds are allowed without claiming Retail approval", function()
  local harness, env, data = fixture()
  data.build = "69814"
  local report = harness:Run()
  eq(report.buildMatches, true)
  eq(report.compatibilityScope, "DEVELOPMENT_SMOKE_ONLY")
  eq(report.combatInspection, "PENDING")
  env.GetBuildInfo = function() return "12.1.0", "69814", "date", 120101, "12.1.0", "Release" end
  eq(harness:Run().buildMatches, false)
end)
test("preview is explicit, has four slots and restores the live controller", function()
  local harness, _, _, controller, objects = fixture()
  eq(harness:Show(), true)
  eq(harness:IsPreviewActive(), true)
  eq(controller.stops, 1)
  local shownFrames, labeled = 0, false
  for _, object in ipairs(objects) do
    if object.kind == "Frame" and object.visible and
      (object.width == 256 or object.width == 200 or object.width == 80) then shownFrames = shownFrames + 1 end
    if object.text == "TESTE VISUAL - DADOS SIMULADOS" then labeled = true end
  end
  eq(shownFrames, 5)
  eq(labeled, true)
  harness:Hide()
  eq(harness:IsPreviewActive(), false)
  eq(controller.starts, 1)
end)
test("combat and secret combat state both prevent simulated recommendations", function()
  local harness, _, data, controller = fixture()
  data.combat = true
  eq(harness:Show(), false)
  data.secret = {}
  data.combat = data.secret
  eq(harness:Show(), false)
  eq(controller.stops, 0)
end)
test("restriction and combat events automatically exit the visual preview", function()
  local harness, _, _, controller, objects = fixture()
  harness:Start()
  harness:Show()
  local frame = objects[1]
  eq(frame.events.PLAYER_REGEN_DISABLED, true)
  eq(frame.events.ADDON_RESTRICTION_STATE_CHANGED, true)
  frame.scripts.OnEvent(frame, "PLAYER_REGEN_DISABLED")
  eq(harness:IsPreviewActive(), false)
  eq(controller.starts, 1)
end)
test("slash command registration is idempotent and rejects secret input", function()
  local harness, env, data, _, objects = fixture()
  harness:Start()
  local count = #objects
  harness:Start()
  eq(#objects, count)
  eq(env.SLASH_SPYNONROTATION1, "/spynon")
  env.SlashCmdList.SPYNONROTATION(" TEST ")
  eq(env.SpynonRotationDB.lastSmokeReport.stateRevision, 1)
  data.secret = {}
  env.SlashCmdList.SPYNONROTATION(data.secret)
  eq(harness:IsPreviewActive(), false)
end)
print(string.format("In-game harness fixtures: %d/%d passed", passed, total))
for _, failure in ipairs(failures) do print(failure) end
if total ~= passed then os.exit(1) end
