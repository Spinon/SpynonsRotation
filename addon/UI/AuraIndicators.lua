local _, Spynon = ...
local Indicator = Spynon.Contracts.Indicator
local AuraUI = {}
local ROOT = "Interface\\AddOns\\SpynonRotation\\UI\\Media\\Textures\\Auras\\"
local UV = { 0.001953125, 0.998046875, 0.1875, 0.8125 }
local COLORS = { STABLE = { 0.259, 0.788, 0.243 }, ATTENTION = { 1, 0.68, 0.15 }, REFRESH = { 0.898, 0.282, 0.302 } }
function AuraUI.Create(createFrame, parent, clock)
  local view, cells, values, byId = {}, {}, {}, {}
  local limit, accumulated = 3, 0
  local root = createFrame("Frame", nil, parent)
  root:SetSize(376, 38); root:SetPoint("TOP", parent, "BOTTOM", 0, -10); root:EnableMouse(false)
  local function texture(frame, file, layer)
    local tex = frame:CreateTexture(nil, layer)
    tex:SetAllPoints(frame); tex:SetTexture(ROOT .. file); tex:SetTexCoord(unpack(UV))
    return tex
  end
  for index = 1, 5 do
    local frame = createFrame("Frame", nil, root)
    frame:SetSize(120, 120 * 160 / 510); frame:EnableMouse(false)
    local icon = frame:CreateTexture(nil, "BACKGROUND")
    icon:SetPoint("TOPLEFT", frame, "TOPLEFT", 7, -6); icon:SetSize(26, 26)
    icon:SetTexCoord(0.02, 0.98, 0.02, 0.98)
    local placeholder = frame:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
    placeholder:SetPoint("CENTER", icon, "CENTER", 0, 0); placeholder:SetText("?")
    placeholder:SetTextColor(0.55, 0.6, 0.66, 1)
    texture(frame, "aura-juggle-cell-neutral-v1.tga", "ARTWORK")
    local channel = texture(frame, "aura-juggle-cell-primary-mask-v1.tga", "OVERLAY")
    -- Short stationary type segment; no full bright perimeter or added bitmap.
    channel:ClearAllPoints(); channel:SetPoint("TOPLEFT", frame, "TOPLEFT", 12, 0)
    channel:SetSize(21.6, 120 * 160 / 510 * 0.22)
    channel:SetTexCoord(UV[1] + (UV[2]-UV[1])*0.1, UV[1] + (UV[2]-UV[1])*0.28,
      UV[3], UV[3] + (UV[4]-UV[3])*0.22)
    channel:SetAlpha(0.7)
    local shelf = texture(frame, "aura-juggle-cell-state-shelf-mask-v1.tga", "OVERLAY")
    local name = frame:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
    local status = frame:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
    local font = name:GetFont()
    if font then name:SetFont(font, 10, "OUTLINE"); status:SetFont(font, 9, "OUTLINE") end
    name:SetPoint("TOPLEFT", frame, "TOPLEFT", 38, -7); name:SetWidth(75)
    status:SetPoint("TOPLEFT", frame, "TOPLEFT", 38, -21); status:SetWidth(75)
    name:SetWordWrap(false); status:SetWordWrap(false); name:SetJustifyH("LEFT"); status:SetJustifyH("LEFT")
    name:SetTextColor(0.94, 0.97, 1, 1)
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
      if not loaded then cell.icon:SetColorTexture(0.07, 0.09, 0.12, 1); cell.placeholder:Show()
      else cell.placeholder:Hide() end
      local unavailable = state == "ABSENT" or state == "UNAVAILABLE"
      cell.icon:SetDesaturated(unavailable); cell.icon:SetAlpha(unavailable and 0.45 or 1)
      local kind = value.kind == "buff" and "Buff" or "Debuff"
      cell.channel:SetVertexColor(value.kind == "buff" and 0.027 or 0.898,
        value.kind == "buff" and 0.533 or 0.282, value.kind == "buff" and 0.847 or 0.302)
      cell.name:SetText(kind .. ": " .. value.label)
      local detail = state == "ABSENT" and "AUSENTE" or (state == "UNAVAILABLE" and "—" or "Ativo")
      if remains then detail = math.ceil(remains) .. "s" end
      if not unavailable and value.stacks then detail = "x" .. value.stacks .. (remains and " / " .. detail or "") end
      if state == "REFRESH" then detail = "Renovar " .. detail
      elseif state == "ATTENTION" then detail = "Expira " .. detail end
      cell.status:SetText(detail)
      local color = COLORS[state]
      if color then cell.shelf:SetVertexColor(unpack(color)); cell.shelf:Show()
      else cell.shelf:Hide() end
      cell.status:SetTextColor(unpack(color or { 0.65, 0.68, 0.72 }))
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
