import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const pins = JSON.parse(fs.readFileSync(path.join(root, "tools", "toolchain", "pins.json"), "utf8"));
const results = [];

function run(command, args = []) {
  const useCmd = process.platform === "win32" && command === "npm";
  const actualCommand = useCmd ? (process.env.ComSpec ?? "cmd.exe") : command;
  const actualArgs = useCmd ? ["/d", "/s", "/c", `npm ${args.join(" ")}`] : args;
  const result = spawnSync(actualCommand, actualArgs, {
    cwd: root,
    encoding: "utf8",
  });
  return {
    ok: result.status === 0,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim(),
  };
}

function record(name, ok, detail, required = true) {
  results.push({ name, ok, detail, required });
}

function sha256(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    return null;
  }
  return crypto.createHash("sha256").update(fs.readFileSync(absolutePath)).digest("hex").toUpperCase();
}

const git = run("git", ["--version"]);
record("Git", git.ok, git.output);

const nodeMajor = Number(process.versions.node.split(".", 1)[0]);
record("Node.js", nodeMajor === 24, process.versions.node);

const npm = run("npm", ["--version"]);
record("npm", npm.ok, npm.output);

const venvPython = process.platform === "win32"
  ? path.join(root, ".venv", "Scripts", "python.exe")
  : path.join(root, ".venv", "bin", "python");
const python = fs.existsSync(venvPython) ? run(venvPython, ["--version"]) : { ok: false, output: ".venv ausente" };
record("Python .venv", python.ok && /Python 3\.14\./u.test(python.output), python.output);

const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");
const luaJit = process.platform === "win32"
  ? path.join(localAppData, "Programs", "LuaJIT", "bin", "luajit.exe")
  : "luajit";
const luaRocks = process.platform === "win32"
  ? path.join(localAppData, "Programs", "LuaJIT", "bin", "luarocks.exe")
  : "luarocks";
const lua = run(luaJit, ["-v"]);
record("LuaJIT (Lua 5.1)", lua.ok, lua.output);
const rocks = run(luaRocks, ["--version"]);
record("LuaRocks", rocks.ok, rocks.output.split("\n", 1)[0]);

for (const [name, tool] of [
  ["Luacheck", pins.luacheck],
  ["wowlua-ls", pins.wowluaLs],
]) {
  const actualHash = sha256(tool.path);
  record(name, actualHash === tool.sha256, actualHash ? `${tool.release}; SHA-256 verificado` : `${tool.path} ausente`);
}

const simcHash = sha256(pins.simulationCraft.executable);
const simcSmoke = simcHash === pins.simulationCraft.executableSha256
  ? run(path.join(root, pins.simulationCraft.executable), ["spell_query=spell.id=188196"])
  : { ok: false, output: "" };
const simcOk = simcHash === pins.simulationCraft.executableSha256
  && simcSmoke.ok
  && simcSmoke.output.includes("Lightning Bolt");
record("SimulationCraft", simcOk, simcHash ? `${pins.simulationCraft.version}; ${pins.simulationCraft.wowVersion}; SHA-256 e spell query verificados` : `${pins.simulationCraft.executable} ausente`);

const docker = run("docker", ["info", "--format", "{{.ServerVersion}}"]);
record("Docker (Wowless futuro)", docker.ok, docker.ok ? docker.output : "daemon indisponível", false);

record("Cliente WoW Retail", pins.wowRetail.clientDetected, pins.wowRetail.clientDetected ? pins.wowRetail.version : "não detectado; necessário antes de TEST-002", false);

for (const result of results) {
  const marker = result.ok ? "OK" : result.required ? "ERRO" : "AVISO";
  console.log(`[${marker}] ${result.name}: ${result.detail}`);
}

const failures = results.filter((result) => result.required && !result.ok);
if (failures.length > 0) {
  console.error(`Toolchain incompleta: ${failures.length} requisito(s) obrigatório(s) falharam.`);
  process.exit(1);
}

console.log("Toolchain obrigatória validada.");
