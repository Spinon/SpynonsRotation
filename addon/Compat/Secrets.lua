local _, Spynon = ...

local Capability = Spynon.Contracts.Capability
local Validation = Spynon.Contracts.Validation
local SafeCall = Spynon.CompatInternal.SafeCall
local Result = Spynon.CompatInternal.Result

local Secrets = {}

local function invalidArgument()
  return Result.Failure(Result.Code.INVALID_ARGUMENT, Capability.ADDON_AVAILABLE)
end

local function isSpellIdentifier(value)
  return Validation.IsPositiveInteger(value) or Validation.IsNonEmptyString(value)
end

local function classify(environment, path, ...)
  local called, isSecret = SafeCall.Call(environment, path, ...)
  if called == nil then
    return Result.Failure(isSecret)
  end
  return Result.FromSecretFlag(isSecret)
end

function Secrets.Create(environment)
  local adapter = {}

  function adapter.GetRestrictionState(_)
    return classify(environment, "C_Secrets.HasSecretRestrictions")
  end

  function adapter.ClassifyCooldown(_, spellIdentifier)
    if spellIdentifier == nil then
      return classify(environment, "C_Secrets.ShouldCooldownsBeSecret")
    end
    if not isSpellIdentifier(spellIdentifier) then
      return invalidArgument()
    end
    return classify(environment, "C_Secrets.ShouldSpellCooldownBeSecret", spellIdentifier)
  end

  function adapter.ClassifyAura(_, spellIdentifier)
    if spellIdentifier == nil then
      return classify(environment, "C_Secrets.ShouldAurasBeSecret")
    end
    if not isSpellIdentifier(spellIdentifier) then
      return invalidArgument()
    end
    return classify(environment, "C_Secrets.ShouldSpellAuraBeSecret", spellIdentifier)
  end

  function adapter.ClassifyUnitPower(_, unit, powerType)
    if not Validation.IsNonEmptyString(unit) then
      return invalidArgument()
    end
    if powerType ~= nil and not Validation.IsNonNegativeInteger(powerType) then
      return invalidArgument()
    end
    return classify(environment, "C_Secrets.ShouldUnitPowerBeSecret", unit, powerType)
  end

  return adapter
end

Spynon.CompatInternal.Secrets = Secrets
