import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { loadScenarioMatrixFile } from "../../../rotation-lab/scenarios/parser.mjs";
import { inspectInstallation, runSimulation } from "../../../rotation-lab/simc/runner.mjs";
import { verifyEnhancementBaseline } from "./baseline.mjs";
import { loadEnhancementCatalog } from "./catalog.mjs";
import { EnhancementStarterBuildError } from "./errors.mjs";
import {
  actionAvailability,
  parseSimcTalentLog,
  simplifyTalentCondition,
} from "./talent-aware.mjs";

export const STARTER_BUILD_DIRECTORY = "specs/shaman/enhancement/starter-build";
export const STARTER_BUILD_STUDY = `${STARTER_BUILD_DIRECTORY}/study.json`;
export const STARTER_BUILD_SNAPSHOTS = `${STARTER_BUILD_DIRECTORY}/snapshots.json`;
export const STARTER_BUILD_MEASUREMENTS = `${STARTER_BUILD_DIRECTORY}/measurements.json`;
export const STARTER_BUILD_REPORT = `${STARTER_BUILD_DIRECTORY}/report.json`;

const TEMP_DIRECTORY = `${STARTER_BUILD_DIRECTORY}/.generated`;
const PHASE_IDS = Object.freeze(["screening", "confirmation"]);
const EXPECTED_CANDIDATE_IDS = Object.freeze([
  "enhancement.starter.stormbringer.official",
  "enhancement.starter.stormbringer.deeply_rooted_elements",
  "enhancement.starter.stormbringer.lightning_conduit",
  "enhancement.starter.stormbringer.supercharge",
  "enhancement.starter.stormbringer.surging_currents",
  "enhancement.starter.totemic.official",
  "enhancement.starter.totemic.swift_recall",
  "enhancement.starter.totemic.pulse_capacitor",
  "enhancement.starter.totemic.oversurge",
  "enhancement.starter.totemic.totemic_coordination",
]);
const EQUIPMENT_PATTERN = /^(head|neck|shoulders?|back|chest|wrists?|hands|waist|legs|feet|finger1|finger2|trinket1|trinket2|main_hand|off_hand)=(.+)$/gmu;

function fail(code, message, details = {}) {
  throw new EnhancementStarterBuildError(code, message, details);
}

function canonical(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex").toUpperCase();
}

function gitBlobSha(value) {
  return crypto.createHash("sha1")
    .update(`blob ${Buffer.byteLength(value, "utf8")}\0`, "utf8")
    .update(value, "utf8")
    .digest("hex");
}

function round(value, decimals = 6) {
  const multiplier = 10 ** decimals;
  const result = Math.round((value + Number.EPSILON) * multiplier) / multiplier;
  return Object.is(result, -0) ? 0 : result;
}

function projectRoot(root) {
  return fs.realpathSync(path.resolve(root));
}

function resolveInside(root, relativeFile) {
  const resolved = path.resolve(root, relativeFile);
  const relative = path.relative(root, resolved);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail("STARTER_PATH_OUTSIDE_PROJECT", `${relativeFile} deve permanecer dentro do repositório.`);
  }
  return resolved;
}

function readText(root, relativeFile) {
  const absolute = resolveInside(root, relativeFile);
  if (!fs.statSync(absolute, { throwIfNoEntry: false })?.isFile()) {
    fail("STARTER_FILE_MISSING", `Arquivo da build de referência ausente: ${relativeFile}.`);
  }
  return fs.readFileSync(absolute, "utf8");
}

function readJson(root, relativeFile) {
  try {
    return JSON.parse(readText(root, relativeFile));
  } catch (error) {
    if (error instanceof EnhancementStarterBuildError) throw error;
    fail("STARTER_JSON_INVALID", `${relativeFile} não contém JSON válido.`, {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

function assertPositiveInteger(value, label, maximum = 10_000_000) {
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    fail("STARTER_STUDY_INVALID", `${label} deve ser inteiro entre 1 e ${maximum}.`);
  }
}

function profileField(sourceText, pattern, label, sourceId) {
  const match = sourceText.match(pattern);
  if (!match) fail("STARTER_PROFILE_INVALID", `${sourceId}: perfil sem ${label}.`);
  return match[1];
}

function validateProfileMetadata(source, sourceText, study) {
  const actual = {
    bytes: Buffer.byteLength(sourceText, "utf8"),
    sha256: sha256(sourceText),
    gitBlobSha: gitBlobSha(sourceText),
    playerName: profileField(sourceText, /^shaman="([^"]+)"$/mu, "nome", source.id),
    talentString: profileField(sourceText, /^talents=(\S+)$/mu, "talent string", source.id),
  };
  const expectedUrl = `${study.simulationCraft.repository}/blob/${study.simulationCraft.engineCommit}/${source.upstreamPath}`;
  if (source.bytes !== actual.bytes
    || source.sha256 !== actual.sha256
    || source.gitBlobSha !== actual.gitBlobSha
    || source.playerName !== actual.playerName
    || source.talentString !== actual.talentString
    || source.sourceUrl !== expectedUrl) {
    fail("STARTER_PROFILE_DRIFT", `${source.id}: perfil oficial diverge dos pins.`, { expected: source, actual });
  }
}

function assertSource(root, source, expectedIdentity = {}) {
  const text = readText(root, source.path);
  if (source.sha256 !== sha256(text)) {
    fail("STARTER_SOURCE_DRIFT", `${source.path} diverge do SHA-256 registrado.`);
  }
  const document = JSON.parse(text);
  for (const [field, expected] of Object.entries(expectedIdentity)) {
    if (document[field] !== expected) {
      fail("STARTER_SOURCE_IDENTITY", `${source.path} não corresponde a ${field}=${expected}.`);
    }
  }
  return { text, document };
}

function candidateProfile(chassisText, candidate) {
  return renderStarterProfile(chassisText, candidate.talentString);
}

export function renderStarterProfile(chassisText, talentString) {
  if (typeof talentString !== "string" || !/^[A-Za-z0-9+/]+$/u.test(talentString)) {
    fail("STARTER_TALENT_STRING_INVALID", "A talent string deve usar o formato de exportação do jogo.");
  }
  const matches = [...chassisText.matchAll(/^talents=(\S+)$/gmu)];
  if (matches.length !== 1) {
    fail("STARTER_PROFILE_INVALID", "O chassi deve conter exatamente uma linha talents=.");
  }
  return chassisText.replace(/^talents=\S+$/mu, `talents=${talentString}`);
}

function candidateProfileRecord(validated, candidate) {
  const profileText = candidateProfile(validated.chassisText, candidate);
  const restored = renderStarterProfile(profileText, validated.study.chassis.talentString);
  if (restored !== validated.chassisText) {
    fail("STARTER_PROFILE_SCOPE", `${candidate.id}: a candidata alterou algo além da linha de talentos.`);
  }
  return { candidate, profileText, profileSha256: sha256(profileText) };
}

function validateCandidates(study, catalog) {
  if (!Array.isArray(study.candidates)
    || JSON.stringify(study.candidates.map((entry) => entry.id)) !== JSON.stringify(EXPECTED_CANDIDATE_IDS)) {
    fail("STARTER_CANDIDATE_SET", "O catálogo curado de candidatas diverge do conjunto revisado.");
  }
  const heroTrees = new Map(catalog.heroTrees.map((entry) => [entry.id, entry]));
  const talents = new Map(catalog.talents.map((entry) => [entry.id, entry]));
  const sources = new Map(study.sourceBuilds.map((entry) => [entry.id, entry]));
  const candidates = new Map(study.candidates.map((entry) => [entry.id, entry]));
  const strings = new Set();
  for (const candidate of study.candidates) {
    const heroTree = heroTrees.get(candidate.heroTreeId);
    const source = sources.get(candidate.sourceBuildId);
    if (!heroTree
      || !source
      || candidate.heroSubTreeId !== heroTree.subTreeId
      || source.heroTreeId !== candidate.heroTreeId
      || source.heroSubTreeId !== candidate.heroSubTreeId
      || strings.has(candidate.talentString)) {
      fail("STARTER_CANDIDATE_INVALID", `${candidate.id}: Hero Tree, fonte ou talent string inválida.`);
    }
    strings.add(candidate.talentString);
    if (candidate.lineage?.kind === "official_profile") {
      if (candidate.talentString !== source.talentString
        || candidate.lineage.sourceBuildId !== source.id
        || candidate.lineage.sourceProfile !== source.profile.path) {
        fail("STARTER_LINEAGE_INVALID", `${candidate.id}: baseline oficial sem linhagem exata.`);
      }
      continue;
    }
    if (candidate.lineage?.kind !== "single_choice_swap") {
      fail("STARTER_LINEAGE_INVALID", `${candidate.id}: tipo de linhagem não permitido.`);
    }
    const parent = candidates.get(candidate.lineage.parentCandidateId);
    const from = talents.get(candidate.lineage.fromTalentId);
    const to = talents.get(candidate.lineage.toTalentId);
    if (!parent
      || parent.lineage.kind !== "official_profile"
      || parent.sourceBuildId !== candidate.sourceBuildId
      || !from
      || !to
      || from.id === to.id
      || from.nodeId !== to.nodeId
      || from.nodeId !== candidate.lineage.nodeId
      || from.tree !== to.tree
      || from.tree !== candidate.lineage.tree
      || from.maxRanks !== to.maxRanks
      || from.maxRanks !== 1
      || (from.tree === "hero" && (from.heroTreeId !== candidate.heroTreeId || to.heroTreeId !== candidate.heroTreeId))) {
      fail("STARTER_LINEAGE_INVALID", `${candidate.id}: troca não preserva um único nó de escolha.`);
    }
  }
}

export function loadStarterBuildStudy({ root = process.cwd() } = {}) {
  return readJson(projectRoot(root), STARTER_BUILD_STUDY);
}

export function validateStarterBuildStudy({ root = process.cwd() } = {}) {
  const resolvedRoot = projectRoot(root);
  const studyText = readText(resolvedRoot, STARTER_BUILD_STUDY);
  const study = JSON.parse(studyText);
  if (study.schemaVersion !== 1
    || study.id !== "enhancement.starter_build"
    || study.version !== "12.1.0-1"
    || study.measuredAt !== "2026-09-03"
    || !Array.isArray(study.sourceBuilds)
    || study.sourceBuilds.length !== 2) {
    fail("STARTER_STUDY_INVALID", "Identidade ou fontes oficiais do estudo inválidas.");
  }

  const pins = readJson(resolvedRoot, "tools/toolchain/pins.json").simulationCraft;
  if (study.simulationCraft.version !== pins.version
    || study.simulationCraft.wowVersion !== pins.wowVersion
    || study.simulationCraft.engineCommit !== pins.engineCommit
    || study.simulationCraft.executableSha256 !== pins.executableSha256
    || study.simulationCraft.repository !== "https://github.com/simulationcraft/simc") {
    fail("STARTER_SIMC_DRIFT", "Os pins do SimulationCraft divergem do estudo.");
  }

  const catalogSource = assertSource(resolvedRoot, study.sources.catalog, {
    id: "shaman.enhancement",
    version: study.version,
  });
  const rotationSource = assertSource(resolvedRoot, study.sources.rotation, {
    id: "enhancement.simc_baseline",
    version: study.version,
  });
  const talentMatrixSource = assertSource(resolvedRoot, study.sources.talentMatrix, {
    id: "enhancement.talent_matrix",
    version: study.version,
  });
  const talentSnapshotsSource = assertSource(resolvedRoot, study.sources.talentSnapshots, {
    id: "enhancement.talent_snapshots",
    version: study.version,
  });
  assertSource(resolvedRoot, study.sources.scenarioMatrix, {
    id: "neutral.initial_matrix",
    version: "1.0.0",
  });
  const optimizerText = readText(resolvedRoot, study.sources.optimizer.path);
  if (sha256(optimizerText) !== study.sources.optimizer.sha256
    || study.sources.optimizer.task !== "LAB-005"
    || study.sources.optimizer.method !== "bounded_two_phase_search_reference") {
    fail("STARTER_OPTIMIZER_DRIFT", "A referência metodológica do optimizer diverge do estudo.");
  }
  const baselineVerification = verifyEnhancementBaseline({ root: resolvedRoot });
  if (baselineVerification.id !== rotationSource.document.id) {
    fail("STARTER_BASELINE_INVALID", "A baseline Enhancement não passou na verificação canônica.");
  }

  const catalog = loadEnhancementCatalog(study.sources.catalog.path, { root: resolvedRoot });
  const scenarioMatrix = loadScenarioMatrixFile(study.sources.scenarioMatrix.path, { root: resolvedRoot });
  const scenario = scenarioMatrix.scenarios.find((entry) => entry.id === study.scenario.id);
  if (!scenario
    || scenario.category !== "single_target"
    || scenario.variant !== "long"
    || scenario.simulation.maxTime !== 300
    || scenario.simulation.desiredTargets !== 1
    || scenario.simulation.fightStyle !== "Patchwerk"
    || scenarioMatrix.defaults.threads !== 1
    || scenarioMatrix.defaults.fixedTime !== true
    || scenarioMatrix.defaults.varyCombatLength !== 0) {
    fail("STARTER_SCENARIO_INVALID", "O estudo deve usar exclusivamente single_target:long em Patchwerk.");
  }
  assertPositiveInteger(study.scenario.seeds.screening, "seed de triagem", 2_147_483_647);
  assertPositiveInteger(study.scenario.seeds.confirmation, "seed de confirmação", 2_147_483_647);
  if (study.scenario.seeds.screening === study.scenario.seeds.confirmation) {
    fail("STARTER_SCENARIO_INVALID", "Triagem e confirmação devem usar seeds independentes.");
  }
  assertPositiveInteger(study.phases.screeningIterations, "iterações de triagem");
  assertPositiveInteger(study.phases.confirmationIterations, "iterações de confirmação");
  assertPositiveInteger(study.phases.damageFinalists, "finalistas por dano", 10);
  if (study.phases.confirmationIterations <= study.phases.screeningIterations
    || study.phases.damageFinalists !== 4
    || study.selection.confidenceZ !== 1.96
    || study.selection.starterTolerancePercent !== 0.5
    || study.selection.complexity.formula !== "single_target_decision_actions + cooldown_weight * active_cooldowns"
    || study.selection.complexity.cooldownWeight !== 2
    || study.selection.damageRanking !== "confirmed_damage_then_official_baseline_without_positive_95ci"
    || study.selection.starterTieBreak !== "complexity_then_damage_then_damage_winner_then_id") {
    fail("STARTER_SELECTION_INVALID", "Budgets ou políticas de decisão divergiram da versão revisada.");
  }

  const chassisText = readText(resolvedRoot, study.chassis.profile.path);
  validateProfileMetadata({ id: "reference_chassis", ...study.chassis.profile }, chassisText, study);
  if (study.chassis.onlyMutableField !== "talents"
    || study.chassis.talentString !== profileField(chassisText, /^talents=(\S+)$/mu, "talent string", "chassi")) {
    fail("STARTER_CHASSIS_INVALID", "O chassi fixo não preserva o contrato talents-only.");
  }
  for (const sourceBuild of study.sourceBuilds) {
    const sourceText = readText(resolvedRoot, sourceBuild.profile.path);
    validateProfileMetadata({ id: sourceBuild.id, ...sourceBuild.profile }, sourceText, study);
    if (sourceBuild.talentString !== sourceBuild.profile.talentString) {
      fail("STARTER_SOURCE_BUILD_INVALID", `${sourceBuild.id}: talent string diverge do perfil oficial.`);
    }
  }
  validateCandidates(study, catalog);

  const candidateProfiles = study.candidates.map((candidate) => candidateProfileRecord(
    { chassisText, study },
    candidate
  ));
  return Object.freeze({
    root: resolvedRoot,
    study: Object.freeze(study),
    studyText,
    studySha256: sha256(studyText),
    pins: Object.freeze({ ...pins }),
    catalog,
    baseline: rotationSource.document,
    talentMatrix: talentMatrixSource.document,
    talentSnapshots: talentSnapshotsSource.document,
    scenarioMatrix,
    scenario,
    chassisText,
    candidateProfiles: Object.freeze(candidateProfiles),
  });
}

function singleTargetComplexity(validated, candidate, activeSpellRanks) {
  const source = validated.study.sourceBuilds.find((entry) => entry.id === candidate.sourceBuildId);
  const list = validated.baseline.lists.find((entry) => entry.id === source.singleTargetList);
  const snapshot = { heroTree: { id: candidate.heroTreeId }, activeSpellRanks };
  const actions = new Map(validated.catalog.actions.map((entry) => [entry.id, entry]));
  const activeTalentIds = new Set(activeSpellRanks.map((entry) => entry.talentId));
  const availableActionIds = validated.catalog.actions
    .filter((action) => actionAvailability(action, snapshot).available)
    .map((action) => action.id)
    .sort();
  const decisionActionIds = [...new Set(list.rules.flatMap((rule) => {
    const action = actions.get(rule.action);
    if (!action || !actionAvailability(action, snapshot).available) return [];
    const condition = simplifyTalentCondition(rule.when, activeTalentIds);
    return condition.known && condition.value === false ? [] : [action.id];
  }))].sort();
  const cooldownActionIds = decisionActionIds.filter((id) => actions.get(id).tags.includes("cooldown"));
  const cooldownWeight = validated.study.selection.complexity.cooldownWeight;
  return {
    formula: validated.study.selection.complexity.formula,
    availableActionCount: availableActionIds.length,
    singleTargetDecisionActionCount: decisionActionIds.length,
    activeCooldownCount: cooldownActionIds.length,
    cooldownWeight,
    score: decisionActionIds.length + cooldownWeight * cooldownActionIds.length,
    decisionActionIds,
    cooldownActionIds,
  };
}

function activeSelection(activeSpellRanks) {
  return activeSpellRanks.map((entry) => ({ talentId: entry.talentId, rank: entry.rank }));
}

function officialSnapshot(validated, sourceBuildId) {
  const source = validated.study.sourceBuilds.find((entry) => entry.id === sourceBuildId);
  return validated.talentSnapshots.builds.find((entry) => entry.id === source.talentAwareBuildId);
}

function lineageValidation(validated, candidate, snapshotById) {
  const current = snapshotById.get(candidate.id);
  if (candidate.lineage.kind === "official_profile") {
    const official = officialSnapshot(validated, candidate.sourceBuildId);
    if (JSON.stringify(activeSelection(current.activeSpellRanks)) !== JSON.stringify(activeSelection(official.activeSpellRanks))) {
      fail("STARTER_OFFICIAL_SNAPSHOT_DRIFT", `${candidate.id}: seleção diverge da baseline oficial pinada.`);
    }
    return {
      kind: "official_profile",
      sourceBuildId: candidate.sourceBuildId,
      matchesPinnedSnapshot: true,
    };
  }
  const parent = snapshotById.get(candidate.lineage.parentCandidateId);
  const parentMap = new Map(parent.activeSpellRanks.map((entry) => [entry.talentId, entry.rank]));
  const currentMap = new Map(current.activeSpellRanks.map((entry) => [entry.talentId, entry.rank]));
  const removed = [...parentMap].filter(([id, rank]) => currentMap.get(id) !== rank).map(([id]) => id).sort();
  const added = [...currentMap].filter(([id, rank]) => parentMap.get(id) !== rank).map(([id]) => id).sort();
  if (JSON.stringify(removed) !== JSON.stringify([candidate.lineage.fromTalentId])
    || JSON.stringify(added) !== JSON.stringify([candidate.lineage.toTalentId])) {
    fail("STARTER_LINEAGE_SNAPSHOT", `${candidate.id}: o SimC observou mudanças além da troca declarada.`, {
      removed,
      added,
    });
  }
  return {
    kind: "single_choice_swap",
    parentCandidateId: candidate.lineage.parentCandidateId,
    nodeId: candidate.lineage.nodeId,
    removedTalentId: removed[0],
    addedTalentId: added[0],
    simcReexportMatched: true,
  };
}

function normalizeRelative(root, absolute) {
  return path.relative(root, absolute).split(path.sep).join("/");
}

function extractionArgs(profilePath, outputPath, study, lineage, savePath) {
  const args = [
    profilePath,
    "iterations=1",
    "threads=1",
    "max_time=1",
    "fixed_time=1",
    "vary_combat_length=0",
    "desired_targets=1",
    "fight_style=Patchwerk",
    "debug=1",
    "log=1",
    `output=${outputPath}`,
  ];
  if (lineage.kind === "single_choice_swap") {
    const talents = new Map(study.catalog.talents.map((entry) => [entry.id, entry]));
    const from = talents.get(lineage.fromTalentId);
    const to = talents.get(lineage.toTalentId);
    args.push(`${lineage.tree}_talents=${from.entryId}:0/${to.entryId}:1`);
    args.push(`save=${savePath}`);
  }
  return args;
}

function runCandidateExtraction(validated, installation, profileFiles, candidate, outputDirectory) {
  const lineage = candidate.lineage;
  const inputCandidateId = lineage.kind === "single_choice_swap" ? lineage.parentCandidateId : candidate.id;
  const input = profileFiles.get(inputCandidateId);
  const outputPath = path.join(outputDirectory, `${candidate.id.replaceAll(".", "-")}.txt`);
  const savedPath = resolveInside(validated.root, `${TEMP_DIRECTORY}/${candidate.id.replaceAll(".", "-")}.reexport.simc`);
  const args = extractionArgs(
    input.absolute,
    outputPath,
    { catalog: validated.catalog },
    lineage,
    normalizeRelative(validated.root, savedPath)
  );
  const result = spawnSync(installation.executablePath, args, {
    cwd: validated.root,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    shell: false,
    timeout: 60_000,
    windowsHide: true,
  });
  if (result.error || result.status !== 0 || !fs.statSync(outputPath, { throwIfNoEntry: false })?.isFile()) {
    fail("STARTER_SIMC_INITIALIZATION", `${candidate.id}: o SimC rejeitou a candidata.`, {
      exitCode: result.status,
      stderr: (result.stderr ?? "").slice(-2000),
    });
  }
  if (lineage.kind === "single_choice_swap") {
    const savedText = fs.readFileSync(savedPath, "utf8");
    const reexported = profileField(savedText, /^talents=(\S+)$/mu, "talent string reexportada", candidate.id);
    if (reexported !== candidate.talentString) {
      fail("STARTER_REEXPORT_DRIFT", `${candidate.id}: o SimC reexportou uma talent string diferente.`, {
        expected: candidate.talentString,
        actual: reexported,
      });
    }
  }
  const log = fs.readFileSync(outputPath, "utf8");
  const heroTree = validated.catalog.heroTrees.find((entry) => entry.id === candidate.heroTreeId);
  const activeTree = new RegExp(`activating sub tree [^\\r\\n]+ \\(id=${candidate.heroSubTreeId}\\)`, "u");
  const selection = new RegExp(`adding selection talent 0 \\(node=\\d+ entry=${heroTree.selectionEntryId} rank=1\\/1\\)`, "u");
  if (!activeTree.test(log) || !selection.test(log)) {
    fail("STARTER_HERO_TREE_MISMATCH", `${candidate.id}: o SimC ativou outra Hero Tree.`);
  }
  const parsed = parseSimcTalentLog(log, validated.catalog, candidate.heroTreeId);
  if (parsed.activeSpellRanks.length === 0) {
    fail("STARTER_SIMC_EMPTY", `${candidate.id}: nenhum talento catalogado foi extraído.`);
  }
  return {
    id: candidate.id,
    profileSha256: inputCandidateId === candidate.id
      ? input.profileSha256
      : profileFiles.get(candidate.id).profileSha256,
    talentString: candidate.talentString,
    heroTree: { id: candidate.heroTreeId, subTreeId: candidate.heroSubTreeId },
    simcInitialized: true,
    activeSpellRanks: parsed.activeSpellRanks,
    ignoredHeroTalents: parsed.ignoredHeroTalents,
  };
}

function prepareProfiles(validated) {
  fs.rmSync(resolveInside(validated.root, TEMP_DIRECTORY), { recursive: true, force: true });
  fs.mkdirSync(resolveInside(validated.root, TEMP_DIRECTORY), { recursive: true });
  const profiles = new Map();
  for (const record of validated.candidateProfiles) {
    const relative = `${TEMP_DIRECTORY}/${record.candidate.id.replaceAll(".", "-")}.simc`;
    const absolute = resolveInside(validated.root, relative);
    fs.writeFileSync(absolute, record.profileText, "utf8");
    profiles.set(record.candidate.id, { ...record, relative, absolute });
  }
  return profiles;
}

async function extractCandidateSnapshots(validated, profileFiles) {
  const installation = await inspectInstallation({ root: validated.root });
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "spynon-starter-build-"));
  try {
    const records = validated.study.candidates.map((candidate) => (
      runCandidateExtraction(validated, installation, profileFiles, candidate, outputDirectory)
    ));
    const snapshotById = new Map(records.map((entry) => [entry.id, entry]));
    const candidates = records.map((record) => {
      const candidate = validated.study.candidates.find((entry) => entry.id === record.id);
      return {
        ...record,
        lineageValidation: lineageValidation(validated, candidate, snapshotById),
        complexity: singleTargetComplexity(validated, candidate, record.activeSpellRanks),
      };
    });
    return {
      schemaVersion: 1,
      id: "enhancement.starter_build_snapshots",
      version: validated.study.version,
      study: { id: validated.study.id, sha256: validated.studySha256 },
      simulationCraft: {
        version: installation.simc.version,
        wowVersion: installation.simc.wowVersion,
        engineCommit: installation.simc.engineCommit,
        executableSha256: installation.actualSha256,
      },
      candidates,
    };
  } finally {
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
}

function validateActiveEntries(validated, candidate, activeSpellRanks) {
  const talents = new Map(validated.catalog.talents.map((entry) => [entry.id, entry]));
  let previousSpellId = 0;
  for (const active of activeSpellRanks) {
    const talent = talents.get(active.talentId);
    if (!talent
      || active.spellId !== talent.spellId
      || active.entryId !== talent.entryId
      || active.nodeId !== talent.nodeId
      || active.tree !== talent.tree
      || active.rank < 1
      || active.rank > talent.maxRanks
      || active.spellId <= previousSpellId
      || (talent.heroTreeId && talent.heroTreeId !== candidate.heroTreeId)) {
      fail("STARTER_SNAPSHOT_ENTRY", `${candidate.id}: talento ativo inválido.`, { active });
    }
    previousSpellId = active.spellId;
  }
}

export function validateStarterBuildSnapshots(validated, snapshots) {
  if (snapshots?.schemaVersion !== 1
    || snapshots.id !== "enhancement.starter_build_snapshots"
    || snapshots.version !== validated.study.version
    || snapshots.study?.id !== validated.study.id
    || snapshots.study?.sha256 !== validated.studySha256
    || snapshots.simulationCraft?.version !== validated.pins.version
    || snapshots.simulationCraft?.wowVersion !== validated.pins.wowVersion
    || snapshots.simulationCraft?.engineCommit !== validated.pins.engineCommit
    || snapshots.simulationCraft?.executableSha256 !== validated.pins.executableSha256
    || JSON.stringify(snapshots.candidates?.map((entry) => entry.id)) !== JSON.stringify(EXPECTED_CANDIDATE_IDS)) {
    fail("STARTER_SNAPSHOTS_INVALID", "Cabeçalho ou catálogo dos snapshots inválido.");
  }
  const snapshotById = new Map(snapshots.candidates.map((entry) => [entry.id, entry]));
  for (const candidate of validated.study.candidates) {
    const snapshot = snapshotById.get(candidate.id);
    const profile = validated.candidateProfiles.find((entry) => entry.candidate.id === candidate.id);
    if (snapshot.profileSha256 !== profile.profileSha256
      || snapshot.talentString !== candidate.talentString
      || snapshot.heroTree.id !== candidate.heroTreeId
      || snapshot.heroTree.subTreeId !== candidate.heroSubTreeId
      || snapshot.simcInitialized !== true
      || !Array.isArray(snapshot.activeSpellRanks)
      || !Array.isArray(snapshot.ignoredHeroTalents)) {
      fail("STARTER_SNAPSHOT_INVALID", `${candidate.id}: snapshot incompleto ou divergente.`);
    }
    validateActiveEntries(validated, candidate, snapshot.activeSpellRanks);
    const expectedLineage = lineageValidation(validated, candidate, snapshotById);
    const expectedComplexity = singleTargetComplexity(validated, candidate, snapshot.activeSpellRanks);
    if (JSON.stringify(snapshot.lineageValidation) !== JSON.stringify(expectedLineage)
      || JSON.stringify(snapshot.complexity) !== JSON.stringify(expectedComplexity)) {
      fail("STARTER_SNAPSHOT_DERIVATION", `${candidate.id}: linhagem ou complexidade divergente.`);
    }
  }
  return snapshots;
}

function rankMetrics(metrics) {
  return [...metrics].sort((left, right) => (
    right.meanDps - left.meanDps || left.id.localeCompare(right.id, "en")
  ));
}

export function selectConfirmationCandidates(validated, snapshots, screeningMetrics) {
  const ranking = rankMetrics(screeningMetrics);
  const selected = new Map();
  function include(id, reason) {
    if (!selected.has(id)) selected.set(id, []);
    selected.get(id).push(reason);
  }
  ranking.slice(0, validated.study.phases.damageFinalists).forEach((entry) => include(entry.id, "top_screening_damage"));
  validated.study.candidates
    .filter((entry) => entry.lineage.kind === "official_profile")
    .forEach((entry) => include(entry.id, "official_baseline"));
  for (const heroTree of validated.catalog.heroTrees) {
    const simplest = snapshots.candidates
      .filter((entry) => entry.heroTree.id === heroTree.id)
      .sort((left, right) => (
        left.complexity.score - right.complexity.score
        || (screeningMetrics.find((entry) => entry.id === right.id)?.meanDps ?? 0)
          - (screeningMetrics.find((entry) => entry.id === left.id)?.meanDps ?? 0)
        || left.id.localeCompare(right.id, "en")
      ))[0];
    include(simplest.id, "simplest_complexity_for_hero_tree");
  }
  return ranking.filter((entry) => selected.has(entry.id)).map((entry) => ({
    id: entry.id,
    reasons: selected.get(entry.id).sort(),
  }));
}

function safeReportName(studyId, phaseId, candidateId) {
  return `starter-${phaseId.slice(0, 3)}-${sha256(`${studyId}:${phaseId}:${candidateId}`).slice(0, 16).toLowerCase()}`;
}

function extractDpsMetric(report, candidate, phaseId, iterations, seed, scenario) {
  const metric = report?.sim?.players?.[0]?.collected_data?.dps;
  if (!metric) fail("STARTER_SIMC_METRIC", `${candidate.candidate.id}: o SimC não retornou DPS.`);
  return {
    id: candidate.candidate.id,
    profileSha256: candidate.profileSha256,
    talentString: candidate.candidate.talentString,
    heroTreeId: candidate.candidate.heroTreeId,
    scenarioId: scenario.id,
    phase: phaseId,
    seed,
    iterationsRequested: iterations,
    sampleCount: metric.count,
    maxTime: scenario.simulation.maxTime,
    fixedTime: true,
    varyCombatLength: 0,
    desiredTargets: scenario.simulation.desiredTargets,
    fightStyle: "Patchwerk",
    meanDps: metric.mean,
    meanStandardError: metric.mean_std_dev,
    standardDeviation: metric.std_dev,
  };
}

async function measurePhase(validated, phaseId, candidates, iterations, seed, transientFiles) {
  const measured = [];
  for (const candidate of candidates) {
    const result = await runSimulation({
      root: validated.root,
      profile: candidate.relative,
      reportName: safeReportName(validated.study.id, phaseId, candidate.candidate.id),
      iterations,
      threads: 1,
      maxTime: validated.scenario.simulation.maxTime,
      fixedTime: true,
      seed,
      varyCombatLength: 0,
      desiredTargets: 1,
      fightStyle: "Patchwerk",
    });
    transientFiles.push(result.manifestPath, result.simcReportPath);
    if (!result.ok) {
      fail("STARTER_SIMC_RUN", result.diagnostic.message, { candidateId: candidate.candidate.id, diagnostic: result.diagnostic });
    }
    const report = JSON.parse(fs.readFileSync(result.simcReportPath, "utf8"));
    measured.push(extractDpsMetric(report, candidate, phaseId, iterations, seed, validated.scenario));
  }
  return { id: phaseId, iterations, seed, candidates: measured };
}

function validateMetric(validated, metric, phase, candidate) {
  const expectedIterations = validated.study.phases[`${phase.id}Iterations`];
  const expectedSeed = validated.study.scenario.seeds[phase.id];
  const expectedProfile = validated.candidateProfiles.find((entry) => entry.candidate.id === candidate.id);
  const relativeError = Math.abs(metric.meanStandardError - metric.standardDeviation / Math.sqrt(metric.sampleCount))
    / metric.meanStandardError;
  if (metric.id !== candidate.id
    || metric.profileSha256 !== expectedProfile.profileSha256
    || metric.talentString !== candidate.talentString
    || metric.heroTreeId !== candidate.heroTreeId
    || metric.scenarioId !== validated.scenario.id
    || metric.phase !== phase.id
    || metric.seed !== expectedSeed
    || metric.iterationsRequested !== expectedIterations
    || metric.sampleCount !== expectedIterations - 1
    || metric.maxTime !== 300
    || metric.fixedTime !== true
    || metric.varyCombatLength !== 0
    || metric.desiredTargets !== 1
    || metric.fightStyle !== "Patchwerk"
    || !Number.isFinite(metric.meanDps)
    || metric.meanDps <= 0
    || !Number.isFinite(metric.meanStandardError)
    || metric.meanStandardError <= 0
    || !Number.isFinite(metric.standardDeviation)
    || metric.standardDeviation <= 0
    || relativeError > 1e-12) {
    fail("STARTER_MEASUREMENT_INVALID", `${candidate.id}: métrica inválida em ${phase.id}.`);
  }
}

export function validateStarterBuildMeasurements(validated, snapshots, measurements) {
  const body = { ...measurements };
  delete body.digest;
  if (measurements?.schemaVersion !== 1
    || measurements.id !== "enhancement.starter_build_measurements"
    || measurements.version !== validated.study.version
    || measurements.study?.id !== validated.study.id
    || measurements.study?.sha256 !== validated.studySha256
    || measurements.snapshotsSha256 !== sha256(canonical(snapshots))
    || measurements.simulationCraft?.version !== validated.pins.version
    || measurements.simulationCraft?.wowVersion !== validated.pins.wowVersion
    || measurements.simulationCraft?.engineCommit !== validated.pins.engineCommit
    || measurements.simulationCraft?.executableSha256 !== validated.pins.executableSha256
    || measurements.digest !== sha256(canonical(body))
    || JSON.stringify(measurements.phases?.map((entry) => entry.id)) !== JSON.stringify(PHASE_IDS)) {
    fail("STARTER_MEASUREMENTS_INVALID", "Cabeçalho ou digest das medições inválido.");
  }
  const candidateMap = new Map(validated.study.candidates.map((entry) => [entry.id, entry]));
  const screening = measurements.phases[0];
  const confirmation = measurements.phases[1];
  if (screening.iterations !== validated.study.phases.screeningIterations
    || screening.seed !== validated.study.scenario.seeds.screening
    || JSON.stringify(screening.candidates.map((entry) => entry.id)) !== JSON.stringify(EXPECTED_CANDIDATE_IDS)) {
    fail("STARTER_SCREENING_INCOMPLETE", "A triagem não contém todas as candidatas na ordem canônica.");
  }
  screening.candidates.forEach((metric) => validateMetric(validated, metric, screening, candidateMap.get(metric.id)));
  const expectedSelection = selectConfirmationCandidates(validated, snapshots, screening.candidates);
  if (JSON.stringify(measurements.confirmationSelection) !== JSON.stringify(expectedSelection)
    || confirmation.iterations !== validated.study.phases.confirmationIterations
    || confirmation.seed !== validated.study.scenario.seeds.confirmation
    || JSON.stringify(confirmation.candidates.map((entry) => entry.id))
      !== JSON.stringify(expectedSelection.map((entry) => entry.id))) {
    fail("STARTER_CONFIRMATION_INCOMPLETE", "A confirmação diverge da seleção reproduzível da triagem.");
  }
  confirmation.candidates.forEach((metric) => validateMetric(validated, metric, confirmation, candidateMap.get(metric.id)));
  return measurements;
}

function metricSummary(metric) {
  return {
    meanDps: round(metric.meanDps),
    meanStandardError: round(metric.meanStandardError),
    standardDeviation: round(metric.standardDeviation),
    sampleCount: metric.sampleCount,
  };
}

function comparison(left, right, confidenceZ) {
  if (left.id === right.id) {
    return {
      referenceCandidateId: right.id,
      dpsDelta: 0,
      deltaPercent: 0,
      confidenceInterval95Dps: { lower: 0, upper: 0 },
      confidenceInterval95Percent: { lower: 0, upper: 0 },
    };
  }
  const delta = left.meanDps - right.meanDps;
  const standardError = Math.sqrt(left.meanStandardError ** 2 + right.meanStandardError ** 2);
  const margin = confidenceZ * standardError;
  return {
    referenceCandidateId: right.id,
    dpsDelta: round(delta),
    deltaPercent: round((delta / right.meanDps) * 100),
    confidenceInterval95Dps: { lower: round(delta - margin), upper: round(delta + margin) },
    confidenceInterval95Percent: {
      lower: round(((delta - margin) / right.meanDps) * 100),
      upper: round(((delta + margin) / right.meanDps) * 100),
    },
  };
}

function equipmentFromProfile(profileText) {
  return [...profileText.matchAll(EQUIPMENT_PATTERN)].map((match) => {
    const itemId = match[2].match(/(?:^|,)id=(\d+)/u);
    if (!itemId) fail("STARTER_EQUIPMENT_INVALID", `${match[1]} não possui id de item.`);
    return { slot: match[1], itemId: Number(itemId[1]), profileValue: match[2] };
  });
}

function reportCandidate(validated, snapshots, screeningMap, confirmationMap, candidate) {
  const snapshot = snapshots.candidates.find((entry) => entry.id === candidate.id);
  return {
    id: candidate.id,
    label: candidate.label,
    heroTree: { id: candidate.heroTreeId, subTreeId: candidate.heroSubTreeId },
    talentString: candidate.talentString,
    lineage: structuredClone(candidate.lineage),
    simcInitialized: snapshot.simcInitialized,
    complexity: structuredClone(snapshot.complexity),
    screening: metricSummary(screeningMap.get(candidate.id)),
    confirmation: confirmationMap.has(candidate.id) ? metricSummary(confirmationMap.get(candidate.id)) : null,
  };
}

export function calculateStarterBuildReport(validated, snapshots, measurements, digests = {}) {
  const screening = measurements.phases.find((entry) => entry.id === "screening");
  const confirmation = measurements.phases.find((entry) => entry.id === "confirmation");
  const screeningRanking = rankMetrics(screening.candidates);
  const confirmationRanking = rankMetrics(confirmation.candidates);
  const screeningMap = new Map(screening.candidates.map((entry) => [entry.id, entry]));
  const confirmationMap = new Map(confirmation.candidates.map((entry) => [entry.id, entry]));
  const candidateMap = new Map(validated.study.candidates.map((entry) => [entry.id, entry]));
  const snapshotMap = new Map(snapshots.candidates.map((entry) => [entry.id, entry]));
  const bestMeasuredMetric = confirmationRanking[0];
  const officialMetrics = confirmation.candidates.filter((metric) => (
    candidateMap.get(metric.id).lineage.kind === "official_profile"
  ));
  const bestOfficialMetric = rankMetrics(officialMetrics)[0];
  const confidenceZ = validated.study.selection.confidenceZ;
  const bestMeasuredComparison = comparison(bestMeasuredMetric, bestOfficialMetric, confidenceZ);
  const damageWinnerMetric = bestMeasuredMetric.id === bestOfficialMetric.id
    || bestMeasuredComparison.confidenceInterval95Dps.lower > 0
    ? bestMeasuredMetric
    : bestOfficialMetric;
  const damageComparison = comparison(damageWinnerMetric, bestOfficialMetric, confidenceZ);
  const tolerance = validated.study.selection.starterTolerancePercent;
  const starterFloor = damageWinnerMetric.meanDps * (1 - tolerance / 100);
  const starterMetric = confirmation.candidates
    .filter((metric) => metric.meanDps >= starterFloor)
    .sort((left, right) => (
      snapshotMap.get(left.id).complexity.score - snapshotMap.get(right.id).complexity.score
      || right.meanDps - left.meanDps
      || (left.id === damageWinnerMetric.id ? -1 : right.id === damageWinnerMetric.id ? 1 : 0)
      || left.id.localeCompare(right.id, "en")
    ))[0];
  const starterComparison = comparison(starterMetric, damageWinnerMetric, confidenceZ);
  const damageCandidate = candidateMap.get(damageWinnerMetric.id);
  const starterCandidate = candidateMap.get(starterMetric.id);
  const sourceBuild = validated.study.sourceBuilds.find((entry) => entry.id === damageCandidate.sourceBuildId);
  const damageConfidence = damageWinnerMetric.id === bestOfficialMetric.id
    ? bestMeasuredMetric.id === bestOfficialMetric.id
      ? "best_official_baseline_remained_damage_winner"
      : "best_official_baseline_preserved_without_statistically_confirmed_gain"
    : damageComparison.confidenceInterval95Dps.lower > 0
      ? "statistically_separated_from_best_official_baseline"
      : "best_measured_not_statistically_separated_from_best_official_baseline";
  const starterReason = starterMetric.id === damageWinnerMetric.id
    ? "damage_winner_is_simplest_candidate_within_tolerance"
    : "lower_complexity_candidate_within_damage_tolerance";

  return {
    schemaVersion: 1,
    id: "enhancement.starter_build_report",
    version: validated.study.version,
    measuredAt: validated.study.measuredAt,
    sourceDigests: {
      studySha256: digests.studySha256 ?? validated.studySha256,
      snapshotsSha256: digests.snapshotsSha256 ?? sha256(canonical(snapshots)),
      measurementsSha256: digests.measurementsSha256 ?? sha256(canonical(measurements)),
    },
    scope: {
      label: "Single Target sustentado — Patchwerk de 300 segundos",
      scenarioId: validated.scenario.id,
      finiteCuratedSearch: true,
      universalOptimumClaimed: false,
      candidateCount: validated.study.candidates.length,
      heroTrees: validated.catalog.heroTrees.map((entry) => entry.name),
      changedProfileField: validated.study.chassis.onlyMutableField,
    },
    simulationCraft: {
      version: validated.pins.version,
      wowVersion: validated.pins.wowVersion,
      engineCommit: validated.pins.engineCommit,
      executableSha256: validated.pins.executableSha256,
      screening: { iterations: screening.iterations, seed: screening.seed },
      confirmation: { iterations: confirmation.iterations, seed: confirmation.seed },
    },
    referenceChassis: {
      profile: validated.study.chassis.profile.path,
      upstreamPath: validated.study.chassis.profile.upstreamPath,
      profileSha256: validated.study.chassis.profile.sha256,
      playerName: validated.study.chassis.profile.playerName,
      equipment: equipmentFromProfile(validated.chassisText),
    },
    confirmationSelection: structuredClone(measurements.confirmationSelection),
    screeningRanking: screeningRanking.map((metric, index) => ({
      rank: index + 1,
      candidateId: metric.id,
      ...metricSummary(metric),
    })),
    confirmationRanking: confirmationRanking.map((metric, index) => ({
      rank: index + 1,
      candidateId: metric.id,
      ...metricSummary(metric),
    })),
    candidates: validated.study.candidates.map((candidate) => (
      reportCandidate(validated, snapshots, screeningMap, confirmationMap, candidate)
    )),
    bestMeasuredCandidate: {
      candidateId: bestMeasuredMetric.id,
      metric: metricSummary(bestMeasuredMetric),
      comparisonToBestOfficialBaseline: bestMeasuredComparison,
    },
    damageWinner: {
      candidateId: damageCandidate.id,
      label: damageCandidate.label,
      heroTree: sourceBuild.name,
      talentString: damageCandidate.talentString,
      metric: metricSummary(damageWinnerMetric),
      comparisonToBestOfficialBaseline: damageComparison,
      confidence: damageConfidence,
      selectionPolicy: validated.study.selection.damageRanking,
      claim: damageWinnerMetric.id === bestMeasuredMetric.id
        ? "highest_confirmed_mean_dps_within_this_finite_curated_catalog"
        : "best_official_baseline_preserved_without_confirmed_candidate_gain",
    },
    starterSuggestion: {
      candidateId: starterCandidate.id,
      label: starterCandidate.label,
      heroTree: validated.study.sourceBuilds.find((entry) => entry.id === starterCandidate.sourceBuildId).name,
      talentString: starterCandidate.talentString,
      metric: metricSummary(starterMetric),
      comparisonToDamageWinner: starterComparison,
      tolerancePercent: tolerance,
      complexity: structuredClone(snapshotMap.get(starterMetric.id).complexity),
      selectionPolicy: validated.study.selection.starterTieBreak,
      reason: starterReason,
    },
    limitations: structuredClone(validated.study.limitations),
  };
}

export async function generateStarterBuildArtifacts({ root = process.cwd() } = {}) {
  const validated = validateStarterBuildStudy({ root });
  const transientFiles = [];
  const profileFiles = prepareProfiles(validated);
  try {
    const snapshots = await extractCandidateSnapshots(validated, profileFiles);
    validateStarterBuildSnapshots(validated, snapshots);
    const screening = await measurePhase(
      validated,
      "screening",
      [...profileFiles.values()],
      validated.study.phases.screeningIterations,
      validated.study.scenario.seeds.screening,
      transientFiles
    );
    const confirmationSelection = selectConfirmationCandidates(validated, snapshots, screening.candidates);
    const confirmationProfiles = confirmationSelection.map((entry) => profileFiles.get(entry.id));
    const confirmation = await measurePhase(
      validated,
      "confirmation",
      confirmationProfiles,
      validated.study.phases.confirmationIterations,
      validated.study.scenario.seeds.confirmation,
      transientFiles
    );
    const measurementBody = {
      schemaVersion: 1,
      id: "enhancement.starter_build_measurements",
      version: validated.study.version,
      study: { id: validated.study.id, sha256: validated.studySha256 },
      snapshotsSha256: sha256(canonical(snapshots)),
      simulationCraft: {
        version: validated.pins.version,
        wowVersion: validated.pins.wowVersion,
        engineCommit: validated.pins.engineCommit,
        executableSha256: validated.pins.executableSha256,
      },
      confirmationSelection,
      phases: [screening, confirmation],
    };
    const measurements = { ...measurementBody, digest: sha256(canonical(measurementBody)) };
    validateStarterBuildMeasurements(validated, snapshots, measurements);
    const snapshotsText = canonical(snapshots);
    const measurementsText = canonical(measurements);
    const report = calculateStarterBuildReport(validated, snapshots, measurements, {
      snapshotsSha256: sha256(snapshotsText),
      measurementsSha256: sha256(measurementsText),
    });
    fs.writeFileSync(resolveInside(validated.root, STARTER_BUILD_SNAPSHOTS), snapshotsText, "utf8");
    fs.writeFileSync(resolveInside(validated.root, STARTER_BUILD_MEASUREMENTS), measurementsText, "utf8");
    fs.writeFileSync(resolveInside(validated.root, STARTER_BUILD_REPORT), canonical(report), "utf8");
    return report;
  } finally {
    for (const file of transientFiles.filter(Boolean)) {
      const resolved = path.resolve(file);
      if (resolved.startsWith(`${validated.root}${path.sep}`)) fs.rmSync(resolved, { force: true });
    }
    fs.rmSync(resolveInside(validated.root, TEMP_DIRECTORY), { recursive: true, force: true });
  }
}

export async function verifyStarterBuildArtifacts({ root = process.cwd() } = {}) {
  const validated = validateStarterBuildStudy({ root });
  const snapshotsText = readText(validated.root, STARTER_BUILD_SNAPSHOTS);
  const measurementsText = readText(validated.root, STARTER_BUILD_MEASUREMENTS);
  const reportText = readText(validated.root, STARTER_BUILD_REPORT);
  const snapshots = validateStarterBuildSnapshots(validated, JSON.parse(snapshotsText));
  const profileFiles = prepareProfiles(validated);
  try {
    const freshSnapshots = await extractCandidateSnapshots(validated, profileFiles);
    if (snapshotsText !== canonical(freshSnapshots)) {
      fail("STARTER_SNAPSHOT_DRIFT", "Os snapshots não coincidem com uma nova inicialização pinada do SimC.");
    }
  } finally {
    fs.rmSync(resolveInside(validated.root, TEMP_DIRECTORY), { recursive: true, force: true });
  }
  const measurements = validateStarterBuildMeasurements(validated, snapshots, JSON.parse(measurementsText));
  const expectedReport = calculateStarterBuildReport(validated, snapshots, measurements, {
    snapshotsSha256: sha256(snapshotsText),
    measurementsSha256: sha256(measurementsText),
  });
  if (reportText !== canonical(expectedReport)) {
    fail("STARTER_REPORT_DRIFT", "O relatório diverge das medições ou das políticas de decisão.");
  }
  return {
    ok: true,
    candidates: snapshots.candidates.length,
    confirmed: measurements.phases[1].candidates.length,
    damageWinner: expectedReport.damageWinner,
    starterSuggestion: expectedReport.starterSuggestion,
  };
}
