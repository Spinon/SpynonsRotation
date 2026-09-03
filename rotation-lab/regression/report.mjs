import { evaluateScenarioResults } from "../scenarios/fitness.mjs";
import { parseScenarioMatrixDocument } from "../scenarios/parser.mjs";
import { compileScenarioPlans } from "../scenarios/plan.mjs";
import { RegressionError } from "./errors.mjs";
import { parseRegressionPolicyDocument, regressionPolicyDigest } from "./policy.mjs";
import { parseRegressionResultsDocument, regressionResultsDigest } from "./results.mjs";

function deepFreeze(value) {
  Object.freeze(value);
  for (const child of Object.values(value)) {
    if (child !== null && typeof child === "object" && !Object.isFrozen(child)) {
      deepFreeze(child);
    }
  }
  return value;
}

function round(value) {
  const rounded = Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function resultMap(result) {
  return new Map(result.measurements.map((measurement) => [measurement.scenarioId, measurement]));
}

function assertComparable(baseline, candidate, previousRelease, matrix) {
  const issues = [];
  const canonicalEngine = JSON.stringify(baseline.engine);
  for (const result of [candidate, previousRelease]) {
    if (JSON.stringify(result.engine) !== canonicalEngine) {
      issues.push({
        code: "ENGINE_MISMATCH",
        path: `$.${result.role}.engine`,
        message: `${result.role} deve usar o mesmo engine, build e número de iterações da baseline.`,
      });
    }
  }
  const baselineMeasurements = resultMap(baseline);
  for (const result of [candidate, previousRelease]) {
    const measurements = resultMap(result);
    for (const scenario of matrix.scenarios) {
      const expectedSeed = baselineMeasurements.get(scenario.id).seed;
      const actualSeed = measurements.get(scenario.id).seed;
      if (actualSeed !== expectedSeed) {
        issues.push({
          code: "SEED_MISMATCH",
          path: `$.${result.role}.measurements.${scenario.id}.seed`,
          message: `${result.role} usa seed ${actualSeed}; era esperada ${expectedSeed}.`,
        });
      }
    }
  }
  if (issues.length > 0) {
    throw new RegressionError(
      "REGRESSION_INPUTS_INCOMPARABLE",
      `Os resultados não são comparáveis: ${issues.length} problema(s).`,
      { issues }
    );
  }
}

function categoryScores(categories) {
  return categories.map((category) => ({
    category: category.category,
    weight: category.weight,
    deltaPercent: category.fitnessPercent,
  }));
}

function baselineComparison(matrix, baseline, candidate) {
  const baselineValues = resultMap(baseline);
  const evaluation = evaluateScenarioResults(matrix, {
    schemaVersion: 1,
    matrixId: matrix.id,
    matrixVersion: matrix.version,
    candidateId: candidate.rotation.id,
    measurements: candidate.measurements.map((measurement) => ({
      scenarioId: measurement.scenarioId,
      baseline: baselineValues.get(measurement.scenarioId).value,
      candidate: measurement.value,
    })),
  });
  const categories = new Map(matrix.scenarios.map((scenario) => [scenario.id, scenario.category]));
  const regressions = evaluation.guardrailViolations.map((violation) => ({
    comparison: "candidate_vs_baseline",
    scenarioId: violation.scenarioId,
    category: categories.get(violation.scenarioId),
    referenceRole: "baseline",
    deltaPercent: violation.deltaPercent,
    maxRegressionPercent: violation.maxRegressionPercent,
  }));
  return {
    id: "candidate_vs_baseline",
    referenceRole: "baseline",
    subjectRole: "candidate",
    required: true,
    status: evaluation.eligible ? "pass" : "fail",
    deltaPercent: evaluation.fitnessPercent,
    totalWeight: evaluation.totalWeight,
    categories: categoryScores(evaluation.categories),
    scenarios: evaluation.scenarios.map((scenario) => ({
      scenarioId: scenario.scenarioId,
      category: scenario.category,
      referenceValue: scenario.baseline,
      subjectValue: scenario.candidate,
      deltaPercent: scenario.deltaPercent,
      weight: scenario.weight,
      maxRegressionPercent: scenario.maxRegressionPercent,
      thresholdSource: "scenario_matrix",
      status: scenario.guardrail,
    })),
    regressions,
  };
}

function pairwiseComparison(matrix, reference, subject, { id, required, thresholdFor }) {
  const referenceValues = resultMap(reference);
  const subjectValues = resultMap(subject);
  const categories = new Map();
  const scenarios = [];
  const regressions = [];
  let totalWeight = 0;
  let weightedDelta = 0;

  for (const scenario of matrix.scenarios) {
    const referenceValue = referenceValues.get(scenario.id).value;
    const subjectValue = subjectValues.get(scenario.id).value;
    const deltaPercent = ((subjectValue / referenceValue) - 1) * 100;
    const threshold = thresholdFor?.(scenario.id) ?? null;
    const breached = threshold !== null && deltaPercent < (-threshold - 1e-9);
    totalWeight += scenario.weight;
    weightedDelta += deltaPercent * scenario.weight;
    const category = categories.get(scenario.category) ?? { weight: 0, weightedDelta: 0 };
    category.weight += scenario.weight;
    category.weightedDelta += deltaPercent * scenario.weight;
    categories.set(scenario.category, category);
    const roundedDelta = round(deltaPercent);
    scenarios.push({
      scenarioId: scenario.id,
      category: scenario.category,
      referenceValue,
      subjectValue,
      deltaPercent: roundedDelta,
      weight: scenario.weight,
      maxRegressionPercent: threshold,
      thresholdSource: required ? "regression_policy" : null,
      status: required ? (breached ? "fail" : "pass") : "diagnostic",
    });
    if (breached) {
      regressions.push({
        comparison: id,
        scenarioId: scenario.id,
        category: scenario.category,
        referenceRole: reference.role,
        deltaPercent: roundedDelta,
        maxRegressionPercent: threshold,
      });
    }
  }

  return {
    id,
    referenceRole: reference.role,
    subjectRole: subject.role,
    required,
    status: required ? (regressions.length === 0 ? "pass" : "fail") : "diagnostic",
    deltaPercent: round(weightedDelta / totalWeight),
    totalWeight,
    categories: [...categories.entries()]
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([category, aggregate]) => ({
        category,
        weight: aggregate.weight,
        deltaPercent: round(aggregate.weightedDelta / aggregate.weight),
      })),
    scenarios,
    regressions,
  };
}

function resultIdentity(result, digest) {
  return {
    role: result.role,
    resultsSha256: digest,
    rotation: { ...result.rotation },
  };
}

export function buildRegressionReport({
  matrix: matrixInput,
  policy: policyInput,
  baseline: baselineInput,
  candidate: candidateInput,
  previousRelease: previousReleaseInput,
}) {
  const matrix = parseScenarioMatrixDocument(matrixInput);
  const policy = parseRegressionPolicyDocument(policyInput, matrix);
  const baseline = parseRegressionResultsDocument(baselineInput, matrix, { role: "baseline" });
  const candidate = parseRegressionResultsDocument(candidateInput, matrix, { role: "candidate" });
  const previousRelease = parseRegressionResultsDocument(previousReleaseInput, matrix, { role: "previous_release" });
  assertComparable(baseline, candidate, previousRelease, matrix);

  const overrides = new Map(
    policy.thresholds.candidateVsPreviousRelease.overrides.map((override) => [
      override.scenarioId,
      override.maxRegressionPercent,
    ])
  );
  const thresholdFor = (scenarioId) => overrides.get(scenarioId)
    ?? policy.thresholds.candidateVsPreviousRelease.defaultMaxRegressionPercent;
  const comparisons = [
    baselineComparison(matrix, baseline, candidate),
    pairwiseComparison(matrix, previousRelease, candidate, {
      id: "candidate_vs_previous_release",
      required: true,
      thresholdFor,
    }),
    pairwiseComparison(matrix, previousRelease, baseline, {
      id: "baseline_vs_previous_release",
      required: false,
      thresholdFor: null,
    }),
  ];
  const regressions = comparisons.flatMap((comparison) => comparison.regressions);
  const matrixSha256 = compileScenarioPlans(matrix).source.sha256;

  return deepFreeze({
    schemaVersion: 1,
    policy: {
      id: policy.id,
      version: policy.version,
      sha256: regressionPolicyDigest(policy, matrix),
    },
    matrix: {
      id: matrix.id,
      version: matrix.version,
      sha256: matrixSha256,
      metric: matrix.fitness.metric,
      aggregation: matrix.fitness.aggregation,
    },
    engine: { ...baseline.engine },
    subjects: [
      resultIdentity(baseline, regressionResultsDigest(baseline, matrix, { role: "baseline" })),
      resultIdentity(candidate, regressionResultsDigest(candidate, matrix, { role: "candidate" })),
      resultIdentity(
        previousRelease,
        regressionResultsDigest(previousRelease, matrix, { role: "previous_release" })
      ),
    ],
    seeds: baseline.measurements.map((measurement) => ({
      scenarioId: measurement.scenarioId,
      seed: measurement.seed,
    })),
    comparisons,
    verdict: {
      status: regressions.length === 0 ? "pass" : "fail",
      regressionCount: regressions.length,
      regressions,
    },
  });
}

export function serializeRegressionReport(report) {
  return `${JSON.stringify(report, null, 2)}\n`;
}
