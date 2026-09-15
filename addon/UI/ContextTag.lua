local _, Spynon = ...
local Tag = {}
local LABELS = { SINGLE_TARGET = "ST", CLEAVE = "Cleave", AOE = "AoE" }
local NEXT = { AUTO = "SINGLE_TARGET", SINGLE_TARGET = "CLEAVE", CLEAVE = "AOE", AOE = "AUTO" }

function Tag.Create(createFrame, parent, anchor, selectMode, skin)
  local view, active, mode = {}, false, nil
  local tokens = (skin or Spynon.Skin):GetTokens()
  -- Sibling, not child: still usable when an empty recommendation queue is hidden.
  -- No secure template, action attributes, macro, keyboard binding or combat API.
  local button = createFrame("Button", nil, parent)
  button:SetPoint("BOTTOM", anchor, "TOP", 0, 6)
  button:SetFrameStrata("MEDIUM")
  button:SetClampedToScreen(true)
  local background = button:CreateTexture(nil, "BACKGROUND")
  background:SetAllPoints(button); background:SetColorTexture(unpack(tokens.colors.placeholder))
  local accent = button:CreateTexture(nil, "ARTWORK")
  accent:SetPoint("BOTTOMLEFT", button, "BOTTOMLEFT", 0, 0)
  local label = button:CreateFontString(nil, "OVERLAY", tokens.typography.fontObject)
  label:SetPoint("CENTER", button, "CENTER", 0, 1)
  label:SetTextColor(unpack(tokens.colors.text)); label:SetWordWrap(false)
  local font = label:GetFont()
  local typography = Spynon.Typography.Bind(label, font)
  local hint = button:CreateFontString(nil, "OVERLAY", tokens.typography.fontObject)
  hint:SetPoint("BOTTOM", button, "TOP", 0, 4)
  hint:SetTextColor(unpack(tokens.colors.text))
  hint:SetText("Clique: Auto > ST > Cleave > AoE"); hint:Hide()
  local function fit()
    local _, size = label:GetFont()
    local width = math.max(140, label:GetStringWidth() + 24)
    button:SetSize(width, size + 14); accent:SetSize(width, 2)
  end
  function view.SetStatus(_, status)
    mode = NEXT[status.mode] and status.mode or nil
    local text = LABELS[status.resolvedMode] or "?"
    if mode == "AUTO" then
      text = "Auto: " .. text .. (status.source == "SAFE_FALLBACK" and " · fallback" or " · observado")
    elseif mode then text = text .. " · manual"
    else text = "Contexto indisponível" end
    label:SetText(text .. (mode and "  >" or ""))
    accent:SetColorTexture(unpack(mode and mode ~= "AUTO" and tokens.colors.buff or tokens.colors.muted))
    fit()
  end
  function view.ApplySettings(_, values)
    button:SetScale(values.scale)
    typography:Apply(values, "labels", 12); fit()
  end
  function view.SetActive(_, value)
    active = value == true
    button:EnableMouse(active); hint:Hide()
    if active then button:Show() else button:Hide() end
  end
  button:SetScript("OnClick", function(_, mouseButton)
    if active and mouseButton == "LeftButton" and NEXT[mode] then selectMode(NEXT[mode]) end
  end)
  button:SetScript("OnEnter", function() if active then hint:Show() end end)
  button:SetScript("OnLeave", function() hint:Hide() end)
  function view.GetRoot(_) return button end
  view:SetActive(false)
  return view
end
Spynon.ContextTagFactory = Tag
