import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { readPins, classify, runtimeArgs, inputDigest } from "../../tools/wowless/runner.mjs";

const log = "[0.123] done loading SpynonRotation\n[0.234] done loading SpynonHeadlessProbe\n";
const probe = 'SpynonHeadlessProbeResult = "PASS:BOOTSTRAP_SMOKE:HEADLESS_ONLY"\n';
test("Wowless recipe uses immutable source base and historical apt snapshot", () => {
  const pins = readPins(); assert.equal(pins.commit.length, 40); assert.equal(pins.interface, 120100);
  assert.equal(pins.wowlessBuild, "12.1.0.69497"); assert.equal(pins.retailValidation, "PENDING");
});
test("successful headless result needs loading evidence and explicit probe completion", () => {
  const result = classify(log, probe); assert.equal(result.status, "PASS");
  assert.equal(result.retailValidation, "PENDING"); assert.equal(classify("", probe).status, "FAIL");
  assert.equal(classify(log, "").status, "FAIL"); assert.equal(classify(log, "PENDING").status, "FAIL");
});
test("upstream exit zero with errors or maxerrors is not a successful test", () => {
  assert.equal(classify(`${log}[0.456] error: fixture\n`, probe, 0).status, "FAIL");
  assert.equal(classify(`${log}[0.456] maxerrors reached, quitting\n`, probe, 0).status, "FAIL");
  assert.equal(classify(log, probe, 1).status, "FAIL");
  assert.equal(classify(`${log}[0.456] warning: fixture\n`, probe).warnings, 1);
});
test("probe data is matched as text and never evaluated as code", () => {
  assert.equal(classify(log, "SpynonHeadlessProbeResult = PASS:BOOTSTRAP_SMOKE:HEADLESS_ONLY\n").status, "PASS");
  assert.equal(classify(log, "SpynonHeadlessProbeResult = PASS:BOOTSTRAP_SMOKE:HEADLESS_ONLY_extra\n").status, "FAIL");
  assert.equal(classify(log, `print('${probe.replaceAll("\n", "")}')`).status, "FAIL");
  assert.equal(classify(log, 'SpynonHeadlessProbeResult = "PASS"').status, "FAIL");
});
test("runtime mounts only addon probe and unique output with no network or privilege", () => {
  const args = runtimeArgs(readPins(), `sha256:${"a".repeat(64)}`, "/output/run-123", "/project/addon", "/probe");
  assert.equal(args[args.indexOf("--network") + 1], "none"); assert.ok(args.includes("--read-only"));
  assert.equal(args[args.indexOf("--cap-drop") + 1], "ALL"); assert.ok(args.includes("no-new-privileges"));
  const mounts = args.filter((value) => value.startsWith("type=bind,"));
  assert.equal(mounts.length, 3); assert.equal(mounts.filter((value) => value.endsWith(",readonly")).length, 2);
  assert.ok(!args.includes("--privileged")); assert.ok(!args.includes("--env-file"));
});
test("moving image tags and unsafe mount delimiters are rejected", () => {
  assert.throws(() => runtimeArgs(readPins(), "latest", "/out", "/addon", "/probe"), /immutable image/u);
  assert.throws(() => runtimeArgs(readPins(), `sha256:${"a".repeat(64)}`, "/out", "/addon,other", "/probe"), /mount path/u);
});
test("input evidence includes the complete runtime and remains deterministic", () => {
  const first = inputDigest("addon");
  const expected = fs.readdirSync("addon", {recursive: true, withFileTypes: true}).filter((entry) => entry.isFile()).length;
  assert.equal(first.files, expected); assert.ok(first.files >= 78);
  assert.match(first.sha256, /^[A-F0-9]{64}$/u); assert.deepEqual(inputDigest("addon"), first);
  assert.equal(inputDigest("tests/headless/SpynonHeadlessProbe").files, 2);
});
