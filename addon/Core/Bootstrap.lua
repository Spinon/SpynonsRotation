local addonName, Spynon = ...

Spynon.initialized = false

local eventFrame = CreateFrame("Frame")

local function initialize()
  if Spynon.initialized then
    return
  end

  Spynon.initialized = true
  Spynon.ContextController:Start()
  Spynon.Recommendations:Start()
  Spynon.QueueController:Start()
  Spynon.InGameHarness:Start()
  for _, event in ipairs(Spynon.StateEngineFactory.Events) do
    eventFrame:RegisterEvent(event)
  end
end

eventFrame:RegisterEvent("ADDON_LOADED")
eventFrame:SetScript("OnEvent", function(_, event, loadedAddonName)
  if event == "ADDON_LOADED" and loadedAddonName == addonName then
    initialize()
  elseif Spynon.initialized then
    Spynon.StateEngine:HandleEvent(event, loadedAddonName)
  end
end)
