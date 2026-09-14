local _, Spynon = ...
local Indicator = Spynon.Contracts.Indicator
local AuraUI = {}
function AuraUI.Create(createFrame, parent, clock, skin)
  local tokens = (skin or Spynon.Skin):GetTokens()
  local UV, colors = tokens.auras.uv, tokens.colors
  local states = {STABLE=colors.stable, ATTENTION=colors.attention, REFRESH=colors.refresh}
  local view, cells, values, byId = {}, {}, {}, {}
  local limit, accumulated = 3, 0
  local root = createFrame("Frame", nil, parent)
  root:SetSize(376, 38); root:SetPoint("TOP", parent, "BOTTOM", 0, -10); root:EnableMouse(false)
  local function texture(frame, file, layer)
    local tex = frame:CreateTexture(nil, layer)
    tex:SetAllPoints(frame); tex:SetTexture(file); tex:SetTexCoord(unpack(UV))
    return tex
  end
  for index = 1, 5 do
    local frame = createFrame("Frame", nil, root)
    frame:SetSize(120, 120 * 160 / 510); frame:EnableMouse(false)
    local icon = frame:CreateTexture(nil, "BACKGROUND")
    icon:SetPoint("TOPLEFT", frame, "TOPLEFT", 7, -6); icon:SetSize(26, 26)
    icon:SetTexCoord(0.02, 0.98, 0.02, 0.98)
    local placeholder = frame:CreateFontString(nil, "OVERLAY", tokens.typography.fontObject)
    placeholder:SetPoint("CENTER", icon, "CENTER", 0, 0); placeholder:SetText("?")
    placeholder:SetTextColor(unpack(colors.muted))
    texture(frame, tokens.auras.background, "ARTWORK")
    local channel = texture(frame, tokens.auras.channel, "OVERLAY")
    -- Short stationary type segment; no full bright perimeter or added bitmap.
    channel:ClearAllPoints(); channel:SetPoint("TOPLEFT", frame, "TOPLEFT", 12, 0)
    channel:SetSize(21.6, 120 * 160 / 510 * 0.22)
    channel:SetTexCoord(UV[1] + (UV[2]-UV[1])*0.1, UV[1] + (UV[2]-UV[1])*0.28,
      UV[3], UV[3] + (UV[4]-UV[3])*0.22)
    channel:SetAlpha(0.7)
    local shelf = texture(frame, tokens.auras.shelf, "OVERLAY")
    local name = frame:CreateFontString(nil, "OVERLAY", tokens.typography.fontObject)
    local status = frame:CreateFontString(nil, "OVERLAY", tokens.typography.fontObject)
    local font = name:GetFont()
    if font then name:SetFont(font, 10, "OUTLINE"); status:SetFont(font, 9, "OUTLINE") end
    name:SetPoint("TOPLEFT", frame, "TOPLEFT", 38, -7); name:SetWidth(75)
    status:SetPoint("TOPLEFT", frame, "TOPLEFT", 38, -21); status:SetWidth(75)
    name:SetWordWrap(false); status:SetWordWrap(false); name:SetJustifyH("LEFT"); status:SetJustifyH("LEFT")
    name:SetTextColor(unpack(colors.text))
    cells[index] = { frame = frame, icon = icon, channel = channel, shelf = shelf,
      name = name, status = status, placeholder = placeholder }
    frame:Hide()
  end
  function view.Clear(_)
    values, byId = {}, {}
    for _, cell in ipairs(cells) do cell.id = nil; cell.frame:Hide(); cell.name:SetText(""); cell.status:SetText("") end
    root:SetScript("OnUpdate", nil); root:Hide()
  end
  local function render()
    local time = clock:ReadClock()
    local ranked, timed, keep = {}, false, {}
    for _, value in ipairs(values) do
      local state, remains = Indicator.At(value, time.ok and time.value or nil)
      ranked[#ranked + 1] = { value = value, state = state, remains = remains }
      if remains then timed = true end
    end
    table.sort(ranked, function(a, b)
      if a.state ~= b.state then return Indicator.Rank[a.state] < Indicator.Rank[b.state] end
      return a.value.id < b.value.id
    end)
    for i = 1, math.min(limit, #ranked) do keep[ranked[i].value.id] = true end
    for _, cell in ipairs(cells) do
      if cell.id and not keep[cell.id] then byId[cell.id] = nil; cell.id = nil; cell.frame:Hide() end
    end
    local count = math.min(limit, #ranked)
    for index = 1, count do
      local item = ranked[index]
      local value, state, remains = item.value, item.state, item.remains
      local cell = byId[value.id]
      if not cell then
        for _, candidate in ipairs(cells) do if not candidate.id then cell = candidate; break end end
        cell.id, byId[value.id] = value.id, cell
      end
      cell.frame:ClearAllPoints(); cell.frame:SetPoint("TOPLEFT", root, "TOPLEFT", (index-1)*128, 0)
      local loaded = value.icon and cell.icon:SetTexture(value.icon, "CLAMP", "CLAMP", "LINEAR")
      if not loaded then cell.icon:SetColorTexture(unpack(colors.placeholder)); cell.placeholder:Show()
      else cell.placeholder:Hide() end
      local unavailable = state == "ABSENT" or state == "UNAVAILABLE"
      cell.icon:SetDesaturated(unavailable); cell.icon:SetAlpha(unavailable and 0.45 or 1)
      local kind = value.kind == "buff" and "Buff" or "Debuff"
      cell.channel:SetVertexColor(unpack(value.kind == "buff" and colors.buff or colors.debuff))
      cell.name:SetText(kind .. ": " .. value.label)
      local detail = state == "ABSENT" and "AUSENTE" or (state == "UNAVAILABLE" and "—" or "Ativo")
      if remains then detail = math.ceil(remains) .. "s" end
      if not unavailable and value.stacks then detail = "x" .. value.stacks .. (remains and " / " .. detail or "") end
      if state == "REFRESH" then detail = "Renovar " .. detail
      elseif state == "ATTENTION" then detail = "Expira " .. detail end
      cell.status:SetText(detail)
      local color = states[state]
      if color then cell.shelf:SetVertexColor(unpack(color)); cell.shelf:Show()
      else cell.shelf:Hide() end
      cell.status:SetTextColor(unpack(color or colors.unavailable))
      cell.frame:Show()
    end
    root:SetSize(math.max(1, count*120 + (count-1)*8), 38)
    return timed
  end
  local function tick(_, delta)
    accumulated = accumulated + delta
    if accumulated >= 0.2 then
      accumulated = 0
      if not render() then root:SetScript("OnUpdate", nil) end
    end
  end
  function view.Set(_, list)
    if not Spynon.RotationProgram.IsList(list, 12) then view:Clear(); return false end
    local seen, nextValues = {}, {}
    for _, value in ipairs(list) do
      if not Indicator.Validate(value) or seen[value.id] then view:Clear(); return false end
      seen[value.id] = true
      local copy = {}; for key, item in pairs(value) do copy[key] = item end
      nextValues[#nextValues + 1] = copy
    end
    values, accumulated = nextValues, 0
    if #values == 0 then view:Clear(); return true end
    local timed = render()
    root:Show(); root:SetScript("OnUpdate", timed and tick or nil)
    return true
  end
  function view.SetLimit(_, value)
    if not Spynon.Contracts.Validation.IsPositiveInteger(value) or value > 5 then return false end
    limit = value
    if #values > 0 then render() end
    return true
  end
  function view.GetFrameForId(_, id) return byId[id] and byId[id].frame or nil end
  function view.GetRoot(_) return root end
  root:SetScript("OnHide", function() root:SetScript("OnUpdate", nil) end)
  root:Hide()
  return view
end
Spynon.AuraIndicatorsFactory = AuraUI
