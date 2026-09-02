import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function evaluateSyncState({ branch, upstream, ahead, behind, dirty }) {
  if (![ahead, behind].every((value) => Number.isInteger(value) && value >= 0)) {
    throw new Error("contadores Git inválidos");
  }

  if (ahead > 0 && behind > 0) {
    throw new Error(`branch divergente: ${branch} está ${ahead} commit(s) à frente e ${behind} atrás de ${upstream}`);
  }

  if (behind > 0 && dirty) {
    throw new Error(`branch ${branch} está atrás de ${upstream}, mas o working tree possui alterações`);
  }

  return behind > 0 ? "pull" : "none";
}

function git(args, options = {}) {
  const result = spawnSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    ...options,
  });

  if (result.status !== 0 && !options.allowFailure) {
    const detail = (result.stderr || result.stdout || "erro desconhecido").trim();
    throw new Error(`git ${args.join(" ")} falhou: ${detail}`);
  }
  return result;
}

function node(script) {
  const result = spawnSync(process.execPath, [script], { cwd: process.cwd(), stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`${script} falhou com exit code ${result.status ?? 1}`);
  }
}

export function main() {
  try {
    git(["remote", "get-url", "origin"]);
    git(["fetch", "origin", "--prune"]);

    const branch = git(["symbolic-ref", "--quiet", "--short", "HEAD"]).stdout.trim();
    const upstreamResult = git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], { allowFailure: true });

    if (upstreamResult.status === 0) {
      const upstream = upstreamResult.stdout.trim();
      const counts = git(["rev-list", "--left-right", "--count", `HEAD...${upstream}`]).stdout.trim().split(/\s+/u).map(Number);
      const [ahead, behind] = counts;
      const dirty = git(["status", "--porcelain"]).stdout.trim() !== "";
      const action = evaluateSyncState({ branch, upstream, ahead, behind, dirty });

      if (action === "pull") {
        git(["pull", "--ff-only"]);
      }

      console.log(`Git sincronizado: ${branch} ↔ ${upstream} (ahead=${ahead}, behind=${behind})`);
    } else {
      console.log(`Git fetch concluído; ${branch} ainda não possui upstream.`);
    }

    node("tools/project/status.mjs");
    node("tools/project/check.mjs");
  } catch (error) {
    console.error(`project:sync interrompido: ${error.message}`);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath === import.meta.url) {
  main();
}
