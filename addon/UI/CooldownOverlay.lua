local _, Spynon = ...
local Overlay = {}
function Overlay.Create(createFrame, frame, icon, skin)
  local tokens = (skin or Spynon.Skin):GetTokens()
  local colors = tokens.colors
  local view = {}
  local cooldown = createFrame("Cooldown", nil, frame, "CooldownFrameTemplate")
  cooldown:SetAllPoints(icon)
  cooldown:SetDrawSwipe(true)
  cooldown:SetDrawEdge(false)
  cooldown:SetDrawBling(false)
  cooldown:SetReverse(false)
  cooldown:SetSwipeColor(unpack(colors.swipe))
  cooldown:SetHideCountdownNumbers(false)
  cooldown:SetFrameLevel(frame:GetFrameLevel() + 1)
  local labels = createFrame("Frame", nil, frame)
  labels:SetAllPoints(frame)
  labels:SetFrameLevel(frame:GetFrameLevel() + 2)
  labels:EnableMouse(false)
  local count = labels:CreateFontString(nil, "OVERLAY", tokens.typography.fontObject)
  local font = count:GetFont()
  if font then count:SetFont(font, 12, "OUTLINE") end
  local countType = Spynon.Typography.Bind(count, font)
  local countdownFont, countdownName = Spynon.Compat.Fonts:NewCountdown()
  if countdownFont then countdownFont:SetTextColor(unpack(colors.text)) end
  local countdownType = countdownFont and Spynon.Typography.Bind(countdownFont, font)
  count:SetPoint("BOTTOMRIGHT", icon, "BOTTOMRIGHT", -2, 2)
  count:SetTextColor(unpack(colors.text))
  count:Hide()
  local track = frame:CreateTexture(nil, "BACKGROUND")
  track:SetColorTexture(unpack(colors.gcdTrack))
  local fill = frame:CreateTexture(nil, "ARTWORK")
  fill:SetColorTexture(unpack(colors.gcdFill))
  track:Hide(); fill:Hide()
  local nativeGCD = createFrame("StatusBar", nil, frame)
  nativeGCD:SetAllPoints(track)
  nativeGCD:SetFrameLevel(frame:GetFrameLevel() + 1)
  nativeGCD:EnableMouse(false)
  nativeGCD:SetStatusBarTexture("Interface\\Buttons\\WHITE8X8")
  nativeGCD:SetStatusBarColor(unpack(colors.gcdFill))
  nativeGCD:SetOrientation("HORIZONTAL")
  nativeGCD:SetMinMaxValues(0, 1)
  nativeGCD:Hide()
  local nativeActive = false
  local progress, width, height = nil, 0, 0
  function view.Layout(_, w, h, current)
    width, height = w, h
    track:ClearAllPoints(); track:SetPoint("TOPLEFT", frame, "TOPLEFT", w * 0.172, -h * 0.892)
    track:SetSize(w * 0.657, h * 0.024)
    fill:ClearAllPoints(); fill:SetPoint("TOPLEFT", track, "TOPLEFT", 0, 0)
    if current then track:Show() else track:Hide() end
    if not current then nativeActive = false end
    if current and nativeActive then nativeGCD:Show() else nativeGCD:Hide() end
    view:SetProgress(current and progress or nil)
  end
  function view.SetProgress(_, value)
    progress = value
    if nativeActive then fill:Hide(); return end
    if value and value > 0 then fill:SetSize(width * 0.657 * value, height * 0.024); fill:Show()
    else fill:Hide() end
  end
  function view.Refresh(_, adapter, action)
    local value = adapter:Apply(cooldown, action)
    if value then count:SetText(tostring(value.value)); count:Show() else count:SetText(""); count:Hide() end
  end
  function view.RefreshGCD(_, adapter, current)
    nativeActive = false
    nativeGCD:Hide()
    if current and type(adapter.ApplyGCD) == "function" then
      nativeActive = adapter:ApplyGCD(nativeGCD) == true
    end
    if nativeActive then fill:Hide(); track:Show() end
    return nativeActive
  end
  function view.Clear(_)
    nativeActive = false; nativeGCD:Hide()
    cooldown:Clear(); count:SetText(""); count:Hide(); track:Hide(); view:SetProgress(nil)
  end
  function view.SetNumbers(_, enabled) cooldown:SetHideCountdownNumbers(not enabled) end
  function view.SetTypography(_, values)
    countType:Apply(values, "stacks", 12)
    if countdownType and countdownType:Apply(values, "cooldown", 14) then
      cooldown:SetCountdownFont(countdownName)
    end
  end
  function view.GetLabelParent(_) return labels end
  return view
end
Spynon.CooldownOverlayFactory = Overlay
