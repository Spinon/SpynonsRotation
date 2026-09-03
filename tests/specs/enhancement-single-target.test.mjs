import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  calculateSingleTargetReport,
  validateSingleTargetMeasurements,
  validateSingleTargetStudy,
  verifySingleTargetCuration,
} from "../../specs/shaman/enhancement/single-target.mjs";
import { EnhancementSingleTargetError } from "../../specs/shaman/enhancement/errors.mjs";

const MEASUREMENTS_FILE = "specs/shaman/enhancement/single-target/measurements.json";

function loadMeasurements() {
  return JSON.parse(fs.readFileSync(MEASUREMENTS_FILE, "utf8"));
}

function createStudyRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "spynon-enh-st-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const files = [
    "tools/toolchain/pins.json",
    "rotation-lab/fixtures/scenarios/initial.scenario-matrix.json",
    "specs/shaman/enhancement/baseline/baseline.rotation.json",
    "specs/shaman/enhancement/single-target/study.json",
    "specs/shaman/enhancement/single-target/upstream-profile.simc",
  ];
  for (const file of files) {
    const destination = path.join(root, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(file, destination);
  }
  return root;
}

test("valida perfil pinado e sete mutações ST com linhagem distinta", () => {
  const result = validateSingleTargetStudy();
  assert.equal(result.scenarios.length, 3);
  assert.equal(result.candidates.length, 7);
  assert.equal(new Set(result.candidates.map((candidate) => candidate.rotationSha256)).size, 7);
  assert.equal(new Set(result.candidates.map((candidate) => candidate.profileSha256)).size, 7);
  assert.deepEqual(result.scenarios.map((scenario) => scenario.variant), ["short", "medium", "long"]);
  assert.ok(result.scenarios.every((scenario) => scenario.seeds.screening !== scenario.seeds.finalist));
});

test("detecta drift do perfil upstream antes de aceitar qualquer medição", (t) => {
  const root = createStudyRoot(t);
  fs.appendFileSync(
    path.join(root, "specs/shaman/enhancement/single-target/upstream-profile.simc"),
    "# drift\n"
  );
  assert.throws(
    () => validateSingleTargetStudy({ root }),
    (error) => error instanceof EnhancementSingleTargetError && error.code === "ST_PROFILE_DRIFT"
  );
});

test("rejeita drift de seed ou plano nas medições golden", () => {
  const validated = validateSingleTargetStudy();
  const measurements = loadMeasurements();
  measurements.phases[1].profiles[0].scenarios[0].seed += 1;
  assert.throws(
    () => validateSingleTargetMeasurements(validated, measurements),
    (error) => error instanceof EnhancementSingleTargetError && error.code === "ST_MEASUREMENT_INVALID"
  );
});

test("preserva a baseline quando nenhum finalista supera o limite de confiança", () => {
  const result = verifySingleTargetCuration();
  assert.equal(result.decision.outcome, "baseline_retained");
  assert.equal(result.decision.selectedId, "enhancement.st.baseline");
  assert.deepEqual(result.finalists, [
    "enhancement.st.primordial_window_4_5",
    "enhancement.st.maelstrom_floor_6",
  ]);
});

test("política promove uma finalista somente quando ganho e limite inferior são positivos", () => {
  const validated = validateSingleTargetStudy();
  const measurements = loadMeasurements();
  const finalist = measurements.phases.find((phase) => phase.id === "finalist");
  const baseline = finalist.profiles[0];
  const candidate = finalist.profiles[1];
  candidate.scenarios.forEach((metric, index) => {
    metric.meanDps = baseline.scenarios[index].meanDps * 1.01;
    metric.meanStandardError = 1;
  });
  const report = calculateSingleTargetReport(validated, measurements);
  assert.equal(report.decision.outcome, "candidate_promoted");
  assert.equal(report.decision.selectedId, candidate.id);
  assert.ok(report.finalist.ranking[0].lowerConfidenceBoundPercent > 0);
});
