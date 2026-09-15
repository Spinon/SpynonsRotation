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
local SECRET = setmetatable({}, {__tostring = function() error("SECRET_STRINGIFIED") end})
local guard = ns.CompatFactory.Create({issecretvalue = function(value) return rawequal(value, SECRET) end}).State
local function fixture()
  local data = {state = {revision = 8, inCombat = true, capabilities = {inCombat = "ADDON_AVAILABLE"}},
    selection = {specId = 263, heroTree = {id = 54}, name = "PRIVATE", activeSpellRanks = {SECRET}},
    info = {stateRevision = 8, entrypoint = "single_totemic", actionCount = 12,
      context = {mode = "AUTO", resolvedMode = "SINGLE_TARGET"}},
    diagnostics = {{rule = "fixture.a", code = "STATE_UNAVAILABLE"},
      {rule = "fixture.b", code = "ACTION_NOT_READY", detail = "COOLDOWN_UNAVAILABLE"}},
    reads = { ["auras.fixture"] = {code = "SECRET_RESTRICTED", value = SECRET},
      ["cooldowns.fixture"] = {code = "API_UNAVAILABLE"}, specId = {code = "OK"}}}
  local source = {GetSnapshot = function() return data.state end, GetSelection = function() return data.selection end,
    GetDiagnostics = function() return data.reads end}
  local service = {GetEvaluationInfo = function() return data.info end, GetDiagnostics = function() return data.diagnostics end}
  return data, source, service
end
test("captures current combat Totemic list and reason counts without changing sources", function()
  local data, source, service = fixture()
  local report = ns.DebugReport.Capture(source, service, guard)
  eq(report.combat, "YES"); eq(report.heroTreeId, 54); eq(report.entrypoint, "single_totemic")
  eq(report.actionCount, 12); eq(report.specId, 263); eq(report.stateRevision, 8); eq(report.evaluationRevision, 8)
  eq(report.rules.STATE_UNAVAILABLE, 1); eq(report.readiness.COOLDOWN_UNAVAILABLE, 1)
  eq(report.readFailures.SECRET_RESTRICTED, 1); eq(report.readFailures.API_UNAVAILABLE, 1)
  eq(#report.failureExamples, 2); eq(report.failureExamples[1].signal, "auras.fixture")
  eq(report.activeSpellRanks, nil); eq(report.name, nil); eq(report.failureExamples[1].value, nil)
  report.ruleExamples[1].rule = "changed"; eq(data.diagnostics[1].rule, "fixture.a")
end)
test("absent getters and failed getters do not expose exception strings or imply success", function()
  local report = ns.DebugReport.Capture({}, {GetDiagnostics = function() error("PRIVATE") end}, guard)
  eq(report.combat, "UNAVAILABLE"); eq(report.entrypoint, nil); eq(report.diagnosticsAvailable, false)
  eq(report.evaluationAvailable, false); eq(#report.failureExamples, 0)
end)
test("protected containers scalars and denied fields never reach formatting or persistence", function()
  local data, source, service = fixture()
  data.state.inCombat = SECRET; data.selection.heroTree.id = SECRET; data.info.entrypoint = SECRET
  data.diagnostics[1].rule = SECRET; data.diagnostics[1].code = SECRET
  data.reads["auras.fixture"].code = "PRIVATE"
  data.info.context = setmetatable({}, {__index = function() error("PRIVATE") end})
  local report = ns.DebugReport.Capture(source, service, guard)
  eq(report.combat, "UNAVAILABLE"); eq(report.heroTreeId, nil); eq(report.entrypoint, nil)
  eq(report.ruleExamples[1].rule, nil); eq(report.rules.UNKNOWN, 1); eq(report.readFailures.UNKNOWN, 1)
  local lines = {}; ns.DebugReport.Write(report, {Write = function(_, line) lines[#lines+1] = line end})
  for _, line in ipairs(lines) do assert(not line:find("PRIVATE",1,true)) end
  data.reads = SECRET; data.selection = SECRET
  report = ns.DebugReport.Capture(source, service, guard); eq(#report.failureExamples, 0); eq(report.specId, nil)
end)
test("unavailable combat is not misrepresented as out of combat and pending selection stays explicit", function()
  local data, source, service = fixture()
  data.state.inCombat = false; data.state.capabilities.inCombat = "CONDITIONALLY_SECRET"
  data.info.entrypoint = nil; data.selection = nil
  local report = ns.DebugReport.Capture(source, service, guard)
  eq(report.combat, "UNAVAILABLE"); eq(report.entrypoint, nil); eq(report.heroTreeId, nil)
  data.state.capabilities.inCombat = "ADDON_AVAILABLE"
  eq(ns.DebugReport.Capture(source, service, guard).combat, "NO")
end)
test("optional action exclusions use bounded metadata and closed gate labels", function()
  local data, source, service = fixture()
  data.info.actionExclusions = {{action="fixture.totem", gate="MISSING_REQUIRED_TALENT", talentSpellId=455630},
    {action=SECRET, gate="PRIVATE", talentSpellId=SECRET}}
  local report = ns.DebugReport.Capture(source, service, guard)
  eq(report.actionExclusions[1].talentSpellId, 455630)
  eq(report.actionExclusions[2].gate, "UNKNOWN"); eq(report.actionExclusions[2].action, nil)
  eq(report.actionExclusions[2].talentSpellId, nil)
  report.actionExclusions[1].gate = "mutated"; eq(data.info.actionExclusions[1].gate, "MISSING_REQUIRED_TALENT")
end)

test("large diagnostics are capped and summaries are deterministic", function()
  local data, source, service = fixture()
  data.diagnostics = {}; for i = 1, 10001 do data.diagnostics[i] = {rule = "fixture."..i, code = "CONDITION_FALSE"} end
  for i = 1, 50 do data.reads["cooldowns.fixture"..i] = {code = "SECRET_RESTRICTED"} end
  local report = ns.DebugReport.Capture(source, service, guard)
  eq(report.inspectedRules, 10000); eq(#report.ruleExamples, 6); eq(#report.failureExamples, 32)
  eq(report.truncated, true)
  eq(ns.DebugReport.Summary({STATE_UNAVAILABLE = 2, CONDITION_FALSE = 3}), "CONDITION_FALSE=3; STATE_UNAVAILABLE=2")
  local lines = {}; ns.DebugReport.Write(report, {Write = function(_, line) lines[#lines+1] = line end})
  eq(#lines, 7)
end)
print(string.format("Debug report: %d/%d passed", passed, total))
for _, failure in ipairs(failures) do print(failure) end
if passed ~= total then os.exit(1) end
