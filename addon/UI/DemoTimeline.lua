local _, Spynon = ...
local C = Spynon.Contracts
local Timeline = { Duration = 16 }
local PHASES = {
  { at = 0, order = { 1, 2, 3, 4 }, context = "SINGLE_TARGET",
    label = "ST - cooldown e 2 cargas", count = { 1, 2 }, gcd = 0 },
  { at = 2, order = { 2, 1, 3, 4 }, context = "SINGLE_TARGET",
    label = "ST - proc: promoção e 5 stacks", count = { 2, 5 } },
  { at = 4, order = { 2, 3, 5, 1 }, context = "CLEAVE", label = "CLEAVE - entrada e saída", count = { 2, 3 } },
  { at = 6, order = { 2, 3, 5, 1 }, context = "CLEAVE", label = "CLEAVE - consumo simulado", consume = 2 },
  { at = 6.07, order = { 3, 5, 2, 1 }, context = "CLEAVE", label = "CLEAVE - próxima prioridade", gcd = 6.07 },
  { at = 8, order = { 5, 3, 4, 2 }, context = "AOE", label = "AOE - 10 stacks", count = { 5, 10 } },
  { at = 10, order = { 5, 4, 3, 2 }, context = "AOE", label = "AOE - contagem removida", gcd = 10 },
  { at = 12, order = { 1, 4, 3, 2 }, context = "SINGLE_TARGET", label = "ST - cooldown", gcd = 12 },
  { at = 14, order = { 1, 2, 3, 4 }, context = "SINGLE_TARGET", label = "ST - retorno à fila inicial" },
}
function Timeline.Create(candidates)
  local timeline, actions = {}, {}
  for index = 1, 7 do
    local source = candidates[index]
    local action = source and C.Action.Create(source)
    if not action or action.capability ~= "ADDON_AVAILABLE" then
      action = { kind = "spell", label = "Demonstração " .. index, capability = "ADDON_AVAILABLE" }
    end
    action.id = "demo.action_" .. index
    actions[index] = action
  end
  function timeline.PhaseAt(_, elapsed)
    if not C.Validation.IsFiniteNumber(elapsed) or elapsed < 0 then return nil end
    local time, index = elapsed % Timeline.Duration, 1
    for candidate, phase in ipairs(PHASES) do if phase.at <= time then index = candidate end end
    return index
  end
  function timeline.At(_, elapsed)
    local index = timeline:PhaseAt(elapsed)
    if not index then return nil end
    local time = elapsed % Timeline.Duration
    local phase, recommendations, overlays = PHASES[index], {}, {}
    local order = {}
    for _, actionIndex in ipairs(phase.order) do order[#order+1] = actionIndex end
    order[5], order[6] = 6, 7 -- Extra simulated tail exercises the six-slot preference.
    for priority, actionIndex in ipairs(order) do
      local action = C.Action.Create(actions[actionIndex])
      recommendations[priority] = C.Recommendation.Create({
        id = action.id, action = action, priority = priority,
        reason = { code = "DEMO_ONLY_PHASE_" .. index, capability = "ADDON_AVAILABLE" },
        context = C.CombatContext.Create({ mode = phase.context }),
      })
      overlays[action.id] = {}
    end
    if phase.count then overlays[actions[phase.count[1]].id].count = phase.count[2] end
    for _, cooldown in ipairs({ { 1, 0, 4 }, { 3, 4, 6 }, { 1, 12, 3 } }) do
      if time >= cooldown[2] and time < cooldown[2] + cooldown[3] then
        local overlay = overlays[actions[cooldown[1]].id]
        if overlay then overlay.start, overlay.duration = cooldown[2], cooldown[3] end
      end
    end
    local indicators = {
      { id = "demo.aura_a", label = "Proc", kind = "buff", spellId = actions[1].gameId or 1,
        state = "STABLE", expiresAt = time < 8 and 5 or 15, stacks = time < 8 and 5 or 10, attentionSeconds = 3 },
      { id = "demo.aura_b", label = "Manutenção", kind = "debuff", spellId = actions[2].gameId or 2,
        state = "STABLE", expiresAt = time < 8 and 10 or 15, attentionSeconds = 3,
        refreshRecommended = (time >= 2 and time < 4) or time >= 12 },
      { id = "demo.aura_c", label = "Sinal", kind = "buff", spellId = actions[3].gameId or 3,
        state = "UNAVAILABLE" },
    }
    if time < 2 then indicators[2].state, indicators[2].expiresAt = "ABSENT", nil end
    if time >= 4 and time < 8 then indicators[3].state = "STABLE" end
    if time >= 12 then indicators[1].state, indicators[1].expiresAt, indicators[1].stacks = "ABSENT", nil, nil end
    return { phase = index, time = time, label = phase.label, recommendations = recommendations, overlays = overlays,
      gcd = phase.gcd, consume = phase.consume and actions[phase.consume].id or nil, indicators = indicators }
  end
  return timeline
end
Spynon.DemoTimeline = Timeline
