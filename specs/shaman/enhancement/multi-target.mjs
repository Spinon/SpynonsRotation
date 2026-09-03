import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { applyMutation, rotationDigest } from "../../../rotation-lab/optimizer/mutations.mjs";
import { loadRotationFile } from "../../../rotation-lab/dsl/parser.mjs";
import {
  loadScenarioMatrixFile,
  serializeScenarioMatrix,
} from "../../../rotation-lab/scenarios/parser.mjs";
import { EnhancementMultiTargetError } from "./errors.mjs";
import {
  generateCurationArtifacts,
  renderCandidateProfile,
  verifyCurationArtifacts,
} from "./single-target.mjs";

export const MULTI_TARGET_DIRECTORY = "specs/shaman/enhancement/multi-target";
export const MULTI_TARGET_STUDY = `${MULTI_TARGET_DIRECTORY}/study.json`;
export const MULTI_TARGET_CONTEXT = `${MULTI_TARGET_DIRECTORY}/context-policy.json`;
export const MULTI_TARGET_MEASUREMENTS = `${MULTI_TARGET_DIRECTORY}/measurements.json`;
export const MULTI_TARGET_REPORT = `${MULTI_TARGET_DIRECTORY}/report.json`;

const PINS_FILE = "tools/toolchain/pins.json";
const TEMP_DIRECTORY = `${MULTI_TARGET_DIRECTORY}/.generated`;
const EXPECTED_TARGETS = Object.freeze([2, 3, 4, 5, 8]);

function fail(code, message, details = {}) {
  throw new EnhancementMultiTargetError(code, message, details);
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

function resolveRoot(root) {
  return fs.realpathSync(path.resolve(root));
}

function resolveInside(root, relativeFile) {
  const resolved = path.resolve(root, relativeFile);
  const relative = path.relative(root, resolved);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail("MT_PATH_OUTSIDE_PROJECT", `${relativeFile} deve permanecer dentro do repositório.`);
  }
  return resolved;
}

function readText(root, relativeFile) {
  const filePath = resolveInside(root, relativeFile);
  if (!fs.statSync(filePath, { throwIfNoEntry: false })?.isFile()) {
    fail("MT_FILE_MISSING", `Arquivo multi-target não encontrado: ${relativeFile}.`);
  }
  return fs.readFileSync(filePath, "utf8");
}

function readJson(root, relativeFile) {
  try {
    return JSON.parse(readText(root, relativeFile));
  } catch (error) {
    if (error instanceof EnhancementMultiTargetError) {
      throw error;
    }
    fail("MT_JSON_INVALID", `${relativeFile} não contém JSON válido.`);
  }
}

function positiveInteger(value, label, maximum = 10_000_000) {
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    fail("MT_STUDY_INVALID", `${label} deve ser inteiro entre 1 e ${maximum}.`);
  }
}

function verifyContextPolicy(policy) {
  const expectedThresholds = [
    { mode: "SINGLE_TARGET", minimumTargets: 1, maximumTargets: 1 },
    { mode: "CLEAVE", minimumTargets: 2, maximumTargets: 3 },
    { mode: "AOE", minimumTargets: 4, maximumTargets: 40 },
  ];
  if (policy?.schemaVersion !== 1
    || policy.id !== "enhancement.initial_combat_context"
    || policy.version !== "1.0.0"
    || policy.automaticSignal?.id !== "observable_enemy_count"
    || policy.automaticSignal?.requiredCapability !== "ADDON_AVAILABLE"
    || policy.automaticSignal?.onUnavailable !== "manual_override"
    || policy.automaticSignal?.safeDefault !== "SINGLE_TARGET"
    || JSON.stringify(policy.thresholds) !== JSON.stringify(expectedThresholds)
    || JSON.stringify(policy.manualOverrides) !== JSON.stringify(["SINGLE_TARGET", "CLEAVE", "AOE"])
    || policy.runtimeImplementation !== "deferred_to_RUN_003") {
    fail("MT_CONTEXT_POLICY_INVALID", "A política de thresholds ou override multi-target é inválida.");
  }
}

function verifyRuntimeCapabilities(document, listId, candidateId) {
  const list = document.lists.find((entry) => entry.id === listId);
  if (!list) {
    fail("MT_LIST_MISSING", `Lista ${listId} ausente na candidata ${candidateId}.`);
  }
  for (const rule of list.rules) {
    if (rule.capability === "SIM_ONLY") {
      fail("MT_SIM_ONLY_RULE", `A candidata ${candidateId} contém regra SIM_ONLY: ${rule.id}.`);
    }
    if (rule.capability === "CONDITIONALLY_SECRET" && rule.onUnavailable !== "skip_rule") {
      fail("MT_SECRET_FALLBACK_INVALID", `A regra ${rule.id} não preserva fallback skip_rule.`);
    }
  }
}

export function validateMultiTargetStudy({ root = process.cwd() } = {}) {
  const resolvedRoot = resolveRoot(root);
  const studyText = readText(resolvedRoot, MULTI_TARGET_STUDY);
  const study = JSON.parse(studyText);
  const profileText = readText(resolvedRoot, study.profile?.file);
  const contextText = readText(resolvedRoot, study.contextPolicy?.file);
  const contextPolicy = JSON.parse(contextText);
  const pins = readJson(resolvedRoot, PINS_FILE).simulationCraft;
  const baseline = loadRotationFile(study.baseline?.rotationFile, { root: resolvedRoot });
  const matrix = loadScenarioMatrixFile(study.matrix?.file, { root: resolvedRoot });

  if (study.schemaVersion !== 1
    || study.id !== "enhancement.multi_target_curation"
    || study.version !== "12.1.0-1"
    || study.baseline?.id !== "enhancement.mt.baseline"
    || study.baseline?.listId !== "aoe") {
    fail("MT_STUDY_INVALID", "A identidade ou a baseline do estudo multi-target é inválida.");
  }
  if (study.profile.bytes !== Buffer.byteLength(profileText, "utf8")
    || study.profile.sha256 !== sha256(profileText)
    || study.profile.gitBlobSha !== gitBlobSha(profileText)) {
    fail("MT_PROFILE_DRIFT", "O perfil upstream multi-target diverge dos hashes registrados.");
  }
  if (study.profile.simulationCraftVersion !== pins.version
    || study.profile.engineCommit !== pins.engineCommit
    || study.profile.repository !== "https://github.com/simulationcraft/simc"
    || study.profile.path !== "profiles/MID2/MID2_Shaman_Enhancement_Totemic.simc"
    || study.profile.build !== "Totemic") {
    fail("MT_PROFILE_PROVENANCE_INVALID", "A proveniência multi-target diverge dos pins do projeto.");
  }
  if (study.baseline.rotationSha256 !== rotationDigest(baseline)) {
    fail("MT_BASELINE_DRIFT", "A Rotation DSL baseline diverge do digest registrado.");
  }
  if (study.matrix.id !== matrix.id
    || study.matrix.version !== matrix.version
    || study.matrix.sha256 !== sha256(serializeScenarioMatrix(matrix))) {
    fail("MT_MATRIX_DRIFT", "A matriz canônica diverge da identidade registrada.");
  }
  verifyContextPolicy(contextPolicy);
  if (study.contextPolicy.id !== contextPolicy.id
    || study.contextPolicy.version !== contextPolicy.version
    || study.contextPolicy.sha256 !== sha256(contextText)) {
    fail("MT_CONTEXT_POLICY_DRIFT", "A política de contexto diverge do hash registrado.");
  }

  positiveInteger(study.phases?.screeningIterations, "screeningIterations");
  positiveInteger(study.phases?.finalistIterations, "finalistIterations");
  positiveInteger(study.phases?.finalistCount, "finalistCount", 10);
  if (study.phases.finalistIterations <= study.phases.screeningIterations
    || typeof study.selection?.confidenceZ !== "number"
    || !Number.isFinite(study.selection.confidenceZ)
    || study.selection.confidenceZ <= 0
    || study.selection.confidencePolicy !== "95_percent_family_wise_bonferroni_for_two_finalists"
    || study.selection.requirePositiveLowerBound !== true) {
    fail("MT_STUDY_INVALID", "As fases ou a política de seleção multi-target são inválidas.");
  }

  const matrixById = new Map(matrix.scenarios.map((scenario) => [scenario.id, scenario]));
  if (!Array.isArray(study.scenarios) || study.scenarios.length !== EXPECTED_TARGETS.length) {
    fail("MT_SCENARIO_SET_INVALID", "O estudo deve conter exatamente os cinco cenários Cleave/AoE.");
  }
  const scenarios = study.scenarios.map((selection, index) => {
    const scenario = matrixById.get(selection.id);
    positiveInteger(selection.seeds?.screening, `seed de triagem de ${selection.id}`, 2_147_483_647);
    positiveInteger(selection.seeds?.finalist, `seed finalista de ${selection.id}`, 2_147_483_647);
    if (!scenario
      || !["cleave", "aoe"].includes(scenario.category)
      || scenario.simulation.desiredTargets !== EXPECTED_TARGETS[index]
      || scenario.simulation.fightStyle !== "Patchwerk"
      || selection.seeds.screening === selection.seeds.finalist) {
      fail("MT_SCENARIO_SET_INVALID", `Cenário multi-target inválido: ${selection.id}.`);
    }
    const expectedMode = scenario.simulation.desiredTargets <= 3 ? "CLEAVE" : "AOE";
    const threshold = contextPolicy.thresholds.find((entry) => entry.mode === expectedMode);
    if (scenario.simulation.desiredTargets < threshold.minimumTargets
      || scenario.simulation.desiredTargets > threshold.maximumTargets) {
      fail("MT_CONTEXT_SCENARIO_MISMATCH", `${selection.id} não corresponde à política de contexto.`);
    }
    return Object.freeze({ ...scenario, seeds: Object.freeze({ ...selection.seeds }) });
  });

  if (!Array.isArray(study.candidates)
    || study.candidates.length < study.phases.finalistCount
    || study.candidates.length > 20) {
    fail("MT_CANDIDATES_INVALID", "O catálogo multi-target deve manter um espaço pequeno de candidatas.");
  }
  const seenIds = new Set([study.baseline.id]);
  const candidates = [];
  verifyRuntimeCapabilities(baseline, study.baseline.listId, study.baseline.id);
  for (const candidate of study.candidates) {
    if (typeof candidate.id !== "string" || seenIds.has(candidate.id)) {
      fail("MT_CANDIDATES_INVALID", `Identificador inválido ou duplicado: ${candidate?.id}.`);
    }
    seenIds.add(candidate.id);
    if (candidate.mutation?.listId !== study.baseline.listId) {
      fail("MT_MUTATION_SCOPE_INVALID", `A candidata ${candidate.id} sai da lista aoe.`);
    }
    const candidateRotation = applyMutation(baseline, candidate.mutation);
    verifyRuntimeCapabilities(candidateRotation, study.baseline.listId, candidate.id);
    const candidateProfile = renderCandidateProfile(profileText, candidate);
    candidates.push(Object.freeze({
      id: candidate.id,
      rotationSha256: rotationDigest(candidateRotation),
      profileSha256: sha256(candidateProfile),
      profileText: candidateProfile,
    }));
  }

  return Object.freeze({
    root: resolvedRoot,
    study: Object.freeze(study),
    studySha256: sha256(studyText),
    profileText,
    profileSha256: sha256(profileText),
    pins: Object.freeze({ ...pins }),
    baseline,
    matrix,
    contextPolicy: Object.freeze(contextPolicy),
    scenarios: Object.freeze(scenarios),
    candidates: Object.freeze(candidates),
  });
}

export async function generateMultiTargetCuration({ root = process.cwd() } = {}) {
  const validated = validateMultiTargetStudy({ root });
  return generateCurationArtifacts(validated, {
    tempDirectory: TEMP_DIRECTORY,
    measurementsFile: MULTI_TARGET_MEASUREMENTS,
    reportFile: MULTI_TARGET_REPORT,
  });
}

export function verifyMultiTargetCuration({ root = process.cwd() } = {}) {
  const validated = validateMultiTargetStudy({ root });
  const result = verifyCurationArtifacts(validated, {
    measurementsFile: MULTI_TARGET_MEASUREMENTS,
    reportFile: MULTI_TARGET_REPORT,
  });
  return {
    ...result,
    cleaveScenarios: validated.scenarios.filter((scenario) => scenario.category === "cleave").length,
    aoeScenarios: validated.scenarios.filter((scenario) => scenario.category === "aoe").length,
    contextPolicy: validated.contextPolicy.id,
  };
}
