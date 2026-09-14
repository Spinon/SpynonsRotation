local addonName = ...
local api = SpynonRotationSkins
if type(api) ~= "table" or api.apiVersion ~= 1 or type(api.Register) ~= "function" then return end
-- Called once during addon loading, after RequiredDeps. No events, callbacks, frames or automatic selection.
local ok, reason = api.Register(addonName, {
  schemaVersion=1, id="spynonskin_example.demo", label="Exemplo técnico (não selecionado)",
  defaults={spacing=16}, tokens={colors={text={0.90,0.98,1,1}}},
})
-- Returning controlled results also allows the exact external file to be exercised by the fixture harness.
return ok, reason
