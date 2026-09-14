local _, Spynon = ...
local Harness = {}
local AVAILABLE = Spynon.Contracts.Capability.ADDON_AVAILABLE

function Harness.Create(compat, stateEngine, recommendations, queueController, registry, createFrame)
  local harness = {}
  local preview, previewLabel, active, started = nil, nil, false, false
  local demo
  local onClosed

  function harness.Run(_)
    local build = compat.Build:GetInfo()
    local buildMatches = build.ok and compat.Build:IsDevelopmentSupported(build.value)
    local buildStatus = not build.ok and "READ_FAILED" or (buildMatches and "SUPPORTED_SMOKE" or "UNREVIEWED")
    local state = stateEngine:GetSnapshot()
    local queue = recommendations:GetRecommendations()
    local counts = { available = 0, unavailable = 0 }
    for _, capability in pairs(state.capabilities) do
      if capability == AVAILABLE then counts.available = counts.available + 1
      else counts.unavailable = counts.unavailable + 1 end
    end
    local validQueue = true
    for _, recommendation in ipairs(queue) do
      if not Spynon.Contracts.Recommendation.IsRuntimeSafe(recommendation) then validQueue = false end
    end
    local report = {
      schemaVersion = 1, origin = "slash_command", addonVersion = Spynon.version,
      build = build.ok and build.value or nil,
      expectedBuild = "12.1.0.69587", expectedInterface = 120100,
      buildMatches = buildMatches,
      buildStatus = buildStatus, buildReadCode = build.code, buildInvalidField = build.invalidField,
      compatibilityScope = "DEVELOPMENT_SMOKE_ONLY",
      stateRevision = state.revision, stateValid = Spynon.Contracts.PlayerState.Validate(state),
      specId = state.specId, observedSignals = counts, recommendationCount = #queue,
      recommendationsValid = validQueue, uiCreated = queueController:GetView() ~= nil,
      visualInspection = "PENDING", taintInspection = "PENDING", combatInspection = "PENDING",
    }
    compat.Console:SaveReport(report)
    compat.Console:Write("Teste executado; relatório salvo para o próximo logout ou /reload.")
    local buildLabel
    if not build.ok then
      buildLabel = "leitura indisponível (" .. build.code
        .. (build.invalidField and ": " .. build.invalidField or "") .. ")"
    else
      buildLabel = build.value.version .. "." .. build.value.number .. " / interface " .. build.value.interface
        .. (buildMatches and " - aceita para smoke" or " - NÃO HOMOLOGADA para smoke")
    end
    compat.Console:Write("Build: " .. buildLabel
      .. " | estado: " .. (report.stateValid and "válido" or "INVÁLIDO")
      .. " | sinais públicos: " .. counts.available .. " | recomendações: " .. #queue)
    compat.Console:Write("Visual, taint e combate ainda exigem inspeção. /spynon test show para a fila visual.")
    return report
  end

  function harness.Hide(_)
    if demo then demo:Stop() end
    if preview then preview:Hide() end
    if active then queueController:Start() end
    active = false
    if onClosed then onClosed() end
  end

  function harness.Show(_, demoMode)
    local combat = compat.State:ReadCombat()
    if not combat.ok or combat.capability ~= AVAILABLE or combat.value ~= false then
      compat.Console:Write("Teste visual permitido somente fora de combate e com estado observável.")
      return false
    end
    preview = preview or Spynon.QueueFactory.Create(createFrame, compat.Media:GetRootParent(), "OFF")
    if not previewLabel then
      previewLabel = preview:GetRoot():CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
      previewLabel:SetPoint("BOTTOM", preview:GetRoot(), "TOP", 0, 10)
      previewLabel:SetTextColor(1, 0.75, 0.25, 1)
      previewLabel:SetText("TESTE VISUAL - DADOS SIMULADOS")
    end
    local selection, candidates = stateEngine:GetSelection(), {}
    if selection then
      local module = registry:GetBySpecId(selection.specId)
      if module then candidates = module.getActions(selection) end
    end
    if demoMode then
      demo = demo or Spynon.DemoModeFactory.Create(compat, createFrame, preview, previewLabel,
        function() harness:Hide() end)
      queueController:Stop()
      active = true
      if not demo:Start(candidates, demoMode) then
        harness:Hide()
        compat.Console:Write("Demo indisponível: combate ou relógio não observável.")
        return false
      end
      compat.Console:Write("Demo animada de 16 segundos; NÃO representa uma rotação. /spynon demo stop para sair.")
      return true
    end
    if demo then demo:Stop() end
    preview:SetMotionMode("OFF")
    previewLabel:SetText("TESTE VISUAL - DADOS SIMULADOS")
    local fixtures = {}
    for index = 1, 4 do
      local source = candidates[index]
      local action = source and Spynon.Contracts.Action.Create(source) or {
        id = "test.action_" .. index, kind = "spell", label = "Teste " .. index, capability = AVAILABLE,
      }
      fixtures[index] = Spynon.Contracts.Recommendation.Create({
        id = "test.slot_" .. index, action = action, priority = index,
        reason = { code = "VISUAL_FIXTURE_NOT_A_ROTATION", capability = AVAILABLE },
      })
    end
    queueController:Stop()
    active = true
    preview:SetRecommendations(compat.Media:Present(fixtures))
    compat.Bindings:Invalidate(false)
    preview:SetHotkeys(compat.Bindings:ForRecommendations(fixtures))
    compat.Console:Write("Fila simulada visível; NÃO representa uma rotação. /spynon test hide restaura a fila real.")
    return true
  end

  function harness.Handle(_, text)
    local command = text:lower():match("^%s*(.-)%s*$")
    if command == "test" then return harness:Run()
    elseif command == "test show" then return harness:Show()
    elseif command == "test hide" then return harness:Hide() end
    compat.Console:Write("Comandos: /spynon config | /spynon demo | /spynon test"
      .. " | /spynon test show | /spynon test hide")
  end

  function harness.HandleDemo(_, text)
    local argument = text:lower():match("^%s*demo%s*(.-)%s*$")
    if argument == "stop" then harness:Hide(); return true end
    local modes = { [""] = "NORMAL", play = "NORMAL", restart = "NORMAL",
      normal = "NORMAL", reduced = "REDUCED", off = "OFF" }
    if modes[argument] then return harness:Show(modes[argument]) end
    compat.Console:Write("Use /spynon demo [restart | normal | reduced | off | stop]")
    return false
  end

  function harness.Start(_)
    if started then return end
    started = true
    compat.Console:Register(function(text) harness:Handle(text) end)
    compat.Console:RegisterRoute("demo", function(text) harness:HandleDemo(text) end)
    local frame = createFrame("Frame")
    frame:RegisterEvent("PLAYER_REGEN_DISABLED")
    frame:RegisterEvent("ADDON_RESTRICTION_STATE_CHANGED")
    frame:RegisterEvent("PLAYER_ENTERING_WORLD")
    frame:SetScript("OnEvent", function() harness:Hide() end)
  end
  function harness.IsPreviewActive(_) return active end
  function harness.OnClosed(_, callback) onClosed = callback end
  function harness.IsDemoActive(_) return demo and demo:IsActive() or false end
  return harness
end

Spynon.InGameHarnessFactory = Harness
Spynon.InGameHarness = Harness.Create(
  Spynon.Compat, Spynon.StateEngine, Spynon.Recommendations, Spynon.QueueController, Spynon.Specs, CreateFrame
)
