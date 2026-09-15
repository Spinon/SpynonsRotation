import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const root = process.cwd();
export function readPins() {
  const pins = JSON.parse(fs.readFileSync("tests/headless/pins.json", "utf8"));
  const tools = JSON.parse(fs.readFileSync("tools/toolchain/pins.json", "utf8"));
  if (pins.schemaVersion !== 1 || pins.commit !== tools.wowless.commit || !/^[a-f0-9]{40}$/u.test(pins.commit)
    || pins.retailValidation !== "PENDING" || pins.product !== "wow" || pins.platform !== "linux/amd64"
    || !/^spynon-wowless:[a-f0-9]{8}$/u.test(pins.imageTag)
    || !/^debian:bookworm-slim@sha256:[a-f0-9]{64}$/u.test(pins.baseImage)) throw new Error("Invalid Wowless pins");
  const dockerfile = fs.readFileSync("tests/headless/Dockerfile", "utf8");
  const sources = fs.readFileSync("tests/headless/debian.sources", "utf8");
  if (!dockerfile.includes(`FROM ${pins.baseImage}`) || !dockerfile.includes(pins.commit)
    || !sources.includes(`/debian/${pins.aptSnapshot}`)) throw new Error("Wowless build recipe drift");
  return pins;
}
function docker(args, options = {}) {
  const result = spawnSync("docker", args, { cwd: root, encoding: "utf8", timeout: 120000,
    maxBuffer: 32 * 1024 * 1024, windowsHide: true, ...options });
  if (result.error || result.status !== 0) {
    throw new Error(`Docker failed (${result.status ?? result.error?.code}): ${(result.stderr || "").slice(-3000)}`);
  }
  return result.stdout;
}
export function inputDigest(directory) {
  const entries = [];
  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error("Input symlinks are not allowed");
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) entries.push(file);
    }
  }
  visit(directory);
  const hash = crypto.createHash("sha256");
  for (const file of entries.sort()) {
    hash.update(path.relative(directory, file).replaceAll("\\", "/")); hash.update("\0");
    hash.update(fs.readFileSync(file)); hash.update("\0");
  }
  return { sha256: hash.digest("hex").toUpperCase(), files: entries.length };
}
export function classify(log, probe, exitCode = 0) {
  const errors = (log.match(/^\[[\d.]+\] error:/gmu) || []).length;
  const warnings = (log.match(/^\[[\d.]+\] warning:/gmu) || []).length;
  const truncated = /maxerrors reached, quitting/u.test(log);
  // Pinned loader.saveAllVariables uses tostring for scalar strings (no Lua quotes).
  // Accept only the complete, exact marker; never evaluate this upstream output.
  const passed = /^SpynonHeadlessProbeResult[ \t]*=[ \t]*(?:PASS:BOOTSTRAP_SMOKE:HEADLESS_ONLY|"PASS:BOOTSTRAP_SMOKE:HEADLESS_ONLY"|'PASS:BOOTSTRAP_SMOKE:HEADLESS_ONLY')[ \t]*;?[ \t]*\r?$/mu.test(probe);
  const loaded = /done loading SpynonRotation\b/u.test(log) && /done loading SpynonHeadlessProbe\b/u.test(log);
  return { status: exitCode === 0 && errors === 0 && !truncated && passed && loaded ? "PASS" : "FAIL",
    errors, warnings, truncated, probePassed: passed, addonLoaded: loaded, retailValidation: "PENDING" };
}
export function runtimeArgs(pins, image, runDirectory, addonDirectory, probeDirectory) {
  if (!/^sha256:[a-f0-9]{64}$/u.test(image)) throw new Error("Run requires an immutable image ID");
  const mount = (source, destination, readonly) => {
    if (/[\r\n,]/u.test(source)) throw new Error("Unsupported mount path");
    return `type=bind,src=${source},dst=${destination}${readonly ? ",readonly" : ""}`;
  };
  return ["run", "--rm", "--platform", pins.platform, "--network", "none", "--read-only",
    "--cidfile", path.join(runDirectory, "container.id"),
    "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--cpus", "2", "--memory", "4g",
    "--pids-limit", "512", "--tmpfs", "/tmp:rw,nosuid,size=128m",
    "--mount", mount(addonDirectory, "/addons/SpynonRotation", true),
    "--mount", mount(probeDirectory, "/addons/SpynonHeadlessProbe", true),
    "--mount", mount(runDirectory, "/opt/wowless/out", false), image,
    "--addondir", "/addons/SpynonRotation", "--addondir", "/addons/SpynonHeadlessProbe",
    "--scripts", "update", "--maxerrors", "20", "--loglevel", "1", "--output", "/opt/wowless/out/run.log"];
}
export function build() {
  const pins = readPins();
  docker(["info", "--format", "{{.ServerVersion}}"]);
  docker(["build", "--platform", pins.platform, "--progress", "plain", "--tag", pins.imageTag,
    "--file", "tests/headless/Dockerfile", "tests/headless"], { timeout: 2400000, stdio: "inherit" });
}
export function run() {
  const pins = readPins();
  const image = JSON.parse(docker(["image", "inspect", pins.imageTag]))[0];
  if (image.Config?.Labels?.["org.opencontainers.image.revision"] !== pins.commit) throw new Error("Image revision mismatch");
  const base = path.resolve(".tools/wowless-runs"); fs.mkdirSync(base, { recursive: true });
  const output = fs.mkdtempSync(path.join(base, "run-"));
  const addon = path.resolve("addon"), probe = path.resolve("tests/headless/SpynonHeadlessProbe");
  const input = inputDigest(addon), probeInput = inputDigest(probe);
  let error;
  try { docker(runtimeArgs(pins, image.Id, output, addon, probe), { timeout: 300000 }); }
  catch (failure) {
    error = failure.message;
    const receipt = path.join(output, "container.id");
    const id = fs.existsSync(receipt) ? fs.readFileSync(receipt, "utf8").trim() : "";
    if (/^[a-f0-9]{64}$/u.test(id)) {
      // Only the container created by this invocation; never prune shared Docker state.
      spawnSync("docker", ["rm", "-f", id], { encoding: "utf8", timeout: 30000, windowsHide: true });
    }
  }
  const read = (file) => fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const result = classify(read(path.join(output, "run.log")),
    read(path.join(output, "wow/SavedVariables/SpynonHeadlessProbe.lua")), error ? 1 : 0);
  const inputChanged = input.sha256 !== inputDigest(addon).sha256 || probeInput.sha256 !== inputDigest(probe).sha256;
  if (inputChanged) result.status = "FAIL";
  const report = { schemaVersion: 1, createdAt: new Date().toISOString(), ...result,
    wowlessCommit: pins.commit, wowlessBuild: pins.wowlessBuild, image: image.Id, input, probeInput, inputChanged,
    error: error ?? null,
    scope: "BOOTSTRAP_AND_COMMAND_SMOKE_NOT_ROTATION_OR_RETAIL", output };
  fs.writeFileSync(path.join(output, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== "PASS") throw new Error(`Wowless smoke failed; inspect ${output}`);
  return report;
}
