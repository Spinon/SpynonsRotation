local _, Spynon = ...
local Controller = {}

function Controller.Create(service, media, createFrame, console)
  local controller = {}
  local view, unsubscribe
  local function render(recommendations)
    view:SetRecommendations(media:Present(recommendations))
  end
  function controller.HandleMotion(_, message)
    local argument = message:lower():match("^%s*motion%s*(.-)%s*$")
    local modes = { normal = "NORMAL", reduced = "REDUCED", off = "OFF" }
    if modes[argument] and view then
      view:SetMotionMode(modes[argument])
      console:Write("Movimento: " .. argument .. " (somente nesta sessão)")
      return true
    end
    console:Write("Use /spynon motion normal | reduced | off")
    return false
  end
  function controller.Start(_)
    if unsubscribe then return end
    if not view then
      view = Spynon.QueueFactory.Create(createFrame, media:GetRootParent())
      view:GetRoot():RegisterEvent("UNIT_SPELLCAST_SUCCEEDED")
      view:GetRoot():SetScript("OnEvent", function(_, _, unit, _, spellID)
        if not unsubscribe then return end
        local confirmed = media:ConfirmedPlayerSpell(unit, spellID)
        if confirmed then view:ConfirmCast(confirmed) end
      end)
    end
    if console then console:RegisterRoute("motion", function(message) controller:HandleMotion(message) end) end
    unsubscribe = service:Subscribe(render)
    render(service:GetRecommendations())
  end
  function controller.Stop(_)
    if unsubscribe then unsubscribe(); unsubscribe = nil end
    if view then view:Hide() end
  end
  function controller.GetView(_) return view end
  return controller
end

Spynon.QueueControllerFactory = Controller
Spynon.QueueController = Controller.Create(
  Spynon.Recommendations, Spynon.Compat.Media, CreateFrame, Spynon.Compat.Console
)
