local _, Spynon = ...
local Queue = {}
local ROOT = "Interface\\AddOns\\SpynonRotation\\UI\\Media\\Textures\\Actions\\"
-- Approved handoff v1 content UVs. Swap assets here without changing recommendation/identity logic.
Queue.Layout = {
  width = 256, height = 214, offsetY = -130, gap = 8,
  current = { width = 200, height = 120, x = 28, y = 0,
    texture = ROOT .. "action-current-neutral-v1.tga", uv = { 0.109375, 0.890625, 0.03125, 0.96875 },
    iconX = 20, iconY = 11, iconWidth = 158, iconHeight = 94 },
  queued = { width = 80, height = 80, y = -134,
    texture = ROOT .. "action-queue-neutral-v1.tga", uv = { 0.03125, 0.96875, 0.03125, 0.96875 },
    iconX = 12, iconY = 8, iconWidth = 57, iconHeight = 59 },
}
-- UI-007: 2% edge trim instead of 8%; keep more native texels without stretching.
local ICON_TRIM = 0.02

function Queue.Create(createFrame, parent, motionMode)
  local view = {}
  local root = createFrame("Frame", nil, parent)
  root:SetSize(Queue.Layout.width, Queue.Layout.height)
  root:SetPoint("CENTER", parent, "CENTER", 0, Queue.Layout.offsetY)
  root:SetFrameStrata("MEDIUM")
  root:EnableMouse(false)
  root:Hide()
  local pool, byId, animator = {}, {}, nil
  local hotkeysEnabled, compactHotkeys = true, true
  local overlayAdapter, gcdTiming
  local indicators
  for index = 1, 8 do
    local frame = createFrame("Frame", nil, root)
    frame:EnableMouse(false)
    local icon = frame:CreateTexture(nil, "BACKGROUND")
    local overlay = Spynon.CooldownOverlayFactory.Create(createFrame, frame, icon)
    local foreground = overlay:GetLabelParent()
    -- Native Cooldown is a child frame: parent draw layers alone cannot cover it.
    local border = foreground:CreateTexture(nil, "ARTWORK")
    border:SetAllPoints(frame)
    border:SetTexture(Queue.Layout.queued.texture)
    border:SetTexCoord(unpack(Queue.Layout.queued.uv))
    local currentBorder = foreground:CreateTexture(nil, "ARTWORK")
    currentBorder:SetAllPoints(frame)
    currentBorder:SetTexture(Queue.Layout.current.texture)
    currentBorder:SetTexCoord(unpack(Queue.Layout.current.uv))
    local flash = foreground:CreateTexture(nil, "BACKGROUND")
    flash:SetColorTexture(0.8, 0.87, 0.94, 1)
    flash:SetAlpha(0)
    local placeholder = foreground:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
    placeholder:SetPoint("CENTER", icon, "CENTER", 0, 0)
    placeholder:SetTextColor(0.55, 0.6, 0.66, 1)
    placeholder:SetText("?")
    local hotkey = foreground:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
    local font = hotkey:GetFont()
    hotkey:SetPoint("TOPRIGHT", icon, "TOPRIGHT", -2, -2)
    hotkey:SetTextColor(0.94, 0.97, 1, 1)
    hotkey:SetJustifyH("RIGHT")
    hotkey:SetWordWrap(false)
    hotkey:Hide()
    frame:Hide()
    pool[index] = { frame = frame, icon = icon, border = border, currentBorder = currentBorder,
      flash = flash, placeholder = placeholder, hotkey = hotkey, font = font, overlay = overlay }
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
    slot.overlay:Layout(value.width * scale, value.height * scale, slot.position == 1 and not slot.retiring)
    slot.flash:SetAllPoints(slot.icon)
    slot.flash:SetAlpha(animator:GetMode() == "NORMAL" and pulse * 0.16 or 0)
    -- Center crop preserves native square artwork proportions in either opening.
    local ratio = value.iconWidth / value.iconHeight
    local half = 0.5 - ICON_TRIM
    local left, right, top, bottom = ICON_TRIM, 1 - ICON_TRIM, ICON_TRIM, 1 - ICON_TRIM
    if ratio > 1 then top, bottom = 0.5 - half / ratio, 0.5 + half / ratio
    else left, right = 0.5 - half * ratio, 0.5 + half * ratio end
    slot.icon:SetTexCoord(left, right, top, bottom)
    local text = hotkeysEnabled and Spynon.Hotkeys.Format(slot.key, compactHotkeys) or nil
    if text and slot.font then
      local size = math.floor((12 + 2 * value.current) * scale + 0.5)
      slot.hotkey:SetFont(slot.font, size, "OUTLINE")
      slot.hotkey:SetText(text)
      if slot.hotkey:GetStringWidth() > value.iconWidth * scale - 4 then
        slot.hotkey:SetFont(slot.font, 10, "OUTLINE")
      end
      if slot.hotkey:GetStringWidth() <= value.iconWidth * scale - 4 then slot.hotkey:Show()
      else slot.hotkey:Hide() end -- Never truncate a binding into a different instruction.
    else slot.hotkey:SetText(""); slot.hotkey:Hide() end
  end
  local function content(slot, rec)
    local loaded = rec.action.icon and slot.icon:SetTexture(rec.action.icon, "CLAMP", "CLAMP", "LINEAR")
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
    slot.key = nil; slot.hotkey:SetText(""); slot.hotkey:Hide()
    slot.overlay:Clear()
    slot.frame:Hide()
  end
  local ticking, motionActive = false, false
  local function updateGCD()
    local progress = gcdTiming and overlayAdapter:GCDProgress(gcdTiming) or nil
    if progress == nil then gcdTiming = nil end
    for _, slot in ipairs(pool) do
      slot.overlay:SetProgress(slot.position == 1 and not slot.retiring and progress or nil)
    end
  end
  local tick
  local function wake(active)
    motionActive = active
    local wanted = active or gcdTiming ~= nil
    if wanted == ticking then return end
    ticking = wanted
    root:SetScript("OnUpdate", wanted and tick or nil)
  end
  tick = function(_, elapsed)
    animator:Step(elapsed, pool)
    if gcdTiming then updateGCD(); wake(motionActive) end
    local any = false
    for _, slot in ipairs(pool) do if slot.id then any = true end end
    if not any then root:Hide() end
  end
  animator = Spynon.AnimatorFactory.Create(paint, release, wake)
  animator:SetMode(motionMode or "NORMAL")
  local function clear()
    if indicators then indicators:Clear() end
    gcdTiming = nil
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
  function view.SetIndicators(_, values, clock)
    if not Spynon.RotationProgram.IsList(values, 12) then
      if indicators then indicators:Clear() end
      return false
    end
    if not indicators and #values == 0 then return end
    indicators = indicators or Spynon.AuraIndicatorsFactory.Create(createFrame, root, clock)
    indicators:Set(values)
  end
  function view.RefreshOverlays(_, adapter)
    overlayAdapter, gcdTiming = adapter, nil
    local current = false
    for _, slot in ipairs(pool) do
      if slot.rec and not slot.retiring then
        slot.overlay:Refresh(adapter, slot.rec.action)
        if slot.position == 1 then current = true end
      else slot.overlay:Clear() end
    end
    if current then gcdTiming = adapter:ReadGCD() end
    updateGCD(); wake(motionActive)
  end
  function view.ClearOverlays(_)
    if indicators then indicators:Clear() end
    gcdTiming = nil
    for _, slot in ipairs(pool) do slot.overlay:Clear() end
    wake(motionActive)
  end
  function view.SetCooldownNumbers(_, enabled)
    for _, slot in ipairs(pool) do slot.overlay:SetNumbers(enabled) end
  end
  function view.SetHotkeys(_, keys)
    for _, slot in ipairs(pool) do slot.key = keys[slot.id]; paint(slot) end
  end
  function view.SetHotkeyStyle(_, enabled, compact)
    hotkeysEnabled, compactHotkeys = enabled, compact
    for _, slot in ipairs(pool) do paint(slot) end
  end
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
  function view.PreviewConsume(_, id)
    -- Demo-only identity pulse; never called by the live recommendation controller.
    local slot = byId[id]
    if not slot or slot.position ~= 1 then return false end
    for _, other in ipairs(pool) do other.consumeTime = nil end
    return animator:Consume(slot)
  end
  function view.GetFrameForId(_, id) return byId[id] and byId[id].frame or nil end
  function view.GetRoot(_) return root end
  return view
end
Spynon.QueueFactory = Queue
