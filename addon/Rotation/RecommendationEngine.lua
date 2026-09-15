local _, Spynon = ...
local Contracts = Spynon.Contracts
local V = Contracts.Validation
local AVAILABLE = Contracts.Capability.ADDON_AVAILABLE
local Engine = {}
local function copy(value)
  if type(value) ~= "table" then return value end
  local result = {}
  for key, child in pairs(value) do result[key] = copy(child) end
  return result
end

function Engine.Evaluate(bundle, actions, state, context, guard, limit)
  local output = { recommendations = {}, diagnostics = {} }
  local function reject(code)
    output.diagnostics[#output.diagnostics + 1] = { code = code }
    return output
  end
  limit = limit or 4
  if not V.IsPositiveInteger(limit) or limit > 12 then return reject("INVALID_LIMIT") end
  if type(bundle) ~= "table" or bundle.schemaVersion ~= 1 or not Spynon.RotationProgram.IsList(bundle.lists, 64)
    or not V.IsNonEmptyString(bundle.entrypoint)
  then return reject("INVALID_BUNDLE") end
  if not Contracts.PlayerState.Validate(state) then return reject("INVALID_STATE") end
  if context and (not Contracts.CombatContext.Validate(context) or context.capability ~= AVAILABLE) then
    return reject("CONTEXT_UNAVAILABLE")
  end
  local selected, listIds = nil, {}
  for _, list in ipairs(bundle.lists) do
    if type(list) ~= "table" or not V.IsNonEmptyString(list.id) or listIds[list.id]
      or not Spynon.RotationProgram.IsList(list.rules, 10000) then return reject("INVALID_LIST") end
    listIds[list.id] = true
    if list.id == bundle.entrypoint then selected = list end
  end
  if not selected then return reject("ENTRYPOINT_MISSING") end
  if not Spynon.RotationProgram.IsList(actions, 10000) then return reject("INVALID_ACTIONS") end
  local actionById = {}
  for _, action in ipairs(actions) do
    if not Contracts.Action.Validate(action) or actionById[action.id] then return reject("INVALID_ACTIONS") end
    actionById[action.id] = action
  end
  local ordered, ruleIds = {}, {}
  for _, rule in ipairs(selected.rules) do
    if type(rule) ~= "table" or not V.IsNonEmptyString(rule.id) or ruleIds[rule.id]
      or not V.IsNonEmptyString(rule.action) or not V.IsPositiveInteger(rule.priority)
    then return reject("INVALID_RULE") end
    ruleIds[rule.id] = true
    ordered[#ordered + 1] = rule
  end
  table.sort(ordered, function(a, b)
    if a.priority ~= b.priority then return a.priority < b.priority end
    return a.id < b.id
  end)
  local reader, seen = Spynon.StateReader.Create(state, guard), {}
  for _, rule in ipairs(ordered) do
    local action = actionById[rule.action]
    local code
    if not Contracts.Capability.IsValid(rule.capability) then code = "INVALID_CAPABILITY"
    elseif rule.capability == "SIM_ONLY" then code = "SIM_ONLY"
    elseif rule.capability == "CONDITIONALLY_SECRET" and rule.onUnavailable ~= "skip_rule" then
      code = "FALLBACK_REQUIRED"
    elseif not action then code = "ACTION_UNAVAILABLE"
    elseif action.capability ~= AVAILABLE then code = "ACTION_RESTRICTED"
    elseif seen[action.id] then code = "DUPLICATE_ACTION"
    else
      local matched, reason = Spynon.RotationProgram.Evaluate(rule.program, reader)
      if matched ~= true then code = matched == false and "CONDITION_FALSE" or reason
      elseif not reader:IsReady(action) then code = "ACTION_NOT_READY"
      else
        local recommendation = Contracts.Recommendation.Create({
          id = action.id, action = copy(action), priority = #output.recommendations + 1,
          reason = { code = rule.id, capability = AVAILABLE }, context = copy(context),
        })
        output.recommendations[#output.recommendations + 1] = recommendation
        seen[action.id] = true
        code = "SELECTED"
      end
    end
    output.diagnostics[#output.diagnostics + 1] = { rule = rule.id, code = code }
    if #output.recommendations >= limit then break end
  end
  return output
end

function Engine.Create(stateEngine, registry, guard)
  local service = {}
  local output = { recommendations = {}, diagnostics = {} }
  local context = Contracts.CombatContext.Create({ mode = "AUTO", resolvedMode = "SINGLE_TARGET" })
  local listeners, nextListener = {}, 0
  local unsubscribe, publishing

  local function update(state)
    if publishing then return end
    publishing = true
    output = { recommendations = {}, diagnostics = { { code = "SPEC_UNAVAILABLE" } } }
    local selection = stateEngine:GetSelection()
    local module = state.specId and registry:GetBySpecId(state.specId)
    if module and selection and selection.specId == state.specId and state.capabilities.specId == AVAILABLE then
      local ok, result = pcall(function()
        local actions = module.getActions(copy(selection))
        local bundle = module.getRules(copy(selection), copy(state), copy(context))
        return Engine.Evaluate(bundle, actions, state, context, guard, 6)
      end)
      if ok then output = result
      else output = { recommendations = {}, diagnostics = { { code = "EVALUATION_FAILED" } } } end
    end
    for id = 1, nextListener do
      if listeners[id] then pcall(listeners[id], copy(output.recommendations), copy(output.diagnostics)) end
    end
    publishing = false
  end

  function service.Start(_)
    if unsubscribe then return end
    unsubscribe = stateEngine:Subscribe(update)
    update(stateEngine:GetSnapshot())
  end
  function service.Stop(_)
    if unsubscribe then unsubscribe(); unsubscribe = nil end
    output = { recommendations = {}, diagnostics = {} }
  end
  function service.GetRecommendations(_) return copy(output.recommendations) end
  function service.GetDiagnostics(_) return copy(output.diagnostics) end
  function service.Subscribe(_, listener)
    assert(type(listener) == "function", "listener must be a function")
    nextListener = nextListener + 1
    local id = nextListener
    listeners[id] = listener
    return function() listeners[id] = nil end
  end
  function service.SetContext(_, value)
    if publishing or not Contracts.CombatContext.Validate(value) or value.capability ~= AVAILABLE then return false end
    local resolved = Contracts.CombatContext.Resolve(value)
    if not resolved then return false end
    context = copy(value)
    update(stateEngine:GetSnapshot())
    return true
  end
  return service
end

Spynon.RecommendationEngine = Engine
Spynon.Recommendations = Engine.Create(Spynon.StateEngine, Spynon.Specs, Spynon.Compat.State)
