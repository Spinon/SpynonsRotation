import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  validateMultiTargetStudy,
  verifyMultiTargetCuration,
} from "../../specs/shaman/enhancement/multi-target.mjs";
import {
  calculateCurationReport,
  validateCurationMeasurements,
} from "../../specs/shaman/enhancement/single-target.mjs";
import { EnhancementMultiTargetError } from "../../specs/shaman/enhancement/errors.mjs";

const MEASUREMENTS_FILE = "specs/shaman/enhancement/multi-target/measurements.json";

function loadMeasurements() {
  return JSON.parse(fs.readFileSync(MEASUREMENTS_FILE, "utf8"));
}

function createStudyRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "spynon-enh-mt-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const files = [
    "tools/toolchain/pins.json",
    "rotation-lab/fixtures/scenarios/initial.scenario-matrix.json",
    "specs/shaman/enhancement/baseline/baseline.rotation.json",
    "specs/shaman/enhancement/single-target/upstream-profile.simc",
    "specs/shaman/enhancement/multi-target/context-policy.json",
    "specs/shaman/enhancement/multi-target/study.json",
  ];
  for (const file of files) {
    const destination = path.join(root, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(file, destination);
  }
  return root;
}

test("valida cinco cenários, sete mutações e thresholds de contexto", () => {
  const result = validateMultiTargetStudy();
  assert.equal(result.scenarios.length, 5);
  assert.equal(result.candidates.length, 7);
  assert.deepEqual(result.scenarios.map((scenario) => scenario.simulation.desiredTargets), [2, 3, 4, 5, 8]);
  assert.deepEqual(result.scenarios.map((scenario) => scenario.category), ["cleave", "cleave", "aoe", "aoe", "aoe"]);
  assert.equal(result.contextPolicy.automaticSignal.onUnavailable, "manual_override");
  assert.equal(result.contextPolicy.automaticSignal.safeDefault, "SINGLE_TARGET");
  assert.equal(new Set(result.candidates.map((candidate) => candidate.rotationSha256)).size, 7);
  assert.equal(new Set(result.candidates.map((candidate) => candidate.profileSha256)).size, 7);
});

test("detecta drift byte a byte na política de contexto", (t) => {
  const root = createStudyRoot(t);
  fs.appendFileSync(path.join(root, "specs/shaman/enhancement/multi-target/context-policy.json"), "\n");
  assert.throws(
    () => validateMultiTargetStudy({ root }),
    (error) => error instanceof EnhancementMultiTargetError && error.code === "MT_CONTEXT_POLICY_DRIFT"
  );
});

test("goldens preservam quantidade de alvos e rejeitam drift do plano", () => {
  const validated = validateMultiTargetStudy();
  const measurements = loadMeasurements();
  const baseline = measurements.phases[0].profiles[0];
  assert.deepEqual(baseline.scenarios.map((metric) => metric.desiredTargets), [2, 3, 4, 5, 8]);
  assert.ok(baseline.scenarios.every((metric, index, metrics) => index === 0 || metric.meanDps > metrics[index - 1].meanDps));
  baseline.scenarios[0].desiredTargets = 1;
  assert.throws(
    () => validateCurationMeasurements(validated, measurements),
    (error) => error.code === "ST_MEASUREMENT_INVALID"
  );
});

test("preserva a baseline e reporta separadamente Cleave e AoE", () => {
  const result = verifyMultiTargetCuration();
  assert.equal(result.decision.outcome, "baseline_retained");
  assert.equal(result.decision.selectedId, "enhancement.mt.baseline");
  assert.equal(result.cleaveScenarios, 2);
  assert.equal(result.aoeScenarios, 3);
  assert.deepEqual(result.finalists, [
    "enhancement.mt.chain_floor_4",
    "enhancement.mt.primordial_before_tempest",
  ]);
  const report = calculateCurationReport(validateMultiTargetStudy(), loadMeasurements());
  assert.deepEqual(report.finalist.ranking[0].categories.map((entry) => entry.category), ["aoe", "cleave"]);
});

test("núcleo compartilhado promove somente ganho com limite inferior positivo", () => {
  const validated = validateMultiTargetStudy();
  const measurements = loadMeasurements();
  const finalist = measurements.phases.find((phase) => phase.id === "finalist");
  const baseline = finalist.profiles[0];
  const candidate = finalist.profiles[1];
  candidate.scenarios.forEach((metric, index) => {
    metric.meanDps = baseline.scenarios[index].meanDps * 1.01;
    metric.meanStandardError = 1;
  });
  const report = calculateCurationReport(validated, measurements);
  assert.equal(report.decision.outcome, "candidate_promoted");
  assert.equal(report.decision.selectedId, candidate.id);
  assert.ok(report.finalist.ranking[0].lowerConfidenceBoundPercent > 0);
});
