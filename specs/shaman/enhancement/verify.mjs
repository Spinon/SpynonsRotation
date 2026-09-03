import fs from "node:fs";
import path from "node:path";
import { loadEnhancementCatalog } from "./catalog.mjs";
import { EnhancementCatalogError } from "./errors.mjs";
import { serializeEnhancementCatalogLua } from "./runtime.mjs";

export const CATALOG_FILE = "specs/shaman/enhancement/catalog.json";
export const RUNTIME_FILE = "addon/Classes/Shaman/Enhancement/CatalogData.lua";

function firstDifferentLine(expected, actual) {
  const expectedLines = expected.split("\n");
  const actualLines = actual.split("\n");
  const length = Math.max(expectedLines.length, actualLines.length);
  for (let index = 0; index < length; index += 1) {
    if (expectedLines[index] !== actualLines[index]) {
      return index + 1;
    }
  }
  return null;
}

export function verifyEnhancementCatalog({ root = process.cwd() } = {}) {
  const catalog = loadEnhancementCatalog(CATALOG_FILE, { root });
  const runtimePath = path.join(root, RUNTIME_FILE);
  if (!fs.statSync(runtimePath, { throwIfNoEntry: false })?.isFile()) {
    throw new EnhancementCatalogError(
      "CATALOG_RUNTIME_MISSING",
      `${RUNTIME_FILE} não existe; gere o artefato a partir do manifesto.`
    );
  }
  const expected = serializeEnhancementCatalogLua(catalog);
  const actual = fs.readFileSync(runtimePath, "utf8");
  if (actual !== expected) {
    throw new EnhancementCatalogError(
      "CATALOG_RUNTIME_DIVERGENCE",
      `${RUNTIME_FILE} diverge do manifesto na linha ${firstDifferentLine(expected, actual)}.`,
      { artifact: RUNTIME_FILE, line: firstDifferentLine(expected, actual) }
    );
  }
  return {
    ok: true,
    id: catalog.id,
    version: catalog.version,
    actions: catalog.actions.length,
    talents: catalog.talents.length,
    heroTrees: catalog.heroTrees.length,
    resources: catalog.resources.length,
    auras: catalog.auras.length,
  };
}
