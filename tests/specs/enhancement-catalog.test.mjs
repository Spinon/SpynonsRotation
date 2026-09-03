import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  loadEnhancementCatalog,
  parseEnhancementCatalog,
  validateEnhancementCatalog,
} from "../../specs/shaman/enhancement/catalog.mjs";
import { EnhancementCatalogError } from "../../specs/shaman/enhancement/errors.mjs";
import { serializeEnhancementCatalogLua } from "../../specs/shaman/enhancement/runtime.mjs";
import {
  parseSimcSpellOutput,
  parseSimcTalentOutput,
  verifySimcEvidence,
} from "../../specs/shaman/enhancement/simc.mjs";
import {
  CATALOG_FILE,
  RUNTIME_FILE,
  verifyEnhancementCatalog,
} from "../../specs/shaman/enhancement/verify.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..", "..");
const catalog = loadEnhancementCatalog(CATALOG_FILE, { root: projectRoot });

function mutableCatalog() {
  return structuredClone(catalog);
}

function expectCatalogIssue(callback, code) {
  assert.throws(
    callback,
    (error) => error instanceof EnhancementCatalogError
      && error.code === "CATALOG_INVALID"
      && error.details.issues.some((entry) => entry.code === code)
  );
}

function syntheticTalentOutput(document) {
  const blocks = document.talents.map((entry) => {
    const subTreeId = entry.heroTreeId
      ? document.heroTrees.find((tree) => tree.id === entry.heroTreeId).subTreeId
      : 0;
    return [
      `Name         : ${entry.name}`,
      `Entry        : ${entry.entryId}`,
      `Node         : ${entry.nodeId}`,
      `Definition   : ${entry.definitionId}`,
      `Tree         : ${entry.tree} (1)`,
      `Max Rank     : ${entry.maxRanks}`,
      `Spell        : ${entry.spellId}`,
      ...(entry.replacesSpellId ? [`Replaces     : ${entry.replacesSpellId}`] : []),
      `Subtree      : ${subTreeId}`,
      `Sel. Index   : ${entry.selectionIndex}`,
    ].join("\n");
  });
  for (const heroTree of document.heroTrees) {
    blocks.push([
      "Name         : 0",
      `Entry        : ${heroTree.selectionEntryId}`,
      `Node         : ${heroTree.selectionNodeId}`,
      "Definition   : 0",
      "Tree         : selection (4)",
      "Max Rank     : 1",
      "Spell        : 0",
      `Subtree      : ${heroTree.subTreeId}`,
      `Sel. Index   : ${heroTree.selectionIndex}`,
    ].join("\n"));
  }
  return `${blocks.join("\n\n")}\n`;
}

function syntheticSpellOutputs(document) {
  const outputs = new Map();
  for (const entry of [...document.actions, ...document.auras]) {
    outputs.set(entry.spellId, `Name             : ${entry.label} (id=${entry.spellId}) [Spell Family (11)]\n`);
  }
  return outputs;
}

test("carrega o catálogo canônico, completo e imutável", () => {
  assert.equal(catalog.id, "shaman.enhancement");
  assert.equal(catalog.actions.length, 18);
  assert.equal(catalog.talents.length, 79);
  assert.equal(catalog.heroTrees.length, 2);
  assert.equal(catalog.resources.length, 2);
  assert.equal(catalog.auras.length, 10);
  assert.equal(Object.isFrozen(catalog.talents[0]), true);
});

test("parser recusa JSON inválido com diagnóstico estável", () => {
  assert.throws(
    () => parseEnhancementCatalog("{", "broken.json"),
    (error) => error instanceof EnhancementCatalogError
      && error.code === "CATALOG_JSON_INVALID"
      && error.message.includes("broken.json")
  );
});

test("schema recusa campos desconhecidos", () => {
  const document = mutableCatalog();
  document.actions[0].priority = 1;
  expectCatalogIssue(() => validateEnhancementCatalog(document), "UNKNOWN_FIELD");
});

test("schema recusa identidades duplicadas e ordem física instável", () => {
  const document = mutableCatalog();
  document.actions[1].id = document.actions[0].id;
  expectCatalogIssue(() => validateEnhancementCatalog(document), "DUPLICATE");

  const reordered = mutableCatalog();
  reordered.talents.reverse();
  expectCatalogIssue(() => validateEnhancementCatalog(reordered), "ORDER");
});

test("disponibilidade só referencia talentos e Hero Trees catalogados", () => {
  const unknownTalent = mutableCatalog();
  unknownTalent.actions[0].availability.requiredTalentSpellIds = [9999999];
  expectCatalogIssue(() => validateEnhancementCatalog(unknownTalent), "UNKNOWN_TALENT");

  const unknownHeroTree = mutableCatalog();
  unknownHeroTree.actions[0].availability.heroTreeId = "enhancement.unknown";
  expectCatalogIssue(() => validateEnhancementCatalog(unknownHeroTree), "UNKNOWN_HERO_TREE");
});

test("resource de stacks precisa apontar para uma aura catalogada", () => {
  const document = mutableCatalog();
  document.resources[0].auraId = 9999999;
  expectCatalogIssue(() => validateEnhancementCatalog(document), "UNKNOWN_AURA");
});

test("mana e Maelstrom Weapon usam modelos distintos", () => {
  assert.deepEqual(catalog.resources.map((entry) => entry.kind), ["aura_stacks", "power"]);
  assert.equal(catalog.resources[0].auraId, 344179);
  assert.equal(catalog.resources[0].maxStacks, 10);
  assert.equal(catalog.resources[1].powerType, 0);
});

test("serialização Lua é determinística e corresponde ao artefato versionado", () => {
  const first = serializeEnhancementCatalogLua(catalog);
  const second = serializeEnhancementCatalogLua(loadEnhancementCatalog(CATALOG_FILE, { root: projectRoot }));
  assert.equal(first, second);
  assert.equal(first, fs.readFileSync(path.join(projectRoot, RUNTIME_FILE), "utf8"));
  assert.equal(verifyEnhancementCatalog({ root: projectRoot }).ok, true);
});

test("verificador localiza a primeira linha de drift no artefato Lua", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "spynon-enhancement-catalog-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, path.dirname(CATALOG_FILE)), { recursive: true });
  fs.mkdirSync(path.join(root, path.dirname(RUNTIME_FILE)), { recursive: true });
  fs.copyFileSync(path.join(projectRoot, CATALOG_FILE), path.join(root, CATALOG_FILE));
  fs.writeFileSync(path.join(root, RUNTIME_FILE), "-- drift\n", "utf8");
  assert.throws(
    () => verifyEnhancementCatalog({ root }),
    (error) => error instanceof EnhancementCatalogError
      && error.code === "CATALOG_RUNTIME_DIVERGENCE"
      && error.details.line === 1
  );
});

test("parsers extraem as identidades técnicas do formato SimC", () => {
  const talents = parseSimcTalentOutput(syntheticTalentOutput(catalog));
  assert.equal(talents.get(101799).name, "Flurry");
  assert.equal(talents.get(117489).subTreeId, 55);
  assert.deepEqual(
    parseSimcSpellOutput("Name : Stormstrike (id=17364) [Spell Family (11)]\n"),
    { name: "Stormstrike", spellId: 17364 }
  );
  assert.deepEqual(
    parseSimcSpellOutput("Name : Windfury Weapon (desc=Weapon Imbue) (id=33757)\n"),
    { name: "Windfury Weapon", spellId: 33757 }
  );
});

test("evidência SimC aceita paridade exata e rejeita drift de nome", () => {
  const talentOutput = syntheticTalentOutput(catalog);
  const spellOutputs = syntheticSpellOutputs(catalog);
  const result = verifySimcEvidence(catalog, { talentOutput, spellOutputs });
  assert.equal(result.talents, 79);
  assert.equal(result.spells, 27);

  spellOutputs.set(17364, "Name : Wrong Strike (id=17364)\n");
  assert.throws(
    () => verifySimcEvidence(catalog, { talentOutput, spellOutputs }),
    (error) => error instanceof EnhancementCatalogError
      && error.code === "CATALOG_SIMC_MISMATCH"
      && error.details.issues.some((entry) => entry.subject === "spell:17364" && entry.field === "name")
  );
});
