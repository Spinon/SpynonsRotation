-- Test-only addon; never packaged or installed in Retail.
SpynonHeadlessProbeResult = "PENDING"
local frame = CreateFrame("Frame")
frame:RegisterEvent("PLAYER_ENTERING_WORLD")
frame:SetScript("OnEvent", function()
  frame:SetScript("OnUpdate", function()
    frame:SetScript("OnUpdate", nil)
    assert(SpynonRotationSkins and SpynonRotationSkins.apiVersion == 1, "skin API not loaded")
    assert(type(SlashCmdList.SPYNONROTATION) == "function", "bootstrap slash route missing")
    SlashCmdList.SPYNONROTATION("test")
    local report = SpynonRotationDB and SpynonRotationDB.lastSmokeReport
    assert(report and report.schemaVersion == 1, "smoke report missing")
    assert(report.stateValid and report.recommendationsValid and report.uiCreated, "invalid bootstrap state")
    assert(report.visualInspection == "PENDING" and report.taintInspection == "PENDING", "invalid Retail claim")
    for _, command in ipairs({"test show", "test hide", "config", "config close", "demo off", "demo stop"}) do
      SlashCmdList.SPYNONROTATION(command)
    end
    SpynonHeadlessProbeResult = "PASS:BOOTSTRAP_SMOKE:HEADLESS_ONLY"
  end)
end)
