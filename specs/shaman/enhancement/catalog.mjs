import fs from "node:fs";
import path from "node:path";
import { EnhancementCatalogError } from "./errors.mjs";

const ROOT_FIELDS = [
  "schemaVersion",
  "id",
  "version",
  "classId",
  "specId",
  "displayName",
  "sources",
  "heroTrees",
  "actions",
  "talents",
  "resources",
  "auras",
];
const SOURCE_FIELDS = [
  "wowVersion",
  "wowBuild",
  "interface",
  "simcVersion",
  "simcEngineCommit",
  "simcHotfixDate",
];
const HERO_TREE_FIELDS = [
  "id",
  "name",
  "subTreeId",
  "selectionEntryId",
  "selectionNodeId",
  "selectionIndex",
];
const ACTION_FIELDS = ["id", "label", "spellId", "kind", "capability", "tags", "availability"];
const TALENT_FIELDS = [
  "id",
  "name",
  "spellId",
  "entryId",
  "nodeId",
  "definitionId",
  "tree",
  "maxRanks",
  "selectionIndex",
  "heroTreeId",
  "replacesSpellId",
];
const RESOURCE_FIELDS = [
  "id",
  "label",
  "kind",
  "capability",
  "powerType",
  "auraId",
  "maxStacks",
];
const AURA_FIELDS = [
  "id",
  "label",
  "spellId",
  "unit",
  "capability",
  "maxStacks",
  "availability",
];
const AVAILABILITY_FIELDS = [
  "requiredTalentSpellIds",
  "anyTalentSpellIds",
  "forbiddenTalentSpellIds",
  "heroTreeId",
];
const ID_PATTERN = /^enhancement\.[a-z][a-z0-9_]*$/u;
const SHA_PATTERN = /^[0-9a-f]{40}$/u;

function issue(pathName, code, message) {
  return { path: pathName, code, message };
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() === value && value.length > 0;
}

function checkFields(value, expected, pathName, issues, optional = []) {
  if (!isRecord(value)) {
    issues.push(issue(pathName, "TYPE", "deve ser um objeto"));
    return false;
  }
  const optionalSet = new Set(optional);
  const expectedSet = new Set(expected);
  for (const key of Object.keys(value)) {
    if (!expectedSet.has(key)) {
      issues.push(issue(`${pathName}.${key}`, "UNKNOWN_FIELD", "campo não declarado"));
    }
  }
  for (const key of expected) {
    if (!optionalSet.has(key) && !(key in value)) {
      issues.push(issue(`${pathName}.${key}`, "MISSING_FIELD", "campo obrigatório ausente"));
    }
  }
  return true;
}

function checkString(value, pathName, issues) {
  if (!isNonEmptyString(value)) {
    issues.push(issue(pathName, "STRING", "deve ser uma string não vazia e sem espaços externos"));
  }
}

function checkId(value, pathName, issues) {
  if (!isNonEmptyString(value) || !ID_PATTERN.test(value)) {
    issues.push(issue(pathName, "ID", "deve usar o formato enhancement.nome_estável"));
  }
}

function checkPositiveInteger(value, pathName, issues) {
  if (!isPositiveInteger(value)) {
    issues.push(issue(pathName, "POSITIVE_INTEGER", "deve ser um inteiro positivo"));
  }
}

function checkSortedUniqueStrings(values, pathName, issues, { id = false } = {}) {
  if (!Array.isArray(values)) {
    issues.push(issue(pathName, "ARRAY", "deve ser uma lista"));
    return;
  }
  const seen = new Set();
  for (let index = 0; index < values.length; index += 1) {
    const entryPath = `${pathName}[${index}]`;
    if (id) {
      checkId(values[index], entryPath, issues);
    } else {
      checkString(values[index], entryPath, issues);
    }
    if (seen.has(values[index])) {
      issues.push(issue(entryPath, "DUPLICATE", "valor duplicado"));
    }
    seen.add(values[index]);
    if (index > 0 && values[index - 1].localeCompare(values[index], "en") >= 0) {
      issues.push(issue(entryPath, "ORDER", "lista deve estar em ordem crescente e sem duplicatas"));
    }
  }
}

function checkSortedUniqueIntegers(values, pathName, issues) {
  if (!Array.isArray(values)) {
    issues.push(issue(pathName, "ARRAY", "deve ser uma lista"));
    return;
  }
  const seen = new Set();
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    checkPositiveInteger(value, `${pathName}[${index}]`, issues);
    if (seen.has(value)) {
      issues.push(issue(`${pathName}[${index}]`, "DUPLICATE", "ID duplicado"));
    }
    seen.add(value);
    if (index > 0 && values[index - 1] >= value) {
      issues.push(issue(`${pathName}[${index}]`, "ORDER", "IDs devem estar em ordem crescente"));
    }
  }
}

function checkAvailability(value, pathName, issues) {
  if (!checkFields(value, AVAILABILITY_FIELDS, pathName, issues, AVAILABILITY_FIELDS)) {
    return;
  }
  for (const field of ["requiredTalentSpellIds", "anyTalentSpellIds", "forbiddenTalentSpellIds"]) {
    if (field in value) {
      checkSortedUniqueIntegers(value[field], `${pathName}.${field}`, issues);
      if (value[field].length === 0) {
        issues.push(issue(`${pathName}.${field}`, "EMPTY", "listas opcionais não podem ser vazias"));
      }
    }
  }
  if ("heroTreeId" in value) {
    checkId(value.heroTreeId, `${pathName}.heroTreeId`, issues);
  }
}

function checkSortedRecords(values, pathName, fields, optional, issues, callback) {
  if (!Array.isArray(values)) {
    issues.push(issue(pathName, "ARRAY", "deve ser uma lista"));
    return;
  }
  const seenIds = new Set();
  for (let index = 0; index < values.length; index += 1) {
    const entry = values[index];
    const entryPath = `${pathName}[${index}]`;
    if (!checkFields(entry, fields, entryPath, issues, optional)) {
      continue;
    }
    checkId(entry.id, `${entryPath}.id`, issues);
    if (seenIds.has(entry.id)) {
      issues.push(issue(`${entryPath}.id`, "DUPLICATE", "identidade duplicada"));
    }
    seenIds.add(entry.id);
    if (index > 0 && values[index - 1]?.id?.localeCompare(entry.id, "en") >= 0) {
      issues.push(issue(`${entryPath}.id`, "ORDER", "registros devem estar ordenados por id"));
    }
    callback(entry, entryPath, issues);
  }
}

function checkUniqueNumberField(values, field, pathName, issues) {
  const seen = new Map();
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]?.[field];
    if (!isPositiveInteger(value)) {
      continue;
    }
    if (seen.has(value)) {
      issues.push(issue(
        `${pathName}[${index}].${field}`,
        "DUPLICATE",
        `${field} ${value} já pertence a ${seen.get(value)}`
      ));
    } else {
      seen.set(value, values[index].id);
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

export function validateEnhancementCatalog(document) {
  const issues = [];
  if (!checkFields(document, ROOT_FIELDS, "catalog", issues)) {
    throw new EnhancementCatalogError("CATALOG_INVALID", "Catálogo Enhancement inválido.", { issues });
  }

  if (document.schemaVersion !== 1) {
    issues.push(issue("catalog.schemaVersion", "SCHEMA_VERSION", "deve ser 1"));
  }
  if (document.id !== "shaman.enhancement") {
    issues.push(issue("catalog.id", "IDENTITY", "deve ser shaman.enhancement"));
  }
  checkString(document.version, "catalog.version", issues);
  if (document.classId !== 7) {
    issues.push(issue("catalog.classId", "CLASS_ID", "deve ser 7"));
  }
  if (document.specId !== 263) {
    issues.push(issue("catalog.specId", "SPEC_ID", "deve ser 263"));
  }
  if (document.displayName !== "Enhancement Shaman") {
    issues.push(issue("catalog.displayName", "DISPLAY_NAME", "deve ser Enhancement Shaman"));
  }

  if (checkFields(document.sources, SOURCE_FIELDS, "catalog.sources", issues)) {
    if (document.sources.wowVersion !== "12.1.0") {
      issues.push(issue("catalog.sources.wowVersion", "WOW_VERSION", "deve ser 12.1.0"));
    }
    if (document.sources.wowBuild !== 69587) {
      issues.push(issue("catalog.sources.wowBuild", "WOW_BUILD", "deve ser 69587"));
    }
    if (document.sources.interface !== 120100) {
      issues.push(issue("catalog.sources.interface", "INTERFACE", "deve ser 120100"));
    }
    if (document.sources.simcVersion !== "1210.01") {
      issues.push(issue("catalog.sources.simcVersion", "SIMC_VERSION", "deve ser 1210.01"));
    }
    if (!SHA_PATTERN.test(document.sources.simcEngineCommit)) {
      issues.push(issue("catalog.sources.simcEngineCommit", "SIMC_COMMIT", "deve ser um commit SHA-1 completo"));
    }
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(document.sources.simcHotfixDate)) {
      issues.push(issue("catalog.sources.simcHotfixDate", "HOTFIX_DATE", "deve usar YYYY-MM-DD"));
    }
  }

  checkSortedRecords(document.heroTrees, "catalog.heroTrees", HERO_TREE_FIELDS, [], issues, (entry, entryPath) => {
    checkString(entry.name, `${entryPath}.name`, issues);
    checkPositiveInteger(entry.subTreeId, `${entryPath}.subTreeId`, issues);
    checkPositiveInteger(entry.selectionEntryId, `${entryPath}.selectionEntryId`, issues);
    checkPositiveInteger(entry.selectionNodeId, `${entryPath}.selectionNodeId`, issues);
    checkPositiveInteger(entry.selectionIndex, `${entryPath}.selectionIndex`, issues);
  });
  checkUniqueNumberField(document.heroTrees ?? [], "subTreeId", "catalog.heroTrees", issues);
  checkUniqueNumberField(document.heroTrees ?? [], "selectionEntryId", "catalog.heroTrees", issues);

  checkSortedRecords(document.talents, "catalog.talents", TALENT_FIELDS, ["heroTreeId", "replacesSpellId"], issues,
    (entry, entryPath) => {
      checkString(entry.name, `${entryPath}.name`, issues);
      for (const field of ["spellId", "entryId", "nodeId", "definitionId", "maxRanks"]) {
        checkPositiveInteger(entry[field], `${entryPath}.${field}`, issues);
      }
      if (!isNonNegativeInteger(entry.selectionIndex)) {
        issues.push(issue(`${entryPath}.selectionIndex`, "SELECTION_INDEX", "deve ser um inteiro não negativo"));
      }
      if (!["class", "spec", "hero"].includes(entry.tree)) {
        issues.push(issue(`${entryPath}.tree`, "TREE", "deve ser class, spec ou hero"));
      }
      if (entry.tree === "hero") {
        checkId(entry.heroTreeId, `${entryPath}.heroTreeId`, issues);
      } else if ("heroTreeId" in entry) {
        issues.push(issue(`${entryPath}.heroTreeId`, "TREE", "somente Hero Talents podem declarar heroTreeId"));
      }
      if ("replacesSpellId" in entry) {
        checkPositiveInteger(entry.replacesSpellId, `${entryPath}.replacesSpellId`, issues);
      }
    });
  checkUniqueNumberField(document.talents ?? [], "entryId", "catalog.talents", issues);
  checkUniqueNumberField(document.talents ?? [], "definitionId", "catalog.talents", issues);
  checkUniqueNumberField(document.talents ?? [], "spellId", "catalog.talents", issues);

  checkSortedRecords(document.actions, "catalog.actions", ACTION_FIELDS, [], issues, (entry, entryPath) => {
    checkString(entry.label, `${entryPath}.label`, issues);
    checkPositiveInteger(entry.spellId, `${entryPath}.spellId`, issues);
    if (entry.kind !== "spell") {
      issues.push(issue(`${entryPath}.kind`, "KIND", "ações deste catálogo devem ser spells"));
    }
    if (entry.capability !== "ADDON_AVAILABLE") {
      issues.push(issue(`${entryPath}.capability`, "CAPABILITY", "deve ser ADDON_AVAILABLE"));
    }
    checkSortedUniqueStrings(entry.tags, `${entryPath}.tags`, issues);
    checkAvailability(entry.availability, `${entryPath}.availability`, issues);
  });
  checkUniqueNumberField(document.actions ?? [], "spellId", "catalog.actions", issues);

  checkSortedRecords(document.resources, "catalog.resources", RESOURCE_FIELDS,
    ["powerType", "auraId", "maxStacks"], issues, (entry, entryPath) => {
      checkString(entry.label, `${entryPath}.label`, issues);
      if (entry.capability !== "ADDON_AVAILABLE") {
        issues.push(issue(`${entryPath}.capability`, "CAPABILITY", "deve ser ADDON_AVAILABLE"));
      }
      if (entry.kind === "power") {
        if (!isNonNegativeInteger(entry.powerType)) {
          issues.push(issue(`${entryPath}.powerType`, "POWER_TYPE", "deve ser um inteiro não negativo"));
        }
        if ("auraId" in entry || "maxStacks" in entry) {
          issues.push(issue(entryPath, "RESOURCE_SHAPE", "power não pode declarar auraId ou maxStacks"));
        }
      } else if (entry.kind === "aura_stacks") {
        checkPositiveInteger(entry.auraId, `${entryPath}.auraId`, issues);
        checkPositiveInteger(entry.maxStacks, `${entryPath}.maxStacks`, issues);
        if ("powerType" in entry) {
          issues.push(issue(entryPath, "RESOURCE_SHAPE", "aura_stacks não pode declarar powerType"));
        }
      } else {
        issues.push(issue(`${entryPath}.kind`, "RESOURCE_KIND", "deve ser power ou aura_stacks"));
      }
    });

  checkSortedRecords(document.auras, "catalog.auras", AURA_FIELDS, ["maxStacks"], issues, (entry, entryPath) => {
    checkString(entry.label, `${entryPath}.label`, issues);
    checkPositiveInteger(entry.spellId, `${entryPath}.spellId`, issues);
    if (!["player", "target"].includes(entry.unit)) {
      issues.push(issue(`${entryPath}.unit`, "UNIT", "deve ser player ou target"));
    }
    if (entry.capability !== "ADDON_AVAILABLE") {
      issues.push(issue(`${entryPath}.capability`, "CAPABILITY", "deve ser ADDON_AVAILABLE"));
    }
    if ("maxStacks" in entry) {
      checkPositiveInteger(entry.maxStacks, `${entryPath}.maxStacks`, issues);
    }
    checkAvailability(entry.availability, `${entryPath}.availability`, issues);
  });
  checkUniqueNumberField(document.auras ?? [], "spellId", "catalog.auras", issues);

  const talentSpellIds = new Set((document.talents ?? []).map((entry) => entry.spellId));
  const heroTreeIds = new Set((document.heroTrees ?? []).map((entry) => entry.id));
  const auraSpellIds = new Set((document.auras ?? []).map((entry) => entry.spellId));
  for (const [collectionName, collection] of [["actions", document.actions ?? []], ["auras", document.auras ?? []]]) {
    for (let index = 0; index < collection.length; index += 1) {
      const availability = collection[index].availability ?? {};
      for (const field of ["requiredTalentSpellIds", "anyTalentSpellIds", "forbiddenTalentSpellIds"]) {
        for (const spellId of availability[field] ?? []) {
          if (!talentSpellIds.has(spellId)) {
            issues.push(issue(
              `catalog.${collectionName}[${index}].availability.${field}`,
              "UNKNOWN_TALENT",
              `talent spell ${spellId} não existe no catálogo`
            ));
          }
        }
      }
      if (availability.heroTreeId && !heroTreeIds.has(availability.heroTreeId)) {
        issues.push(issue(
          `catalog.${collectionName}[${index}].availability.heroTreeId`,
          "UNKNOWN_HERO_TREE",
          `${availability.heroTreeId} não existe no catálogo`
        ));
      }
    }
  }
  for (let index = 0; index < (document.talents ?? []).length; index += 1) {
    const talent = document.talents[index];
    if (talent.heroTreeId && !heroTreeIds.has(talent.heroTreeId)) {
      issues.push(issue(`catalog.talents[${index}].heroTreeId`, "UNKNOWN_HERO_TREE", "Hero Tree não existe"));
    }
  }
  for (let index = 0; index < (document.resources ?? []).length; index += 1) {
    const resource = document.resources[index];
    if (resource.kind === "aura_stacks" && !auraSpellIds.has(resource.auraId)) {
      issues.push(issue(`catalog.resources[${index}].auraId`, "UNKNOWN_AURA", "aura de stacks não existe"));
    }
  }

  if (issues.length > 0) {
    throw new EnhancementCatalogError("CATALOG_INVALID", "Catálogo Enhancement inválido.", { issues });
  }
  return deepFreeze(structuredClone(document));
}

export function parseEnhancementCatalog(text, source = "catalog.json") {
  let document;
  try {
    document = JSON.parse(text);
  } catch (error) {
    throw new EnhancementCatalogError("CATALOG_JSON_INVALID", `${source}: JSON inválido: ${error.message}`);
  }
  return validateEnhancementCatalog(document);
}

export function loadEnhancementCatalog(file, { root = process.cwd() } = {}) {
  const absolute = path.resolve(root, file);
  return parseEnhancementCatalog(fs.readFileSync(absolute, "utf8"), path.relative(root, absolute));
}
