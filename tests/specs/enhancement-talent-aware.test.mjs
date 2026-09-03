import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { loadEnhancementCatalog } from "../../specs/shaman/enhancement/catalog.mjs";
import {
  actionAvailability,
  compileTalentAwareMatrix,
  parseSimcTalentLog,
  simplifyTalentCondition,
  TALENT_AWARE_STUDY,
  TALENT_MATRIX,
  TALENT_SNAPSHOTS,
} from "../../specs/shaman/enhancement/talent-aware.mjs";

const CATALOG_FILE = "specs/shaman/enhancement/catalog.json";
const BASELINE_FILE = "specs/shaman/enhancement/baseline/baseline.rotation.json";

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function snapshot(heroTreeId, spellIds) {
  return {
    heroTree: { id: heroTreeId },
    activeSpellRanks: spellIds.map((spellId) => ({ spellId, talentId: `test.${spellId}`, rank: 1 })),
  };
}

function containsTalentState(value) {
  if (!value || typeof value !== "object") return false;
  if (value.kind === "state" && value.path?.[0] === "talents") return true;
  return Object.values(value).some((child) => (
    Array.isArray(child) ? child.some(containsTalentState) : containsTalentState(child)
  ));
}

test("extrai ranks positivos e rejeita entries de outra Hero Tree", () => {
  const catalog = loadEnhancementCatalog(CATALOG_FILE);
  const log = [
    "Player 'Fixture' adding hero talent Surging Totem (node=94877 entry=117474 rank=1/1)",
    "Player 'Fixture' adding hero talent Tempest (node=94892 entry=117489 rank=1/1)",
    "Player 'Fixture' adding spec talent Storm Unleashed (node=110401 entry=136971 rank=0/1)",
    "Player 'Fixture' setting talent Storm Unleashed (spell_id=1262761, trait_node_entry_id=136970) rank 2 effect id 1",
  ].join("\n");
  const result = parseSimcTalentLog(log, catalog, "enhancement.totemic");
  assert.deepEqual(
    result.activeSpellRanks.map((entry) => entry.talentId),
    ["enhancement.surging_totem", "enhancement.storm_unleashed_maelstrom"]
  );
  assert.deepEqual(result.ignoredHeroTalents.map((entry) => entry.talentId), ["enhancement.tempest"]);
});

test("disponibilidade aplica required, any, forbidden e Hero Tree", () => {
  const catalog = loadEnhancementCatalog(CATALOG_FILE);
  const actions = new Map(catalog.actions.map((entry) => [entry.id, entry]));
  const totemic = snapshot("enhancement.totemic", [455630, 470057]);
  assert.equal(actionAvailability(actions.get("enhancement.surging_totem"), totemic).available, true);
  assert.equal(actionAvailability(actions.get("enhancement.tempest"), totemic).available, false);
  assert.equal(actionAvailability(actions.get("enhancement.flame_shock"), totemic).available, false);
  assert.equal(actionAvailability(actions.get("enhancement.voltaic_blaze"), totemic).available, true);
  assert.equal(actionAvailability(actions.get("enhancement.windstrike"), totemic).available, false);
});

test("redução estática remove falso sem consumir estado dinâmico", () => {
  const talent = {
    kind: "truthy",
    value: { kind: "state", path: ["talents", "enhancement.splitstream", "enabled"], capability: "ADDON_AVAILABLE" },
  };
  const dynamic = {
    kind: "truthy",
    value: { kind: "state", path: ["auras", "enhancement.hot_hand", "active"], capability: "CONDITIONALLY_SECRET" },
  };
  const all = simplifyTalentCondition({ kind: "all", conditions: [talent, dynamic] }, new Set());
  assert.equal(all.known, true);
  assert.deepEqual(all.node, { kind: "constant", value: false });
  const any = simplifyTalentCondition({ kind: "any", conditions: [talent, dynamic] }, new Set());
  assert.equal(any.known, false);
  assert.deepEqual(any.node, dynamic);
});

test("golden seleciona listas e ações compatíveis para as duas builds", () => {
  const study = readJson(TALENT_AWARE_STUDY);
  const catalog = loadEnhancementCatalog(CATALOG_FILE);
  const baseline = readJson(BASELINE_FILE);
  const snapshots = readJson(TALENT_SNAPSHOTS);
  const actual = compileTalentAwareMatrix(study, catalog, baseline, snapshots);
  assert.deepEqual(actual, readJson(TALENT_MATRIX));

  const builds = new Map(actual.builds.map((entry) => [entry.id, entry]));
  const stormbringer = builds.get("enhancement.build.stormbringer");
  const totemic = builds.get("enhancement.build.totemic");
  assert.deepEqual(stormbringer.contexts.map((entry) => entry.sourceList), ["single_sb", "aoe"]);
  assert.deepEqual(totemic.contexts.map((entry) => entry.sourceList), ["single_totemic", "aoe"]);
  assert.equal(stormbringer.availableActions.includes("enhancement.tempest"), true);
  assert.equal(stormbringer.availableActions.includes("enhancement.surging_totem"), false);
  assert.equal(totemic.availableActions.includes("enhancement.tempest"), false);
  assert.equal(totemic.availableActions.includes("enhancement.surging_totem"), true);

  for (const build of actual.builds) {
    const available = new Set(build.availableActions);
    for (const context of build.contexts) {
      assert.equal(context.activeRules.every((rule) => available.has(rule.action)), true);
      assert.equal(context.activeRules.some((rule) => containsTalentState(rule.when)), false);
      assert.deepEqual(
        context.activeRules.map((rule) => rule.priority),
        [...context.activeRules].map((rule) => rule.priority).sort((left, right) => left - right)
      );
    }
  }
});

test("probes removem ações talentadas e restauram Flame Shock", () => {
  const matrix = readJson(TALENT_MATRIX);
  const probes = new Map(matrix.probes.map((entry) => [entry.id, entry]));
  assert.equal(
    probes.get("enhancement.probe.stormbringer_without_tempest").availableActions.includes("enhancement.tempest"),
    false
  );
  assert.equal(
    probes.get("enhancement.probe.totemic_without_surging_totem").availableActions.includes("enhancement.surging_totem"),
    false
  );
  const replacement = probes.get("enhancement.probe.totemic_without_voltaic_blaze").availableActions;
  assert.equal(replacement.includes("enhancement.voltaic_blaze"), false);
  assert.equal(replacement.includes("enhancement.flame_shock"), true);
});
