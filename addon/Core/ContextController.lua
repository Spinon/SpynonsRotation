local _, Spynon = ...
local Controller = {}
local MODES = { auto = "AUTO", st = "SINGLE_TARGET", cleave = "CLEAVE", aoe = "AOE" }

function Controller.Create(detector, stateEngine, recommendations, console)
  local controller = {}
  local unsubscribe, last, diagnostic
  local function update()
    local context, detail = detector:Capture()
    diagnostic = detail
    if not last or last.mode ~= context.mode or last.resolvedMode ~= context.resolvedMode
      or last.isOverride ~= context.isOverride then
      recommendations:SetContext(context)
      last = context
    end
  end
  function controller.SetMode(_, mode)
    if not detector:SetMode(mode) then return false end
    update()
    return true
  end
  function controller.GetStatus(_)
    update()
    return {
      mode = last.mode, resolvedMode = last.resolvedMode, isOverride = last.isOverride,
      source = diagnostic.source, count = diagnostic.count,
    }
  end
  function controller.HandleCommand(_, message)
    local argument = message:lower():match("^%s*context%s*(.-)%s*$")
    if argument ~= "" and argument ~= "status" then
      if not MODES[argument] or not controller:SetMode(MODES[argument]) then
        console:Write("Use /spynon context auto | st | cleave | aoe | status")
        return false
      end
    end
    local status = controller:GetStatus()
    local suffix = status.source == "SAFE_FALLBACK" and " (fallback seguro; quantidade de alvos indisponível)"
      or (status.isOverride and " (override manual)" or " (sinal observado)")
    console:Write("Contexto: " .. status.mode .. " -> " .. status.resolvedMode .. suffix)
    return true
  end
  function controller.Start(_)
    if unsubscribe then return end
    console:RegisterRoute("context", function(message) controller:HandleCommand(message) end)
    unsubscribe = stateEngine:Subscribe(update)
    update()
  end
  function controller.Stop(_)
    if unsubscribe then unsubscribe(); unsubscribe = nil end
  end
  return controller
end
Spynon.ContextControllerFactory = Controller
Spynon.ContextController = Controller.Create(
  Spynon.ContextDetector, Spynon.StateEngine, Spynon.Recommendations, Spynon.Compat.Console
)
