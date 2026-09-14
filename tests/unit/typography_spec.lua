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
local function defaults() return ns.SettingsFactory.Defaults() end
local function fonts()
  local create, objects=factory()
  local env={GameFontNormalSmall={GetFont=function() return "native.ttf" end},
    NumberFontNormal={GetFont=function() return "numbers.ttf" end}}
  env.CreateFont=function(name)
    local font=create("Font"); env[name]=font; return font
  end
  return ns.CompatFactory.Create(env).Fonts, env, create, objects
end
test("default uses native WoW with inherited roles and a legible outline", function()
  local values=defaults(); eq(values.textFont,"WOW"); eq(values.textOutline,"OUTLINE")
  for _,role in ipairs({"hotkey","cooldown","stacks","labels"}) do
    eq(values[role .. "Font"],"INHERIT"); eq(ns.Typography.Resolve(values,role).Font,"WOW")
  end
end)
test("closed preferences reject arbitrary paths sizes flags and invalid inheritance", function()
  for _,value in ipairs({"Fonts\\unknown.ttf", "https://font", "bad"}) do
    eq(ns.SettingsFactory.IsValue("textFont",value),false)
  end
  eq(ns.SettingsFactory.IsValue("textSize",50),false)
  eq(ns.SettingsFactory.IsValue("textFont","INHERIT"),false)
  eq(ns.SettingsFactory.IsValue("hotkeyOutline","INHERIT"),true)
end)
test("role overrides win and unknown values fall back through global to default", function()
  local values=defaults(); values.textSize=1.15; values.hotkeySize=0.85
  eq(ns.Typography.Resolve(values,"hotkey").Size,0.85)
  eq(ns.Typography.Resolve(values,"labels").Size,1.15)
  values.hotkeySize="bad"; eq(ns.Typography.Resolve(values,"hotkey").Size,1.15)
  values.textSize="bad"; eq(ns.Typography.Resolve(values,"hotkey").Size,1)
end)
test("native font adapter resolves available families and missing or throwing objects", function()
  local adapter,env=fonts()
  eq(adapter:Resolve("NUMBERS","default.ttf"),"numbers.ttf")
  env.NumberFontNormal=nil; eq(adapter:Resolve("NUMBERS","default.ttf"),"default.ttf")
  env.GameFontNormalSmall.GetFont=function() error("unavailable") end
  eq(adapter:Resolve("WOW","default.ttf"),"default.ttf")
end)
test("owned text applies size outline shadow and restores absent shadow", function()
  local adapter,_,create=fonts(); local text=create("FontString")
  local binding=ns.Typography.Bind(text,"fallback.ttf",adapter)
  local values=defaults(); values.textFont="NUMBERS"; values.textSize=1.15
  assert(binding:Apply(values,"hotkey",14)); eq(text.font,"numbers.ttf"); eq(text.fontSize,16)
  eq(text.fontFlags,"OUTLINE"); eq(text.shadowOffset[1],1); eq(text.shadowColor[4],0.8)
  values=defaults(); values.textOutline="NONE"; values.textShadow="NONE"
  binding:Apply(values,"hotkey",14); eq(text.fontFlags,""); eq(text.shadowColor[4],0)
  eq(text.shadowOffset[1],0); eq(text.font,"native.ttf")
end)
test("font load rejection and exceptions retry native fallback without losing text", function()
  local adapter,_,create=fonts(); local text=create("FontString"); text:SetText("Q")
  local original=text.SetFont
  text.SetFont=function(self,file,size,flags)
    if file=="numbers.ttf" then return false end
    if file=="native.ttf" then error("unavailable") end
    return original(self,file,size,flags)
  end
  local binding=ns.Typography.Bind(text,"fallback.ttf",adapter)
  local values=defaults(); values.textFont="NUMBERS"
  assert(binding:Apply(values,"hotkey",14)); eq(text.font,"fallback.ttf"); eq(text.text,"Q")
  assert(binding:Apply(defaults(),"hotkey",14)); eq(text.font,"fallback.ttf")
end)
test("missing fallback fails safely and font sizes remain bounded", function()
  local adapter=ns.CompatFactory.Create({}).Fonts; local create=factory(); local text=create("FontString")
  eq(ns.Typography.Bind(text,nil,adapter):Apply(defaults(),"labels",12),false)
  local binding=ns.Typography.Bind(text,"native.ttf",adapter)
  binding:Apply(defaults(),"labels",1); eq(text.fontSize,8)
  binding:Apply(defaults(),"labels",100); eq(text.fontSize,32)
end)
test("unchanged frame styles do not reset font or shadow during animation", function()
  local adapter,_,create=fonts(); local text=create("FontString"); local calls=0
  local original=text.SetFont; text.SetFont=function(self,...) calls=calls+1; return original(self,...) end
  local binding=ns.Typography.Bind(text,"native.ttf",adapter); local values=defaults()
  for _=1,100 do binding:Apply(values,"hotkey",14) end
  eq(calls,1); binding:Apply(values,"hotkey",13); eq(calls,2)
end)
test("countdown fonts are owned bounded and never overwrite global collisions", function()
  local adapter,env=fonts(); local foreign={}; env.SpynonRotationCountdownFont1=foreign
  local first,name=adapter:NewCountdown(); eq(name,"SpynonRotationCountdownFont2")
  eq(env[name],first); eq(env.SpynonRotationCountdownFont1,foreign)
  for _=3,64 do assert(adapter:NewCountdown()) end
  eq(adapter:NewCountdown(),nil)
end)
test("missing or throwing CreateFont leaves native cooldown untouched", function()
  eq(ns.CompatFactory.Create({}).Fonts:NewCountdown(),nil)
  eq(ns.CompatFactory.Create({CreateFont=function() error("unavailable") end}).Fonts:NewCountdown(),nil)
end)
test("cooldown typography changes only presentation and preserves opaque durations", function()
  local adapter,env,create,objects=fonts(); local original=ns.Compat.Fonts; ns.Compat.Fonts=adapter
  local parent=create("Frame"); local overlay=ns.CooldownOverlayFactory.Create(create,parent,parent)
  local cooldown
  for _,object in ipairs(objects) do if object.kind=="Cooldown" then cooldown=object end end
  local secret=setmetatable({}, {__tostring=function() error("secret read") end})
  cooldown:SetCooldownFromDurationObject(secret,true)
  local values=defaults(); values.cooldownSize=1.15; values.cooldownOutline="THICKOUTLINE"
  overlay:SetTypography(values)
  eq(cooldown.durationObject,secret); eq(cooldown.hideNumbers,false)
  local font=env[cooldown.countdownFont]; eq(font.fontSize,16); eq(font.fontFlags,"THICKOUTLINE")
  overlay:SetNumbers(false); eq(cooldown.hideNumbers,true)
  local count=#objects; for _=1,100 do overlay:SetTypography(values) end; eq(#objects,count)
  ns.Compat.Fonts=original
end)
test("older profiles inherit new defaults while granular reset preserves unrelated overrides", function()
  local db={schemaVersion=1,global={count=2,textSize=1.15,hotkeyFont="NUMBERS"},characters={}}
  local store=ns.ProfileStoreFactory.Create(db); local context={character="Player-999-ABCDEF",specId=9101}
  local values=store:Resolve(context); eq(values.count,2); eq(values.labelsFont,"INHERIT")
  local before=store:Capture(context); local keys={hotkeyFont=true}
  local preview=store:PreviewReset(keys,context)
  assert(store:ResetFields(keys,before,preview,context)); eq(db.global.hotkeyFont,nil)
  eq(db.global.textSize,1.15); eq(db.global.count,2)
end)
test("skins may curate typography defaults without changing the standard skin", function()
  local skin=assert(ns.SkinFactory.Create({schemaVersion=1,id="fixture.text",label="Fixture",
    defaults={textSize=1.15,hotkeyFont="NUMBERS"}}))
  local model=ns.SettingsFactory.Create(skin); eq(model:Get().textSize,1.15)
  eq(ns.Skin:Resolve().textSize,1); eq(model:Get().hotkeyFont,"NUMBERS")
end)
test("text controls are disclosed from information and per-role pages are reachable", function()
  local create,objects=factory(); local model=ns.SettingsFactory.Create()
  local panel=ns.ConfigPanelFactory.Create(create,{},model,function(key,value) model:Set(key,value) end)
  local function visible(object)
    return object.visible~=false and (not object.parent or visible(object.parent))
  end
  local function click(label)
    for _,object in ipairs(objects) do
      if object.text==label and visible(object) and object.parent.scripts and object.parent.scripts.OnClick then
        object.parent.scripts.OnClick(); return
      end
    end
    error("missing button: " .. label)
  end
  panel:Show(); click("Informações"); click("Textos e legibilidade"); eq(panel:GetSection(),"type_text")
  click("Números WoW"); eq(model:Get().textFont,"NUMBERS")
  click("Por elemento"); click("Teclas"); eq(panel:GetSection(),"type_hotkey")
  click("WoW"); eq(model:Get().hotkeyFont,"WOW"); click("Global"); eq(model:Get().hotkeyFont,"INHERIT")
end)
print("Native typography: " .. passed .. "/" .. total .. " passed")
for _,failure in ipairs(failures) do print(failure) end
if passed~=total then os.exit(1) end
