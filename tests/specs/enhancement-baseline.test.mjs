import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  BASELINE_DIRECTORY,
  buildEnhancementBaseline,
  collectActionLines,
  verifyEnhancementBaseline,
} from "../../specs/shaman/enhancement/baseline.mjs";
import { EnhancementBaselineError } from "../../specs/shaman/enhancement/errors.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..", "..");

function createFixtureRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "spynon-enhancement-baseline-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const destination = path.join(root, "specs", "shaman", "enhancement");
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(path.join(projectRoot, "specs", "shaman", "enhancement"), destination, { recursive: true });
  return root;
}

function rewriteJson(file, callback) {
  const document = JSON.parse(fs.readFileSync(file, "utf8"));
  callback(document);
  fs.writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`, "utf8");
}

function expectBaselineError(callback, code) {
  assert.throws(
    callback,
    (error) => error instanceof EnhancementBaselineError && error.code === code
  );
}

test("baseline preserva origem, cobre toda action upstream e compila deterministicamente", () => {
  const result = verifyEnhancementBaseline({ root: projectRoot });
  assert.equal(result.ok, true);
  assert.equal(result.id, "enhancement.simc_baseline");
  assert.equal(result.version, "12.1.0-1");
  assert.equal(result.sourceSha256, "783560B572B81F0373932AD91579C82130341D23A4FC60809576A4BE14D7D77E");
  assert.equal(result.sourceActionLines, 113);
  assert.equal(result.normalizedRules, 64);
  assert.equal(result.sourceOnlyRules, 49);
  assert.equal(result.simOnlySourceLines, 13);
  assert.equal(result.lists, 4);
  assert.equal(result.runtimeRules, 64);
  assert.equal(result.excludedRules, 0);
});

test("auditoria marca conhecimento impossível como SIM_ONLY e nunca o normaliza", () => {
  const directory = path.join(projectRoot, BASELINE_DIRECTORY);
  const source = fs.readFileSync(path.join(directory, "upstream.simc"), "utf8");
  const audit = JSON.parse(fs.readFileSync(path.join(directory, "audit.json"), "utf8"));
  const actionLines = collectActionLines(source);
  assert.equal(audit.decisions.length, actionLines.length);
  const simOnly = audit.decisions.filter((entry) => entry.requiredCapability === "SIM_ONLY");
  assert.equal(simOnly.length, 13);
  assert.equal(simOnly.every((entry) => entry.disposition === "source_only"), true);
  assert.equal(simOnly.some((entry) => entry.reason === "simulation_future_knowledge"), true);
  assert.equal(simOnly.some((entry) => entry.reason === "simulation_damage_model"), true);
  assert.equal(simOnly.some((entry) => entry.reason === "simulation_scheduling"), true);
});

test("bundle mantém fallback seguro em toda regra condicionada por estado volátil", () => {
  const built = buildEnhancementBaseline({ root: projectRoot });
  const conditionalRules = built.runtime.lists.flatMap((list) => list.rules)
    .filter((rule) => rule.capability === "CONDITIONALLY_SECRET");
  assert.ok(conditionalRules.length > 0);
  assert.equal(conditionalRules.every((rule) => rule.onUnavailable === "skip_rule"), true);
  assert.equal(built.runtime.excludedRules.length, 0);
  assert.equal(
    built.document.lists.flatMap((list) => list.rules).every((rule) => rule.action.startsWith("enhancement.")),
    true
  );
  assert.deepEqual(buildEnhancementBaseline({ root: projectRoot }).artifacts, built.artifacts);
});

test("drift de um byte na fonte preservada quebra a verificação de integridade", (t) => {
  const root = createFixtureRoot(t);
  const sourceFile = path.join(root, BASELINE_DIRECTORY, "upstream.simc");
  fs.appendFileSync(sourceFile, "\n", "utf8");
  expectBaselineError(() => verifyEnhancementBaseline({ root }), "BASELINE_SOURCE_INTEGRITY");
});

test("omissão na auditoria quebra a cobertura antes da compilação", (t) => {
  const root = createFixtureRoot(t);
  const auditFile = path.join(root, BASELINE_DIRECTORY, "audit.json");
  rewriteJson(auditFile, (audit) => audit.decisions.pop());
  expectBaselineError(() => verifyEnhancementBaseline({ root }), "BASELINE_AUDIT_COVERAGE");
});

test("condição impossível não pode ser reclassificada como disponível", (t) => {
  const root = createFixtureRoot(t);
  const auditFile = path.join(root, BASELINE_DIRECTORY, "audit.json");
  rewriteJson(auditFile, (audit) => {
    audit.decisions.find((entry) => entry.source.includes("fight_remains")).requiredCapability = "ADDON_AVAILABLE";
  });
  expectBaselineError(() => verifyEnhancementBaseline({ root }), "BASELINE_SIM_ONLY_REQUIRED");
});

test("fonte normalizada só pode conter linhas aprovadas pela auditoria", (t) => {
  const root = createFixtureRoot(t);
  const normalizedFile = path.join(root, BASELINE_DIRECTORY, "normalized.simc");
  fs.appendFileSync(normalizedFile, "actions.single_sb+=/frost_shock\n", "utf8");
  expectBaselineError(() => verifyEnhancementBaseline({ root }), "BASELINE_NORMALIZED_DIVERGENCE");
});

test("mapeamento não aceita action ausente do catálogo Enhancement", (t) => {
  const root = createFixtureRoot(t);
  const mapFile = path.join(root, BASELINE_DIRECTORY, "enhancement.compiler-map.json");
  rewriteJson(mapFile, (mapping) => {
    mapping.actions[0].dsl = "enhancement.unknown_action";
  });
  expectBaselineError(() => verifyEnhancementBaseline({ root }), "BASELINE_ACTION_NOT_CATALOGED");
});
