import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  loadRotationFile,
  MAX_DOCUMENT_BYTES,
  parseRotationDocument,
  parseRotationText,
  RotationDslError,
  serializeRotationDocument,
} from "../../rotation-lab/dsl/parser.mjs";
import { CAPABILITY, summarizeRotationDocument } from "../../rotation-lab/dsl/schema.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..", "..");
const fixturePath = path.join(projectRoot, "rotation-lab", "fixtures", "neutral-priority.rotation.json");

function fixture() {
  return JSON.parse(fs.readFileSync(fixturePath, "utf8"));
}

function captureValidation(document) {
  try {
    parseRotationDocument(document);
    assert.fail("Era esperada uma falha de validação.");
  } catch (error) {
    assert.ok(error instanceof RotationDslError);
    assert.equal(error.code, "DSL_VALIDATION_FAILED");
    return error;
  }
}

function assertIssue(error, code, path) {
  assert.ok(
    error.issues.some((issue) => issue.code === code && (path === undefined || issue.path === path)),
    `Issue ${code}${path ? ` em ${path}` : ""} não encontrada: ${JSON.stringify(error.issues)}`
  );
}

test("carrega a fixture neutra, congela o resultado e resume as capabilities", () => {
  const document = loadRotationFile("rotation-lab/fixtures/neutral-priority.rotation.json", { root: projectRoot });
  const summary = summarizeRotationDocument(document);
  assert.equal(document.id, "neutral.training_rotation");
  assert.equal(document.lists.length, 2);
  assert.equal(summary.rules, 4);
  assert.deepEqual(summary.capabilities, {
    [CAPABILITY.ADDON_AVAILABLE]: 2,
    [CAPABILITY.CONDITIONALLY_SECRET]: 1,
    [CAPABILITY.SIM_ONLY]: 1,
  });
  assert.equal(Object.isFrozen(document), true);
  assert.equal(Object.isFrozen(document.lists[0].rules[0].when), true);
});

test("canonicaliza listas e prioridades sem mutar a entrada", () => {
  const original = fixture();
  const unordered = structuredClone(original);
  unordered.lists.reverse();
  unordered.lists.find((list) => list.id === "default").rules.reverse();
  const canonical = parseRotationDocument(unordered);

  assert.deepEqual(canonical.lists.map((list) => list.id), ["default", "maintenance"]);
  assert.deepEqual(canonical.lists[0].rules.map((rule) => rule.priority), [10, 20, 30]);
  assert.equal(unordered.lists[0].id, "maintenance");
  assert.equal(serializeRotationDocument(unordered), serializeRotationDocument(original));
});

test("recusa JSON inválido com origem e posição raiz", () => {
  assert.throws(
    () => parseRotationText("{ invalid", { source: "broken.rotation.json" }),
    (error) => error instanceof RotationDslError
      && error.code === "DSL_JSON_INVALID"
      && error.source === "broken.rotation.json"
      && error.issues[0].path === "$"
  );
});

test("rejeita campos desconhecidos e coleta problemas em caminhos distintos", () => {
  const document = fixture();
  document.unexpected = true;
  document.lists[0].rules[0].mystery = "typo";
  const error = captureValidation(document);
  assertIssue(error, "UNKNOWN_FIELD", "$.unexpected");
  assertIssue(error, "UNKNOWN_FIELD", "$.lists[0].rules[0].mystery");
});

test("exige schema suportado, versão semântica e IDs namespaced", () => {
  const document = fixture();
  document.schemaVersion = 2;
  document.version = "draft";
  document.lists[0].rules[0].action = "strike";
  const error = captureValidation(document);
  assertIssue(error, "UNSUPPORTED_SCHEMA_VERSION", "$.schemaVersion");
  assertIssue(error, "INVALID_VERSION", "$.version");
  assertIssue(error, "INVALID_ID", "$.lists[0].rules[0].action");
});

test("rejeita IDs de lista e regra duplicados e prioridades ambíguas", () => {
  const document = fixture();
  document.lists.push(structuredClone(document.lists[0]));
  document.lists[0].rules[1].priority = 10;
  const error = captureValidation(document);
  assertIssue(error, "DUPLICATE_LIST_ID");
  assertIssue(error, "DUPLICATE_RULE_ID");
  assertIssue(error, "DUPLICATE_PRIORITY", "$.lists[0].rules[1].priority");
});

test("exige que o entrypoint identifique uma lista existente", () => {
  const document = fixture();
  document.entrypoint = "missing";
  assertIssue(captureValidation(document), "ENTRYPOINT_NOT_FOUND", "$.entrypoint");
});

test("calcula a capability mais restritiva e recusa declaração incompatível", () => {
  const document = fixture();
  document.lists[0].rules[0].when.conditions[0].value.capability = CAPABILITY.SIM_ONLY;
  const error = captureValidation(document);
  assertIssue(error, "CAPABILITY_MISMATCH", "$.lists[0].rules[0].capability");
  assert.match(error.issues.find((issue) => issue.code === "CAPABILITY_MISMATCH").message, /exige SIM_ONLY/u);
});

test("exige skip_rule para CONDITIONALLY_SECRET", () => {
  const document = fixture();
  delete document.lists[0].rules[1].onUnavailable;
  assertIssue(captureValidation(document), "SAFE_FALLBACK_REQUIRED", "$.lists[0].rules[1].onUnavailable");
});

test("não aceita fallback em regra que não depende de estado protegido", () => {
  const document = fixture();
  document.lists[0].rules[0].onUnavailable = "skip_rule";
  assertIssue(captureValidation(document), "UNEXPECTED_FALLBACK", "$.lists[0].rules[0].onUnavailable");
});

test("valida operadores, caminhos e capabilities nas leituras de estado", () => {
  const document = fixture();
  const comparison = document.lists[0].rules[1].when;
  comparison.operator = "approximately";
  comparison.left.path = ["Target Count"];
  comparison.left.capability = "MAYBE";
  const error = captureValidation(document);
  assertIssue(error, "INVALID_COMPARISON");
  assertIssue(error, "INVALID_STATE_PATH_SEGMENT");
  assertIssue(error, "INVALID_CAPABILITY");
});

test("limita profundidade de condições para documentos não patológicos", () => {
  const document = fixture();
  let condition = { kind: "constant", value: true };
  for (let index = 0; index < 33; index += 1) {
    condition = { kind: "not", condition };
  }
  document.lists[0].rules[0].when = condition;
  assertIssue(captureValidation(document), "CONDITION_DEPTH_LIMIT");
});

test("limita a quantidade de nós em uma única condição", () => {
  const document = fixture();
  document.lists[0].rules[0].when = {
    kind: "all",
    conditions: Array.from({ length: 64 }, () => ({
      kind: "all",
      conditions: Array.from({ length: 8 }, () => ({ kind: "constant", value: true })),
    })),
  };
  assertIssue(captureValidation(document), "CONDITION_NODE_LIMIT");
});

test("recusa texto acima do limite antes de tentar interpretar JSON", () => {
  assert.throws(
    () => parseRotationText(" ".repeat(MAX_DOCUMENT_BYTES + 1)),
    (error) => error instanceof RotationDslError && error.code === "DSL_DOCUMENT_TOO_LARGE"
  );
});

test("carregamento de arquivo recusa extensão e caminho fora do projeto", (t) => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "spynon-dsl-files-"));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const root = path.join(parent, "project");
  fs.mkdirSync(root);
  const outside = path.join(parent, "outside.rotation.json");
  fs.writeFileSync(outside, JSON.stringify(fixture()));
  const wrongExtension = path.join(root, "inside.json");
  fs.writeFileSync(wrongExtension, JSON.stringify(fixture()));

  assert.throws(
    () => loadRotationFile(outside, { root }),
    (error) => error instanceof RotationDslError && error.code === "DSL_FILE_OUTSIDE_PROJECT"
  );
  assert.throws(
    () => loadRotationFile(wrongExtension, { root }),
    (error) => error instanceof RotationDslError && error.code === "DSL_FILE_EXTENSION_INVALID"
  );
});

test("carregamento recusa link que resolve para fora do projeto", (t) => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "spynon-dsl-link-"));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const root = path.join(parent, "project");
  const external = path.join(parent, "external");
  fs.mkdirSync(root);
  fs.mkdirSync(external);
  fs.writeFileSync(path.join(external, "linked.rotation.json"), JSON.stringify(fixture()));
  const link = path.join(root, "linked");
  fs.symlinkSync(external, link, process.platform === "win32" ? "junction" : "dir");

  assert.throws(
    () => loadRotationFile(path.join("linked", "linked.rotation.json"), { root }),
    (error) => error instanceof RotationDslError && error.code === "DSL_FILE_OUTSIDE_PROJECT"
  );
});
