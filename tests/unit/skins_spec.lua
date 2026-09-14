local passed, total, failures = 0, 0, {}
local function eq(a,b) if a ~= b then error("expected " .. tostring(b) .. ", got " .. tostring(a)) end end
local function test(name, fn)
  total=total+1; local ok, err=pcall(fn)
  if ok then passed=passed+1 else failures[#failures+1]=name .. ": " .. tostring(err) end
  print((ok and "[PASS] " or "[FAIL] ") .. name)
end
local factory=assert(loadfile("tests/fixtures/specs/frame_environment.lua"))()
CreateFrame=factory(); local ns={}
for line in io.lines("addon/SpynonRotation.toc") do
  local file=line:match("^([^#].*%.lua)%s*$")
  if file then assert(loadfile("addon/" .. file))("SpynonRotation", ns) end
end
local function definition(tokens, defaults)
  return {schemaVersion=1, id="fixture.skin", label="Fixture", tokens=tokens, defaults=defaults}
end
local function rec(id)
  return ns.Contracts.Recommendation.Create({id="fixture." .. id,action={id="fixture." .. id,kind="spell",
    gameId=101,icon=123,label=id,capability="ADDON_AVAILABLE"},priority=1,
    reason={code="FIXTURE",capability="ADDON_AVAILABLE"}})
end
local context={character="Player-999-ABCDEF",specId=9101}
local function database() return {schemaVersion=1,global={},characters={}} end

test("default skin preserves approved textures geometry colors and preference defaults", function()
  local tokens=ns.Skin:GetTokens()
  eq(ns.Skin:GetIdentity(), "spynon.default"); eq(tokens.queue.current.width, 200)
  eq(tokens.queue.current.iconWidth, 158); eq(tokens.queue.queued.iconX, 12); eq(tokens.queue.iconTrim, 0.02)
  assert(tokens.queue.current.texture:find("action-current-neutral-v1.tga", 1, true))
  for key,value in pairs(ns.SettingsFactory.Defaults()) do eq(ns.Skin:Resolve()[key],value) end
end)

test("partial token definitions inherit unspecified leaves without changing default", function()
  local skin=assert(ns.SkinFactory.Create(definition({colors={text={0.2,0.3,0.4,1}}})))
  eq(skin:GetTokens().colors.text[1],0.2); eq(skin:GetTokens().queue.current.width,200)
  eq(ns.Skin:GetTokens().colors.text[1],0.94)
end)

test("compiled skins and returned snapshots are isolated from subsequent mutations", function()
  local source=definition({queue={offsetY=-50}}, {spacing=16})
  local skin=assert(ns.SkinFactory.Create(source)); source.tokens.queue.offsetY=-200; source.defaults.spacing=4
  local tokens=skin:GetTokens(); tokens.queue.offsetY=-300
  local values=skin:Resolve(); values.spacing=4
  eq(skin:GetTokens().queue.offsetY,-50); eq(skin:Resolve().spacing,16)
  local original=ns.SkinFactory.DefaultDefinition(); original.tokens.queue.current.width=1
  eq(ns.SkinFactory.DefaultDefinition().tokens.queue.current.width,200)
end)

test("skins reject executable values and unknown logic fields", function()
  local source=definition(); source.rotation=function() error("must not execute") end
  eq(ns.SkinFactory.Create(source),nil)
  eq(ns.SkinFactory.Create(definition({queue={offsetY=function() error("must not execute") end}})),nil)
  eq(ns.SkinFactory.Create(definition({colors={execute=function() end}})),nil)
end)

test("metatables are rejected before hooks can be invoked", function()
  local calls=0; local meta={__index=function() calls=calls+1; error("hook") end}
  eq(ns.SkinFactory.Create(setmetatable({},meta)),nil)
  eq(ns.SkinFactory.Create(definition({queue=setmetatable({},meta)})),nil)
  eq(ns.SkinFactory.Create(definition(nil,setmetatable({},meta))),nil); eq(calls,0)
end)

test("cyclic and wrong-shaped token values are rejected", function()
  local cycle={}; cycle.current=cycle
  eq(ns.SkinFactory.Create(definition({queue=cycle})),nil)
  eq(ns.SkinFactory.Create(definition({queue={current={width={}}}})),nil)
  eq(ns.SkinFactory.Create(definition({colors={text={0.1,0.2,0.3,1,2}}})),nil)
end)

test("invalid version identity and unrecognized preference defaults cannot compile", function()
  local source=definition(); source.schemaVersion=2; eq(ns.SkinFactory.Create(source),nil)
  source=definition(); source.id="not an id"; eq(ns.SkinFactory.Create(source),nil)
  eq(ns.SkinFactory.Create(definition(nil,{count=99})),nil)
  eq(ns.SkinFactory.Create(definition(nil,{runCode="bad"})),nil)
end)

test("geometry and colors are finite bounded and keep openings inside frames", function()
  for _,patch in ipairs({{offsetY=math.huge},{iconTrim=0/0},{rowInset=-1},
    {current={width=0}},{current={iconX=1000}},{queued={iconHeight=999}},{current={width=99999}}}) do
    eq(ns.SkinFactory.Create(definition({queue=patch})),nil)
  end
  eq(ns.SkinFactory.Create(definition({colors={text={2,0,0,1}}})),nil)
end)

test("UV rectangles and texture paths accept only the supported local TGA contract", function()
  for _,path in ipairs({"https://example.test/asset.tga", "C:\\image.tga", "Interface\\AddOns\\Demo\\..\\image.tga",
    "Interface\\AddOns\\Demo\\asset.lua"}) do
    eq(ns.SkinFactory.Create(definition({queue={current={texture=path}}})),nil)
  end
  eq(ns.SkinFactory.Create(definition({queue={current={uv={1,0,0,1}}}})),nil)
  eq(ns.SkinFactory.Create(definition({auras={uv={0,1,-1,1}}})),nil)
end)

test("font selection is a native font object not an executable or arbitrary file path", function()
  eq(ns.SkinFactory.Create(definition({typography={fontObject="Fonts\\unknown.ttf"}})),nil)
  assert(ns.SkinFactory.Create(definition({typography={fontObject="GameFontNormal"}})))
end)

test("user settings override skin defaults and invalid overrides do not poison resolution", function()
  local skin=assert(ns.SkinFactory.Create(definition(nil,{spacing=16,moveDuration=220})))
  eq(skin:Resolve({spacing=4}).spacing,4); eq(skin:Resolve({spacing=999}).spacing,16)
  eq(skin:Resolve("wrong"),nil)
  local model=ns.SettingsFactory.Create(skin); eq(model:Get().spacing,16)
  model:Set("spacing",4); eq(model:Get().spacing,4)
end)

test("profiles retain skin global character spec precedence", function()
  local skin=assert(ns.SkinFactory.Create(definition(nil,{spacing=16})))
  local db=database(); local store=ns.ProfileStoreFactory.Create(db,skin)
  eq(store:Resolve(context).spacing,16)
  store:Set("spacing",4,context); store:Select("character",context); eq(store:Resolve(context).spacing,4)
  store:Set("spacing",8,context); store:Select("spec",context); eq(store:Resolve(context).spacing,8)
  store:Set("spacing",16,context); eq(store:Resolve(context).spacing,16)
  store:Reset(context); eq(store:Resolve(context).spacing,8)
  eq(db.global.spacing,4)
end)

test("reset preview reveals skin values instead of freezing built-in defaults", function()
  local skin=assert(ns.SkinFactory.Create(definition(nil,{spacing=16})))
  local db=database(); local store=ns.ProfileStoreFactory.Create(db,skin)
  store:Set("spacing",4,context)
  local preview=store:PreviewReset({spacing=true},context); eq(preview.spacing,16); eq(db.global.spacing,4)
  eq(store:ResetFields({spacing=true},store:Capture(context),preview,context),true)
  eq(db.global.spacing,nil); eq(store:Resolve(context).spacing,16)
end)

test("copying a profile snapshots its effective skin defaults as explicit overrides", function()
  local skin=assert(ns.SkinFactory.Create(definition(nil,{spacing=16})))
  local db=database(); local store=ns.ProfileStoreFactory.Create(db,skin)
  store:Select("character",context); store:Copy("global",context)
  eq(db.characters[context.character].values.spacing,16)
end)

test("queue consumes custom geometry but retains identity pool and user layout preferences", function()
  local skin=assert(ns.SkinFactory.Create(definition({queue={current={width=240,height=144,
    iconX=24,iconY=13.2,iconWidth=189.6,iconHeight=112.8}}}, {spacing=16})))
  local createFrame,objects=factory(); local model=ns.SettingsFactory.Create(skin)
  model:Set("spacing",4); local view=ns.QueueFactory.Create(createFrame,{},"OFF",model,skin)
  view:SetRecommendations({rec("one"),rec("two")}); local count=#objects
  eq(view:GetFrameForId("fixture.one").width,240)
  eq(view:GetFrameForId("fixture.two").point[5],-154)
  local second=view:GetFrameForId("fixture.two"); view:SetRecommendations({rec("two"),rec("one")})
  eq(view:GetFrameForId("fixture.two"),second); eq(second.width,240); eq(#objects,count)
end)

test("queue without an injected settings model still uses explicit skin defaults", function()
  local skin=assert(ns.SkinFactory.Create(definition(nil,{count=1,scale=0.75})))
  local view=ns.QueueFactory.Create(factory(),{},"OFF",nil,skin)
  view:SetRecommendations({rec("one"),rec("two")})
  eq(view:GetFrameForId("fixture.two"),nil); eq(view:GetRoot().scale,0.75)
end)

test("overlay typography swipe and color tokens flow to native widget properties", function()
  local skin=assert(ns.SkinFactory.Create(definition({colors={swipe={0.1,0.2,0.3,0.4}},
    typography={fontObject="GameFontNormal"}})))
  local createFrame,objects=factory(); local frame=createFrame("Frame"); local icon=frame:CreateTexture()
  ns.CooldownOverlayFactory.Create(createFrame,frame,icon,skin)
  local found=false
  for _,object in ipairs(objects) do
    if object.kind=="Cooldown" then eq(object.swipeColor[1],0.1); eq(object.swipeColor[4],0.4); found=true end
    if object.kind=="FontString" then eq(object.template,"GameFontNormal") end
  end
  eq(found,true)
end)

test("skin animation defaults are used by queue without changing recommendation content", function()
  local skin=assert(ns.SkinFactory.Create(definition(nil,{enterDuration=260})))
  local view=ns.QueueFactory.Create(factory(),{},nil,nil,skin); local item=rec("one")
  view:SetRecommendations({item}); local frame=view:GetFrameForId(item.id)
  view:GetRoot().scripts.OnUpdate(view:GetRoot(),0.18); assert(frame.alpha<1)
  view:GetRoot().scripts.OnUpdate(view:GetRoot(),0.09); eq(view:GetRoot().scripts.OnUpdate,nil)
  eq(item.action.gameId,101); eq(item.priority,1); eq(item.reason.code,"FIXTURE")
end)

test("session-only reset reveals the model skin rather than built-in defaults", function()
  local skin=assert(ns.SkinFactory.Create(definition(nil,{spacing=16})))
  local model=ns.SettingsFactory.Create(skin)
  local history=ns.HistoryBinding.Create(model,nil,function() return true end)
  history:Execute("spacing",4); history:PreviewReset({spacing=true}); eq(model:Get().spacing,16)
  history:Cancel(); eq(model:Get().spacing,4)
  history:PreviewReset({spacing=true}); history:Commit(); eq(model:Get().spacing,16)
end)

test("aura state masks receive skin colors without changing semantic labels", function()
  local skin=assert(ns.SkinFactory.Create(definition({colors={buff={0.1,0.2,0.3,1},stable={0.3,0.4,0.5,1}}})))
  local createFrame,objects=factory()
  local view=ns.AuraIndicatorsFactory.Create(createFrame,{}, {ReadClock=function() return {ok=true,value=10} end},skin)
  local value={id="fixture.aura",label="Signal",kind="buff",spellId=101,state="STABLE",attentionSeconds=3}
  eq(view:Set({value}),true)
  local colors, label=false,false
  for _,object in ipairs(objects) do
    if object.vertexColor and object.vertexColor[1]==0.3 then colors=true end
    if object.text=="Buff: Signal" then label=true end
  end
  eq(colors,true); eq(label,true); eq(value.state,"STABLE")
  view:Clear(); eq(view:GetRoot().scripts.OnUpdate,nil)
end)

print(string.format("Declarative skins: %d/%d passed",passed,total))
for _,failure in ipairs(failures) do print(failure) end
if passed~=total then os.exit(1) end
