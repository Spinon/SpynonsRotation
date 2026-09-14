local _, Spynon = ...
local Contract = Spynon.Contracts.CombatContext
local V = Spynon.Contracts.Validation
local AVAILABLE = Spynon.Contracts.Capability.ADDON_AVAILABLE
local Detector = {}

function Detector.Create(adapter, guard)
  local detector = {}
  local mode, cleaveAt, aoeAt = "AUTO", 2, 4
  function detector.SetMode(_, value)
    if not guard:IsPublic(value) or not Contract.IsMode(value) then return false end
    mode = value
    return true
  end
  function detector.SetThresholds(_, cleave, aoe)
    if not guard:IsPublic(cleave) or not guard:IsPublic(aoe)
      or not V.IsPositiveInteger(cleave) or not V.IsPositiveInteger(aoe)
      or cleave < 2 or cleave >= aoe or aoe > 40 then return false end
    cleaveAt, aoeAt = cleave, aoe
    return true
  end
  function detector.Capture(_)
    if mode ~= "AUTO" then
      return Contract.Create({ mode = mode, isOverride = true }), { source = "MANUAL_OVERRIDE" }
    end
    local signal = adapter:ReadEnemyCount()
    if type(signal) == "table" and signal.ok == true and signal.capability == AVAILABLE
      and guard:IsPublic(signal.value) and V.IsNonNegativeInteger(signal.value) and signal.value <= 40 then
      local resolved = signal.value >= aoeAt and "AOE" or (signal.value >= cleaveAt and "CLEAVE" or "SINGLE_TARGET")
      return Contract.Create({ mode = "AUTO", resolvedMode = resolved }), {
        source = "OBSERVED", count = signal.value, signalCapability = AVAILABLE,
      }
    end
    -- Capability describes the safe choice, not a fictional measurement of one enemy.
    return Contract.Create({ mode = "AUTO", resolvedMode = "SINGLE_TARGET" }), {
      source = "SAFE_FALLBACK", code = "ENEMY_COUNT_UNAVAILABLE", signalCapability = "CONDITIONALLY_SECRET",
    }
  end
  return detector
end
Spynon.ContextDetectorFactory = Detector
Spynon.ContextDetector = Detector.Create(Spynon.Compat.Context, Spynon.Compat.State)
