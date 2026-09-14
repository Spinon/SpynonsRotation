local _, Spynon = ...
local Controller = {}
local names = { global = "Todos os personagens", character = "Este personagem", spec = "Esta especialização" }
function Controller.Create(compat, createFrame, settings)
  local controller, store, started, revision = {}, nil, false, 0
  local context, listeners = {}, {}
  local function safeToEdit()
    local combat = compat.State:ReadCombat()
    return combat.ok and combat.capability == "ADDON_AVAILABLE" and combat.value == false
  end
  function controller.Refresh(_)
    if not store then return end
    context = compat.Profiles:ReadIdentity()
    revision = revision + 1
    settings:Replace(store:Resolve(context))
    for listener in pairs(listeners) do listener() end
  end
  local function action(method, ...)
    if not store or not safeToEdit() then
      compat.Console:Write("Alterações de perfil permitidas somente fora de combate observável.")
      return false
    end
    -- Re-read identity at the write boundary; never write through a stale spec or character.
    local fresh = compat.Profiles:ReadIdentity()
    if fresh.character ~= context.character or fresh.specId ~= context.specId then
      controller:Refresh(); return false
    end
    local ok = method(store, ...)
    if ok then controller:Refresh()
    else compat.Console:Write("Não foi possível alterar este perfil; identidade ou dados indisponíveis.") end
    return ok
  end
  function controller.Select(_, scope) return action(store and store.Select, scope, context) end
  function controller.Copy(_, source) return action(store and store.Copy, source, context) end
  function controller.Reset(_) return action(store and store.Reset, context) end
  function controller.Capture(_)
    if not store then return nil end
    local fresh = compat.Profiles:ReadIdentity()
    if fresh.character ~= context.character or fresh.specId ~= context.specId then controller:Refresh(); return nil end
    return store:Capture(context)
  end
  function controller.Apply(_, expected, changes) return action(store and store.Apply, expected, changes, context) end
  function controller.Restore(_, target, expected) return action(store and store.Restore, target, expected, context) end
  function controller.GetStatus(_)
    local scope = store and store:GetScope(context) or "global"
    local writable = store and store:CanUse(scope, context) or false
    return { scope = scope, label = names[scope], writable = writable, revision = revision,
      message = writable and ("Salvando em: " .. names[scope])
        or "Perfil indisponível para edição; dados preservados." }
  end
  function controller.Subscribe(_, listener)
    listeners[listener] = true; return function() listeners[listener] = nil end
  end
  function controller.Start(_)
    if started then return end
    started = true
    store = Spynon.ProfileStoreFactory.Create(compat.Profiles:GetDatabase())
    controller:Refresh()
    settings:SetWriter(function(key, value) return action(store.Set, key, value, context) end)
    local events = createFrame("Frame")
    for _, event in ipairs({ "PLAYER_ENTERING_WORLD", "PLAYER_SPECIALIZATION_CHANGED", "PLAYER_REGEN_ENABLED",
      "ADDON_RESTRICTION_STATE_CHANGED" }) do events:RegisterEvent(event) end
    events:SetScript("OnEvent", function() controller:Refresh() end)
  end
  return controller
end
Spynon.ProfileControllerFactory = Controller
Spynon.Profiles = Controller.Create(Spynon.Compat, CreateFrame, Spynon.Settings)
