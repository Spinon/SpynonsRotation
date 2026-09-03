import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync as defaultSpawnSync } from "node:child_process";

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const OUTPUT_TAIL_LIMIT = 4000;

const EXIT_DIAGNOSTICS = Object.freeze({
  1: Object.freeze({
    category: "GENERAL_TERMINATION",
    message: "O SimulationCraft encerrou sem uma causa específica. Consulte as últimas linhas do processo.",
  }),
  30: Object.freeze({
    category: "INVALID_APL",
    message: "A Action Priority List não pôde ser interpretada. Revise a APL do perfil.",
  }),
  40: Object.freeze({
    category: "INITIALIZATION_ERROR",
    message: "A simulação não pôde ser inicializada. Revise personagem, equipamentos, talentos e opções.",
  }),
  50: Object.freeze({
    category: "ITERATION_ERROR",
    message: "Uma iteração falhou durante a simulação. Reduza o caso e revise a saída do processo.",
  }),
  51: Object.freeze({
    category: "SIMULATION_STUCK",
    message: "A simulação gerou eventos demais ou ficou presa. Revise loops e condições da APL.",
  }),
  60: Object.freeze({
    category: "NETWORK_OR_FILE_ERROR",
    message: "O SimulationCraft não conseguiu acessar um arquivo ou recurso de rede.",
  }),
  61: Object.freeze({
    category: "REPORT_OUTPUT_ERROR",
    message: "O SimulationCraft não conseguiu gravar um dos relatórios solicitados.",
  }),
  70: Object.freeze({
    category: "INVALID_SIM_OPTION",
    message: "Uma opção global da simulação é inválida.",
  }),
  71: Object.freeze({
    category: "INVALID_FIGHT_STYLE",
    message: "O estilo de combate não é compatível com um dos atores simulados.",
  }),
  72: Object.freeze({
    category: "UNSUPPORTED_SPECIALIZATION",
    message: "A especialização do perfil ainda não é suportada por esta versão do SimulationCraft.",
  }),
  80: Object.freeze({
    category: "INVALID_PLAYER_OPTION",
    message: "Uma opção do personagem é inválida.",
  }),
  81: Object.freeze({
    category: "INVALID_TALENTS",
    message: "A string de talentos do perfil é inválida para esta versão do SimulationCraft.",
  }),
  82: Object.freeze({
    category: "INVALID_ITEM",
    message: "Um item do perfil possui dados inválidos.",
  }),
});

export class SimcRunnerError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "SimcRunnerError";
    this.code = code;
    this.details = details;
  }
}

function normalizeRelative(value) {
  return value.split(path.sep).join("/");
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function resolveInside(root, candidate, code, label) {
  const resolved = path.resolve(root, candidate);
  if (!isInside(root, resolved)) {
    throw new SimcRunnerError(code, `${label} deve permanecer dentro do repositório.`, { candidate });
  }
  return resolved;
}

function readJson(filePath, code, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new SimcRunnerError(code, `${label} não pôde ser lido como JSON válido.`, {
      file: filePath,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

function requireString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new SimcRunnerError("PIN_INVALID", `Pin do SimulationCraft sem ${field}.`);
  }
}

function validatePins(pins) {
  const simc = pins?.simulationCraft;
  if (!simc || typeof simc !== "object") {
    throw new SimcRunnerError("PIN_INVALID", "tools/toolchain/pins.json não contém simulationCraft.");
  }

  for (const field of [
    "version",
    "wowVersion",
    "sourceRepository",
    "engineRepository",
    "workflowCommit",
    "engineCommit",
    "artifactName",
    "executable",
    "executableSha256",
  ]) {
    requireString(simc[field], `simulationCraft.${field}`);
  }

  if (!/^[0-9a-f]{40}$/u.test(simc.workflowCommit) || !/^[0-9a-f]{40}$/u.test(simc.engineCommit)) {
    throw new SimcRunnerError("PIN_INVALID", "Commits pinados do SimulationCraft devem usar SHA completo.");
  }
  if (!/^[0-9A-F]{64}$/u.test(simc.executableSha256)) {
    throw new SimcRunnerError("PIN_INVALID", "simulationCraft.executableSha256 deve ser um SHA-256 em maiúsculas.");
  }

  return simc;
}

export async function sha256(filePath) {
  const hash = crypto.createHash("sha256");
  const stream = fs.createReadStream(filePath);
  for await (const chunk of stream) {
    hash.update(chunk);
  }
  return hash.digest("hex").toUpperCase();
}

export function exitDiagnostic(exitCode) {
  const known = EXIT_DIAGNOSTICS[exitCode];
  if (known) {
    return { exitCode, ...known };
  }
  return {
    exitCode,
    category: "UNKNOWN_SIMC_EXIT",
    message: `O SimulationCraft encerrou com o código não mapeado ${exitCode}. Consulte a saída do processo.`,
  };
}

export async function inspectInstallation({ root = process.cwd() } = {}) {
  const projectRoot = fs.realpathSync(path.resolve(root));
  const pinsPath = path.join(projectRoot, "tools", "toolchain", "pins.json");
  if (!fs.statSync(pinsPath, { throwIfNoEntry: false })?.isFile()) {
    throw new SimcRunnerError("PINS_MISSING", "Arquivo tools/toolchain/pins.json não encontrado.");
  }

  const pins = readJson(pinsPath, "PIN_INVALID", "O arquivo de pins");
  const simc = validatePins(pins);
  const executablePath = resolveInside(
    projectRoot,
    simc.executable,
    "EXECUTABLE_OUTSIDE_PROJECT",
    "O executável pinado"
  );
  if (!fs.statSync(executablePath, { throwIfNoEntry: false })?.isFile()) {
    throw new SimcRunnerError(
      "EXECUTABLE_MISSING",
      `Executável pinado ausente: ${normalizeRelative(path.relative(projectRoot, executablePath))}. `
        + "Execute o bootstrap da toolchain antes de simular."
    );
  }

  const actualSha256 = await sha256(executablePath);
  if (actualSha256 !== simc.executableSha256) {
    throw new SimcRunnerError(
      "EXECUTABLE_HASH_MISMATCH",
      "O SHA-256 do executável não corresponde ao pin. Não execute este binário.",
      { expected: simc.executableSha256, actual: actualSha256 }
    );
  }

  return {
    projectRoot,
    pinsPath,
    simc,
    executablePath,
    actualSha256,
  };
}

function positiveInteger(value, name, maximum) {
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new SimcRunnerError(
      "INVALID_ARGUMENT",
      `${name} deve ser um inteiro entre 1 e ${maximum}.`,
      { name, value }
    );
  }
  return value;
}

function boundedNumber(value, name, minimum, maximum) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new SimcRunnerError(
      "INVALID_ARGUMENT",
      `${name} deve ser um número entre ${minimum} e ${maximum}.`,
      { name, value }
    );
  }
  return value;
}

function normalizeRunOptions(options) {
  const iterations = positiveInteger(options.iterations ?? 1000, "iterations", 10_000_000);
  const threads = positiveInteger(options.threads ?? 1, "threads", 1024);
  const timeoutMs = positiveInteger(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, "timeoutMs", 24 * 60 * 60 * 1000);
  const maxTime = options.maxTime === undefined
    ? undefined
    : positiveInteger(options.maxTime, "maxTime", 86_400);
  const seed = options.seed === undefined
    ? undefined
    : positiveInteger(options.seed, "seed", 2_147_483_647);
  const desiredTargets = options.desiredTargets === undefined
    ? undefined
    : positiveInteger(options.desiredTargets, "desiredTargets", 40);
  const varyCombatLength = options.varyCombatLength === undefined
    ? undefined
    : boundedNumber(options.varyCombatLength, "varyCombatLength", 0, 1);

  if (options.fightStyle !== undefined && options.fightStyle !== "Patchwerk") {
    throw new SimcRunnerError(
      "INVALID_ARGUMENT",
      "fightStyle aceita somente Patchwerk nesta versão tipada do runner.",
      { name: "fightStyle", value: options.fightStyle }
    );
  }

  if (options.fixedTime !== undefined && typeof options.fixedTime !== "boolean") {
    throw new SimcRunnerError("INVALID_ARGUMENT", "fixedTime deve ser booleano.");
  }

  return {
    iterations,
    threads,
    timeoutMs,
    maxTime,
    seed,
    desiredTargets,
    varyCombatLength,
    fightStyle: options.fightStyle,
    fixedTime: options.fixedTime === true,
  };
}

function defaultReportName(profilePath) {
  const base = path.basename(profilePath, path.extname(profilePath))
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-+|-+$/gu, "")
    .slice(0, 52);
  return `${base || "simulation"}-run`;
}

function normalizeReportName(value, profilePath) {
  const reportName = value ?? defaultReportName(profilePath);
  if (typeof reportName !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/u.test(reportName)) {
    throw new SimcRunnerError(
      "INVALID_REPORT_NAME",
      "O nome do relatório deve ter até 64 caracteres e usar apenas letras minúsculas, números e hífen."
    );
  }
  return reportName;
}

function resolveProfile(projectRoot, profile) {
  if (typeof profile !== "string" || profile.trim() === "") {
    throw new SimcRunnerError("PROFILE_MISSING", "Informe um perfil .simc localizado dentro do repositório.");
  }
  const candidate = resolveInside(projectRoot, profile, "PROFILE_OUTSIDE_PROJECT", "O perfil");
  if (path.extname(candidate).toLowerCase() !== ".simc") {
    throw new SimcRunnerError("PROFILE_EXTENSION_INVALID", "O perfil deve usar a extensão .simc.");
  }
  if (!fs.statSync(candidate, { throwIfNoEntry: false })?.isFile()) {
    throw new SimcRunnerError("PROFILE_MISSING", `Perfil não encontrado: ${profile}.`);
  }

  const realProfile = fs.realpathSync(candidate);
  if (!isInside(projectRoot, realProfile)) {
    throw new SimcRunnerError("PROFILE_OUTSIDE_PROJECT", "O perfil resolve para fora do repositório.");
  }
  return realProfile;
}

function tail(value) {
  const text = typeof value === "string" ? value : "";
  return text.length <= OUTPUT_TAIL_LIMIT ? text : text.slice(-OUTPUT_TAIL_LIMIT);
}

function runtimeIdentity(stdout, simc) {
  const firstLine = stdout.split(/\r?\n/u).find((line) => line.trim() !== "") ?? "";
  const expectedVersion = simc.version.replace(".", "-");
  const verified = firstLine.includes(`SimulationCraft ${expectedVersion}`)
    && firstLine.includes(simc.wowVersion)
    && firstLine.includes(simc.engineCommit.slice(0, 7));
  return { banner: firstLine, verified };
}

function simulationCraftMetadata(installation) {
  const { simc } = installation;
  return {
    version: simc.version,
    wowVersion: simc.wowVersion,
    sourceRepository: simc.sourceRepository,
    engineRepository: simc.engineRepository,
    engineCommit: simc.engineCommit,
    workflowCommit: simc.workflowCommit,
    workflowRunId: simc.workflowRunId,
    artifactId: simc.artifactId,
    artifactName: simc.artifactName,
    executable: normalizeRelative(path.relative(installation.projectRoot, installation.executablePath)),
    executableSha256: installation.actualSha256,
  };
}

function writeManifest(manifestPath, manifest) {
  try {
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  } catch (error) {
    throw new SimcRunnerError("MANIFEST_WRITE_FAILED", "Não foi possível gravar o manifesto da execução.", {
      file: manifestPath,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

function processFailure(processResult) {
  if (processResult.error) {
    const timedOut = processResult.error.code === "ETIMEDOUT";
    return {
      exitCode: processResult.status,
      category: timedOut ? "PROCESS_TIMEOUT" : "PROCESS_START_FAILED",
      message: timedOut
        ? "O SimulationCraft excedeu o tempo limite configurado."
        : "O processo do SimulationCraft não pôde ser iniciado.",
    };
  }
  return exitDiagnostic(processResult.status ?? 1);
}

export async function runSimulation(options = {}, dependencies = {}) {
  const installation = await inspectInstallation({ root: options.root });
  const profilePath = resolveProfile(installation.projectRoot, options.profile);
  const normalizedOptions = normalizeRunOptions(options);
  const reportName = normalizeReportName(options.reportName, profilePath);
  const reportsDirectory = path.join(installation.projectRoot, "rotation-lab", "reports");
  fs.mkdirSync(reportsDirectory, { recursive: true });

  const manifestPath = path.join(reportsDirectory, `${reportName}.run.json`);
  const simcReportPath = path.join(reportsDirectory, `${reportName}.simc.json`);
  fs.rmSync(manifestPath, { force: true });
  fs.rmSync(simcReportPath, { force: true });
  const args = [
    profilePath,
    `iterations=${normalizedOptions.iterations}`,
    `threads=${normalizedOptions.threads}`,
    `json2=${simcReportPath}`,
  ];
  if (normalizedOptions.maxTime !== undefined) {
    args.push(`max_time=${normalizedOptions.maxTime}`);
  }
  if (normalizedOptions.fixedTime) {
    args.push("fixed_time=1");
  }
  if (normalizedOptions.seed !== undefined) {
    args.push(`seed=${normalizedOptions.seed}`);
  }
  if (normalizedOptions.desiredTargets !== undefined) {
    args.push(`desired_targets=${normalizedOptions.desiredTargets}`);
  }
  if (normalizedOptions.varyCombatLength !== undefined) {
    args.push(`vary_combat_length=${normalizedOptions.varyCombatLength}`);
  }
  if (normalizedOptions.fightStyle !== undefined) {
    args.push(`fight_style=${normalizedOptions.fightStyle}`);
  }

  const now = dependencies.now ?? (() => new Date());
  const startedAt = now();
  const execute = dependencies.spawnSync ?? defaultSpawnSync;
  const processResult = execute(installation.executablePath, args, {
    cwd: installation.projectRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    shell: false,
    timeout: normalizedOptions.timeoutMs,
    windowsHide: true,
  });
  const completedAt = now();
  const stdout = processResult.stdout ?? "";
  const stderr = processResult.stderr ?? "";
  const identity = runtimeIdentity(stdout, installation.simc);
  let diagnostic;

  if (processResult.error || processResult.status !== 0) {
    diagnostic = processFailure(processResult);
  } else if (!identity.verified) {
    diagnostic = {
      exitCode: processResult.status,
      category: "RUNTIME_IDENTITY_MISMATCH",
      message: "O banner do processo não corresponde à versão/build/commit pinados.",
    };
  } else if (!fs.statSync(simcReportPath, { throwIfNoEntry: false })?.isFile()) {
    diagnostic = {
      exitCode: processResult.status,
      category: "SIMC_REPORT_MISSING",
      message: "O processo terminou com sucesso, mas não produziu o relatório JSON solicitado.",
    };
  } else {
    try {
      JSON.parse(fs.readFileSync(simcReportPath, "utf8"));
    } catch {
      diagnostic = {
        exitCode: processResult.status,
        category: "SIMC_REPORT_INVALID",
        message: "O relatório JSON produzido pelo SimulationCraft é inválido.",
      };
    }
  }

  const success = diagnostic === undefined;
  const manifest = {
    schemaVersion: 1,
    status: success ? "success" : "failed",
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
    simulationCraft: simulationCraftMetadata(installation),
    request: {
      profile: normalizeRelative(path.relative(installation.projectRoot, profilePath)),
      iterations: normalizedOptions.iterations,
      threads: normalizedOptions.threads,
      maxTime: normalizedOptions.maxTime ?? null,
      fixedTime: normalizedOptions.fixedTime,
      seed: normalizedOptions.seed ?? null,
      desiredTargets: normalizedOptions.desiredTargets ?? null,
      varyCombatLength: normalizedOptions.varyCombatLength ?? null,
      fightStyle: normalizedOptions.fightStyle ?? null,
      timeoutMs: normalizedOptions.timeoutMs,
    },
    process: {
      exitCode: processResult.status,
      signal: processResult.signal ?? null,
      runtimeBanner: identity.banner,
      runtimeIdentityVerified: identity.verified,
      stdoutTail: tail(stdout),
      stderrTail: tail(stderr),
    },
    diagnostic: diagnostic ?? null,
    artifacts: {
      manifest: normalizeRelative(path.relative(installation.projectRoot, manifestPath)),
      simulationCraftJson: fs.existsSync(simcReportPath)
        ? normalizeRelative(path.relative(installation.projectRoot, simcReportPath))
        : null,
    },
  };
  writeManifest(manifestPath, manifest);

  return {
    ok: success,
    manifest,
    manifestPath,
    simcReportPath: success ? simcReportPath : null,
    diagnostic: diagnostic ?? null,
  };
}
