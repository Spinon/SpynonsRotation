local _, Spynon = ...
local V = Spynon.Contracts.Validation
local AVAILABLE = Spynon.Contracts.Capability.ADDON_AVAILABLE
local Reader = {}

-- Inputs are State Engine snapshots. Guard selected values again at the evaluation boundary.
function Reader.Create(state, guard)
  local reader = {}
  local function public(value)
    return guard:IsPublic(value)
  end
  local function at(path)
    local value = state
    for _, key in ipairs(path) do
      if not public(value) or type(value) ~= "table" then return nil end
      value = value[key]
    end
    if not public(value) then return nil end
    return value
  end
  local function capability(key)
    return at({ "capabilities", key }) == AVAILABLE
  end
  local function numeric(value)
    return V.IsFiniteNumber(value) and value >= 0
  end
  local function now()
    local value = at({ "capturedAt" })
    if capability("capturedAt") and numeric(value) then return value end
  end

  function reader.Read(_, path)
    if not Spynon.RotationProgram.IsList(path, 16) or #path < 1 then return nil end
    for _, key in ipairs(path) do if not V.IsNonEmptyString(key) then return nil end end
    local key = table.concat(path, ".")
    if #path == 3 and path[1] == "cooldowns" and path[3] == "ready" then
      local explicit = at({ "capabilities", key })
      if explicit ~= nil and explicit ~= AVAILABLE then return nil end
      -- Independent public status is sufficient, but never authorizes timing/charges.
      -- Do not ignore GCD or treat a cooldown on hold as ready.
      local enabled = reader:Read({ "cooldowns", path[2], "status", "isEnabled" })
      local active = reader:Read({ "cooldowns", path[2], "status", "isActive" })
      if enabled == false then return false end
      if enabled == true and type(active) == "boolean" then return not active end
    end
    -- Most-specific capability wins; a restricted child cannot inherit a public parent.
    local authorized = false
    for length = #path, 1, -1 do
      local flag = at({ "capabilities", table.concat(path, ".", 1, length) })
      if flag ~= nil then authorized = flag == AVAILABLE; break end
    end
    if not authorized then return nil end
    if path[1] == "auras" and at({ "auras", path[2], "unit" }) == "target"
      and at({ "auras", path[2], "active" }) ~= false
      and at({ "auras", path[2], "playerOwned" }) ~= true then return nil end
    local direct = at(path)
    if type(direct) == "boolean" or type(direct) == "string" or V.IsFiniteNumber(direct) then return direct end
    if #path ~= 3 then return nil end
    local group, id, field = path[1], path[2], path[3]
    if group == "talents" and field == "enabled" then
      local rank = at({ "talents", id })
      if V.IsNonNegativeInteger(rank) then return rank > 0 end
    elseif group == "auras" and field == "remains" then
      local active = at({ group, id, "active" })
      if active == false then return 0 end
      local expiration, time = at({ group, id, "expirationTime" }), now()
      -- Timeless auras have no numeric remaining lifetime; do not invent infinity.
      if active == true and numeric(expiration) and expiration > 0 and time then
        return math.max(0, expiration - time)
      end
    elseif group == "cooldowns" then
      local time = now()
      if field == "remains" or field == "ready" then
        local enabled = at({ group, id, "isEnabled" })
        local start, duration = at({ group, id, "startTime" }), at({ group, id, "duration" })
        local rate = at({ group, id, "modRate" })
        -- Only the validated unit-rate case has an unambiguous wall-clock interpretation here.
        if enabled == true and numeric(start) and numeric(duration) and time and rate == 1 then
          local remains = math.max(0, start + duration - time)
          if field == "ready" then return remains == 0 end
          return remains
        end
      elseif field == "charges_fractional" and capability(key:gsub("charges_fractional$", "charges")) then
        local base = { group, id, "charges" }
        local charges = at(base)
        if type(charges) ~= "table" then return nil end
        local count = at({ group, id, "charges", "currentCharges" })
        local maximum = at({ group, id, "charges", "maxCharges" })
        if not V.IsNonNegativeInteger(count) or not V.IsPositiveInteger(maximum) or count > maximum then return nil end
        if count == maximum then return count end
        local start = at({ group, id, "charges", "cooldownStartTime" })
        local duration = at({ group, id, "charges", "cooldownDuration" })
        local rate = at({ group, id, "charges", "chargeModRate" })
        if numeric(start) and numeric(duration) and duration > 0 and time and rate == 1 then
          return count + math.min(1, math.max(0, (time - start) / duration))
        end
      end
    end
  end

  function reader.IsReady(_, action)
    local usable = reader:Read({ "cooldowns", action.id, "usable" })
    if usable ~= true then return false, usable == false and "NOT_USABLE" or "USABILITY_UNAVAILABLE" end
    local ready = reader:Read({ "cooldowns", action.id, "ready" })
    if ready ~= true then return false, ready == false and "COOLDOWN_ACTIVE" or "COOLDOWN_UNAVAILABLE" end
    return true, "READY"
  end
  return reader
end

Spynon.StateReader = Reader
