local _, Spynon = ...
local Internal = Spynon.CompatInternal
local Console = {}
function Console.Create(environment)
  local adapter = {}
  local guard = Internal.State.Create(environment)
  local routes = {}
  function adapter.RegisterRoute(_, prefix, handler)
    assert(type(prefix) == "string" and prefix:match("^[a-z]+$") and type(handler) == "function", "invalid route")
    routes[prefix] = handler
  end
  function adapter.Register(_, handler)
    environment.SlashCmdList = environment.SlashCmdList or {}
    environment.SLASH_SPYNONROTATION1 = "/spynon"
    environment.SlashCmdList.SPYNONROTATION = function(message)
      if guard:IsPublic(message) and type(message) == "string" then
        local prefix = message:lower():match("^%s*(%S+)")
        if prefix and routes[prefix] then routes[prefix](message) else handler(message) end
      end
    end
  end
  function adapter.Write(_, message)
    local frame = environment.DEFAULT_CHAT_FRAME
    if type(message) == "string" and frame and type(frame.AddMessage) == "function" then
      pcall(frame.AddMessage, frame, "|cff42c93eSpynon|r " .. message)
    end
  end
  function adapter.SaveReport(_, report)
    if type(environment.SpynonRotationDB) ~= "table" then environment.SpynonRotationDB = {} end
    environment.SpynonRotationDB.lastSmokeReport = report
  end
  return adapter
end
Internal.Console = Console
