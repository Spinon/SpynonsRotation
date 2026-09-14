local _, Spynon = ...
local Context = {}
function Context.Create()
  return {
    ReadEnemyCount = function()
      -- No enemy-count source has been validated for combat decisions in this client pin.
      -- Visible nameplates are not equivalent to attackable enemies within an action's AoE.
      return Spynon.CompatInternal.Result.Failure("NO_VALIDATED_ENEMY_COUNT")
    end,
  }
end
Spynon.CompatInternal.Context = Context
