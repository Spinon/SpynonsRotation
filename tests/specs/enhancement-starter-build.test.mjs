import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  calculateStarterBuildReport,
  renderStarterProfile,
  STARTER_BUILD_MEASUREMENTS,
  STARTER_BUILD_REPORT,
  STARTER_BUILD_SNAPSHOTS,
  validateStarterBuildMeasurements,
  validateStarterBuildSnapshots,
  validateStarterBuildStudy,
} from "../../specs/shaman/enhancement/starter-build.mjs";

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

test("cada candidata altera somente a talent string do chassi fixo", () => {
  const validated = validateStarterBuildStudy();
  for (const record of validated.candidateProfiles) {
    const restored = renderStarterProfile(record.profileText, validated.study.chassis.talentString);
    assert.equal(restored, validated.chassisText);
  }
});

test("catálogo cobre as duas Hero Trees e preserva linhagem de um único nó", () => {
  const validated = validateStarterBuildStudy();
  const snapshots = validateStarterBuildSnapshots(validated, readJson(STARTER_BUILD_SNAPSHOTS));
  assert.deepEqual(new Set(snapshots.candidates.map((entry) => entry.heroTree.id)), new Set([
    "enhancement.stormbringer",
    "enhancement.totemic",
  ]));
  assert.equal(snapshots.candidates.every((entry) => entry.simcInitialized), true);
  assert.equal(
    snapshots.candidates.filter((entry) => entry.lineageValidation.kind === "single_choice_swap").length,
    8
  );
});

test("proxy separa complexidade do ranking puro de dano", () => {
  const validated = validateStarterBuildStudy();
  const snapshots = validateStarterBuildSnapshots(validated, readJson(STARTER_BUILD_SNAPSHOTS));
  const byId = new Map(snapshots.candidates.map((entry) => [entry.id, entry]));
  assert.ok(
    byId.get("enhancement.starter.stormbringer.deeply_rooted_elements").complexity.score
      < byId.get("enhancement.starter.stormbringer.official").complexity.score
  );
  assert.equal(
    validated.study.selection.damageRanking,
    "confirmed_damage_then_official_baseline_without_positive_95ci"
  );
});

test("golden recompõe a decisão e preserva baseline quando não há ganho confirmado", () => {
  const validated = validateStarterBuildStudy();
  const snapshots = validateStarterBuildSnapshots(validated, readJson(STARTER_BUILD_SNAPSHOTS));
  const measurements = validateStarterBuildMeasurements(
    validated,
    snapshots,
    readJson(STARTER_BUILD_MEASUREMENTS)
  );
  const report = calculateStarterBuildReport(validated, snapshots, measurements);
  assert.deepEqual(report, readJson(STARTER_BUILD_REPORT));
  assert.equal(report.damageWinner.candidateId, "enhancement.starter.stormbringer.official");
  assert.equal(report.starterSuggestion.candidateId, report.damageWinner.candidateId);
  assert.equal(report.scope.universalOptimumClaimed, false);
});
