import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { inspectInstallation } from "../../../rotation-lab/simc/runner.mjs";
import { verifyEnhancementBaseline } from "./baseline.mjs";
import { loadEnhancementCatalog } from "./catalog.mjs";
import { EnhancementTalentAwareError } from "./errors.mjs";

export const TALENT_AWARE_DIRECTORY = "specs/shaman/enhancement/talent-aware";
export const TALENT_AWARE_STUDY = `${TALENT_AWARE_DIRECTORY}/study.json`;
export const TALENT_SNAPSHOTS = `${TALENT_AWARE_DIRECTORY}/snapshots.json`;
export const TALENT_MATRIX = `${TALENT_AWARE_DIRECTORY}/matrix.json`;

const EXPECTED_BUILD_IDS = ["enhancement.build.stormbringer", "enhancement.build.totemic"];
const EXPECTED_BUILDS = new Map([
  ["enhancement.build.stormbringer", { heroTreeId: "enhancement.stormbringer", heroSubTreeId: 55, singleTargetList: "single_sb" }],
  ["enhancement.build.totemic", { heroTreeId: "enhancement.totemic", heroSubTreeId: 54, singleTargetList: "single_totemic" }],
]);
const EXPECTED_PROBE_IDS = [
  "enhancement.probe.stormbringer_without_tempest",
  "enhancement.probe.totemic_without_surging_totem",
  "enhancement.probe.totemic_without_voltaic_blaze",
];
const CONTEXTS = Object.freeze([
  Object.freeze({ id: "SINGLE_TARGET", listField: "singleTargetList" }),
  Object.freeze({ id: "AOE", listField: "aoeList" }),
]);
const TALENT_LOG_PATTERN = /adding (spec|hero|class) talent (.+?) \(node=(\d+) entry=(\d+) rank=(\d+)\/(\d+)\)/gu;
const TALENT_EFFECT_LOG_PATTERN = /(?:setting|multiplying) talent (.+?) \(spell_id=(\d+), trait_node_entry_id=(\d+)\) rank (\d+)/gu;

function fail(code, message, details = {}) {
  throw new EnhancementTalentAwareError(code, message, details);
}

function projectFile(root, relativeFile) {
  const projectRoot = fs.realpathSync(path.resolve(root));
  const absolute = path.resolve(projectRoot, relativeFile);
  const relative = path.relative(projectRoot, absolute);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail("TALENT_PATH_OUTSIDE_PROJECT", `${relativeFile} deve permanecer dentro do repositório.`);
  }
  if (!fs.statSync(absolute, { throwIfNoEntry: false })?.isFile()) {
    fail("TALENT_FILE_MISSING", `Arquivo talent-aware não encontrado: ${relativeFile}.`);
  }
  return absolute;
}

function readText(root, relativeFile) {
  return fs.readFileSync(projectFile(root, relativeFile), "utf8");
}

function readJson(root, relativeFile) {
  try {
    return JSON.parse(readText(root, relativeFile));
  } catch (error) {
    fail("TALENT_JSON_INVALID", `${relativeFile} não contém JSON válido.`, {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

function canonical(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex").toUpperCase();
}

function gitBlobSha(text) {
  const bytes = Buffer.byteLength(text, "utf8");
  return crypto.createHash("sha1").update(`blob ${bytes}\0`, "utf8").update(text, "utf8").digest("hex");
}

function profileField(sourceText, pattern, label, buildId) {
  const match = sourceText.match(pattern);
  if (!match) {
    fail("TALENT_PROFILE_INVALID", `${buildId}: perfil sem ${label}.`);
  }
  return match[1];
}

function validateProfile(build, sourceText, study) {
  const profile = build.profile;
  const actualBytes = Buffer.byteLength(sourceText, "utf8");
  const actualSha256 = sha256(sourceText);
  const actualGitBlobSha = gitBlobSha(sourceText);
  const actualName = profileField(sourceText, /^shaman="([^"]+)"$/mu, "nome do personagem", build.id);
  const actualTalentString = profileField(sourceText, /^talents=(\S+)$/mu, "talent string", build.id);
  const expectedUrl = `${study.simulationCraft.repository}/blob/${study.simulationCraft.engineCommit}/${profile.upstreamPath}`;
  if (profile.sourceUrl !== expectedUrl
    || profile.playerName !== actualName
    || profile.talentString !== actualTalentString
    || profile.bytes !== actualBytes
    || profile.sha256 !== actualSha256
    || profile.gitBlobSha !== actualGitBlobSha) {
    fail("TALENT_PROFILE_DRIFT", `${build.id}: perfil oficial diverge da proveniência registrada.`, {
      expected: profile,
      actual: { bytes: actualBytes, sha256: actualSha256, gitBlobSha: actualGitBlobSha, actualName, actualTalentString },
    });
  }
}

function assertExactIds(actual, expected, code, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(code, `${label} deve ser ${expected.join(", ")}.`, { actual });
  }
}

function loadInputs(root) {
  const study = readJson(root, TALENT_AWARE_STUDY);
  const catalogText = readText(root, study?.catalog?.path ?? "");
  const baselineText = readText(root, study?.baseline?.path ?? "");
  const catalog = loadEnhancementCatalog(study.catalog.path, { root });
  const baseline = JSON.parse(baselineText);
  const pins = readJson(root, "tools/toolchain/pins.json").simulationCraft;
  const baselineVerification = verifyEnhancementBaseline({ root });

  if (study.schemaVersion !== 1
    || study.id !== "enhancement.talent_matrix"
    || study.version !== "12.1.0-1"
    || study.catalog.id !== catalog.id
    || study.catalog.version !== catalog.version
    || study.catalog.sha256 !== sha256(catalogText)
    || study.baseline.id !== baseline.id
    || study.baseline.version !== baseline.version
    || study.baseline.sha256 !== sha256(baselineText)
    || baselineVerification.id !== baseline.id) {
    fail("TALENT_STUDY_SOURCE_DRIFT", "A matriz talent-aware diverge do catálogo ou da baseline pinados.");
  }
  if (study.simulationCraft.version !== pins.version
    || study.simulationCraft.wowVersion !== pins.wowVersion
    || study.simulationCraft.engineCommit !== pins.engineCommit
    || study.simulationCraft.repository !== "https://github.com/simulationcraft/simc") {
    fail("TALENT_STUDY_SIMC_DRIFT", "Os pins do SimulationCraft divergem do estudo talent-aware.");
  }
  const options = study.simulationCraft.extraction;
  if (JSON.stringify(options) !== JSON.stringify({
    iterations: 1,
    threads: 1,
    maxTime: 1,
    fixedTime: true,
    desiredTargets: 1,
    varyCombatLength: 0,
    fightStyle: "Patchwerk",
    debug: true,
    log: true,
  })) {
    fail("TALENT_STUDY_EXTRACTION_DRIFT", "As opções de extração dos talentos devem permanecer mínimas e determinísticas.");
  }
  if (!Array.isArray(study.builds) || !Array.isArray(study.probes)) {
    fail("TALENT_STUDY_INVALID", "O estudo deve declarar builds e probes.");
  }
  assertExactIds(study.builds.map((entry) => entry.id), EXPECTED_BUILD_IDS, "TALENT_BUILD_SET", "A matriz de builds");
  assertExactIds(study.probes.map((entry) => entry.id), EXPECTED_PROBE_IDS, "TALENT_PROBE_SET", "A matriz de probes");

  const heroTrees = new Map(catalog.heroTrees.map((entry) => [entry.id, entry]));
  const lists = new Set(baseline.lists.map((entry) => entry.id));
  for (const build of study.builds) {
    const expected = EXPECTED_BUILDS.get(build.id);
    const heroTree = heroTrees.get(build.heroTreeId);
    if (!heroTree
      || build.heroSubTreeId !== heroTree.subTreeId
      || build.heroTreeId !== expected.heroTreeId
      || build.heroSubTreeId !== expected.heroSubTreeId
      || build.singleTargetList !== expected.singleTargetList
      || !lists.has(build.singleTargetList)
      || !lists.has(build.aoeList)
      || build.aoeList !== "aoe") {
      fail("TALENT_BUILD_INVALID", `${build.id}: Hero Tree ou listas inválidas.`);
    }
    validateProfile(build, readText(root, build.profile.path), study);
  }
  const buildIds = new Set(EXPECTED_BUILD_IDS);
  for (const probe of study.probes) {
    if (!buildIds.has(probe.fromBuild)
      || !Array.isArray(probe.removeTalentSpellIds)
      || probe.removeTalentSpellIds.length === 0
      || !Array.isArray(probe.expectedAvailableActions)
      || !Array.isArray(probe.expectedUnavailableActions)) {
      fail("TALENT_PROBE_INVALID", `${probe.id}: probe inválido.`);
    }
    const sortedRemovals = [...probe.removeTalentSpellIds].sort((left, right) => left - right);
    if (JSON.stringify(probe.removeTalentSpellIds) !== JSON.stringify(sortedRemovals)
      || new Set(probe.removeTalentSpellIds).size !== probe.removeTalentSpellIds.length) {
      fail("TALENT_PROBE_INVALID", `${probe.id}: talentos removidos devem ser únicos e ordenados.`);
    }
  }
  return { study, catalog, baseline, pins };
}

export function parseSimcTalentLog(text, catalog, heroTreeId) {
  const talentsByEntry = new Map(catalog.talents.map((entry) => [entry.entryId, entry]));
  const observed = new Map();
  for (const match of text.matchAll(TALENT_LOG_PATTERN)) {
    const [, tree, name, nodeText, entryText, rankText, maxRankText] = match;
    const entryId = Number(entryText);
    const talent = talentsByEntry.get(entryId);
    if (!talent) {
      continue;
    }
    const rank = Number(rankText);
    const maxRank = Number(maxRankText);
    if (talent.name !== name || talent.nodeId !== Number(nodeText) || talent.tree !== tree || rank > maxRank) {
      fail("TALENT_LOG_CATALOG_DRIFT", `${talent.id}: a extração do SimC diverge do catálogo.`, {
        name,
        nodeId: Number(nodeText),
        entryId,
        rank,
        maxRank,
      });
    }
    if (rank > 0) {
      observed.set(entryId, { talent, rank });
    }
  }
  for (const match of text.matchAll(TALENT_EFFECT_LOG_PATTERN)) {
    const [, name, spellText, entryText, rankText] = match;
    const entryId = Number(entryText);
    const talent = talentsByEntry.get(entryId);
    if (!talent) {
      continue;
    }
    const spellId = Number(spellText);
    const rank = Number(rankText);
    if (talent.name !== name || talent.spellId !== spellId || rank < 1 || rank > talent.maxRanks) {
      fail("TALENT_LOG_CATALOG_DRIFT", `${talent.id}: o efeito ativo do SimC diverge do catálogo.`, {
        name,
        spellId,
        entryId,
        rank,
      });
    }
    observed.set(entryId, { talent, rank });
  }

  const activeSpellRanks = [];
  const ignoredHeroTalents = [];
  for (const { talent, rank } of observed.values()) {
    if (talent.heroTreeId && talent.heroTreeId !== heroTreeId) {
      ignoredHeroTalents.push({
        talentId: talent.id,
        spellId: talent.spellId,
        entryId: talent.entryId,
        reason: "INACTIVE_HERO_TREE",
      });
      continue;
    }
    activeSpellRanks.push({
      talentId: talent.id,
      spellId: talent.spellId,
      rank,
      entryId: talent.entryId,
      nodeId: talent.nodeId,
      tree: talent.tree,
    });
  }
  activeSpellRanks.sort((left, right) => left.spellId - right.spellId);
  ignoredHeroTalents.sort((left, right) => left.spellId - right.spellId);
  return { activeSpellRanks, ignoredHeroTalents };
}

function extractionArgs(profilePath, outputPath, options) {
  return [
    profilePath,
    `iterations=${options.iterations}`,
    `threads=${options.threads}`,
    `max_time=${options.maxTime}`,
    `fixed_time=${options.fixedTime ? 1 : 0}`,
    `desired_targets=${options.desiredTargets}`,
    `vary_combat_length=${options.varyCombatLength}`,
    `fight_style=${options.fightStyle}`,
    `debug=${options.debug ? 1 : 0}`,
    `log=${options.log ? 1 : 0}`,
    `output=${outputPath}`,
  ];
}

async function extractSnapshots(inputs, root) {
  const installation = await inspectInstallation({ root });
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "spynon-enhancement-talents-"));
  try {
    const builds = [];
    for (const build of inputs.study.builds) {
      const profilePath = projectFile(root, build.profile.path);
      const outputPath = path.join(tempDirectory, `${build.id.replaceAll(".", "-")}.txt`);
      const result = spawnSync(
        installation.executablePath,
        extractionArgs(profilePath, outputPath, inputs.study.simulationCraft.extraction),
        {
          cwd: installation.projectRoot,
          encoding: "utf8",
          maxBuffer: 32 * 1024 * 1024,
          shell: false,
          timeout: 60_000,
          windowsHide: true,
        }
      );
      if (result.error || result.status !== 0 || !fs.statSync(outputPath, { throwIfNoEntry: false })?.isFile()) {
        fail("TALENT_SIMC_EXTRACTION_FAILED", `${build.id}: SimulationCraft não extraiu os talentos.`, {
          exitCode: result.status,
          stderr: (result.stderr ?? "").slice(-2000),
        });
      }
      const log = fs.readFileSync(outputPath, "utf8");
      const activeTree = new RegExp(`activating sub tree [^\\r\\n]+ \\(id=${build.heroSubTreeId}\\)`, "u");
      const selection = new RegExp(`adding selection talent 0 \\(node=\\d+ entry=${inputs.catalog.heroTrees.find((entry) => entry.id === build.heroTreeId).selectionEntryId} rank=1\\/1\\)`, "u");
      if (!activeTree.test(log) || !selection.test(log)) {
        fail("TALENT_SIMC_HERO_TREE_MISMATCH", `${build.id}: o SimC não ativou a Hero Tree esperada.`);
      }
      const parsed = parseSimcTalentLog(log, inputs.catalog, build.heroTreeId);
      if (parsed.activeSpellRanks.length === 0) {
        fail("TALENT_SIMC_EMPTY", `${build.id}: nenhum talento catalogado foi extraído.`);
      }
      builds.push({
        id: build.id,
        profile: {
          path: build.profile.path,
          sha256: build.profile.sha256,
          talentString: build.profile.talentString,
        },
        heroTree: { id: build.heroTreeId, subTreeId: build.heroSubTreeId },
        selectedCatalogTalentCount: parsed.activeSpellRanks.length,
        activeSpellRanks: parsed.activeSpellRanks,
        ignoredHeroTalents: parsed.ignoredHeroTalents,
      });
    }
    return {
      schemaVersion: 1,
      id: "enhancement.talent_snapshots",
      version: inputs.study.version,
      extraction: {
        simulationCraftVersion: installation.simc.version,
        wowVersion: installation.simc.wowVersion,
        engineCommit: installation.simc.engineCommit,
        executableSha256: installation.actualSha256,
        options: inputs.study.simulationCraft.extraction,
      },
      builds,
    };
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
}

function activeTalentMaps(snapshot) {
  return {
    spellRanks: new Map(snapshot.activeSpellRanks.map((entry) => [entry.spellId, entry.rank])),
    talentIds: new Set(snapshot.activeSpellRanks.map((entry) => entry.talentId)),
  };
}

export function actionAvailability(action, snapshot) {
  const { spellRanks } = activeTalentMaps(snapshot);
  const availability = action.availability ?? {};
  const reasons = [];
  const missingRequired = (availability.requiredTalentSpellIds ?? []).filter((spellId) => !spellRanks.has(spellId));
  if (missingRequired.length > 0) {
    reasons.push({ code: "MISSING_REQUIRED_TALENT", spellIds: missingRequired });
  }
  const alternatives = availability.anyTalentSpellIds ?? [];
  if (alternatives.length > 0 && !alternatives.some((spellId) => spellRanks.has(spellId))) {
    reasons.push({ code: "MISSING_ANY_TALENT", spellIds: alternatives });
  }
  const forbidden = (availability.forbiddenTalentSpellIds ?? []).filter((spellId) => spellRanks.has(spellId));
  if (forbidden.length > 0) {
    reasons.push({ code: "FORBIDDEN_TALENT_ACTIVE", spellIds: forbidden });
  }
  if (availability.heroTreeId && availability.heroTreeId !== snapshot.heroTree.id) {
    reasons.push({ code: "HERO_TREE_MISMATCH", expected: availability.heroTreeId, actual: snapshot.heroTree.id });
  }
  return { available: reasons.length === 0, reasons };
}

function literal(value) {
  return { kind: "literal", value };
}

function simplified(node, known = false, value = undefined) {
  return { node, known, value };
}

function simplifyChildren(kind, conditions, activeTalentIds) {
  const children = conditions.map((entry) => simplifyTalentCondition(entry, activeTalentIds));
  if (kind === "all") {
    if (children.some((entry) => entry.known && !entry.value)) {
      return simplified({ kind: "constant", value: false }, true, false);
    }
    const remaining = children.filter((entry) => !(entry.known && entry.value)).map((entry) => entry.node);
    if (remaining.length === 0) return simplified({ kind: "constant", value: true }, true, true);
    if (remaining.length === 1) return simplified(remaining[0]);
    return simplified({ kind, conditions: remaining });
  }
  if (children.some((entry) => entry.known && entry.value)) {
    return simplified({ kind: "constant", value: true }, true, true);
  }
  const remaining = children.filter((entry) => !(entry.known && !entry.value)).map((entry) => entry.node);
  if (remaining.length === 0) return simplified({ kind: "constant", value: false }, true, false);
  if (remaining.length === 1) return simplified(remaining[0]);
  return simplified({ kind, conditions: remaining });
}

export function simplifyTalentCondition(condition, activeTalentIds) {
  if (condition.kind === "constant" || condition.kind === "literal") {
    return simplified(structuredClone(condition), true, condition.value);
  }
  if (condition.kind === "state") {
    if (condition.path?.[0] === "talents" && condition.path?.[2] === "enabled") {
      const value = activeTalentIds.has(condition.path[1]);
      return simplified(literal(value), true, value);
    }
    return simplified(structuredClone(condition));
  }
  if (condition.kind === "truthy") {
    const value = simplifyTalentCondition(condition.value, activeTalentIds);
    if (value.known) {
      const truthy = Boolean(value.value);
      return simplified({ kind: "constant", value: truthy }, true, truthy);
    }
    return simplified({ kind: "truthy", value: value.node });
  }
  if (condition.kind === "not") {
    const child = simplifyTalentCondition(condition.condition, activeTalentIds);
    if (child.known) {
      const value = !child.value;
      return simplified({ kind: "constant", value }, true, value);
    }
    return simplified({ kind: "not", condition: child.node });
  }
  if (condition.kind === "all" || condition.kind === "any") {
    return simplifyChildren(condition.kind, condition.conditions, activeTalentIds);
  }
  if (condition.kind === "compare") {
    const left = simplifyTalentCondition(condition.left, activeTalentIds);
    const right = simplifyTalentCondition(condition.right, activeTalentIds);
    if (left.known && right.known && ["eq", "ne"].includes(condition.operator)) {
      const value = condition.operator === "eq" ? left.value === right.value : left.value !== right.value;
      return simplified({ kind: "constant", value }, true, value);
    }
    return simplified({ ...structuredClone(condition), left: left.node, right: right.node });
  }
  return simplified(structuredClone(condition));
}

function compileContext(build, snapshot, list, catalog) {
  const { talentIds } = activeTalentMaps(snapshot);
  const actions = new Map(catalog.actions.map((entry) => [entry.id, entry]));
  const activeRules = [];
  const excludedRules = [];
  for (const rule of list.rules) {
    const action = actions.get(rule.action);
    if (!action
      || rule.capability === "SIM_ONLY"
      || (rule.capability === "CONDITIONALLY_SECRET" && rule.onUnavailable !== "skip_rule")) {
      fail("TALENT_RULE_UNSAFE", `${rule.id}: regra fora do catálogo ou sem fallback seguro.`);
    }
    const status = actionAvailability(action, snapshot);
    if (!status.available) {
      excludedRules.push({
        id: rule.id,
        action: rule.action,
        reason: "ACTION_UNAVAILABLE",
        details: status.reasons,
      });
      continue;
    }
    const condition = simplifyTalentCondition(rule.when, talentIds);
    if (condition.known && condition.value === false) {
      excludedRules.push({ id: rule.id, action: rule.action, reason: "TALENT_CONDITION_FALSE", details: [] });
      continue;
    }
    activeRules.push({ ...structuredClone(rule), when: condition.node });
  }
  return {
    id: build.contextId,
    sourceList: list.id,
    activeRuleCount: activeRules.length,
    excludedRuleCount: excludedRules.length,
    activeRules,
    excludedRules,
  };
}

function compileBuild(build, snapshot, baseline, catalog, id = build.id) {
  const lists = new Map(baseline.lists.map((entry) => [entry.id, entry]));
  const availableActions = catalog.actions
    .filter((entry) => actionAvailability(entry, snapshot).available)
    .map((entry) => entry.id);
  return {
    id,
    sourceBuild: build.id,
    profileSha256: snapshot.profile.sha256,
    heroTree: structuredClone(snapshot.heroTree),
    activeSpellRanks: structuredClone(snapshot.activeSpellRanks),
    availableActions,
    contexts: CONTEXTS.map((context) => compileContext(
      { contextId: context.id },
      snapshot,
      lists.get(build[context.listField]),
      catalog
    )),
  };
}

function validateProbe(probe, compiled) {
  const available = new Set(compiled.availableActions);
  for (const actionId of probe.expectedAvailableActions) {
    if (!available.has(actionId)) {
      fail("TALENT_PROBE_EXPECTATION", `${probe.id}: ${actionId} deveria estar disponível.`);
    }
  }
  for (const actionId of probe.expectedUnavailableActions) {
    if (available.has(actionId)) {
      fail("TALENT_PROBE_EXPECTATION", `${probe.id}: ${actionId} deveria estar indisponível.`);
    }
    if (compiled.contexts.some((context) => context.activeRules.some((rule) => rule.action === actionId))) {
      fail("TALENT_PROBE_RULE_LEAK", `${probe.id}: regra incompatível de ${actionId} permaneceu ativa.`);
    }
  }
}

export function compileTalentAwareMatrix(study, catalog, baseline, snapshots) {
  const snapshotById = new Map(snapshots.builds.map((entry) => [entry.id, entry]));
  const buildById = new Map(study.builds.map((entry) => [entry.id, entry]));
  const builds = study.builds.map((build) => compileBuild(build, snapshotById.get(build.id), baseline, catalog));
  const probes = study.probes.map((probe) => {
    const build = buildById.get(probe.fromBuild);
    const source = snapshotById.get(probe.fromBuild);
    const removed = new Set(probe.removeTalentSpellIds);
    const activeSpellIds = new Set(source.activeSpellRanks.map((entry) => entry.spellId));
    if (probe.removeTalentSpellIds.some((spellId) => !activeSpellIds.has(spellId))) {
      fail("TALENT_PROBE_SOURCE_MISMATCH", `${probe.id}: o talento removido não está ativo na build-fonte.`);
    }
    const snapshot = {
      ...structuredClone(source),
      activeSpellRanks: source.activeSpellRanks.filter((entry) => !removed.has(entry.spellId)),
    };
    snapshot.selectedCatalogTalentCount = snapshot.activeSpellRanks.length;
    const compiled = compileBuild(build, snapshot, baseline, catalog, probe.id);
    validateProbe(probe, compiled);
    return {
      id: probe.id,
      sourceBuild: build.id,
      profileSha256: compiled.profileSha256,
      heroTree: compiled.heroTree,
      removedTalentSpellIds: [...probe.removeTalentSpellIds],
      availableActions: compiled.availableActions,
      contexts: compiled.contexts.map((context) => ({
        id: context.id,
        sourceList: context.sourceList,
        activeRuleIds: context.activeRules.map((rule) => rule.id),
        excludedRules: context.excludedRules,
      })),
    };
  });
  const body = {
    schemaVersion: 1,
    id: study.id,
    version: study.version,
    sourceDigests: {
      catalogSha256: study.catalog.sha256,
      baselineSha256: study.baseline.sha256,
      snapshotsSha256: sha256(canonical(snapshots)),
    },
    builds,
    probes,
  };
  return { ...body, digest: sha256(canonical(body)) };
}

function validateSnapshots(inputs, snapshots) {
  if (snapshots.schemaVersion !== 1
    || snapshots.id !== "enhancement.talent_snapshots"
    || snapshots.version !== inputs.study.version
    || snapshots.extraction.simulationCraftVersion !== inputs.pins.version
    || snapshots.extraction.wowVersion !== inputs.pins.wowVersion
    || snapshots.extraction.engineCommit !== inputs.pins.engineCommit
    || snapshots.extraction.executableSha256 !== inputs.pins.executableSha256
    || JSON.stringify(snapshots.extraction.options) !== JSON.stringify(inputs.study.simulationCraft.extraction)) {
    fail("TALENT_SNAPSHOT_HEADER", "O cabeçalho dos snapshots diverge dos pins.");
  }
  assertExactIds(snapshots.builds.map((entry) => entry.id), EXPECTED_BUILD_IDS, "TALENT_SNAPSHOT_BUILDS", "Os snapshots");
  const talents = new Map(inputs.catalog.talents.map((entry) => [entry.spellId, entry]));
  for (const snapshot of snapshots.builds) {
    const build = inputs.study.builds.find((entry) => entry.id === snapshot.id);
    if (snapshot.profile.path !== build.profile.path
      || snapshot.profile.sha256 !== build.profile.sha256
      || snapshot.profile.talentString !== build.profile.talentString
      || snapshot.heroTree.id !== build.heroTreeId
      || snapshot.heroTree.subTreeId !== build.heroSubTreeId
      || snapshot.selectedCatalogTalentCount !== snapshot.activeSpellRanks.length) {
      fail("TALENT_SNAPSHOT_BUILD_DRIFT", `${snapshot.id}: snapshot diverge do estudo.`);
    }
    let previousSpellId = 0;
    for (const active of snapshot.activeSpellRanks) {
      const talent = talents.get(active.spellId);
      if (!talent
        || active.talentId !== talent.id
        || active.entryId !== talent.entryId
        || active.nodeId !== talent.nodeId
        || active.tree !== talent.tree
        || active.rank < 1
        || active.rank > talent.maxRanks
        || active.spellId <= previousSpellId
        || (talent.heroTreeId && talent.heroTreeId !== snapshot.heroTree.id)) {
        fail("TALENT_SNAPSHOT_ENTRY", `${snapshot.id}: talento ativo inválido.`, { active });
      }
      previousSpellId = active.spellId;
    }
    if (!Array.isArray(snapshot.ignoredHeroTalents)) {
      fail("TALENT_SNAPSHOT_IGNORED", `${snapshot.id}: inventário de Hero Talents ignorados ausente.`);
    }
    let previousIgnoredSpellId = 0;
    for (const ignored of snapshot.ignoredHeroTalents) {
      const talent = talents.get(ignored.spellId);
      if (!talent
        || ignored.talentId !== talent.id
        || ignored.entryId !== talent.entryId
        || ignored.reason !== "INACTIVE_HERO_TREE"
        || !talent.heroTreeId
        || talent.heroTreeId === snapshot.heroTree.id
        || ignored.spellId <= previousIgnoredSpellId) {
        fail("TALENT_SNAPSHOT_IGNORED", `${snapshot.id}: Hero Talent ignorado inválido.`, { ignored });
      }
      previousIgnoredSpellId = ignored.spellId;
    }
  }
}

function assertArtifact(relativeFile, actualText, expected) {
  const expectedText = canonical(expected);
  if (actualText !== expectedText) {
    fail("TALENT_ARTIFACT_DRIFT", `${relativeFile} diverge da geração determinística.`, {
      expectedSha256: sha256(expectedText),
      actualSha256: sha256(actualText),
    });
  }
}

export async function generateTalentAwareArtifacts({ root = process.cwd() } = {}) {
  const inputs = loadInputs(root);
  const snapshots = await extractSnapshots(inputs, root);
  validateSnapshots(inputs, snapshots);
  const matrix = compileTalentAwareMatrix(inputs.study, inputs.catalog, inputs.baseline, snapshots);
  fs.mkdirSync(path.resolve(root, TALENT_AWARE_DIRECTORY), { recursive: true });
  fs.writeFileSync(path.resolve(root, TALENT_SNAPSHOTS), canonical(snapshots), "utf8");
  fs.writeFileSync(path.resolve(root, TALENT_MATRIX), canonical(matrix), "utf8");
  return {
    builds: matrix.builds.length,
    probes: matrix.probes.length,
    activeRules: matrix.builds.reduce(
      (total, build) => total + build.contexts.reduce((sum, context) => sum + context.activeRuleCount, 0),
      0
    ),
    digest: matrix.digest,
  };
}

export async function verifyTalentAwareArtifacts({ root = process.cwd() } = {}) {
  const inputs = loadInputs(root);
  const snapshotsText = readText(root, TALENT_SNAPSHOTS);
  const snapshots = JSON.parse(snapshotsText);
  validateSnapshots(inputs, snapshots);
  const freshSnapshots = await extractSnapshots(inputs, root);
  assertArtifact(TALENT_SNAPSHOTS, snapshotsText, freshSnapshots);
  const expectedMatrix = compileTalentAwareMatrix(inputs.study, inputs.catalog, inputs.baseline, snapshots);
  const matrixText = readText(root, TALENT_MATRIX);
  assertArtifact(TALENT_MATRIX, matrixText, expectedMatrix);
  return {
    ok: true,
    builds: expectedMatrix.builds.length,
    probes: expectedMatrix.probes.length,
    activeRules: expectedMatrix.builds.reduce(
      (total, build) => total + build.contexts.reduce((sum, context) => sum + context.activeRuleCount, 0),
      0
    ),
    excludedRules: expectedMatrix.builds.reduce(
      (total, build) => total + build.contexts.reduce((sum, context) => sum + context.excludedRuleCount, 0),
      0
    ),
    digest: expectedMatrix.digest,
    snapshotsSha256: sha256(snapshotsText),
  };
}
