local passed = 0
local failed = 0

local function test(name, callback)
  local ok, message = pcall(callback)
  if ok then
    passed = passed + 1
    print("[PASS] " .. name)
  else
    failed = failed + 1
    print("[FAIL] " .. name .. ": " .. tostring(message))
  end
end

local function assertEqual(actual, expected)
  if actual ~= expected then
    error("expected " .. tostring(expected) .. ", got " .. tostring(actual), 2)
  end
end

local chunk, loadError = loadfile("rotation-lab/fixtures/compiler/neutral/expected.runtime.lua")
if chunk == nil then
  error(loadError)
end
local bundle = chunk()

test("generated runtime bundle uses the supported schema", function()
  assertEqual(bundle.schemaVersion, 1)
  assertEqual(bundle.source.dslSchemaVersion, 1)
end)

test("generated runtime bundle preserves source identity and digest", function()
  assertEqual(bundle.source.id, "neutral.compiler_fixture")
  assertEqual(bundle.source.version, "1.0.0")
  assertEqual(bundle.source.sha256, "0B04C5D3EDB81F7E078C430E657598437D6476C0BFB4B394F88016088FE92E1D")
end)

test("generated runtime bundle keeps deterministic list order", function()
  assertEqual(bundle.entrypoint, "default")
  assertEqual(bundle.lists[1].id, "default")
  assertEqual(bundle.lists[2].id, "maintenance")
end)

test("SIM_ONLY rule is absent from runtime rules", function()
  assertEqual(#bundle.lists[1].rules, 2)
  assertEqual(bundle.lists[1].rules[1].id, "neutral.default_strike_1")
  assertEqual(bundle.lists[1].rules[2].id, "neutral.default_cleave_1")
end)

test("conditionally secret rule retains its safe fallback", function()
  assertEqual(bundle.lists[1].rules[2].capability, "CONDITIONALLY_SECRET")
  assertEqual(bundle.lists[1].rules[2].onUnavailable, "skip_rule")
end)

test("SIM_ONLY exclusion remains auditable", function()
  assertEqual(#bundle.excludedRules, 1)
  assertEqual(bundle.excludedRules[1].rule, "neutral.default_execute_1")
  assertEqual(bundle.excludedRules[1].reason, "SIM_ONLY")
end)

print(string.format("\nCompiler runtime bundle: %d/%d passed", passed, passed + failed))
if failed > 0 then
  os.exit(1)
end
