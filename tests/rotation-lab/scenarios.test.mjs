import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { ScenarioMatrixError } from "../../rotation-lab/scenarios/errors.mjs";
import {
  evaluateScenarioResults,
  loadScenarioResultsFile,
  parseScenarioResultsDocument,
} from "../../rotation-lab/scenarios/fitness.mjs";
import {
  loadScenarioMatrixFile,
  parseScenarioMatrixDocument,
  serializeScenarioMatrix,
} from "../../rotation-lab/scenarios/parser.mjs";
import { compileScenarioPlans, serializeScenarioPlans } from "../../rotation-lab/scenarios/plan.mjs";
import { REQUIRED_SCENARIO_PROFILES, summarizeScenarioMatrix } from "../../rotation-lab/scenarios/schema.mjs";
import { verifyBundledScenarioFixtures } from "../../rotation-lab/scenarios/verify.mjs";

const FIXTURE_DIRECTORY = path.resolve("rotation-lab/fixtures/scenarios");
const MATRIX_FILE = "rotation-lab/fixtures/scenarios/initial.scenario-matrix.json";
const ACCEPTED_FILE = "rotation-lab/fixtures/scenarios/accepted.scenario-results.json";
const GUARDED_FILE = "rotation-lab/fixtures/scenarios/guardrail-rejection.scenario-results.json";

function read(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIRECTORY, name), "utf8"));
}

function matrixDocument() {
  return read("initial.scenario-matrix.json");
}

function capture(action, code, issueCode) {
  assert.throws(action, (error) => {
    assert.ok(error instanceof ScenarioMatrixError);
    assert.equal(error.code, code);
    if (issueCode !== undefined) {
      assert.ok(error.issues.some((issue) => issue.code === issueCode), `Issue ausente: ${issueCode}`);
    }
    return true;
  });
}

test("carrega a matriz neutra com os 12 perfis obrigatórios", () => {
  const matrix = loadScenarioMatrixFile(MATRIX_FILE);
  const summary = summarizeScenarioMatrix(matrix);
  assert.equal(matrix.id, "neutral.initial_matrix");
  assert.equal(matrix.scenarios.length, REQUIRED_SCENARIO_PROFILES.length);
  assert.deepEqual(summary.categories, {
    single_target: 3,
    cleave: 2,
    aoe: 3,
    dungeon_like: 4,
  });
  assert.equal(summary.totalWeight, 15);
  assert.equal(summary.eventScenarios, 1);
  assert.equal(Object.isFrozen(matrix), true);
  assert.equal(Object.isFrozen(matrix.scenarios[0]), true);
});

test("canonicalização independe da ordem física dos cenários e eventos", () => {
  const original = matrixDocument();
  const reordered = structuredClone(original);
  reordered.scenarios.reverse();
  const waves = reordered.scenarios.find((scenario) => scenario.variant === "waves_adds");
  waves.simulation.raidEvents.push({
    type: "adds",
    name: "LaterWave",
    count: 2,
    first: 80,
    duration: 10,
    cooldown: 60,
    last: 160,
  });
  const ordered = structuredClone(original);
  ordered.scenarios.find((scenario) => scenario.variant === "waves_adds").simulation.raidEvents.push({
    type: "adds",
    name: "LaterWave",
    count: 2,
    first: 80,
    duration: 10,
    cooldown: 60,
    last: 160,
  });
  assert.equal(serializeScenarioMatrix(reordered), serializeScenarioMatrix(ordered));
  assert.equal(serializeScenarioPlans(reordered), serializeScenarioPlans(ordered));
});

test("compila planos SimC tipados e determinísticos", () => {
  const plans = compileScenarioPlans(matrixDocument());
  assert.equal(plans.plans.length, 12);
  assert.match(plans.source.sha256, /^[0-9A-F]{64}$/u);
  const singleTarget = plans.plans.find((plan) => plan.scenarioId === "neutral.st_short");
  assert.deepEqual(singleTarget.args, [
    "iterations=10000",
    "threads=1",
    "max_time=60",
    "fixed_time=1",
    "vary_combat_length=0",
    "desired_targets=1",
    "fight_style=Patchwerk",
  ]);
  assert.equal(singleTarget.maxRegressionPercent, 3);
  const waves = plans.plans.find((plan) => plan.scenarioId === "neutral.dungeon_waves_adds");
  assert.equal(waves.maxRegressionPercent, 4);
  assert.match(waves.reportSuffix, /^neutral-dungeon-waves-adds-[0-9a-f]{20}$/u);
  assert.equal(
    waves.args.at(-1),
    "raid_events+=/adds,name=NeutralWave,count=4,first=20,duration=15,cooldown=45,last=155"
  );
  assert.equal(Object.isFrozen(waves.args), true);
});

test("sufixos de relatório permanecem seguros e únicos para IDs semelhantes", () => {
  const document = matrixDocument();
  document.scenarios[0].id = "neutral.a_b";
  document.scenarios[1].id = "neutral.a.b";
  const suffixes = compileScenarioPlans(document).plans.map((plan) => plan.reportSuffix);
  assert.equal(new Set(suffixes).size, suffixes.length);
  assert.ok(suffixes.every((suffix) => /^[a-z0-9][a-z0-9-]{0,63}$/u.test(suffix)));
});

test("recusa perfil ausente, perfil duplicado e ID duplicado", () => {
  const missing = matrixDocument();
  missing.scenarios.pop();
  capture(
    () => parseScenarioMatrixDocument(missing),
    "SCENARIO_MATRIX_VALIDATION_FAILED",
    "SCENARIO_PROFILE_MISSING"
  );

  const duplicate = matrixDocument();
  duplicate.scenarios[1].id = duplicate.scenarios[0].id;
  duplicate.scenarios[1].category = duplicate.scenarios[0].category;
  duplicate.scenarios[1].variant = duplicate.scenarios[0].variant;
  capture(
    () => parseScenarioMatrixDocument(duplicate),
    "SCENARIO_MATRIX_VALIDATION_FAILED",
    "DUPLICATE_SCENARIO_ID"
  );
  capture(
    () => parseScenarioMatrixDocument(duplicate),
    "SCENARIO_MATRIX_VALIDATION_FAILED",
    "DUPLICATE_SCENARIO_PROFILE"
  );
});

test("recusa alvo incompatível, ordem de duração inválida e waves sem evento", () => {
  const target = matrixDocument();
  target.scenarios.find((scenario) => scenario.variant === "targets_3").simulation.desiredTargets = 4;
  capture(
    () => parseScenarioMatrixDocument(target),
    "SCENARIO_MATRIX_VALIDATION_FAILED",
    "SCENARIO_TARGET_MISMATCH"
  );

  const duration = matrixDocument();
  duration.scenarios.find((scenario) => scenario.variant === "short").simulation.maxTime = 200;
  capture(
    () => parseScenarioMatrixDocument(duration),
    "SCENARIO_MATRIX_VALIDATION_FAILED",
    "ST_DURATION_ORDER_INVALID"
  );

  const waves = matrixDocument();
  delete waves.scenarios.find((scenario) => scenario.variant === "waves_adds").simulation.raidEvents;
  capture(
    () => parseScenarioMatrixDocument(waves),
    "SCENARIO_MATRIX_VALIDATION_FAILED",
    "WAVES_EVENT_REQUIRED"
  );
});

test("recusa pesos, defaults e campos desconhecidos", () => {
  const invalid = matrixDocument();
  invalid.defaults.threads = 0;
  invalid.scenarios[0].weight = 0;
  invalid.scenarios[0].surprise = true;
  capture(
    () => parseScenarioMatrixDocument(invalid),
    "SCENARIO_MATRIX_VALIDATION_FAILED",
    "INVALID_INTEGER"
  );
  capture(
    () => parseScenarioMatrixDocument(invalid),
    "SCENARIO_MATRIX_VALIDATION_FAILED",
    "INVALID_NUMBER"
  );
  capture(
    () => parseScenarioMatrixDocument(invalid),
    "SCENARIO_MATRIX_VALIDATION_FAILED",
    "UNKNOWN_FIELD"
  );
});

test("carregador restringe extensão e caminhos ao repositório", () => {
  capture(
    () => loadScenarioMatrixFile("rotation-lab/fixtures/scenarios/accepted.scenario-results.json"),
    "SCENARIO_MATRIX_EXTENSION_INVALID"
  );
  capture(
    () => loadScenarioMatrixFile(path.join("..", "outside.scenario-matrix.json")),
    "SCENARIO_MATRIX_OUTSIDE_PROJECT"
  );
});

test("avalia candidata saudável por deltas relativos ponderados", () => {
  const matrix = loadScenarioMatrixFile(MATRIX_FILE);
  const results = loadScenarioResultsFile(ACCEPTED_FILE, matrix);
  const evaluation = evaluateScenarioResults(matrix, results);
  assert.equal(evaluation.eligible, true);
  assert.equal(evaluation.fitnessPercent, 1);
  assert.equal(evaluation.totalWeight, 15);
  assert.deepEqual(evaluation.categories.map((category) => category.fitnessPercent), [1, 1, 1, 1]);
  assert.equal(evaluation.guardrailViolations.length, 0);
});

test("fitness positivo não mascara regressão grave", () => {
  const matrix = loadScenarioMatrixFile(MATRIX_FILE);
  const results = loadScenarioResultsFile(GUARDED_FILE, matrix);
  const evaluation = evaluateScenarioResults(matrix, results);
  assert.equal(evaluation.fitnessPercent, 3);
  assert.equal(evaluation.eligible, false);
  assert.deepEqual(evaluation.guardrailViolations, [{
    scenarioId: "neutral.dungeon_waves_adds",
    deltaPercent: -10,
    maxRegressionPercent: 4,
  }]);
  assert.equal(
    evaluation.scenarios.find((scenario) => scenario.scenarioId === "neutral.dungeon_waves_adds").guardrail,
    "fail"
  );
});

test("peso e limite por cenário são configuráveis sem alterar o avaliador", () => {
  const matrix = matrixDocument();
  const waves = matrix.scenarios.find((scenario) => scenario.variant === "waves_adds");
  waves.weight = 0.5;
  waves.maxRegressionPercent = 12;
  const evaluation = evaluateScenarioResults(matrix, read("guardrail-rejection.scenario-results.json"));
  assert.equal(evaluation.fitnessPercent, 4.444444);
  assert.equal(evaluation.eligible, true);
});

test("limite de regressão é inclusivo", () => {
  const matrix = matrixDocument();
  const results = read("accepted.scenario-results.json");
  for (const measurement of results.measurements) {
    measurement.candidate = measurement.baseline;
  }
  const waves = results.measurements.find((measurement) => measurement.scenarioId === "neutral.dungeon_waves_adds");
  waves.candidate = waves.baseline * 0.96;
  const evaluation = evaluateScenarioResults(matrix, results);
  assert.equal(evaluation.eligible, true);
  assert.equal(evaluation.guardrailViolations.length, 0);
});

test("resultados recusam identidade divergente e medições ausentes", () => {
  const matrix = matrixDocument();
  const mismatch = read("accepted.scenario-results.json");
  mismatch.matrixVersion = "2.0.0";
  capture(
    () => parseScenarioResultsDocument(mismatch, matrix),
    "SCENARIO_RESULTS_VALIDATION_FAILED",
    "RESULTS_MATRIX_MISMATCH"
  );

  const missing = read("accepted.scenario-results.json");
  missing.measurements.pop();
  capture(
    () => parseScenarioResultsDocument(missing, matrix),
    "SCENARIO_RESULTS_VALIDATION_FAILED",
    "RESULT_SCENARIO_MISSING"
  );
  capture(
    () => parseScenarioResultsDocument(missing, matrix),
    "SCENARIO_RESULTS_VALIDATION_FAILED",
    "RESULT_COUNT_INVALID"
  );
});

test("resultados recusam duplicatas, cenários desconhecidos e métricas não positivas", () => {
  const matrix = matrixDocument();
  const invalid = read("accepted.scenario-results.json");
  invalid.measurements.push({ ...invalid.measurements[0] });
  invalid.measurements[1].scenarioId = "neutral.unknown";
  invalid.measurements[2].baseline = 0;
  invalid.measurements[3].candidate = Number.NaN;
  capture(
    () => parseScenarioResultsDocument(invalid, matrix),
    "SCENARIO_RESULTS_VALIDATION_FAILED",
    "DUPLICATE_RESULT_SCENARIO"
  );
  capture(
    () => parseScenarioResultsDocument(invalid, matrix),
    "SCENARIO_RESULTS_VALIDATION_FAILED",
    "UNKNOWN_RESULT_SCENARIO"
  );
  capture(
    () => parseScenarioResultsDocument(invalid, matrix),
    "SCENARIO_RESULTS_VALIDATION_FAILED",
    "INVALID_BASELINE_METRIC"
  );
  capture(
    () => parseScenarioResultsDocument(invalid, matrix),
    "SCENARIO_RESULTS_VALIDATION_FAILED",
    "INVALID_CANDIDATE_METRIC"
  );
});

test("verificador integrado comprova cobertura, planos e guardrails", () => {
  const result = verifyBundledScenarioFixtures();
  assert.equal(result.summary.scenarios, 12);
  assert.equal(result.bundle.plans.length, 12);
  assert.equal(result.accepted.eligible, true);
  assert.equal(result.guarded.eligible, false);
  assert.ok(result.guarded.fitnessPercent > 0);
});
