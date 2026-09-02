local _, Spynon = ...

local Validation = Spynon.Contracts.Validation
local SpecModule = Spynon.Contracts.SpecModule

local SpecRegistry = {}
local RegistryMethods = {}
RegistryMethods.__index = RegistryMethods

local function copyModules(modules)
  local copy = {}
  for index = 1, #modules do
    copy[index] = modules[index]
  end
  return copy
end

local function buildOrderedModules(registry)
  local modules = {}
  for _, module in pairs(registry._byId) do
    modules[#modules + 1] = module
  end

  table.sort(modules, function(left, right)
    return left.id < right.id
  end)

  registry._orderedModules = modules
  return modules
end

function RegistryMethods:Register(module)
  local valid, validationError = SpecModule.Validate(module)
  if not valid then
    return nil, "invalid SpecModule: " .. validationError
  end

  if self._byId[module.id] ~= nil then
    return nil, "duplicate SpecModule id: " .. module.id
  end

  local specOwner = self._bySpecId[module.specId]
  if specOwner ~= nil then
    return nil, "duplicate SpecModule specId: " .. module.specId
      .. " already registered by " .. specOwner.id
  end

  self._byId[module.id] = module
  self._bySpecId[module.specId] = module
  self._count = self._count + 1
  self._orderedModules = nil

  return module
end

function RegistryMethods:GetById(id)
  if not Validation.IsNonEmptyString(id) then
    return nil, "id must be a non-empty string"
  end

  local module = self._byId[id]
  if module == nil then
    return nil, "SpecModule not found for id: " .. id
  end

  return module
end

function RegistryMethods:GetBySpecId(specId)
  if not Validation.IsPositiveInteger(specId) then
    return nil, "specId must be a positive integer"
  end

  local module = self._bySpecId[specId]
  if module == nil then
    return nil, "SpecModule not found for specId: " .. specId
  end

  return module
end

function RegistryMethods:List()
  local modules = self._orderedModules
  if modules == nil then
    modules = buildOrderedModules(self)
  end

  return copyModules(modules)
end

function RegistryMethods:Count()
  return self._count
end

function SpecRegistry.Create()
  return setmetatable({
    _byId = {},
    _bySpecId = {},
    _orderedModules = nil,
    _count = 0,
  }, RegistryMethods)
end

Spynon.SpecRegistry = SpecRegistry
Spynon.Specs = SpecRegistry.Create()
