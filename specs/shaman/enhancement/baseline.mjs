import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { buildCompilerFixture, verifyCompilerFixture } from "../../../rotation-lab/compiler/verify.mjs";
import { loadCompilerMapFile } from "../../../rotation-lab/compiler/mapping.mjs";
import { loadEnhancementCatalog } from "./catalog.mjs";
import { EnhancementBaselineError } from "./errors.mjs";
import { CATALOG_FILE } from "./verify.mjs";

export const BASELINE_DIRECTORY = "specs/shaman/enhancement/baseline";
export const BASELINE_FIXTURE = `${BASELINE_DIRECTORY}/enhancement.compiler-fixture.json`;

const SOURCE_FILE = `${BASELINE_DIRECTORY}/upstream.simc`;
const NORMALIZED_FILE = `${BASELINE_DIRECTORY}/normalized.simc`;
const PROVENANCE_FILE = `${BASELINE_DIRECTORY}/provenance.json`;
const AUDIT_FILE = `${BASELINE_DIRECTORY}/audit.json`;
const MAP_FILE = `${BASELINE_DIRECTORY}/enhancement.compiler-map.json`;
const CAPABILITIES = new Set(["ADDON_AVAILABLE", "CONDITIONALLY_SECRET", "SIM_ONLY"]);
const DISPOSITIONS = new Set(["normalized", "source_only"]);
const SOURCE_ONLY_REASONS = new Set([
  "ambiguous_talent_mapping",
  "outside_enhancement_catalog",
  "simulation_damage_model",
  "simulation_future_knowledge",
  "simulation_scheduling",
  "state_not_cataloged",
  "state_not_modeled",
  "unsupported_arithmetic",
  "unsupported_control_action",
  "unsupported_control_flow",
  "unsupported_simc_semantics",
]);
const IMPOSSIBLE_CONDITIONS = [
  { pattern: /fight_remains/u, reason: "simulation_future_knowledge" },
  { pattern: /action\.[a-z0-9_]+\.damage/u, reason: "simulation_damage_model" },
  { pattern: /pre_pot_time=/u, reason: "simulation_scheduling" },
];
const NORMALIZED_ACTION = /^actions(?:\.([a-z][a-z0-9_]*))?\+?=\//u;

function fail(code, message, details = {}) {
  throw new EnhancementBaselineError(code, message, details);
}

function readFile(root, relativeFile) {
  const projectRoot = fs.realpathSync(path.resolve(root));
  const candidate = path.resolve(projectRoot, relativeFile);
  const relative = path.relative(projectRoot, candidate);
  if (relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) {
    fail("BASELINE_PATH_OUTSIDE_PROJECT", `${relativeFile} deve permanecer dentro do repositório.`);
  }
  if (!fs.statSync(candidate, { throwIfNoEntry: false })?.isFile()) {
    fail("BASELINE_FILE_MISSING", `Arquivo da baseline não encontrado: ${relativeFile}.`, { file: relativeFile });
  }
  return fs.readFileSync(candidate, "utf8");
}

function readJson(root, relativeFile) {
  const text = readFile(root, relativeFile);
  try {
    return JSON.parse(text);
  } catch (error) {
    fail("BASELINE_JSON_INVALID", `${relativeFile} não contém JSON válido.`, {
      file: relativeFile,
      cause: error.message,
    });
  }
}

function sha256(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex").toUpperCase();
}

function gitBlobSha(text) {
  const bytes = Buffer.byteLength(text, "utf8");
  return crypto.createHash("sha1")
    .update(`blob ${bytes}\0`, "utf8")
    .update(text, "utf8")
    .digest("hex");
}

export function collectActionLines(sourceText) {
  return sourceText.split("\n").flatMap((line, index) => (
    line.startsWith("actions") ? [{ line: index + 1, source: line }] : []
  ));
}

function verifyProvenance(provenance, sourceText, actionLines, catalog, mapping) {
  if (provenance?.schemaVersion !== 1
    || provenance.localSource?.file !== "upstream.simc"
    || provenance.baseline?.id !== mapping.document.id
    || provenance.baseline?.version !== mapping.document.version
    || provenance.baseline?.entrypoint !== mapping.document.entrypoint) {
    fail("BASELINE_PROVENANCE_INVALID", "A identidade registrada da baseline é inválida ou incompleta.");
  }

  const actualBytes = Buffer.byteLength(sourceText, "utf8");
  const actualSha256 = sha256(sourceText);
  const actualGitBlobSha = gitBlobSha(sourceText);
  if (provenance.localSource.bytes !== actualBytes
    || provenance.localSource.sha256 !== actualSha256
    || provenance.localSource.actionLines !== actionLines.length
    || provenance.simulationcraft?.gitBlobSha !== actualGitBlobSha) {
    fail("BASELINE_SOURCE_INTEGRITY", "A fonte preservada diverge do tamanho, hash ou inventário registrados.", {
      expectedBytes: provenance.localSource.bytes,
      actualBytes,
      expectedSha256: provenance.localSource.sha256,
      actualSha256,
      expectedGitBlobSha: provenance.simulationcraft?.gitBlobSha,
      actualGitBlobSha,
      expectedActionLines: provenance.localSource.actionLines,
      actualActionLines: actionLines.length,
    });
  }

  const source = catalog.sources;
  const target = provenance.target;
  const simc = provenance.simulationcraft;
  const expectedSourceUrl = `${simc?.repository}/blob/${simc?.commit}/${simc?.path}`;
  if (target?.wowVersion !== source.wowVersion
    || target?.wowBuild !== source.wowBuild
    || target?.interface !== source.interface
    || simc?.version !== source.simcVersion
    || simc?.commit !== source.simcEngineCommit
    || simc?.repository !== "https://github.com/simulationcraft/simc"
    || simc?.path !== "ActionPriorityLists/default/shaman_enhancement.simc"
    || simc?.sourceUrl !== expectedSourceUrl
    || !/^[0-9a-f]{40}$/u.test(simc.gitBlobSha ?? "")) {
    fail("BASELINE_SOURCE_VERSION_MISMATCH", "A proveniência da APL diverge dos pins do catálogo Enhancement.");
  }
}

function verifyAudit(audit, sourceText, normalizedText, provenance) {
  const sourceLines = collectActionLines(sourceText);
  if (audit?.schemaVersion !== 1
    || audit.source !== "upstream.simc"
    || audit.normalizedSource !== "normalized.simc"
    || audit.totalActionLines !== sourceLines.length
    || !Array.isArray(audit.decisions)) {
    fail("BASELINE_AUDIT_INVALID", "O cabeçalho da auditoria da APL é inválido.");
  }

  const sourceByLine = new Map(sourceLines.map((entry) => [entry.line, entry.source]));
  const seen = new Set();
  const normalized = [];
  let sourceOnly = 0;
  let simOnly = 0;

  for (const decision of audit.decisions) {
    if (!Number.isInteger(decision?.line) || seen.has(decision.line) || !sourceByLine.has(decision.line)) {
      fail("BASELINE_AUDIT_COVERAGE", "A auditoria contém linha ausente, duplicada ou fora da fonte.", {
        line: decision?.line,
      });
    }
    seen.add(decision.line);
    if (decision.source !== sourceByLine.get(decision.line)
      || !DISPOSITIONS.has(decision.disposition)
      || !CAPABILITIES.has(decision.requiredCapability)) {
      fail("BASELINE_AUDIT_DECISION_INVALID", `Decisão inválida para a linha ${decision.line}.`, {
        line: decision.line,
      });
    }

    const impossible = IMPOSSIBLE_CONDITIONS.find((entry) => entry.pattern.test(decision.source));
    if (impossible && (decision.requiredCapability !== "SIM_ONLY" || decision.reason !== impossible.reason)) {
      fail("BASELINE_SIM_ONLY_REQUIRED", `A linha ${decision.line} depende de conhecimento impossível no addon.`, {
        line: decision.line,
        expectedReason: impossible.reason,
      });
    }

    if (decision.disposition === "normalized") {
      if (typeof decision.normalizedLine !== "string"
        || !NORMALIZED_ACTION.test(decision.normalizedLine)
        || Object.hasOwn(decision, "reason")) {
        fail("BASELINE_NORMALIZED_DECISION_INVALID", `Normalização inválida para a linha ${decision.line}.`);
      }
      normalized.push(decision.normalizedLine);
    } else {
      sourceOnly += 1;
      if (!SOURCE_ONLY_REASONS.has(decision.reason) || Object.hasOwn(decision, "normalizedLine")) {
        fail("BASELINE_SOURCE_ONLY_DECISION_INVALID", `Exclusão inválida para a linha ${decision.line}.`);
      }
    }
    if (decision.requiredCapability === "SIM_ONLY") {
      simOnly += 1;
    }
  }

  if (seen.size !== sourceLines.length) {
    const missing = sourceLines.filter((entry) => !seen.has(entry.line)).map((entry) => entry.line);
    fail("BASELINE_AUDIT_COVERAGE", "Nem toda linha de action recebeu uma decisão de auditoria.", { missing });
  }

  const expectedNormalized = `${normalized.join("\n")}\n`;
  if (normalizedText !== expectedNormalized) {
    fail("BASELINE_NORMALIZED_DIVERGENCE", "A fonte normalizada diverge das decisões registradas na auditoria.");
  }
  if (provenance.baseline.normalizedRules !== normalized.length
    || provenance.baseline.sourceOnlyRules !== sourceOnly) {
    fail("BASELINE_PROVENANCE_COUNTS", "As contagens registradas não correspondem à auditoria.");
  }

  return { normalized: normalized.length, sourceOnly, simOnly };
}

function verifyMapping(mapping, catalog) {
  const actionIds = new Set(catalog.actions.map((entry) => entry.id));
  const auraIds = new Set(catalog.auras.map((entry) => entry.id));
  const resourceIds = new Set(catalog.resources.map((entry) => entry.id));
  const talentIds = new Set(catalog.talents.map((entry) => entry.id));

  for (const action of mapping.actions) {
    if (!actionIds.has(action.dsl)) {
      fail("BASELINE_ACTION_NOT_CATALOGED", `A action ${action.dsl} não existe no catálogo Enhancement.`);
    }
  }

  for (const state of mapping.states) {
    const [group, id] = state.path;
    let valid = false;
    if (group === "auras") {
      valid = auraIds.has(id) && state.capability === "CONDITIONALLY_SECRET";
    } else if (group === "resources") {
      valid = resourceIds.has(id) && state.capability === "CONDITIONALLY_SECRET";
    } else if (group === "cooldowns") {
      valid = actionIds.has(id) && state.capability === "CONDITIONALLY_SECRET";
    } else if (group === "talents") {
      valid = talentIds.has(id) && state.capability === "ADDON_AVAILABLE";
    } else if (group === "combat") {
      valid = JSON.stringify(state.path) === JSON.stringify(["combat", "elapsed_seconds"])
        && state.capability === "ADDON_AVAILABLE";
    }
    if (!valid) {
      fail("BASELINE_STATE_MAPPING_INVALID", `O state ${state.simc} não respeita catálogo ou capability segura.`, {
        state: state.simc,
        path: state.path,
        capability: state.capability,
      });
    }
  }
}

function listIdFromNormalizedLine(line) {
  return NORMALIZED_ACTION.exec(line)?.[1] ?? "default";
}

function verifyCompiledLineage(audit, document, runtime) {
  const sourceIndexes = new Map();
  const rulesByList = new Map(document.lists.map((list) => [list.id, list.rules]));
  for (const decision of audit.decisions.filter((entry) => entry.disposition === "normalized")) {
    const listId = listIdFromNormalizedLine(decision.normalizedLine);
    const index = sourceIndexes.get(listId) ?? 0;
    const rule = rulesByList.get(listId)?.[index];
    if (!rule || rule.capability !== decision.requiredCapability) {
      fail("BASELINE_CAPABILITY_DIVERGENCE", `A capability compilada diverge da auditoria na linha ${decision.line}.`, {
        line: decision.line,
        expected: decision.requiredCapability,
        actual: rule?.capability,
      });
    }
    sourceIndexes.set(listId, index + 1);
  }

  const simOnlyRules = document.lists.reduce(
    (total, list) => total + list.rules.filter((rule) => rule.capability === "SIM_ONLY").length,
    0
  );
  const runtimeRules = runtime.lists.reduce((total, list) => total + list.rules.length, 0);
  const totalRules = document.lists.reduce((total, list) => total + list.rules.length, 0);
  if (runtime.excludedRules.length !== simOnlyRules || runtimeRules !== totalRules - simOnlyRules) {
    fail("BASELINE_RUNTIME_CAPABILITY_LEAK", "O runtime não excluiu exatamente as regras SIM_ONLY da DSL.");
  }
}

export function buildEnhancementBaseline({ root = process.cwd() } = {}) {
  return buildCompilerFixture(BASELINE_FIXTURE, { root });
}

export function generateEnhancementBaseline({ root = process.cwd() } = {}) {
  const built = buildEnhancementBaseline({ root });
  const outputs = {
    [built.fixture.config.expectedDsl]: built.artifacts.dsl,
    [built.fixture.config.expectedSimc]: built.artifacts.simc,
    [built.fixture.config.expectedRuntimeJson]: built.artifacts.runtimeJson,
    [built.fixture.config.expectedRuntimeLua]: built.artifacts.runtimeLua,
  };
  for (const [relativeFile, contents] of Object.entries(outputs)) {
    fs.writeFileSync(path.join(built.fixture.directory, relativeFile), contents, "utf8");
  }
  return {
    files: Object.keys(outputs),
    rules: built.document.lists.reduce((total, list) => total + list.rules.length, 0),
  };
}

export function verifyEnhancementBaseline({ root = process.cwd() } = {}) {
  const sourceText = readFile(root, SOURCE_FILE);
  const normalizedText = readFile(root, NORMALIZED_FILE);
  const provenance = readJson(root, PROVENANCE_FILE);
  const audit = readJson(root, AUDIT_FILE);
  const catalog = loadEnhancementCatalog(CATALOG_FILE, { root });
  const mapping = loadCompilerMapFile(MAP_FILE, { root });
  const sourceLines = collectActionLines(sourceText);

  verifyProvenance(provenance, sourceText, sourceLines, catalog, mapping);
  const auditResult = verifyAudit(audit, sourceText, normalizedText, provenance);
  verifyMapping(mapping, catalog);
  const built = buildEnhancementBaseline({ root });
  verifyCompiledLineage(audit, built.document, built.runtime);
  const fixtureResult = verifyCompilerFixture(BASELINE_FIXTURE, { root });
  const catalogActions = new Set(catalog.actions.map((entry) => entry.id));
  for (const list of built.document.lists) {
    for (const rule of list.rules) {
      if (!catalogActions.has(rule.action)) {
        fail("BASELINE_ACTION_NOT_CATALOGED", `A regra ${rule.id} usa action fora do catálogo: ${rule.action}.`);
      }
    }
  }

  return {
    ok: true,
    id: fixtureResult.id,
    version: fixtureResult.version,
    sourceSha256: provenance.localSource.sha256,
    sourceActionLines: sourceLines.length,
    normalizedRules: auditResult.normalized,
    sourceOnlyRules: auditResult.sourceOnly,
    simOnlySourceLines: auditResult.simOnly,
    lists: fixtureResult.lists,
    runtimeRules: fixtureResult.runtimeRules,
    excludedRules: fixtureResult.excludedRules,
    digest: fixtureResult.digest,
  };
}
