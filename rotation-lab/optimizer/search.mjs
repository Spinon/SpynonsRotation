import crypto from "node:crypto";
import { parseRotationDocument } from "../dsl/parser.mjs";
import { evaluateScenarioResults } from "../scenarios/fitness.mjs";
import { parseScenarioMatrixDocument } from "../scenarios/parser.mjs";
import { compileScenarioPlans } from "../scenarios/plan.mjs";
import { parseOptimizerConfigDocument, serializeOptimizerConfig } from "./config.mjs";
import { OptimizerError } from "./errors.mjs";
import { metricSetDigest, parseOptimizerMetricSet } from "./metrics.mjs";
import { applyMutation, rotationDigest, validateMutationCatalog } from "./mutations.mjs";

function sha256(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex").toUpperCase();
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

function assertTargets(baseline, matrix, config) {
  if (baseline.id !== config.targets.rotationId || baseline.version !== config.targets.rotationVersion) {
    throw new OptimizerError(
      "OPTIMIZER_ROTATION_TARGET_MISMATCH",
      `A baseline deve ser ${config.targets.rotationId}@${config.targets.rotationVersion}.`,
      { details: { actual: `${baseline.id}@${baseline.version}` } }
    );
  }
  if (matrix.id !== config.targets.matrixId || matrix.version !== config.targets.matrixVersion) {
    throw new OptimizerError(
      "OPTIMIZER_MATRIX_TARGET_MISMATCH",
      `A matriz deve ser ${config.targets.matrixId}@${config.targets.matrixVersion}.`,
      { details: { actual: `${matrix.id}@${matrix.version}` } }
    );
  }
}

function candidateId(config, digest) {
  const namespace = config.id.split(".", 1)[0];
  return `${namespace}.candidate_${digest.slice(0, 16).toLowerCase()}`;
}

function comparisonResults(matrix, config, baselineMetrics, candidateMetrics, digest) {
  const baseline = new Map(
    baselineMetrics.measurements.map((measurement) => [measurement.scenarioId, measurement.value])
  );
  return {
    schemaVersion: 1,
    matrixId: matrix.id,
    matrixVersion: matrix.version,
    candidateId: candidateId(config, digest),
    measurements: candidateMetrics.measurements.map((measurement) => ({
      scenarioId: measurement.scenarioId,
      baseline: baseline.get(measurement.scenarioId),
      candidate: measurement.value,
    })),
  };
}

function candidateSummary(record) {
  return {
    sha256: record.state.sha256,
    depth: record.state.depth,
    mutations: [...record.state.mutations],
    eligible: record.evaluation.eligible,
    fitnessPercent: record.evaluation.fitnessPercent,
    metricsSha256: record.metricsSha256,
    guardrailViolations: record.evaluation.guardrailViolations.map((violation) => ({ ...violation })),
  };
}

function rankRecords(left, right) {
  if (left.evaluation.eligible !== right.evaluation.eligible) {
    return left.evaluation.eligible ? -1 : 1;
  }
  if (left.evaluation.fitnessPercent !== right.evaluation.fitnessPercent) {
    return right.evaluation.fitnessPercent - left.evaluation.fitnessPercent;
  }
  if (left.state.mutations.length !== right.state.mutations.length) {
    return left.state.mutations.length - right.state.mutations.length;
  }
  return left.state.sha256.localeCompare(right.state.sha256, "en");
}

function stateFor(document, mutations, depth) {
  return {
    document,
    sha256: rotationDigest(document),
    mutations: Object.freeze([...mutations]),
    depth,
  };
}

export async function runBeamSearch({ baseline: baselineInput, matrix: matrixInput, config: configInput, evaluator }) {
  const baseline = parseRotationDocument(baselineInput);
  const matrix = parseScenarioMatrixDocument(matrixInput);
  const config = parseOptimizerConfigDocument(configInput);
  assertTargets(baseline, matrix, config);
  if (typeof evaluator !== "function") {
    throw new OptimizerError("OPTIMIZER_EVALUATOR_REQUIRED", "O beam search exige um evaluator assíncrono ou síncrono.");
  }
  validateMutationCatalog(baseline, config.mutations);

  const baselineState = stateFor(baseline, [], 0);
  const matrixSha256 = compileScenarioPlans(matrix).source.sha256;
  const configSha256 = sha256(serializeOptimizerConfig(config));

  async function requestMetrics(state, phase) {
    const budgetIterations = phase === "screening"
      ? config.budgets.screeningIterations
      : config.budgets.finalistIterations;
    const context = deepFreeze({
      optimizerId: config.id,
      optimizerVersion: config.version,
      phase,
      budgetIterations,
      candidateSha256: state.sha256,
      baseline: state.depth === 0,
      depth: state.depth,
      mutations: [...state.mutations],
    });
    let rawMetrics;
    try {
      rawMetrics = await evaluator(state.document, context);
    } catch (error) {
      throw new OptimizerError(
        "OPTIMIZER_EVALUATOR_FAILED",
        `O evaluator falhou em ${phase} para ${state.sha256}.`,
        {
          details: { phase, candidateSha256: state.sha256, mutations: state.mutations },
          cause: error,
        }
      );
    }
    const expected = {
      phase,
      budgetIterations,
      candidateSha256: state.sha256,
      source: `<evaluator:${phase}:${state.sha256}>`,
    };
    const metrics = parseOptimizerMetricSet(rawMetrics, matrix, expected);
    return { metrics, metricsSha256: metricSetDigest(metrics, matrix, expected) };
  }

  async function evaluateCandidate(state, phase, baselineMetrics) {
    const measured = await requestMetrics(state, phase);
    const evaluation = evaluateScenarioResults(
      matrix,
      comparisonResults(matrix, config, baselineMetrics, measured.metrics, state.sha256)
    );
    return { state, metrics: measured.metrics, metricsSha256: measured.metricsSha256, evaluation };
  }

  const screeningBaseline = await requestMetrics(baselineState, "screening");
  const seen = new Set([baselineState.sha256]);
  const evaluated = [];
  const generations = [];
  let beam = [baselineState];
  let stoppedReason = "max_depth";

  for (let depth = 1; depth <= config.limits.maxDepth; depth += 1) {
    if (evaluated.length >= config.limits.maxCandidates) {
      stoppedReason = "max_candidates";
      break;
    }
    const candidatesByDigest = new Map();
    let attempted = 0;
    for (const parent of beam) {
      for (const mutation of config.mutations) {
        if (parent.mutations.includes(mutation.id)) {
          continue;
        }
        attempted += 1;
        const document = applyMutation(parent.document, mutation);
        const candidate = stateFor(document, [...parent.mutations, mutation.id], depth);
        if (!seen.has(candidate.sha256) && !candidatesByDigest.has(candidate.sha256)) {
          candidatesByDigest.set(candidate.sha256, candidate);
        }
      }
    }

    const available = [...candidatesByDigest.values()]
      .sort((left, right) => left.sha256.localeCompare(right.sha256, "en"));
    if (available.length === 0) {
      stoppedReason = "no_new_candidates";
      break;
    }
    const remaining = config.limits.maxCandidates - evaluated.length;
    const selected = available.slice(0, remaining);
    const generationRecords = [];
    for (const state of selected) {
      seen.add(state.sha256);
      const record = await evaluateCandidate(state, "screening", screeningBaseline.metrics);
      generationRecords.push(record);
      evaluated.push(record);
    }

    const eligible = generationRecords.filter((record) => record.evaluation.eligible).sort(rankRecords);
    beam = eligible.slice(0, config.limits.beamWidth).map((record) => record.state);
    generations.push({
      depth,
      attempted,
      uniqueAvailable: available.length,
      evaluated: selected.length,
      deduplicated: attempted - available.length,
      candidates: generationRecords.map(candidateSummary),
      beam: beam.map((state) => state.sha256),
    });

    if (evaluated.length >= config.limits.maxCandidates) {
      stoppedReason = "max_candidates";
      break;
    }
    if (beam.length === 0) {
      stoppedReason = "no_eligible_candidates";
      break;
    }
  }

  const screeningRanking = evaluated.filter((record) => record.evaluation.eligible).sort(rankRecords);
  const finalistStates = screeningRanking
    .slice(0, config.limits.finalists)
    .map((record) => record.state);
  const finalistBaseline = await requestMetrics(baselineState, "finalist");
  const finalistRecords = [];
  for (const state of finalistStates) {
    finalistRecords.push(await evaluateCandidate(state, "finalist", finalistBaseline.metrics));
  }
  finalistRecords.sort(rankRecords);
  const winningRecord = finalistRecords.find(
    (record) => record.evaluation.eligible && record.evaluation.fitnessPercent > 0
  );
  const winner = winningRecord === undefined
    ? {
      type: "baseline",
      sha256: baselineState.sha256,
      fitnessPercent: 0,
      mutations: [],
      document: baseline,
    }
    : {
      type: "candidate",
      sha256: winningRecord.state.sha256,
      fitnessPercent: winningRecord.evaluation.fitnessPercent,
      mutations: [...winningRecord.state.mutations],
      document: winningRecord.state.document,
    };

  return deepFreeze({
    schemaVersion: 1,
    optimizer: { id: config.id, version: config.version, sha256: configSha256 },
    baseline: { id: baseline.id, version: baseline.version, sha256: baselineState.sha256 },
    matrix: { id: matrix.id, version: matrix.version, sha256: matrixSha256 },
    limits: { ...config.limits },
    budgets: { ...config.budgets },
    screening: {
      baselineMetricsSha256: screeningBaseline.metricsSha256,
      evaluatedCandidates: evaluated.length,
      stoppedReason,
      generations,
      ranking: screeningRanking.map(candidateSummary),
    },
    finalist: {
      baselineMetricsSha256: finalistBaseline.metricsSha256,
      evaluatedCandidates: finalistRecords.length,
      ranking: finalistRecords.map(candidateSummary),
    },
    winner,
  });
}

export function serializeOptimizerReport(report) {
  return `${JSON.stringify(report, null, 2)}\n`;
}
