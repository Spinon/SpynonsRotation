local addonName, Spynon = ...

Spynon.initialized = false

local eventFrame = CreateFrame("Frame")

local function initialize()
  if Spynon.initialized then
    return
  end

  Spynon.initialized = true
end

eventFrame:RegisterEvent("ADDON_LOADED")
eventFrame:SetScript("OnEvent", function(_, event, loadedAddonName)
  if event == "ADDON_LOADED" and loadedAddonName == addonName then
    initialize()
  end
end)
