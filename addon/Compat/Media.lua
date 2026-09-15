local _, Spynon = ...
local Internal = Spynon.CompatInternal
local V = Spynon.Contracts.Validation
local Media = {}
local ITEM_KINDS = { item = true, trinket = true, potion = true }

function Media.Create(environment)
  local adapter = {}
  local guard = Internal.State.Create(environment)
  function adapter.GetRootParent(_) return environment.UIParent end
  function adapter.ReadHUDPosition(_, frame)
    -- Own movable frame only. Guard every scalar before coordinate arithmetic.
    local ok, x, y, scale, px, py, parentScale = pcall(function()
      local a, b = frame:GetCenter()
      local c, d = environment.UIParent:GetCenter()
      return a, b, frame:GetEffectiveScale(), c, d, environment.UIParent:GetEffectiveScale()
    end)
    if not ok then return nil end
    for _, value in pairs({x=x, y=y, scale=scale, px=px, py=py, parentScale=parentScale}) do
      if not guard:IsPublic(value) or not V.IsFiniteNumber(value) then return nil end
    end
    if x == nil or y == nil or px == nil or py == nil or scale == nil or parentScale == nil
      or scale <= 0 or parentScale <= 0 then return nil end
    local offsetX, offsetY = x-px*parentScale/scale, y-py*parentScale/scale
    if not V.IsFiniteNumber(offsetX) or not V.IsFiniteNumber(offsetY) then return nil end
    return math.floor(offsetX+0.5), math.floor(offsetY+0.5)
  end
  function adapter.ConfirmedPlayerSpell(_, unit, spellID)
    if not guard:IsPublic(unit) or not guard:IsPublic(spellID) then return nil end
    if unit ~= "player" or not V.IsPositiveInteger(spellID) then return nil end
    return spellID
  end
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
