local _, Spynon = ...
local Controller = {}
function Controller.Create(compat, createFrame, settings, harness, profiles)
  local controller, panel, active, started = {}, nil, false, false
  local history, moving
  local function stopMoving()
    if not moving then return end
    local view = moving; moving = nil
    view:GetRoot():StopMovingOrSizing(); view:GetRoot():SetUserPlaced(false)
    view:ApplySettings(settings:Get())
  end
  local function allowed()
    local combat = compat.State:ReadCombat()
    return combat.ok and combat.capability == "ADDON_AVAILABLE" and combat.value == false
  end
  function controller.Close(_)
    if not active then return end
    active = false
    if history then history:Cancel() end
    if panel then panel:Hide() end
    harness:Hide()
  end
  function controller.Change(_, key, value)
    if not active or not allowed() then controller:Close(); return false end
    return history:Execute(key, value)
  end
  function controller.Open(_)
    if not allowed() then
      compat.Console:Write("Abra a configuração fora de combate, com estado observável.")
      return false
    end
    if active then return true end
    if not harness:Show(settings:Get().motion) then return false end
    history = history or Spynon.HistoryBinding.Create(settings, profiles, function() return active and allowed() end)
    if not panel then history:Subscribe(function()
      if not history:GetStatus().active then stopMoving() end
    end) end
    panel = panel or Spynon.ConfigPanelFactory.Create(createFrame, compat.Media:GetRootParent(), settings,
      function(key, value) controller:Change(key, value) end, function() controller:Close() end, profiles,
      function() controller:Edit() end, history)
    active = true; panel:SetEditing(false); panel:Select(nil); panel:Show()
    return true
  end
  function controller.Edit(_)
    if not controller:Open() or not allowed() then return false end
    if not harness:Show() then controller:Close(); return false end
    panel:SetEditing(true); panel:SelectElement("queue")
    local view = harness:GetPreview()
    local mover = {}
    function mover.Start()
      if not active or not allowed() then controller:Close(); return false end
      panel:SelectElement("position")
      if not history:Begin("Mover conjunto") then return false end
      moving = view
      view:GetRoot():SetMovable(true); view:GetRoot():SetClampedToScreen(true)
      view:GetRoot():StartMoving()
      return true
    end
    function mover.Stop()
      if not moving then return end
      if not active or not allowed() then controller:Close(); return end
      view:GetRoot():StopMovingOrSizing()
      local x, y = compat.Media:ReadHUDPosition(view:GetRoot())
      if x and y and history:Preview("positionX", x)
        and history:Preview("positionY", y-view:GetOriginY()) then history:Commit()
      else history:Cancel() end
      stopMoving()
    end
    function mover.Cancel() if history then history:Cancel() end; stopMoving() end
    view:SetEditMode(function(kind)
      if not active or not allowed() then controller:Close(); return end
      panel:SelectElement(kind)
    end, mover)
    return true
  end
  function controller.Start(_)
    if started then return end
    started = true
    harness:OnClosed(function() controller:Close() end)
    harness:OnPresented(function()
      if active and panel then history:Cancel(); panel:SetEditing(false) end
    end)
    compat.Console:RegisterRoute("config", function(message)
      local argument = message:lower():match("^%s*config%s*(.-)%s*$")
      if argument == "close" then controller:Close()
      elseif argument == "" then controller:Open()
      else compat.Console:Write("Use /spynon config ou /spynon config close") end
    end)
    compat.Console:RegisterRoute("edit", function(message)
      local argument = message:lower():match("^%s*edit%s*(.-)%s*$")
      if argument == "" then controller:Edit()
      elseif argument == "close" then controller:Close()
      else compat.Console:Write("Use /spynon edit ou /spynon edit close") end
    end)
    local events = createFrame("Frame")
    for _, event in ipairs({ "PLAYER_REGEN_DISABLED", "PLAYER_ENTERING_WORLD", "ADDON_RESTRICTION_STATE_CHANGED" }) do
      events:RegisterEvent(event)
    end
    events:SetScript("OnEvent", function() controller:Close() end)
  end
  function controller.IsOpen(_) return active end
  function controller.GetPanel(_) return panel end
  function controller.GetHistory(_) return history end
  return controller
end
Spynon.ConfigControllerFactory = Controller
Spynon.ConfigController = Controller.Create(
  Spynon.Compat, CreateFrame, Spynon.Settings, Spynon.InGameHarness, Spynon.Profiles
)
