local _, Spynon = ...
local Demo = {}
function Demo.Create(compat, createFrame, view, label, onUnavailable)
  local demo, timer = {}, createFrame("Frame")
  local active, elapsed, base, phase = false, 0, 0, nil
  local timeline, state
  local adapter = {}
  function adapter.Apply(_, widget, action)
    local overlay = state.overlays[action.id]
    if overlay and overlay.duration then compat.Cooldowns:ApplyDemo(widget, base + overlay.start, overlay.duration)
    else widget:Clear() end
    return overlay and overlay.count and { kind = "demo", value = overlay.count } or nil
  end
  function adapter.ReadGCD(_)
    if state.gcd == nil then return nil end
    return { start = base + state.gcd, duration = 1.5, finish = base + state.gcd + 1.5 }
  end
  function adapter.GCDProgress(_, timing) return compat.Cooldowns:GCDProgress(timing) end
  local function render()
    if timeline:PhaseAt(elapsed) == phase then return end
    state = timeline:At(elapsed)
    phase = state.phase
    view:SetRecommendations(compat.Media:Present(state.recommendations))
    view:SetHotkeys(compat.Bindings:ForRecommendations(state.recommendations))
    view:RefreshOverlays(adapter)
    if state.consume then view:PreviewConsume(state.consume) end
    label:SetText("DEMO - DADOS SIMULADOS\n" .. state.label)
  end
  function demo.Stop(_)
    active, phase = false, nil
    timer:SetScript("OnUpdate", nil)
    view:Hide()
  end
  function demo.Start(_, candidates, mode)
    local combat, clock = compat.State:ReadCombat(), compat.State:ReadClock()
    if not combat.ok or combat.value ~= false or not clock.ok then return false end
    demo:Stop()
    timeline = Spynon.DemoTimeline.Create(candidates)
    elapsed, base, active = 0, clock.value, true
    view:SetMotionMode(mode or "NORMAL")
    compat.Bindings:Invalidate(false)
    render()
    timer:SetScript("OnUpdate", function(_, delta)
      if not active or not Spynon.Contracts.Validation.IsFiniteNumber(delta) or delta < 0 then return end
      elapsed = elapsed + delta
      if elapsed >= Spynon.DemoTimeline.Duration then
        local now = compat.State:ReadClock()
        if not now.ok then
          demo:Stop()
          if onUnavailable then onUnavailable() end
          return
        end
        elapsed = elapsed % Spynon.DemoTimeline.Duration
        base, phase = now.value - elapsed, nil
        view:Hide()
      end
      render()
    end)
    return true
  end
  function demo.IsActive(_) return active end
  return demo
end
Spynon.DemoModeFactory = Demo
