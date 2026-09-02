import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");
const executable = process.platform === "win32"
  ? path.join(localAppData, "Programs", "LuaJIT", "bin", "luajit.exe")
  : "luajit";

if (process.platform === "win32" && !fs.existsSync(executable)) {
  console.error(`LuaJIT não encontrado: ${executable}`);
  process.exit(1);
}

const unitDirectory = path.join(root, "tests", "unit");
const suites = fs.readdirSync(unitDirectory)
  .filter((fileName) => fileName.endsWith("_spec.lua"))
  .sort();

if (suites.length === 0) {
  console.error("Nenhuma suíte Lua encontrada em tests/unit.");
  process.exit(1);
}

for (const suite of suites) {
  console.log(`\n== ${suite} ==`);
  const result = spawnSync(executable, [path.join("tests", "unit", suite)], {
    cwd: root,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(`\nLua unit suites: ${suites.length}/${suites.length} passed`);
