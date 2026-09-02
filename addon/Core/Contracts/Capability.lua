local _, Spynon = ...

local Capability = {
  ADDON_AVAILABLE = "ADDON_AVAILABLE",
  SIM_ONLY = "SIM_ONLY",
  CONDITIONALLY_SECRET = "CONDITIONALLY_SECRET",
}

local VALID = {
  [Capability.ADDON_AVAILABLE] = true,
  [Capability.SIM_ONLY] = true,
  [Capability.CONDITIONALLY_SECRET] = true,
}

function Capability.IsValid(value)
  return VALID[value] == true
end

function Capability.AllowsRuntime(value)
  return value == Capability.ADDON_AVAILABLE
end

function Capability.RequiresFallback(value)
  return value == Capability.CONDITIONALLY_SECRET
end

Spynon.Contracts.Capability = Capability
