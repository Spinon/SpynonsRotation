local total,passed,failures=0,0,{}
local function test(name,fn)
  total=total+1; local ok,err=pcall(fn)
  if ok then passed=passed+1 else failures[#failures+1]=name .. ": " .. tostring(err) end
  print((ok and "[PASS] " or "[FAIL] ") .. name)
end
local function fixture()
  local scripts,commands={},{}
  local env=setmetatable({SpynonRotationSkins={apiVersion=1},SpynonRotationDB={lastSmokeReport={
    schemaVersion=1,stateValid=true,recommendationsValid=true,uiCreated=true,
    visualInspection="PENDING",taintInspection="PENDING"}}}, {__index=_G})
  env.CreateFrame=function() return {RegisterEvent=function() end,
    SetScript=function(_,event,fn) scripts[event]=fn end} end
  env.SlashCmdList={SPYNONROTATION=function(command) commands[#commands+1]=command end}
  local chunk=assert(loadfile("tests/headless/SpynonHeadlessProbe/Probe.lua")); setfenv(chunk,env); chunk()
  return env,scripts,commands
end
test("headless probe waits for world and confirms after one update only",function()
  local env,scripts,commands=fixture()
  assert(env.SpynonHeadlessProbeResult=="PENDING"); assert(scripts.OnUpdate==nil)
  scripts.OnEvent(); scripts.OnUpdate()
  assert(env.SpynonHeadlessProbeResult=="PASS:BOOTSTRAP_SMOKE:HEADLESS_ONLY")
  assert(#commands==10 and commands[1]=="test" and commands[9]=="demo stop" and commands[10]=="debug")
  assert(commands[6]=="edit" and commands[7]=="edit close")
  assert(scripts.OnUpdate==nil)
end)
test("missing bootstrap route cannot create a success marker",function()
  local env,scripts=fixture(); env.SlashCmdList={}; scripts.OnEvent()
  assert(not pcall(scripts.OnUpdate)); assert(env.SpynonHeadlessProbeResult=="PENDING")
end)
test("invalid runtime report or false Retail approval rejects the probe",function()
  for _,field in ipairs({"uiCreated","stateValid","recommendationsValid","visualInspection","taintInspection"}) do
    local env,scripts=fixture(); env.SpynonRotationDB.lastSmokeReport[field]=false
    scripts.OnEvent(); assert(not pcall(scripts.OnUpdate)); assert(env.SpynonHeadlessProbeResult=="PENDING")
  end
end)
print("Wowless probe fixture: " .. passed .. "/" .. total .. " passed")
for _,failure in ipairs(failures) do print(failure) end
if passed~=total then os.exit(1) end
