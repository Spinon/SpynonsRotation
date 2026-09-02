#!/usr/bin/env node

import path from "node:path";
import { loadRotationFile, RotationDslError, serializeRotationDocument } from "./parser.mjs";
import { summarizeRotationDocument } from "./schema.mjs";

const DEFAULT_FIXTURE = "rotation-lab/fixtures/neutral-priority.rotation.json";
const HELP = `Uso:
  npm run dsl:check
  npm run dsl:check -- --file <arquivo.rotation.json>

Opções:
  --file <arquivo>   Documento dentro do repositório; usa a fixture neutra por padrão
  --canonical        Imprime a representação canônica validada
`;

function parseArguments(args) {
  const options = { file: DEFAULT_FIXTURE, canonical: false };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === "--canonical") {
      options.canonical = true;
      continue;
    }
    if (flag === "--file") {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new RotationDslError("DSL_ARGUMENT_VALUE_MISSING", "A opção --file exige um caminho.");
      }
      options.file = value;
      index += 1;
      continue;
    }
    throw new RotationDslError("DSL_UNKNOWN_ARGUMENT", `Opção desconhecida: ${flag}.`);
  }
  return options;
}

function displaySource(source) {
  if (source === "<memory>") {
    return source;
  }
  return path.normalize(source);
}

function printError(error) {
  console.error(`[${error.code}] ${error.message}`);
  for (const issue of error.issues) {
    console.error(`- ${displaySource(error.source)}:${issue.path} [${issue.code}] ${issue.message}`);
  }
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === undefined || command === "help" || command === "--help" || command === "-h") {
    console.log(HELP);
    return;
  }
  if (command !== "check") {
    throw new RotationDslError("DSL_UNKNOWN_COMMAND", `Comando desconhecido: ${command}.\n\n${HELP}`);
  }

  const options = parseArguments(args);
  const document = loadRotationFile(options.file);
  const summary = summarizeRotationDocument(document);
  console.log(`[OK] ${options.file}`);
  console.log(`[OK] ${summary.id}@${summary.version}: ${summary.lists} lista(s), ${summary.rules} regra(s)`);
  console.log(
    `[OK] capabilities: ADDON_AVAILABLE=${summary.capabilities.ADDON_AVAILABLE}; `
      + `CONDITIONALLY_SECRET=${summary.capabilities.CONDITIONALLY_SECRET}; `
      + `SIM_ONLY=${summary.capabilities.SIM_ONLY}`
  );
  if (options.canonical) {
    process.stdout.write(serializeRotationDocument(document));
  }
}

main().catch((error) => {
  if (error instanceof RotationDslError) {
    printError(error);
  } else {
    console.error(error instanceof Error ? error.stack : String(error));
  }
  process.exitCode = 1;
});
