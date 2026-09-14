local _, Spynon = ...
local Panel = {}
-- Neutral local UI; no replacement artwork or claim of visual approval.
local sections = {
  { id = "queue", label = "Fila", detail = "Quantidade, tamanho, direção e movimento." },
  { id = "information", label = "Informações", detail = "Teclas, tempo restante e sinais relevantes." },
}
local fields = {
  queue = {
    { key = "count", label = "Recomendações", options = { {1,"1"}, {2,"2"}, {3,"3"}, {4,"4"} } },
    { key = "scale", label = "Tamanho", options = { {0.75,"Pequeno"}, {1,"Padrão"}, {1.25,"Grande"} } },
    { key = "direction", label = "Direção",
      options = { {"STACKED","Abaixo"}, {"RIGHT","Direita"}, {"LEFT","Esquerda"} } },
    { key = "motion", label = "Movimento", options = { {"NORMAL","Suave"}, {"REDUCED","Reduzido"}, {"OFF","Sem"} } },
  },
  information = {
    { key = "keys", label = "Teclas", options = { {"compact","Curtas"}, {"full","Completas"}, {"off","Ocultas"} } },
    { key = "numbers", label = "Tempo restante", options = { {true,"Mostrar"}, {false,"Ocultar"} } },
    { key = "indicators", label = "Buffs e debuffs relevantes", options = { {true,"Mostrar"}, {false,"Ocultar"} } },
  },
}
function Panel.Create(createFrame, parent, settings, onChange, onClose)
  local panel, selected, buttons, pages = {}, nil, {}, {}
  local root = createFrame("Frame", nil, parent)
  root:SetSize(510, 450); root:SetPoint("TOPLEFT", parent, "TOPLEFT", 24, -100)
  root:SetFrameStrata("DIALOG"); root:EnableMouse(true); root:EnableKeyboard(true)
  root:SetPropagateKeyboardInput(true)
  local background = root:CreateTexture(nil, "BACKGROUND")
  background:SetAllPoints(root); background:SetColorTexture(0.025, 0.045, 0.075, 0.97)
  local function label(frame, text, x, y, width)
    local value = frame:CreateFontString(nil, "OVERLAY", "GameFontNormal")
    value:SetPoint("TOPLEFT", frame, "TOPLEFT", x, -y); value:SetWidth(width)
    value:SetText(text); value:SetJustifyH("LEFT"); value:SetTextColor(0.92, 0.96, 1, 1)
    return value
  end
  local function button(frame, text, x, y, width, height, callback)
    local value = createFrame("Button", nil, frame)
    value:SetPoint("TOPLEFT", frame, "TOPLEFT", x, -y); value:SetSize(width, height)
    value:EnableMouse(true)
    local fill = value:CreateTexture(nil, "BACKGROUND")
    fill:SetAllPoints(value); fill:SetColorTexture(0.08, 0.13, 0.20, 1)
    local caption = label(value, text, 8, 10, width - 16)
    value:SetScript("OnClick", callback)
    value:SetScript("OnEnter", function() value:SetAlpha(0.8) end)
    value:SetScript("OnLeave", function() value:SetAlpha(1) end)
    return { frame = value, fill = fill, caption = caption }
  end
  label(root, "Spynon's Rotation", 20, 18, 350)
  label(root, "Prévia simulada • mudanças imediatas", 20, 44, 460)
  button(root, "Fechar", 404, 12, 86, 34, function() panel:Hide() end)
  local intro = createFrame("Frame", nil, root)
  intro:SetAllPoints(root)
  label(intro, "O que você quer ajustar?", 20, 88, 470)
  for index, section in ipairs(sections) do
    button(intro, section.label, 20, 125 + (index-1)*86, 470, 38, function() panel:Select(section.id) end)
    label(intro, section.detail, 28, 168 + (index-1)*86, 450)
    local page = createFrame("Frame", nil, root)
    page:SetAllPoints(root); pages[section.id] = page
    button(page, "< Assuntos", 20, 80, 116, 34, function() panel:Select(nil) end)
    label(page, section.label, 154, 90, 320)
    for row, field in ipairs(fields[section.id]) do
      local y = 134 + (row-1)*62
      label(page, field.label, 20, y, 470)
      local width = (470 - (#field.options-1)*6) / #field.options
      for choice, option in ipairs(field.options) do
        local control = button(page, option[2], 20+(choice-1)*(width+6), y+19, width, 34,
          function() onChange(field.key, option[1]) end)
        control.key, control.value, control.text = field.key, option[1], option[2]
        buttons[#buttons+1] = control
      end
    end
    page:Hide()
  end
  label(root, "Por enquanto, ajustes desta sessão. Perfis vêm na próxima etapa.", 20, 413, 470)
  function panel.Refresh(_)
    local value = settings:Get()
    for _, control in ipairs(buttons) do
      local chosen = value[control.key] == control.value
      control.caption:SetText((chosen and "• " or "") .. control.text)
      control.fill:SetColorTexture(chosen and 0.06 or 0.08, chosen and 0.30 or 0.13, chosen and 0.22 or 0.20, 1)
    end
  end
  function panel.Select(_, section)
    if section ~= nil and not pages[section] then return false end
    selected = section
    if section then intro:Hide() else intro:Show() end
    for id, page in pairs(pages) do if id == section then page:Show() else page:Hide() end end
    return true
  end
  function panel.Show(_) panel:Refresh(); root:SetPropagateKeyboardInput(true); root:Show() end
  function panel.Hide(_) root:Hide() end
  function panel.GetSection(_) return selected end
  function panel.GetRoot(_) return root end
  root:SetScript("OnKeyDown", function(_, key)
    root:SetPropagateKeyboardInput(key ~= "ESCAPE")
    if key == "ESCAPE" then panel:Hide() end
  end)
  root:Hide()
  root:SetScript("OnHide", function() if onClose then onClose() end end)
  settings:Subscribe(function() panel:Refresh() end)
  panel:Select(nil)
  return panel
end
Spynon.ConfigPanelFactory = Panel
