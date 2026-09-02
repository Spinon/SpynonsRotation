local addonName, Spynon = ...

---@class SpynonContracts
---@field Validation table
---@field Capability table
---@field CombatContext table
---@field Action table
---@field Recommendation table
---@field PlayerState table
---@field SpecModule table

---@class SpynonNamespace
---@field name string
---@field version string
---@field initialized boolean
---@field Contracts SpynonContracts
---@field SpecRegistry table
---@field Specs table
---@field CompatFactory table
---@field Compat table
---@field CompatInternal table
---@field SpecDetectorFactory table
---@field SpecDetector table

Spynon.name = addonName
Spynon.version = "0.0.0"
Spynon.Contracts = Spynon.Contracts or {}
Spynon.CompatInternal = Spynon.CompatInternal or {}
