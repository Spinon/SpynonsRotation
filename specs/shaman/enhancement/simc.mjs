import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { EnhancementCatalogError } from "./errors.mjs";

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").toUpperCase();
}

function integerField(block, name) {
  const match = block.match(new RegExp(`^${name.replaceAll(".", "\\.")}\\s*:\\s*(\\d+)\\s*$`, "mu"));
  return match ? Number(match[1]) : null;
}

function textField(block, name) {
  const match = block.match(new RegExp(`^${name.replaceAll(".", "\\.")}\\s*:\\s*(.*?)\\s*$`, "mu"));
  return match ? match[1] : null;
}

export function parseSimcTalentOutput(output) {
  const talents = new Map();
  for (const block of output.split(/\r?\n\s*\r?\n/u)) {
    const entryId = integerField(block, "Entry");
    if (entryId === null) {
      continue;
    }
    const treeText = textField(block, "Tree");
    talents.set(entryId, {
      name: textField(block, "Name"),
      entryId,
      nodeId: integerField(block, "Node"),
      definitionId: integerField(block, "Definition"),
      tree: treeText?.match(/^([a-z]+)/u)?.[1] ?? null,
      maxRanks: integerField(block, "Max Rank"),
      spellId: integerField(block, "Spell"),
      replacesSpellId: integerField(block, "Replaces"),
      subTreeId: integerField(block, "Subtree"),
      selectionIndex: integerField(block, "Sel. Index"),
    });
  }
  return talents;
}

export function parseSimcSpellOutput(output) {
  const match = output.match(/^Name\s*:\s*(.*?)\s+\(id=(\d+)\)/mu);
  return match
    ? { name: match[1].replace(/\s+\(desc=.*\)$/u, ""), spellId: Number(match[2]) }
    : null;
}

function mismatch(issues, subject, field, expected, actual) {
  if (expected !== actual) {
    issues.push({ subject, field, expected, actual });
  }
}

export function verifySimcEvidence(catalog, { talentOutput, spellOutputs }) {
  const issues = [];
  const talents = parseSimcTalentOutput(talentOutput);
  for (const talent of catalog.talents) {
    const actual = talents.get(talent.entryId);
    if (!actual) {
      issues.push({ subject: talent.id, field: "entryId", expected: talent.entryId, actual: null });
      continue;
    }
    mismatch(issues, talent.id, "name", talent.name, actual.name);
    mismatch(issues, talent.id, "nodeId", talent.nodeId, actual.nodeId);
    mismatch(issues, talent.id, "definitionId", talent.definitionId, actual.definitionId);
    mismatch(issues, talent.id, "tree", talent.tree, actual.tree);
    mismatch(issues, talent.id, "maxRanks", talent.maxRanks, actual.maxRanks);
    mismatch(issues, talent.id, "spellId", talent.spellId, actual.spellId);
    mismatch(issues, talent.id, "replacesSpellId", talent.replacesSpellId ?? null, actual.replacesSpellId);
    mismatch(issues, talent.id, "selectionIndex", talent.selectionIndex, actual.selectionIndex);
    mismatch(issues, talent.id, "subTreeId",
      talent.heroTreeId ? catalog.heroTrees.find((tree) => tree.id === talent.heroTreeId).subTreeId : 0,
      actual.subTreeId);
  }
  for (const heroTree of catalog.heroTrees) {
    const actual = talents.get(heroTree.selectionEntryId);
    if (!actual) {
      issues.push({
        subject: heroTree.id,
        field: "selectionEntryId",
        expected: heroTree.selectionEntryId,
        actual: null,
      });
      continue;
    }
    mismatch(issues, heroTree.id, "selectionNodeId", heroTree.selectionNodeId, actual.nodeId);
    mismatch(issues, heroTree.id, "subTreeId", heroTree.subTreeId, actual.subTreeId);
    mismatch(issues, heroTree.id, "tree", "selection", actual.tree);
    mismatch(issues, heroTree.id, "selectionIndex", heroTree.selectionIndex, actual.selectionIndex);
  }

  const expectedSpells = new Map();
  for (const entry of [...catalog.actions, ...catalog.auras]) {
    const prior = expectedSpells.get(entry.spellId);
    if (prior && prior !== entry.label) {
      issues.push({ subject: entry.id, field: "label", expected: prior, actual: entry.label });
    } else {
      expectedSpells.set(entry.spellId, entry.label);
    }
  }
  for (const [spellId, expectedName] of expectedSpells) {
    const actual = parseSimcSpellOutput(spellOutputs.get(spellId) ?? "");
    if (!actual) {
      issues.push({ subject: `spell:${spellId}`, field: "spellId", expected: spellId, actual: null });
      continue;
    }
    mismatch(issues, `spell:${spellId}`, "spellId", spellId, actual.spellId);
    mismatch(issues, `spell:${spellId}`, "name", expectedName, actual.name);
  }

  if (issues.length > 0) {
    throw new EnhancementCatalogError(
      "CATALOG_SIMC_MISMATCH",
      `O catálogo diverge do DBC pinado em ${issues.length} campo(s).`,
      { issues }
    );
  }
  return { talents: catalog.talents.length, heroTrees: catalog.heroTrees.length, spells: expectedSpells.size };
}

function querySimc(executable, query, requiredPattern) {
  let lastResult;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const result = spawnSync(executable, [query], {
      encoding: "utf8",
      timeout: 15_000,
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
    });
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    if (!result.error && result.status === 0 && requiredPattern.test(output)) {
      return output;
    }
    lastResult = { result, output, attempt };
  }
  const { result, output, attempt } = lastResult;
  throw new EnhancementCatalogError(
    "CATALOG_SIMC_QUERY_FAILED",
    `SimulationCraft não produziu uma resposta válida em ${query} após ${attempt} tentativas: `
      + `${result.error?.message ?? (output.trim() || `exit ${result.status}`)}`,
    { query, status: result.status, attempts: attempt }
  );
}

export function verifyPinnedSimcCatalog(catalog, { root = process.cwd() } = {}) {
  const pinsPath = path.join(root, "tools", "toolchain", "pins.json");
  const pins = JSON.parse(fs.readFileSync(pinsPath, "utf8"));
  const pin = pins.simulationCraft;
  const source = catalog.sources;
  const expectedWowVersion = `${source.wowVersion}.${source.wowBuild}`;
  const pinIssues = [];
  mismatch(pinIssues, "sources", "simcVersion", source.simcVersion, pin.version);
  mismatch(pinIssues, "sources", "wowVersion", expectedWowVersion, pin.wowVersion);
  mismatch(pinIssues, "sources", "simcEngineCommit", source.simcEngineCommit, pin.engineCommit);
  mismatch(pinIssues, "sources", "interface", source.interface, pins.wowRetail.interface);
  if (pinIssues.length > 0) {
    throw new EnhancementCatalogError(
      "CATALOG_PIN_MISMATCH",
      "As fontes do catálogo divergem dos pins do repositório.",
      { issues: pinIssues }
    );
  }

  const executable = path.resolve(root, pin.executable);
  if (!fs.statSync(executable, { throwIfNoEntry: false })?.isFile()) {
    throw new EnhancementCatalogError("CATALOG_SIMC_MISSING", `SimulationCraft pinado não encontrado: ${pin.executable}`);
  }
  const executableSha256 = sha256File(executable);
  if (executableSha256 !== pin.executableSha256) {
    throw new EnhancementCatalogError(
      "CATALOG_SIMC_HASH_MISMATCH",
      `SHA-256 do SimulationCraft diverge: esperado ${pin.executableSha256}, obtido ${executableSha256}.`
    );
  }

  const talentOutput = querySimc(executable, "spell_query=talent.class=shaman", /^Entry\s*:/mu);
  const versionLabel = source.simcVersion.replace(".", "-");
  const header = `SimulationCraft ${versionLabel} for World of Warcraft ${expectedWowVersion} Live`;
  if (!talentOutput.includes(header)
    || !talentOutput.includes(`hotfix ${source.simcHotfixDate}`)
    || !talentOutput.includes(source.simcEngineCommit.slice(0, 7))) {
    throw new EnhancementCatalogError(
      "CATALOG_SIMC_IDENTITY_MISMATCH",
      "A identidade reportada pelo SimulationCraft não corresponde às fontes do catálogo."
    );
  }

  const spellIds = [...new Set([...catalog.actions, ...catalog.auras].map((entry) => entry.spellId))]
    .sort((left, right) => left - right);
  const spellOutputs = new Map();
  for (const spellId of spellIds) {
    const query = `spell_query=spell.id=${spellId}`;
    spellOutputs.set(spellId, querySimc(executable, query, new RegExp(`^Name\\s*:.*\\(id=${spellId}\\)`, "mu")));
  }
  const result = verifySimcEvidence(catalog, { talentOutput, spellOutputs });
  return { ...result, executableSha256, engineCommit: pin.engineCommit, wowBuild: source.wowBuild };
}
