import fs from "node:fs";
export function checkWorkflow(workflow, pins) {
  const errors = [];
  const actions = [...workflow.matchAll(/uses: ([\w/-]+)@([^\s]+)/gu)];
  if (actions.length !== 6) errors.push("Expected six pinned action uses");
  for (const [, name, sha] of actions) if (sha !== pins.actions[name] || !/^[a-f0-9]{40}$/u.test(sha)) errors.push("Action pin drift");
  for (const forbidden of [/pull_request_target/u, /secrets\./u, /(?:contents|packages|id-token):\s*write/u,
    /npm publish|gh release|git push|docker push/u, /continue-on-error:\s*true/u, /self-hosted/u]) {
    if (forbidden.test(workflow)) errors.push("Forbidden CI authority or bypass");
  }
  for (const required of ["contents: read", "persist-credentials: false", "npm test", "node tools/ci/package.mjs",
    "npm run wowless:build", "npm run wowless:run", "retention-days: 7", "timeout-minutes: 15", "timeout-minutes: 40",
    `node-version: '${pins.node}'`, "checkHistory();", "./tools/ci/Setup-Simc.ps1"]) if (!workflow.includes(required)) errors.push(`Missing CI contract: ${required}`);
  if (Object.keys(pins.actions).length !== 3 || pins.schemaVersion !== 1 || !/^[A-F0-9]{64}$/u.test(pins.luaJitZip.sha256)) errors.push("Invalid CI pins");
  return errors;
}
export function check() {
  const pins = JSON.parse(fs.readFileSync("tools/ci/pins.json", "utf8"));
  const toolchain = JSON.parse(fs.readFileSync("tools/toolchain/pins.json", "utf8"));
  if (pins.node !== toolchain.runtime.node) throw new Error("CI Node pin drift");
  const errors = checkWorkflow(fs.readFileSync(".github/workflows/validate.yml", "utf8"), pins);
  if (errors.length) throw new Error(errors.join("; "));
  console.log("CI contract verified: pinned tools, read-only authority, no release publication");
}
