local _, Spynon = ...
local Internal = Spynon.CompatInternal
local V = Spynon.Contracts.Validation
local Media = {}
local ITEM_KINDS = { item = true, trinket = true, potion = true }

function Media.Create(environment)
  local adapter = {}
  local guard = Internal.State.Create(environment)
  function adapter.GetRootParent(_) return environment.UIParent end
  function adapter.ResolveIcon(_, action)
    if not Spynon.Contracts.Action.Validate(action) then return nil end
    if action.icon ~= nil then return action.icon end
    if not V.IsPositiveInteger(action.gameId) then return nil end
    local path = ITEM_KINDS[action.kind] and "C_Item.GetItemIconByID" or "C_Spell.GetSpellTexture"
    local ok, icon = Internal.SafeCall.Call(environment, path, action.gameId)
    if ok and guard:IsPublic(icon) and V.IsPositiveInteger(icon) then return icon end
    return nil
  end
  function adapter.Present(_, recommendations)
    local presented = {}
    for _, recommendation in ipairs(recommendations) do
      if Spynon.Contracts.Recommendation.IsRuntimeSafe(recommendation) then
        local action = Spynon.Contracts.Action.Create(recommendation.action)
        action.icon = adapter:ResolveIcon(action)
        presented[#presented + 1] = Spynon.Contracts.Recommendation.Create({
          id = recommendation.id, action = action, priority = recommendation.priority,
          reason = recommendation.reason, context = recommendation.context,
        })
      end
    end
    return presented
  end
  return adapter
end
Internal.Media = Media
