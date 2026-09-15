import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { normalizedHash, validateAudit, checkWorkspace } from "../../tools/wow-api/secret-audit.mjs";

const source = "addon/Compat/State.lua";
function fixture() {
  const files = { [source]: "guard before operation\n", "tests/unit/secret_audit_spec.lua": "test(guard)" };
  const pins = { builds: { candidate: { commit: "a".repeat(40) } } };
  const audit = { schemaVersion: 1, reviewedAt: "2026-09-15T00:00:00.000Z", retailValidation: "PENDING",
    apiPins: pins.builds, files: { [source]: normalizedHash(files[source]) }, risks: [{
      id: "SECRET-01", signal: "cooldown", classification: "CONDITIONALLY_SECRET", guard: "public check",
      fallback: "SKIP", limitation: "Offline only", sources: [source], tests: ["tests/unit/secret_audit_spec.lua"],
    }] };
  return { audit, files, pins, run: () => validateAudit(audit, (file) => files[file], [source], pins) };
}
test("audit real cobre toda a fronteira Compat e preserva Retail pendente", () => {
  assert.deepEqual(checkWorkspace(), { risks: 10, files: 29, retailValidation: "PENDING" });
});
test("remoção de guard ou qualquer mudança em fonte revisada exige nova auditoria", () => {
  const data = fixture(); data.files[source] = "operation without guard\n";
  assert.throws(data.run, /Audit review required/u);
});
test("nova fronteira Compat sem classificação interrompe check", () => {
  const data = fixture();
  assert.throws(() => validateAudit(data.audit, (p) => data.files[p], [source, "addon/Compat/New.lua"], data.pins),
    /Unclassified Compat/u);
});
test("mudança de pin exige revisão mesmo com código Lua idêntico", () => {
  const data = fixture(); data.audit.apiPins = {};
  assert.throws(data.run, /API pins changed/u);
});
test("matriz exige fallback limitação evidência e IDs únicos", () => {
  for (const field of ["guard", "fallback", "limitation", "signal", "classification"]) {
    const data = fixture(); data.audit.risks[0][field] = ""; assert.throws(data.run, /Missing/u);
  }
  const data = fixture(); data.audit.risks.push(structuredClone(data.audit.risks[0]));
  assert.throws(data.run, /duplicate risk/u);
});
test("caminhos inválidos e regressões ausentes não podem certificar a auditoria", () => {
  const data = fixture(); data.audit.risks[0].sources = ["../outside.lua"];
  assert.throws(data.run, /Unsafe source/u);
  const other = fixture(); other.files["tests/unit/secret_audit_spec.lua"] = "empty";
  assert.throws(other.run, /Regression suite missing/u);
  other.audit.risks[0].tests = ["../external.lua"]; assert.throws(other.run, /Unsafe regression/u);
});
test("hash normaliza somente finais de linha e não suprime mudanças de código", () => {
  assert.equal(normalizedHash("a\r\nb\r\n"), normalizedHash("a\nb\n"));
  assert.notEqual(normalizedHash("a\nb\n"), normalizedHash("a\nc\n"));
  const scripts = JSON.parse(fs.readFileSync("package.json", "utf8")).scripts;
  assert.match(scripts.test, /npm run secret:check/u); assert.match(scripts.test, /npm run secret:test/u);
});
