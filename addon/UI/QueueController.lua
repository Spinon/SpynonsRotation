local _, Spynon = ...
local Controller = {}

function Controller.Create(service, media, createFrame)
  local controller = {}
  local view, unsubscribe
  local function render(recommendations)
    view:SetRecommendations(media:Present(recommendations))
  end
  function controller.Start(_)
    if unsubscribe then return end
    view = view or Spynon.QueueFactory.Create(createFrame, media:GetRootParent())
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
Spynon.QueueController = Controller.Create(Spynon.Recommendations, Spynon.Compat.Media, CreateFrame)
