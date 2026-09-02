import assert from "node:assert/strict";
import test from "node:test";
import { evaluateSyncState } from "../../tools/project/sync.mjs";

const base = {
  branch: "main",
  upstream: "origin/main",
  ahead: 0,
  behind: 0,
  dirty: false,
};

test("sync não altera branch já sincronizada", () => {
  assert.equal(evaluateSyncState(base), "none");
});

test("sync permite somente pull fast-forward em working tree limpo", () => {
  assert.equal(evaluateSyncState({ ...base, behind: 2 }), "pull");
});

test("sync rejeita divergência", () => {
  assert.throws(
    () => evaluateSyncState({ ...base, ahead: 1, behind: 1 }),
    /branch divergente/u,
  );
});

test("sync rejeita branch atrasada com working tree sujo", () => {
  assert.throws(
    () => evaluateSyncState({ ...base, behind: 1, dirty: true }),
    /working tree possui alterações/u,
  );
});

test("sync aceita commits locais quando remote não avançou", () => {
  assert.equal(evaluateSyncState({ ...base, ahead: 3 }), "none");
});

test("sync rejeita contadores inválidos", () => {
  assert.throws(
    () => evaluateSyncState({ ...base, behind: -1 }),
    /contadores Git inválidos/u,
  );
});
