import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const executable = path.join(process.cwd(), ".tools", "wowlua-ls", process.platform === "win32" ? "wowlua_ls.exe" : "wowlua_ls");
if (!fs.existsSync(executable)) {
  console.error(`wowlua-ls não encontrado: ${executable}`);
  process.exit(1);
}

const result = spawnSync(executable, ["check", "addon"], { cwd: process.cwd(), stdio: "inherit" });
process.exit(result.status ?? 1);
