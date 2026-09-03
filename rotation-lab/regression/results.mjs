import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { parseScenarioMatrixDocument } from "../scenarios/parser.mjs";
import { compileScenarioPlans } from "../scenarios/plan.mjs";
import { RegressionError } from "./errors.mjs";

const MAX_RESULTS_BYTES = 1024 * 1024;
const NAMESPACED_ID = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/u;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;
const SHA256 = /^[0-9A-F]{64}$/u;
const ENGINE_VERSION = /^[0-9A-Za-z][0-9A-Za-z._-]{0,63}$/u;
const ENGINE_REVISION = /^[0-9a-f]{7,64}$/u;
const WOW_BUILD = /^\d+(?:\.\d+){2,3}$/u;
const ROLES = new Set(["baseline", "candidate", "previous_release"]);
const ROOT_FIELDS = new Set(["schemaVersion", "role", "matrix", "rotation", "engine", "measurements"]);
const MATRIX_FIELDS = new Set(["id", "version", "sha256"]);
const ROTATION_FIELDS = new Set(["id", "version", "sha256", "releaseVersion"]);
const ENGINE_FIELDS = new Set(["id", "version", "revision", "wowBuild", "iterations"]);
const MEASUREMENT_FIELDS = new Set(["scenarioId", "seed", "value"]);
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

function finitePositive(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= MIN_METRIC && value <= MAX_METRIC;
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

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function normalizeRelative(value) {
  return value.split(path.sep).join("/");
}

export function parseRegressionResultsDocument(
  document,
  matrixDocument,
  { role: expectedRole, source = "<memory>" } = {}
) {
  const matrix = parseScenarioMatrixDocument(matrixDocument);
  const matrixSha256 = compileScenarioPlans(matrix).source.sha256;
  const issues = [];
  if (!isRecord(document)) {
    throw new RegressionError("REGRESSION_RESULTS_INVALID", "Resultados inválidos: objeto esperado.", {
      source,
      issues: [{ code: "INVALID_DOCUMENT", path: "$", message: "Objeto esperado." }],
    });
  }
  knownFields(document, ROOT_FIELDS, "$", issues);
  if (document.schemaVersion !== 1) {
    addIssue(issues, "UNSUPPORTED_RESULTS_VERSION", "$.schemaVersion", "schemaVersion deve ser 1.");
  }
  if (!ROLES.has(document.role)) {
    addIssue(issues, "INVALID_RESULTS_ROLE", "$.role", "role deve ser baseline, candidate ou previous_release.");
  }
  if (expectedRole !== undefined && document.role !== expectedRole) {
    addIssue(issues, "RESULTS_ROLE_MISMATCH", "$.role", `O resultado deveria usar role ${expectedRole}.`);
  }

  if (!isRecord(document.matrix)) {
    addIssue(issues, "INVALID_RESULTS_MATRIX", "$.matrix", "matrix deve ser um objeto.");
  } else {
    knownFields(document.matrix, MATRIX_FIELDS, "$.matrix", issues);
    if (document.matrix.id !== matrix.id || document.matrix.version !== matrix.version) {
      addIssue(
        issues,
        "RESULTS_MATRIX_MISMATCH",
        "$.matrix",
        `O resultado deve referenciar ${matrix.id}@${matrix.version}.`
      );
    }
    if (document.matrix.sha256 !== matrixSha256) {
      addIssue(
        issues,
        "RESULTS_MATRIX_DIGEST_MISMATCH",
        "$.matrix.sha256",
        `O digest da matriz deve ser ${matrixSha256}.`
      );
    }
  }

  if (!isRecord(document.rotation)) {
    addIssue(issues, "INVALID_RESULTS_ROTATION", "$.rotation", "rotation deve ser um objeto.");
  } else {
    knownFields(document.rotation, ROTATION_FIELDS, "$.rotation", issues);
    if (typeof document.rotation.id !== "string" || !NAMESPACED_ID.test(document.rotation.id)) {
      addIssue(issues, "INVALID_ROTATION_ID", "$.rotation.id", "Use um identificador namespaced em minúsculas.");
    }
    if (typeof document.rotation.version !== "string" || !SEMVER.test(document.rotation.version)) {
      addIssue(issues, "INVALID_ROTATION_VERSION", "$.rotation.version", "Use uma versão semântica completa.");
    }
    if (typeof document.rotation.sha256 !== "string" || !SHA256.test(document.rotation.sha256)) {
      addIssue(issues, "INVALID_ROTATION_DIGEST", "$.rotation.sha256", "Use SHA-256 em maiúsculas.");
    }
    if (document.role === "previous_release") {
      if (typeof document.rotation.releaseVersion !== "string" || !SEMVER.test(document.rotation.releaseVersion)) {
        addIssue(
          issues,
          "PREVIOUS_RELEASE_VERSION_REQUIRED",
          "$.rotation.releaseVersion",
          "previous_release exige releaseVersion semântica."
        );
      }
    } else if (document.rotation.releaseVersion !== null) {
      addIssue(
        issues,
        "UNEXPECTED_RELEASE_VERSION",
        "$.rotation.releaseVersion",
        "baseline e candidate devem usar releaseVersion null."
      );
    }
  }

  if (!isRecord(document.engine)) {
    addIssue(issues, "INVALID_RESULTS_ENGINE", "$.engine", "engine deve ser um objeto.");
  } else {
    knownFields(document.engine, ENGINE_FIELDS, "$.engine", issues);
    if (typeof document.engine.id !== "string" || !NAMESPACED_ID.test(document.engine.id)) {
      addIssue(issues, "INVALID_ENGINE_ID", "$.engine.id", "Use um identificador namespaced em minúsculas.");
    }
    if (typeof document.engine.version !== "string" || !ENGINE_VERSION.test(document.engine.version)) {
      addIssue(issues, "INVALID_ENGINE_VERSION", "$.engine.version", "Informe uma versão de engine válida.");
    }
    if (typeof document.engine.revision !== "string" || !ENGINE_REVISION.test(document.engine.revision)) {
      addIssue(issues, "INVALID_ENGINE_REVISION", "$.engine.revision", "Use uma revisão hexadecimal minúscula.");
    }
    if (typeof document.engine.wowBuild !== "string" || !WOW_BUILD.test(document.engine.wowBuild)) {
      addIssue(issues, "INVALID_WOW_BUILD", "$.engine.wowBuild", "Informe o build do WoW em formato numérico.");
    }
    if (!Number.isInteger(document.engine.iterations) || document.engine.iterations < 1 || document.engine.iterations > 10_000_000) {
      addIssue(issues, "INVALID_RESULTS_ITERATIONS", "$.engine.iterations", "iterations deve estar entre 1 e 10000000.");
    }
  }

  const scenarioIds = new Set(matrix.scenarios.map((scenario) => scenario.id));
  const measurements = new Map();
  if (!Array.isArray(document.measurements)) {
    addIssue(issues, "INVALID_RESULTS_MEASUREMENTS", "$.measurements", "measurements deve ser uma lista.");
  } else {
    if (document.measurements.length !== matrix.scenarios.length) {
      addIssue(
        issues,
        "RESULTS_MEASUREMENT_COUNT_INVALID",
        "$.measurements",
        `São esperadas exatamente ${matrix.scenarios.length} medições.`
      );
    }
    for (let index = 0; index < document.measurements.length; index += 1) {
      const measurement = document.measurements[index];
      const measurementPath = `$.measurements[${index}]`;
      if (!isRecord(measurement)) {
        addIssue(issues, "INVALID_RESULTS_MEASUREMENT", measurementPath, "A medição deve ser um objeto.");
        continue;
      }
      knownFields(measurement, MEASUREMENT_FIELDS, measurementPath, issues);
      if (typeof measurement.scenarioId !== "string" || !scenarioIds.has(measurement.scenarioId)) {
        addIssue(
          issues,
          "UNKNOWN_RESULTS_SCENARIO",
          `${measurementPath}.scenarioId`,
          `Cenário desconhecido: ${String(measurement.scenarioId)}.`
        );
      } else if (measurements.has(measurement.scenarioId)) {
        addIssue(
          issues,
          "DUPLICATE_RESULTS_SCENARIO",
          `${measurementPath}.scenarioId`,
          `Cenário duplicado: ${measurement.scenarioId}.`
        );
      } else {
        measurements.set(measurement.scenarioId, measurement);
      }
      if (!Number.isSafeInteger(measurement.seed) || measurement.seed < 1 || measurement.seed > 2_147_483_647) {
        addIssue(
          issues,
          "INVALID_RESULTS_SEED",
          `${measurementPath}.seed`,
          "seed deve ser um inteiro entre 1 e 2147483647."
        );
      }
      if (!finitePositive(measurement.value)) {
        addIssue(
          issues,
          "INVALID_RESULTS_VALUE",
          `${measurementPath}.value`,
          `value deve ser finito entre ${MIN_METRIC} e ${MAX_METRIC}.`
        );
      }
    }
  }
  for (const scenario of matrix.scenarios) {
    if (!measurements.has(scenario.id)) {
      addIssue(issues, "RESULTS_SCENARIO_MISSING", "$.measurements", `Medição ausente: ${scenario.id}.`);
    }
  }

  if (issues.length > 0) {
    throw new RegressionError(
      "REGRESSION_RESULTS_INVALID",
      `Resultados de regressão inválidos: ${issues.length} problema(s).`,
      { source, issues }
    );
  }

  return deepFreeze({
    schemaVersion: 1,
    role: document.role,
    matrix: { id: matrix.id, version: matrix.version, sha256: matrixSha256 },
    rotation: {
      id: document.rotation.id,
      version: document.rotation.version,
      sha256: document.rotation.sha256,
      releaseVersion: document.rotation.releaseVersion,
    },
    engine: {
      id: document.engine.id,
      version: document.engine.version,
      revision: document.engine.revision,
      wowBuild: document.engine.wowBuild,
      iterations: document.engine.iterations,
    },
    measurements: matrix.scenarios.map((scenario) => {
      const measurement = measurements.get(scenario.id);
      return { scenarioId: scenario.id, seed: measurement.seed, value: measurement.value };
    }),
  });
}

export function parseRegressionResultsText(text, matrix, expected = {}) {
  const source = expected.source ?? "<memory>";
  if (typeof text !== "string") {
    throw new RegressionError("REGRESSION_RESULTS_TEXT_REQUIRED", "Os resultados devem ser fornecidos em JSON.", { source });
  }
  if (Buffer.byteLength(text, "utf8") > MAX_RESULTS_BYTES) {
    throw new RegressionError("REGRESSION_RESULTS_TOO_LARGE", `Os resultados excedem ${MAX_RESULTS_BYTES} bytes.`, { source });
  }
  try {
    return parseRegressionResultsDocument(JSON.parse(text), matrix, expected);
  } catch (error) {
    if (error instanceof RegressionError) {
      throw error;
    }
    throw new RegressionError("REGRESSION_RESULTS_JSON_INVALID", "Os resultados não contêm JSON válido.", {
      source,
      cause: error,
    });
  }
}

export function loadRegressionResultsFile(file, matrix, { root = process.cwd(), role } = {}) {
  if (typeof file !== "string" || file.trim() === "") {
    throw new RegressionError("REGRESSION_RESULTS_FILE_REQUIRED", "Informe um arquivo .regression-results.json.");
  }
  const projectRoot = fs.realpathSync(path.resolve(root));
  const candidate = path.resolve(projectRoot, file);
  const source = normalizeRelative(path.relative(projectRoot, candidate));
  if (!isInside(projectRoot, candidate)) {
    throw new RegressionError("REGRESSION_RESULTS_OUTSIDE_PROJECT", "Os resultados devem permanecer no repositório.", { source });
  }
  if (!candidate.toLowerCase().endsWith(".regression-results.json")) {
    throw new RegressionError(
      "REGRESSION_RESULTS_EXTENSION_INVALID",
      "O arquivo deve usar a extensão .regression-results.json.",
      { source }
    );
  }
  const stat = fs.statSync(candidate, { throwIfNoEntry: false });
  if (!stat?.isFile()) {
    throw new RegressionError("REGRESSION_RESULTS_FILE_MISSING", `Resultados não encontrados: ${source}.`, { source });
  }
  if (stat.size > MAX_RESULTS_BYTES) {
    throw new RegressionError("REGRESSION_RESULTS_TOO_LARGE", `Os resultados excedem ${MAX_RESULTS_BYTES} bytes.`, { source });
  }
  const realFile = fs.realpathSync(candidate);
  if (!isInside(projectRoot, realFile)) {
    throw new RegressionError(
      "REGRESSION_RESULTS_OUTSIDE_PROJECT",
      "Os resultados resolvem por link para fora do repositório.",
      { source }
    );
  }
  return parseRegressionResultsText(fs.readFileSync(realFile, "utf8"), matrix, { source, role });
}

export function serializeRegressionResults(document, matrix, expected = {}) {
  return `${JSON.stringify(parseRegressionResultsDocument(document, matrix, expected), null, 2)}\n`;
}

export function regressionResultsDigest(document, matrix, expected = {}) {
  return crypto
    .createHash("sha256")
    .update(serializeRegressionResults(document, matrix, expected), "utf8")
    .digest("hex")
    .toUpperCase();
}
