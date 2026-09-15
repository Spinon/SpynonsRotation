local _, Spynon = ...
local Editor = {}
function Editor.Create(createFrame, parent)
  local editor, callback, selected, targets = {}, nil, nil, {}
  local mover
  local root = createFrame("Button", nil, parent)
  root:SetAllPoints(parent); root:SetFrameLevel(parent:GetFrameLevel()+10)
  local handle = createFrame("Button", nil, root)
  handle:SetSize(170, 26); handle:SetPoint("BOTTOM", root, "TOP", 0, 30)
  handle:RegisterForDrag("LeftButton")
  local handleFill = handle:CreateTexture(nil, "BACKGROUND")
  handleFill:SetAllPoints(handle); handleFill:SetColorTexture(0.035, 0.22, 0.28, 0.95)
  local caption = handle:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
  caption:SetPoint("CENTER", handle, "CENTER", 0, 0); caption:SetText("Mover conjunto  ↔")
  handle:SetScript("OnDragStart", function() if callback and mover then mover.Start() end end)
  handle:SetScript("OnDragStop", function() if mover then mover.Stop() end end)
  local function outline(frame)
    local edges = {}
    for _, edge in ipairs({ "TOP", "BOTTOM", "LEFT", "RIGHT" }) do
      local texture = frame:CreateTexture(nil, "OVERLAY")
      texture:SetColorTexture(0.2, 0.85, 1, 0.9)
      if edge == "TOP" or edge == "BOTTOM" then
        texture:SetPoint(edge .. "LEFT", frame, edge .. "LEFT", 0, 0)
        texture:SetPoint(edge .. "RIGHT", frame, edge .. "RIGHT", 0, 0)
        texture:SetHeight(2)
      else
        texture:SetPoint("TOP" .. edge, frame, "TOP" .. edge, 0, 0)
        texture:SetPoint("BOTTOM" .. edge, frame, "BOTTOM" .. edge, 0, 0)
        texture:SetWidth(2)
      end
      edges[#edges+1] = texture
    end
    return function(shown)
      for _, texture in ipairs(edges) do if shown then texture:Show() else texture:Hide() end end
    end
  end
  local rootOutline = outline(root)
  local function select(kind)
    if not callback or (kind ~= "queue" and kind ~= "current" and kind ~= "hotkey") then return end
    selected = kind; rootOutline(kind == "queue")
    for _, target in ipairs(targets) do
      target.outline(kind == "current" and target.kind == "current")
      target.keyOutline(kind == "hotkey")
    end
    callback(kind)
  end
  root:SetScript("OnClick", function(_, button) if button == "LeftButton" then select("queue") end end)
  for index = 1, 12 do
    local hit = createFrame("Button", nil, root)
    local key = createFrame("Button", nil, hit)
    hit:SetFrameLevel(root:GetFrameLevel()+1); key:SetFrameLevel(root:GetFrameLevel()+2)
    local fill = key:CreateTexture(nil, "BACKGROUND")
    fill:SetAllPoints(key); fill:SetColorTexture(0.025, 0.12, 0.18, 0.95)
    local name = key:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
    name:SetPoint("CENTER", key, "CENTER", 0, 0); name:SetText("Tecla")
    name:SetTextColor(0.75, 0.95, 1, 1)
    local target = { frame = hit, key = key, outline = outline(hit), keyOutline = outline(key) }
    hit:SetScript("OnClick", function(_, button) if button == "LeftButton" then select(target.kind) end end)
    key:SetScript("OnClick", function(_, button) if button == "LeftButton" then select("hotkey") end end)
    targets[index] = target
    hit:Hide(); key:EnableMouse(false)
  end
  function editor.Clear(_)
    if mover then mover.Cancel() end
    mover = nil; handle:EnableMouse(false); handle:Hide()
    callback, selected = nil, nil
    root:EnableMouse(false); root:Hide()
    for _, target in ipairs(targets) do target.frame:EnableMouse(false); target.key:EnableMouse(false) end
  end
  function editor.Set(_, listener, movement)
    if type(listener) ~= "function" then editor:Clear(); return end
    callback, selected = listener, "queue"
    mover = movement
    handle:EnableMouse(mover ~= nil)
    if mover then handle:Show() else handle:Hide() end
    root:EnableMouse(true); root:Show(); rootOutline(true)
  end
  function editor.Update(_, slot, options)
    local target = targets[slot.index]
    if not callback or not slot.id or slot.retiring then target.frame:Hide(); return end
    target.kind = slot.position == 1 and "current" or "queue"
    target.frame:SetAllPoints(slot.frame); target.frame:EnableMouse(true); target.frame:Show()
    local point = options.keyPosition
    target.key:ClearAllPoints(); target.key:SetPoint(point, slot.icon, point,
      point:find("LEFT", 1, true) and 2 or -2, point:find("BOTTOM", 1, true) and 2 or -2)
    target.key:SetSize(math.min(44, slot.visual.iconWidth-4), 18)
    target.key:EnableMouse(true); target.key:Show()
    target.outline(selected == "current" and target.kind == "current")
    target.keyOutline(selected == "hotkey")
  end
  function editor.GetRoot(_) return root end
  editor:Clear()
  return editor
end
Spynon.QueueEditorFactory = Editor
