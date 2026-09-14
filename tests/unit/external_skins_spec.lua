local passed,total,failures=0,0,{}
local function eq(a,b) if a~=b then error("expected " .. tostring(b) .. ", got " .. tostring(a)) end end
local function test(name,fn)
  total=total+1; local ok,err=pcall(fn)
  if ok then passed=passed+1 else failures[#failures+1]=name .. ": " .. tostring(err) end
  print((ok and "[PASS] " or "[FAIL] ") .. name)
end
local factory=assert(loadfile("tests/fixtures/specs/frame_environment.lua"))()
CreateFrame=factory(); local ns={}
for line in io.lines("addon/SpynonRotation.toc") do
  local file=line:match("^([^#].*%.lua)%s*$")
  if file then assert(loadfile("addon/" .. file))("SpynonRotation",ns) end
end
local function fixture()
  local registry=ns.SkinRegistryFactory.Create(); local env={}
  eq(ns.SkinPublicAPI.Export(env,registry),true)
  return env.SpynonRotationSkins,registry
end
local function definition(id)
  return {schemaVersion=1,id=id or "example.demo",label="Example",defaults={spacing=16}}
end

test("public API is versioned and exposes registration plus copied read-only discovery",function()
  local api=fixture(); eq(api.apiVersion,1); eq(type(api.Register),"function")
  eq(type(api.Get),"function"); eq(type(api.List),"function"); eq(api.Select,nil)
  eq(api.Register("Example",definition()),true); eq(#api.List(),2)
  local data,owner=api.Get("example.demo"); eq(owner,"Example"); eq(data.defaults.spacing,16)
end)

test("exact external example loads in a separate addon namespace and registers once",function()
  local api=fixture(); local chunk=assert(loadfile("examples/SpynonSkin_Example/Skin.lua"))
  setfenv(chunk,{SpynonRotationSkins=api,type=type})
  local ok,reason=chunk("SpynonSkin_Example",{}); eq(ok,true); eq(reason,"REGISTERED")
  local data,owner=api.Get("spynonskin_example.demo")
  eq(owner,"SpynonSkin_Example"); eq(data.defaults.spacing,16)
  eq(data.tokens.colors.text[1],0.9); eq(chunk("SpynonSkin_Example",{}),false)
end)

test("example fails closed when base API is missing incompatible or malformed",function()
  for _,api in ipairs({false,true,{}, {apiVersion=2}, {apiVersion=1,Register=true}}) do
    local chunk=assert(loadfile("examples/SpynonSkin_Example/Skin.lua"))
    setfenv(chunk,{SpynonRotationSkins=api,type=type}); eq(chunk("SpynonSkin_Example",{}),nil)
  end
end)

test("duplicate registration never replaces the original definition even from the same owner",function()
  local api=fixture(); api.Register("Example",definition())
  local source=definition(); source.defaults.spacing=4
  local ok,reason=api.Register("Example",source); eq(ok,false); eq(reason,"DUPLICATE_ID")
  eq(api.Get("example.demo").defaults.spacing,16)
end)

test("owner namespace and builtin identity conflicts are rejected without mutation",function()
  local api=fixture()
  local ok,reason=api.Register("Other",definition()); eq(ok,false); eq(reason,"NAMESPACE_MISMATCH")
  ok,reason=api.Register("Spynon",definition("spynon.default")); eq(ok,false); eq(reason,"DUPLICATE_ID")
  eq(api.Get("spynon.default").label,"Spynon"); eq(#api.List(),1)
end)

test("schema version mismatch returns an explicit stable error",function()
  local api=fixture(); local source=definition(); source.schemaVersion=2
  local ok,reason=api.Register("Example",source); eq(ok,false); eq(reason,"UNSUPPORTED_VERSION")
  eq(#api.List(),1)
end)

test("registration rejects malformed owners payloads and executable definitions",function()
  local api=fixture()
  for _,owner in ipairs({"", "bad owner", "../Example", true, {}}) do eq(api.Register(owner,definition()),false) end
  eq(api.Register("Example",true),false)
  local source=definition(); source.tokens={colors={text=function() error("never") end}}
  eq(api.Register("Example",source),false)
  eq(api.Register("Example",setmetatable({}, {__index=function() error("never") end})),false)
end)

test("external assets can reference only their declared package or built-in fallback assets",function()
  local api=fixture(); local source=definition()
  source.tokens={queue={current={texture="Interface\\AddOns\\Other\\border.tga"}}}
  local ok,reason=api.Register("Example",source); eq(ok,false); eq(reason,"FOREIGN_ASSET_PACKAGE")
  source.tokens.queue.current.texture="Interface\\AddOns\\Example\\border.tga"
  eq(api.Register("Example",source),true)
end)

test("missing or invalid identities resolve to builtin skin internally but public Get reports absence",function()
  local api,registry=fixture()
  local skin,reason=registry:Resolve("missing.demo")
  eq(skin:GetIdentity(),"spynon.default"); eq(reason,"FALLBACK_UNKNOWN_SKIN")
  eq(api.Get("missing.demo"),nil); eq(api.Get({}),nil); eq(registry:Resolve({}):GetIdentity(),"spynon.default")
end)

test("caller mutations cannot affect registered data or discovery results",function()
  local api=fixture(); local source=definition(); api.Register("Example",source)
  source.defaults.spacing=4
  local data=api.Get("example.demo"); data.defaults.spacing=8; data.tokens.queue.current.width=1
  local list=api.List(); list[1].label="mutated"; list[2]=nil
  eq(api.Get("example.demo").defaults.spacing,16); eq(api.Get("example.demo").tokens.queue.current.width,200)
  eq(#api.List(),2); eq(api.Get("spynon.default").label,"Spynon")
end)

test("discovery order is deterministic independent of registration order",function()
  local api=fixture(); api.Register("Example",definition("example.z")); api.Register("Example",definition("example.a"))
  eq(api.List()[1].id,"example.a"); eq(api.List()[2].id,"example.z")
end)

test("registry is bounded and duplicate checks remain deterministic when full",function()
  local api=fixture()
  for index=1,31 do eq(api.Register("Example",definition("example.n" .. index)),true) end
  local ok,reason=api.Register("Example",definition("example.overflow")); eq(ok,false); eq(reason,"REGISTRY_FULL")
  ok,reason=api.Register("Example",definition("example.n1")); eq(ok,false); eq(reason,"DUPLICATE_ID")
  eq(#api.List(),32)
end)

test("export refuses to overwrite an existing global even if it is not a table",function()
  for _,original in ipairs({false,true,"foreign",{apiVersion=2}}) do
    local environment={SpynonRotationSkins=original}
    local ok,reason=ns.SkinPublicAPI.Export(environment,ns.SkinRegistryFactory.Create())
    eq(ok,false); eq(reason,"GLOBAL_CONFLICT"); eq(environment.SpynonRotationSkins,original)
  end
end)

test("registering metadata never changes the active skin or saved preferences",function()
  local api=fixture(); local model=ns.SettingsFactory.Create(); model:Set("spacing",4)
  local active=ns.Skin; api.Register("Example",definition())
  eq(ns.Skin,active); eq(model:Get().spacing,4); eq(ns.Skin:Resolve().spacing,8)
end)

test("external example definition is consumed by the real queue factory in an offline integration",function()
  local api,registry=fixture(); local chunk=assert(loadfile("examples/SpynonSkin_Example/Skin.lua"))
  setfenv(chunk,{SpynonRotationSkins=api,type=type}); chunk("SpynonSkin_Example",{})
  local skin=registry:Resolve("spynonskin_example.demo")
  local view=ns.QueueFactory.Create(factory(),{},"OFF",nil,skin)
  local function rec(id)
    return ns.Contracts.Recommendation.Create({id=id,action={id=id,kind="spell",gameId=101,icon=123,
      label=id,capability="ADDON_AVAILABLE"},priority=1,reason={code="FIXTURE",capability="ADDON_AVAILABLE"}})
  end
  view:SetRecommendations({rec("fixture.one"),rec("fixture.two")})
  eq(view:GetFrameForId("fixture.two").point[5],-142); eq(view:GetRoot().scripts.OnUpdate,nil)
  eq(api.Get("spynonskin_example.demo").defaults.spacing,16)
end)

test("example TOC declares the base dependency and contains only existing local runtime files",function()
  local stream=assert(io.open("examples/SpynonSkin_Example/SpynonSkin_Example.toc"))
  local toc=stream:read("*a"); stream:close()
  assert(toc:find("## RequiredDeps: SpynonRotation",1,true)); assert(toc:find("## Interface: 120100",1,true))
  for line in toc:gmatch("[^\r\n]+") do
    if line:sub(1,1)~="#" then local file=assert(io.open("examples/SpynonSkin_Example/" .. line)); file:close() end
  end
end)

print(string.format("External skin registration: %d/%d passed",passed,total))
for _,failure in ipairs(failures) do print(failure) end
if passed~=total then os.exit(1) end
