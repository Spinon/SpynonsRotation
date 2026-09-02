return function()
  local calls = {
    entries = {},
    definitions = {},
  }

  local nodes = {
    [101] = {
      ID = 101,
      isAvailable = true,
      activeRank = 1,
      maxRanks = 1,
      activeEntry = { entryID = 1001, rank = 1 },
    },
    [102] = {
      ID = 102,
      isAvailable = true,
      activeRank = 1,
      maxRanks = 1,
      entryIDs = { 1002, 1003 },
      activeEntry = { entryID = 1003, rank = 1 },
    },
    [103] = {
      ID = 103,
      isAvailable = true,
      activeRank = 2,
      maxRanks = 2,
      activeEntry = { entryID = 1004, rank = 2 },
    },
    [104] = {
      ID = 104,
      isAvailable = false,
      activeRank = 1,
      maxRanks = 1,
      activeEntry = { entryID = 1005, rank = 1 },
    },
    [105] = {
      ID = 105,
      isAvailable = true,
      activeRank = 0,
      maxRanks = 1,
      activeEntry = nil,
    },
    [106] = {
      ID = 106,
      isAvailable = true,
      activeRank = 1,
      maxRanks = 1,
      activeEntry = { entryID = 1006, rank = 1 },
      subTreeID = 8001,
      subTreeActive = true,
    },
    [107] = {
      ID = 107,
      isAvailable = true,
      activeRank = 1,
      maxRanks = 1,
      activeEntry = { entryID = 1007, rank = 1 },
      subTreeID = 8002,
      subTreeActive = false,
    },
    [108] = {
      ID = 108,
      isAvailable = true,
      activeRank = 1,
      maxRanks = 1,
      activeEntry = { entryID = 1008, rank = 1 },
    },
    [109] = {
      ID = 109,
      isAvailable = true,
      activeRank = 1,
      maxRanks = 1,
      activeEntry = { entryID = 1009, rank = 1 },
    },
  }

  local entries = {
    [1001] = { definitionID = 2001, maxRanks = 1, isAvailable = true },
    [1002] = { definitionID = 2002, maxRanks = 1, isAvailable = true },
    [1003] = { definitionID = 2003, maxRanks = 1, isAvailable = true },
    [1004] = { definitionID = 2004, maxRanks = 2, isAvailable = true },
    [1005] = { definitionID = 2005, maxRanks = 1, isAvailable = true },
    [1006] = { definitionID = 2006, maxRanks = 1, isAvailable = true },
    [1007] = { definitionID = 2007, maxRanks = 1, isAvailable = true },
    [1008] = { subTreeID = 8001, maxRanks = 1, isAvailable = true },
    [1009] = { definitionID = 2009, maxRanks = 1, isAvailable = false },
  }

  local definitions = {
    [2001] = { spellID = 3001 },
    [2002] = { spellID = 3002 },
    [2003] = { spellID = 3003, overrideName = "Selected Choice" },
    [2004] = { spellID = 3004 },
    [2005] = { spellID = 3005 },
    [2006] = { spellID = 3006 },
    [2007] = { spellID = 3007 },
    [2009] = { spellID = 3009 },
  }

  local environment = {
    C_SpecializationInfo = {
      IsInitialized = function()
        return true
      end,
      GetSpecialization = function()
        return 2
      end,
      GetSpecializationInfo = function()
        return 9101, "Neutral", "Fixture specialization", 4001, "DAMAGER"
      end,
      GetClassIDFromSpecID = function()
        return 91
      end,
    },
    C_ClassTalents = {
      GetActiveConfigID = function()
        return 7001
      end,
      GetActiveHeroTalentSpec = function()
        return 8001
      end,
      GetTraitTreeForSpec = function()
        return 6001
      end,
    },
    C_Traits = {
      GetConfigInfo = function()
        return {
          ID = 7001,
          name = "Neutral Loadout",
          treeIDs = { 6002, 6001 },
        }
      end,
      GetTreeNodes = function(treeId)
        if treeId == 6002 then
          return {}
        end
        return { 109, 108, 107, 106, 105, 104, 103, 102, 101 }
      end,
      GetNodeInfo = function(_, nodeId)
        return nodes[nodeId]
      end,
      GetEntryInfo = function(_, entryId)
        calls.entries[entryId] = (calls.entries[entryId] or 0) + 1
        return entries[entryId]
      end,
      GetDefinitionInfo = function(definitionId)
        calls.definitions[definitionId] = (calls.definitions[definitionId] or 0) + 1
        return definitions[definitionId]
      end,
      GetSubTreeInfo = function(_, subTreeId)
        return {
          ID = subTreeId,
          name = "Neutral Hero",
          description = "Fixture hero tree",
          isActive = subTreeId == 8001,
        }
      end,
    },
  }

  return environment, calls, nodes
end
