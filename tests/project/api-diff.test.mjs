import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { captureSnapshot, compareSnapshots, hash, serialize, verifyPinnedSnapshot } from "../../tools/wow-api/api-diff.mjs";

const pin = { version: "12.1.0.1", interface: 120100, commit: "a".repeat(40) };
const files = [{ name: "SpellDocumentation.lua", modules: ["addon/Compat/State.lua"] }];
async function snapshot(body = "signature + SecretArguments") {
  return captureSnapshot(pin, files, async (path) => path === "version.txt" ? Buffer.from(pin.version)
    : body === null ? null : Buffer.from(body));
}
test("snapshots são determinísticos e exigem commit imutável e build correspondente", async () => {
  assert.equal(serialize(await snapshot()), serialize(await snapshot()));
  await assert.rejects(captureSnapshot({ ...pin, commit: "live" }, files, async () => null), /immutable/u);
  await assert.rejects(captureSnapshot(pin, files, async () => Buffer.from("wrong")), /build mismatch/u);
});
test("mudança de assinatura ou metadado secreto exige revisão dos módulos vinculados", async () => {
  const report = compareSnapshots(await snapshot(), await snapshot("signature + SecretWhenInCombat"));
  assert.equal(report.decision, "REVIEW_REQUIRED");
  assert.equal(report.changes[0].status, "modified");
  assert.deepEqual(report.affectedModules, ["addon/Compat/State.lua"]);
  assert.equal(report.retailValidation, "PENDING");
});
test("arquivo removido, adicionado ou ausente nas duas fontes não fica silencioso", async () => {
  const present = await snapshot(), absent = await snapshot(null);
  assert.equal(compareSnapshots(present, absent).changes[0].status, "removed");
  assert.equal(compareSnapshots(absent, present).changes[0].status, "added");
  assert.equal(compareSnapshots(absent, absent).decision, "REVIEW_REQUIRED");
});
test("falha de rede não é interpretada como remoção de API", async () => {
  await assert.rejects(captureSnapshot(pin, files, async () => { throw new Error("network failed"); }), /network/u);
});
test("mudança de interface exige revisão mesmo sem alteração nas fontes cobertas", async () => {
  const before = await snapshot(), after = structuredClone(before);
  after.interface = 120101;
  assert.equal(compareSnapshots(before, after).decision, "REVIEW_REQUIRED");
});
test("drift de cobertura, ownership e caminhos inválidos abortam o diff", async () => {
  const before = await snapshot(), after = structuredClone(before);
  after.files[0].modules = ["addon/UI/Queue.lua"];
  assert.throws(() => compareSnapshots(before, after), /Ownership/u);
  after.files[0].path = "../outside.lua";
  assert.throws(() => compareSnapshots(before, after), /path/u);
});
test("pins rejeitam edição de um byte ou troca de identidade do snapshot", async () => {
  const data = await snapshot(), text = serialize(data);
  const source = { ...pin, snapshotSha256: hash(text) };
  assert.deepEqual(verifyPinnedSnapshot(text, source), data);
  assert.throws(() => verifyPinnedSnapshot(`${text} `, source), /hash drift/u);
  assert.throws(() => verifyPinnedSnapshot(text, { ...source, version: "12.1.0.2" }), /pin mismatch/u);
});
test("golden real compara 31 arquivos e não promove ausência de diff a validação Retail", () => {
  const sources = JSON.parse(fs.readFileSync("tools/wow-api/sources.json", "utf8"));
  const before = verifyPinnedSnapshot(fs.readFileSync("tools/wow-api/snapshots/69587.json", "utf8"), sources.builds["69587"]);
  const after = verifyPinnedSnapshot(fs.readFileSync("tools/wow-api/snapshots/69814.json", "utf8"), sources.builds["69814"]);
  const result = compareSnapshots(before, after);
  assert.equal(result.coveredFiles, 31);
  assert.equal(result.changes.length, 0);
  assert.equal(result.simulationParity, "NOT_ASSERTED");
  assert.equal(serialize(result), fs.readFileSync("tools/wow-api/reports/69587-to-69814.json", "utf8"));
});

test("helpers legados têm caminhos explícitos permitidos sem aceitar traversal", async () => {
  const entry = { name: "ActionButton.lua", path: "Interface/AddOns/Blizzard_ActionBar/Shared/ActionButton.lua",
    modules: ["addon/Compat/Bindings.lua"] };
  const read = async (path) => Buffer.from(path === "version.txt" ? pin.version : "helper");
  const data = await captureSnapshot(pin, [entry], read);
  assert.equal(data.files[0].path, entry.path);
  await assert.rejects(captureSnapshot(pin, [{ ...entry, path: "../ActionButton.lua" }], read), /path/u);
  await assert.rejects(captureSnapshot(pin, [{ ...entry, path: "Interface/AddOns/Unknown/ActionButton.lua" }], read), /path/u);
});
