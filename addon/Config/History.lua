local _, Spynon = ...
local History = {}
local function copy(value)
  if type(value) ~= "table" then return value end
  local result = {}; for key, item in pairs(value) do result[key] = copy(item) end; return result
end
function History.Equal(a, b)
  if type(a) ~= type(b) then return false end
  if type(a) ~= "table" then return a == b end
  for key, value in pairs(a) do if not History.Equal(value, b[key]) then return false end end
  for key in pairs(b) do if a[key] == nil then return false end end
  return true
end
function History.Create(adapter)
  local history, undo, redo, listeners = {}, {}, {}, {}
  local active, internal = nil, false
  local function call(method, ...)
    internal = true
    local ok, result = pcall(adapter[method], adapter, ...)
    internal = false
    return ok and result
  end
  local function notify() for listener in pairs(listeners) do listener() end end
  function history.IsInternal(_) return internal end
  function history.GetStatus(_)
    return { undo = #undo, redo = #redo, active = active ~= nil,
      undoLabel = undo[#undo] and undo[#undo].label, redoLabel = redo[#redo] and redo[#redo].label }
  end
  function history.Subscribe(_, listener)
    listeners[listener] = true; return function() listeners[listener] = nil end
  end
  function history.Cancel(_)
    if not active then return false end
    active = nil; call("Refresh"); notify(); return true
  end
  function history.Invalidate(_)
    if internal then return end
    active, undo, redo = nil, {}, {}
    call("Refresh"); notify()
  end
  function history.Begin(_, label)
    if active then return true end
    if not call("CanEdit") then return false end
    local before, values = call("Capture"), call("Values")
    if type(before) ~= "table" or not Spynon.SettingsFactory.Validate(values) then return false end
    active = { before = copy(before), values = copy(values), original = copy(values), changes = {}, label = label }
    notify(); return true
  end
  function history.Preview(_, key, value)
    if not active or not Spynon.SettingsFactory.IsValue(key, value) then return false end
    if not call("CanEdit") then history:Cancel(); return false end
    active.values[key] = value
    if value == active.original[key] then active.changes[key] = nil else active.changes[key] = value end
    return call("Preview", copy(active.values)) == true
  end
  local function apply(before, changes, label)
    if not call("CanEdit") or not call("Apply", before, changes) then
      history:Invalidate(); return false
    end
    local after = call("Capture")
    if type(after) ~= "table" then history:Invalidate(); return false end
    if not History.Equal(before, after) then
      undo[#undo+1] = { before = copy(before), after = copy(after), label = label }
      if #undo > 50 then table.remove(undo, 1) end
      redo = {}
    end
    notify(); return true
  end
  function history.Commit(_)
    if not active then return false end
    local transaction = active; active = nil
    call("Refresh") -- Discard visual preview before writing the authoritative store.
    if next(transaction.changes) == nil then notify(); return true end
    return apply(transaction.before, transaction.changes, transaction.label)
  end
  function history.Execute(_, key, value)
    if not Spynon.SettingsFactory.IsValue(key, value) then return false end
    history:Cancel()
    if not call("CanEdit") then return false end
    local before = call("Capture")
    if type(before) ~= "table" then return false end
    return apply(before, { [key] = value }, key)
  end
  local function travel(source, destination, field, expectedField)
    history:Cancel()
    local entry = source[#source]
    if not entry or not call("CanEdit") then return false end
    if not History.Equal(call("Capture"), entry[expectedField]) then history:Invalidate(); return false end
    if not call("Restore", copy(entry[field]), copy(entry[expectedField])) then history:Invalidate(); return false end
    table.remove(source); destination[#destination+1] = entry; notify(); return true
  end
  function history.Undo(_) return travel(undo, redo, "before", "after") end
  function history.Redo(_) return travel(redo, undo, "after", "before") end
  return history
end
Spynon.HistoryFactory = History
