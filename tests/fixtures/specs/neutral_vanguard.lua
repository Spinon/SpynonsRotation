local _, Spynon = ...

local module, moduleError = Spynon.Contracts.SpecModule.Create({
  id = "vanguard.neutral",
  classId = 91,
  specId = 9101,
  displayName = "Neutral Vanguard",
  version = "fixture-1",
  getActions = function()
    return {}
  end,
  getRules = function()
    return {}
  end,
})

if module == nil then
  error(moduleError)
end

local registered, registrationError = Spynon.Specs:Register(module)
if registered == nil then
  error(registrationError)
end
