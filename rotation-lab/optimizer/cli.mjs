#!/usr/bin/env node

import { OptimizerError } from "./errors.mjs";
import { verifyOptimizerFixture } from "./verify.mjs";

const HELP = `Uso:
  npm run optimizer:check
`;

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
  if (command !== "verify" || args.length > 0) {
    throw new OptimizerError("OPTIMIZER_UNKNOWN_COMMAND", `Comando ou argumentos desconhecidos.\n\n${HELP}`);
  }
  const result = await verifyOptimizerFixture();
  const report = result.report;
  console.log(`[OK] ${report.optimizer.id}@${report.optimizer.version}`);
  console.log(
    `[OK] screening: ${report.screening.evaluatedCandidates}/${report.limits.maxCandidates} candidatas; `
      + `${report.screening.generations.length} geração(ões); ${result.deduplicated} deduplicação(ões)`
  );
  console.log(
    `[OK] finalist: ${report.finalist.evaluatedCandidates}/${report.limits.finalists}; `
      + `${report.budgets.screeningIterations} → ${report.budgets.finalistIterations} iterações`
  );
  console.log(`[OK] guardrails: ${result.rejectedFinalists} finalista(s) rejeitado(s) após reavaliação`);
  console.log(
    `[OK] vencedor ${report.winner.type}: fitness ${report.winner.fitnessPercent}%; `
      + `mutações ${report.winner.mutations.join(" + ") || "nenhuma"}`
  );
}

main().catch((error) => {
  if (error instanceof OptimizerError) {
    printError(error);
  } else {
    console.error(error instanceof Error ? error.stack : String(error));
  }
  process.exitCode = 1;
});
