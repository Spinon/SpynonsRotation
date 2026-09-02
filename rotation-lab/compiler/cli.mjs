#!/usr/bin/env node

import { CompilerError } from "./errors.mjs";
import { verifyCompilerFixture } from "./verify.mjs";

const DEFAULT_FIXTURE = "rotation-lab/fixtures/compiler/neutral/neutral.compiler-fixture.json";
const HELP = `Uso:
  npm run compiler:check
  npm run compiler:check -- --fixture <arquivo.compiler-fixture.json>
`;

function parseArguments(args) {
  let fixture = DEFAULT_FIXTURE;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== "--fixture") {
      throw new CompilerError("COMPILER_UNKNOWN_ARGUMENT", `Opção desconhecida: ${args[index]}.`);
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new CompilerError("COMPILER_ARGUMENT_VALUE_MISSING", "A opção --fixture exige um caminho.");
    }
    fixture = value;
    index += 1;
  }
  return fixture;
}

function printError(error) {
  console.error(`[${error.code}] ${error.message}`);
  if (Array.isArray(error.details.issues)) {
    for (const issue of error.details.issues) {
      console.error(`- ${issue.path} [${issue.code}] ${issue.message}`);
    }
    return;
  }
  for (const [key, value] of Object.entries(error.details)) {
    if (value !== undefined) {
      console.error(`${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`);
    }
  }
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === undefined || command === "help" || command === "--help" || command === "-h") {
    console.log(HELP);
    return;
  }
  if (command !== "verify") {
    throw new CompilerError("COMPILER_UNKNOWN_COMMAND", `Comando desconhecido: ${command}.\n\n${HELP}`);
  }
  const fixture = parseArguments(args);
  const result = verifyCompilerFixture(fixture);
  console.log(`[OK] ${result.id}@${result.version}`);
  console.log(`[OK] DSL ↔ SimC ↔ runtime sem divergências; digest ${result.digest}`);
  console.log(`[OK] ${result.lists} lista(s); ${result.runtimeRules} regra(s) de runtime; ${result.excludedRules} exclusão(ões)`);
}

main().catch((error) => {
  if (error instanceof CompilerError) {
    printError(error);
  } else {
    console.error(error instanceof Error ? error.stack : String(error));
  }
  process.exitCode = 1;
});
