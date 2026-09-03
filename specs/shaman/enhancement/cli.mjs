#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { generateEnhancementBaseline, verifyEnhancementBaseline } from "./baseline.mjs";
import { loadEnhancementCatalog } from "./catalog.mjs";
import { serializeEnhancementCatalogLua } from "./runtime.mjs";
import { verifyPinnedSimcCatalog } from "./simc.mjs";
import { generateSingleTargetCuration, verifySingleTargetCuration } from "./single-target.mjs";
import { generateMultiTargetCuration, verifyMultiTargetCuration } from "./multi-target.mjs";
import { generateTalentAwareArtifacts, verifyTalentAwareArtifacts } from "./talent-aware.mjs";
import { generateStarterBuildArtifacts, verifyStarterBuildArtifacts } from "./starter-build.mjs";
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
  } else if (command === "baseline-generate") {
    const result = generateEnhancementBaseline();
    console.log(`Baseline gerada: ${result.rules} regras em ${result.files.length} artefatos.`);
  } else if (command === "baseline-check") {
    const result = verifyEnhancementBaseline();
    console.log(
      `Baseline ${result.id}@${result.version}: ${result.sourceActionLines} linhas auditadas, `
      + `${result.normalizedRules} normalizadas e ${result.sourceOnlyRules} preservadas somente na fonte.`
    );
    console.log(
      `Capabilities: ${result.simOnlySourceLines} linha(s) SIM_ONLY; `
      + `${result.runtimeRules} regra(s) no bundle; digest ${result.digest}.`
    );
  } else if (command === "st-generate") {
    const result = await generateSingleTargetCuration();
    console.log(
      `Curadoria ST medida: ${result.screening.ranking.length} candidatas, `
      + `${result.screening.selectedFinalists.length} finalistas; decisão ${result.decision.outcome} `
      + `(${result.decision.selectedId}).`
    );
  } else if (command === "st-check") {
    const result = verifySingleTargetCuration();
    console.log(
      `Curadoria ST verificada: ${result.candidates} candidatas × ${result.scenarios} cenários; `
      + `decisão ${result.decision.outcome} (${result.decision.selectedId}).`
    );
  } else if (command === "mt-generate") {
    const result = await generateMultiTargetCuration();
    console.log(
      `Curadoria multi-target medida: ${result.screening.ranking.length} candidatas, `
      + `${result.screening.selectedFinalists.length} finalistas; decisão ${result.decision.outcome} `
      + `(${result.decision.selectedId}).`
    );
  } else if (command === "mt-check") {
    const result = verifyMultiTargetCuration();
    console.log(
      `Curadoria multi-target verificada: ${result.candidates} candidatas × ${result.scenarios} cenários `
      + `(${result.cleaveScenarios} Cleave, ${result.aoeScenarios} AoE); `
      + `decisão ${result.decision.outcome} (${result.decision.selectedId}).`
    );
  } else if (command === "talent-generate") {
    const result = await generateTalentAwareArtifacts();
    console.log(
      `Matriz talent-aware gerada: ${result.builds} builds, ${result.probes} probes, `
      + `${result.activeRules} regras ativas; digest ${result.digest}.`
    );
  } else if (command === "talent-check") {
    const result = await verifyTalentAwareArtifacts();
    console.log(
      `Matriz talent-aware verificada: ${result.builds} builds, ${result.probes} probes, `
      + `${result.activeRules} regras ativas e ${result.excludedRules} exclusões; digest ${result.digest}.`
    );
  } else if (command === "starter-generate") {
    const result = await generateStarterBuildArtifacts();
    console.log(
      `Build de referência medida: dano ${result.damageWinner.label}; `
      + `iniciante ${result.starterSuggestion.label}.`
    );
  } else if (command === "starter-check") {
    const result = await verifyStarterBuildArtifacts();
    console.log(
      `Build de referência verificada: ${result.candidates} candidatas, ${result.confirmed} confirmadas; `
      + `dano ${result.damageWinner.label}; iniciante ${result.starterSuggestion.label}.`
    );
  } else {
    console.error(
      `Comando desconhecido: ${command}. `
      + "Use check, generate, simc-check, baseline-generate, baseline-check, st-generate, st-check, "
      + "mt-generate, mt-check, talent-generate, talent-check, starter-generate ou starter-check."
    );
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
