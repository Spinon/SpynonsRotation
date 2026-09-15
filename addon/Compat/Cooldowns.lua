local _, Spynon = ...
local Internal, V = Spynon.CompatInternal, Spynon.Contracts.Validation
local Cooldowns = {}
local ITEMS = { item = true, trinket = true, potion = true }
local GLOBAL_COOLDOWN = 61304

function Cooldowns.Create(environment)
  local adapter = {}
  local state = Internal.State.Create(environment)
  local function positive(value) return V.IsPositiveInteger(value) and value <= 9999 end
  local function isSpell(action)
    return Spynon.Contracts.Action.Validate(action) and not ITEMS[action.kind] and V.IsPositiveInteger(action.gameId)
  end
  function adapter.Apply(_, widget, action)
    widget:Clear()
    if not isSpell(action) then return nil end
    local charges = state:ReadCharges(action.gameId)
    local count, path = nil, "C_Spell.GetSpellCooldownDuration"
    if charges.ok and charges.value.hasCharges then
      local value = charges.value
      if positive(value.currentCharges) then count = { kind = "charges", value = value.currentCharges } end
      if value.currentCharges > 0 and value.currentCharges < value.maxCharges then
        path = "C_Spell.GetSpellChargeDuration"
      end
    elseif charges.ok then
      -- Same-ID self aura only; cross-spell/resource mappings require explicit spec metadata.
      local aura = state:ReadAura("player", action.gameId)
      if aura.ok and aura.value.active and positive(aura.value.applications) then
        count = { kind = "stacks", value = aura.value.applications }
      end
    end
    local called, duration
    if path == "C_Spell.GetSpellCooldownDuration" then
      called, duration = Internal.SafeCall.Call(environment, path, action.gameId, true) -- ignore GCD
    else called, duration = Internal.SafeCall.Call(environment, path, action.gameId) end
    if called and state:IsPublic(duration) then
      local kind = type(duration)
      if (kind == "table" or kind == "userdata") and type(widget.SetCooldownFromDurationObject) == "function" then
        -- DurationObject remains opaque: no fields, arithmetic, serialization or rule-engine access.
        local ok = pcall(widget.SetCooldownFromDurationObject, widget, duration, true)
        if not ok then widget:Clear() end
      end
    end
    return count
  end
  function adapter.ApplyGCD(_, widget)
    widget:Hide()
    if type(widget.SetTimerDuration) ~= "function" then return false end
    local status = state:ReadCooldownStatus(GLOBAL_COOLDOWN)
    if not status.ok or status.value.isEnabled ~= true or status.value.isActive ~= true then return false end
    local called, duration = Internal.SafeCall.Call(environment,
      "C_Spell.GetSpellCooldownDuration", GLOBAL_COOLDOWN, false)
    if not called or not state:IsPublic(duration) then return false end
    local kind = type(duration)
    if kind ~= "table" and kind ~= "userdata" then return false end
    -- Native presentation sink only. Never inspect duration or read the bar's value.
    -- Defaults: Immediate interpolation, ElapsedTime direction (both reviewed pins).
    local ok = pcall(widget.SetTimerDuration, widget, duration)
    if not ok then widget:Hide(); return false end
    widget:Show()
    return true
  end
  function adapter.ReadGCD(_)
    local value = state:ReadCooldown(GLOBAL_COOLDOWN)
    if not value.ok or not value.value.isEnabled or value.value.modRate ~= 1 then return nil end
    local cooldown = value.value
    local finish = cooldown.startTime + cooldown.duration
    if cooldown.duration <= 0 or not V.IsFiniteNumber(finish) then return nil end
    return { start = cooldown.startTime, duration = cooldown.duration, finish = finish }
  end
  function adapter.ApplyDemo(_, widget, start, duration)
    widget:Clear()
    -- Explicit synthetic input, used only by the isolated out-of-combat demo view.
    if not state:IsPublic(start) or not state:IsPublic(duration)
      or not V.IsFiniteNumber(start) or start < 0 or not V.IsFiniteNumber(duration) or duration <= 0
    then return false end
    local ok = pcall(widget.SetCooldown, widget, start, duration, 1)
    if not ok then widget:Clear() end
    return ok
  end
  function adapter.GCDProgress(_, timing)
    local clock = state:ReadClock()
    if not clock.ok or clock.value < timing.start or clock.value >= timing.finish then return nil end
    return (clock.value - timing.start) / timing.duration
  end
  return adapter
end
Internal.Cooldowns = Cooldowns
