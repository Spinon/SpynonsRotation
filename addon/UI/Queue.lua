local _, Spynon = ...
local Queue = {}
function Queue.Create(createFrame, parent, motionMode, settings, skin)
  local explicitSkin = skin ~= nil
  skin = skin or Spynon.Skin
  local tokens = skin:GetTokens()
  local layoutTokens, colors = tokens.queue, tokens.colors
  local view = {}
  local root = createFrame("Frame", nil, parent)
  root:SetPoint("CENTER", parent, "CENTER", 0, layoutTokens.offsetY)
  root:SetFrameStrata("MEDIUM")
  root:EnableMouse(false)
  root:Hide()
  local pool, byId, animator = {}, {}, nil
  local hotkeysEnabled, compactHotkeys = true, true
  local overlayAdapter, gcdTiming
  local indicators, editor
  local options = Spynon.SettingsFactory.Defaults()
  local lastRecommendations, lastKeys, lastIndicators, indicatorClock, relayout
  for index = 1, 12 do
    local frame = createFrame("Frame", nil, root)
    frame:EnableMouse(false)
    local icon = frame:CreateTexture(nil, "BACKGROUND")
    local overlay = Spynon.CooldownOverlayFactory.Create(createFrame, frame, icon, skin)
    local foreground = overlay:GetLabelParent()
    -- Native Cooldown is a child frame: parent draw layers alone cannot cover it.
    local border = foreground:CreateTexture(nil, "ARTWORK")
    border:SetAllPoints(frame)
    border:SetTexture(layoutTokens.queued.texture)
    border:SetTexCoord(unpack(layoutTokens.queued.uv))
    local currentBorder = foreground:CreateTexture(nil, "ARTWORK")
    currentBorder:SetAllPoints(frame)
    currentBorder:SetTexture(layoutTokens.current.texture)
    currentBorder:SetTexCoord(unpack(layoutTokens.current.uv))
    local flash = foreground:CreateTexture(nil, "BACKGROUND")
    flash:SetColorTexture(unpack(colors.flash))
    flash:SetAlpha(0)
    local placeholder = foreground:CreateFontString(nil, "OVERLAY", tokens.typography.fontObject)
    placeholder:SetPoint("CENTER", icon, "CENTER", 0, 0)
    placeholder:SetTextColor(unpack(colors.muted))
    placeholder:SetText("?")
    local hotkey = foreground:CreateFontString(nil, "OVERLAY", tokens.typography.fontObject)
    local font = hotkey:GetFont()
    hotkey:SetPoint("TOPRIGHT", icon, "TOPRIGHT", -2, -2)
    hotkey:SetTextColor(unpack(colors.text))
    hotkey:SetJustifyH("RIGHT")
    hotkey:SetWordWrap(false)
    hotkey:Hide()
    local detail = foreground:CreateFontString(nil, "OVERLAY", tokens.typography.fontObject)
    detail:SetJustifyH("LEFT"); detail:SetWordWrap(true); detail:SetTextColor(unpack(colors.text))
    detail:Hide()
    local waiting = foreground:CreateFontString(nil, "OVERLAY", tokens.typography.fontObject)
    waiting:SetPoint("BOTTOM", icon, "BOTTOM", 0, 2)
    waiting:SetTextColor(unpack(colors.text)); waiting:SetText("GCD"); waiting:Hide()
    frame:Hide()
    pool[index] = { index = index, frame = frame, icon = icon, border = border, currentBorder = currentBorder,
      flash = flash, placeholder = placeholder, hotkey = hotkey, font = font, overlay = overlay,
      hotkeyType = Spynon.Typography.Bind(hotkey, font),
      placeholderType = Spynon.Typography.Bind(placeholder, font), detail = detail,
      detailType = Spynon.Typography.Bind(detail, font), waiting = waiting,
      waitingType = Spynon.Typography.Bind(waiting, font) }
  end

  local function dimensions()
    local w, h = layoutTokens.current.width*options.mainScale, layoutTokens.current.height*options.mainScale
    local count, gap, queued = options.count, options.coupled and 0 or options.spacing, layoutTokens.queued
    local row = math.max(0, (count-1)*(queued.width+gap)-gap)
    if options.direction == "STACKED" then
      local inset = options.coupled and 0 or layoutTokens.rowInset
      return math.max(w, row), h + (count > 1 and queued.height+gap+inset or 0), w, h, row
    end
    return w+(count-1)*(queued.width+gap), count > 1 and math.max(h, queued.height) or h, w, h, row
  end
  local function geometry(position)
    local layout = position == 1 and layoutTokens.current or layoutTokens.queued
    local width, _, mainWidth, mainHeight, rowWidth = dimensions()
    local gap = options.coupled and 0 or options.spacing
    local factor = options.alignment == "START" and 0 or (options.alignment == "END" and 1 or 0.5)
    local size = position == 1 and options.mainScale or 1
    local x, y = (width-mainWidth)*factor, 0
    if options.direction == "STACKED" and position > 1 then
      x, y = (width-rowWidth)*factor+(position-2)*(layoutTokens.queued.width+gap),
        -(mainHeight+gap+(options.coupled and 0 or layoutTokens.rowInset))
    elseif options.direction ~= "STACKED" then
      x = position == 1 and 0 or mainWidth+gap+(position-2)*(layoutTokens.queued.width+gap)
      y = position == 1 and 0 or -math.max(0, mainHeight-layoutTokens.queued.height)*factor
      if options.direction == "LEFT" then x = width-x-layout.width*size end
    end
    return { x = x, y = y, width = layout.width*size, height = layout.height*size,
      iconX = layout.iconX*size, iconY = layout.iconY*size,
      iconWidth = (position == 1 and math.min(layout.iconWidth, layout.iconHeight) or layout.iconWidth)*size,
      iconHeight = (position == 1 and math.min(layout.iconWidth, layout.iconHeight) or layout.iconHeight)*size,
      alpha = 1, scale = 1, current = position == 1 and 1 or 0 }
  end
  local function paint(slot)
    local value = slot.visual
    if not value then return end
    local pulse = slot.consumeTime and math.sin(math.pi * slot.consumeTime / (slot.consumeDuration or 0.10)) or 0
    local scale = value.scale * (1 - (animator:GetMode() == "NORMAL" and pulse * 0.04 or 0))
    slot.frame:ClearAllPoints()
    slot.frame:SetSize(value.width * scale, value.height * scale)
    slot.frame:SetPoint("TOPLEFT", root, "TOPLEFT", value.x + value.width * (1 - scale) / 2,
      value.y - value.height * (1 - scale) / 2)
    slot.frame:SetAlpha(value.alpha * (1 - pulse * 0.25))
    local waiting = slot.rec and slot.rec.readiness == "WAITING_GCD" and not slot.retiring
    slot.icon:SetAlpha(waiting and 0.55 or 1)
    if waiting then
      slot.waitingType:Apply(options, "labels", 10)
      slot.waiting:Show()
    else slot.waiting:Hide() end
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
    local trim = layoutTokens.iconTrim
    local half = 0.5 - trim
    local left, right, top, bottom = trim, 1 - trim, trim, 1 - trim
    if ratio > 1 then top, bottom = 0.5 - half / ratio, 0.5 + half / ratio
    else left, right = 0.5 - half * ratio, 0.5 + half * ratio end
    slot.icon:SetTexCoord(left, right, top, bottom)
    -- The skin's current opening holds a square icon and a separate information column.
    -- Narrow external skins safely omit the column; queued artwork keeps its approved fit.
    local column = (layoutTokens.current.iconWidth - math.min(layoutTokens.current.iconWidth,
      layoutTokens.current.iconHeight) - 8) * options.mainScale * scale
    if slot.position == 1 and not slot.retiring and value.current > 0.99 and column >= 40 then
      slot.detail:ClearAllPoints()
      slot.detail:SetPoint("TOPLEFT", slot.icon, "TOPRIGHT", 8*options.mainScale*scale, -4*scale)
      slot.detail:SetSize(column, math.max(1, value.iconHeight*scale-8))
      slot.detailType:Apply(options, "labels", 10*options.mainScale*scale)
      slot.detail:Show()
    else slot.detail:Hide() end
    local anchor = options.keyPosition
    slot.hotkey:ClearAllPoints(); slot.hotkey:SetPoint(anchor, slot.icon, anchor,
      anchor:find("LEFT", 1, true) and 2 or -2, anchor:find("BOTTOM", 1, true) and 2 or -2)
    local text = hotkeysEnabled and Spynon.Hotkeys.Format(slot.key, compactHotkeys) or nil
    if text and slot.font then
      local size = math.floor((12 + 2 * value.current) * scale + 0.5)
      slot.hotkeyType:Apply(options, "hotkey", size)
      slot.hotkey:SetText(text)
      if slot.hotkey:GetStringWidth() > value.iconWidth * scale - 4 then
        slot.hotkeyType:Apply(options, "hotkey", 10)
      end
      if slot.hotkey:GetStringWidth() <= value.iconWidth * scale - 4 then slot.hotkey:Show()
      else slot.hotkey:Hide() end -- Never truncate a binding into a different instruction.
    else slot.hotkey:SetText(""); slot.hotkey:Hide() end
    if editor then editor:Update(slot, options) end
  end
  local function content(slot, rec)
    local contexts = { SINGLE_TARGET = "Alvo único", CLEAVE = "Cleave", AOE = "Área" }
    local mode = rec.context and (rec.context.resolvedMode or rec.context.mode)
    local status = rec.readiness == "WAITING_GCD" and "\nAguardando GCD" or ""
    slot.detail:SetText(rec.action.label .. status .. (contexts[mode] and "\n\n" .. contexts[mode] or ""))
    local loaded = rec.action.icon and slot.icon:SetTexture(rec.action.icon, "CLAMP", "CLAMP", "LINEAR")
    if not loaded then
      -- Local procedural placeholder: same rectangle and anchor as the resolved native icon.
      slot.icon:SetColorTexture(unpack(colors.placeholder))
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
    slot.waiting:Hide(); slot.icon:SetAlpha(1)
    slot.frame:Hide()
    if editor then editor:Update(slot, options) end
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
    if editor then editor:Clear() end
    lastRecommendations, lastKeys, lastIndicators = nil, nil, nil
    if indicators then indicators:Clear() end
    gcdTiming = nil
    for _, slot in ipairs(pool) do release(slot) end
    wake(false)
  end
  root:SetScript("OnHide", clear)

  function view.SetRecommendations(_, recommendations)
    if not Spynon.RotationProgram.IsList(recommendations, 12) then view:Hide(); return false end
    local ids, selected = {}, {}
    for index = 1, math.min(options.count, #recommendations) do
      local rec = recommendations[index]
      if not Spynon.Contracts.Recommendation.IsRuntimeSafe(rec) or ids[rec.id] then view:Hide(); return false end
      ids[rec.id] = true
      selected[index] = rec
    end
    -- Empty/unsafe state withdraws all advice immediately, even mid-transition.
    if #selected == 0 then view:Hide(); return true end
    lastRecommendations = recommendations
    local consuming = false
    for _, slot in ipairs(pool) do if slot.consumeTime then consuming = true end end
    -- Discard obsolete retirees first; at most six live plus six outgoing frames.
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
      if relayout and not kind then kind = "MOVE" end
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
    relayout = false
    return true
  end
  function view.Hide(_) clear(); root:Hide() end
  function view.SetIndicators(_, values, clock)
    if not Spynon.RotationProgram.IsList(values, 12) then
      lastIndicators, indicatorClock = nil, nil
      if indicators then indicators:Clear() end
      return false
    end
    lastIndicators, indicatorClock = values, clock
    if not options.indicators then
      if indicators then indicators:Clear() end
      return true
    end
    if not indicators and #values == 0 then return end
    indicators = indicators or Spynon.AuraIndicatorsFactory.Create(createFrame, root, clock, skin)
    indicators:SetTypography(options)
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
    lastIndicators = nil
    if indicators then indicators:Clear() end
    gcdTiming = nil
    for _, slot in ipairs(pool) do slot.overlay:Clear() end
    wake(motionActive)
  end
  function view.SetCooldownNumbers(_, enabled)
    for _, slot in ipairs(pool) do slot.overlay:SetNumbers(enabled) end
  end
  function view.SetHotkeys(_, keys)
    lastKeys = keys
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
  function view.GetOriginY(_) return layoutTokens.offsetY end
  function view.SetEditMode(_, callback, mover)
    if not editor and callback == nil then return end
    editor = editor or Spynon.QueueEditorFactory.Create(createFrame, root)
    editor:Set(callback, mover)
    for _, slot in ipairs(pool) do if slot.visual then editor:Update(slot, options) end end
  end
  function view.ApplySettings(_, value)
    if not Spynon.SettingsFactory.Validate(value) then return false end
    relayout = options.count ~= value.count or options.direction ~= value.direction
      or options.mainScale ~= value.mainScale or options.spacing ~= value.spacing
      or options.alignment ~= value.alignment or options.coupled ~= value.coupled
    options = value
    for _, slot in ipairs(pool) do
      slot.overlay:SetTypography(value)
      slot.placeholderType:Apply(value, "labels", 12)
    end
    if indicators then indicators:SetTypography(value) end
    local width, height = dimensions()
    root:SetSize(width, height)
    root:SetScale(value.scale)
    root:ClearAllPoints()
    root:SetPoint("CENTER", parent, "CENTER", value.positionX, layoutTokens.offsetY+value.positionY)
    animator:Configure(value)
    view:SetMotionMode(value.motion)
    view:SetHotkeyStyle(value.keys ~= "off", value.keys ~= "full")
    view:SetCooldownNumbers(value.numbers)
    if lastRecommendations then
      view:SetRecommendations(lastRecommendations)
      if lastKeys then view:SetHotkeys(lastKeys) end
      if overlayAdapter then view:RefreshOverlays(overlayAdapter) end
      if lastIndicators then view:SetIndicators(lastIndicators, indicatorClock) end
    end
    return true
  end
  settings = settings or (explicitSkin and Spynon.SettingsFactory.Create(skin) or Spynon.Settings)
  view:ApplySettings(settings:Get())
  settings:Subscribe(function(value) view:ApplySettings(value) end)
  if motionMode then view:SetMotionMode(motionMode) end
  return view
end
Spynon.QueueFactory = Queue
