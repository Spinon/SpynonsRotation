local _, Spynon = ...
local V = Spynon.Contracts.Validation
local Capability = Spynon.Contracts.Capability
local Program = {}
local UNKNOWN = {}
function Program.IsList(value, maximum)
  if type(value) ~= "table" or #value > maximum then return false end
  local count = 0
  for key in pairs(value) do
    if not V.IsPositiveInteger(key) or key > #value then return false end
    count = count + 1
  end
  return count == #value
end
local function truth(value)
  if type(value) == "boolean" then return value end
  if V.IsFiniteNumber(value) then return value ~= 0 end
  return nil
end

-- Only versioned compiler instructions, never executable strings or imported Lua.
function Program.Evaluate(program, reader)
  if not Program.IsList(program, 1024) or #program == 0 then return nil, "INVALID_PROGRAM" end
  local stack = {}
  for _, instruction in ipairs(program) do
    if type(instruction) ~= "table" then return nil, "INVALID_INSTRUCTION" end
    local op = instruction.op
    if op == "PUSH_LITERAL" then
      local value = instruction.value
      if type(value) ~= "boolean" and type(value) ~= "string" and not V.IsFiniteNumber(value) then
        return nil, "INVALID_LITERAL"
      end
      stack[#stack + 1] = value
    elseif op == "READ_STATE" or op == "HAS_STATE" then
      if not Capability.IsValid(instruction.capability) then return nil, "INVALID_CAPABILITY" end
      if instruction.capability == Capability.SIM_ONLY then return nil, "SIM_ONLY" end
      local value = reader:Read(instruction.path)
      if value == nil then
        -- Missing/protected state is unknown, including under HAS_STATE / NOT / ANY.
        stack[#stack + 1] = UNKNOWN
      elseif op == "HAS_STATE" then stack[#stack + 1] = true
      else stack[#stack + 1] = value end
    elseif op == "TRUTHY" or op == "NOT" then
      if #stack < 1 then return nil, "STACK_UNDERFLOW" end
      local value = stack[#stack]
      if value ~= UNKNOWN then
        value = truth(value)
        if value == nil then return nil, "TYPE_MISMATCH" end
        if op == "NOT" then value = not value end
        stack[#stack] = value
      end
    elseif op == "COMPARE" then
      if #stack < 2 then return nil, "STACK_UNDERFLOW" end
      local right, left = table.remove(stack), table.remove(stack)
      local result = UNKNOWN
      if left ~= UNKNOWN and right ~= UNKNOWN then
        if type(left) ~= type(right) then return nil, "TYPE_MISMATCH" end
        local operator = instruction.operator
        if operator == "eq" then result = left == right
        elseif operator == "ne" then result = left ~= right
        elseif not V.IsFiniteNumber(left) then return nil, "TYPE_MISMATCH"
        elseif operator == "lt" then result = left < right
        elseif operator == "lte" then result = left <= right
        elseif operator == "gt" then result = left > right
        elseif operator == "gte" then result = left >= right
        else return nil, "INVALID_OPERATOR" end
      end
      stack[#stack + 1] = result
    elseif op == "ALL" or op == "ANY" then
      local count = instruction.count
      if not V.IsPositiveInteger(count) or count > #stack then return nil, "STACK_UNDERFLOW" end
      local result, unavailable = op == "ALL", false
      for _ = 1, count do
        local value = table.remove(stack)
        if value == UNKNOWN then unavailable = true
        elseif type(value) ~= "boolean" then return nil, "TYPE_MISMATCH"
        elseif op == "ALL" then result = result and value
        else result = result or value end
      end
      if unavailable then stack[#stack + 1] = UNKNOWN else stack[#stack + 1] = result end
    else return nil, "INVALID_INSTRUCTION" end
  end
  if #stack ~= 1 then return nil, "STACK_REMAINDER" end
  if stack[1] == UNKNOWN then return nil, "STATE_UNAVAILABLE" end
  if type(stack[1]) ~= "boolean" then return nil, "TYPE_MISMATCH" end
  return stack[1], "OK"
end

Spynon.RotationProgram = Program
