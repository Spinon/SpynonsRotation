#!/usr/bin/env node

import path from "node:path";
import { inspectInstallation, runSimulation, SimcRunnerError } from "./runner.mjs";

const HELP = `Uso:
  npm run simc:doctor
  npm run simc:run -- --profile <arquivo.simc> [opções]

Opções de simc:run:
  --profile <arquivo>      Perfil .simc dentro do repositório (obrigatório)
  --name <nome>           Nome dos relatórios (letras minúsculas, números e hífen)
  --iterations <n>        Iterações, padrão 1000
  --threads <n>           Threads, padrão 1
  --max-time <segundos>   Duração máxima simulada
  --seed <n>              Semente determinística
  --desired-targets <n>   Quantidade de alvos
  --vary-combat-length <n> Variação da duração entre 0 e 1
  --fight-style <estilo>  Estilo tipado (Patchwerk)
  --timeout-ms <ms>       Limite de tempo do processo
  --fixed-time            Usa uma duração fixa de combate
`;

const VALUE_FLAGS = new Map([
  ["--profile", "profile"],
  ["--name", "reportName"],
  ["--iterations", "iterations"],
  ["--threads", "threads"],
  ["--max-time", "maxTime"],
  ["--seed", "seed"],
  ["--desired-targets", "desiredTargets"],
  ["--vary-combat-length", "varyCombatLength"],
  ["--fight-style", "fightStyle"],
  ["--timeout-ms", "timeoutMs"],
]);
const NUMBER_OPTIONS = new Set([
  "iterations",
  "threads",
  "maxTime",
  "seed",
  "desiredTargets",
  "varyCombatLength",
  "timeoutMs",
]);

function parseRunArguments(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === "--fixed-time") {
      options.fixedTime = true;
      continue;
    }

    const property = VALUE_FLAGS.get(flag);
    if (!property) {
      throw new SimcRunnerError("UNKNOWN_ARGUMENT", `Opção desconhecida: ${flag}.`);
    }

    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new SimcRunnerError("ARGUMENT_VALUE_MISSING", `A opção ${flag} exige um valor.`);
    }
    index += 1;
    options[property] = NUMBER_OPTIONS.has(property) ? Number(value) : value;
  }
  return options;
}

function relative(filePath) {
  return path.relative(process.cwd(), filePath).replaceAll("\\", "/");
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === undefined || command === "help" || command === "--help" || command === "-h") {
    console.log(HELP);
    return;
  }

  if (command === "doctor") {
    if (args.length > 0) {
      throw new SimcRunnerError("UNKNOWN_ARGUMENT", `simc:doctor não aceita argumentos: ${args.join(" ")}.`);
    }
    const installation = await inspectInstallation();
    console.log(`[OK] SimulationCraft ${installation.simc.version}`);
    console.log(`[OK] WoW ${installation.simc.wowVersion}`);
    console.log(`[OK] Engine ${installation.simc.engineCommit}`);
    console.log(`[OK] Executável ${relative(installation.executablePath)}`);
    console.log(`[OK] SHA-256 ${installation.actualSha256}`);
    return;
  }

  if (command !== "run") {
    throw new SimcRunnerError("UNKNOWN_COMMAND", `Comando desconhecido: ${command}.\n\n${HELP}`);
  }

  const result = await runSimulation(parseRunArguments(args));
  if (!result.ok) {
    console.error(`[${result.diagnostic.category}] ${result.diagnostic.message}`);
    console.error(`Manifesto: ${relative(result.manifestPath)}`);
    process.exitCode = Number.isInteger(result.diagnostic.exitCode) && result.diagnostic.exitCode > 0
      ? result.diagnostic.exitCode
      : 1;
    return;
  }

  console.log("[OK] Simulação concluída.");
  console.log(`Manifesto: ${relative(result.manifestPath)}`);
  console.log(`Relatório SimulationCraft: ${relative(result.simcReportPath)}`);
}

main().catch((error) => {
  if (error instanceof SimcRunnerError) {
    console.error(`[${error.code}] ${error.message}`);
    if (Object.keys(error.details).length > 0) {
      console.error(JSON.stringify(error.details, null, 2));
    }
  } else {
    console.error(error instanceof Error ? error.stack : String(error));
  }
  process.exitCode = 1;
});
