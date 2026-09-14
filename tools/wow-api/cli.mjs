import fs from "node:fs";
import { captureSnapshot, compareSnapshots, hash, serialize, verifyPinnedSnapshot } from "./api-diff.mjs";

const sources = JSON.parse(fs.readFileSync("tools/wow-api/sources.json", "utf8"));
const [command = "check", build] = process.argv.slice(2);
const directory = "tools/wow-api/snapshots";
if (command === "capture") {
  const pin = sources.builds[build];
  if (!pin) throw new Error("Build is not pinned in sources.json");
  const snapshot = await captureSnapshot(pin, sources.files, async (path) => {
    const response = await fetch(`https://raw.githubusercontent.com/${sources.repository}/${pin.commit}/${path}`);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Source fetch failed: ${response.status} ${path}`);
    return Buffer.from(await response.arrayBuffer());
  });
  fs.mkdirSync(directory, { recursive: true });
  const text = serialize(snapshot);
  fs.writeFileSync(`${directory}/${build}.json`, text);
  console.log(`Captured ${build}: ${hash(text)} (${snapshot.files.length} files)`);
} else if (command === "check" || command === "report" || command === "policy") {
  const snapshots = Object.fromEntries(Object.entries(sources.builds).map(([id, pin]) => [id,
    verifyPinnedSnapshot(fs.readFileSync(`${directory}/${id}.json`, "utf8"), pin)]));
  for (const snapshot of Object.values(snapshots)) {
    if (snapshot.files.length !== sources.files.length) throw new Error("Configured coverage drift");
    for (const tracked of sources.files) {
      const file = snapshot.files.find((entry) => entry.path.endsWith(`/${tracked.name}`));
      if (!file || JSON.stringify(file.modules) !== JSON.stringify([...tracked.modules].sort())) {
        throw new Error("Configured ownership drift");
      }
      for (const module of file.modules) if (!fs.existsSync(module)) throw new Error(`Affected module missing: ${module}`);
    }
  }
  const report = compareSnapshots(snapshots["69587"], snapshots["69814"]);
  const output = "tools/wow-api/reports/69587-to-69814.json";
  if (command === "report") {
    fs.mkdirSync("tools/wow-api/reports", { recursive: true });
    fs.writeFileSync(output, serialize(report));
  } else if (fs.readFileSync(output, "utf8") !== serialize(report)) throw new Error("API report drift");
  if (command !== "report") {
    if (report.decision !== "NO_DOCUMENTED_CHANGE_IN_COVERED_FILES") throw new Error("Development policy needs review");
    const builds = [...sources.developmentSmokeBuilds].sort();
    for (const id of builds) {
      if (!/^[0-9]+$/u.test(id) || !snapshots[id] || snapshots[id].interface !== 120100) throw new Error("Invalid development build");
      if (compareSnapshots(snapshots["69587"], snapshots[id]).decision !== "NO_DOCUMENTED_CHANGE_IN_COVERED_FILES") {
        throw new Error(`Unreviewed development build: ${id}`);
      }
    }
    const lua = ["-- Generated from tools/wow-api/sources.json; development smoke only, not Retail approval.",
      "local _, Spynon = ...", "Spynon.CompatInternal.ClientPolicy = {", "  interface = 120100,",
      "  developmentBuilds = {", ...builds.map((id) => `    [\"${id}\"] = true,`), "  },", "}", ""].join("\n");
    const policyFile = "addon/Compat/ClientPolicy.lua";
    if (command === "policy") fs.writeFileSync(policyFile, lua);
    else if (fs.readFileSync(policyFile, "utf8") !== lua) throw new Error("Runtime client policy drift");
  }
  console.log(`API diff: ${report.coveredFiles} files; ${report.changes.length} changes; ${report.decision}; Retail PENDING`);
} else throw new Error("Use capture <pinned build>, report or check");
