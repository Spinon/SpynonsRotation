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

const result = spawnSync(executable, ["tests/unit/core_contracts_spec.lua"], {
  cwd: root,
  stdio: "inherit",
});
process.exit(result.status ?? 1);
