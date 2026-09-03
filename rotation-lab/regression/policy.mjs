import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { parseScenarioMatrixDocument } from "../scenarios/parser.mjs";
import { RegressionError } from "./errors.mjs";

const MAX_POLICY_BYTES = 1024 * 1024;
const NAMESPACED_ID = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/u;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;
const ROOT_FIELDS = new Set(["schemaVersion", "id", "version", "description", "targets", "thresholds"]);
const TARGET_FIELDS = new Set(["matrixId", "matrixVersion"]);
const THRESHOLD_FIELDS = new Set(["candidateVsBaseline", "candidateVsPreviousRelease"]);
const BASELINE_FIELDS = new Set(["source"]);
const PREVIOUS_RELEASE_FIELDS = new Set(["defaultMaxRegressionPercent", "overrides"]);
const OVERRIDE_FIELDS = new Set(["scenarioId", "maxRegressionPercent"]);

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

function thresholdValid(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
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

export function parseRegressionPolicyDocument(document, matrixDocument, { source = "<memory>" } = {}) {
  const matrix = parseScenarioMatrixDocument(matrixDocument);
  const issues = [];
  if (!isRecord(document)) {
    throw new RegressionError("REGRESSION_POLICY_INVALID", "Política inválida: objeto esperado.", {
      source,
      issues: [{ code: "INVALID_DOCUMENT", path: "$", message: "Objeto esperado." }],
    });
  }
  knownFields(document, ROOT_FIELDS, "$", issues);
  if (document.schemaVersion !== 1) {
    addIssue(issues, "UNSUPPORTED_POLICY_VERSION", "$.schemaVersion", "schemaVersion deve ser 1.");
  }
  if (typeof document.id !== "string" || !NAMESPACED_ID.test(document.id)) {
    addIssue(issues, "INVALID_POLICY_ID", "$.id", "Use um identificador namespaced em minúsculas.");
  }
  if (typeof document.version !== "string" || !SEMVER.test(document.version)) {
    addIssue(issues, "INVALID_POLICY_VERSION", "$.version", "Use uma versão semântica completa.");
  }
  if (typeof document.description !== "string" || document.description.trim() === "" || document.description.length > 500) {
    addIssue(issues, "INVALID_POLICY_DESCRIPTION", "$.description", "Informe uma descrição entre 1 e 500 caracteres.");
  }

  if (!isRecord(document.targets)) {
    addIssue(issues, "INVALID_POLICY_TARGETS", "$.targets", "targets deve ser um objeto.");
  } else {
    knownFields(document.targets, TARGET_FIELDS, "$.targets", issues);
    if (document.targets.matrixId !== matrix.id) {
      addIssue(issues, "POLICY_MATRIX_ID_MISMATCH", "$.targets.matrixId", `matrixId deve ser ${matrix.id}.`);
    }
    if (document.targets.matrixVersion !== matrix.version) {
      addIssue(
        issues,
        "POLICY_MATRIX_VERSION_MISMATCH",
        "$.targets.matrixVersion",
        `matrixVersion deve ser ${matrix.version}.`
      );
    }
  }

  let defaultMaxRegressionPercent;
  const overrides = new Map();
  if (!isRecord(document.thresholds)) {
    addIssue(issues, "INVALID_POLICY_THRESHOLDS", "$.thresholds", "thresholds deve ser um objeto.");
  } else {
    knownFields(document.thresholds, THRESHOLD_FIELDS, "$.thresholds", issues);
    const baseline = document.thresholds.candidateVsBaseline;
    if (!isRecord(baseline)) {
      addIssue(
        issues,
        "INVALID_BASELINE_THRESHOLD_POLICY",
        "$.thresholds.candidateVsBaseline",
        "candidateVsBaseline deve ser um objeto."
      );
    } else {
      knownFields(baseline, BASELINE_FIELDS, "$.thresholds.candidateVsBaseline", issues);
      if (baseline.source !== "scenario_matrix") {
        addIssue(
          issues,
          "INVALID_BASELINE_THRESHOLD_SOURCE",
          "$.thresholds.candidateVsBaseline.source",
          "source deve ser scenario_matrix."
        );
      }
    }

    const previous = document.thresholds.candidateVsPreviousRelease;
    if (!isRecord(previous)) {
      addIssue(
        issues,
        "INVALID_PREVIOUS_RELEASE_THRESHOLD_POLICY",
        "$.thresholds.candidateVsPreviousRelease",
        "candidateVsPreviousRelease deve ser um objeto."
      );
    } else {
      knownFields(previous, PREVIOUS_RELEASE_FIELDS, "$.thresholds.candidateVsPreviousRelease", issues);
      defaultMaxRegressionPercent = previous.defaultMaxRegressionPercent;
      if (!thresholdValid(defaultMaxRegressionPercent)) {
        addIssue(
          issues,
          "INVALID_DEFAULT_REGRESSION_THRESHOLD",
          "$.thresholds.candidateVsPreviousRelease.defaultMaxRegressionPercent",
          "defaultMaxRegressionPercent deve estar entre 0 e 100."
        );
      }
      if (!Array.isArray(previous.overrides)) {
        addIssue(
          issues,
          "INVALID_THRESHOLD_OVERRIDES",
          "$.thresholds.candidateVsPreviousRelease.overrides",
          "overrides deve ser uma lista."
        );
      } else {
        const scenarioIds = new Set(matrix.scenarios.map((scenario) => scenario.id));
        for (let index = 0; index < previous.overrides.length; index += 1) {
          const override = previous.overrides[index];
          const overridePath = `$.thresholds.candidateVsPreviousRelease.overrides[${index}]`;
          if (!isRecord(override)) {
            addIssue(issues, "INVALID_THRESHOLD_OVERRIDE", overridePath, "A sobrescrita deve ser um objeto.");
            continue;
          }
          knownFields(override, OVERRIDE_FIELDS, overridePath, issues);
          if (typeof override.scenarioId !== "string" || !scenarioIds.has(override.scenarioId)) {
            addIssue(
              issues,
              "UNKNOWN_THRESHOLD_SCENARIO",
              `${overridePath}.scenarioId`,
              `Cenário desconhecido: ${String(override.scenarioId)}.`
            );
          } else if (overrides.has(override.scenarioId)) {
            addIssue(
              issues,
              "DUPLICATE_THRESHOLD_SCENARIO",
              `${overridePath}.scenarioId`,
              `Cenário duplicado: ${override.scenarioId}.`
            );
          } else {
            overrides.set(override.scenarioId, override.maxRegressionPercent);
          }
          if (!thresholdValid(override.maxRegressionPercent)) {
            addIssue(
              issues,
              "INVALID_SCENARIO_REGRESSION_THRESHOLD",
              `${overridePath}.maxRegressionPercent`,
              "maxRegressionPercent deve estar entre 0 e 100."
            );
          }
        }
      }
    }
  }

  if (issues.length > 0) {
    throw new RegressionError(
      "REGRESSION_POLICY_INVALID",
      `Política de regressão inválida: ${issues.length} problema(s).`,
      { source, issues }
    );
  }

  return deepFreeze({
    schemaVersion: 1,
    id: document.id,
    version: document.version,
    description: document.description,
    targets: { matrixId: matrix.id, matrixVersion: matrix.version },
    thresholds: {
      candidateVsBaseline: { source: "scenario_matrix" },
      candidateVsPreviousRelease: {
        defaultMaxRegressionPercent,
        overrides: matrix.scenarios
          .filter((scenario) => overrides.has(scenario.id))
          .map((scenario) => ({
            scenarioId: scenario.id,
            maxRegressionPercent: overrides.get(scenario.id),
          })),
      },
    },
  });
}

export function parseRegressionPolicyText(text, matrix, { source = "<memory>" } = {}) {
  if (typeof text !== "string") {
    throw new RegressionError("REGRESSION_POLICY_TEXT_REQUIRED", "A política deve ser fornecida em JSON.", { source });
  }
  if (Buffer.byteLength(text, "utf8") > MAX_POLICY_BYTES) {
    throw new RegressionError("REGRESSION_POLICY_TOO_LARGE", `A política excede ${MAX_POLICY_BYTES} bytes.`, { source });
  }
  try {
    return parseRegressionPolicyDocument(JSON.parse(text), matrix, { source });
  } catch (error) {
    if (error instanceof RegressionError) {
      throw error;
    }
    throw new RegressionError("REGRESSION_POLICY_JSON_INVALID", "A política não contém JSON válido.", {
      source,
      cause: error,
    });
  }
}

export function loadRegressionPolicyFile(file, matrix, { root = process.cwd() } = {}) {
  if (typeof file !== "string" || file.trim() === "") {
    throw new RegressionError("REGRESSION_POLICY_FILE_REQUIRED", "Informe um arquivo .regression-policy.json.");
  }
  const projectRoot = fs.realpathSync(path.resolve(root));
  const candidate = path.resolve(projectRoot, file);
  const source = normalizeRelative(path.relative(projectRoot, candidate));
  if (!isInside(projectRoot, candidate)) {
    throw new RegressionError("REGRESSION_POLICY_OUTSIDE_PROJECT", "A política deve permanecer no repositório.", { source });
  }
  if (!candidate.toLowerCase().endsWith(".regression-policy.json")) {
    throw new RegressionError(
      "REGRESSION_POLICY_EXTENSION_INVALID",
      "O arquivo deve usar a extensão .regression-policy.json.",
      { source }
    );
  }
  const stat = fs.statSync(candidate, { throwIfNoEntry: false });
  if (!stat?.isFile()) {
    throw new RegressionError("REGRESSION_POLICY_FILE_MISSING", `Política não encontrada: ${source}.`, { source });
  }
  if (stat.size > MAX_POLICY_BYTES) {
    throw new RegressionError("REGRESSION_POLICY_TOO_LARGE", `A política excede ${MAX_POLICY_BYTES} bytes.`, { source });
  }
  const realFile = fs.realpathSync(candidate);
  if (!isInside(projectRoot, realFile)) {
    throw new RegressionError(
      "REGRESSION_POLICY_OUTSIDE_PROJECT",
      "A política resolve por link para fora do repositório.",
      { source }
    );
  }
  return parseRegressionPolicyText(fs.readFileSync(realFile, "utf8"), matrix, { source });
}

export function serializeRegressionPolicy(document, matrix) {
  return `${JSON.stringify(parseRegressionPolicyDocument(document, matrix), null, 2)}\n`;
}

export function regressionPolicyDigest(document, matrix) {
  return crypto
    .createHash("sha256")
    .update(serializeRegressionPolicy(document, matrix), "utf8")
    .digest("hex")
    .toUpperCase();
}
