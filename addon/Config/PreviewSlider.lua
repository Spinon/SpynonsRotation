local _, Spynon = ...
local Slider = {}
function Slider.Create(createFrame, parent, settings, history)
  local slider = createFrame("Slider", nil, parent)
  slider:SetPoint("TOPLEFT", parent, "TOPLEFT", 28, -238); slider:SetSize(450, 24)
  slider:SetOrientation("HORIZONTAL"); slider:SetMinMaxValues(1, 3)
  slider:SetValueStep(1); slider:SetObeyStepOnDrag(true)
  slider:EnableMouse(true); slider:EnableKeyboard(false)
  local track = slider:CreateTexture(nil, "BACKGROUND")
  track:SetPoint("LEFT", slider, "LEFT", 0, 0); track:SetPoint("RIGHT", slider, "RIGHT", 0, 0)
  track:SetHeight(4); track:SetColorTexture(0.1, 0.3, 0.4, 1)
  local thumb = slider:CreateTexture(nil, "ARTWORK")
  thumb:SetSize(18, 24); thumb:SetColorTexture(0.7, 0.94, 1, 1); slider:SetThumbTexture(thumb)
  local caption = parent:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
  caption:SetPoint("TOPLEFT", parent, "TOPLEFT", 20, -211)
  caption:SetText("Arraste para comparar; solte para salvar.")
  local values, syncing = {0.85, 1, 1.15}, false
  local function refresh()
    local selected = settings:Get().mainScale
    syncing = true
    for index, value in ipairs(values) do if selected == value then slider:SetValue(index); break end end
    syncing = false
  end
  slider:SetScript("OnMouseDown", function(_, button)
    if button == "LeftButton" then history:Begin("mainScale") end
  end)
  slider:SetScript("OnValueChanged", function(_, value)
    if syncing then return end
    if not Spynon.Contracts.Validation.IsFiniteNumber(value) or value < 1 or value > 3 then refresh(); return end
    if not history:Begin("mainScale") or not history:Preview("mainScale", values[math.floor(value+0.5)]) then
      refresh()
    end
  end)
  slider:SetScript("OnMouseUp", function(_, button)
    if button == "LeftButton" and history:GetStatus().mode == "drag" then history:Commit(); refresh() end
  end)
  slider:SetScript("OnHide", function() history:Cancel() end)
  history:Subscribe(function()
    local mode = history:GetStatus().mode
    caption:SetText(mode == "explore" and "Compare tamanhos; depois escolha Manter mudanças."
      or (mode == "reset" and "Restauração em prévia; confirme ou cancele abaixo."
        or "Arraste para comparar; solte para salvar."))
  end)
  settings:Subscribe(refresh); refresh()
  return slider
end
Spynon.PreviewSliderFactory = Slider
