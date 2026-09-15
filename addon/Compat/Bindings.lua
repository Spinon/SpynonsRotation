local _, Spynon = ...
local Internal, V = Spynon.CompatInternal, Spynon.Contracts.Validation
local Bindings = {}
local PREFIXES = { "ActionButton", "MultiBarBottomLeftButton", "MultiBarBottomRightButton", "MultiBarLeftButton",
  "MultiBarRightButton", "MultiBar5Button", "MultiBar6Button", "MultiBar7Button" }
local ITEMS = { item = true, trinket = true, potion = true }
Bindings.Events = { "UPDATE_BINDINGS", "BINDINGS_LOADED", "ACTIONBAR_SLOT_CHANGED", "ACTIONBAR_PAGE_CHANGED",
  "UPDATE_BONUS_ACTIONBAR", "UPDATE_OVERRIDE_ACTIONBAR", "UPDATE_VEHICLE_ACTIONBAR", "UPDATE_SHAPESHIFT_FORM",
  "SPELLS_CHANGED", "UPDATE_MACROS", "PLAYER_ENTERING_WORLD", "PLAYER_REGEN_ENABLED", "UPDATE_SHAPESHIFT_FORMS",
  "CVAR_UPDATE", "ADDON_RESTRICTION_STATE_CHANGED" }

function Bindings.Create(environment)
  local adapter, index, blocked = {}, nil, false
  local guard = Internal.State.Create(environment)
  local function public(value) return guard:IsPublic(value) end
  local function field(object, name)
    local value, failure = guard:ReadPublicField(object, name)
    if failure then return nil end
    return value
  end
  local function keyString(value)
    return public(value) and type(value) == "string" and #value > 0 and #value <= 64
      and not value:find("[%c|]")
  end
  local function bindingKey(command)
    local ok, first, second = Internal.SafeCall.Call(environment, "GetBindingKey", command)
    if not ok then return nil end
    for i = 1, 2 do
      local key
      if i == 1 then key = first else key = second end
      if keyString(key) then
        local resolved, action = Internal.SafeCall.Call(environment, "GetBindingAction", key, true)
        if resolved and public(action) and action == command then return key end
      end
    end
    return nil
  end
  local function baseSpell(id)
    local ok, value = Internal.SafeCall.Call(environment, "C_Spell.GetBaseSpell", id)
    if ok and public(value) and V.IsPositiveInteger(value) then return value end
    return id -- Exact public identity only when override metadata is unavailable.
  end
  local function capture()
    local result = {}
    for _, prefix in ipairs(PREFIXES) do
      for number = 1, 12 do
        local name = prefix .. number
        local button = environment[name]
        local visible = field(button, "IsVisible")
        local ok, shown
        if type(visible) == "function" then ok, shown = pcall(visible, button) end
        local slot, command = field(button, "action"), field(button, "bindingAction")
        if ok and public(shown) and shown == true and V.IsPositiveInteger(slot) then
          local read, kind, id = Internal.SafeCall.Call(environment, "GetActionInfo", slot)
          if read and public(kind) and public(id) and (kind == "spell" or kind == "item")
            and V.IsPositiveInteger(id) then
            local key = keyString(command) and bindingKey(command) or nil
            key = key or bindingKey("CLICK " .. name .. ":LeftButton")
            if key then
              local identity = kind .. ":" .. (kind == "spell" and baseSpell(id) or id)
              if not result[identity] then result[identity] = key end
            end
          end
        end
      end
    end
    return result
  end
  function adapter.Invalidate(_, restricted) index = nil; blocked = restricted == true end
  function adapter.ForRecommendations(_, recommendations)
    if blocked then return {} end
    index = index or capture()
    local result = {}
    for _, recommendation in ipairs(recommendations) do
      if Spynon.Contracts.Recommendation.IsRuntimeSafe(recommendation) then
        local action = recommendation.action
        if V.IsPositiveInteger(action.gameId) then
          local kind = ITEMS[action.kind] and "item" or "spell"
          local id = kind == "spell" and baseSpell(action.gameId) or action.gameId
          result[recommendation.id] = index[kind .. ":" .. id]
        end
      end
    end
    return result
  end
  return adapter
end
Internal.Bindings = Bindings
