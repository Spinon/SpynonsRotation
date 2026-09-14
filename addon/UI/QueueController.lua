local _, Spynon = ...
local Controller = {}

function Controller.Create(service, media, createFrame, console, bindings, cooldowns, indicators, clock, settings)
  local controller = {}
  local view, unsubscribe
  local function render(recommendations)
    view:SetRecommendations(media:Present(recommendations))
    if bindings then view:SetHotkeys(bindings:ForRecommendations(recommendations)) end
    if cooldowns then view:RefreshOverlays(cooldowns) end
    if indicators then view:SetIndicators(indicators:ForRecommendations(recommendations), clock) end
  end
  function controller.HandleHotkeys(_, message)
    local argument = message:lower():match("^%s*keys%s*(.-)%s*$")
    if view and (argument == "compact" or argument == "full" or argument == "off") then
      if settings then settings:Set("keys", argument)
      else view:SetHotkeyStyle(argument ~= "off", argument ~= "full") end
      console:Write("Teclas: " .. argument .. " (somente nesta sessão)")
      return true
    end
    console:Write("Use /spynon keys compact | full | off")
    return false
  end
  function controller.HandleMotion(_, message)
    local argument = message:lower():match("^%s*motion%s*(.-)%s*$")
    local modes = { normal = "NORMAL", reduced = "REDUCED", off = "OFF" }
    if modes[argument] and view then
      if settings then settings:Set("motion", modes[argument]) else view:SetMotionMode(modes[argument]) end
      console:Write("Movimento: " .. argument .. " (somente nesta sessão)")
      return true
    end
    console:Write("Use /spynon motion normal | reduced | off")
    return false
  end
  function controller.HandleNumbers(_, message)
    local argument = message:lower():match("^%s*numbers%s*(.-)%s*$")
    if view and (argument == "on" or argument == "off") then
      if settings then settings:Set("numbers", argument == "on") else view:SetCooldownNumbers(argument == "on") end
      console:Write("Tempo numérico: " .. argument .. " (somente nesta sessão)")
      return true
    end
    console:Write("Use /spynon numbers on | off")
    return false
  end
  function controller.Start(_)
    if unsubscribe then return end
    if not view then
      view = Spynon.QueueFactory.Create(createFrame, media:GetRootParent(), nil, settings)
      view:GetRoot():RegisterEvent("UNIT_SPELLCAST_SUCCEEDED")
      view:GetRoot():RegisterEvent("ADDON_RESTRICTION_STATE_CHANGED")
      if bindings then
        for _, event in ipairs(Spynon.CompatInternal.Bindings.Events) do view:GetRoot():RegisterEvent(event) end
      end
      view:GetRoot():SetScript("OnEvent", function(_, event, unit, _, spellID)
        if not unsubscribe then return end
        if event == "UNIT_SPELLCAST_SUCCEEDED" then
          local confirmed = media:ConfirmedPlayerSpell(unit, spellID)
          if confirmed then view:ConfirmCast(confirmed) end
        elseif bindings then
          bindings:Invalidate(event == "ADDON_RESTRICTION_STATE_CHANGED")
          view:SetHotkeys(bindings:ForRecommendations(service:GetRecommendations()))
        end
        if event == "ADDON_RESTRICTION_STATE_CHANGED" then view:ClearOverlays() end
      end)
    end
    if console then
      console:RegisterRoute("motion", function(message) controller:HandleMotion(message) end)
      console:RegisterRoute("keys", function(message) controller:HandleHotkeys(message) end)
      console:RegisterRoute("numbers", function(message) controller:HandleNumbers(message) end)
    end
    if bindings then bindings:Invalidate(false) end
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
  Spynon.Recommendations, Spynon.Compat.Media, CreateFrame, Spynon.Compat.Console,
  Spynon.Compat.Bindings, Spynon.Compat.Cooldowns, Spynon.Indicators, Spynon.Compat.State, Spynon.Settings
)
