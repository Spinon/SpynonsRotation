import { spawnSync } from "node:child_process";

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
    process.exit(result.status ?? 1);
  }
}

try {
  git(["remote", "get-url", "origin"]);
  git(["fetch", "origin", "--prune"]);

  const branch = git(["symbolic-ref", "--quiet", "--short", "HEAD"]).stdout.trim();
  const upstreamResult = git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], { allowFailure: true });

  if (upstreamResult.status === 0) {
    const upstream = upstreamResult.stdout.trim();
    const counts = git(["rev-list", "--left-right", "--count", `HEAD...${upstream}`]).stdout.trim().split(/\s+/u).map(Number);
    const [ahead, behind] = counts;

    if (ahead > 0 && behind > 0) {
      throw new Error(`branch divergente: ${branch} está ${ahead} commit(s) à frente e ${behind} atrás de ${upstream}`);
    }

    if (behind > 0) {
      const dirty = git(["status", "--porcelain"]).stdout.trim();
      if (dirty) {
        throw new Error(`branch ${branch} está atrás de ${upstream}, mas o working tree possui alterações`);
      }
      git(["pull", "--ff-only"]);
    }

    console.log(`Git sincronizado: ${branch} ↔ ${upstream} (ahead=${ahead}, behind=${behind})`);
  } else {
    console.log(`Git fetch concluído; ${branch} ainda não possui upstream.`);
  }
} catch (error) {
  console.error(`project:sync interrompido: ${error.message}`);
  process.exit(1);
}

node("tools/project/status.mjs");
node("tools/project/check.mjs");
