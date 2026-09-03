import { loadScenarioMatrixFile } from "../scenarios/parser.mjs";
import { RegressionError } from "./errors.mjs";
import { loadRegressionPolicyFile } from "./policy.mjs";
import { buildRegressionReport, serializeRegressionReport } from "./report.mjs";
import { loadRegressionResultsFile } from "./results.mjs";

const FIXTURES = {
  matrix: "rotation-lab/fixtures/scenarios/initial.scenario-matrix.json",
  policy: "rotation-lab/fixtures/regression/neutral.regression-policy.json",
  baseline: "rotation-lab/fixtures/regression/baseline.regression-results.json",
  approved: "rotation-lab/fixtures/regression/candidate-approved.regression-results.json",
  baselineRegression: "rotation-lab/fixtures/regression/candidate-baseline-regression.regression-results.json",
  previousRelease: "rotation-lab/fixtures/regression/previous-release.regression-results.json",
  previousReleaseStrong: "rotation-lab/fixtures/regression/previous-release-strong.regression-results.json",
};

function assertFixture(condition, message, details) {
  if (!condition) {
    throw new RegressionError("REGRESSION_FIXTURE_INVALID", message, { details });
  }
}

export function loadRegressionFixture({ root = process.cwd() } = {}) {
  const matrix = loadScenarioMatrixFile(FIXTURES.matrix, { root });
  return {
    matrix,
    policy: loadRegressionPolicyFile(FIXTURES.policy, matrix, { root }),
    baseline: loadRegressionResultsFile(FIXTURES.baseline, matrix, { root, role: "baseline" }),
    approved: loadRegressionResultsFile(FIXTURES.approved, matrix, { root, role: "candidate" }),
    baselineRegression: loadRegressionResultsFile(FIXTURES.baselineRegression, matrix, {
      root,
      role: "candidate",
    }),
    previousRelease: loadRegressionResultsFile(FIXTURES.previousRelease, matrix, {
      root,
      role: "previous_release",
    }),
    previousReleaseStrong: loadRegressionResultsFile(FIXTURES.previousReleaseStrong, matrix, {
      root,
      role: "previous_release",
    }),
  };
}

export function verifyRegressionFixture(options = {}) {
  const fixture = loadRegressionFixture(options);
  const approved = buildRegressionReport({
    matrix: fixture.matrix,
    policy: fixture.policy,
    baseline: fixture.baseline,
    candidate: fixture.approved,
    previousRelease: fixture.previousRelease,
  });
  const approvedAgain = buildRegressionReport({
    matrix: fixture.matrix,
    policy: fixture.policy,
    baseline: fixture.baseline,
    candidate: fixture.approved,
    previousRelease: fixture.previousRelease,
  });
  const baselineBlocked = buildRegressionReport({
    matrix: fixture.matrix,
    policy: fixture.policy,
    baseline: fixture.baseline,
    candidate: fixture.baselineRegression,
    previousRelease: fixture.previousRelease,
  });
  const releaseBlocked = buildRegressionReport({
    matrix: fixture.matrix,
    policy: fixture.policy,
    baseline: fixture.baseline,
    candidate: fixture.approved,
    previousRelease: fixture.previousReleaseStrong,
  });

  assertFixture(approved.verdict.status === "pass", "A candidata saudável deveria passar.", approved.verdict);
  assertFixture(approved.comparisons.length === 3, "O relatório deveria conter três comparações.");
  assertFixture(approved.subjects.length === 3, "O relatório deveria identificar os três resultados.");
  assertFixture(approved.seeds.length === fixture.matrix.scenarios.length, "Toda seed deveria permanecer auditável.");
  assertFixture(
    serializeRegressionReport(approved) === serializeRegressionReport(approvedAgain),
    "Duas execuções idênticas deveriam produzir bytes idênticos."
  );

  assertFixture(baselineBlocked.verdict.status === "fail", "A regressão contra a baseline deveria bloquear.");
  assertFixture(
    baselineBlocked.verdict.regressions.length === 1
      && baselineBlocked.verdict.regressions[0].comparison === "candidate_vs_baseline"
      && baselineBlocked.verdict.regressions[0].scenarioId === "neutral.dungeon_waves_adds",
    "A fixture deveria isolar o guardrail da matriz em waves/adds.",
    baselineBlocked.verdict
  );

  assertFixture(releaseBlocked.verdict.status === "fail", "A regressão contra a release deveria bloquear.");
  assertFixture(
    releaseBlocked.verdict.regressions.length === 1
      && releaseBlocked.verdict.regressions[0].comparison === "candidate_vs_previous_release"
      && releaseBlocked.verdict.regressions[0].scenarioId === "neutral.dungeon_boss",
    "A fixture deveria isolar o threshold da política no boss dungeon-like.",
    releaseBlocked.verdict
  );

  return { fixture, approved, baselineBlocked, releaseBlocked };
}
