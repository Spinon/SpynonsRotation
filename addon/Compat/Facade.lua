local _, Spynon = ...

local Internal = Spynon.CompatInternal

local CompatFactory = {}

function CompatFactory.Create(environment)
  local apiEnvironment = type(environment) == "table" and environment or {}
  return {
    Build = Internal.Build.Create(apiEnvironment),
    Specialization = Internal.Specialization.Create(apiEnvironment),
    Talents = Internal.Talents.Create(apiEnvironment),
    Secrets = Internal.Secrets.Create(apiEnvironment),
  }
end

Spynon.CompatFactory = CompatFactory
Spynon.Compat = CompatFactory.Create(_G)
