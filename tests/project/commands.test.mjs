import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDirectory, "..", "..");
const validFixture = path.join(testDirectory, "fixtures", "valid-board.json");
const invalidFixture = path.join(testDirectory, "fixtures", "invalid-done-without-evidence.json");
const schema = path.join(root, "docs", "project", "project-board.schema.json");

function makeSandbox(boardFixture = validFixture) {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "spynon-board-"));
  fs.mkdirSync(path.join(sandbox, "docs", "project"), { recursive: true });
  fs.copyFileSync(boardFixture, path.join(sandbox, "project-board.json"));
  fs.copyFileSync(schema, path.join(sandbox, "docs", "project", "project-board.schema.json"));
  return sandbox;
}

function cleanupSandbox(sandbox) {
  const expectedPrefix = path.join(os.tmpdir(), "spynon-board-");
  assert.ok(path.resolve(sandbox).startsWith(path.resolve(expectedPrefix)));
  fs.rmSync(sandbox, { recursive: true, force: true });
}

function run(script, sandbox) {
  return spawnSync(process.execPath, [path.join(root, "tools", "project", script)], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      SPYNON_PROJECT_ROOT: sandbox,
    },
  });
}

test("project:status gera e project:check valida uma visão derivada", () => {
  const sandbox = makeSandbox();
  try {
    const status = run("status.mjs", sandbox);
    assert.equal(status.status, 0, status.stderr);

    const statusPath = path.join(sandbox, "docs", "project", "STATUS.md");
    assert.ok(fs.existsSync(statusPath));
    assert.match(fs.readFileSync(statusPath, "utf8"), /TEST-002 — Task ativa/u);

    const check = run("check.mjs", sandbox);
    assert.equal(check.status, 0, check.stderr);
    assert.match(check.stdout, /Board válido/u);
  } finally {
    cleanupSandbox(sandbox);
  }
});

test("project:check rejeita STATUS editado manualmente", () => {
  const sandbox = makeSandbox();
  try {
    assert.equal(run("status.mjs", sandbox).status, 0);
    const statusPath = path.join(sandbox, "docs", "project", "STATUS.md");
    fs.appendFileSync(statusPath, "\nedição manual\n", "utf8");

    const check = run("check.mjs", sandbox);
    assert.notEqual(check.status, 0);
    assert.match(check.stderr, /dessincronizado/u);
  } finally {
    cleanupSandbox(sandbox);
  }
});

test("project:status não sobrescreve STATUS quando o board é inválido", () => {
  const sandbox = makeSandbox(invalidFixture);
  try {
    const statusPath = path.join(sandbox, "docs", "project", "STATUS.md");
    fs.writeFileSync(statusPath, "sentinela\n", "utf8");

    const status = run("status.mjs", sandbox);
    assert.notEqual(status.status, 0);
    assert.match(status.stderr, /Board inválido/u);
    assert.equal(fs.readFileSync(statusPath, "utf8"), "sentinela\n");
  } finally {
    cleanupSandbox(sandbox);
  }
});
