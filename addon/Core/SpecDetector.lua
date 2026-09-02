local _, Spynon = ...

local Capability = Spynon.Contracts.Capability
local Validation = Spynon.Contracts.Validation

local SpecDetectorFactory = {
  Status = {
    READY = "READY",
    PENDING = "PENDING",
    UNREGISTERED = "UNREGISTERED",
    UNAVAILABLE = "UNAVAILABLE",
  },
  Code = {
    OK = "OK",
    INVALID_DATA = "INVALID_DATA",
    INVALID_DEPENDENCY = "INVALID_DEPENDENCY",
    SPECIALIZATION_NOT_INITIALIZED = "SPECIALIZATION_NOT_INITIALIZED",
    SPEC_MODULE_NOT_REGISTERED = "SPEC_MODULE_NOT_REGISTERED",
    SPEC_MODULE_CLASS_MISMATCH = "SPEC_MODULE_CLASS_MISMATCH",
  },
}

local FALLBACK_SKIP = "SKIP"

local function failure(status, code, capability, stage)
  return {
    ok = false,
    status = status,
    code = code,
    capability = capability or Capability.CONDITIONALLY_SECRET,
    fallback = FALLBACK_SKIP,
    stage = stage,
  }
end

local function ready(snapshot)
  return {
    ok = true,
    status = SpecDetectorFactory.Status.READY,
    code = SpecDetectorFactory.Code.OK,
    capability = Capability.ADDON_AVAILABLE,
    value = snapshot,
  }
end

local function readCompat(stage, result)
  if type(result) ~= "table" then
    return nil, failure(
      SpecDetectorFactory.Status.UNAVAILABLE,
      SpecDetectorFactory.Code.INVALID_DATA,
      Capability.CONDITIONALLY_SECRET,
      stage
    )
  end

  if result.ok ~= true or not Capability.AllowsRuntime(result.capability) then
    return nil, failure(
      SpecDetectorFactory.Status.UNAVAILABLE,
      result.code or SpecDetectorFactory.Code.INVALID_DATA,
      result.capability,
      stage
    )
  end

  return result.value
end

local function hasMethod(value, methodName)
  return type(value) == "table" and type(value[methodName]) == "function"
end

local function dependenciesAreValid(compat, registry)
  return type(compat) == "table"
    and hasMethod(compat.Specialization, "IsInitialized")
    and hasMethod(compat.Specialization, "GetActiveIndex")
    and hasMethod(compat.Specialization, "GetInfo")
    and hasMethod(compat.Specialization, "GetClassId")
    and hasMethod(compat.Talents, "GetActiveConfigId")
    and hasMethod(compat.Talents, "GetActiveHeroTreeId")
    and hasMethod(compat.Talents, "GetTreeIdForSpec")
    and hasMethod(compat.Talents, "GetConfigInfo")
    and hasMethod(compat.Talents, "GetTreeNodes")
    and hasMethod(compat.Talents, "GetNodeInfo")
    and hasMethod(compat.Talents, "GetEntryInfo")
    and hasMethod(compat.Talents, "GetDefinitionInfo")
    and hasMethod(compat.Talents, "GetSubTreeInfo")
    and hasMethod(registry, "GetBySpecId")
end

local function normalizeIdArray(value)
  if not Validation.IsArray(value) then
    return nil
  end

  local normalized = {}
  local seen = {}
  for index = 1, #value do
    local id = value[index]
    if not Validation.IsPositiveInteger(id) or seen[id] then
      return nil
    end
    seen[id] = true
    normalized[index] = id
  end

  table.sort(normalized)
  return normalized
end

local function containsId(values, expected)
  for index = 1, #values do
    if values[index] == expected then
      return true
    end
  end
  return false
end

local function copyOptionalString(target, targetField, source, sourceField)
  local value = source[sourceField]
  if type(value) == "string" then
    target[targetField] = value
  end
end

local function copyOptionalPositiveInteger(target, targetField, source, sourceField)
  local value = source[sourceField]
  if value == nil then
    return true
  end
  if not Validation.IsPositiveInteger(value) then
    return false
  end
  target[targetField] = value
  return true
end

local function normalizeSpecialization(index, info, classId)
  if type(info) ~= "table" or info.specId == nil then
    return nil
  end

  local specialization = {
    index = index,
    specId = info.specId,
    classId = classId,
  }
  copyOptionalString(specialization, "name", info, "name")
  copyOptionalString(specialization, "description", info, "description")
  copyOptionalString(specialization, "role", info, "role")

  if info.icon ~= nil then
    if not Validation.IsPositiveInteger(info.icon) then
      return nil
    end
    specialization.icon = info.icon
  end

  return specialization
end

local function normalizeHeroTree(info, expectedId)
  if type(info) ~= "table"
    or info.ID ~= expectedId
    or type(info.isActive) ~= "boolean"
    or info.isActive ~= true
  then
    return nil
  end

  local heroTree = { id = expectedId }
  copyOptionalString(heroTree, "name", info, "name")
  copyOptionalString(heroTree, "description", info, "description")
  return heroTree
end

local function normalizeDefinition(talent, definitionInfo)
  if type(definitionInfo) ~= "table" then
    return false
  end

  if not copyOptionalPositiveInteger(talent, "spellId", definitionInfo, "spellID")
    or not copyOptionalPositiveInteger(talent, "overriddenSpellId", definitionInfo, "overriddenSpellID")
    or not copyOptionalPositiveInteger(talent, "icon", definitionInfo, "overrideIcon")
  then
    return false
  end

  copyOptionalString(talent, "name", definitionInfo, "overrideName")
  return true
end

local function invalidData(stage)
  return failure(
    SpecDetectorFactory.Status.UNAVAILABLE,
    SpecDetectorFactory.Code.INVALID_DATA,
    Capability.ADDON_AVAILABLE,
    stage
  )
end

local function normalizeActiveNode(compat, configId, treeId, nodeId, heroTree)
  local nodeInfo, nodeFailure = readCompat(
    "trait_node",
    compat.Talents:GetNodeInfo(configId, nodeId)
  )
  if nodeFailure then
    return nil, nodeFailure
  end

  if type(nodeInfo) ~= "table" or nodeInfo.ID ~= nodeId or type(nodeInfo.isAvailable) ~= "boolean" then
    return nil, invalidData("trait_node")
  end

  if not nodeInfo.isAvailable then
    return nil
  end

  if nodeInfo.subTreeID ~= nil then
    if not Validation.IsPositiveInteger(nodeInfo.subTreeID) then
      return nil, invalidData("trait_node")
    end
    if heroTree == nil or nodeInfo.subTreeID ~= heroTree.id or nodeInfo.subTreeActive ~= true then
      return nil
    end
  elseif nodeInfo.subTreeActive ~= nil and type(nodeInfo.subTreeActive) ~= "boolean" then
    return nil, invalidData("trait_node")
  end

  if not Validation.IsNonNegativeInteger(nodeInfo.activeRank)
    or not Validation.IsNonNegativeInteger(nodeInfo.maxRanks)
  then
    return nil, invalidData("trait_node")
  end

  if nodeInfo.activeRank == 0 then
    return nil
  end
  if type(nodeInfo.activeEntry) ~= "table"
    or not Validation.IsPositiveInteger(nodeInfo.activeEntry.entryID)
    or not Validation.IsPositiveInteger(nodeInfo.activeEntry.rank)
  then
    return nil, invalidData("active_entry")
  end

  local entryId = nodeInfo.activeEntry.entryID
  local entryInfo, entryFailure = readCompat(
    "trait_entry",
    compat.Talents:GetEntryInfo(configId, entryId)
  )
  if entryFailure then
    return nil, entryFailure
  end
  if type(entryInfo) ~= "table"
    or type(entryInfo.isAvailable) ~= "boolean"
    or not Validation.IsPositiveInteger(entryInfo.maxRanks)
  then
    return nil, invalidData("trait_entry")
  end
  if not entryInfo.isAvailable then
    return nil
  end

  local hasDefinition = entryInfo.definitionID ~= nil
  local selectsSubTree = entryInfo.subTreeID ~= nil
  if hasDefinition == selectsSubTree then
    return nil, invalidData("trait_entry")
  end

  local talent = {
    treeId = treeId,
    nodeId = nodeId,
    entryId = entryId,
    rank = nodeInfo.activeEntry.rank,
    maxRanks = entryInfo.maxRanks,
  }
  if nodeInfo.subTreeID ~= nil then
    talent.subTreeId = nodeInfo.subTreeID
  end

  if selectsSubTree then
    if not Validation.IsPositiveInteger(entryInfo.subTreeID)
      or heroTree == nil
      or entryInfo.subTreeID ~= heroTree.id
    then
      return nil, invalidData("subtree_selection")
    end
    talent.kind = "SUBTREE_SELECTION"
    talent.selectedSubTreeId = entryInfo.subTreeID
    return talent
  end

  if not Validation.IsPositiveInteger(entryInfo.definitionID) then
    return nil, invalidData("trait_entry")
  end

  local definitionInfo, definitionFailure = readCompat(
    "trait_definition",
    compat.Talents:GetDefinitionInfo(entryInfo.definitionID)
  )
  if definitionFailure then
    return nil, definitionFailure
  end

  talent.kind = "DEFINITION"
  talent.definitionId = entryInfo.definitionID
  if not normalizeDefinition(talent, definitionInfo) then
    return nil, invalidData("trait_definition")
  end
  if talent.spellId ~= nil then
    talent.kind = "SPELL"
  end

  return talent
end

local function captureTrees(compat, configId, trees, heroTree)
  local talents = {}
  local activeSpellRanks = {}
  local seenNodes = {}

  for treeIndex = 1, #trees do
    local tree = trees[treeIndex]
    local rawNodeIds, nodeListFailure = readCompat("tree_nodes", compat.Talents:GetTreeNodes(tree.id))
    if nodeListFailure then
      return nil, nil, nodeListFailure
    end

    local nodeIds = normalizeIdArray(rawNodeIds)
    if nodeIds == nil then
      return nil, nil, invalidData("tree_nodes")
    end

    for nodeIndex = 1, #nodeIds do
      local nodeId = nodeIds[nodeIndex]
      if seenNodes[nodeId] then
        return nil, nil, invalidData("tree_nodes")
      end
      seenNodes[nodeId] = true

      local talent, talentFailure = normalizeActiveNode(compat, configId, tree.id, nodeId, heroTree)
      if talentFailure then
        return nil, nil, talentFailure
      end
      if talent then
        talents[#talents + 1] = talent
        if talent.spellId ~= nil then
          local previousRank = activeSpellRanks[talent.spellId] or 0
          if talent.rank > previousRank then
            activeSpellRanks[talent.spellId] = talent.rank
          end
        end
      end
    end
  end

  table.sort(talents, function(left, right)
    if left.nodeId == right.nodeId then
      return left.entryId < right.entryId
    end
    return left.nodeId < right.nodeId
  end)

  return talents, activeSpellRanks
end

function SpecDetectorFactory.Create(compat, registry)
  local detector = {}

  function detector.Capture(_)
    if not dependenciesAreValid(compat, registry) then
      return failure(
        SpecDetectorFactory.Status.UNAVAILABLE,
        SpecDetectorFactory.Code.INVALID_DEPENDENCY,
        Capability.CONDITIONALLY_SECRET,
        "dependencies"
      )
    end

    local initialized, initializationFailure = readCompat(
      "specialization_initialization",
      compat.Specialization:IsInitialized()
    )
    if initializationFailure then
      return initializationFailure
    end
    if initialized ~= true then
      return failure(
        SpecDetectorFactory.Status.PENDING,
        SpecDetectorFactory.Code.SPECIALIZATION_NOT_INITIALIZED,
        Capability.ADDON_AVAILABLE,
        "specialization_initialization"
      )
    end

    local specIndex, specIndexFailure = readCompat(
      "active_spec_index",
      compat.Specialization:GetActiveIndex()
    )
    if specIndexFailure then
      return specIndexFailure
    end
    if not Validation.IsPositiveInteger(specIndex) then
      return invalidData("active_spec_index")
    end
    local specInfo, specInfoFailure = readCompat(
      "specialization_info",
      compat.Specialization:GetInfo(specIndex)
    )
    if specInfoFailure then
      return specInfoFailure
    end
    if type(specInfo) ~= "table" or not Validation.IsPositiveInteger(specInfo.specId) then
      return invalidData("specialization_info")
    end
    local classId, classFailure = readCompat(
      "specialization_class",
      compat.Specialization:GetClassId(specInfo.specId)
    )
    if classFailure then
      return classFailure
    end

    local specialization = normalizeSpecialization(specIndex, specInfo, classId)
    if specialization == nil then
      return invalidData("specialization_info")
    end

    local module = registry:GetBySpecId(specialization.specId)
    if module == nil then
      return failure(
        SpecDetectorFactory.Status.UNREGISTERED,
        SpecDetectorFactory.Code.SPEC_MODULE_NOT_REGISTERED,
        Capability.ADDON_AVAILABLE,
        "spec_registry"
      )
    end
    if module.classId ~= specialization.classId then
      return failure(
        SpecDetectorFactory.Status.UNAVAILABLE,
        SpecDetectorFactory.Code.SPEC_MODULE_CLASS_MISMATCH,
        Capability.ADDON_AVAILABLE,
        "spec_registry"
      )
    end

    local configId, configFailure = readCompat("active_config", compat.Talents:GetActiveConfigId())
    if configFailure then
      return configFailure
    end
    if not Validation.IsPositiveInteger(configId) then
      return invalidData("active_config")
    end
    local configInfo, configInfoFailure = readCompat(
      "config_info",
      compat.Talents:GetConfigInfo(configId)
    )
    if configInfoFailure then
      return configInfoFailure
    end
    local specTreeId, specTreeFailure = readCompat(
      "spec_tree",
      compat.Talents:GetTreeIdForSpec(specialization.specId)
    )
    if specTreeFailure then
      return specTreeFailure
    end
    if not Validation.IsPositiveInteger(specTreeId) then
      return invalidData("spec_tree")
    end

    local treeIds = type(configInfo) == "table" and normalizeIdArray(configInfo.treeIDs) or nil
    if configInfo == nil
      or configInfo.ID ~= configId
      or treeIds == nil
      or not containsId(treeIds, specTreeId)
    then
      return invalidData("config_info")
    end

    local heroTreeId, heroSelectionFailure = readCompat(
      "active_hero_tree",
      compat.Talents:GetActiveHeroTreeId()
    )
    if heroSelectionFailure then
      return heroSelectionFailure
    end
    if heroTreeId ~= nil and not Validation.IsPositiveInteger(heroTreeId) then
      return invalidData("active_hero_tree")
    end

    local heroTree
    if heroTreeId ~= nil then
      local heroInfo, heroInfoFailure = readCompat(
        "hero_tree_info",
        compat.Talents:GetSubTreeInfo(configId, heroTreeId)
      )
      if heroInfoFailure then
        return heroInfoFailure
      end
      heroTree = normalizeHeroTree(heroInfo, heroTreeId)
      if heroTree == nil then
        return invalidData("hero_tree_info")
      end
    end

    local trees = {}
    for index = 1, #treeIds do
      trees[index] = {
        id = treeIds[index],
        kind = treeIds[index] == specTreeId and "CLASS_SPEC" or "CONFIG",
      }
    end

    local talents, activeSpellRanks, talentFailure = captureTrees(compat, configId, trees, heroTree)
    if talentFailure then
      return talentFailure
    end

    local config = {
      id = configId,
      treeIds = treeIds,
    }
    copyOptionalString(config, "name", configInfo, "name")

    return ready({
      specialization = specialization,
      module = module,
      config = config,
      specTreeId = specTreeId,
      heroTree = heroTree,
      trees = trees,
      talents = talents,
      activeSpellRanks = activeSpellRanks,
    })
  end

  return detector
end

Spynon.SpecDetectorFactory = SpecDetectorFactory
Spynon.SpecDetector = SpecDetectorFactory.Create(Spynon.Compat, Spynon.Specs)
