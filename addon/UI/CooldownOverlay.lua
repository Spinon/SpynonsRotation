local _, Spynon = ...
local Overlay = {}
function Overlay.Create(createFrame, frame, icon)
  local view = {}
  local cooldown = createFrame("Cooldown", nil, frame, "CooldownFrameTemplate")
  cooldown:SetAllPoints(icon)
  cooldown:SetDrawSwipe(true)
  cooldown:SetDrawEdge(false)
  cooldown:SetDrawBling(false)
  cooldown:SetReverse(false)
  cooldown:SetSwipeColor(0.25, 0.27, 0.3, 0.8)
  cooldown:SetHideCountdownNumbers(false)
  cooldown:SetFrameLevel(frame:GetFrameLevel() + 1)
  local labels = createFrame("Frame", nil, frame)
  labels:SetAllPoints(frame)
  labels:SetFrameLevel(frame:GetFrameLevel() + 2)
  labels:EnableMouse(false)
  local count = labels:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
  local font = count:GetFont()
  if font then count:SetFont(font, 12, "OUTLINE") end
  count:SetPoint("BOTTOMRIGHT", icon, "BOTTOMRIGHT", -2, 2)
  count:SetTextColor(0.94, 0.97, 1, 1)
  count:Hide()
  local track = frame:CreateTexture(nil, "BACKGROUND")
  track:SetColorTexture(0.027, 0.075, 0.114, 0.86)
  local fill = frame:CreateTexture(nil, "ARTWORK")
  fill:SetColorTexture(0.847, 0.882, 0.91, 1)
  track:Hide(); fill:Hide()
  local progress, width, height = nil, 0, 0
  function view.Layout(_, w, h, current)
    width, height = w, h
    track:ClearAllPoints(); track:SetPoint("TOPLEFT", frame, "TOPLEFT", w * 0.172, -h * 0.892)
    track:SetSize(w * 0.657, h * 0.024)
    fill:ClearAllPoints(); fill:SetPoint("TOPLEFT", track, "TOPLEFT", 0, 0)
    if current then track:Show() else track:Hide() end
    view:SetProgress(current and progress or nil)
  end
  function view.SetProgress(_, value)
    progress = value
    if value and value > 0 then fill:SetSize(width * 0.657 * value, height * 0.024); fill:Show()
    else fill:Hide() end
  end
  function view.Refresh(_, adapter, action)
    local value = adapter:Apply(cooldown, action)
    if value then count:SetText(tostring(value.value)); count:Show() else count:SetText(""); count:Hide() end
  end
  function view.Clear(_)
    cooldown:Clear(); count:SetText(""); count:Hide(); track:Hide(); view:SetProgress(nil)
  end
  function view.SetNumbers(_, enabled) cooldown:SetHideCountdownNumbers(not enabled) end
  function view.GetLabelParent(_) return labels end
  return view
end
Spynon.CooldownOverlayFactory = Overlay
