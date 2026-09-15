import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {checkWorkflow, check} from "../../tools/ci/check.mjs";
import {validateSequence} from "../../tools/ci/history.mjs";
const workflow = fs.readFileSync(".github/workflows/validate.yml", "utf8");
const pins = JSON.parse(fs.readFileSync("tools/ci/pins.json", "utf8"));
test("CI pins and complete workflow contract agree with the local toolchain", () => {
  assert.deepEqual(checkWorkflow(workflow, pins), []); assert.doesNotThrow(check);
});
test("CI rejects floating actions elevated permissions and secret exposure", () => {
  for (const changed of [workflow.replace(pins.actions["actions/checkout"], "main"),
    workflow.replace("contents: read", "contents: write"), `${workflow}\nsecrets.TOKEN`, `${workflow}\npull_request_target:`]) {
    assert.ok(checkWorkflow(changed, pins).length > 0);
  }
});
test("CI rejects publishing commands ignored failures and missing headless execution", () => {
  for (const changed of [`${workflow}\nrun: gh release create x`, `${workflow}\ncontinue-on-error: true`,
    workflow.replace("npm run wowless:run", "echo skipped")]) assert.ok(checkWorkflow(changed, pins).length > 0);
});
test("history validates every committed board transition rather than only final HEAD", () => {
  const board = JSON.parse(fs.readFileSync("project-board.json", "utf8"));
  assert.deepEqual(validateSequence([board, structuredClone(board)]), []);
  const bad = structuredClone(board); bad.items.find((item) => item.status === "done").status = "planned";
  assert.ok(validateSequence([board, bad]).length > 0);
});
test("history cannot hide a broken intermediate board behind a valid final board", () => {
  const board = JSON.parse(fs.readFileSync("project-board.json", "utf8"));
  const bad = structuredClone(board); bad.currentFocus = "MISSING-001";
  assert.ok(validateSequence([board, bad, board]).length > 0);
});
