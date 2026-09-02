import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  VALID_PRIORITIES,
  VALID_STATUSES,
  renderStatus,
  validateBoard,
  validateBoardTransition,
} from "../../tools/project/board.mjs";

const directory = path.dirname(fileURLToPath(import.meta.url));
const fixtureDirectory = path.join(directory, "fixtures");

function fixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixtureDirectory, name), "utf8"));
}

function clone(value) {
  return structuredClone(value);
}

function expectError(errors, expected) {
  assert.ok(errors.some((error) => error.includes(expected)), `Esperava erro contendo "${expected}", recebeu:\n${errors.join("\n")}`);
}

test("fixture válida satisfaz todas as invariantes", () => {
  assert.deepEqual(validateBoard(fixture("valid-board.json")), []);
});

for (const [name, expected] of [
  ["invalid-done-without-evidence.json", "done sem evidence"],
  ["invalid-duplicate-id.json", "ID duplicado"],
  ["invalid-missing-focus.json", "currentFocus inexistente"],
  ["invalid-multiple-in-progress.json", "tasks estão in_progress"],
]) {
  test(`fixture inválida é rejeitada: ${name}`, () => {
    expectError(validateBoard(fixture(name)), expected);
  });
}

test("status, dependência, source e fila incoerentes são rejeitados", async (t) => {
  await t.test("status inválido", () => {
    const board = fixture("valid-board.json");
    board.items[1].status = "flying";
    expectError(validateBoard(board), "status inválido");
  });

  await t.test("prioridade inválida", () => {
    const board = fixture("valid-board.json");
    board.items[1].priority = "URGENT";
    expectError(validateBoard(board), "priority inválida");
  });

  await t.test("dependência da task ativa não concluída", () => {
    const board = fixture("valid-board.json");
    board.items[0].status = "planned";
    board.items[0].nextAction = "Concluir dependência.";
    expectError(validateBoard(board), "depende de task não concluída");
  });

  await t.test("source local inexistente", () => {
    const board = fixture("valid-board.json");
    board.items[1].source = "tasks/INEXISTENTE.md";
    expectError(validateBoard(board), "source não existe");
  });

  await t.test("dependência duplicada", () => {
    const board = fixture("valid-board.json");
    board.items[1].dependencies.push("TEST-001");
    expectError(validateBoard(board), "repete a dependência");
  });

  await t.test("task done mantém nextAction", () => {
    const board = fixture("valid-board.json");
    board.items[0].nextAction = "Não deveria existir.";
    expectError(validateBoard(board), "nextAction deve ser null");
  });

  await t.test("campo desconhecido", () => {
    const board = fixture("valid-board.json");
    board.items[1].technicalShortcut = true;
    expectError(validateBoard(board), "não é permitido pelo schema v1");
  });
});

test("transição planned → in_progress é válida", () => {
  const previous = fixture("valid-board.json");
  previous.items[1].status = "planned";
  previous.items[1].updatedAt = "2026-09-02T00:01:30.000Z";

  const next = clone(previous);
  next.items[1].status = "in_progress";
  next.items[1].updatedAt = "2026-09-02T00:04:00.000Z";
  next.updatedAt = "2026-09-02T00:04:00.000Z";

  assert.deepEqual(validateBoard(next), []);
  assert.deepEqual(validateBoardTransition(previous, next), []);
});

test("transição in_progress → done avança o foco com evidência", () => {
  const previous = fixture("valid-board.json");
  const next = clone(previous);
  next.items[1].status = "done";
  next.items[1].updatedAt = "2026-09-02T00:04:00.000Z";
  next.items[1].nextAction = null;
  next.items[1].evidence = ["node --test passou"];
  next.currentFocus = "TEST-003";
  next.updatedAt = "2026-09-02T00:04:00.000Z";

  assert.deepEqual(validateBoard(next), []);
  assert.deepEqual(validateBoardTransition(previous, next), []);
});

test("saltos, reabertura, remoção e timestamps estagnados são rejeitados", async (t) => {
  await t.test("planned → done", () => {
    const previous = fixture("valid-board.json");
    previous.items[1].status = "planned";
    const next = clone(previous);
    next.items[1].status = "done";
    next.items[1].updatedAt = "2026-09-02T00:04:00.000Z";
    next.items[1].nextAction = null;
    next.items[1].evidence = ["evidência"];
    next.currentFocus = "TEST-003";
    next.updatedAt = "2026-09-02T00:04:00.000Z";
    expectError(validateBoardTransition(previous, next), "planned → done");
  });

  await t.test("done → in_progress", () => {
    const previous = fixture("valid-board.json");
    const completed = clone(previous);
    completed.items[1].status = "done";
    completed.items[1].nextAction = null;
    completed.items[1].evidence = ["evidência"];
    completed.items[1].updatedAt = "2026-09-02T00:04:00.000Z";
    completed.currentFocus = "TEST-003";
    completed.updatedAt = "2026-09-02T00:04:00.000Z";

    const reopened = clone(completed);
    reopened.items[1].status = "in_progress";
    reopened.items[1].nextAction = "Reabrir.";
    reopened.items[1].updatedAt = "2026-09-02T00:05:00.000Z";
    reopened.currentFocus = "TEST-002";
    reopened.updatedAt = "2026-09-02T00:05:00.000Z";
    expectError(validateBoardTransition(completed, reopened), "done → in_progress");
  });

  await t.test("task removida", () => {
    const previous = fixture("valid-board.json");
    const next = clone(previous);
    next.items.pop();
    next.updatedAt = "2026-09-02T00:04:00.000Z";
    expectError(validateBoardTransition(previous, next), "task removida");
  });

  await t.test("timestamp do board não avança", () => {
    const previous = fixture("valid-board.json");
    const next = clone(previous);
    next.items[1].title = "Título alterado";
    expectError(validateBoardTransition(previous, next), "board.updatedAt deve avançar");
  });

  await t.test("foco abandona task ativa", () => {
    const previous = fixture("valid-board.json");
    const next = clone(previous);
    next.currentFocus = "TEST-003";
    next.updatedAt = "2026-09-02T00:04:00.000Z";
    expectError(validateBoardTransition(previous, next), "após done ou blocked");
  });

  await t.test("task nova inicia ativa", () => {
    const previous = fixture("valid-board.json");
    const next = clone(previous);
    next.items.push({
      ...clone(next.items[2]),
      id: "TEST-004",
      title: "Task nova",
      status: "in_progress",
      dependencies: ["TEST-001"],
      updatedAt: "2026-09-02T00:04:00.000Z",
    });
    next.updatedAt = "2026-09-02T00:04:00.000Z";
    expectError(validateBoardTransition(previous, next), "task nova deve iniciar como planned");
  });
});

test("STATUS é determinístico e contém somente dados derivados", () => {
  const board = fixture("valid-board.json");
  const first = renderStatus(board);
  const second = renderStatus(clone(board));

  assert.equal(first, second);
  assert.match(first, /^<!-- GENERATED BY npm run project:status/u);
  assert.match(first, /TEST-002 — Task ativa/u);
  assert.match(first, /Concluídas: 1/u);
});

test("schema e validador compartilham os mesmos enums", () => {
  const schemaPath = path.resolve(directory, "..", "..", "docs", "project", "project-board.schema.json");
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  const taskProperties = schema.$defs.task.properties;

  assert.deepEqual(taskProperties.status.enum, VALID_STATUSES);
  assert.deepEqual(taskProperties.priority.enum, VALID_PRIORITIES);
  assert.equal(schema.properties.schemaVersion.const, 1);
});
