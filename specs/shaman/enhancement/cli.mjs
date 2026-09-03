#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { loadEnhancementCatalog } from "./catalog.mjs";
import { serializeEnhancementCatalogLua } from "./runtime.mjs";
import { verifyPinnedSimcCatalog } from "./simc.mjs";
import { CATALOG_FILE, RUNTIME_FILE, verifyEnhancementCatalog } from "./verify.mjs";

const command = process.argv[2] ?? "check";

try {
  if (command === "check") {
    const result = verifyEnhancementCatalog();
    console.log(
      `Enhancement ${result.version}: ${result.actions} actions, ${result.talents} talents, `
      + `${result.heroTrees} Hero Trees, ${result.resources} resources e ${result.auras} auras.`
    );
  } else if (command === "generate") {
    const catalog = loadEnhancementCatalog(CATALOG_FILE);
    fs.writeFileSync(path.resolve(RUNTIME_FILE), serializeEnhancementCatalogLua(catalog), "utf8");
    console.log(`Artefato gerado: ${RUNTIME_FILE}`);
  } else if (command === "simc-check") {
    const catalog = loadEnhancementCatalog(CATALOG_FILE);
    const result = verifyPinnedSimcCatalog(catalog);
    console.log(
      `DBC verificado: build ${result.wowBuild}, ${result.talents} talents, ${result.heroTrees} Hero Trees `
      + `e ${result.spells} spells; engine ${result.engineCommit}; SHA-256 ${result.executableSha256}.`
    );
  } else {
    console.error(`Comando desconhecido: ${command}. Use check, generate ou simc-check.`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`${error.code ?? error.name}: ${error.message}`);
  if (error.details?.issues) {
    for (const entry of error.details.issues.slice(0, 20)) {
      console.error(`- ${JSON.stringify(entry)}`);
    }
  }
  process.exitCode = 1;
}
