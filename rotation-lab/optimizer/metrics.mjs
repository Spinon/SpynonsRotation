import crypto from "node:crypto";
import { parseScenarioMatrixDocument } from "../scenarios/parser.mjs";
import { OptimizerError } from "./errors.mjs";

const ROOT_FIELDS = new Set([
  "schemaVersion",
  "matrixId",
  "matrixVersion",
  "phase",
  "budgetIterations",
  "candidateSha256",
  "measurements",
]);
const MEASUREMENT_FIELDS = new Set(["scenarioId", "value"]);
const PHASES = new Set(["screening", "finalist"]);
const SHA256 = /^[0-9A-F]{64}$/u;
const MIN_METRIC = 1e-9;
const MAX_METRIC = 1e15;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function addIssue(issues, code, issuePath, message) {
  if (issues.length < 100) {
    issues.push({ code, path: issuePath, message });
  }
}

function knownFields(value, allowed, issuePath, issues) {
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) {
      addIssue(issues, "UNKNOWN_FIELD", `${issuePath}.${field}`, `Campo desconhecido: ${field}.`);
    }
  }
}

function metricValid(value) {
  return typeof value === "number"
    && Number.isFinite(value)
    && value >= MIN_METRIC
    && value <= MAX_METRIC;
}

function deepFreeze(value) {
  Object.freeze(value);
  for (const child of Object.values(value)) {
    if (child !== null && typeof child === "object" && !Object.isFrozen(child)) {
      deepFreeze(child);
    }
  }
  return value;
}

export function parseOptimizerMetricSet(
  document,
  matrixDocument,
  { phase, budgetIterations, candidateSha256, source = "<evaluator>" } = {}
) {
  const matrix = parseScenarioMatrixDocument(matrixDocument);
  const issues = [];
  if (!isRecord(document)) {
    throw new OptimizerError("OPTIMIZER_METRICS_INVALID", "O evaluator deve retornar um objeto de métricas.", {
      source,
      issues: [{ code: "INVALID_DOCUMENT", path: "$", message: "Objeto esperado." }],
    });
  }
  knownFields(document, ROOT_FIELDS, "$", issues);
  if (document.schemaVersion !== 1) {
    addIssue(issues, "UNSUPPORTED_METRICS_VERSION", "$.schemaVersion", "schemaVersion deve ser 1.");
  }
  if (document.matrixId !== matrix.id) {
    addIssue(issues, "METRICS_MATRIX_ID_MISMATCH", "$.matrixId", `matrixId deve ser ${matrix.id}.`);
  }
  if (document.matrixVersion !== matrix.version) {
    addIssue(issues, "METRICS_MATRIX_VERSION_MISMATCH", "$.matrixVersion", `matrixVersion deve ser ${matrix.version}.`);
  }
  if (!PHASES.has(document.phase)) {
    addIssue(issues, "INVALID_METRICS_PHASE", "$.phase", "phase deve ser screening ou finalist.");
  }
  if (phase !== undefined && document.phase !== phase) {
    addIssue(issues, "METRICS_PHASE_MISMATCH", "$.phase", `O evaluator deveria retornar phase ${phase}.`);
  }
  if (!Number.isInteger(document.budgetIterations) || document.budgetIterations < 1 || document.budgetIterations > 10_000_000) {
    addIssue(issues, "INVALID_METRICS_BUDGET", "$.budgetIterations", "budgetIterations deve ser inteiro positivo.");
  }
  if (budgetIterations !== undefined && document.budgetIterations !== budgetIterations) {
    addIssue(
      issues,
      "METRICS_BUDGET_MISMATCH",
      "$.budgetIterations",
      `O evaluator deveria usar ${budgetIterations} iterações.`
    );
  }
  if (typeof document.candidateSha256 !== "string" || !SHA256.test(document.candidateSha256)) {
    addIssue(issues, "INVALID_METRICS_CANDIDATE_DIGEST", "$.candidateSha256", "Use SHA-256 em maiúsculas.");
  }
  if (candidateSha256 !== undefined && document.candidateSha256 !== candidateSha256) {
    addIssue(
      issues,
      "METRICS_CANDIDATE_DIGEST_MISMATCH",
      "$.candidateSha256",
      `O evaluator deveria retornar o digest ${candidateSha256}.`
    );
  }

  const scenarioIds = new Set(matrix.scenarios.map((scenario) => scenario.id));
  const measurements = new Map();
  if (!Array.isArray(document.measurements)) {
    addIssue(issues, "INVALID_METRIC_MEASUREMENTS", "$.measurements", "measurements deve ser uma lista.");
  } else {
    if (document.measurements.length !== matrix.scenarios.length) {
      addIssue(
        issues,
        "METRIC_MEASUREMENT_COUNT_INVALID",
        "$.measurements",
        `São esperadas exatamente ${matrix.scenarios.length} medições.`
      );
    }
    for (let index = 0; index < document.measurements.length; index += 1) {
      const measurement = document.measurements[index];
      const measurementPath = `$.measurements[${index}]`;
      if (!isRecord(measurement)) {
        addIssue(issues, "INVALID_METRIC_MEASUREMENT", measurementPath, "A medição deve ser um objeto.");
        continue;
      }
      knownFields(measurement, MEASUREMENT_FIELDS, measurementPath, issues);
      if (typeof measurement.scenarioId !== "string" || !scenarioIds.has(measurement.scenarioId)) {
        addIssue(
          issues,
          "UNKNOWN_METRIC_SCENARIO",
          `${measurementPath}.scenarioId`,
          `Cenário desconhecido: ${String(measurement.scenarioId)}.`
        );
      } else if (measurements.has(measurement.scenarioId)) {
        addIssue(
          issues,
          "DUPLICATE_METRIC_SCENARIO",
          `${measurementPath}.scenarioId`,
          `Cenário duplicado: ${measurement.scenarioId}.`
        );
      } else {
        measurements.set(measurement.scenarioId, measurement.value);
      }
      if (!metricValid(measurement.value)) {
        addIssue(
          issues,
          "INVALID_METRIC_VALUE",
          `${measurementPath}.value`,
          `value deve ser finito entre ${MIN_METRIC} e ${MAX_METRIC}.`
        );
      }
    }
  }
  for (const scenario of matrix.scenarios) {
    if (!measurements.has(scenario.id)) {
      addIssue(issues, "METRIC_SCENARIO_MISSING", "$.measurements", `Métrica ausente: ${scenario.id}.`);
    }
  }

  if (issues.length > 0) {
    throw new OptimizerError(
      "OPTIMIZER_METRICS_INVALID",
      `Métricas do evaluator inválidas: ${issues.length} problema(s).`,
      { source, issues }
    );
  }

  return deepFreeze({
    schemaVersion: 1,
    matrixId: matrix.id,
    matrixVersion: matrix.version,
    phase: document.phase,
    budgetIterations: document.budgetIterations,
    candidateSha256: document.candidateSha256,
    measurements: matrix.scenarios.map((scenario) => ({
      scenarioId: scenario.id,
      value: measurements.get(scenario.id),
    })),
  });
}

export function serializeOptimizerMetricSet(document, matrix, expected) {
  return `${JSON.stringify(parseOptimizerMetricSet(document, matrix, expected), null, 2)}\n`;
}

export function metricSetDigest(document, matrix, expected) {
  return crypto
    .createHash("sha256")
    .update(serializeOptimizerMetricSet(document, matrix, expected), "utf8")
    .digest("hex")
    .toUpperCase();
}
