import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { loadScenarioMatrixFile } from "../../rotation-lab/scenarios/parser.mjs";
import { RegressionError } from "../../rotation-lab/regression/errors.mjs";
import {
  loadRegressionPolicyFile,
  parseRegressionPolicyDocument,
  regressionPolicyDigest,
  serializeRegressionPolicy,
} from "../../rotation-lab/regression/policy.mjs";
import { buildRegressionReport, serializeRegressionReport } from "../../rotation-lab/regression/report.mjs";
import {
  loadRegressionResultsFile,
  parseRegressionResultsDocument,
  regressionResultsDigest,
  serializeRegressionResults,
} from "../../rotation-lab/regression/results.mjs";
import { loadRegressionFixture, verifyRegressionFixture } from "../../rotation-lab/regression/verify.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const matrix = loadScenarioMatrixFile("rotation-lab/fixtures/scenarios/initial.scenario-matrix.json", { root });

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function issueCodes(error) {
  return new Set(error.issues?.map((issue) => issue.code));
}

const policyDocument = () => readJson("rotation-lab/fixtures/regression/neutral.regression-policy.json");
const baselineDocument = () => readJson("rotation-lab/fixtures/regression/baseline.regression-results.json");
const candidateDocument = () => readJson("rotation-lab/fixtures/regression/candidate-approved.regression-results.json");
const previousDocument = () => readJson("rotation-lab/fixtures/regression/previous-release.regression-results.json");

test("carrega e canonicaliza política versionada de regressão", () => {
  const policy = parseRegressionPolicyDocument(policyDocument(), matrix);
  assert.equal(policy.id, "neutral.regression_policy");
  assert.equal(policy.thresholds.candidateVsBaseline.source, "scenario_matrix");
  assert.equal(policy.thresholds.candidateVsPreviousRelease.defaultMaxRegressionPercent, 2);
  assert.equal(policy.thresholds.candidateVsPreviousRelease.overrides[0].maxRegressionPercent, 6);
  assert.ok(Object.isFrozen(policy.thresholds.candidateVsPreviousRelease.overrides));
  assert.match(regressionPolicyDigest(policy, matrix), /^[0-9A-F]{64}$/u);
});

test("ordem física das sobrescritas não altera a política canônica", () => {
  const left = policyDocument();
  left.thresholds.candidateVsPreviousRelease.overrides.push({
    scenarioId: "neutral.st_short",
    maxRegressionPercent: 1,
  });
  const right = structuredClone(left);
  right.thresholds.candidateVsPreviousRelease.overrides.reverse();
  assert.equal(serializeRegressionPolicy(left, matrix), serializeRegressionPolicy(right, matrix));
});

test("política recusa identidade, alvo, fonte e thresholds inválidos", () => {
  const invalid = policyDocument();
  invalid.extra = true;
  invalid.id = "INVALID";
  invalid.version = "1";
  invalid.targets.matrixVersion = "2.0.0";
  invalid.thresholds.candidateVsBaseline.source = "local_copy";
  invalid.thresholds.candidateVsPreviousRelease.defaultMaxRegressionPercent = -1;
  invalid.thresholds.candidateVsPreviousRelease.overrides.push({
    scenarioId: "neutral.dungeon_waves_adds",
    maxRegressionPercent: 101,
  });
  assert.throws(
    () => parseRegressionPolicyDocument(invalid, matrix),
    (error) => {
      assert.ok(error instanceof RegressionError);
      const codes = issueCodes(error);
      for (const code of [
        "UNKNOWN_FIELD",
        "INVALID_POLICY_ID",
        "INVALID_POLICY_VERSION",
        "POLICY_MATRIX_VERSION_MISMATCH",
        "INVALID_BASELINE_THRESHOLD_SOURCE",
        "INVALID_DEFAULT_REGRESSION_THRESHOLD",
        "DUPLICATE_THRESHOLD_SCENARIO",
        "INVALID_SCENARIO_REGRESSION_THRESHOLD",
      ]) {
        assert.ok(codes.has(code), code);
      }
      return true;
    }
  );
});

test("política recusa cenário desconhecido e estruturas ausentes", () => {
  const unknown = policyDocument();
  unknown.thresholds.candidateVsPreviousRelease.overrides[0].scenarioId = "neutral.unknown";
  assert.throws(
    () => parseRegressionPolicyDocument(unknown, matrix),
    (error) => issueCodes(error).has("UNKNOWN_THRESHOLD_SCENARIO")
  );
  const absent = policyDocument();
  delete absent.thresholds.candidateVsPreviousRelease.overrides;
  assert.throws(
    () => parseRegressionPolicyDocument(absent, matrix),
    (error) => issueCodes(error).has("INVALID_THRESHOLD_OVERRIDES")
  );
});

test("carregador da política restringe extensão e caminhos", () => {
  assert.throws(
    () => loadRegressionPolicyFile("README.md", matrix, { root }),
    (error) => error.code === "REGRESSION_POLICY_EXTENSION_INVALID"
  );
  assert.throws(
    () => loadRegressionPolicyFile("../outside.regression-policy.json", matrix, { root }),
    (error) => error.code === "REGRESSION_POLICY_OUTSIDE_PROJECT"
  );
});

test("resultado preserva versões, seeds e ordem canônica da matriz", () => {
  const raw = baselineDocument();
  raw.measurements.reverse();
  const seedsByScenario = new Map(raw.measurements.map((measurement) => [measurement.scenarioId, measurement.seed]));
  const result = parseRegressionResultsDocument(raw, matrix, { role: "baseline" });
  assert.equal(result.measurements[0].scenarioId, matrix.scenarios[0].id);
  assert.equal(result.measurements[0].seed, seedsByScenario.get(matrix.scenarios[0].id));
  assert.equal(result.rotation.version, "1.0.0");
  assert.equal(result.engine.version, "1210.01");
  assert.ok(Object.isFrozen(result.measurements));
  assert.match(regressionResultsDigest(result, matrix, { role: "baseline" }), /^[0-9A-F]{64}$/u);
});

test("ordem física das medições não altera resultado nem digest", () => {
  const left = candidateDocument();
  const right = structuredClone(left);
  right.measurements.reverse();
  assert.equal(
    serializeRegressionResults(left, matrix, { role: "candidate" }),
    serializeRegressionResults(right, matrix, { role: "candidate" })
  );
  assert.equal(
    regressionResultsDigest(left, matrix, { role: "candidate" }),
    regressionResultsDigest(right, matrix, { role: "candidate" })
  );
});

test("resultado recusa role, matriz, rotação e engine inválidos", () => {
  const invalid = candidateDocument();
  invalid.extra = true;
  invalid.role = "challenger";
  invalid.matrix.id = "neutral.other_matrix";
  invalid.matrix.sha256 = "0".repeat(64);
  invalid.rotation.id = "INVALID";
  invalid.rotation.version = "next";
  invalid.rotation.sha256 = "abc";
  invalid.rotation.releaseVersion = "1.0.0";
  invalid.engine.id = "simc";
  invalid.engine.revision = "XYZ";
  invalid.engine.wowBuild = "retail";
  invalid.engine.iterations = 0;
  assert.throws(
    () => parseRegressionResultsDocument(invalid, matrix, { role: "candidate" }),
    (error) => {
      const codes = issueCodes(error);
      for (const code of [
        "UNKNOWN_FIELD",
        "INVALID_RESULTS_ROLE",
        "RESULTS_ROLE_MISMATCH",
        "RESULTS_MATRIX_MISMATCH",
        "RESULTS_MATRIX_DIGEST_MISMATCH",
        "INVALID_ROTATION_ID",
        "INVALID_ROTATION_VERSION",
        "INVALID_ROTATION_DIGEST",
        "UNEXPECTED_RELEASE_VERSION",
        "INVALID_ENGINE_ID",
        "INVALID_ENGINE_REVISION",
        "INVALID_WOW_BUILD",
        "INVALID_RESULTS_ITERATIONS",
      ]) {
        assert.ok(codes.has(code), code);
      }
      return true;
    }
  );
});

test("release anterior exige versão de release e os demais papéis recusam uma", () => {
  const previous = previousDocument();
  previous.rotation.releaseVersion = null;
  assert.throws(
    () => parseRegressionResultsDocument(previous, matrix, { role: "previous_release" }),
    (error) => issueCodes(error).has("PREVIOUS_RELEASE_VERSION_REQUIRED")
  );
  const candidate = candidateDocument();
  candidate.rotation.releaseVersion = "1.0.0";
  assert.throws(
    () => parseRegressionResultsDocument(candidate, matrix, { role: "candidate" }),
    (error) => issueCodes(error).has("UNEXPECTED_RELEASE_VERSION")
  );
});

test("resultado recusa cobertura, duplicata, seed e métrica inválidas", () => {
  const invalid = baselineDocument();
  invalid.measurements.pop();
  invalid.measurements[1].scenarioId = invalid.measurements[0].scenarioId;
  invalid.measurements[2].seed = 0;
  invalid.measurements[3].value = Number.NaN;
  assert.throws(
    () => parseRegressionResultsDocument(invalid, matrix, { role: "baseline" }),
    (error) => {
      const codes = issueCodes(error);
      assert.ok(codes.has("RESULTS_MEASUREMENT_COUNT_INVALID"));
      assert.ok(codes.has("DUPLICATE_RESULTS_SCENARIO"));
      assert.ok(codes.has("INVALID_RESULTS_SEED"));
      assert.ok(codes.has("INVALID_RESULTS_VALUE"));
      assert.ok(codes.has("RESULTS_SCENARIO_MISSING"));
      return true;
    }
  );
});

test("resultado recusa cenário extra mesmo quando a contagem permanece correta", () => {
  const invalid = baselineDocument();
  invalid.measurements[0].scenarioId = "neutral.unknown";
  assert.throws(
    () => parseRegressionResultsDocument(invalid, matrix, { role: "baseline" }),
    (error) => issueCodes(error).has("UNKNOWN_RESULTS_SCENARIO")
      && issueCodes(error).has("RESULTS_SCENARIO_MISSING")
  );
});

test("carregador de resultados restringe extensão e caminhos", () => {
  assert.throws(
    () => loadRegressionResultsFile("README.md", matrix, { root }),
    (error) => error.code === "REGRESSION_RESULTS_EXTENSION_INVALID"
  );
  assert.throws(
    () => loadRegressionResultsFile("../outside.regression-results.json", matrix, { root }),
    (error) => error.code === "REGRESSION_RESULTS_OUTSIDE_PROJECT"
  );
});

test("relatório aprovado compara três sujeitos e preserva proveniência", () => {
  const { approved } = verifyRegressionFixture({ root });
  assert.equal(approved.verdict.status, "pass");
  assert.equal(approved.comparisons.length, 3);
  assert.deepEqual(approved.comparisons.map((comparison) => comparison.id), [
    "candidate_vs_baseline",
    "candidate_vs_previous_release",
    "baseline_vs_previous_release",
  ]);
  assert.equal(approved.subjects.length, 3);
  assert.equal(approved.seeds.length, 12);
  assert.equal(approved.matrix.metric, "mean_dps");
  assert.equal(approved.matrix.aggregation, "weighted_relative_delta");
  assert.equal(approved.engine.iterations, 10000);
  assert.ok(approved.subjects.every((subject) => /^[0-9A-F]{64}$/u.test(subject.resultsSha256)));
  assert.ok(Object.isFrozen(approved.verdict.regressions));
});

test("guardrail da matriz bloqueia regressão da candidata contra baseline", () => {
  const { baselineBlocked } = verifyRegressionFixture({ root });
  assert.equal(baselineBlocked.verdict.status, "fail");
  assert.deepEqual(baselineBlocked.verdict.regressions, [{
    comparison: "candidate_vs_baseline",
    scenarioId: "neutral.dungeon_waves_adds",
    category: "dungeon_like",
    referenceRole: "baseline",
    deltaPercent: -5,
    maxRegressionPercent: 4,
  }]);
  assert.equal(baselineBlocked.comparisons[1].status, "pass");
});

test("política bloqueia regressão da candidata contra release anterior", () => {
  const { releaseBlocked } = verifyRegressionFixture({ root });
  assert.equal(releaseBlocked.verdict.status, "fail");
  assert.equal(releaseBlocked.verdict.regressions.length, 1);
  assert.equal(releaseBlocked.verdict.regressions[0].comparison, "candidate_vs_previous_release");
  assert.equal(releaseBlocked.verdict.regressions[0].scenarioId, "neutral.dungeon_boss");
  assert.equal(releaseBlocked.verdict.regressions[0].maxRegressionPercent, 2);
  assert.equal(releaseBlocked.comparisons[0].status, "pass");
});

test("baseline contra release anterior permanece diagnóstica", () => {
  const { approved } = verifyRegressionFixture({ root });
  const diagnostic = approved.comparisons[2];
  assert.equal(diagnostic.required, false);
  assert.equal(diagnostic.status, "diagnostic");
  assert.equal(diagnostic.regressions.length, 0);
  assert.ok(diagnostic.scenarios.every((scenario) => scenario.maxRegressionPercent === null));
});

test("engine divergente aborta antes do cálculo", () => {
  const fixture = loadRegressionFixture({ root });
  const candidate = structuredClone(fixture.approved);
  candidate.engine.iterations += 1;
  assert.throws(
    () => buildRegressionReport({ ...fixture, candidate, previousRelease: fixture.previousRelease }),
    (error) => error.code === "REGRESSION_INPUTS_INCOMPARABLE"
      && issueCodes(error).has("ENGINE_MISMATCH")
  );
});

test("seed divergente aborta antes do cálculo", () => {
  const fixture = loadRegressionFixture({ root });
  const candidate = structuredClone(fixture.approved);
  candidate.measurements[0].seed += 1;
  assert.throws(
    () => buildRegressionReport({ ...fixture, candidate, previousRelease: fixture.previousRelease }),
    (error) => error.code === "REGRESSION_INPUTS_INCOMPARABLE"
      && issueCodes(error).has("SEED_MISMATCH")
  );
});

test("threshold é inclusivo no limite exato", () => {
  const fixture = loadRegressionFixture({ root });
  const candidate = structuredClone(fixture.approved);
  candidate.measurements[0].value = fixture.previousRelease.measurements[0].value * 0.98;
  const report = buildRegressionReport({
    matrix: fixture.matrix,
    policy: fixture.policy,
    baseline: fixture.baseline,
    candidate,
    previousRelease: fixture.previousRelease,
  });
  const comparison = report.comparisons[1];
  assert.equal(comparison.scenarios[0].deltaPercent, -2);
  assert.equal(comparison.scenarios[0].status, "pass");
});

test("reordenar matriz, política e medições mantém relatório byte a byte", () => {
  const base = {
    matrix: readJson("rotation-lab/fixtures/scenarios/initial.scenario-matrix.json"),
    policy: policyDocument(),
    baseline: baselineDocument(),
    candidate: candidateDocument(),
    previousRelease: previousDocument(),
  };
  base.policy.thresholds.candidateVsPreviousRelease.overrides.push({
    scenarioId: "neutral.st_short",
    maxRegressionPercent: 2,
  });
  const reordered = structuredClone(base);
  reordered.matrix.scenarios.reverse();
  reordered.policy.thresholds.candidateVsPreviousRelease.overrides.reverse();
  reordered.baseline.measurements.reverse();
  reordered.candidate.measurements.reverse();
  reordered.previousRelease.measurements.reverse();
  assert.equal(
    serializeRegressionReport(buildRegressionReport(base)),
    serializeRegressionReport(buildRegressionReport(reordered))
  );
});
