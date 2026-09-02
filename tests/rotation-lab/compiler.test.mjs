import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { serializeRotationDocument } from "../../rotation-lab/dsl/parser.mjs";
import { CAPABILITY, deriveConditionCapability } from "../../rotation-lab/dsl/schema.mjs";
import { CompilerError } from "../../rotation-lab/compiler/errors.mjs";
import { emitSimcCondition, parseSimcExpression } from "../../rotation-lab/compiler/expression.mjs";
import {
  indexCompilerMap,
  loadCompilerMapFile,
  parseCompilerMapDocument,
} from "../../rotation-lab/compiler/mapping.mjs";
import {
  compileDslToRuntime,
  serializeRuntimeJson,
  serializeRuntimeLua,
} from "../../rotation-lab/compiler/runtime.mjs";
import {
  compileDslToSimc,
  compileSimcToDsl,
  verifySimcRoundTrip,
} from "../../rotation-lab/compiler/simc.mjs";
import { verifyCompilerFixture } from "../../rotation-lab/compiler/verify.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..", "..");
const fixtureDirectory = path.join(projectRoot, "rotation-lab", "fixtures", "compiler", "neutral");
const fixtureConfig = "rotation-lab/fixtures/compiler/neutral/neutral.compiler-fixture.json";
const mappingFile = "rotation-lab/fixtures/compiler/neutral/neutral.compiler-map.json";

function read(file) {
  return fs.readFileSync(path.join(fixtureDirectory, file), "utf8");
}

function rawJson(file) {
  return JSON.parse(read(file));
}

function mapping() {
  return loadCompilerMapFile(mappingFile, { root: projectRoot });
}

function expectedDsl() {
  return rawJson("expected.rotation.json");
}

function captureCompilerError(callback, code) {
  assert.throws(
    callback,
    (error) => error instanceof CompilerError && error.code === code
  );
}

test("valida e indexa um mapa bidirecional neutro", () => {
  const parsed = mapping();
  const indexes = indexCompilerMap(parsed);
  assert.equal(indexes.actionBySimc.get("neutral_strike"), "neutral.strike");
  assert.equal(indexes.simcByAction.get("neutral.strike"), "neutral_strike");
  assert.equal(indexes.stateBySimc.get("target.estimated_count").capability, CAPABILITY.CONDITIONALLY_SECRET);
  assert.equal(Object.isFrozen(parsed.states[0].path), true);
});

test("mapa rejeita aliases não reversíveis e caminhos duplicados", () => {
  const document = rawJson("neutral.compiler-map.json");
  document.actions.push({ simc: "other_strike", dsl: "neutral.strike" });
  document.states.push({
    simc: "other.ready",
    path: [...document.states[0].path],
    capability: CAPABILITY.ADDON_AVAILABLE,
  });
  assert.throws(
    () => parseCompilerMapDocument(document),
    (error) => error instanceof CompilerError
      && error.code === "COMPILER_MAP_INVALID"
      && error.details.issues.some((issue) => issue.code === "DUPLICATE_DSL_ACTION")
      && error.details.issues.some((issue) => issue.code === "DUPLICATE_DSL_STATE")
  );
});

test("parser de expressão respeita precedência lógica e capability mais restritiva", () => {
  const condition = parseSimcExpression(
    "cooldown.neutral_strike.ready|target.estimated_count>=2&simulation.target_time_to_die<=15",
    mapping()
  );
  assert.equal(condition.kind, "any");
  assert.equal(condition.conditions[0].kind, "truthy");
  assert.equal(condition.conditions[1].kind, "all");
  assert.equal(deriveConditionCapability(condition), CAPABILITY.SIM_ONLY);
});

test("negação agrupada é reversível e negação ambígua é recusada", () => {
  const compilerMap = mapping();
  const condition = parseSimcExpression("!(target.estimated_count>=2)", compilerMap);
  assert.equal(condition.kind, "not");
  assert.equal(emitSimcCondition(condition, compilerMap), "!(target.estimated_count>=2)");
  captureCompilerError(
    () => parseSimcExpression("!target.estimated_count>=2", compilerMap),
    "SIMC_NEGATION_AMBIGUOUS"
  );
});

test("expressão recusa sinais não mapeados e aritmética fora do subconjunto", () => {
  const compilerMap = mapping();
  captureCompilerError(() => parseSimcExpression("unknown.signal", compilerMap), "SIMC_STATE_UNMAPPED");
  captureCompilerError(
    () => parseSimcExpression("resource.neutral_energy+1", compilerMap),
    "SIMC_EXPRESSION_TOKEN_UNSUPPORTED"
  );
});

test("normaliza a baseline SimC para a DSL dourada", () => {
  const actual = compileSimcToDsl(read("baseline.simc"), mapping(), { source: "baseline.simc" });
  assert.equal(serializeRotationDocument(actual), serializeRotationDocument(expectedDsl()));
  assert.deepEqual(actual.lists[0].rules.map((rule) => rule.priority), [10, 20, 30]);
  assert.equal(actual.lists[0].rules[1].onUnavailable, "skip_rule");
});

test("importação recusa modifiers, resets e actions não mapeadas", () => {
  const compilerMap = mapping();
  captureCompilerError(
    () => compileSimcToDsl("actions=neutral_strike", compilerMap),
    "SIMC_ACTION_LINE_UNSUPPORTED"
  );
  captureCompilerError(
    () => compileSimcToDsl("actions=/neutral_strike,target_if=min:remains", compilerMap),
    "SIMC_ACTION_MODIFIER_UNSUPPORTED"
  );
  captureCompilerError(
    () => compileSimcToDsl("actions=/neutral_strike\nactions=/neutral_cleave", compilerMap),
    "SIMC_LIST_RESET_UNSUPPORTED"
  );
  captureCompilerError(
    () => compileSimcToDsl("actions=/not_mapped", compilerMap),
    "SIMC_ACTION_UNMAPPED"
  );
});

test("exporta SimC canônico e preserva o round-trip", () => {
  const compilerMap = mapping();
  const document = expectedDsl();
  assert.equal(compileDslToSimc(document, compilerMap), read("expected.normalized.simc"));
  assert.equal(verifySimcRoundTrip(document, compilerMap).equal, true);
});

test("exportação recusa condição DSL sem equivalente reversível", () => {
  const document = expectedDsl();
  document.lists[0].rules[0].when = {
    kind: "exists",
    value: {
      kind: "state",
      path: ["cooldowns", "neutral.strike", "ready"],
      capability: CAPABILITY.ADDON_AVAILABLE,
    },
  };
  captureCompilerError(() => compileDslToSimc(document, mapping()), "DSL_EXISTS_UNSUPPORTED_BY_SIMC");
});

test("compila bytecode de runtime e registra exclusão SIM_ONLY", () => {
  const bundle = compileDslToRuntime(expectedDsl(), mapping());
  assert.equal(bundle.source.sha256, "0B04C5D3EDB81F7E078C430E657598437D6476C0BFB4B394F88016088FE92E1D");
  assert.equal(bundle.lists[0].rules.length, 2);
  assert.equal(bundle.lists[0].rules[1].onUnavailable, "skip_rule");
  assert.deepEqual(bundle.lists[0].rules[0].program.map((instruction) => instruction.op), [
    "READ_STATE",
    "TRUTHY",
    "READ_STATE",
    "PUSH_LITERAL",
    "COMPARE",
    "ALL",
  ]);
  assert.deepEqual(bundle.excludedRules, [{
    list: "default",
    rule: "neutral.default_execute_1",
    action: "neutral.execute",
    reason: "SIM_ONLY",
  }]);
  assert.equal(serializeRuntimeJson(bundle), read("expected.runtime.json"));
  assert.equal(serializeRuntimeLua(bundle), read("expected.runtime.lua"));
});

test("bundle e digest independem da ordem física da DSL", () => {
  const first = expectedDsl();
  const second = structuredClone(first);
  second.lists.reverse();
  for (const list of second.lists) {
    list.rules.reverse();
  }
  const firstBundle = compileDslToRuntime(first, mapping());
  const secondBundle = compileDslToRuntime(second, mapping());
  assert.equal(secondBundle.source.sha256, firstBundle.source.sha256);
  assert.equal(serializeRuntimeJson(secondBundle), serializeRuntimeJson(firstBundle));
});

test("runtime recusa capability divergente entre mapa e DSL", () => {
  const mapDocument = rawJson("neutral.compiler-map.json");
  mapDocument.states.find((entry) => entry.simc === "target.estimated_count").capability = CAPABILITY.ADDON_AVAILABLE;
  const divergentMap = parseCompilerMapDocument(mapDocument);
  captureCompilerError(
    () => compileDslToRuntime(expectedDsl(), divergentMap),
    "RUNTIME_STATE_CAPABILITY_MISMATCH"
  );
});

test("verificador confirma todos os golden files da fixture", () => {
  const result = verifyCompilerFixture(fixtureConfig, { root: projectRoot });
  assert.equal(result.ok, true);
  assert.equal(result.runtimeRules, 3);
  assert.equal(result.excludedRules, 1);
});

test("verificador aponta artefato e primeira linha divergente", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "spynon-compiler-drift-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const copiedDirectory = path.join(root, "fixture");
  fs.cpSync(fixtureDirectory, copiedDirectory, { recursive: true });
  fs.appendFileSync(path.join(copiedDirectory, "expected.normalized.simc"), "# drift\n");

  assert.throws(
    () => verifyCompilerFixture("fixture/neutral.compiler-fixture.json", { root }),
    (error) => error instanceof CompilerError
      && error.code === "COMPILER_GOLDEN_DIVERGENCE"
      && error.details.artifact === "simc"
      && Number.isInteger(error.details.line)
  );
});
