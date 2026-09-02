import crypto from "node:crypto";
import { parseScenarioMatrixDocument, serializeScenarioMatrix } from "./parser.mjs";

function sha256(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex").toUpperCase();
}

function renderRaidEvent(event) {
  return [
    `raid_events+=/${event.type}`,
    `name=${event.name}`,
    `count=${event.count}`,
    `first=${event.first}`,
    `duration=${event.duration}`,
    `cooldown=${event.cooldown}`,
    `last=${event.last}`,
  ].join(",");
}

function reportSuffix(id) {
  const readable = id.replaceAll(/[._]+/gu, "-").slice(0, 40).replaceAll(/-+$/gu, "");
  return `${readable}-${sha256(id).slice(0, 20).toLowerCase()}`;
}

export function compileScenarioPlans(document) {
  const matrix = parseScenarioMatrixDocument(document);
  const plans = matrix.scenarios.map((scenario) => {
    const maxRegressionPercent = scenario.maxRegressionPercent
      ?? matrix.fitness.defaultMaxRegressionPercent;
    const args = [
      `iterations=${matrix.defaults.iterations}`,
      `threads=${matrix.defaults.threads}`,
      `max_time=${scenario.simulation.maxTime}`,
      `fixed_time=${matrix.defaults.fixedTime ? 1 : 0}`,
      `vary_combat_length=${matrix.defaults.varyCombatLength}`,
      `desired_targets=${scenario.simulation.desiredTargets}`,
      `fight_style=${scenario.simulation.fightStyle}`,
      ...(scenario.simulation.raidEvents ?? []).map(renderRaidEvent),
    ];
    return {
      scenarioId: scenario.id,
      category: scenario.category,
      variant: scenario.variant,
      reportSuffix: reportSuffix(scenario.id),
      weight: scenario.weight,
      maxRegressionPercent,
      args,
    };
  });

  return Object.freeze({
    schemaVersion: 1,
    source: Object.freeze({
      id: matrix.id,
      version: matrix.version,
      sha256: sha256(serializeScenarioMatrix(matrix)),
    }),
    plans: Object.freeze(plans.map((plan) => Object.freeze({
      ...plan,
      args: Object.freeze([...plan.args]),
    }))),
  });
}

export function serializeScenarioPlans(document) {
  return `${JSON.stringify(compileScenarioPlans(document), null, 2)}\n`;
}
