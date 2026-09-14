local _, Spynon = ...
local Controller = {}
function Controller.Create(compat, createFrame, settings, harness, profiles)
  local controller, panel, active, started = {}, nil, false, false
  local function allowed()
    local combat = compat.State:ReadCombat()
    return combat.ok and combat.capability == "ADDON_AVAILABLE" and combat.value == false
  end
  function controller.Close(_)
    if not active then return end
    active = false
    if panel then panel:Hide() end
    harness:Hide()
  end
  function controller.Change(_, key, value)
    if not active or not allowed() then controller:Close(); return false end
    return settings:Set(key, value)
  end
  function controller.Open(_)
    if not allowed() then
      compat.Console:Write("Abra a configuração fora de combate, com estado observável.")
      return false
    end
    if active then return true end
    if not harness:Show(settings:Get().motion) then return false end
    panel = panel or Spynon.ConfigPanelFactory.Create(createFrame, compat.Media:GetRootParent(), settings,
      function(key, value) controller:Change(key, value) end, function() controller:Close() end, profiles,
      function() controller:Edit() end)
    active = true; panel:SetEditing(false); panel:Select(nil); panel:Show()
    return true
  end
  function controller.Edit(_)
    if not controller:Open() or not allowed() then return false end
    if not harness:Show() then controller:Close(); return false end
    panel:SetEditing(true); panel:SelectElement("queue")
    harness:GetPreview():SetEditMode(function(kind)
      if not active or not allowed() then controller:Close(); return end
      panel:SelectElement(kind)
    end)
    return true
  end
  function controller.Start(_)
    if started then return end
    started = true
    harness:OnClosed(function() controller:Close() end)
    harness:OnPresented(function() if active and panel then panel:SetEditing(false) end end)
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
  return controller
end
Spynon.ConfigControllerFactory = Controller
Spynon.ConfigController = Controller.Create(
  Spynon.Compat, CreateFrame, Spynon.Settings, Spynon.InGameHarness, Spynon.Profiles
)
