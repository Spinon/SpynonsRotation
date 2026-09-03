import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  exitDiagnostic,
  inspectInstallation,
  runSimulation,
  SimcRunnerError,
} from "../../rotation-lab/simc/runner.mjs";

const ENGINE_COMMIT = "f86979165c9b952e41d8cb6119065d3f6272abee";
const WORKFLOW_COMMIT = "17e4d74676a0b45525906b5cb1acdb1af2c851e1";
const BANNER = "SimulationCraft 1210-01 for World of Warcraft 12.1.0.69587 Live (git build midnight f869791)\n";

function fileSha256(contents) {
  return crypto.createHash("sha256").update(contents).digest("hex").toUpperCase();
}

function createProject(t, { createExecutable = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "spynon-simc-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "tools", "toolchain"), { recursive: true });
  fs.mkdirSync(path.join(root, ".tools", "simc"), { recursive: true });
  fs.mkdirSync(path.join(root, "rotation-lab", "fixtures"), { recursive: true });
  const executableContents = "fake-simc-binary";
  const executablePath = path.join(root, ".tools", "simc", "simc.exe");
  if (createExecutable) {
    fs.writeFileSync(executablePath, executableContents);
  }
  const pins = {
    simulationCraft: {
      version: "1210.01",
      wowVersion: "12.1.0.69587",
      sourceRepository: "simulationcraft/simc-publish",
      engineRepository: "simulationcraft/simc",
      workflowRunId: 33587950600,
      workflowCommit: WORKFLOW_COMMIT,
      engineCommit: ENGINE_COMMIT,
      artifactId: 9831070830,
      artifactName: "simc-nightly-win64-midnight",
      executable: ".tools/simc/simc.exe",
      executableSha256: fileSha256(executableContents),
    },
  };
  const pinsPath = path.join(root, "tools", "toolchain", "pins.json");
  fs.writeFileSync(pinsPath, `${JSON.stringify(pins, null, 2)}\n`);
  const profilePath = path.join(root, "rotation-lab", "fixtures", "probe.simc");
  fs.writeFileSync(profilePath, "shaman=probe\nspec=enhancement\n");
  return { root, pins, pinsPath, executablePath, profilePath };
}

function successfulProcess(assertArguments) {
  return (executable, args, processOptions) => {
    assertArguments?.(executable, args, processOptions);
    const reportArgument = args.find((argument) => argument.startsWith("json2="));
    fs.writeFileSync(reportArgument.slice("json2=".length), '{"sim":{"players":[]}}\n');
    return { status: 0, signal: null, stdout: BANNER, stderr: "" };
  };
}

test("inspeciona o executável pinado e valida seu SHA-256", async (t) => {
  const project = createProject(t);
  const result = await inspectInstallation({ root: project.root });
  assert.equal(result.executablePath, project.executablePath);
  assert.equal(result.simc.engineCommit, ENGINE_COMMIT);
  assert.equal(result.actualSha256, project.pins.simulationCraft.executableSha256);
});

test("falha com orientação quando o executável pinado está ausente", async (t) => {
  const project = createProject(t, { createExecutable: false });
  await assert.rejects(
    inspectInstallation({ root: project.root }),
    (error) => error instanceof SimcRunnerError
      && error.code === "EXECUTABLE_MISSING"
      && error.message.includes("bootstrap")
  );
});

test("recusa um executável cujo conteúdo diverge do pin", async (t) => {
  const project = createProject(t);
  fs.appendFileSync(project.executablePath, "tampered");
  await assert.rejects(
    inspectInstallation({ root: project.root }),
    (error) => error instanceof SimcRunnerError
      && error.code === "EXECUTABLE_HASH_MISMATCH"
      && error.details.expected !== error.details.actual
  );
});

test("recusa perfis fora do repositório antes de iniciar o processo", async (t) => {
  const project = createProject(t);
  let invoked = false;
  await assert.rejects(
    runSimulation(
      { root: project.root, profile: path.join(project.root, "..", "outside.simc") },
      { spawnSync: () => { invoked = true; } }
    ),
    (error) => error instanceof SimcRunnerError && error.code === "PROFILE_OUTSIDE_PROJECT"
  );
  assert.equal(invoked, false);
});

test("valida limites das opções tipadas", async (t) => {
  const project = createProject(t);
  await assert.rejects(
    runSimulation({ root: project.root, profile: project.profilePath, iterations: 0 }),
    (error) => error instanceof SimcRunnerError && error.code === "INVALID_ARGUMENT"
  );
});

test("executa sem shell e registra identidade e artefatos reproduzíveis", async (t) => {
  const project = createProject(t);
  const result = await runSimulation(
    {
      root: project.root,
      profile: project.profilePath,
      reportName: "successful-run",
      iterations: 25,
      threads: 2,
      maxTime: 30,
      fixedTime: true,
      seed: 310031,
      desiredTargets: 1,
      varyCombatLength: 0,
      fightStyle: "Patchwerk",
    },
    {
      now: () => new Date("2026-09-02T22:30:00.000Z"),
      spawnSync: successfulProcess((executable, args, processOptions) => {
        assert.equal(executable, project.executablePath);
        assert.equal(processOptions.shell, false);
        assert.equal(processOptions.cwd, project.root);
        assert.ok(args.includes("iterations=25"));
        assert.ok(args.includes("threads=2"));
        assert.ok(args.includes("max_time=30"));
        assert.ok(args.includes("fixed_time=1"));
        assert.ok(args.includes("seed=310031"));
        assert.ok(args.includes("desired_targets=1"));
        assert.ok(args.includes("vary_combat_length=0"));
        assert.ok(args.includes("fight_style=Patchwerk"));
      }),
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.manifest.status, "success");
  assert.equal(result.manifest.simulationCraft.version, "1210.01");
  assert.equal(result.manifest.simulationCraft.engineRepository, "simulationcraft/simc");
  assert.equal(result.manifest.simulationCraft.engineCommit, ENGINE_COMMIT);
  assert.equal(result.manifest.simulationCraft.workflowCommit, WORKFLOW_COMMIT);
  assert.equal(result.manifest.process.runtimeIdentityVerified, true);
  assert.ok(fs.existsSync(result.manifestPath));
  assert.ok(fs.existsSync(result.simcReportPath));
  assert.equal(result.manifest.request.seed, 310031);
  assert.equal(result.manifest.request.desiredTargets, 1);
  assert.equal(result.manifest.request.varyCombatLength, 0);
  assert.equal(result.manifest.request.fightStyle, "Patchwerk");
});

test("recusa parâmetros avançados fora dos limites tipados", async (t) => {
  const project = createProject(t);
  await assert.rejects(
    runSimulation({ root: project.root, profile: project.profilePath, seed: 0 }),
    (error) => error instanceof SimcRunnerError && error.code === "INVALID_ARGUMENT"
  );
  await assert.rejects(
    runSimulation({ root: project.root, profile: project.profilePath, varyCombatLength: 1.1 }),
    (error) => error instanceof SimcRunnerError && error.code === "INVALID_ARGUMENT"
  );
  await assert.rejects(
    runSimulation({ root: project.root, profile: project.profilePath, fightStyle: "DungeonRoute" }),
    (error) => error instanceof SimcRunnerError && error.code === "INVALID_ARGUMENT"
  );
});

test("mapeia falha do processo e preserva manifesto para diagnóstico", async (t) => {
  const project = createProject(t);
  const result = await runSimulation(
    { root: project.root, profile: project.profilePath, reportName: "failed-run" },
    {
      spawnSync: () => ({
        status: 40,
        signal: null,
        stdout: BANNER,
        stderr: "Unable to initialize actor",
      }),
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.diagnostic.category, "INITIALIZATION_ERROR");
  assert.equal(result.manifest.status, "failed");
  assert.equal(result.manifest.process.stderrTail, "Unable to initialize actor");
  assert.equal(result.manifest.artifacts.simulationCraftJson, null);
  assert.ok(fs.existsSync(result.manifestPath));
});

test("detecta sucesso sem o relatório JSON solicitado", async (t) => {
  const project = createProject(t);
  const result = await runSimulation(
    { root: project.root, profile: project.profilePath, reportName: "missing-report" },
    { spawnSync: () => ({ status: 0, signal: null, stdout: BANNER, stderr: "" }) }
  );
  assert.equal(result.ok, false);
  assert.equal(result.diagnostic.category, "SIMC_REPORT_MISSING");
});

test("oferece diagnóstico conhecido e fallback para códigos futuros", () => {
  assert.equal(exitDiagnostic(82).category, "INVALID_ITEM");
  assert.equal(exitDiagnostic(99).category, "UNKNOWN_SIMC_EXIT");
});
