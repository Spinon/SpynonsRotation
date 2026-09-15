local passed,total,failures=0,0,{}
local function eq(a,b) if a~=b then error("values differ") end end
local function test(name,fn)
  total=total+1; local ok,err=pcall(fn)
  if ok then passed=passed+1 else failures[#failures+1]=name .. ": " .. tostring(err) end
  print((ok and "[PASS] " or "[FAIL] ") .. name)
end
local frames=assert(loadfile("tests/fixtures/specs/frame_environment.lua"))()
CreateFrame=frames(); local ns={}
for line in io.lines("addon/SpynonRotation.toc") do
  local file=line:match("^([^#].*%.lua)%s*$")
  if file then assert(loadfile("addon/" .. file))("SpynonRotation",ns) end
end
local function fixture()
  local touched=0
  local function forbidden() touched=touched+1; error("opaque sentinel operated on") end
  local secret=setmetatable({}, {__index=forbidden,__tostring=forbidden,__lt=forbidden,__le=forbidden,
    __add=forbidden,__sub=forbidden,__mul=forbidden,__div=forbidden,__concat=forbidden})
  local data={aura={applications=1,duration=20,expirationTime=30,isFromPlayerOrPlayerPet=true},
    cooldown={startTime=0,duration=0,modRate=1,isEnabled=true},
    charges={currentCharges=1,maxCharges=2,cooldownStartTime=0,cooldownDuration=20,chargeModRate=1}}
  local env={issecretvalue=function(value) return rawequal(value,secret) end,
    GetTime=function() return 10 end, UnitAffectingCombat=function() return false end,
    UnitExists=function() return true end,UnitIsVisible=function() return true end,
    C_Secrets={ShouldSpellAuraBeSecret=function() return false end,
      ShouldSpellCooldownBeSecret=function() return false end},
    C_UnitAuras={GetUnitAuraBySpellID=function() return data.aura end},
    C_Spell={GetSpellCooldown=function() return data.cooldown end,GetSpellCharges=function() return data.charges end,
      IsSpellUsable=function() return true end}}
  return ns.CompatFactory.Create(env),env,data,secret,function() return touched end
end
local queries={aura=function(state) return state:ReadAura("player",101) end,
  cooldown=function(state) return state:ReadCooldown(101) end,charges=function(state) return state:ReadCharges(101) end}
for _,case in ipairs({{"aura","applications"},{"aura","duration"},{"aura","expirationTime"},
  {"cooldown","startTime"},{"cooldown","duration"},{"cooldown","modRate"},{"cooldown","isEnabled"},
  {"charges","currentCharges"},{"charges","maxCharges"},{"charges","cooldownStartTime"},
  {"charges","cooldownDuration"},{"charges","chargeModRate"}}) do
  test("secret leaf is rejected before operation: " .. case[1] .. "." .. case[2],function()
    local compat,_,data,secret,touched=fixture(); data[case[1]][case[2]]=secret
    local result=queries[case[1]](compat.State)
    eq(result.ok,false); eq(result.code,"SECRET_RESTRICTED"); eq(result.value,nil); eq(touched(),0)
  end)
end
for _,kind in ipairs({"aura","cooldown","charges"}) do
  test("secret container is rejected before indexing: " .. kind,function()
    local compat,_,data,secret,touched=fixture(); data[kind]=secret
    eq(queries[kind](compat.State).code,"SECRET_RESTRICTED"); eq(touched(),0)
  end)
  test("denied indexing becomes controlled failure and a later read recovers: " .. kind,function()
    local compat,_,data=fixture(); local original=data[kind]
    data[kind]=setmetatable({}, {__index=function() error("do not leak this detail") end})
    local result=queries[kind](compat.State); eq(result.ok,false); eq(result.code,"CALL_FAILED")
    eq(result.value,nil); data[kind]=original; eq(queries[kind](compat.State).ok,true)
  end)
end
test("optional aura ownership may be denied without converting it into player ownership",function()
  local compat,_,data=fixture(); data.aura.isFromPlayerOrPlayerPet=nil
  setmetatable(data.aura,{__index=function() error("owner inaccessible") end})
  local result=compat.State:ReadAura("target",101); eq(result.ok,true); eq(result.value.playerOwned,nil)
end)
test("secret event cast identity is discarded without stringification",function()
  local compat,_,_,secret,touched=fixture()
  eq(compat.Media:ConfirmedPlayerSpell(secret,101),nil)
  eq(compat.Media:ConfirmedPlayerSpell("player",secret),nil); eq(touched(),0)
end)
test("secret profile identity cannot be formatted or become a persistence key",function()
  local compat,env,_,secret,touched=fixture(); env.UnitGUID=function() return secret end
  env.C_SpecializationInfo={GetSpecialization=function() return secret end}
  local identity=compat.Profiles:ReadIdentity(); eq(next(identity),nil); eq(touched(),0)
end)
test("secret slash input is dropped before parsing or reaching handlers",function()
  local compat,env,_,secret,touched=fixture(); local calls=0
  compat.Console:Register(function() calls=calls+1 end)
  env.SlashCmdList.SPYNONROTATION(secret); eq(calls,0); eq(touched(),0)
end)
test("denied table field cannot wedge the event engine or preserve earlier advice",function()
  local compat,_,data=fixture()
  local module={getStateQueries=function() return {cooldowns={{id="audit.spell",spellId=101}}} end}
  local detector={Capture=function() return ns.CompatInternal.Result.Success({
    specialization={specId=9101},module=module,activeSpellRanks={}}) end}
  local engine=ns.StateEngineFactory.Create(compat,detector)
  assert(engine:HandleEvent("PLAYER_ENTERING_WORLD")); assert(engine:GetSnapshot().cooldowns["audit.spell"])
  local original=data.cooldown
  data.cooldown=setmetatable({}, {__index=function() error("inaccessible field") end})
  assert(engine:HandleEvent("SPELL_UPDATE_COOLDOWN"))
  local state=engine:GetSnapshot(); eq(state.cooldowns["audit.spell"],nil)
  eq(state.capabilities["cooldowns.audit.spell"],"CONDITIONALLY_SECRET")
  data.cooldown=original; assert(engine:HandleEvent("SPELL_UPDATE_COOLDOWN"))
  assert(engine:GetSnapshot().cooldowns["audit.spell"])
end)
print("Secret boundary audit: " .. passed .. "/" .. total .. " passed")
for _,failure in ipairs(failures) do print(failure) end
if passed~=total then os.exit(1) end
