local _, Spynon = ...

local Internal = Spynon.CompatInternal
local SafeCall = Internal.SafeCall
local Result = Internal.Result
local Validation = Spynon.Contracts.Validation
local State = {}

function State.Create(environment)
  local adapter = {}

  -- Fail closed: even an apparently ordinary scalar needs the live secret guard.
  function adapter.IsPublic(_, value)
    local ok, secret = SafeCall.Call(environment, "issecretvalue", value)
    return ok == true and secret == false
  end

  function adapter.ReadPublicField(_, object, key)
    if not adapter:IsPublic(object) then return nil, Result.Failure(Result.Code.SECRET_RESTRICTED) end
    if type(object) ~= "table" then return nil, Result.Failure(Result.Code.INVALID_DATA) end
    -- Indexing can itself be denied; pcall is containment, never permission to use a secret.
    local ok, value = pcall(function() return object[key] end)
    if not ok then return nil, Result.Failure(Result.Code.CALL_FAILED) end
    if not adapter:IsPublic(value) then return nil, Result.Failure(Result.Code.SECRET_RESTRICTED) end
    return value
  end

  local function read(path, ...)
    local ok, value = SafeCall.Call(environment, path, ...)
    if not ok then
      return nil, Result.Failure(value)
    end
    if not adapter:IsPublic(value) then
      return nil, Result.Failure(Result.Code.SECRET_RESTRICTED)
    end
    return value
  end

  local function allowed(path, ...)
    local restricted, failure = read(path, ...)
    if failure then
      return failure
    end
    if restricted == true then
      return Result.Failure(Result.Code.SECRET_RESTRICTED)
    end
    if restricted ~= false then
      return Result.Failure(Result.Code.INVALID_DATA)
    end
  end

  local function number(value)
    return Validation.IsFiniteNumber(value) and value >= 0
  end

  local function fields(value, schema)
    if type(value) ~= "table" then
      return nil, Result.Failure(Result.Code.INVALID_DATA)
    end
    local normalized = {}
    for _, field in ipairs(schema) do
      local item, failure = adapter:ReadPublicField(value, field[1])
      if failure then return nil, failure end
      if not field[2](item) then
        return nil, Result.Failure(Result.Code.INVALID_DATA)
      end
      normalized[field[1]] = item
    end
    return normalized
  end

  function adapter.ReadClock(_)
    local value, failure = read("GetTime")
    if failure then return failure end
    if not number(value) then return Result.Failure(Result.Code.INVALID_DATA) end
    return Result.Success(value)
  end

  function adapter.ReadCombat(_)
    local value, failure = read("UnitAffectingCombat", "player")
    if failure then return failure end
    if type(value) ~= "boolean" then return Result.Failure(Result.Code.INVALID_DATA) end
    return Result.Success(value)
  end

  function adapter.ReadPower(_, powerType)
    if not Validation.IsNonNegativeInteger(powerType) then
      return Result.Failure(Result.Code.INVALID_ARGUMENT)
    end
    local failure = allowed("C_Secrets.ShouldUnitPowerBeSecret", "player", powerType)
      or allowed("C_Secrets.ShouldUnitPowerMaxBeSecret", "player", powerType)
    if failure then return failure end
    local current, currentError = read("UnitPower", "player", powerType)
    if currentError then return currentError end
    local maximum, maxError = read("UnitPowerMax", "player", powerType)
    if maxError then return maxError end
    if not number(current) or not number(maximum) or current > maximum then
      return Result.Failure(Result.Code.INVALID_DATA)
    end
    return Result.Success({ current = current, maximum = maximum })
  end

  function adapter.ReadAura(_, unit, spellId)
    if (unit ~= "player" and unit ~= "target") or not Validation.IsPositiveInteger(spellId) then
      return Result.Failure(Result.Code.INVALID_ARGUMENT)
    end
    local failure = allowed("C_Secrets.ShouldSpellAuraBeSecret", spellId)
    if failure then return failure end
    local exists, existsError = read("UnitExists", unit)
    if existsError then return existsError end
    local visible, visibleError = read("UnitIsVisible", unit)
    if visibleError then return visibleError end
    if exists ~= true or visible ~= true then return Result.Failure(Result.Code.NO_DATA) end
    local value, auraError = read("C_UnitAuras.GetUnitAuraBySpellID", unit, spellId)
    if auraError then return auraError end
    if value == nil then
      return Result.Success({ active = false, applications = 0, duration = 0, expirationTime = 0, unit = unit })
    end
    local normalized, fieldError = fields(value, {
      { "applications", Validation.IsNonNegativeInteger }, { "duration", number }, { "expirationTime", number },
    })
    if fieldError then return fieldError end
    normalized.active = true
    normalized.unit = unit
    local owner, ownerError = adapter:ReadPublicField(value, "isFromPlayerOrPlayerPet")
    if not ownerError and type(owner) == "boolean" then normalized.playerOwned = owner end
    return Result.Success(normalized)
  end

  function adapter.ReadCooldown(_, spellId)
    if not Validation.IsPositiveInteger(spellId) then return Result.Failure(Result.Code.INVALID_ARGUMENT) end
    local failure = allowed("C_Secrets.ShouldSpellCooldownBeSecret", spellId)
    if failure then return failure end
    local value, cooldownError = read("C_Spell.GetSpellCooldown", spellId)
    if cooldownError then return cooldownError end
    if value == nil then return Result.Failure(Result.Code.NO_DATA) end
    local normalized, fieldError = fields(value, {
      { "startTime", number }, { "duration", number }, { "modRate", function(v) return number(v) and v > 0 end },
      { "isEnabled", function(v) return type(v) == "boolean" end },
    })
    if fieldError then return fieldError end
    return Result.Success(normalized)
  end

  function adapter.ReadCooldownStatus(_, spellId, event)
    if not Validation.IsPositiveInteger(spellId) then return Result.Failure(Result.Code.INVALID_ARGUMENT) end
    -- SpellSharedDocumentation (both reviewed pins) marks only these fields NeverSecret.
    -- The timing predicate does not gate this separate read; no timing field is indexed.
    -- NeverSecret is not a substitute for live container/leaf guards.
    local value, failure = read("C_Spell.GetSpellCooldown", spellId)
    if failure then return failure end
    if value == nil then return Result.Failure(Result.Code.NO_DATA) end
    local normalized, fieldError = fields(value, {
      { "isEnabled", function(v) return type(v) == "boolean" end },
      { "isActive", function(v) return type(v) == "boolean" end },
    })
    if fieldError then return fieldError end
    -- The optional GCD flag is documented as trustworthy only in this event.
    if adapter:IsPublic(event) and event == "SPELL_UPDATE_COOLDOWN" then
      local onGCD, gcdError = adapter:ReadPublicField(value, "isOnGCD")
      if not gcdError and type(onGCD) == "boolean" then normalized.isOnGCD = onGCD end
    end
    return Result.Success(normalized)
  end

  function adapter.ReadCharges(_, spellId)
    if not Validation.IsPositiveInteger(spellId) then return Result.Failure(Result.Code.INVALID_ARGUMENT) end
    local failure = allowed("C_Secrets.ShouldSpellCooldownBeSecret", spellId)
    if failure then return failure end
    local value, chargesError = read("C_Spell.GetSpellCharges", spellId)
    if chargesError then return chargesError end
    if value == nil then return Result.Success({ hasCharges = false }) end
    local normalized, fieldError = fields(value, {
      { "currentCharges", Validation.IsNonNegativeInteger }, { "maxCharges", Validation.IsPositiveInteger },
      { "cooldownStartTime", number }, { "cooldownDuration", number },
      { "chargeModRate", function(v) return number(v) and v > 0 end },
    })
    if fieldError then return fieldError end
    if normalized.currentCharges > normalized.maxCharges then return Result.Failure(Result.Code.INVALID_DATA) end
    normalized.hasCharges = true
    return Result.Success(normalized)
  end

  function adapter.ReadUsable(_, spellId)
    if not Validation.IsPositiveInteger(spellId) then return Result.Failure(Result.Code.INVALID_ARGUMENT) end
    local value, failure = read("C_Spell.IsSpellUsable", spellId)
    if failure then return failure end
    if type(value) ~= "boolean" then return Result.Failure(Result.Code.INVALID_DATA) end
    return Result.Success(value)
  end

  return adapter
end

Internal.State = State
