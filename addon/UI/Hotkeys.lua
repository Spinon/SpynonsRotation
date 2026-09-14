local _, Spynon = ...
local Hotkeys = {}
local NAMES = { MOUSEWHEELUP = "WU", MOUSEWHEELDOWN = "WD", SPACE = "SPC", BACKSPACE = "BS",
  DELETE = "DEL", INSERT = "INS", PAGEUP = "PU", PAGEDOWN = "PD", NUMPADPLUS = "N+", NUMPADMINUS = "N-" }
function Hotkeys.Format(key, compact)
  if type(key) ~= "string" or #key == 0 or #key > 64 or key:find("[%c|]") then return nil end
  if not compact then return key end
  local modifiers = ""
  while true do
    local prefix, rest = key:match("^(%u+)%-(.+)$")
    local short = prefix == "SHIFT" and "S" or prefix == "CTRL" and "C" or prefix == "ALT" and "A"
    if not short then break end
    modifiers, key = modifiers .. short, rest
  end
  key = NAMES[key] or key:gsub("^BUTTON(%d+)$", "M%1"):gsub("^NUMPAD(%d+)$", "N%1")
  return modifiers .. key
end
Spynon.Hotkeys = Hotkeys
