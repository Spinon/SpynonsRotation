import fs from "node:fs";
import path from "node:path";
import { loadRotationFile } from "../dsl/parser.mjs";
import { loadScenarioMatrixFile } from "../scenarios/parser.mjs";
import { loadOptimizerConfigFile } from "./config.mjs";
import { OptimizerError } from "./errors.mjs";
import { runBeamSearch, serializeOptimizerReport } from "./search.mjs";

const BASELINE_FILE = "rotation-lab/fixtures/compiler/neutral/expected.rotation.json";
const MATRIX_FILE = "rotation-lab/fixtures/scenarios/initial.scenario-matrix.json";
const CONFIG_FILE = "rotation-lab/fixtures/optimizer/neutral.optimizer.json";
const EVALUATIONS_FILE = "rotation-lab/fixtures/optimizer/neutral.optimizer-evaluations.json";
const MAX_EVALUATION_FIXTURE_BYTES = 1024 * 1024;
const ROOT_FIELDS = new Set([
  "schemaVersion",
  "optimizerId",
  "optimizerVersion",
  "matrixId",
  "matrixVersion",
  "baselineMetric",
  "candidates",
]);
const CANDIDATE_FIELDS = new Set(["mutations", "screening", "finalist"]);
const PHASE_FIELDS = new Set(["defaultDeltaPercent", "scenarioDeltaPercent"]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function knownFields(value, allowed, issuePath, issues) {
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) {
      issues.push({ code: "UNKNOWN_FIELD", path: `${issuePath}.${field}`, message: `Campo desconhecido: ${field}.` });
    }
  }
}

function validDelta(value) {
  return typeof value === "number" && Number.isFinite(value) && value > -100 && value <= 1000;
}

function mutationKey(mutations) {
  return [...mutations].sort((left, right) => left.localeCompare(right, "en")).join("|");
}

function validatePhase(value, phasePath, scenarioIds, issues) {
  if (!isRecord(value)) {
    issues.push({ code: "INVALID_PHASE", path: phasePath, message: "A fase deve ser um objeto." });
    return;
  }
  knownFields(value, PHASE_FIELDS, phasePath, issues);
  if (!validDelta(value.defaultDeltaPercent)) {
    issues.push({
      code: "INVALID_DEFAULT_DELTA",
      path: `${phasePath}.defaultDeltaPercent`,
      message: "defaultDeltaPercent deve ser finito, maior que -100 e menor ou igual a 1000.",
    });
  }
  if (value.scenarioDeltaPercent !== undefined) {
    if (!isRecord(value.scenarioDeltaPercent)) {
      issues.push({ code: "INVALID_SCENARIO_DELTAS", path: `${phasePath}.scenarioDeltaPercent`, message: "Objeto esperado." });
      return;
    }
    for (const [scenarioId, delta] of Object.entries(value.scenarioDeltaPercent)) {
      if (!scenarioIds.has(scenarioId)) {
        issues.push({ code: "UNKNOWN_SCENARIO", path: `${phasePath}.scenarioDeltaPercent.${scenarioId}`, message: "Cenário desconhecido." });
      }
      if (!validDelta(delta)) {
        issues.push({ code: "INVALID_SCENARIO_DELTA", path: `${phasePath}.scenarioDeltaPercent.${scenarioId}`, message: "Delta inválido." });
      }
    }
  }
}

function loadEvaluationTable(root, config, matrix) {
  const projectRoot = fs.realpathSync(path.resolve(root));
  const candidate = path.resolve(projectRoot, EVALUATIONS_FILE);
  const stat = fs.statSync(candidate, { throwIfNoEntry: false });
  if (!isInside(projectRoot, candidate) || !stat?.isFile()) {
    throw new OptimizerError("OPTIMIZER_FIXTURE_FILE_MISSING", `Fixture não encontrada: ${EVALUATIONS_FILE}.`);
  }
  if (stat.size > MAX_EVALUATION_FIXTURE_BYTES) {
    throw new OptimizerError(
      "OPTIMIZER_FIXTURE_TOO_LARGE",
      `A fixture de avaliações excede ${MAX_EVALUATION_FIXTURE_BYTES} bytes.`
    );
  }
  const realFile = fs.realpathSync(candidate);
  if (!isInside(projectRoot, realFile)) {
    throw new OptimizerError("OPTIMIZER_FIXTURE_OUTSIDE_PROJECT", "A fixture de avaliações resolve para fora do projeto.");
  }
  let value;
  try {
    value = JSON.parse(fs.readFileSync(realFile, "utf8"));
  } catch (error) {
    throw new OptimizerError("OPTIMIZER_FIXTURE_JSON_INVALID", "A fixture de avaliações não contém JSON válido.", {
      cause: error,
    });
  }

  const issues = [];
  if (!isRecord(value)) {
    throw new OptimizerError("OPTIMIZER_FIXTURE_INVALID", "A fixture de avaliações deve ser um objeto.");
  }
  knownFields(value, ROOT_FIELDS, "$", issues);
  if (value.schemaVersion !== 1) {
    issues.push({ code: "UNSUPPORTED_SCHEMA_VERSION", path: "$.schemaVersion", message: "schemaVersion deve ser 1." });
  }
  if (value.optimizerId !== config.id || value.optimizerVersion !== config.version) {
    issues.push({ code: "OPTIMIZER_IDENTITY_MISMATCH", path: "$.optimizerId", message: "Identidade do optimizer divergente." });
  }
  if (value.matrixId !== matrix.id || value.matrixVersion !== matrix.version) {
    issues.push({ code: "MATRIX_IDENTITY_MISMATCH", path: "$.matrixId", message: "Identidade da matriz divergente." });
  }
  if (typeof value.baselineMetric !== "number" || !Number.isFinite(value.baselineMetric)
    || value.baselineMetric < 1e-9 || value.baselineMetric > 1e15) {
    issues.push({ code: "INVALID_BASELINE_METRIC", path: "$.baselineMetric", message: "Métrica sintética inválida." });
  }

  const mutationIds = new Set(config.mutations.map((mutation) => mutation.id));
  const scenarioIds = new Set(matrix.scenarios.map((scenario) => scenario.id));
  const candidates = new Map();
  if (!Array.isArray(value.candidates) || value.candidates.length === 0 || value.candidates.length > 1000) {
    issues.push({ code: "INVALID_CANDIDATES", path: "$.candidates", message: "A fixture exige candidatas." });
  } else {
    for (let index = 0; index < value.candidates.length; index += 1) {
      const candidateValue = value.candidates[index];
      const candidatePath = `$.candidates[${index}]`;
      if (!isRecord(candidateValue)) {
        issues.push({ code: "INVALID_CANDIDATE", path: candidatePath, message: "Objeto esperado." });
        continue;
      }
      knownFields(candidateValue, CANDIDATE_FIELDS, candidatePath, issues);
      if (!Array.isArray(candidateValue.mutations) || candidateValue.mutations.length === 0) {
        issues.push({ code: "INVALID_CANDIDATE_MUTATIONS", path: `${candidatePath}.mutations`, message: "Lista não vazia esperada." });
        continue;
      }
      const localIds = new Set();
      for (let mutationIndex = 0; mutationIndex < candidateValue.mutations.length; mutationIndex += 1) {
        const mutationId = candidateValue.mutations[mutationIndex];
        if (!mutationIds.has(mutationId)) {
          issues.push({ code: "UNKNOWN_MUTATION", path: `${candidatePath}.mutations[${mutationIndex}]`, message: `Mutação desconhecida: ${mutationId}.` });
        }
        if (localIds.has(mutationId)) {
          issues.push({ code: "DUPLICATE_MUTATION", path: `${candidatePath}.mutations[${mutationIndex}]`, message: `Mutação repetida: ${mutationId}.` });
        }
        localIds.add(mutationId);
      }
      const key = mutationKey(candidateValue.mutations);
      if (candidates.has(key)) {
        issues.push({ code: "DUPLICATE_CANDIDATE", path: `${candidatePath}.mutations`, message: "Conjunto de mutações duplicado." });
      }
      validatePhase(candidateValue.screening, `${candidatePath}.screening`, scenarioIds, issues);
      if (candidateValue.finalist !== undefined) {
        validatePhase(candidateValue.finalist, `${candidatePath}.finalist`, scenarioIds, issues);
      }
      candidates.set(key, candidateValue);
    }
  }
  if (issues.length > 0) {
    throw new OptimizerError(
      "OPTIMIZER_FIXTURE_INVALID",
      `Fixture de avaliações inválida: ${issues.length} problema(s).`,
      { source: EVALUATIONS_FILE, issues }
    );
  }
  return { baselineMetric: value.baselineMetric, candidates };
}

function createFixtureEvaluator(table, matrix) {
  return (_document, context) => {
    let phaseData = { defaultDeltaPercent: 0 };
    if (!context.baseline) {
      const candidate = table.candidates.get(mutationKey(context.mutations));
      phaseData = candidate?.[context.phase];
      if (!phaseData) {
        throw new OptimizerError(
          "OPTIMIZER_FIXTURE_EVALUATION_MISSING",
          `A fixture não define ${context.phase} para ${context.mutations.join(", ")}.`
        );
      }
    }
    const overrides = phaseData.scenarioDeltaPercent ?? {};
    return {
      schemaVersion: 1,
      matrixId: matrix.id,
      matrixVersion: matrix.version,
      phase: context.phase,
      budgetIterations: context.budgetIterations,
      candidateSha256: context.candidateSha256,
      measurements: matrix.scenarios.map((scenario) => {
        const deltaPercent = overrides[scenario.id] ?? phaseData.defaultDeltaPercent;
        return {
          scenarioId: scenario.id,
          value: table.baselineMetric * (1 + (deltaPercent / 100)),
        };
      }),
    };
  };
}

export async function verifyOptimizerFixture({ root = process.cwd() } = {}) {
  const baseline = loadRotationFile(BASELINE_FILE, { root });
  const matrix = loadScenarioMatrixFile(MATRIX_FILE, { root });
  const config = loadOptimizerConfigFile(CONFIG_FILE, { root });
  const table = loadEvaluationTable(root, config, matrix);
  const first = await runBeamSearch({ baseline, matrix, config, evaluator: createFixtureEvaluator(table, matrix) });
  const second = await runBeamSearch({ baseline, matrix, config, evaluator: createFixtureEvaluator(table, matrix) });
  if (serializeOptimizerReport(first) !== serializeOptimizerReport(second)) {
    throw new OptimizerError("OPTIMIZER_REPORT_NONDETERMINISTIC", "Execuções idênticas produziram relatórios diferentes.");
  }
  const deduplicated = first.screening.generations.reduce((total, generation) => total + generation.deduplicated, 0);
  const rejectedFinalists = first.finalist.ranking.filter(
    (candidate) => !candidate.eligible && candidate.guardrailViolations.length > 0
  ).length;
  const expectationsHold = first.screening.evaluatedCandidates === 6
    && first.screening.stoppedReason === "max_candidates"
    && first.finalist.evaluatedCandidates === 2
    && rejectedFinalists === 1
    && deduplicated > 0
    && first.winner.type === "candidate"
    && first.winner.fitnessPercent === 1.8
    && first.winner.mutations.includes("neutral.raise_cleave_threshold")
    && first.winner.mutations.includes("neutral.swap_openers");
  if (!expectationsHold) {
    throw new OptimizerError(
      "OPTIMIZER_FIXTURE_EXPECTATION_FAILED",
      "A fixture não comprovou limites, deduplicação, finalistas e vencedor esperados.",
      {
        details: {
          screeningCandidates: first.screening.evaluatedCandidates,
          stoppedReason: first.screening.stoppedReason,
          finalists: first.finalist.evaluatedCandidates,
          rejectedFinalists,
          deduplicated,
          winner: first.winner,
        },
      }
    );
  }
  return { report: first, deduplicated, rejectedFinalists };
}
