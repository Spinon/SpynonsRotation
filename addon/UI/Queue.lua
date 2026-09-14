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

function Queue.Create(createFrame, parent, motionMode)
  local view = {}
  local root = createFrame("Frame", nil, parent)
  root:SetSize(Queue.Layout.width, Queue.Layout.height)
  root:SetPoint("CENTER", parent, "CENTER", 0, Queue.Layout.offsetY)
  root:SetFrameStrata("MEDIUM")
  root:EnableMouse(false)
  root:Hide()
  local pool, byId, animator = {}, {}, nil
  for index = 1, 8 do
    local frame = createFrame("Frame", nil, root)
    frame:EnableMouse(false)
    local icon = frame:CreateTexture(nil, "BACKGROUND")
    local border = frame:CreateTexture(nil, "OVERLAY")
    border:SetAllPoints(frame)
    border:SetTexture(Queue.Layout.queued.texture)
    border:SetTexCoord(unpack(Queue.Layout.queued.uv))
    local currentBorder = frame:CreateTexture(nil, "OVERLAY")
    currentBorder:SetAllPoints(frame)
    currentBorder:SetTexture(Queue.Layout.current.texture)
    currentBorder:SetTexCoord(unpack(Queue.Layout.current.uv))
    local flash = frame:CreateTexture(nil, "ARTWORK")
    flash:SetColorTexture(0.8, 0.87, 0.94, 1)
    flash:SetAlpha(0)
    local placeholder = frame:CreateFontString(nil, "ARTWORK", "GameFontNormalSmall")
    placeholder:SetPoint("CENTER", frame, "CENTER", 0, 0)
    placeholder:SetTextColor(0.55, 0.6, 0.66, 1)
    placeholder:SetText("?")
    frame:Hide()
    pool[index] = { frame = frame, icon = icon, border = border, currentBorder = currentBorder,
      flash = flash, placeholder = placeholder }
  end

  local function geometry(position)
    local layout = position == 1 and Queue.Layout.current or Queue.Layout.queued
    return { x = position == 1 and layout.x or (position - 2) * (layout.width + Queue.Layout.gap),
      y = layout.y, width = layout.width, height = layout.height,
      iconX = layout.iconX, iconY = layout.iconY, iconWidth = layout.iconWidth, iconHeight = layout.iconHeight,
      alpha = 1, scale = 1, current = position == 1 and 1 or 0 }
  end
  local function paint(slot)
    local value = slot.visual
    if not value then return end
    local pulse = slot.consumeTime and math.sin(math.pi * slot.consumeTime / 0.10) or 0
    local scale = value.scale * (1 - (animator:GetMode() == "NORMAL" and pulse * 0.04 or 0))
    slot.frame:ClearAllPoints()
    slot.frame:SetSize(value.width * scale, value.height * scale)
    slot.frame:SetPoint("TOPLEFT", root, "TOPLEFT", value.x + value.width * (1 - scale) / 2,
      value.y - value.height * (1 - scale) / 2)
    slot.frame:SetAlpha(value.alpha * (1 - pulse * 0.25))
    -- Two preloaded neutral assets crossfade with hierarchy; no bitmap swaps per tick.
    slot.border:SetAlpha(1 - value.current)
    slot.currentBorder:SetAlpha(value.current)
    slot.icon:ClearAllPoints()
    slot.icon:SetPoint("TOPLEFT", slot.frame, "TOPLEFT", value.iconX * scale, -value.iconY * scale)
    slot.icon:SetSize(value.iconWidth * scale, value.iconHeight * scale)
    slot.flash:SetAllPoints(slot.icon)
    slot.flash:SetAlpha(animator:GetMode() == "NORMAL" and pulse * 0.16 or 0)
    -- Center crop preserves native square artwork proportions in either opening.
    local ratio = value.iconWidth / value.iconHeight
    local left, right, top, bottom = 0.08, 0.92, 0.08, 0.92
    if ratio > 1 then top, bottom = 0.5 - 0.42 / ratio, 0.5 + 0.42 / ratio
    else left, right = 0.5 - 0.42 * ratio, 0.5 + 0.42 * ratio end
    slot.icon:SetTexCoord(left, right, top, bottom)
  end
  local function content(slot, rec)
    local loaded = rec.action.icon and slot.icon:SetTexture(rec.action.icon)
    if not loaded then
      -- Local procedural placeholder: same rectangle and anchor as the resolved native icon.
      slot.icon:SetColorTexture(0.07, 0.09, 0.12, 1)
      slot.placeholder:Show()
    else slot.placeholder:Hide() end
    slot.frame:Show()
  end
  local function release(slot)
    if byId[slot.id] == slot then byId[slot.id] = nil end
    animator:Cancel(slot)
    slot.id, slot.position, slot.rec, slot.visual, slot.retiring, slot.consumeTime = nil, nil, nil, nil, nil, nil
    slot.frame:Hide()
  end
  local ticking = false
  local function tick(_, elapsed)
    animator:Step(elapsed, pool)
    local any = false
    for _, slot in ipairs(pool) do if slot.id then any = true end end
    if not any then root:Hide() end
  end
  local function wake(active)
    if active == ticking then return end
    ticking = active
    root:SetScript("OnUpdate", active and tick or nil)
  end
  animator = Spynon.AnimatorFactory.Create(paint, release, wake)
  animator:SetMode(motionMode or "NORMAL")
  local function clear()
    for _, slot in ipairs(pool) do release(slot) end
    wake(false)
  end
  root:SetScript("OnHide", clear)

  function view.SetRecommendations(_, recommendations)
    if not Spynon.RotationProgram.IsList(recommendations, 12) then view:Hide(); return false end
    local ids, selected = {}, {}
    for index = 1, math.min(4, #recommendations) do
      local rec = recommendations[index]
      if not Spynon.Contracts.Recommendation.IsRuntimeSafe(rec) or ids[rec.id] then view:Hide(); return false end
      ids[rec.id] = true
      selected[index] = rec
    end
    -- Empty/unsafe state withdraws all advice immediately, even mid-transition.
    if #selected == 0 then view:Hide(); return true end
    local consuming = false
    for _, slot in ipairs(pool) do if slot.consumeTime then consuming = true end end
    -- Discard obsolete retirees first; at most four live plus four outgoing frames.
    for _, slot in ipairs(pool) do
      if slot.retiring and not ids[slot.id] then release(slot) end
    end
    for _, slot in ipairs(pool) do
      if slot.id and not ids[slot.id] then
        byId[slot.id] = nil; slot.retiring = true
        animator:Animate(slot, slot.visual, slot.consumeTime and "CONSUME" or "EXIT", true)
      elseif slot.id then
        slot.retiring = nil; byId[slot.id] = slot
      end
    end
    for index, rec in ipairs(selected) do
      local slot = byId[rec.id]
      if not slot then
        for _, candidate in ipairs(pool) do if not candidate.id then slot = candidate; break end end
        byId[rec.id] = slot
      end
      local kind = Spynon.AnimatorFactory.Classify(slot.position, index)
      if animator:GetTransition(slot) == "EXIT" or animator:GetTransition(slot) == "CONSUME" then kind = "MOVE" end
      slot.id, slot.position, slot.rec = rec.id, index, rec
      content(slot, rec)
      if kind then
        local delay = consuming and (kind == "PROMOTE" and 0.04 or 0.07) or 0
        animator:Animate(slot, geometry(index), kind, false, delay)
      else paint(slot) end
    end
    local any = false
    for _, slot in ipairs(pool) do if slot.id then any = true end end
    if any then root:Show() else root:Hide(); wake(false) end
    return true
  end
  function view.Hide(_) clear(); root:Hide() end
  function view.SetMotionMode(_, mode)
    if not animator:SetMode(mode) then return false end
    for _, slot in ipairs(pool) do slot.consumeTime = nil; paint(slot) end
    return true
  end
  function view.GetTransition(_, id)
    return byId[id] and animator:GetTransition(byId[id]) or nil
  end
  function view.ConfirmCast(_, spellID)
    -- Public confirmed spell ID only; an exit alone is never proof of consumption.
    for _, slot in ipairs(pool) do
      local action = slot.rec and slot.rec.action
      if slot.position == 1 and action and action.gameId == spellID
        and action.kind ~= "item" and action.kind ~= "trinket" and action.kind ~= "potion" then
        for _, other in ipairs(pool) do other.consumeTime = nil end
        return animator:Consume(slot)
      end
    end
    return false
  end
  function view.GetFrameForId(_, id) return byId[id] and byId[id].frame or nil end
  function view.GetRoot(_) return root end
  return view
end
Spynon.QueueFactory = Queue
