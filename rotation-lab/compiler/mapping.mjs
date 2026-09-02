import fs from "node:fs";
import path from "node:path";
import { CAPABILITY } from "../dsl/schema.mjs";
import { CompilerError, compilerError } from "./errors.mjs";

const MAX_MAP_BYTES = 1024 * 1024;
const MAX_ENTRIES = 10_000;
const ROOT_FIELDS = new Set(["schemaVersion", "document", "actions", "states"]);
const DOCUMENT_FIELDS = new Set(["id", "version", "description", "entrypoint", "priorityStep"]);
const ACTION_FIELDS = new Set(["simc", "dsl"]);
const STATE_FIELDS = new Set(["simc", "path", "capability"]);
const CAPABILITIES = new Set(Object.values(CAPABILITY));
const NAMESPACED_ID = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/u;
const SIMPLE_ID = /^[a-z][a-z0-9_]*$/u;
const SIMC_NAME = /^[a-z][a-z0-9_]*$/u;
const SIMC_EXPRESSION = /^[a-z][a-z0-9_.]*$/u;
const STATE_SEGMENT = /^[a-z][a-z0-9_]*(?:[.-][a-z0-9_]+)*$/u;
const SEMANTIC_VERSION = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function addIssue(issues, code, issuePath, message) {
  issues.push({ code, path: issuePath, message });
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
    addIssue(issues, "INVALID_FORMAT", issuePath, "O formato do identificador não é válido.");
    return false;
  }
  return true;
}

function pathKey(value) {
  return JSON.stringify(value);
}

function validateStatePath(value, issuePath, issues) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 16) {
    addIssue(issues, "INVALID_STATE_PATH", issuePath, "O caminho deve ter entre 1 e 16 segmentos.");
    return false;
  }
  let valid = true;
  for (let index = 0; index < value.length; index += 1) {
    if (typeof value[index] !== "string" || value[index].length > 80 || !STATE_SEGMENT.test(value[index])) {
      addIssue(issues, "INVALID_STATE_PATH", `${issuePath}[${index}]`, "Segmento de caminho inválido.");
      valid = false;
    }
  }
  return valid;
}

function validateDocument(value, issues) {
  if (!isRecord(value)) {
    addIssue(issues, "INVALID_DOCUMENT_METADATA", "$.document", "document deve ser um objeto.");
    return;
  }
  knownFields(value, DOCUMENT_FIELDS, "$.document", issues);
  stringField(value.id, "$.document.id", issues, { pattern: NAMESPACED_ID });
  stringField(value.version, "$.document.version", issues, { maximum: 64, pattern: SEMANTIC_VERSION });
  stringField(value.description, "$.document.description", issues, { maximum: 4096, optional: true });
  stringField(value.entrypoint, "$.document.entrypoint", issues, { maximum: 64, pattern: SIMPLE_ID });
  if (!Number.isInteger(value.priorityStep) || value.priorityStep < 1 || value.priorityStep > 1_000_000) {
    addIssue(issues, "INVALID_PRIORITY_STEP", "$.document.priorityStep", "priorityStep deve ser inteiro entre 1 e 1000000.");
  }
}

function validateActions(value, issues) {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_ENTRIES) {
    addIssue(issues, "INVALID_ACTION_MAP", "$.actions", `actions exige entre 1 e ${MAX_ENTRIES} entradas.`);
    return;
  }
  const simcNames = new Set();
  const dslNames = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    const issuePath = `$.actions[${index}]`;
    if (!isRecord(entry)) {
      addIssue(issues, "INVALID_ACTION_ENTRY", issuePath, "Entrada de action deve ser um objeto.");
      continue;
    }
    knownFields(entry, ACTION_FIELDS, issuePath, issues);
    if (stringField(entry.simc, `${issuePath}.simc`, issues, { pattern: SIMC_NAME })) {
      if (simcNames.has(entry.simc)) {
        addIssue(issues, "DUPLICATE_SIMC_ACTION", `${issuePath}.simc`, `Action SimC duplicada: ${entry.simc}.`);
      }
      simcNames.add(entry.simc);
    }
    if (stringField(entry.dsl, `${issuePath}.dsl`, issues, { pattern: NAMESPACED_ID })) {
      if (dslNames.has(entry.dsl)) {
        addIssue(issues, "DUPLICATE_DSL_ACTION", `${issuePath}.dsl`, `Action DSL duplicada: ${entry.dsl}.`);
      }
      dslNames.add(entry.dsl);
    }
  }
}

function validateStates(value, issues) {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_ENTRIES) {
    addIssue(issues, "INVALID_STATE_MAP", "$.states", `states exige entre 1 e ${MAX_ENTRIES} entradas.`);
    return;
  }
  const simcExpressions = new Set();
  const dslPaths = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    const issuePath = `$.states[${index}]`;
    if (!isRecord(entry)) {
      addIssue(issues, "INVALID_STATE_ENTRY", issuePath, "Entrada de state deve ser um objeto.");
      continue;
    }
    knownFields(entry, STATE_FIELDS, issuePath, issues);
    if (stringField(entry.simc, `${issuePath}.simc`, issues, { pattern: SIMC_EXPRESSION })) {
      if (simcExpressions.has(entry.simc)) {
        addIssue(issues, "DUPLICATE_SIMC_STATE", `${issuePath}.simc`, `Expressão SimC duplicada: ${entry.simc}.`);
      }
      simcExpressions.add(entry.simc);
    }
    if (validateStatePath(entry.path, `${issuePath}.path`, issues)) {
      const key = pathKey(entry.path);
      if (dslPaths.has(key)) {
        addIssue(issues, "DUPLICATE_DSL_STATE", `${issuePath}.path`, "Caminho DSL duplicado.");
      }
      dslPaths.add(key);
    }
    if (!CAPABILITIES.has(entry.capability)) {
      addIssue(
        issues,
        "INVALID_CAPABILITY",
        `${issuePath}.capability`,
        "Use ADDON_AVAILABLE, CONDITIONALLY_SECRET ou SIM_ONLY."
      );
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

function canonicalize(value) {
  const document = {
    id: value.document.id,
    version: value.document.version,
  };
  if (value.document.description !== undefined) {
    document.description = value.document.description;
  }
  document.entrypoint = value.document.entrypoint;
  document.priorityStep = value.document.priorityStep;
  return deepFreeze({
    schemaVersion: 1,
    document,
    actions: value.actions
      .map((entry) => ({ simc: entry.simc, dsl: entry.dsl }))
      .sort((left, right) => left.simc < right.simc ? -1 : left.simc > right.simc ? 1 : 0),
    states: value.states
      .map((entry) => ({ simc: entry.simc, path: [...entry.path], capability: entry.capability }))
      .sort((left, right) => left.simc < right.simc ? -1 : left.simc > right.simc ? 1 : 0),
  });
}

export function parseCompilerMapDocument(value, { source = "<memory>" } = {}) {
  const issues = [];
  if (!isRecord(value)) {
    throw new CompilerError("COMPILER_MAP_INVALID", "O mapa do compilador deve ser um objeto JSON.", {
      source,
      issues: [{ code: "INVALID_MAP", path: "$", message: "Objeto esperado." }],
    });
  }
  knownFields(value, ROOT_FIELDS, "$", issues);
  if (value.schemaVersion !== 1) {
    addIssue(issues, "UNSUPPORTED_MAP_VERSION", "$.schemaVersion", "schemaVersion deve ser 1.");
  }
  validateDocument(value.document, issues);
  validateActions(value.actions, issues);
  validateStates(value.states, issues);
  if (issues.length > 0) {
    throw new CompilerError("COMPILER_MAP_INVALID", `Mapa do compilador inválido: ${issues.length} problema(s).`, {
      source,
      issues,
    });
  }
  return canonicalize(value);
}

export function parseCompilerMapText(text, { source = "<memory>" } = {}) {
  if (typeof text !== "string") {
    throw new CompilerError("COMPILER_MAP_TEXT_REQUIRED", "O mapa deve ser fornecido como texto JSON.", { source });
  }
  if (Buffer.byteLength(text, "utf8") > MAX_MAP_BYTES) {
    throw new CompilerError("COMPILER_MAP_TOO_LARGE", `O mapa excede ${MAX_MAP_BYTES} bytes.`, { source });
  }
  try {
    return parseCompilerMapDocument(JSON.parse(text), { source });
  } catch (error) {
    if (error instanceof CompilerError) {
      throw error;
    }
    throw compilerError("COMPILER_MAP_JSON_INVALID", "O mapa não contém JSON válido.", { source }, error);
  }
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

export function loadCompilerMapFile(file, { root = process.cwd() } = {}) {
  const projectRoot = fs.realpathSync(path.resolve(root));
  if (typeof file !== "string" || file.length === 0) {
    throw new CompilerError("COMPILER_MAP_FILE_REQUIRED", "Informe um arquivo .compiler-map.json.");
  }
  const candidate = path.resolve(projectRoot, file);
  if (!isInside(projectRoot, candidate)) {
    throw new CompilerError("COMPILER_MAP_OUTSIDE_PROJECT", "O mapa deve permanecer dentro do repositório.", { file });
  }
  if (!candidate.toLowerCase().endsWith(".compiler-map.json")) {
    throw new CompilerError("COMPILER_MAP_EXTENSION_INVALID", "O mapa deve usar a extensão .compiler-map.json.", { file });
  }
  if (!fs.statSync(candidate, { throwIfNoEntry: false })?.isFile()) {
    throw new CompilerError("COMPILER_MAP_MISSING", `Mapa não encontrado: ${file}.`, { file });
  }
  const realFile = fs.realpathSync(candidate);
  if (!isInside(projectRoot, realFile)) {
    throw new CompilerError("COMPILER_MAP_OUTSIDE_PROJECT", "O mapa resolve por link para fora do repositório.", { file });
  }
  return parseCompilerMapText(fs.readFileSync(realFile, "utf8"), {
    source: path.relative(projectRoot, realFile).replaceAll("\\", "/"),
  });
}

export function indexCompilerMap(mapping) {
  const actionBySimc = new Map();
  const simcByAction = new Map();
  const stateBySimc = new Map();
  const stateByPath = new Map();
  for (const entry of mapping.actions) {
    actionBySimc.set(entry.simc, entry.dsl);
    simcByAction.set(entry.dsl, entry.simc);
  }
  for (const entry of mapping.states) {
    stateBySimc.set(entry.simc, entry);
    stateByPath.set(pathKey(entry.path), entry);
  }
  return { actionBySimc, simcByAction, stateBySimc, stateByPath };
}
