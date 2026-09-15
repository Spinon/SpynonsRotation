return function()
  local objects = {}
  local methods = {}
  local function object(kind, parent)
    local value = setmetatable({ kind = kind, parent = parent, visible = true }, { __index = methods })
    objects[#objects + 1] = value
    return value
  end
  function methods:SetSize(width, height) self.width, self.height = width, height end
  function methods:SetWidth(width) self.width = width end
  function methods:SetHeight(height) self.height = height end
  function methods:SetOrientation(value) self.orientation = value end
  function methods:SetMinMaxValues(low, high) self.minimum, self.maximum = low, high end
  function methods:SetValueStep(value) self.valueStep = value end
  function methods:SetObeyStepOnDrag(value) self.obeyStep = value end
  function methods:SetThumbTexture(value) self.thumb = value end
  function methods:SetValue(value)
    local previous = self.value; self.value = value
    if previous ~= value and self.scripts and self.scripts.OnValueChanged then self.scripts.OnValueChanged(self, value) end
  end
  function methods:SetScale(value) self.scale = value end
  function methods:SetMovable(value) self.movable = value end
  function methods:SetClampedToScreen(value) self.clamped = value end
  function methods:SetUserPlaced(value) self.userPlaced = value end
  function methods:RegisterForDrag(...) self.dragButtons = {...} end
  function methods:StartMoving() self.moving = true end
  function methods:StopMovingOrSizing() self.moving = false end
  function methods:GetCenter() return self.centerX or 0, self.centerY or 0 end
  function methods:GetEffectiveScale() return self.effectiveScale or self.scale or 1 end
  function methods:EnableKeyboard(value) self.keyboard = value end
  function methods:SetPropagateKeyboardInput(value) self.propagateKeyboardInput = value end
  function methods:SetVertexColor(...) self.vertexColor = { ... } end
  function methods:SetDesaturated(value) self.desaturated = value end
  function methods:SetAlpha(alpha) self.alpha = alpha end
  function methods:SetPoint(...) self.point = { ... } end
  function methods:ClearAllPoints() self.point = nil end
  function methods:SetAllPoints(target) self.allPoints = target end
  function methods:SetFrameStrata(strata) self.strata = strata end
  function methods:GetFrameLevel() return self.frameLevel or 1 end
  function methods:SetFrameLevel(level) self.frameLevel = level end
  function methods:Clear() self.durationObject, self.cooldownStart, self.cooldownDuration = nil, nil, nil end
  function methods:SetCooldown(start, duration, modRate)
    self.cooldownStart, self.cooldownDuration, self.cooldownRate = start, duration, modRate
  end
  function methods:SetCooldownFromDurationObject(duration, clearIfZero)
    self.durationObject, self.clearIfZero = duration, clearIfZero
  end
  function methods:SetDrawSwipe(value) self.drawSwipe = value end
  function methods:SetDrawEdge(value) self.drawEdge = value end
  function methods:SetDrawBling(value) self.drawBling = value end
  function methods:SetReverse(value) self.reverse = value end
  function methods:SetSwipeColor(...) self.swipeColor = { ... } end
  function methods:SetHideCountdownNumbers(value) self.hideNumbers = value end
  function methods:SetCountdownFont(value) self.countdownFont = value end
  function methods:SetShadowColor(...) self.shadowColor = {...} end
  function methods:SetShadowOffset(...) self.shadowOffset = {...} end
  function methods:EnableMouse(enabled) self.mouseEnabled = enabled end
  function methods:Show() self.visible = true end
  function methods:Hide()
    local wasVisible = self.visible
    self.visible = false
    if wasVisible and self.scripts and self.scripts.OnHide then self.scripts.OnHide(self) end
  end
  function methods:SetTexture(texture, wrapH, wrapV, filter)
    self.texture, self.wrapH, self.wrapV, self.filter = texture, wrapH, wrapV, filter
    return texture ~= "missing"
  end
  function methods:SetTexCoord(...) self.uv = { ... } end
  function methods:SetColorTexture(...) self.color = { ... }; self.texture = nil end
  function methods:SetTextColor(...) self.textColor = { ... } end
  function methods:SetText(text) self.text = text end
  function methods:GetFont() return self.font or "Fonts\\FRIZQT__.TTF", self.fontSize or 12, self.fontFlags end
  function methods:SetFont(font, size, flags) self.font, self.fontSize, self.fontFlags = font, size, flags end
  function methods:SetJustifyH(value) self.justifyH = value end
  function methods:SetWordWrap(value) self.wordWrap = value end
  function methods:GetStringWidth() return #(self.text or "") * (self.fontSize or 12) * 0.55 end
  function methods:CreateTexture(_, layer) local child = object("Texture", self); child.layer = layer; return child end
  function methods:CreateFontString(_, layer, template)
    local child = object("FontString", self); child.layer, child.template = layer, template; return child
  end
  function methods:RegisterEvent(event) self.events = self.events or {}; self.events[event] = true end
  function methods:SetScript(event, callback) self.scripts = self.scripts or {}; self.scripts[event] = callback end
  return function(kind, _, parent) return object(kind, parent) end, objects
end
