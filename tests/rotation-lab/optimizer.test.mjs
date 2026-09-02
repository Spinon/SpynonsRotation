import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { loadRotationFile, serializeRotationDocument } from "../../rotation-lab/dsl/parser.mjs";
import {
  loadOptimizerConfigFile,
  parseOptimizerConfigDocument,
  serializeOptimizerConfig,
} from "../../rotation-lab/optimizer/config.mjs";
import { OptimizerError } from "../../rotation-lab/optimizer/errors.mjs";
import { metricSetDigest, parseOptimizerMetricSet } from "../../rotation-lab/optimizer/metrics.mjs";
import { applyMutation, rotationDigest, validateMutationCatalog } from "../../rotation-lab/optimizer/mutations.mjs";
import { runBeamSearch, serializeOptimizerReport } from "../../rotation-lab/optimizer/search.mjs";
import { verifyOptimizerFixture } from "../../rotation-lab/optimizer/verify.mjs";
import { loadScenarioMatrixFile } from "../../rotation-lab/scenarios/parser.mjs";

const FIXTURE_DIRECTORY = path.resolve("rotation-lab/fixtures/optimizer");
const BASELINE_FILE = "rotation-lab/fixtures/compiler/neutral/expected.rotation.json";
const MATRIX_FILE = "rotation-lab/fixtures/scenarios/initial.scenario-matrix.json";
const CONFIG_FILE = "rotation-lab/fixtures/optimizer/neutral.optimizer.json";

function read(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIRECTORY, name), "utf8"));
}

function inputs() {
  return {
    baseline: loadRotationFile(BASELINE_FILE),
    matrix: loadScenarioMatrixFile(MATRIX_FILE),
    config: loadOptimizerConfigFile(CONFIG_FILE),
  };
}

function capture(action, code, issueCode) {
  assert.throws(action, (error) => {
    assert.ok(error instanceof OptimizerError);
    assert.equal(error.code, code);
    if (issueCode !== undefined) {
      assert.ok(error.issues.some((issue) => issue.code === issueCode), `Issue ausente: ${issueCode}`);
    }
    return true;
  });
}

async function captureAsync(action, code, issueCode) {
  await assert.rejects(action, (error) => {
    assert.ok(error instanceof OptimizerError);
    assert.equal(error.code, code);
    if (issueCode !== undefined) {
      assert.ok(error.issues.some((issue) => issue.code === issueCode), `Issue ausente: ${issueCode}`);
    }
    return true;
  });
}

function metricDocument(matrix, context, deltaForScenario = () => 1) {
  return {
    schemaVersion: 1,
    matrixId: matrix.id,
    matrixVersion: matrix.version,
    phase: context.phase,
    budgetIterations: context.budgetIterations,
    candidateSha256: context.candidateSha256,
    measurements: matrix.scenarios.map((scenario) => ({
      scenarioId: scenario.id,
      value: 100000 * (1 + (deltaForScenario(scenario, context) / 100)),
    })),
  };
}

function evaluatorFor(matrix, deltaForScenario = (_scenario, context) => context.baseline ? 0 : 1, calls) {
  return (_document, context) => {
    calls?.push(context);
    return metricDocument(matrix, context, deltaForScenario);
  };
}

test("carrega e canonicaliza configuração finita do optimizer", () => {
  const config = loadOptimizerConfigFile(CONFIG_FILE);
  assert.equal(config.id, "neutral.optimizer_fixture");
  assert.deepEqual(config.limits, { maxDepth: 2, beamWidth: 2, maxCandidates: 6, finalists: 2 });
  assert.deepEqual(config.budgets, { screeningIterations: 100, finalistIterations: 5000 });
  assert.deepEqual(config.mutations.map((mutation) => mutation.id), [
    "neutral.lower_resource_threshold",
    "neutral.raise_cleave_threshold",
    "neutral.swap_openers",
    "neutral.zz_duplicate_lower_resource",
  ]);
  assert.equal(Object.isFrozen(config.mutations), true);
});

test("ordem física das mutações não altera a configuração canônica", () => {
  const original = read("neutral.optimizer.json");
  const reordered = structuredClone(original);
  reordered.mutations.reverse();
  assert.equal(serializeOptimizerConfig(original), serializeOptimizerConfig(reordered));
});

test("configuração recusa limites, budgets, IDs e caminhos inválidos", () => {
  const invalid = read("neutral.optimizer.json");
  invalid.limits.maxDepth = 0;
  invalid.limits.finalists = 7;
  invalid.budgets.finalistIterations = 100;
  invalid.mutations[1].id = invalid.mutations[0].id;
  invalid.mutations[2].valuePath = ["forbidden"];
  invalid.surprise = true;
  capture(
    () => parseOptimizerConfigDocument(invalid),
    "OPTIMIZER_CONFIG_VALIDATION_FAILED",
    "INVALID_INTEGER"
  );
  capture(
    () => parseOptimizerConfigDocument(invalid),
    "OPTIMIZER_CONFIG_VALIDATION_FAILED",
    "FINALISTS_EXCEED_CANDIDATES"
  );
  capture(
    () => parseOptimizerConfigDocument(invalid),
    "OPTIMIZER_CONFIG_VALIDATION_FAILED",
    "FINALIST_BUDGET_NOT_GREATER"
  );
  capture(
    () => parseOptimizerConfigDocument(invalid),
    "OPTIMIZER_CONFIG_VALIDATION_FAILED",
    "DUPLICATE_MUTATION_ID"
  );
  capture(
    () => parseOptimizerConfigDocument(invalid),
    "OPTIMIZER_CONFIG_VALIDATION_FAILED",
    "INVALID_VALUE_PATH"
  );
  capture(
    () => parseOptimizerConfigDocument(invalid),
    "OPTIMIZER_CONFIG_VALIDATION_FAILED",
    "UNKNOWN_FIELD"
  );
});

test("carregador restringe extensão e caminhos ao repositório", () => {
  capture(
    () => loadOptimizerConfigFile("rotation-lab/fixtures/optimizer/neutral.optimizer-evaluations.json"),
    "OPTIMIZER_CONFIG_EXTENSION_INVALID"
  );
  capture(
    () => loadOptimizerConfigFile(path.join("..", "outside.optimizer.json")),
    "OPTIMIZER_CONFIG_OUTSIDE_PROJECT"
  );
});

test("swap_rules troca prioridades sem mutar a baseline", () => {
  const { baseline, config } = inputs();
  const before = serializeRotationDocument(baseline);
  const mutation = config.mutations.find((candidate) => candidate.kind === "swap_rules");
  const candidate = applyMutation(baseline, mutation);
  const list = candidate.lists.find((item) => item.id === "default");
  assert.equal(list.rules.find((rule) => rule.id === mutation.firstRuleId).priority, 20);
  assert.equal(list.rules.find((rule) => rule.id === mutation.secondRuleId).priority, 10);
  assert.equal(serializeRotationDocument(baseline), before);
  assert.notEqual(rotationDigest(candidate), rotationDigest(baseline));
});

test("set_numeric_literal altera somente o literal declarado", () => {
  const { baseline, config } = inputs();
  const mutation = config.mutations.find((candidate) => candidate.id === "neutral.lower_resource_threshold");
  const candidate = applyMutation(baseline, mutation);
  const rule = candidate.lists
    .find((list) => list.id === "default")
    .rules.find((item) => item.id === mutation.ruleId);
  assert.equal(rule.when.conditions[1].right.value, 40);
  assert.equal(baseline.lists[0].rules[0].when.conditions[1].right.value, 50);
});

test("mutações com lista, regra, caminho ou alvo inválidos falham de forma acionável", () => {
  const { baseline, config } = inputs();
  const literal = config.mutations.find((candidate) => candidate.id === "neutral.lower_resource_threshold");
  capture(
    () => applyMutation(baseline, { ...literal, listId: "missing" }),
    "OPTIMIZER_MUTATION_LIST_MISSING"
  );
  capture(
    () => applyMutation(baseline, { ...literal, ruleId: "neutral.missing" }),
    "OPTIMIZER_MUTATION_RULE_MISSING"
  );
  capture(
    () => applyMutation(baseline, { ...literal, valuePath: ["conditions", 99] }),
    "OPTIMIZER_MUTATION_PATH_INVALID"
  );
  capture(
    () => applyMutation(baseline, { ...literal, valuePath: ["conditions", 0, "value"] }),
    "OPTIMIZER_MUTATION_TARGET_NOT_NUMERIC_LITERAL"
  );
});

test("catálogo recusa mutação sem efeito e aceita transforms duplicados para deduplicação", () => {
  const { baseline, config } = inputs();
  assert.equal(validateMutationCatalog(baseline, config.mutations).length, 4);
  const literal = config.mutations.find((candidate) => candidate.id === "neutral.lower_resource_threshold");
  capture(
    () => validateMutationCatalog(baseline, [{ ...literal, value: 50 }]),
    "OPTIMIZER_MUTATION_NO_EFFECT"
  );
});

test("contrato de métricas valida fase, budget, digest e cobertura", () => {
  const { baseline, matrix } = inputs();
  const context = {
    phase: "screening",
    budgetIterations: 100,
    candidateSha256: rotationDigest(baseline),
  };
  const metrics = parseOptimizerMetricSet(metricDocument(matrix, context), matrix, context);
  assert.equal(metrics.measurements.length, 12);
  assert.match(metricSetDigest(metrics, matrix, context), /^[0-9A-F]{64}$/u);
  assert.equal(Object.isFrozen(metrics.measurements), true);
});

test("contrato de métricas recusa metadados e medições incoerentes", () => {
  const { baseline, matrix } = inputs();
  const expected = {
    phase: "screening",
    budgetIterations: 100,
    candidateSha256: rotationDigest(baseline),
  };
  const invalid = metricDocument(matrix, expected);
  invalid.phase = "finalist";
  invalid.budgetIterations = 101;
  invalid.candidateSha256 = "0".repeat(64);
  invalid.measurements.pop();
  invalid.measurements[0].value = 0;
  capture(
    () => parseOptimizerMetricSet(invalid, matrix, expected),
    "OPTIMIZER_METRICS_INVALID",
    "METRICS_PHASE_MISMATCH"
  );
  capture(
    () => parseOptimizerMetricSet(invalid, matrix, expected),
    "OPTIMIZER_METRICS_INVALID",
    "METRICS_BUDGET_MISMATCH"
  );
  capture(
    () => parseOptimizerMetricSet(invalid, matrix, expected),
    "OPTIMIZER_METRICS_INVALID",
    "METRICS_CANDIDATE_DIGEST_MISMATCH"
  );
  capture(
    () => parseOptimizerMetricSet(invalid, matrix, expected),
    "OPTIMIZER_METRICS_INVALID",
    "METRIC_SCENARIO_MISSING"
  );
  capture(
    () => parseOptimizerMetricSet(invalid, matrix, expected),
    "OPTIMIZER_METRICS_INVALID",
    "INVALID_METRIC_VALUE"
  );
});

test("fixture comprova limites, deduplicação, duas fases e vencedor", async () => {
  const { report, deduplicated, rejectedFinalists } = await verifyOptimizerFixture();
  assert.equal(report.screening.evaluatedCandidates, 6);
  assert.equal(report.screening.generations.length, 2);
  assert.equal(report.screening.stoppedReason, "max_candidates");
  assert.equal(deduplicated, 4);
  assert.equal(report.finalist.evaluatedCandidates, 2);
  assert.equal(rejectedFinalists, 1);
  assert.equal(report.winner.type, "candidate");
  assert.equal(report.winner.fitnessPercent, 1.8);
  assert.deepEqual(report.winner.mutations, [
    "neutral.raise_cleave_threshold",
    "neutral.swap_openers",
  ]);
});

test("hard limits restringem candidatas, beam, profundidade e finalistas", async () => {
  const { baseline, matrix, config: loaded } = inputs();
  const config = structuredClone(loaded);
  config.limits = { maxDepth: 1, beamWidth: 1, maxCandidates: 2, finalists: 1 };
  const report = await runBeamSearch({ baseline, matrix, config, evaluator: evaluatorFor(matrix) });
  assert.equal(report.screening.evaluatedCandidates, 2);
  assert.equal(report.screening.generations.length, 1);
  assert.ok(report.screening.generations[0].beam.length <= 1);
  assert.equal(report.finalist.evaluatedCandidates, 1);
});

test("baseline é medida separadamente em screening e finalist com budgets distintos", async () => {
  const { baseline, matrix, config } = inputs();
  const calls = [];
  await runBeamSearch({ baseline, matrix, config, evaluator: evaluatorFor(matrix, undefined, calls) });
  const baselineCalls = calls.filter((context) => context.baseline);
  assert.deepEqual(baselineCalls.map((context) => [context.phase, context.budgetIterations]), [
    ["screening", 100],
    ["finalist", 5000],
  ]);
  assert.ok(calls.filter((context) => !context.baseline && context.phase === "screening").length <= 6);
  assert.ok(calls.filter((context) => !context.baseline && context.phase === "finalist").length <= 2);
});

test("candidatas bloqueadas por guardrail não avançam no beam", async () => {
  const { baseline, matrix, config } = inputs();
  const evaluator = evaluatorFor(matrix, (scenario, context) => {
    if (context.baseline) {
      return 0;
    }
    return scenario.id === "neutral.dungeon_waves_adds" ? -10 : 10;
  });
  const report = await runBeamSearch({ baseline, matrix, config, evaluator });
  assert.equal(report.screening.generations.length, 1);
  assert.equal(report.screening.generations[0].beam.length, 0);
  assert.equal(report.screening.stoppedReason, "no_eligible_candidates");
  assert.equal(report.finalist.evaluatedCandidates, 0);
  assert.equal(report.winner.type, "baseline");
});

test("baseline vence quando finalistas elegíveis não têm ganho positivo", async () => {
  const { baseline, matrix, config } = inputs();
  const evaluator = evaluatorFor(matrix, (_scenario, context) => context.baseline ? 0 : -1);
  const report = await runBeamSearch({ baseline, matrix, config, evaluator });
  assert.equal(report.finalist.evaluatedCandidates, 2);
  assert.equal(report.winner.type, "baseline");
  assert.equal(report.winner.fitnessPercent, 0);
  assert.deepEqual(report.winner.mutations, []);
});

test("falha do evaluator aborta a busca com fase e candidata identificadas", async () => {
  const { baseline, matrix, config } = inputs();
  await captureAsync(
    runBeamSearch({
      baseline,
      matrix,
      config,
      evaluator: () => { throw new Error("synthetic failure"); },
    }),
    "OPTIMIZER_EVALUATOR_FAILED"
  );
});

test("identidades alvo divergentes são recusadas antes de avaliar", async () => {
  const { baseline, matrix, config: loaded } = inputs();
  const config = structuredClone(loaded);
  config.targets.rotationVersion = "2.0.0";
  await captureAsync(
    runBeamSearch({ baseline, matrix, config, evaluator: evaluatorFor(matrix) }),
    "OPTIMIZER_ROTATION_TARGET_MISMATCH"
  );
});

test("busca e relatório são byte a byte reproduzíveis", async () => {
  const { baseline, matrix, config } = inputs();
  const first = await runBeamSearch({ baseline, matrix, config, evaluator: evaluatorFor(matrix) });
  const reordered = structuredClone(config);
  reordered.mutations.reverse();
  const second = await runBeamSearch({ baseline, matrix, config: reordered, evaluator: evaluatorFor(matrix) });
  assert.equal(serializeOptimizerReport(first), serializeOptimizerReport(second));
  for (const generation of first.screening.generations) {
    for (const candidate of generation.candidates) {
      assert.equal(new Set(candidate.mutations).size, candidate.mutations.length);
    }
  }
});
