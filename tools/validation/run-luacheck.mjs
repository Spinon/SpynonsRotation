import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const executable = path.join(process.cwd(), ".tools", "luacheck", process.platform === "win32" ? "luacheck.exe" : "luacheck");
if (!fs.existsSync(executable)) {
  console.error(`Luacheck não encontrado: ${executable}`);
  process.exit(1);
}

const result = spawnSync(executable, ["addon"], { cwd: process.cwd(), stdio: "inherit" });
process.exit(result.status ?? 1);
