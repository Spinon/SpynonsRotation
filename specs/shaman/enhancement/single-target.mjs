import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { applyMutation, rotationDigest } from "../../../rotation-lab/optimizer/mutations.mjs";
import { loadRotationFile } from "../../../rotation-lab/dsl/parser.mjs";
import {
  loadScenarioMatrixFile,
  serializeScenarioMatrix,
} from "../../../rotation-lab/scenarios/parser.mjs";
import { runSimulation } from "../../../rotation-lab/simc/runner.mjs";
import { EnhancementSingleTargetError } from "./errors.mjs";

export const SINGLE_TARGET_DIRECTORY = "specs/shaman/enhancement/single-target";
export const SINGLE_TARGET_STUDY = `${SINGLE_TARGET_DIRECTORY}/study.json`;
export const SINGLE_TARGET_MEASUREMENTS = `${SINGLE_TARGET_DIRECTORY}/measurements.json`;
export const SINGLE_TARGET_REPORT = `${SINGLE_TARGET_DIRECTORY}/report.json`;

const PINS_FILE = "tools/toolchain/pins.json";
const TEMP_DIRECTORY = `${SINGLE_TARGET_DIRECTORY}/.generated`;
const BASELINE_ID = "enhancement.st.baseline";
const PHASE_IDS = Object.freeze(["screening", "finalist"]);

function fail(code, message, details = {}) {
  throw new EnhancementSingleTargetError(code, message, details);
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

function normalizedJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function projectRoot(root) {
  return fs.realpathSync(path.resolve(root));
}

function resolveInside(root, relativeFile) {
  const resolved = path.resolve(root, relativeFile);
  const relative = path.relative(root, resolved);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail("ST_PATH_OUTSIDE_PROJECT", `${relativeFile} deve permanecer dentro do repositório.`);
  }
  return resolved;
}

function readText(root, relativeFile) {
  const filePath = resolveInside(root, relativeFile);
  if (!fs.statSync(filePath, { throwIfNoEntry: false })?.isFile()) {
    fail("ST_FILE_MISSING", `Arquivo ST não encontrado: ${relativeFile}.`, { file: relativeFile });
  }
  return fs.readFileSync(filePath, "utf8");
}

function readJson(root, relativeFile) {
  try {
    return JSON.parse(readText(root, relativeFile));
  } catch (error) {
    if (error instanceof EnhancementSingleTargetError) {
      throw error;
    }
    fail("ST_JSON_INVALID", `${relativeFile} não contém JSON válido.`, { file: relativeFile });
  }
}

function replaceUnique(source, before, after, candidateId) {
  const lines = source.split("\n");
  const indexes = lines.flatMap((line, index) => line === before ? [index] : []);
  if (indexes.length !== 1) {
    fail(
      "ST_PROFILE_PATCH_AMBIGUOUS",
      `A candidata ${candidateId} deve localizar exatamente uma ocorrência da linha de origem.`,
      { candidateId, occurrences: indexes.length }
    );
  }
  lines[indexes[0]] = after;
  return lines.join("\n");
}

export function renderCandidateProfile(source, candidate) {
  const patch = candidate?.profilePatch;
  if (patch?.kind === "replace_line") {
    return replaceUnique(source, patch.before, patch.after, candidate.id);
  }
  if (patch?.kind === "swap_lines") {
    const lines = source.split("\n");
    const firstIndexes = lines.flatMap((line, index) => line === patch.first ? [index] : []);
    const secondIndexes = lines.flatMap((line, index) => line === patch.second ? [index] : []);
    if (firstIndexes.length !== 1 || secondIndexes.length !== 1 || firstIndexes[0] === secondIndexes[0]) {
      fail("ST_PROFILE_PATCH_AMBIGUOUS", `A candidata ${candidate.id} possui swap ausente ou ambíguo.`);
    }
    lines[firstIndexes[0]] = patch.second;
    lines[secondIndexes[0]] = patch.first;
    return lines.join("\n");
  }
  fail("ST_PROFILE_PATCH_INVALID", `Patch de perfil inválido para ${candidate?.id ?? "<sem id>"}.`);
}

function assertPositiveInteger(value, label, maximum = 10_000_000) {
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    fail("ST_STUDY_INVALID", `${label} deve ser inteiro entre 1 e ${maximum}.`, { label, value });
  }
}

function verifyRuntimeCapabilities(document, listId, candidateId) {
  const list = document.lists.find((entry) => entry.id === listId);
  if (!list) {
    fail("ST_LIST_MISSING", `Lista ${listId} ausente na candidata ${candidateId}.`);
  }
  for (const rule of list.rules) {
    if (rule.capability === "SIM_ONLY") {
      fail("ST_SIM_ONLY_RULE", `A candidata ${candidateId} contém regra SIM_ONLY: ${rule.id}.`);
    }
    if (rule.capability === "CONDITIONALLY_SECRET" && rule.onUnavailable !== "skip_rule") {
      fail("ST_SECRET_FALLBACK_INVALID", `A regra ${rule.id} não preserva fallback skip_rule.`);
    }
  }
}

export function loadSingleTargetStudy({ root = process.cwd() } = {}) {
  const resolvedRoot = projectRoot(root);
  return readJson(resolvedRoot, SINGLE_TARGET_STUDY);
}

export function validateSingleTargetStudy({ root = process.cwd() } = {}) {
  const resolvedRoot = projectRoot(root);
  const studyText = readText(resolvedRoot, SINGLE_TARGET_STUDY);
  const study = JSON.parse(studyText);
  const profileText = readText(resolvedRoot, study.profile?.file);
  const pins = readJson(resolvedRoot, PINS_FILE).simulationCraft;
  const baseline = loadRotationFile(study.baseline?.rotationFile, { root: resolvedRoot });
  const matrix = loadScenarioMatrixFile(study.matrix?.file, { root: resolvedRoot });

  if (study.schemaVersion !== 1
    || study.id !== "enhancement.single_target_curation"
    || study.version !== "12.1.0-1"
    || study.baseline?.id !== BASELINE_ID
    || study.baseline?.listId !== "single_totemic") {
    fail("ST_STUDY_INVALID", "A identidade ou a baseline do estudo ST é inválida.");
  }
  if (study.profile.bytes !== Buffer.byteLength(profileText, "utf8")
    || study.profile.sha256 !== sha256(profileText)
    || study.profile.gitBlobSha !== gitBlobSha(profileText)) {
    fail("ST_PROFILE_DRIFT", "O perfil upstream ST diverge dos hashes registrados.");
  }
  if (study.profile.simulationCraftVersion !== pins.version
    || study.profile.engineCommit !== pins.engineCommit
    || study.profile.repository !== "https://github.com/simulationcraft/simc"
    || study.profile.path !== "profiles/MID2/MID2_Shaman_Enhancement_Totemic.simc"
    || study.profile.build !== "Totemic") {
    fail("ST_PROFILE_PROVENANCE_INVALID", "A proveniência do perfil ST diverge dos pins do projeto.");
  }
  if (study.baseline.rotationSha256 !== rotationDigest(baseline)) {
    fail("ST_BASELINE_DRIFT", "A Rotation DSL baseline diverge do digest registrado no estudo ST.");
  }
  if (study.matrix.id !== matrix.id
    || study.matrix.version !== matrix.version
    || study.matrix.sha256 !== sha256(serializeScenarioMatrix(matrix))) {
    fail("ST_MATRIX_DRIFT", "A matriz canônica diverge da identidade registrada no estudo ST.");
  }

  assertPositiveInteger(study.phases?.screeningIterations, "screeningIterations");
  assertPositiveInteger(study.phases?.finalistIterations, "finalistIterations");
  assertPositiveInteger(study.phases?.finalistCount, "finalistCount", 10);
  if (study.phases.finalistIterations <= study.phases.screeningIterations
    || typeof study.selection?.confidenceZ !== "number"
    || !Number.isFinite(study.selection.confidenceZ)
    || study.selection.confidenceZ <= 0
    || study.selection.confidencePolicy !== "95_percent_family_wise_bonferroni_for_two_finalists"
    || study.selection.requirePositiveLowerBound !== true) {
    fail("ST_STUDY_INVALID", "As fases ou a política de seleção do estudo ST são inválidas.");
  }

  const matrixById = new Map(matrix.scenarios.map((scenario) => [scenario.id, scenario]));
  if (!Array.isArray(study.scenarios) || study.scenarios.length !== 3) {
    fail("ST_SCENARIO_SET_INVALID", "O estudo deve conter exatamente os três cenários ST.");
  }
  const variants = new Set();
  for (const selection of study.scenarios) {
    const scenario = matrixById.get(selection.id);
    assertPositiveInteger(selection.seeds?.screening, `seed de triagem de ${selection.id}`, 2_147_483_647);
    assertPositiveInteger(selection.seeds?.finalist, `seed finalista de ${selection.id}`, 2_147_483_647);
    if (selection.seeds.screening === selection.seeds.finalist) {
      fail("ST_SCENARIO_SET_INVALID", `As fases devem usar seeds independentes em ${selection.id}.`);
    }
    if (!scenario
      || scenario.category !== "single_target"
      || scenario.simulation.desiredTargets !== 1
      || scenario.simulation.fightStyle !== "Patchwerk") {
      fail("ST_SCENARIO_SET_INVALID", `Cenário não elegível para esta curadoria: ${selection.id}.`);
    }
    variants.add(scenario.variant);
  }
  if (["short", "medium", "long"].some((variant) => !variants.has(variant))) {
    fail("ST_SCENARIO_SET_INVALID", "O conjunto ST deve cobrir curto, médio e longo.");
  }

  if (!Array.isArray(study.candidates)
    || study.candidates.length < study.phases.finalistCount
    || study.candidates.length > 20) {
    fail("ST_CANDIDATES_INVALID", "O catálogo deve manter um espaço pequeno e suficiente de candidatas.");
  }
  const seenIds = new Set([BASELINE_ID]);
  const candidates = [];
  verifyRuntimeCapabilities(baseline, study.baseline.listId, BASELINE_ID);
  for (const candidate of study.candidates) {
    if (typeof candidate.id !== "string" || seenIds.has(candidate.id)) {
      fail("ST_CANDIDATES_INVALID", `Identificador de candidata inválido ou duplicado: ${candidate?.id}.`);
    }
    seenIds.add(candidate.id);
    if (candidate.mutation?.listId !== study.baseline.listId) {
      fail("ST_MUTATION_SCOPE_INVALID", `A candidata ${candidate.id} sai da lista single_totemic.`);
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
    scenarios: Object.freeze(study.scenarios.map((selection) => Object.freeze({
      ...matrixById.get(selection.id),
      seeds: Object.freeze({ ...selection.seeds }),
    }))),
    candidates: Object.freeze(candidates),
  });
}

function round(value, decimals = 6) {
  const multiplier = 10 ** decimals;
  const result = Math.round((value + Number.EPSILON) * multiplier) / multiplier;
  return Object.is(result, -0) ? 0 : result;
}

function profileById(phase, profileId) {
  return phase.profiles.find((profile) => profile.id === profileId);
}

function compareProfiles(validated, phase, candidateId) {
  const baseline = profileById(phase, BASELINE_ID);
  const candidate = profileById(phase, candidateId);
  if (!baseline || !candidate) {
    fail("ST_MEASUREMENTS_INCOMPLETE", `Medição ausente para ${candidateId} em ${phase.id}.`);
  }
  let totalWeight = 0;
  let weightedDelta = 0;
  let weightedVariance = 0;
  const scenarios = validated.scenarios.map((scenario) => {
    const baselineMetric = baseline.scenarios.find((entry) => entry.scenarioId === scenario.id);
    const candidateMetric = candidate.scenarios.find((entry) => entry.scenarioId === scenario.id);
    const deltaPercent = ((candidateMetric.meanDps / baselineMetric.meanDps) - 1) * 100;
    const standardErrorPercent = 100 * Math.sqrt(
      baselineMetric.meanStandardError ** 2 + candidateMetric.meanStandardError ** 2
    ) / baselineMetric.meanDps;
    const maxRegressionPercent = scenario.maxRegressionPercent
      ?? validated.matrix.fitness.defaultMaxRegressionPercent;
    const guardrail = deltaPercent < -maxRegressionPercent ? "fail" : "pass";
    totalWeight += scenario.weight;
    weightedDelta += scenario.weight * deltaPercent;
    weightedVariance += (scenario.weight * standardErrorPercent) ** 2;
    return {
      scenarioId: scenario.id,
      baselineMeanDps: baselineMetric.meanDps,
      candidateMeanDps: candidateMetric.meanDps,
      deltaPercent: round(deltaPercent),
      standardErrorPercent: round(standardErrorPercent),
      maxRegressionPercent,
      guardrail,
    };
  });
  const fitnessPercent = weightedDelta / totalWeight;
  const aggregateStandardError = Math.sqrt(weightedVariance) / totalWeight;
  const lowerConfidenceBoundPercent = fitnessPercent
    - validated.study.selection.confidenceZ * aggregateStandardError;
  return {
    candidateId,
    eligible: scenarios.every((scenario) => scenario.guardrail === "pass"),
    fitnessPercent: round(fitnessPercent),
    lowerConfidenceBoundPercent: round(lowerConfidenceBoundPercent),
    scenarios,
  };
}

function rankComparisons(comparisons) {
  return [...comparisons].sort((left, right) => (
    Number(right.eligible) - Number(left.eligible)
    || right.fitnessPercent - left.fitnessPercent
    || left.candidateId.localeCompare(right.candidateId, "en")
  ));
}

export function calculateSingleTargetReport(validated, measurements) {
  const screening = measurements.phases.find((phase) => phase.id === "screening");
  const finalist = measurements.phases.find((phase) => phase.id === "finalist");
  const screeningRanking = rankComparisons(
    validated.candidates.map((candidate) => compareProfiles(validated, screening, candidate.id))
  );
  const expectedFinalists = screeningRanking
    .filter((entry) => entry.eligible)
    .slice(0, validated.study.phases.finalistCount)
    .map((entry) => entry.candidateId);
  const finalistIds = finalist.profiles.filter((profile) => profile.id !== BASELINE_ID).map((profile) => profile.id);
  if (JSON.stringify(finalistIds) !== JSON.stringify(expectedFinalists)) {
    fail("ST_FINALIST_SELECTION_DRIFT", "Os finalistas medidos não correspondem ao ranking da triagem.", {
      expectedFinalists,
      finalistIds,
    });
  }
  const finalistRanking = rankComparisons(finalistIds.map((id) => compareProfiles(validated, finalist, id)));
  const promoted = finalistRanking.find((entry) => entry.eligible
    && entry.fitnessPercent > 0
    && entry.lowerConfidenceBoundPercent > 0);
  return {
    schemaVersion: 1,
    study: {
      id: validated.study.id,
      version: validated.study.version,
      sha256: validated.studySha256,
    },
    metric: "mean_dps",
    method: {
      aggregation: "weighted_relative_delta",
      confidenceZ: validated.study.selection.confidenceZ,
      uncertainty: "conservative_independent_standard_error",
      pairedSeeds: true,
      independentPhaseSeeds: true,
      confidencePolicy: validated.study.selection.confidencePolicy,
    },
    screening: {
      iterations: screening.iterations,
      ranking: screeningRanking,
      selectedFinalists: expectedFinalists,
    },
    finalist: {
      iterations: finalist.iterations,
      ranking: finalistRanking,
    },
    decision: promoted
      ? {
        outcome: "candidate_promoted",
        selectedId: promoted.candidateId,
        reason: "eligible_positive_fitness_with_positive_family_wise_confidence_lower_bound",
      }
      : {
        outcome: "baseline_retained",
        selectedId: BASELINE_ID,
        reason: "no_finalist_cleared_guardrails_and_positive_family_wise_confidence_lower_bound",
      },
  };
}

function validateMetric(metric, phase, scenario) {
  if (metric?.scenarioId !== scenario.id
    || metric.seed !== scenario.seeds[phase.id]
    || metric.iterationsRequested !== phase.iterations
    || metric.maxTime !== scenario.simulation.maxTime
    || metric.fixedTime !== true
    || metric.varyCombatLength !== 0
    || metric.desiredTargets !== 1
    || metric.fightStyle !== "Patchwerk"
    || !Number.isInteger(metric.sampleCount)
    || metric.sampleCount < 1
    || !Number.isFinite(metric.meanDps)
    || metric.meanDps <= 0
    || !Number.isFinite(metric.meanStandardError)
    || metric.meanStandardError <= 0
    || !Number.isFinite(metric.standardDeviation)
    || metric.standardDeviation <= 0) {
    fail("ST_MEASUREMENT_INVALID", `Métrica inválida para ${scenario.id} em ${phase.id}.`);
  }
}

export function validateSingleTargetMeasurements(validated, measurements) {
  if (measurements?.schemaVersion !== 1
    || measurements.study?.id !== validated.study.id
    || measurements.study?.version !== validated.study.version
    || measurements.study?.sha256 !== validated.studySha256
    || measurements.simulationCraft?.version !== validated.study.profile.simulationCraftVersion
    || measurements.simulationCraft?.engineCommit !== validated.study.profile.engineCommit
    || measurements.simulationCraft?.wowVersion !== validated.pins.wowVersion
    || measurements.simulationCraft?.executableSha256 !== validated.pins.executableSha256
    || !Array.isArray(measurements.phases)
    || JSON.stringify(measurements.phases.map((phase) => phase.id)) !== JSON.stringify(PHASE_IDS)) {
    fail("ST_MEASUREMENTS_INVALID", "O cabeçalho das medições ST é inválido.");
  }
  const candidateById = new Map(validated.candidates.map((candidate) => [candidate.id, candidate]));
  for (const phase of measurements.phases) {
    const expectedIterations = phase.id === "screening"
      ? validated.study.phases.screeningIterations
      : validated.study.phases.finalistIterations;
    if (phase.iterations !== expectedIterations || !Array.isArray(phase.profiles)) {
      fail("ST_MEASUREMENTS_INVALID", `Fase ${phase.id} possui budget inválido.`);
    }
    const ids = new Set();
    for (const profile of phase.profiles) {
      const expected = profile.id === BASELINE_ID
        ? { profileSha256: validated.profileSha256, rotationSha256: validated.study.baseline.rotationSha256 }
        : candidateById.get(profile.id);
      if (!expected || ids.has(profile.id)
        || profile.profileSha256 !== expected.profileSha256
        || profile.rotationSha256 !== expected.rotationSha256
        || !Array.isArray(profile.scenarios)
        || profile.scenarios.length !== validated.scenarios.length) {
        fail("ST_MEASUREMENTS_INVALID", `Perfil medido inválido: ${profile.id}.`);
      }
      ids.add(profile.id);
      validated.scenarios.forEach((scenario, index) => validateMetric(profile.scenarios[index], phase, scenario));
    }
    if (!ids.has(BASELINE_ID)) {
      fail("ST_MEASUREMENTS_INCOMPLETE", `A fase ${phase.id} não contém a baseline.`);
    }
    if (phase.id === "screening" && ids.size !== validated.candidates.length + 1) {
      fail("ST_MEASUREMENTS_INCOMPLETE", "A triagem não contém todas as candidatas.");
    }
  }
  return measurements;
}

function extractDpsMetric(report, scenario, phase) {
  const metric = report?.sim?.players?.[0]?.collected_data?.dps;
  if (!metric) {
    fail("ST_SIMC_METRIC_MISSING", `O SimC não retornou DPS para ${scenario.id}.`);
  }
  return {
    scenarioId: scenario.id,
    seed: scenario.seeds[phase.id],
    iterationsRequested: phase.iterations,
    sampleCount: metric.count,
    maxTime: scenario.simulation.maxTime,
    fixedTime: true,
    varyCombatLength: 0,
    desiredTargets: 1,
    fightStyle: "Patchwerk",
    meanDps: metric.mean,
    meanStandardError: metric.mean_std_dev,
    standardDeviation: metric.std_dev,
  };
}

function safeReportName(phaseId, profileId, scenarioId) {
  const digest = sha256(`${phaseId}:${profileId}:${scenarioId}`).slice(0, 16).toLowerCase();
  return `enh003-${phaseId.slice(0, 3)}-${digest}`;
}

async function measurePhase(validated, phaseId, iterations, profiles, transientFiles) {
  const phase = { id: phaseId, iterations, profiles: [] };
  for (const profile of profiles) {
    const measured = {
      id: profile.id,
      rotationSha256: profile.rotationSha256,
      profileSha256: profile.profileSha256,
      scenarios: [],
    };
    for (const scenario of validated.scenarios) {
      const result = await runSimulation({
        root: validated.root,
        profile: profile.file,
        reportName: safeReportName(phaseId, profile.id, scenario.id),
        iterations,
        threads: validated.matrix.defaults.threads,
        maxTime: scenario.simulation.maxTime,
        fixedTime: true,
        seed: scenario.seeds[phaseId],
        varyCombatLength: 0,
        desiredTargets: 1,
        fightStyle: "Patchwerk",
      });
      transientFiles.push(result.manifestPath, result.simcReportPath);
      if (!result.ok) {
        fail("ST_SIMC_RUN_FAILED", result.diagnostic.message, { diagnostic: result.diagnostic });
      }
      const report = JSON.parse(fs.readFileSync(result.simcReportPath, "utf8"));
      measured.scenarios.push(extractDpsMetric(report, scenario, phase));
    }
    phase.profiles.push(measured);
  }
  return phase;
}

export async function generateSingleTargetCuration({ root = process.cwd() } = {}) {
  const validated = validateSingleTargetStudy({ root });
  const tempDirectory = resolveInside(validated.root, TEMP_DIRECTORY);
  const transientFiles = [];
  fs.rmSync(tempDirectory, { recursive: true, force: true });
  fs.mkdirSync(tempDirectory, { recursive: true });
  try {
    const baselineProfile = {
      id: BASELINE_ID,
      file: validated.study.profile.file,
      profileSha256: validated.profileSha256,
      rotationSha256: validated.study.baseline.rotationSha256,
    };
    const candidates = validated.candidates.map((candidate) => {
      const fileName = `${candidate.id.replaceAll(".", "-")}.simc`;
      const relativeFile = `${TEMP_DIRECTORY}/${fileName}`;
      fs.writeFileSync(resolveInside(validated.root, relativeFile), candidate.profileText, "utf8");
      return { ...candidate, file: relativeFile };
    });
    const screening = await measurePhase(
      validated,
      "screening",
      validated.study.phases.screeningIterations,
      [baselineProfile, ...candidates],
      transientFiles
    );
    const screeningMeasurements = {
      schemaVersion: 1,
      study: { id: validated.study.id, version: validated.study.version, sha256: validated.studySha256 },
      simulationCraft: {
        version: validated.study.profile.simulationCraftVersion,
        wowVersion: validated.pins.wowVersion,
        engineCommit: validated.study.profile.engineCommit,
        executableSha256: validated.pins.executableSha256,
      },
      phases: [screening],
    };
    const screeningRanking = rankComparisons(
      validated.candidates.map((candidate) => compareProfiles(validated, screening, candidate.id))
    );
    const finalistIds = screeningRanking
      .filter((entry) => entry.eligible)
      .slice(0, validated.study.phases.finalistCount)
      .map((entry) => entry.candidateId);
    const finalistProfiles = finalistIds.map((id) => candidates.find((candidate) => candidate.id === id));
    const finalist = await measurePhase(
      validated,
      "finalist",
      validated.study.phases.finalistIterations,
      [baselineProfile, ...finalistProfiles],
      transientFiles
    );
    const measurements = { ...screeningMeasurements, phases: [screening, finalist] };
    validateSingleTargetMeasurements(validated, measurements);
    const report = calculateSingleTargetReport(validated, measurements);
    fs.writeFileSync(resolveInside(validated.root, SINGLE_TARGET_MEASUREMENTS), normalizedJson(measurements), "utf8");
    fs.writeFileSync(resolveInside(validated.root, SINGLE_TARGET_REPORT), normalizedJson(report), "utf8");
    return report;
  } finally {
    for (const file of transientFiles.filter(Boolean)) {
      const resolved = path.resolve(file);
      if (resolved.startsWith(`${validated.root}${path.sep}`)) {
        fs.rmSync(resolved, { force: true });
      }
    }
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
}

export function verifySingleTargetCuration({ root = process.cwd() } = {}) {
  const validated = validateSingleTargetStudy({ root });
  const measurementsText = readText(validated.root, SINGLE_TARGET_MEASUREMENTS);
  const reportText = readText(validated.root, SINGLE_TARGET_REPORT);
  const measurements = validateSingleTargetMeasurements(validated, JSON.parse(measurementsText));
  const expectedReport = calculateSingleTargetReport(validated, measurements);
  if (reportText !== normalizedJson(expectedReport)) {
    fail("ST_REPORT_DRIFT", "O relatório ST diverge das medições golden ou da política de decisão.");
  }
  return {
    ok: true,
    candidates: validated.candidates.length,
    scenarios: validated.scenarios.length,
    screeningIterations: validated.study.phases.screeningIterations,
    finalistIterations: validated.study.phases.finalistIterations,
    finalists: expectedReport.screening.selectedFinalists,
    decision: expectedReport.decision,
  };
}
