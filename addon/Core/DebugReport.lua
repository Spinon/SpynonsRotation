local _, Spynon = ...
local Debug = {}
local CODES = {}
for code in ("SELECTED CONDITION_FALSE STATE_UNAVAILABLE ACTION_NOT_READY SPEC_UNAVAILABLE EVALUATION_FAILED "
  .. "INVALID_LIMIT INVALID_BUNDLE INVALID_STATE CONTEXT_UNAVAILABLE INVALID_LIST ENTRYPOINT_MISSING "
  .. "INVALID_ACTIONS INVALID_RULE INVALID_CAPABILITY SIM_ONLY FALLBACK_REQUIRED ACTION_UNAVAILABLE "
  .. "ACTION_RESTRICTED DUPLICATE_ACTION INVALID_PROGRAM INVALID_INSTRUCTION INVALID_LITERAL STACK_UNDERFLOW "
  .. "TYPE_MISMATCH INVALID_OPERATOR INVALID_INSTRUCTION STACK_REMAINDER "
  .. "NOT_USABLE USABILITY_UNAVAILABLE COOLDOWN_ACTIVE COOLDOWN_UNAVAILABLE READY WAITING_GCD "
  .. "OK API_UNAVAILABLE CALL_FAILED INVALID_ARGUMENT INVALID_DATA NO_DATA NO_SELECTION SECRET_RESTRICTED")
  :gmatch("%S+") do CODES[code] = true end

function Debug.Capture(stateEngine, service, guard)
  -- Getters return internal snapshots, never live Blizzard objects. Still guard selected fields.
  local function field(object, key) return guard:ReadPublicField(object, key) end
  local function getter(object, name)
    local method = field(object, name)
    if type(method) ~= "function" then return nil end
    local ok, value = pcall(method, object)
    if ok and guard:IsPublic(value) and type(value) == "table" then return value end
  end
  local function identifier(value)
    if guard:IsPublic(value) and type(value) == "string" and #value <= 96
      and value:match("^[%w_.%-]+$") then return value end
  end
  local function number(value)
    if guard:IsPublic(value) and Spynon.Contracts.Validation.IsNonNegativeInteger(value) then return value end
  end
  local function code(value) return guard:IsPublic(value) and CODES[value] and value or "UNKNOWN" end
  local function bump(counts, value) counts[value] = (counts[value] or 0) + 1 end
  local state, selection = getter(stateEngine, "GetSnapshot"), getter(stateEngine, "GetSelection")
  local info, diagnostics = getter(service, "GetEvaluationInfo"), getter(service, "GetDiagnostics")
  local report = { schemaVersion = 1, combat = "UNAVAILABLE", rules = {}, readiness = {},
    readFailures = {}, failureExamples = {}, ruleExamples = {}, inspectedRules = 0, truncated = false,
    diagnosticsAvailable = diagnostics ~= nil, evaluationAvailable = info ~= nil }
  local capabilities = field(state, "capabilities")
  local combat = field(state, "inCombat")
  if field(capabilities, "inCombat") == "ADDON_AVAILABLE" and type(combat) == "boolean" then
    report.combat = combat and "YES" or "NO"
  end
  report.stateRevision = number(field(state, "revision"))
  report.evaluationRevision = number(field(info, "stateRevision"))
  report.specId = number(field(selection, "specId"))
  report.heroTreeId = number(field(field(selection, "heroTree"), "id"))
  report.entrypoint = identifier(field(info, "entrypoint"))
  report.actionCount = number(field(info, "actionCount"))
  report.actionExclusions = {}
  local exclusions = field(info, "actionExclusions")
  local gates = {MISSING_REQUIRED_TALENT = true, MISSING_ALTERNATIVE_TALENT = true,
    REPLACED_BY_TALENT = true, HERO_TREE_MISMATCH = true}
  for index = 1, 33 do
    local excluded = field(exclusions, index)
    if not excluded then break end
    if index > 32 then report.truncated = true; break end
    local gate = field(excluded, "gate")
    report.actionExclusions[#report.actionExclusions+1] = {
      action = identifier(field(excluded, "action")), gate = gates[gate] and gate or "UNKNOWN",
      talentSpellId = number(field(excluded, "talentSpellId")) }
  end
  local context = field(info, "context")
  local modes = {AUTO = true, SINGLE_TARGET = true, CLEAVE = true, AOE = true}
  local mode, resolved = field(context, "mode"), field(context, "resolvedMode")
  report.mode = modes[mode] and mode or nil; report.resolvedMode = modes[resolved] and resolved or nil
  if diagnostics then
    for index = 1, 10001 do
      local item = field(diagnostics, index)
      if item == nil then break end
      if index > 10000 then report.truncated = true; break end
      local reason, detail = code(field(item, "code")), field(item, "detail")
      bump(report.rules, reason); report.inspectedRules = report.inspectedRules + 1
      if detail then bump(report.readiness, code(detail)) end
      if reason ~= "SELECTED" and #report.ruleExamples < 6 then
        report.ruleExamples[#report.ruleExamples+1] = {
          rule = identifier(field(item, "rule")), code = reason, detail = detail and code(detail) or nil }
      end
    end
  end
  local reads = getter(stateEngine, "GetDiagnostics")
  if reads then
    local keys = {}
    for key in pairs(reads) do if identifier(key) then keys[#keys+1] = key end end
    table.sort(keys)
    for index, key in ipairs(keys) do
      if index > 4096 then report.truncated = true; break end
      local reason = code(field(field(reads, key), "code"))
      if reason ~= "OK" then
        bump(report.readFailures, reason)
        if #report.failureExamples < 32 then
          report.failureExamples[#report.failureExamples+1] = {signal = key, code = reason}
        else report.truncated = true end
      end
    end
  end
  return report
end
function Debug.Summary(counts)
  local keys, result = {}, {}
  for key in pairs(counts) do keys[#keys+1] = key end
  table.sort(keys)
  for _, key in ipairs(keys) do result[#result+1] = key .. "=" .. counts[key] end
  return #result > 0 and table.concat(result, "; ") or "nenhum"
end
function Debug.Write(report, console)
  console:Write("Debug: combate=" .. report.combat .. " | spec=" .. (report.specId or "?")
    .. " | hero=" .. (report.heroTreeId or "?") .. " | lista=" .. (report.entrypoint or "NÃO SELECIONADA")
    .. " | ações=" .. (report.actionCount or "?") .. " | contexto=" .. (report.mode or "?")
    .. "/" .. (report.resolvedMode or "?") .. " | rev=" .. (report.stateRevision or "?")
    .. "/" .. (report.evaluationRevision or "?"))
  console:Write("Regras: " .. Debug.Summary(report.rules))
  console:Write("Prontidão: " .. Debug.Summary(report.readiness))
  console:Write("Leituras indisponíveis: " .. Debug.Summary(report.readFailures))
  for index = 1, math.min(3, #report.actionExclusions) do
    local excluded = report.actionExclusions[index]
    console:Write("Ação excluída: " .. (excluded.action or "?") .. " -> " .. excluded.gate
      .. (excluded.talentSpellId and " (talento " .. excluded.talentSpellId .. ")" or ""))
  end
  for index = 1, math.min(3, #report.failureExamples) do
    local example = report.failureExamples[index]
    console:Write("Sinal: " .. example.signal .. " -> " .. example.code)
  end
end
Spynon.DebugReport = Debug
