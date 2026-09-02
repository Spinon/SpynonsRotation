#!/usr/bin/env node

import { ScenarioMatrixError } from "./errors.mjs";
import {
  DEFAULT_SCENARIO_MATRIX,
  verifyBundledScenarioFixtures,
  verifyScenarioMatrixFile,
} from "./verify.mjs";

const HELP = `Uso:
  npm run scenario:check
  npm run scenario:check -- --matrix <arquivo.scenario-matrix.json>
`;

function parseArguments(args) {
  let matrix = DEFAULT_SCENARIO_MATRIX;
  let custom = false;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== "--matrix") {
      throw new ScenarioMatrixError("SCENARIO_UNKNOWN_ARGUMENT", `Opção desconhecida: ${args[index]}.`);
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new ScenarioMatrixError("SCENARIO_ARGUMENT_VALUE_MISSING", "A opção --matrix exige um caminho.");
    }
    matrix = value;
    custom = true;
    index += 1;
  }
  return { matrix, custom };
}

function printMatrix(result) {
  const categories = Object.entries(result.summary.categories)
    .map(([category, count]) => `${category}=${count}`)
    .join(", ");
  console.log(`[OK] ${result.matrix.id}@${result.matrix.version}: ${result.summary.scenarios} cenários; peso ${result.summary.totalWeight}`);
  console.log(`[OK] Cobertura ${categories}; ${result.summary.eventScenarios} cenário(s) com eventos`);
  console.log(`[OK] ${result.bundle.plans.length} planos determinísticos; digest ${result.bundle.source.sha256}`);
}

function printError(error) {
  console.error(`[${error.code}] ${error.message}`);
  for (const issue of error.issues ?? []) {
    console.error(`- ${issue.path} [${issue.code}] ${issue.message}`);
  }
  for (const [key, value] of Object.entries(error.details ?? {})) {
    console.error(`${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`);
  }
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === undefined || command === "help" || command === "--help" || command === "-h") {
    console.log(HELP);
    return;
  }
  if (command !== "verify") {
    throw new ScenarioMatrixError("SCENARIO_UNKNOWN_COMMAND", `Comando desconhecido: ${command}.\n\n${HELP}`);
  }

  const options = parseArguments(args);
  if (options.custom) {
    printMatrix(verifyScenarioMatrixFile(options.matrix));
    return;
  }
  const result = verifyBundledScenarioFixtures();
  printMatrix(result);
  console.log(`[OK] Candidata saudável elegível: fitness ${result.accepted.fitnessPercent}%`);
  console.log(
    `[OK] Regressão mascarada bloqueada: fitness ${result.guarded.fitnessPercent}%; `
      + `${result.guarded.guardrailViolations.length} violação(ões)`
  );
  for (const violation of result.guarded.guardrailViolations) {
    console.log(
      `[BLOCK] ${violation.scenarioId}: delta ${violation.deltaPercent}%; `
        + `limite -${violation.maxRegressionPercent}%`
    );
  }
}

main().catch((error) => {
  if (error instanceof ScenarioMatrixError) {
    printError(error);
  } else {
    console.error(error instanceof Error ? error.stack : String(error));
  }
  process.exitCode = 1;
});
