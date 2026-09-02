const MAX_ISSUES = 100;
const MAX_LISTS = 64;
const MAX_RULES_PER_LIST = 10_000;
const MAX_CONDITION_DEPTH = 32;
const MAX_CONDITION_NODES = 512;
const MAX_STATE_PATH_SEGMENTS = 16;
const MAX_TEXT_LENGTH = 4096;

export const CAPABILITY = Object.freeze({
  ADDON_AVAILABLE: "ADDON_AVAILABLE",
  CONDITIONALLY_SECRET: "CONDITIONALLY_SECRET",
  SIM_ONLY: "SIM_ONLY",
});

export const SCHEMA_VERSION = 1;

const CAPABILITY_RANK = Object.freeze({
  [CAPABILITY.ADDON_AVAILABLE]: 0,
  [CAPABILITY.CONDITIONALLY_SECRET]: 1,
  [CAPABILITY.SIM_ONLY]: 2,
});
const ROOT_FIELDS = new Set(["schemaVersion", "id", "version", "description", "entrypoint", "lists"]);
const LIST_FIELDS = new Set(["id", "rules"]);
const RULE_FIELDS = new Set(["id", "priority", "action", "capability", "onUnavailable", "when"]);
const CONDITION_FIELDS = Object.freeze({
  constant: new Set(["kind", "value"]),
  all: new Set(["kind", "conditions"]),
  any: new Set(["kind", "conditions"]),
  not: new Set(["kind", "condition"]),
  compare: new Set(["kind", "operator", "left", "right"]),
  truthy: new Set(["kind", "value"]),
  exists: new Set(["kind", "value"]),
});
const VALUE_FIELDS = Object.freeze({
  literal: new Set(["kind", "value"]),
  state: new Set(["kind", "path", "capability"]),
});
const COMPARISON_OPERATORS = new Set(["eq", "ne", "lt", "lte", "gt", "gte"]);
const NAMESPACED_ID = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/u;
const SIMPLE_ID = /^[a-z][a-z0-9_]*$/u;
const STATE_SEGMENT = /^[a-z][a-z0-9_]*(?:[.-][a-z0-9_]+)*$/u;
const SEMANTIC_VERSION = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value, field) {
  return Object.prototype.hasOwnProperty.call(value, field);
}

function addIssue(issues, code, path, message) {
  if (issues.length < MAX_ISSUES) {
    issues.push({ code, path, message });
  }
}

function validateKnownFields(value, fields, path, issues) {
  for (const field of Object.keys(value)) {
    if (!fields.has(field)) {
      addIssue(issues, "UNKNOWN_FIELD", `${path}.${field}`, `Campo desconhecido: ${field}.`);
    }
  }
}

function validateString(value, path, issues, { maximum = 128, optional = false } = {}) {
  if (optional && value === undefined) {
    return false;
  }
  if (typeof value !== "string" || value.length === 0 || value.length > maximum) {
    addIssue(issues, "INVALID_STRING", path, `Deve ser um texto não vazio de até ${maximum} caracteres.`);
    return false;
  }
  return true;
}

function validateNamespacedId(value, path, issues) {
  if (!validateString(value, path, issues) || !NAMESPACED_ID.test(value)) {
    if (typeof value === "string" && value.length > 0 && value.length <= 128) {
      addIssue(issues, "INVALID_ID", path, "Deve usar identificador namespaced em minúsculas, como neutral.strike.");
    }
    return false;
  }
  return true;
}

function validateSimpleId(value, path, issues) {
  if (!validateString(value, path, issues, { maximum: 64 }) || !SIMPLE_ID.test(value)) {
    if (typeof value === "string" && value.length > 0 && value.length <= 64) {
      addIssue(issues, "INVALID_ID", path, "Deve usar letras minúsculas, números e underscore, começando por letra.");
    }
    return false;
  }
  return true;
}

function validateCapability(value, path, issues) {
  if (!hasOwn(CAPABILITY_RANK, value)) {
    addIssue(
      issues,
      "INVALID_CAPABILITY",
      path,
      "Use ADDON_AVAILABLE, CONDITIONALLY_SECRET ou SIM_ONLY."
    );
    return false;
  }
  return true;
}

function strongestCapability(left, right) {
  return CAPABILITY_RANK[left] >= CAPABILITY_RANK[right] ? left : right;
}

function consumeNode(budget, path, issues) {
  budget.count += 1;
  if (budget.count <= MAX_CONDITION_NODES) {
    return true;
  }
  if (!budget.exhausted) {
    budget.exhausted = true;
    addIssue(
      issues,
      "CONDITION_NODE_LIMIT",
      path,
      `Cada regra aceita no máximo ${MAX_CONDITION_NODES} nós de condição e valor.`
    );
  }
  return false;
}

function validateDepth(depth, path, issues) {
  if (depth <= MAX_CONDITION_DEPTH) {
    return true;
  }
  addIssue(
    issues,
    "CONDITION_DEPTH_LIMIT",
    path,
    `A condição excede a profundidade máxima de ${MAX_CONDITION_DEPTH}.`
  );
  return false;
}

function validateLiteral(value, path, issues) {
  if (value === null || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") {
    if (Number.isFinite(value)) {
      return true;
    }
    addIssue(issues, "INVALID_LITERAL", path, "Números literais devem ser finitos.");
    return false;
  }
  if (typeof value === "string") {
    return validateString(value, path, issues, { maximum: MAX_TEXT_LENGTH });
  }
  addIssue(issues, "INVALID_LITERAL", path, "Literal deve ser null, booleano, número finito ou texto.");
  return false;
}

function validateStatePath(value, path, issues) {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_STATE_PATH_SEGMENTS) {
    addIssue(
      issues,
      "INVALID_STATE_PATH",
      path,
      `O caminho deve ter entre 1 e ${MAX_STATE_PATH_SEGMENTS} segmentos.`
    );
    return false;
  }

  let valid = true;
  for (let index = 0; index < value.length; index += 1) {
    const segment = value[index];
    if (typeof segment !== "string" || segment.length > 80 || !STATE_SEGMENT.test(segment)) {
      addIssue(
        issues,
        "INVALID_STATE_PATH_SEGMENT",
        `${path}[${index}]`,
        "Segmento deve ser um identificador minúsculo e não vazio."
      );
      valid = false;
    }
  }
  return valid;
}

function validateValue(value, path, issues, budget, depth) {
  if (!validateDepth(depth, path, issues) || !consumeNode(budget, path, issues)) {
    return null;
  }
  if (!isRecord(value)) {
    addIssue(issues, "INVALID_VALUE_NODE", path, "Valor deve ser um objeto declarativo.");
    return null;
  }

  const fields = VALUE_FIELDS[value.kind];
  if (!fields) {
    addIssue(issues, "INVALID_VALUE_KIND", `${path}.kind`, "Use literal ou state.");
    validateKnownFields(value, new Set(["kind"]), path, issues);
    return null;
  }
  validateKnownFields(value, fields, path, issues);

  if (value.kind === "literal") {
    if (!hasOwn(value, "value")) {
      addIssue(issues, "MISSING_FIELD", `${path}.value`, "O literal exige value.");
      return null;
    }
    validateLiteral(value.value, `${path}.value`, issues);
    return { capability: CAPABILITY.ADDON_AVAILABLE, kind: "literal" };
  }

  validateStatePath(value.path, `${path}.path`, issues);
  const capabilityValid = validateCapability(value.capability, `${path}.capability`, issues);
  return {
    capability: capabilityValid ? value.capability : null,
    kind: "state",
  };
}

function validateCondition(value, path, issues, budget, depth = 1) {
  if (!validateDepth(depth, path, issues) || !consumeNode(budget, path, issues)) {
    return null;
  }
  if (!isRecord(value)) {
    addIssue(issues, "INVALID_CONDITION_NODE", path, "Condição deve ser um objeto declarativo.");
    return null;
  }

  const fields = CONDITION_FIELDS[value.kind];
  if (!fields) {
    addIssue(
      issues,
      "INVALID_CONDITION_KIND",
      `${path}.kind`,
      "Use constant, all, any, not, compare, truthy ou exists."
    );
    validateKnownFields(value, new Set(["kind"]), path, issues);
    return null;
  }
  validateKnownFields(value, fields, path, issues);

  if (value.kind === "constant") {
    if (typeof value.value !== "boolean") {
      addIssue(issues, "INVALID_CONSTANT", `${path}.value`, "constant exige um valor booleano.");
    }
    return CAPABILITY.ADDON_AVAILABLE;
  }

  if (value.kind === "all" || value.kind === "any") {
    if (!Array.isArray(value.conditions) || value.conditions.length === 0 || value.conditions.length > 64) {
      addIssue(
        issues,
        "INVALID_CONDITION_LIST",
        `${path}.conditions`,
        "all/any exigem entre 1 e 64 condições."
      );
      return null;
    }
    let capability = CAPABILITY.ADDON_AVAILABLE;
    let complete = true;
    for (let index = 0; index < value.conditions.length; index += 1) {
      const childCapability = validateCondition(
        value.conditions[index],
        `${path}.conditions[${index}]`,
        issues,
        budget,
        depth + 1
      );
      if (childCapability === null) {
        complete = false;
      } else {
        capability = strongestCapability(capability, childCapability);
      }
    }
    return complete ? capability : null;
  }

  if (value.kind === "not") {
    return validateCondition(value.condition, `${path}.condition`, issues, budget, depth + 1);
  }

  if (value.kind === "compare") {
    if (!COMPARISON_OPERATORS.has(value.operator)) {
      addIssue(issues, "INVALID_COMPARISON", `${path}.operator`, "Use eq, ne, lt, lte, gt ou gte.");
    }
    const left = validateValue(value.left, `${path}.left`, issues, budget, depth + 1);
    const right = validateValue(value.right, `${path}.right`, issues, budget, depth + 1);
    if (left?.capability === null || right?.capability === null || !left || !right) {
      return null;
    }
    return strongestCapability(left.capability, right.capability);
  }

  const operand = validateValue(value.value, `${path}.value`, issues, budget, depth + 1);
  if (value.kind === "exists" && operand?.kind !== "state") {
    addIssue(issues, "EXISTS_REQUIRES_STATE", `${path}.value`, "exists só pode verificar uma leitura de state.");
  }
  return operand?.capability ?? null;
}

function validateRule(rule, path, issues, globalRuleIds, priorities) {
  if (!isRecord(rule)) {
    addIssue(issues, "INVALID_RULE", path, "Regra deve ser um objeto.");
    return;
  }
  validateKnownFields(rule, RULE_FIELDS, path, issues);

  if (validateNamespacedId(rule.id, `${path}.id`, issues)) {
    if (globalRuleIds.has(rule.id)) {
      addIssue(issues, "DUPLICATE_RULE_ID", `${path}.id`, `Regra duplicada: ${rule.id}.`);
    }
    globalRuleIds.add(rule.id);
  }

  if (!Number.isInteger(rule.priority) || rule.priority < 1 || rule.priority > 1_000_000_000) {
    addIssue(issues, "INVALID_PRIORITY", `${path}.priority`, "Prioridade deve ser um inteiro entre 1 e 1000000000.");
  } else if (priorities.has(rule.priority)) {
    addIssue(issues, "DUPLICATE_PRIORITY", `${path}.priority`, `Prioridade duplicada na lista: ${rule.priority}.`);
  } else {
    priorities.add(rule.priority);
  }

  validateNamespacedId(rule.action, `${path}.action`, issues);
  const capabilityValid = validateCapability(rule.capability, `${path}.capability`, issues);

  if (rule.capability === CAPABILITY.CONDITIONALLY_SECRET) {
    if (rule.onUnavailable !== "skip_rule") {
      addIssue(
        issues,
        "SAFE_FALLBACK_REQUIRED",
        `${path}.onUnavailable`,
        "Regras CONDITIONALLY_SECRET exigem onUnavailable=skip_rule."
      );
    }
  } else if (hasOwn(rule, "onUnavailable")) {
    addIssue(
      issues,
      "UNEXPECTED_FALLBACK",
      `${path}.onUnavailable`,
      "onUnavailable só é permitido em regras CONDITIONALLY_SECRET."
    );
  }

  const derivedCapability = validateCondition(rule.when, `${path}.when`, issues, { count: 0, exhausted: false });
  if (capabilityValid && derivedCapability !== null && rule.capability !== derivedCapability) {
    addIssue(
      issues,
      "CAPABILITY_MISMATCH",
      `${path}.capability`,
      `A condição exige ${derivedCapability}, mas a regra declara ${rule.capability}.`
    );
  }
}

function validateList(list, path, issues, listIds, globalRuleIds) {
  if (!isRecord(list)) {
    addIssue(issues, "INVALID_LIST", path, "Lista deve ser um objeto.");
    return;
  }
  validateKnownFields(list, LIST_FIELDS, path, issues);

  if (validateSimpleId(list.id, `${path}.id`, issues)) {
    if (listIds.has(list.id)) {
      addIssue(issues, "DUPLICATE_LIST_ID", `${path}.id`, `Lista duplicada: ${list.id}.`);
    }
    listIds.add(list.id);
  }

  if (!Array.isArray(list.rules) || list.rules.length === 0 || list.rules.length > MAX_RULES_PER_LIST) {
    addIssue(
      issues,
      "INVALID_RULE_LIST",
      `${path}.rules`,
      `A lista exige entre 1 e ${MAX_RULES_PER_LIST} regras.`
    );
    return;
  }

  const priorities = new Set();
  for (let index = 0; index < list.rules.length; index += 1) {
    validateRule(list.rules[index], `${path}.rules[${index}]`, issues, globalRuleIds, priorities);
  }
}

export function validateRotationDocument(document) {
  const issues = [];
  if (!isRecord(document)) {
    addIssue(issues, "INVALID_DOCUMENT", "$", "O documento da DSL deve ser um objeto JSON.");
    return { valid: false, issues };
  }

  validateKnownFields(document, ROOT_FIELDS, "$", issues);
  if (document.schemaVersion !== SCHEMA_VERSION) {
    addIssue(
      issues,
      "UNSUPPORTED_SCHEMA_VERSION",
      "$.schemaVersion",
      `schemaVersion deve ser ${SCHEMA_VERSION}.`
    );
  }
  validateNamespacedId(document.id, "$.id", issues);
  if (!validateString(document.version, "$.version", issues, { maximum: 64 })
    || !SEMANTIC_VERSION.test(document.version)) {
    if (typeof document.version === "string" && document.version.length > 0 && document.version.length <= 64) {
      addIssue(issues, "INVALID_VERSION", "$.version", "version deve usar SemVer, como 1.0.0.");
    }
  }
  validateString(document.description, "$.description", issues, { maximum: MAX_TEXT_LENGTH, optional: true });
  validateSimpleId(document.entrypoint, "$.entrypoint", issues);

  const listIds = new Set();
  const globalRuleIds = new Set();
  if (!Array.isArray(document.lists) || document.lists.length === 0 || document.lists.length > MAX_LISTS) {
    addIssue(issues, "INVALID_LISTS", "$.lists", `O documento exige entre 1 e ${MAX_LISTS} listas.`);
  } else {
    for (let index = 0; index < document.lists.length; index += 1) {
      validateList(document.lists[index], `$.lists[${index}]`, issues, listIds, globalRuleIds);
    }
  }

  if (typeof document.entrypoint === "string" && !listIds.has(document.entrypoint)) {
    addIssue(
      issues,
      "ENTRYPOINT_NOT_FOUND",
      "$.entrypoint",
      `A lista de entrada ${document.entrypoint} não existe.`
    );
  }

  return { valid: issues.length === 0, issues };
}

function canonicalizeValue(value) {
  if (value.kind === "literal") {
    return { kind: "literal", value: value.value };
  }
  return { kind: "state", path: [...value.path], capability: value.capability };
}

function canonicalizeCondition(condition) {
  if (condition.kind === "constant") {
    return { kind: "constant", value: condition.value };
  }
  if (condition.kind === "all" || condition.kind === "any") {
    return { kind: condition.kind, conditions: condition.conditions.map(canonicalizeCondition) };
  }
  if (condition.kind === "not") {
    return { kind: "not", condition: canonicalizeCondition(condition.condition) };
  }
  if (condition.kind === "compare") {
    return {
      kind: "compare",
      operator: condition.operator,
      left: canonicalizeValue(condition.left),
      right: canonicalizeValue(condition.right),
    };
  }
  return { kind: condition.kind, value: canonicalizeValue(condition.value) };
}

function canonicalizeRule(rule) {
  const canonical = {
    id: rule.id,
    priority: rule.priority,
    action: rule.action,
    capability: rule.capability,
  };
  if (rule.onUnavailable !== undefined) {
    canonical.onUnavailable = rule.onUnavailable;
  }
  canonical.when = canonicalizeCondition(rule.when);
  return canonical;
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

export function canonicalizeRotationDocument(document) {
  const canonical = {
    schemaVersion: document.schemaVersion,
    id: document.id,
    version: document.version,
  };
  if (document.description !== undefined) {
    canonical.description = document.description;
  }
  canonical.entrypoint = document.entrypoint;
  canonical.lists = document.lists
    .map((list) => ({
      id: list.id,
      rules: list.rules.map(canonicalizeRule).sort((left, right) => left.priority - right.priority),
    }))
    .sort((left, right) => left.id.localeCompare(right.id, "en"));
  return deepFreeze(canonical);
}

export function summarizeRotationDocument(document) {
  const capabilities = {
    [CAPABILITY.ADDON_AVAILABLE]: 0,
    [CAPABILITY.CONDITIONALLY_SECRET]: 0,
    [CAPABILITY.SIM_ONLY]: 0,
  };
  let rules = 0;
  for (const list of document.lists) {
    for (const rule of list.rules) {
      rules += 1;
      capabilities[rule.capability] += 1;
    }
  }
  return {
    id: document.id,
    version: document.version,
    lists: document.lists.length,
    rules,
    capabilities,
  };
}

function valueCapability(value) {
  return value.kind === "state" ? value.capability : CAPABILITY.ADDON_AVAILABLE;
}

export function deriveConditionCapability(condition) {
  if (condition.kind === "constant") {
    return CAPABILITY.ADDON_AVAILABLE;
  }
  if (condition.kind === "all" || condition.kind === "any") {
    return condition.conditions
      .map(deriveConditionCapability)
      .reduce(strongestCapability, CAPABILITY.ADDON_AVAILABLE);
  }
  if (condition.kind === "not") {
    return deriveConditionCapability(condition.condition);
  }
  if (condition.kind === "compare") {
    return strongestCapability(valueCapability(condition.left), valueCapability(condition.right));
  }
  return valueCapability(condition.value);
}
