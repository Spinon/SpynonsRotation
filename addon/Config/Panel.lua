local _, Spynon = ...
local Panel = {}
-- Neutral local UI; no replacement artwork or claim of visual approval.
local sections = {
  { id = "queue", label = "Fila", detail = "Quantidade, tamanho, direção e movimento." },
  { id = "information", label = "Informações", detail = "Teclas, tempo restante e sinais relevantes." },
}
local fields = {
  queue = {
    { key = "count", label = "Recomendações",
      options = { {1,"1"}, {2,"2"}, {3,"3"}, {4,"4"}, {5,"5"}, {6,"6"} } },
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
  current = {
    { key = "mainScale", label = "Tamanho do ícone principal",
      options = { {0.85,"Menor"}, {1,"Padrão"}, {1.15,"Maior"} } },
  },
  hotkey = {
    { key = "keys", label = "Exibição das teclas",
      options = { {"compact","Curtas"}, {"full","Completas"}, {"off","Ocultas"} } },
    { key = "keyPosition", label = "Posição no ícone",
      options = { {"TOPLEFT","↖"}, {"TOPRIGHT","↗"}, {"BOTTOMLEFT","↙"}, {"BOTTOMRIGHT","↘"} } },
  },
}
fields.layout = { fields.queue[1], fields.queue[3],
  { key = "coupled", label = "Encaixe", options = { {false,"Separado"}, {true,"Acoplado"} } },
  { key = "spacing", label = "Espaçamento", options = { {4,"Próximo"}, {8,"Padrão"}, {16,"Amplo"} } },
  { key = "alignment", label = "Alinhamento", options = { {"START","Início"}, {"CENTER","Centro"}, {"END","Fim"} } },
}
local animations = {
  {id="move", label="Movimento", detail="Uma ação muda de posição na fila.", times={100,160,220}},
  {id="enter", label="Entrada", detail="Uma ação passa a participar da fila.", times={120,180,260}},
  {id="exit", label="Saída", detail="Uma ação deixa de ser relevante.", times={80,120,180}},
  {id="promote", label="Mudança de prioridade", detail="Uma ação sobe para o ícone principal.", times={160,220,280}},
  {id="consume", label="Ação utilizada", detail="Feedback de uma habilidade confirmada.", times={60,100,140}},
}
local resetGroups = {
  current = {"mainScale"}, hotkey = {"keys", "keyPosition"},
  layout = {"count", "direction", "coupled", "spacing", "alignment"},
  position = {"positionX", "positionY"},
  queue = {"count", "scale", "direction", "motion", "mainScale", "spacing", "alignment",
    "coupled", "positionX", "positionY"},
  information = {"keys", "keyPosition", "numbers", "indicators"},
}
for _, animation in ipairs(animations) do
  local id, options = "advanced_" .. animation.id, {}
  for _, duration in ipairs(animation.times) do options[#options+1] = {duration, duration .. " ms"} end
  fields[id] = {{key=animation.id .. "Duration", label="Duração", options=options}}
  resetGroups[id] = {animation.id .. "Duration"}
  if animation.id ~= "consume" then
    fields[id][2] = {key=animation.id .. "Curve", label="Ritmo do movimento", options={
      {"CUBIC", "Desacelera"}, {"LINEAR", "Constante"}, {"SMOOTH", "Suave nas pontas"}}}
    resetGroups[id][2] = animation.id .. "Curve"
  end
  for _, key in ipairs(resetGroups[id]) do resetGroups.queue[#resetGroups.queue+1] = key end
end
local function resetKeys(section)
  local keys = {}
  if section == "profiles" then
    for key in pairs(Spynon.SettingsFactory.Defaults()) do keys[key] = true end
  else for _, key in ipairs(resetGroups[section] or {}) do keys[key] = true end end
  return keys
end
local textRoles = {{"hotkey", "Teclas"}, {"cooldown", "Tempo restante"},
  {"stacks", "Cargas e acúmulos"}, {"labels", "Rótulos"}}
local textFields = {
  {suffix="Font", label="Fonte", options={{"WOW","WoW"}, {"NUMBERS","Números WoW"}}},
  {suffix="Size", label="Tamanho base", options={{0.85,"Menor"}, {1,"Padrão"}, {1.15,"Maior"}}},
  {suffix="Outline", label="Contorno", options={{"NONE","Sem"}, {"OUTLINE","Fino"}, {"THICKOUTLINE","Forte"}}},
  {suffix="Shadow", label="Sombra", options={{"NONE","Sem"}, {"SOFT","Suave"}}},
}
for _, role in ipairs({"text", "hotkey", "cooldown", "stacks", "labels"}) do
  local page = "type_" .. role
  fields[page], resetGroups[page] = {}, {}
  for _, source in ipairs(textFields) do
    local field = {key=role .. source.suffix, label=source.label, options={}}
    if role ~= "text" then field.options[1] = {"INHERIT", "Global"} end
    for _, option in ipairs(source.options) do field.options[#field.options+1] = option end
    fields[page][#fields[page]+1] = field
    resetGroups[page][#resetGroups[page]+1] = field.key
    resetGroups.information[#resetGroups.information+1] = field.key
  end
end
function Panel.Create(createFrame, parent, settings, onChange, onClose, profiles, onEdit, history)
  local panel, selected, buttons, pages = {}, nil, {}, {}
  local navigation, profileButtons, pending = {}, {}, nil
  for _, section in ipairs(sections) do navigation[#navigation+1] = section end
  if profiles then navigation[#navigation+1] = { id = "profiles", label = "Perfis",
    detail = "Escolha onde salvar; copie ou restaure preferências." } end
  local root = createFrame("Frame", nil, parent)
  root:SetSize(510, history and 560 or 450); root:SetPoint("TOPLEFT", parent, "TOPLEFT", 24, -100)
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
    caption:ClearAllPoints(); caption:SetPoint("CENTER", value, "CENTER", 0, 0)
    caption:SetJustifyH("CENTER"); caption:SetWordWrap(false)
    value:SetScript("OnClick", callback)
    value:SetScript("OnEnter", function() value:SetAlpha(0.8) end)
    value:SetScript("OnLeave", function() value:SetAlpha(1) end)
    return { frame = value, fill = fill, caption = caption }
  end
  local title = label(root, "Spynon's Rotation", 20, 18, 350)
  local titleFont = title:GetFont(); title:SetFont(titleFont, 18, "")
  local subtitle = label(root, "Prévia simulada • mudanças imediatas", 20, 50, 320)
  subtitle:SetTextColor(0.62, 0.73, 0.8, 1)
  for _, y in ipairs({76, 412, 482}) do
    local divider = root:CreateTexture(nil, "BORDER")
    divider:SetPoint("TOPLEFT", root, "TOPLEFT", 20, -y); divider:SetSize(470, 1)
    divider:SetColorTexture(0.15, 0.24, 0.3, 0.6)
  end
  button(root, "Fechar", 404, 12, 86, 28, function() panel:Hide() end)
  if onEdit then button(root, "Editar HUD", 350, 44, 140, 30, onEdit) end
  local intro = createFrame("Frame", nil, root)
  intro:SetAllPoints(root)
  label(intro, "O que você quer ajustar?", 20, 88, 470)
  local pageSections = {}
  for _, section in ipairs(navigation) do pageSections[#pageSections+1] = section end
  for _, section in ipairs({ { id = "current", label = "Ícone principal" }, { id = "hotkey", label = "Teclas" },
    { id = "layout", label = "Organização da fila" }, {id="position", label="Posição do conjunto"} }) do
    pageSections[#pageSections+1] = section
  end
  pageSections[#pageSections+1] = {id="animations", label="Animações", back="queue", backLabel="< Fila"}
  pageSections[#pageSections+1] = {id="type_text", label="Textos • Global",
    back="information", backLabel="< Informações"}
  pageSections[#pageSections+1] = {id="typography_roles", label="Textos por elemento",
    back="type_text", backLabel="< Global"}
  for _, role in ipairs(textRoles) do
    pageSections[#pageSections+1] = {id="type_" .. role[1], label=role[2],
      back="typography_roles", backLabel="< Elementos"}
  end
  for _, animation in ipairs(animations) do
    pageSections[#pageSections+1] = {id="motion_" .. animation.id, label=animation.label,
      back="animations", backLabel="< Animações"}
    pageSections[#pageSections+1] = {id="advanced_" .. animation.id, label=animation.label .. " • Avançado",
      back="motion_" .. animation.id, backLabel="< Voltar"}
  end
  for index, section in ipairs(pageSections) do
    if index <= #navigation then
      button(intro, section.label, 20, 125 + (index-1)*86, 470, 38, function() panel:Select(section.id) end)
      label(intro, section.detail, 28, 168 + (index-1)*86, 450)
    end
    local page = createFrame("Frame", nil, root)
    page:SetAllPoints(root); pages[section.id] = page
    button(page, section.backLabel or "< Assuntos", 20, 80, 116, 34, function() panel:Select(section.back) end)
    label(page, section.label, 154, 90, 320)
    for row, field in ipairs(fields[section.id] or {}) do
      local y = 134 + (row-1)*48
      label(page, field.label, 20, y, 470)
      local width = math.min(140, (470 - (#field.options-1)*6) / #field.options)
      for choice, option in ipairs(field.options) do
        local control = button(page, option[2], 20+(choice-1)*(width+6), y+18, width, 28,
          function() onChange(field.key, option[1]) end)
        control.key, control.value, control.text = field.key, option[1], option[2]
        buttons[#buttons+1] = control
      end
    end
    page:Hide()
  end
  button(pages.queue, "Organização e encaixe", 20, 330, 225, 32, function() panel:Select("layout") end)
  if onEdit then
    button(pages.queue, "Mover conjunto", 255, 330, 235, 32, function()
      onEdit(); panel:Select("position")
    end)
    button(pages.position, "Ativar alça de movimento", 20, 220, 260, 32, function()
      onEdit(); panel:Select("position")
    end)
  end
  label(pages.position, "Arraste a alça Mover conjunto acima do HUD.\nA posição fica salva no perfil atual.",
    20, 140, 470)
  label(pages.position, "Desfazer recupera a posição anterior.\nRestaurar seção volta à posição herdada do perfil.",
    20, 275, 470)
  label(pages.current, "Ícone quadrado • informações na coluna ao lado.\n"
    .. "O tamanho da fila é ajustado separadamente em Fila.", 20, 210, 470)
  button(pages.queue, "Personalizar animações", 20, 378, 225, 32, function() panel:Select("animations") end)
  button(pages.information, "Textos e legibilidade", 20, 330, 470, 34, function() panel:Select("type_text") end)
  button(pages.type_text, "Por elemento", 20, 378, 225, 32, function() panel:Select("typography_roles") end)
  for index, role in ipairs(textRoles) do
    button(pages.typography_roles, role[2], 20, 134+(index-1)*52, 470, 38,
      function() panel:Select("type_" .. role[1]) end)
  end
  for index, animation in ipairs(animations) do
    button(pages.animations, animation.label, 20, 130+(index-1)*47, 470, 38,
      function() panel:Select("motion_" .. animation.id) end)
    local page = pages["motion_" .. animation.id]
    label(page, animation.detail, 20, 145, 470)
    label(page, "O padrão já está pronto para usar. Personalize somente se quiser.", 20, 185, 470)
    button(page, "Avançado", 20, 240, 470, 38, function() panel:Select("advanced_" .. animation.id) end)
    label(pages["advanced_" .. animation.id],
      "Reduzido limita os efeitos; Sem movimento sempre prevalece.", 20, 290, 470)
  end
  local footer = label(root, "Ajustes desta sessão.", 20, history and 523 or 413, 470)
  local undo, redo, experiment, keep, cancel, resetSelection, previewLabel
  if history then
    undo = button(root, "Desfazer", 20, 488, 114, 30, function() history:Undo() end)
    redo = button(root, "Refazer", 140, 488, 114, 30, function() history:Redo() end)
    experiment = button(root, "Experimentar", 20, 418, 170, 32, function()
      pending = nil; history:Cancel(); history:Begin(selected, "explore")
    end)
    keep = button(root, "Manter mudanças", 20, 418, 220, 32, function() history:Commit() end)
    cancel = button(root, "Cancelar prévia", 250, 418, 240, 32, function() history:Cancel() end)
    resetSelection = button(root, "Restaurar seção", 20, 378, 470, 32, function()
      pending = nil; history:PreviewReset(resetKeys(selected))
    end)
    previewLabel = label(root, "", 20, 457, 470)
  end
  if profiles then
    local page = pages.profiles
    label(page, "Salvar ajustes para", 20, 135, 470)
    label(page, "Copiar para o perfil selecionado", 20, 220, 470)
    label(page, "Restaurar remove somente os ajustes deste perfil.\nValores herdados e outros perfis permanecem.",
      20, 330, 470)
    local function confirm(control, action, source)
      local status = profiles:GetStatus()
      if pending and pending.control == control and pending.revision == status.revision then
        pending = nil
        if action == "copy" then profiles:Copy(source) else profiles:Reset() end
      else pending = { control = control, revision = status.revision } end
      panel:Refresh()
    end
    for index, scope in ipairs({ {"global","Todos"}, {"character","Personagem"}, {"spec","Especialização"} }) do
      local choice = button(page, scope[2], 20+(index-1)*160, 156, 150, 38, function()
        pending = nil; profiles:Select(scope[1]); panel:Refresh()
      end)
      choice.scope, choice.text = scope[1], scope[2]; profileButtons[#profileButtons+1] = choice
      local source
      source = button(page, "De: " .. scope[2], 20+(index-1)*160, 242, 150, 40,
        function() confirm(source, "copy", scope[1]) end)
      source.text = "De: " .. scope[2]; profileButtons[#profileButtons+1] = source
    end
    local reset
    reset = button(page, "Restaurar este perfil", 20, 286, 470, 34, function()
      if history then pending = nil; history:PreviewReset(resetKeys("profiles"))
      else confirm(reset, "reset") end
    end)
    reset.text = "Restaurar este perfil"; profileButtons[#profileButtons+1] = reset
    profiles:Subscribe(function() pending = nil; panel:Refresh() end)
  end
  function panel.Refresh(_)
    local value = settings:Get()
    for _, control in ipairs(buttons) do
      local chosen = value[control.key] == control.value
      local enabled = control.key ~= "spacing" or not value.coupled
      control.frame:EnableMouse(enabled); control.frame:SetAlpha(enabled and 1 or 0.4)
      control.caption:SetText((chosen and "• " or "") .. control.text)
      control.fill:SetColorTexture(chosen and 0.06 or 0.08, chosen and 0.30 or 0.13, chosen and 0.22 or 0.20, 1)
    end
    if profiles then
      local status = profiles:GetStatus(); footer:SetText(status.message)
      for _, control in ipairs(profileButtons) do
        local chosen = control.scope == status.scope
        control.caption:SetText(pending and pending.control == control and "Confirmar" or
          ((chosen and "• " or "") .. control.text))
        control.fill:SetColorTexture(chosen and 0.06 or 0.08, chosen and 0.30 or 0.13, chosen and 0.22 or 0.20, 1)
      end
    end
    if history then
      local status = history:GetStatus()
      local canUndo, canRedo = status.undo > 0 and not status.active, status.redo > 0 and not status.active
      undo.frame:EnableMouse(canUndo); undo.frame:SetAlpha(canUndo and 1 or 0.4)
      redo.frame:EnableMouse(canRedo); redo.frame:SetAlpha(canRedo and 1 or 0.4)
      local contextual = selected ~= nil and resetGroups[selected] ~= nil
      local function show(control, enabled) if enabled then control.frame:Show() else control.frame:Hide() end end
      show(experiment, contextual and not status.active)
      show(keep, status.mode == "explore" or status.mode == "reset")
      show(cancel, status.active)
      show(resetSelection, contextual and not status.active)
      resetSelection.frame:ClearAllPoints()
      local splitReset = selected == "queue" or selected == "type_text"
      resetSelection.frame:SetPoint("TOPLEFT", root, "TOPLEFT", splitReset and 255 or 20, -378)
      resetSelection.frame:SetWidth(splitReset and 235 or 200)
      resetSelection.caption:SetWidth(splitReset and 219 or 184)
      resetSelection.fill:SetColorTexture(0.045, 0.075, 0.10, 1)
      resetSelection.caption:SetTextColor(0.67, 0.75, 0.81, 1)
      resetSelection.caption:SetText((selected == "current" or selected == "hotkey" or selected == "layout")
        and "Restaurar elemento" or "Restaurar seção")
      keep.caption:SetText(status.mode == "reset" and "Confirmar restauração" or "Manter mudanças")
      previewLabel:SetText(status.mode == "reset" and "Prévia de restauração • ainda não salva"
        or (status.mode == "explore" and "Experimentando • nada salvo até manter" or ""))
    end
  end
  function panel.Select(_, section)
    if section ~= nil and not pages[section] then return false end
    if history then history:Cancel() end
    pending = nil
    selected = section
    if section then intro:Hide() else intro:Show() end
    for id, page in pairs(pages) do if id == section then page:Show() else page:Hide() end end
    panel:Refresh()
    return true
  end
  function panel.Show(_) panel:Refresh(); root:SetPropagateKeyboardInput(true); root:Show() end
  function panel.SetEditing(_, enabled)
    subtitle:SetText(enabled and "Clique no HUD • prévia parada" or "Prévia simulada • mudanças imediatas")
  end
  function panel.SelectElement(_, kind)
    local sectionsByElement = { current = "current", hotkey = "hotkey", queue = "layout", position = "position" }
    if not sectionsByElement[kind] then return false end
    return panel:Select(sectionsByElement[kind])
  end
  function panel.Hide(_) pending = nil; if history then history:Cancel() end; root:Hide() end
  function panel.GetSection(_) return selected end
  function panel.GetRoot(_) return root end
  root:SetScript("OnKeyDown", function(_, key)
    root:SetPropagateKeyboardInput(key ~= "ESCAPE")
    if key == "ESCAPE" then panel:Hide() end
  end)
  root:Hide()
  root:SetScript("OnHide", function() if onClose then onClose() end end)
  settings:Subscribe(function() panel:Refresh() end)
  if history then history:Subscribe(function() panel:Refresh() end) end
  panel:Select(nil)
  return panel
end
Spynon.ConfigPanelFactory = Panel
