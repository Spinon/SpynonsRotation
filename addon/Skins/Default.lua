local _, Spynon = ...
local ROOT = "Interface\\AddOns\\SpynonRotation\\UI\\Media\\Textures\\"
-- Approved technical assets. This is the replacement point; never put rotation logic in a skin.
Spynon.DefaultSkinDefinition = {
  schemaVersion = 1, id = "spynon.default", label = "Spynon",
  defaults = Spynon.SettingsFactory.Defaults(),
  tokens = {
    queue = {
      offsetY = -130, rowInset = 6, iconTrim = 0.02,
      current = { width = 200, height = 120,
        texture = ROOT .. "Actions\\action-current-neutral-v1.tga",
        uv = {0.109375, 0.890625, 0.03125, 0.96875},
        iconX = 20, iconY = 11, iconWidth = 158, iconHeight = 94 },
      queued = { width = 80, height = 80,
        texture = ROOT .. "Actions\\action-queue-neutral-v1.tga", uv = {0.03125, 0.96875, 0.03125, 0.96875},
        iconX = 12, iconY = 8, iconWidth = 57, iconHeight = 59 },
    },
    colors = {
      text = {0.94, 0.97, 1, 1}, muted = {0.55, 0.6, 0.66, 1}, placeholder = {0.07, 0.09, 0.12, 1},
      flash = {0.8, 0.87, 0.94, 1}, swipe = {0.25, 0.27, 0.3, 0.8},
      gcdTrack = {0.027, 0.075, 0.114, 0.86}, gcdFill = {0.847, 0.882, 0.91, 1},
      buff = {0.027, 0.533, 0.847, 1}, debuff = {0.898, 0.282, 0.302, 1},
      stable = {0.259, 0.788, 0.243, 1}, attention = {1, 0.68, 0.15, 1}, refresh = {0.898, 0.282, 0.302, 1},
      unavailable = {0.65, 0.68, 0.72, 1},
    },
    auras = {
      background = ROOT .. "Auras\\aura-juggle-cell-neutral-v1.tga",
      channel = ROOT .. "Auras\\aura-juggle-cell-primary-mask-v1.tga",
      shelf = ROOT .. "Auras\\aura-juggle-cell-state-shelf-mask-v1.tga",
      uv = {0.001953125, 0.998046875, 0.1875, 0.8125},
    },
    typography = { fontObject = "GameFontNormalSmall" },
  },
}
