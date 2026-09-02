import { ScenarioMatrixError } from "./errors.mjs";
import { evaluateScenarioResults, loadScenarioResultsFile } from "./fitness.mjs";
import { loadScenarioMatrixFile } from "./parser.mjs";
import { compileScenarioPlans, serializeScenarioPlans } from "./plan.mjs";
import { summarizeScenarioMatrix } from "./schema.mjs";

export const DEFAULT_SCENARIO_MATRIX = "rotation-lab/fixtures/scenarios/initial.scenario-matrix.json";
const ACCEPTED_RESULTS = "rotation-lab/fixtures/scenarios/accepted.scenario-results.json";
const GUARDED_RESULTS = "rotation-lab/fixtures/scenarios/guardrail-rejection.scenario-results.json";

export function verifyScenarioMatrixFile(file = DEFAULT_SCENARIO_MATRIX, { root = process.cwd() } = {}) {
  const matrix = loadScenarioMatrixFile(file, { root });
  const summary = summarizeScenarioMatrix(matrix);
  const bundle = compileScenarioPlans(matrix);
  const firstSerialization = serializeScenarioPlans(matrix);
  const secondSerialization = serializeScenarioPlans(matrix);
  if (firstSerialization !== secondSerialization) {
    throw new ScenarioMatrixError(
      "SCENARIO_PLAN_NONDETERMINISTIC",
      "A mesma matriz produziu planos diferentes em execuções consecutivas.",
      { details: { file } }
    );
  }
  return { matrix, summary, bundle };
}

export function verifyBundledScenarioFixtures({ root = process.cwd() } = {}) {
  const verified = verifyScenarioMatrixFile(DEFAULT_SCENARIO_MATRIX, { root });
  const acceptedResults = loadScenarioResultsFile(ACCEPTED_RESULTS, verified.matrix, { root });
  const guardedResults = loadScenarioResultsFile(GUARDED_RESULTS, verified.matrix, { root });
  const accepted = evaluateScenarioResults(verified.matrix, acceptedResults);
  const guarded = evaluateScenarioResults(verified.matrix, guardedResults);

  if (!accepted.eligible || accepted.guardrailViolations.length !== 0) {
    throw new ScenarioMatrixError(
      "SCENARIO_ACCEPTED_FIXTURE_FAILED",
      "A fixture de candidata saudável deveria ser elegível e não violar guardrails."
    );
  }
  if (guarded.eligible || guarded.fitnessPercent <= 0 || guarded.guardrailViolations.length === 0) {
    throw new ScenarioMatrixError(
      "SCENARIO_GUARDRAIL_FIXTURE_FAILED",
      "A fixture mascarada deve ter fitness positivo e ainda ser rejeitada por um guardrail."
    );
  }

  return { ...verified, accepted, guarded };
}
