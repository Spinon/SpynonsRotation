import fs from "node:fs";
import path from "node:path";
import { ScenarioMatrixError } from "./errors.mjs";
import { parseScenarioMatrixDocument } from "./parser.mjs";

const MAX_RESULTS_BYTES = 1024 * 1024;
const NAMESPACED_ID = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/u;
const ROOT_FIELDS = new Set(["schemaVersion", "matrixId", "matrixVersion", "candidateId", "measurements"]);
const MEASUREMENT_FIELDS = new Set(["scenarioId", "baseline", "candidate"]);
const MIN_METRIC = 1e-9;
const MAX_METRIC = 1e15;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function normalizeRelative(value) {
  return value.split(path.sep).join("/");
}

function finitePositive(value) {
  return typeof value === "number"
    && Number.isFinite(value)
    && value >= MIN_METRIC
    && value <= MAX_METRIC;
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

function deepFreeze(value) {
  Object.freeze(value);
  for (const child of Object.values(value)) {
    if (child !== null && typeof child === "object" && !Object.isFrozen(child)) {
      deepFreeze(child);
    }
  }
  return value;
}

export function parseScenarioResultsDocument(document, matrixDocument, { source = "<memory>" } = {}) {
  const matrix = parseScenarioMatrixDocument(matrixDocument);
  const issues = [];
  if (!isRecord(document)) {
    throw new ScenarioMatrixError("SCENARIO_RESULTS_VALIDATION_FAILED", "Resultados inválidos: objeto esperado.", {
      source,
      issues: [{ code: "INVALID_DOCUMENT", path: "$", message: "Objeto esperado." }],
    });
  }
  knownFields(document, ROOT_FIELDS, "$", issues);
  if (document.schemaVersion !== 1) {
    addIssue(issues, "UNSUPPORTED_RESULTS_VERSION", "$.schemaVersion", "schemaVersion deve ser 1.");
  }
  if (document.matrixId !== matrix.id || document.matrixVersion !== matrix.version) {
    addIssue(
      issues,
      "RESULTS_MATRIX_MISMATCH",
      "$.matrixId",
      `Os resultados devem referenciar ${matrix.id}@${matrix.version}.`
    );
  }
  if (typeof document.candidateId !== "string" || !NAMESPACED_ID.test(document.candidateId)) {
    addIssue(issues, "INVALID_CANDIDATE_ID", "$.candidateId", "Use um identificador namespaced em minúsculas.");
  }

  const scenarioIds = new Set(matrix.scenarios.map((scenario) => scenario.id));
  const measurements = new Map();
  if (!Array.isArray(document.measurements)) {
    addIssue(issues, "INVALID_MEASUREMENTS", "$.measurements", "measurements deve ser uma lista.");
  } else {
    if (document.measurements.length !== matrix.scenarios.length) {
      addIssue(
        issues,
        "RESULT_COUNT_INVALID",
        "$.measurements",
        `São esperadas exatamente ${matrix.scenarios.length} medições.`
      );
    }
    for (let index = 0; index < document.measurements.length; index += 1) {
      const measurement = document.measurements[index];
      const measurementPath = `$.measurements[${index}]`;
      if (!isRecord(measurement)) {
        addIssue(issues, "INVALID_MEASUREMENT", measurementPath, "A medição deve ser um objeto.");
        continue;
      }
      knownFields(measurement, MEASUREMENT_FIELDS, measurementPath, issues);
      if (typeof measurement.scenarioId !== "string" || !scenarioIds.has(measurement.scenarioId)) {
        addIssue(
          issues,
          "UNKNOWN_RESULT_SCENARIO",
          `${measurementPath}.scenarioId`,
          `Cenário desconhecido: ${String(measurement.scenarioId)}.`
        );
      } else if (measurements.has(measurement.scenarioId)) {
        addIssue(
          issues,
          "DUPLICATE_RESULT_SCENARIO",
          `${measurementPath}.scenarioId`,
          `Resultado duplicado: ${measurement.scenarioId}.`
        );
      } else {
        measurements.set(measurement.scenarioId, measurement);
      }
      if (!finitePositive(measurement.baseline)) {
        addIssue(
          issues,
          "INVALID_BASELINE_METRIC",
          `${measurementPath}.baseline`,
          `baseline deve ser finito entre ${MIN_METRIC} e ${MAX_METRIC}.`
        );
      }
      if (!finitePositive(measurement.candidate)) {
        addIssue(
          issues,
          "INVALID_CANDIDATE_METRIC",
          `${measurementPath}.candidate`,
          `candidate deve ser finito entre ${MIN_METRIC} e ${MAX_METRIC}.`
        );
      }
    }
  }

  for (const scenario of matrix.scenarios) {
    if (!measurements.has(scenario.id)) {
      addIssue(issues, "RESULT_SCENARIO_MISSING", "$.measurements", `Resultado ausente: ${scenario.id}.`);
    }
  }
  if (issues.length > 0) {
    throw new ScenarioMatrixError(
      "SCENARIO_RESULTS_VALIDATION_FAILED",
      `Resultados de cenário inválidos: ${issues.length} problema(s).`,
      { source, issues }
    );
  }

  return deepFreeze({
    schemaVersion: 1,
    matrixId: matrix.id,
    matrixVersion: matrix.version,
    candidateId: document.candidateId,
    measurements: matrix.scenarios.map((scenario) => {
      const measurement = measurements.get(scenario.id);
      return {
        scenarioId: scenario.id,
        baseline: measurement.baseline,
        candidate: measurement.candidate,
      };
    }),
  });
}

export function parseScenarioResultsText(text, matrix, { source = "<memory>" } = {}) {
  if (typeof text !== "string") {
    throw new ScenarioMatrixError("SCENARIO_RESULTS_TEXT_REQUIRED", "Os resultados devem ser fornecidos em JSON.", {
      source,
    });
  }
  if (Buffer.byteLength(text, "utf8") > MAX_RESULTS_BYTES) {
    throw new ScenarioMatrixError("SCENARIO_RESULTS_TOO_LARGE", `Os resultados excedem ${MAX_RESULTS_BYTES} bytes.`, {
      source,
    });
  }
  try {
    return parseScenarioResultsDocument(JSON.parse(text), matrix, { source });
  } catch (error) {
    if (error instanceof ScenarioMatrixError) {
      throw error;
    }
    throw new ScenarioMatrixError("SCENARIO_RESULTS_JSON_INVALID", "Os resultados não contêm JSON válido.", {
      source,
      cause: error,
    });
  }
}

export function loadScenarioResultsFile(file, matrix, { root = process.cwd() } = {}) {
  if (typeof file !== "string" || file.trim() === "") {
    throw new ScenarioMatrixError("SCENARIO_RESULTS_FILE_REQUIRED", "Informe um arquivo .scenario-results.json.");
  }
  const projectRoot = fs.realpathSync(path.resolve(root));
  const candidate = path.resolve(projectRoot, file);
  const source = normalizeRelative(path.relative(projectRoot, candidate));
  if (!isInside(projectRoot, candidate)) {
    throw new ScenarioMatrixError("SCENARIO_RESULTS_OUTSIDE_PROJECT", "Os resultados devem permanecer no repositório.", {
      source,
    });
  }
  if (!candidate.toLowerCase().endsWith(".scenario-results.json")) {
    throw new ScenarioMatrixError(
      "SCENARIO_RESULTS_EXTENSION_INVALID",
      "O arquivo deve usar a extensão .scenario-results.json.",
      { source }
    );
  }
  const stat = fs.statSync(candidate, { throwIfNoEntry: false });
  if (!stat?.isFile()) {
    throw new ScenarioMatrixError("SCENARIO_RESULTS_FILE_MISSING", `Resultados não encontrados: ${source}.`, { source });
  }
  if (stat.size > MAX_RESULTS_BYTES) {
    throw new ScenarioMatrixError("SCENARIO_RESULTS_TOO_LARGE", `Os resultados excedem ${MAX_RESULTS_BYTES} bytes.`, {
      source,
    });
  }
  const realFile = fs.realpathSync(candidate);
  if (!isInside(projectRoot, realFile)) {
    throw new ScenarioMatrixError(
      "SCENARIO_RESULTS_OUTSIDE_PROJECT",
      "Os resultados resolvem por link para fora do repositório.",
      { source }
    );
  }
  return parseScenarioResultsText(fs.readFileSync(realFile, "utf8"), matrix, { source });
}

function round(value) {
  const rounded = Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function evaluateScenarioResults(matrixDocument, resultsDocument) {
  const matrix = parseScenarioMatrixDocument(matrixDocument);
  const results = parseScenarioResultsDocument(resultsDocument, matrix);
  const measurements = new Map(results.measurements.map((measurement) => [measurement.scenarioId, measurement]));
  const categories = new Map();
  const scenarios = [];
  const guardrailViolations = [];
  let totalWeight = 0;
  let weightedDelta = 0;

  for (const scenario of matrix.scenarios) {
    const measurement = measurements.get(scenario.id);
    const deltaPercent = ((measurement.candidate / measurement.baseline) - 1) * 100;
    const maxRegressionPercent = scenario.maxRegressionPercent
      ?? matrix.fitness.defaultMaxRegressionPercent;
    const breached = deltaPercent < (-maxRegressionPercent - 1e-9);
    totalWeight += scenario.weight;
    weightedDelta += deltaPercent * scenario.weight;

    const category = categories.get(scenario.category) ?? { weight: 0, weightedDelta: 0 };
    category.weight += scenario.weight;
    category.weightedDelta += deltaPercent * scenario.weight;
    categories.set(scenario.category, category);

    scenarios.push({
      scenarioId: scenario.id,
      category: scenario.category,
      baseline: measurement.baseline,
      candidate: measurement.candidate,
      deltaPercent: round(deltaPercent),
      weight: scenario.weight,
      maxRegressionPercent,
      guardrail: breached ? "fail" : "pass",
    });
    if (breached) {
      guardrailViolations.push({
        scenarioId: scenario.id,
        deltaPercent: round(deltaPercent),
        maxRegressionPercent,
      });
    }
  }

  const categoryScores = [...categories.entries()]
    .sort(([left], [right]) => left.localeCompare(right, "en"))
    .map(([category, aggregate]) => ({
      category,
      weight: aggregate.weight,
      fitnessPercent: round(aggregate.weightedDelta / aggregate.weight),
    }));

  return deepFreeze({
    schemaVersion: 1,
    matrix: { id: matrix.id, version: matrix.version },
    candidateId: results.candidateId,
    metric: matrix.fitness.metric,
    aggregation: matrix.fitness.aggregation,
    eligible: guardrailViolations.length === 0,
    fitnessPercent: round(weightedDelta / totalWeight),
    totalWeight,
    categories: categoryScores,
    scenarios,
    guardrailViolations,
  });
}

export function serializeScenarioEvaluation(matrix, results) {
  return `${JSON.stringify(evaluateScenarioResults(matrix, results), null, 2)}\n`;
}
