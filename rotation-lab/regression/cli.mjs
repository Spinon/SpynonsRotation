#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { RegressionError } from "./errors.mjs";
import { verifyRegressionFixture } from "./verify.mjs";

function printError(error) {
  console.error(`[ERRO] ${error.message}`);
  if (error.source) {
    console.error(`Fonte: ${error.source}`);
  }
  for (const issue of error.issues ?? []) {
    console.error(`- ${issue.path}: ${issue.message}`);
  }
}

export function run(argv = process.argv.slice(2)) {
  const [command = "verify", ...extra] = argv;
  if (command !== "verify" || extra.length > 0) {
    throw new RegressionError("REGRESSION_COMMAND_INVALID", "Uso: npm run regression:check");
  }
  const verification = verifyRegressionFixture();
  const { approved, baselineBlocked, releaseBlocked } = verification;
  console.log(`[OK] ${approved.policy.id}@${approved.policy.version}: ${approved.seeds.length} cenários com seeds pareadas`);
  console.log("[OK] baseline, candidata e release anterior comparadas em 3 relações determinísticas");
  console.log(`[OK] caso aprovado: ${approved.verdict.regressionCount} regressão(ões)`);
  console.log(
    `[BLOCK] baseline: ${baselineBlocked.verdict.regressions[0].scenarioId} `
      + `${baselineBlocked.verdict.regressions[0].deltaPercent}%`
  );
  console.log(
    `[BLOCK] release anterior: ${releaseBlocked.verdict.regressions[0].scenarioId} `
      + `${releaseBlocked.verdict.regressions[0].deltaPercent}%`
  );
  return verification;
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  try {
    run();
  } catch (error) {
    printError(error);
    process.exitCode = 1;
  }
}
