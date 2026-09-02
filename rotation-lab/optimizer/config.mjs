import fs from "node:fs";
import path from "node:path";
import { OptimizerError } from "./errors.mjs";

const MAX_CONFIG_BYTES = 1024 * 1024;
const MAX_ISSUES = 100;
const MAX_MUTATIONS = 64;
const NAMESPACED_ID = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/u;
const SIMPLE_ID = /^[a-z][a-z0-9_]*$/u;
const SEMANTIC_VERSION = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
const ROOT_FIELDS = new Set(["schemaVersion", "id", "version", "description", "targets", "limits", "budgets", "mutations"]);
const TARGET_FIELDS = new Set(["rotationId", "rotationVersion", "matrixId", "matrixVersion"]);
const LIMIT_FIELDS = new Set(["maxDepth", "beamWidth", "maxCandidates", "finalists"]);
const BUDGET_FIELDS = new Set(["screeningIterations", "finalistIterations"]);
const MUTATION_FIELDS = Object.freeze({
  swap_rules: new Set(["id", "kind", "listId", "firstRuleId", "secondRuleId"]),
  set_numeric_literal: new Set(["id", "kind", "listId", "ruleId", "valuePath", "value"]),
});
const PATH_FIELDS = new Set(["condition", "conditions", "left", "right", "value"]);

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

function addIssue(issues, code, issuePath, message) {
  if (issues.length < MAX_ISSUES) {
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

function stringField(value, issuePath, issues, { maximum = 128, pattern, optional = false } = {}) {
  if (optional && value === undefined) {
    return false;
  }
  if (typeof value !== "string" || value.length === 0 || value.length > maximum) {
    addIssue(issues, "INVALID_STRING", issuePath, `Deve ser um texto não vazio de até ${maximum} caracteres.`);
    return false;
  }
  if (pattern && !pattern.test(value)) {
    addIssue(issues, "INVALID_FORMAT", issuePath, "Formato inválido.");
    return false;
  }
  return true;
}

function integerField(value, issuePath, issues, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    addIssue(issues, "INVALID_INTEGER", issuePath, `Deve ser inteiro entre ${minimum} e ${maximum}.`);
    return false;
  }
  return true;
}

function validateTargets(value, issues) {
  if (!isRecord(value)) {
    addIssue(issues, "INVALID_TARGETS", "$.targets", "targets deve ser um objeto.");
    return;
  }
  knownFields(value, TARGET_FIELDS, "$.targets", issues);
  stringField(value.rotationId, "$.targets.rotationId", issues, { pattern: NAMESPACED_ID });
  stringField(value.rotationVersion, "$.targets.rotationVersion", issues, { maximum: 64, pattern: SEMANTIC_VERSION });
  stringField(value.matrixId, "$.targets.matrixId", issues, { pattern: NAMESPACED_ID });
  stringField(value.matrixVersion, "$.targets.matrixVersion", issues, { maximum: 64, pattern: SEMANTIC_VERSION });
}

function validateLimits(value, issues) {
  if (!isRecord(value)) {
    addIssue(issues, "INVALID_LIMITS", "$.limits", "limits deve ser um objeto.");
    return;
  }
  knownFields(value, LIMIT_FIELDS, "$.limits", issues);
  integerField(value.maxDepth, "$.limits.maxDepth", issues, 1, 8);
  integerField(value.beamWidth, "$.limits.beamWidth", issues, 1, 64);
  const candidatesValid = integerField(value.maxCandidates, "$.limits.maxCandidates", issues, 1, 10_000);
  const finalistsValid = integerField(value.finalists, "$.limits.finalists", issues, 1, 64);
  if (candidatesValid && finalistsValid && value.finalists > value.maxCandidates) {
    addIssue(issues, "FINALISTS_EXCEED_CANDIDATES", "$.limits.finalists", "finalists não pode exceder maxCandidates.");
  }
}

function validateBudgets(value, issues) {
  if (!isRecord(value)) {
    addIssue(issues, "INVALID_BUDGETS", "$.budgets", "budgets deve ser um objeto.");
    return;
  }
  knownFields(value, BUDGET_FIELDS, "$.budgets", issues);
  const screeningValid = integerField(value.screeningIterations, "$.budgets.screeningIterations", issues, 1, 10_000_000);
  const finalistValid = integerField(value.finalistIterations, "$.budgets.finalistIterations", issues, 1, 10_000_000);
  if (screeningValid && finalistValid && value.finalistIterations <= value.screeningIterations) {
    addIssue(
      issues,
      "FINALIST_BUDGET_NOT_GREATER",
      "$.budgets.finalistIterations",
      "finalistIterations deve ser maior que screeningIterations."
    );
  }
}

function validateValuePath(value, issuePath, issues) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 32) {
    addIssue(issues, "INVALID_VALUE_PATH", issuePath, "valuePath deve ter entre 1 e 32 segmentos.");
    return;
  }
  for (let index = 0; index < value.length; index += 1) {
    const segment = value[index];
    if (typeof segment === "number") {
      if (!Number.isInteger(segment) || segment < 0 || segment > 511) {
        addIssue(issues, "INVALID_VALUE_PATH", `${issuePath}[${index}]`, "Índice deve ser inteiro entre 0 e 511.");
      }
    } else if (typeof segment !== "string" || !PATH_FIELDS.has(segment)) {
      addIssue(
        issues,
        "INVALID_VALUE_PATH",
        `${issuePath}[${index}]`,
        "Segmento deve ser condition, conditions, left, right, value ou um índice."
      );
    }
  }
}

function validateMutation(value, index, issues, ids) {
  const mutationPath = `$.mutations[${index}]`;
  if (!isRecord(value)) {
    addIssue(issues, "INVALID_MUTATION", mutationPath, "A mutação deve ser um objeto.");
    return;
  }
  const allowed = MUTATION_FIELDS[value.kind];
  if (!allowed) {
    addIssue(issues, "INVALID_MUTATION_KIND", `${mutationPath}.kind`, "Use swap_rules ou set_numeric_literal.");
    return;
  }
  knownFields(value, allowed, mutationPath, issues);
  if (stringField(value.id, `${mutationPath}.id`, issues, { pattern: NAMESPACED_ID })) {
    if (ids.has(value.id)) {
      addIssue(issues, "DUPLICATE_MUTATION_ID", `${mutationPath}.id`, `Mutação duplicada: ${value.id}.`);
    }
    ids.add(value.id);
  }
  stringField(value.listId, `${mutationPath}.listId`, issues, { maximum: 64, pattern: SIMPLE_ID });
  if (value.kind === "swap_rules") {
    const firstValid = stringField(value.firstRuleId, `${mutationPath}.firstRuleId`, issues, { pattern: NAMESPACED_ID });
    const secondValid = stringField(value.secondRuleId, `${mutationPath}.secondRuleId`, issues, { pattern: NAMESPACED_ID });
    if (firstValid && secondValid && value.firstRuleId === value.secondRuleId) {
      addIssue(issues, "SWAP_RULES_IDENTICAL", `${mutationPath}.secondRuleId`, "A troca exige duas regras diferentes.");
    }
    return;
  }
  stringField(value.ruleId, `${mutationPath}.ruleId`, issues, { pattern: NAMESPACED_ID });
  validateValuePath(value.valuePath, `${mutationPath}.valuePath`, issues);
  if (typeof value.value !== "number" || !Number.isFinite(value.value) || Math.abs(value.value) > 1_000_000_000) {
    addIssue(
      issues,
      "INVALID_MUTATION_VALUE",
      `${mutationPath}.value`,
      "value deve ser número finito com magnitude máxima de 1000000000."
    );
  }
}

function validateOptimizerConfig(document) {
  const issues = [];
  if (!isRecord(document)) {
    return { valid: false, issues: [{ code: "INVALID_DOCUMENT", path: "$", message: "Objeto esperado." }] };
  }
  knownFields(document, ROOT_FIELDS, "$", issues);
  if (document.schemaVersion !== 1) {
    addIssue(issues, "UNSUPPORTED_SCHEMA_VERSION", "$.schemaVersion", "schemaVersion deve ser 1.");
  }
  stringField(document.id, "$.id", issues, { pattern: NAMESPACED_ID });
  stringField(document.version, "$.version", issues, { maximum: 64, pattern: SEMANTIC_VERSION });
  stringField(document.description, "$.description", issues, { maximum: 4096, optional: true });
  validateTargets(document.targets, issues);
  validateLimits(document.limits, issues);
  validateBudgets(document.budgets, issues);
  if (!Array.isArray(document.mutations) || document.mutations.length === 0 || document.mutations.length > MAX_MUTATIONS) {
    addIssue(issues, "INVALID_MUTATIONS", "$.mutations", `Use entre 1 e ${MAX_MUTATIONS} mutações.`);
  } else {
    const ids = new Set();
    for (let index = 0; index < document.mutations.length; index += 1) {
      validateMutation(document.mutations[index], index, issues, ids);
    }
  }
  return { valid: issues.length === 0, issues };
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

function canonicalMutation(mutation) {
  if (mutation.kind === "swap_rules") {
    return {
      id: mutation.id,
      kind: mutation.kind,
      listId: mutation.listId,
      firstRuleId: mutation.firstRuleId,
      secondRuleId: mutation.secondRuleId,
    };
  }
  return {
    id: mutation.id,
    kind: mutation.kind,
    listId: mutation.listId,
    ruleId: mutation.ruleId,
    valuePath: [...mutation.valuePath],
    value: mutation.value,
  };
}

function canonicalize(document) {
  const canonical = {
    schemaVersion: 1,
    id: document.id,
    version: document.version,
  };
  if (document.description !== undefined) {
    canonical.description = document.description;
  }
  canonical.targets = {
    rotationId: document.targets.rotationId,
    rotationVersion: document.targets.rotationVersion,
    matrixId: document.targets.matrixId,
    matrixVersion: document.targets.matrixVersion,
  };
  canonical.limits = {
    maxDepth: document.limits.maxDepth,
    beamWidth: document.limits.beamWidth,
    maxCandidates: document.limits.maxCandidates,
    finalists: document.limits.finalists,
  };
  canonical.budgets = {
    screeningIterations: document.budgets.screeningIterations,
    finalistIterations: document.budgets.finalistIterations,
  };
  canonical.mutations = document.mutations
    .map(canonicalMutation)
    .sort((left, right) => left.id.localeCompare(right.id, "en"));
  return deepFreeze(canonical);
}

export function parseOptimizerConfigDocument(document, { source = "<memory>" } = {}) {
  const validation = validateOptimizerConfig(document);
  if (!validation.valid) {
    throw new OptimizerError(
      "OPTIMIZER_CONFIG_VALIDATION_FAILED",
      `Configuração do optimizer inválida: ${validation.issues.length} problema(s).`,
      { source, issues: validation.issues }
    );
  }
  return canonicalize(document);
}

export function parseOptimizerConfigText(text, { source = "<memory>" } = {}) {
  if (typeof text !== "string") {
    throw new OptimizerError("OPTIMIZER_CONFIG_TEXT_REQUIRED", "A configuração deve ser fornecida em JSON.", { source });
  }
  if (Buffer.byteLength(text, "utf8") > MAX_CONFIG_BYTES) {
    throw new OptimizerError("OPTIMIZER_CONFIG_TOO_LARGE", `A configuração excede ${MAX_CONFIG_BYTES} bytes.`, { source });
  }
  try {
    return parseOptimizerConfigDocument(JSON.parse(text), { source });
  } catch (error) {
    if (error instanceof OptimizerError) {
      throw error;
    }
    throw new OptimizerError("OPTIMIZER_CONFIG_JSON_INVALID", "A configuração não contém JSON válido.", {
      source,
      cause: error,
    });
  }
}

export function loadOptimizerConfigFile(file, { root = process.cwd() } = {}) {
  if (typeof file !== "string" || file.trim() === "") {
    throw new OptimizerError("OPTIMIZER_CONFIG_FILE_REQUIRED", "Informe um arquivo .optimizer.json.");
  }
  const projectRoot = fs.realpathSync(path.resolve(root));
  const candidate = path.resolve(projectRoot, file);
  const source = normalizeRelative(path.relative(projectRoot, candidate));
  if (!isInside(projectRoot, candidate)) {
    throw new OptimizerError("OPTIMIZER_CONFIG_OUTSIDE_PROJECT", "A configuração deve permanecer no repositório.", {
      source,
    });
  }
  if (!candidate.toLowerCase().endsWith(".optimizer.json")) {
    throw new OptimizerError("OPTIMIZER_CONFIG_EXTENSION_INVALID", "Use a extensão .optimizer.json.", { source });
  }
  const stat = fs.statSync(candidate, { throwIfNoEntry: false });
  if (!stat?.isFile()) {
    throw new OptimizerError("OPTIMIZER_CONFIG_FILE_MISSING", `Configuração não encontrada: ${source}.`, { source });
  }
  if (stat.size > MAX_CONFIG_BYTES) {
    throw new OptimizerError("OPTIMIZER_CONFIG_TOO_LARGE", `A configuração excede ${MAX_CONFIG_BYTES} bytes.`, { source });
  }
  const realFile = fs.realpathSync(candidate);
  if (!isInside(projectRoot, realFile)) {
    throw new OptimizerError("OPTIMIZER_CONFIG_OUTSIDE_PROJECT", "A configuração resolve para fora do repositório.", {
      source,
    });
  }
  return parseOptimizerConfigText(fs.readFileSync(realFile, "utf8"), { source });
}

export function serializeOptimizerConfig(document) {
  return `${JSON.stringify(parseOptimizerConfigDocument(document), null, 2)}\n`;
}
