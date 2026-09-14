local _, Spynon = ...
local Queue = {}
local ROOT = "Interface\\AddOns\\SpynonRotation\\UI\\Media\\Textures\\Actions\\"
-- Approved handoff v1 content UVs. Swap assets here without changing recommendation/identity logic.
Queue.Layout = {
  width = 256, height = 214, offsetY = -130, gap = 8,
  current = { width = 200, height = 120, x = 28, y = 0,
    texture = ROOT .. "action-current-neutral-v1.tga", uv = { 0.109375, 0.890625, 0.03125, 0.96875 },
    iconX = 22, iconY = 16, iconWidth = 156, iconHeight = 86 },
  queued = { width = 80, height = 80, y = -134,
    texture = ROOT .. "action-queue-neutral-v1.tga", uv = { 0.03125, 0.96875, 0.03125, 0.96875 },
    iconX = 15, iconY = 13, iconWidth = 50, iconHeight = 53 },
}

function Queue.Create(createFrame, parent)
  local view = {}
  local root = createFrame("Frame", nil, parent)
  root:SetSize(Queue.Layout.width, Queue.Layout.height)
  root:SetPoint("CENTER", parent, "CENTER", 0, Queue.Layout.offsetY)
  root:SetFrameStrata("MEDIUM")
  root:EnableMouse(false)
  root:Hide()
  local pool, byId = {}, {}
  for index = 1, 4 do
    local frame = createFrame("Frame", nil, root)
    frame:EnableMouse(false)
    local icon = frame:CreateTexture(nil, "BACKGROUND")
    local border = frame:CreateTexture(nil, "OVERLAY")
    border:SetAllPoints(frame)
    local placeholder = frame:CreateFontString(nil, "ARTWORK", "GameFontNormalSmall")
    placeholder:SetPoint("CENTER", frame, "CENTER", 0, 0)
    placeholder:SetTextColor(0.55, 0.6, 0.66, 1)
    placeholder:SetText("?")
    frame:Hide()
    pool[index] = { frame = frame, icon = icon, border = border, placeholder = placeholder }
  end

  local function render(slot, rec, position)
    local layout = position == 1 and Queue.Layout.current or Queue.Layout.queued
    slot.id = rec.id
    slot.frame:ClearAllPoints()
    slot.frame:SetSize(layout.width, layout.height)
    local x = position == 1 and layout.x or (position - 2) * (layout.width + Queue.Layout.gap)
    slot.frame:SetPoint("TOPLEFT", root, "TOPLEFT", x, layout.y)
    slot.border:SetTexture(layout.texture)
    slot.border:SetTexCoord(unpack(layout.uv))
    slot.icon:ClearAllPoints()
    slot.icon:SetPoint("TOPLEFT", slot.frame, "TOPLEFT", layout.iconX, -layout.iconY)
    slot.icon:SetSize(layout.iconWidth, layout.iconHeight)
    -- Center crop preserves native square artwork proportions in either opening.
    local ratio = layout.iconWidth / layout.iconHeight
    local left, right, top, bottom = 0.08, 0.92, 0.08, 0.92
    if ratio > 1 then top, bottom = 0.5 - 0.42 / ratio, 0.5 + 0.42 / ratio
    else left, right = 0.5 - 0.42 * ratio, 0.5 + 0.42 * ratio end
    slot.icon:SetTexCoord(left, right, top, bottom)
    local loaded = rec.action.icon and slot.icon:SetTexture(rec.action.icon)
    if not loaded then
      -- Local procedural placeholder: same rectangle and anchor as the resolved native icon.
      slot.icon:SetColorTexture(0.07, 0.09, 0.12, 1)
      slot.placeholder:Show()
    else slot.placeholder:Hide() end
    slot.frame:Show()
  end

  function view.SetRecommendations(_, recommendations)
    if not Spynon.RotationProgram.IsList(recommendations, 12) then root:Hide(); return false end
    local ids, selected = {}, {}
    for index = 1, math.min(4, #recommendations) do
      local rec = recommendations[index]
      if not Spynon.Contracts.Recommendation.IsRuntimeSafe(rec) or ids[rec.id] then root:Hide(); return false end
      ids[rec.id] = true
      selected[index] = rec
    end
    -- Reserve surviving identities before reusing any removed frame.
    for _, slot in ipairs(pool) do
      if slot.id and not ids[slot.id] then byId[slot.id] = nil; slot.id = nil; slot.frame:Hide() end
    end
    for index, rec in ipairs(selected) do
      local slot = byId[rec.id]
      if not slot then
        for _, candidate in ipairs(pool) do if not candidate.id then slot = candidate; break end end
        byId[rec.id] = slot
      end
      render(slot, rec, index)
    end
    if #selected > 0 then root:Show() else root:Hide() end
    return true
  end
  function view.Hide(_) root:Hide() end
  function view.GetFrameForId(_, id) return byId[id] and byId[id].frame or nil end
  function view.GetRoot(_) return root end
  return view
end
Spynon.QueueFactory = Queue
