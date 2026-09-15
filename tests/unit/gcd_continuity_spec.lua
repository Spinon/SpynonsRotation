local passed, total, failures = 0, 0, {}
local function eq(a,b)
  if a ~= b then error("expected " .. tostring(b) .. ", got " .. tostring(a), 2) end
end
local function test(name, fn)
  total = total + 1
  local ok, err = pcall(fn)
  if ok then passed = passed + 1 else failures[#failures+1] = name .. ": " .. tostring(err) end
  print((ok and "[PASS] " or "[FAIL] ") .. name)
end
local frames = assert(loadfile("tests/fixtures/specs/frame_environment.lua"))()
CreateFrame = frames()
local ns = {}
for line in io.lines("addon/SpynonRotation.toc") do
  local file = line:match("^([^#].*%.lua)%s*$")
  if file then assert(loadfile("addon/" .. file))("SpynonRotation", ns) end
end
local function fixture()
  local touched = 0
  local function forbidden() touched = touched + 1; error("restricted access") end
  local secret = setmetatable({}, {__index=forbidden,__tostring=forbidden,__lt=forbidden,__add=forbidden})
  local data = {active=false, gcd=false, enabled=true, usable=true, own={}, gcdReads=0}
  local module = ns.Classes.Shaman.Enhancement.Module
  local selected = {specialization={specId=263},heroTree={id=54},module=module,activeSpellRanks={}}
  for _, talent in ipairs(ns.Classes.Shaman.Enhancement.Catalog.talents) do
    selected.activeSpellRanks[talent.spellId] = 1
  end
  local env = {
    UIParent={}, issecretvalue=function(v) return rawequal(v,secret) end,
    GetTime=function() return 10 end, UnitAffectingCombat=function() return true end,
    C_Secrets={ShouldSpellCooldownBeSecret=function() return true end,
      ShouldSpellAuraBeSecret=function() return true end, ShouldUnitPowerBeSecret=function() return true end},
    C_Spell={GetSpellTexture=function() return 1234 end, IsSpellUsable=function() return data.usable end,
      GetSpellCooldown=function(id)
        if data.container then return data.container end
        return setmetatable({isActive=data.own[id] or data.active,isEnabled=data.enabled}, {__index=function(_,key)
          if key == "isOnGCD" then
            data.gcdReads = data.gcdReads + 1
            if data.denyGCD then error("denied optional flag") end
            if data.own[id] then return false end
            return data.gcd
          end
          return forbidden()
        end})
      end},
  }
  local compat = ns.CompatFactory.Create(env)
  local engine = ns.StateEngineFactory.Create(compat, {Capture=function()
    return ns.CompatInternal.Result.Success(selected)
  end})
  local service = ns.RecommendationEngine.Create(engine, ns.Specs, compat.State)
  engine:HandleEvent("PLAYER_ENTERING_WORLD"); service:Start()
  local createFrame, objects = frames()
  local settings = ns.SettingsFactory.Create(); settings:Set("count",6)
  local controller = ns.QueueControllerFactory.Create(service, compat.Media, createFrame,
    nil,nil,nil,nil,nil,settings)
  controller:Start()
  controller:GetView():SetMotionMode("OFF")
  return data, compat, engine, service, controller, objects, secret, function() return touched end
end
test("Retail-like Totemic event pipeline stays visible ready -> GCD -> ready without retaining own cooldowns", function()
  local data, compat, engine, service, controller, objects = fixture()
  local view, initial = controller:GetView(), service:GetRecommendations()
  assert(#initial > 0); eq(view:GetRoot().visible,true)
  local count, surviving, id = #objects
  for _, rec in ipairs(initial) do
    if rec.action.id ~= "enhancement.stormstrike" then
      id = rec.id; surviving = view:GetFrameForId(id); break
    end
  end
  assert(surviving)
  data.active, data.gcd, data.own[17364] = true, true, true
  engine:HandleEvent("SPELL_UPDATE_COOLDOWN")
  local waiting = service:GetRecommendations()
  assert(#waiting > 0); eq(view:GetRoot().visible,true); eq(view:GetFrameForId(id),surviving)
  for _, rec in ipairs(waiting) do
    eq(rec.readiness,"WAITING_GCD"); assert(rec.action.id ~= "enhancement.stormstrike")
    eq(ns.Contracts.Recommendation.IsRuntimeSafe(rec),true)
    local ready, reason = ns.StateReader.Create(engine:GetSnapshot(),compat.State):IsReady(rec.action)
    eq(ready,false); eq(reason,"WAITING_GCD")
  end
  local visibleTags = 0
  for _, object in ipairs(objects) do
    if object.kind == "FontString" and object.text == "GCD" and object.visible then visibleTags = visibleTags + 1 end
  end
  eq(visibleTags,#waiting); eq(#objects,count)
  for _, object in ipairs(objects) do
    if object.kind == "Texture" and object.parent == surviving and object.texture == 1234 then
      eq(object.alpha,0.55)
    end
  end
  data.active, data.gcd, data.own = false, false, {}
  engine:HandleEvent("SPELL_UPDATE_COOLDOWN")
  eq(view:GetRoot().visible,true); eq(view:GetFrameForId(id),surviving)
  for _, rec in ipairs(service:GetRecommendations()) do eq(rec.readiness,"READY") end
  for _, object in ipairs(objects) do
    if object.kind == "FontString" and object.text == "GCD" then eq(object.visible,false) end
    if object.kind == "Texture" and object.parent == surviving and object.texture == 1234 then eq(object.alpha,1) end
  end
  eq(#objects,count)
end)
test("GCD updates during consume and promotion keep the normal animator alive and bounded", function()
  local data, _, engine, _, controller, objects = fixture()
  local view = controller:GetView(); view:SetMotionMode("NORMAL")
  local count = #objects
  view:ConfirmCast(17364)
  data.active, data.gcd, data.own[17364] = true, true, true
  engine:HandleEvent("SPELL_UPDATE_COOLDOWN")
  eq(view:GetRoot().visible,true)
  local tick = view:GetRoot().scripts.OnUpdate
  if tick then tick(view:GetRoot(),0.05) end
  data.active, data.gcd, data.own = false, false, {}
  engine:HandleEvent("SPELL_UPDATE_COOLDOWN")
  eq(view:GetRoot().visible,true)
  tick = view:GetRoot().scripts.OnUpdate
  if tick then tick(view:GetRoot(),1) end
  eq(view:GetRoot().visible,true); eq(#objects,count)
end)
test("GCD flag is indexed only on its documented event and cleared on other cooldown refreshes", function()
  local data, _, engine, service = fixture()
  eq(data.gcdReads,0)
  data.active, data.gcd = true, true
  engine:HandleEvent("SPELL_UPDATE_COOLDOWN"); assert(data.gcdReads > 0)
  local reads = data.gcdReads
  for _, event in ipairs({"UNIT_AURA","SPELL_UPDATE_USABLE","PLAYER_TARGET_CHANGED"}) do
    engine:HandleEvent(event,"player")
    assert(#service:GetRecommendations() > 0); eq(data.gcdReads,reads)
  end
  engine:HandleEvent("SPELL_UPDATE_CHARGES")
  eq(data.gcdReads,reads); eq(#service:GetRecommendations(),0)
  engine:HandleEvent("SPELL_UPDATE_COOLDOWN"); assert(#service:GetRecommendations() > 0)
  engine:HandleEvent("PLAYER_TALENT_UPDATE"); eq(#service:GetRecommendations(),0)
end)
test("restriction invalidation withdraws waiting advice immediately without a hold timer", function()
  local data, _, engine, service, controller = fixture()
  data.active, data.gcd = true, true; engine:HandleEvent("SPELL_UPDATE_COOLDOWN")
  assert(#service:GetRecommendations() > 0)
  local reads = data.gcdReads
  engine:HandleEvent("ADDON_RESTRICTION_STATE_CHANGED")
  eq(#service:GetRecommendations(),0); eq(controller:GetView():GetRoot().visible,false)
  eq(data.gcdReads,reads); eq(next(engine:GetSnapshot().cooldowns),nil)
end)
test("unknown, secret, denied, false and malformed GCD flags never create waiting advice", function()
  for _, kind in ipairs({"nil","secret","denied","false","number","container"}) do
    local data, _, engine, service, _, _, secret, touched = fixture()
    data.active = true
    if kind == "nil" then data.gcd = nil
    elseif kind == "secret" then data.gcd = secret
    elseif kind == "denied" then data.denyGCD = true
    elseif kind == "number" then data.gcd = 1
    elseif kind == "container" then data.container = secret end
    engine:HandleEvent("SPELL_UPDATE_COOLDOWN")
    eq(#service:GetRecommendations(),0); eq(touched(),0)
  end
end)
test("unusable, held and protected conditions stay excluded during a public GCD", function()
  local data, _, engine, service = fixture()
  data.active, data.gcd = true, true
  engine:HandleEvent("SPELL_UPDATE_COOLDOWN")
  for _, rec in ipairs(service:GetRecommendations()) do assert(rec.action.id ~= "enhancement.lightning_bolt") end
  data.usable = false; engine:HandleEvent("SPELL_UPDATE_USABLE"); eq(#service:GetRecommendations(),0)
  data.usable, data.enabled = true, false
  engine:HandleEvent("SPELL_UPDATE_COOLDOWN"); eq(#service:GetRecommendations(),0)
end)
test("waiting metadata survives presentation and rejects unknown contract states", function()
  local data, compat, engine, service = fixture()
  data.active, data.gcd = true, true; engine:HandleEvent("SPELL_UPDATE_COOLDOWN")
  local rec = service:GetRecommendations()[1]
  eq(compat.Media:Present({rec})[1].readiness,"WAITING_GCD")
  rec.readiness = "ESTIMATED_READY"; eq(ns.Contracts.Recommendation.Validate(rec),false)
  eq(#compat.Media:Present({rec}),0)
end)
test("debug identifies waiting recommendations without serializing timing values", function()
  local data, compat, engine, service = fixture()
  data.active, data.gcd = true, true; engine:HandleEvent("SPELL_UPDATE_COOLDOWN")
  local report = ns.DebugReport.Capture(engine,service,compat.State)
  eq(report.readiness.WAITING_GCD,#service:GetRecommendations())
  eq(report.readiness.UNKNOWN,nil)
end)
print("GCD continuity: " .. passed .. "/" .. total .. " passed")
for _, failure in ipairs(failures) do print(failure) end
if passed ~= total then os.exit(1) end
