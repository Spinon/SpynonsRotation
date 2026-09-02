const MAX_ISSUES = 100;
const MAX_SCENARIOS = 128;
const MAX_EVENTS = 32;
const NAMESPACED_ID = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/u;
const SIMPLE_ID = /^[a-z][a-z0-9_]*$/u;
const EVENT_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/u;
const SEMANTIC_VERSION = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;

export const SCENARIO_CATEGORY = Object.freeze({
  SINGLE_TARGET: "single_target",
  CLEAVE: "cleave",
  AOE: "aoe",
  DUNGEON_LIKE: "dungeon_like",
});

export const REQUIRED_SCENARIO_PROFILES = Object.freeze([
  Object.freeze({ category: SCENARIO_CATEGORY.SINGLE_TARGET, variant: "short" }),
  Object.freeze({ category: SCENARIO_CATEGORY.SINGLE_TARGET, variant: "medium" }),
  Object.freeze({ category: SCENARIO_CATEGORY.SINGLE_TARGET, variant: "long" }),
  Object.freeze({ category: SCENARIO_CATEGORY.CLEAVE, variant: "targets_2" }),
  Object.freeze({ category: SCENARIO_CATEGORY.CLEAVE, variant: "targets_3" }),
  Object.freeze({ category: SCENARIO_CATEGORY.AOE, variant: "targets_4" }),
  Object.freeze({ category: SCENARIO_CATEGORY.AOE, variant: "targets_5" }),
  Object.freeze({ category: SCENARIO_CATEGORY.AOE, variant: "targets_8" }),
  Object.freeze({ category: SCENARIO_CATEGORY.DUNGEON_LIKE, variant: "short_pull" }),
  Object.freeze({ category: SCENARIO_CATEGORY.DUNGEON_LIKE, variant: "prolonged_pull" }),
  Object.freeze({ category: SCENARIO_CATEGORY.DUNGEON_LIKE, variant: "boss" }),
  Object.freeze({ category: SCENARIO_CATEGORY.DUNGEON_LIKE, variant: "waves_adds" }),
]);

const PROFILE_KEYS = new Set(REQUIRED_SCENARIO_PROFILES.map(({ category, variant }) => `${category}:${variant}`));
const ROOT_FIELDS = new Set(["schemaVersion", "id", "version", "description", "defaults", "fitness", "scenarios"]);
const DEFAULT_FIELDS = new Set(["iterations", "threads", "fixedTime", "varyCombatLength"]);
const FITNESS_FIELDS = new Set(["metric", "aggregation", "defaultMaxRegressionPercent"]);
const SCENARIO_FIELDS = new Set([
  "id",
  "category",
  "variant",
  "label",
  "weight",
  "maxRegressionPercent",
  "simulation",
]);
const SIMULATION_FIELDS = new Set(["maxTime", "desiredTargets", "fightStyle", "raidEvents"]);
const EVENT_FIELDS = new Set(["type", "name", "count", "first", "duration", "cooldown", "last"]);
const CATEGORIES = new Set(Object.values(SCENARIO_CATEGORY));

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function addIssue(issues, code, issuePath, message) {
  if (issues.length < MAX_ISSUES) {
    issues.push({ code, path: issuePath, message });
  }
}

function knownFields(value, allowed, issuePath, issues) {
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) {
      addIssue(issues, "UNKNOWN_FIELD", `${issuePath}.${field}`, `Campo desconhecido: ${field}.`);
    }
  }
}

function validateString(value, issuePath, issues, { maximum = 128, pattern, optional = false } = {}) {
  if (optional && value === undefined) {
    return false;
  }
  if (typeof value !== "string" || value.length === 0 || value.length > maximum) {
    addIssue(issues, "INVALID_STRING", issuePath, `Deve ser um texto não vazio de até ${maximum} caracteres.`);
    return false;
  }
  if (pattern && !pattern.test(value)) {
    addIssue(issues, "INVALID_FORMAT", issuePath, "Formato inválido.");
    return false;
  }
  return true;
}

function validateInteger(value, issuePath, issues, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    addIssue(issues, "INVALID_INTEGER", issuePath, `Deve ser inteiro entre ${minimum} e ${maximum}.`);
    return false;
  }
  return true;
}

function validateNumber(value, issuePath, issues, minimum, maximum, { exclusiveMinimum = false } = {}) {
  const minimumInvalid = exclusiveMinimum ? value <= minimum : value < minimum;
  if (typeof value !== "number" || !Number.isFinite(value) || minimumInvalid || value > maximum) {
    const relation = exclusiveMinimum ? "maior que" : "entre";
    const range = exclusiveMinimum ? `${minimum} e menor ou igual a ${maximum}` : `${minimum} e ${maximum}`;
    addIssue(issues, "INVALID_NUMBER", issuePath, `Deve ser número finito ${relation} ${range}.`);
    return false;
  }
  return true;
}

function validateDefaults(value, issues) {
  if (!isRecord(value)) {
    addIssue(issues, "INVALID_DEFAULTS", "$.defaults", "defaults deve ser um objeto.");
    return;
  }
  knownFields(value, DEFAULT_FIELDS, "$.defaults", issues);
  validateInteger(value.iterations, "$.defaults.iterations", issues, 1, 10_000_000);
  validateInteger(value.threads, "$.defaults.threads", issues, 1, 1024);
  if (typeof value.fixedTime !== "boolean") {
    addIssue(issues, "INVALID_FIXED_TIME", "$.defaults.fixedTime", "fixedTime deve ser booleano.");
  }
  validateNumber(value.varyCombatLength, "$.defaults.varyCombatLength", issues, 0, 1);
}

function validateFitness(value, issues) {
  if (!isRecord(value)) {
    addIssue(issues, "INVALID_FITNESS", "$.fitness", "fitness deve ser um objeto.");
    return;
  }
  knownFields(value, FITNESS_FIELDS, "$.fitness", issues);
  if (value.metric !== "mean_dps") {
    addIssue(issues, "INVALID_FITNESS_METRIC", "$.fitness.metric", "A v1 aceita metric mean_dps.");
  }
  if (value.aggregation !== "weighted_relative_delta") {
    addIssue(
      issues,
      "INVALID_FITNESS_AGGREGATION",
      "$.fitness.aggregation",
      "A v1 aceita aggregation weighted_relative_delta."
    );
  }
  validateNumber(
    value.defaultMaxRegressionPercent,
    "$.fitness.defaultMaxRegressionPercent",
    issues,
    0,
    100
  );
}

function validateEvent(value, eventPath, issues, maxTime) {
  if (!isRecord(value)) {
    addIssue(issues, "INVALID_RAID_EVENT", eventPath, "O evento deve ser um objeto.");
    return;
  }
  knownFields(value, EVENT_FIELDS, eventPath, issues);
  if (value.type !== "adds") {
    addIssue(issues, "INVALID_RAID_EVENT_TYPE", `${eventPath}.type`, "A v1 aceita somente eventos adds.");
  }
  validateString(value.name, `${eventPath}.name`, issues, { maximum: 64, pattern: EVENT_NAME });
  validateInteger(value.count, `${eventPath}.count`, issues, 1, 40);
  const firstValid = validateInteger(value.first, `${eventPath}.first`, issues, 0, 86_400);
  const durationValid = validateInteger(value.duration, `${eventPath}.duration`, issues, 1, 86_400);
  validateInteger(value.cooldown, `${eventPath}.cooldown`, issues, 1, 86_400);
  const lastValid = validateInteger(value.last, `${eventPath}.last`, issues, 1, 86_400);
  if (firstValid && Number.isInteger(maxTime) && value.first >= maxTime) {
    addIssue(issues, "EVENT_OUTSIDE_FIGHT", `${eventPath}.first`, "first deve ocorrer antes de maxTime.");
  }
  if (durationValid && Number.isInteger(maxTime) && value.duration > maxTime) {
    addIssue(issues, "EVENT_OUTSIDE_FIGHT", `${eventPath}.duration`, "duration não pode exceder maxTime.");
  }
  if (firstValid && lastValid && value.last < value.first) {
    addIssue(issues, "EVENT_RANGE_INVALID", `${eventPath}.last`, "last não pode ocorrer antes de first.");
  }
  if (lastValid && Number.isInteger(maxTime) && value.last > maxTime) {
    addIssue(issues, "EVENT_OUTSIDE_FIGHT", `${eventPath}.last`, "last não pode exceder maxTime.");
  }
}

function validateSimulation(value, scenarioPath, issues, category, variant) {
  const simulationPath = `${scenarioPath}.simulation`;
  if (!isRecord(value)) {
    addIssue(issues, "INVALID_SIMULATION", simulationPath, "simulation deve ser um objeto.");
    return;
  }
  knownFields(value, SIMULATION_FIELDS, simulationPath, issues);
  const maxTimeValid = validateInteger(value.maxTime, `${simulationPath}.maxTime`, issues, 1, 86_400);
  const targetsValid = validateInteger(value.desiredTargets, `${simulationPath}.desiredTargets`, issues, 1, 40);
  if (value.fightStyle !== "Patchwerk") {
    addIssue(issues, "INVALID_FIGHT_STYLE", `${simulationPath}.fightStyle`, "A matriz v1 usa fightStyle Patchwerk.");
  }
  const events = value.raidEvents ?? [];
  if (!Array.isArray(events) || events.length > MAX_EVENTS) {
    addIssue(issues, "INVALID_RAID_EVENTS", `${simulationPath}.raidEvents`, `Use uma lista com até ${MAX_EVENTS} eventos.`);
  } else {
    const names = new Set();
    for (let index = 0; index < events.length; index += 1) {
      validateEvent(events[index], `${simulationPath}.raidEvents[${index}]`, issues, value.maxTime);
      if (isRecord(events[index]) && typeof events[index].name === "string") {
        if (names.has(events[index].name)) {
          addIssue(
            issues,
            "DUPLICATE_RAID_EVENT_NAME",
            `${simulationPath}.raidEvents[${index}].name`,
            `Evento duplicado: ${events[index].name}.`
          );
        }
        names.add(events[index].name);
      }
    }
  }

  const expectedTargets = {
    [`${SCENARIO_CATEGORY.SINGLE_TARGET}:short`]: 1,
    [`${SCENARIO_CATEGORY.SINGLE_TARGET}:medium`]: 1,
    [`${SCENARIO_CATEGORY.SINGLE_TARGET}:long`]: 1,
    [`${SCENARIO_CATEGORY.CLEAVE}:targets_2`]: 2,
    [`${SCENARIO_CATEGORY.CLEAVE}:targets_3`]: 3,
    [`${SCENARIO_CATEGORY.AOE}:targets_4`]: 4,
    [`${SCENARIO_CATEGORY.AOE}:targets_5`]: 5,
    [`${SCENARIO_CATEGORY.AOE}:targets_8`]: 8,
    [`${SCENARIO_CATEGORY.DUNGEON_LIKE}:boss`]: 1,
    [`${SCENARIO_CATEGORY.DUNGEON_LIKE}:waves_adds`]: 1,
  };
  const profile = `${category}:${variant}`;
  if (targetsValid && expectedTargets[profile] !== undefined && value.desiredTargets !== expectedTargets[profile]) {
    addIssue(
      issues,
      "SCENARIO_TARGET_MISMATCH",
      `${simulationPath}.desiredTargets`,
      `O perfil ${profile} exige ${expectedTargets[profile]} alvo(s) base.`
    );
  }
  if (category !== SCENARIO_CATEGORY.DUNGEON_LIKE && Array.isArray(events) && events.length > 0) {
    addIssue(issues, "STATIC_SCENARIO_HAS_EVENTS", `${simulationPath}.raidEvents`, "Somente dungeon_like usa eventos na v1.");
  }
  if (profile === `${SCENARIO_CATEGORY.DUNGEON_LIKE}:waves_adds`) {
    if (!Array.isArray(events) || events.length === 0) {
      addIssue(issues, "WAVES_EVENT_REQUIRED", `${simulationPath}.raidEvents`, "waves_adds exige ao menos um evento adds.");
    }
  } else if (Array.isArray(events) && events.length > 0) {
    addIssue(issues, "UNEXPECTED_RAID_EVENTS", `${simulationPath}.raidEvents`, "Este perfil não aceita eventos na matriz inicial.");
  }
  if (maxTimeValid && category === SCENARIO_CATEGORY.DUNGEON_LIKE
    && ["short_pull", "prolonged_pull"].includes(variant)
    && targetsValid && value.desiredTargets < 2) {
    addIssue(issues, "DUNGEON_PULL_TARGETS_INVALID", `${simulationPath}.desiredTargets`, "Pull dungeon-like exige ao menos 2 alvos.");
  }
}

function validateScenarios(value, issues) {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_SCENARIOS) {
    addIssue(issues, "INVALID_SCENARIOS", "$.scenarios", `Use entre 1 e ${MAX_SCENARIOS} cenários.`);
    return;
  }
  const ids = new Set();
  const profiles = new Set();
  const durations = new Map();
  for (let index = 0; index < value.length; index += 1) {
    const scenario = value[index];
    const scenarioPath = `$.scenarios[${index}]`;
    if (!isRecord(scenario)) {
      addIssue(issues, "INVALID_SCENARIO", scenarioPath, "O cenário deve ser um objeto.");
      continue;
    }
    knownFields(scenario, SCENARIO_FIELDS, scenarioPath, issues);
    if (validateString(scenario.id, `${scenarioPath}.id`, issues, { pattern: NAMESPACED_ID })) {
      if (ids.has(scenario.id)) {
        addIssue(issues, "DUPLICATE_SCENARIO_ID", `${scenarioPath}.id`, `ID duplicado: ${scenario.id}.`);
      }
      ids.add(scenario.id);
    }
    const categoryValid = CATEGORIES.has(scenario.category);
    if (!categoryValid) {
      addIssue(issues, "INVALID_SCENARIO_CATEGORY", `${scenarioPath}.category`, "Categoria desconhecida.");
    }
    const variantValid = validateString(scenario.variant, `${scenarioPath}.variant`, issues, {
      maximum: 64,
      pattern: SIMPLE_ID,
    });
    if (categoryValid && variantValid) {
      const profile = `${scenario.category}:${scenario.variant}`;
      if (!PROFILE_KEYS.has(profile)) {
        addIssue(issues, "INVALID_SCENARIO_PROFILE", `${scenarioPath}.variant`, `Perfil não suportado: ${profile}.`);
      } else if (profiles.has(profile)) {
        addIssue(issues, "DUPLICATE_SCENARIO_PROFILE", `${scenarioPath}.variant`, `Perfil duplicado: ${profile}.`);
      } else {
        profiles.add(profile);
      }
      if (isRecord(scenario.simulation) && Number.isInteger(scenario.simulation.maxTime)) {
        durations.set(profile, scenario.simulation.maxTime);
      }
    }
    validateString(scenario.label, `${scenarioPath}.label`, issues, { maximum: 160 });
    validateNumber(scenario.weight, `${scenarioPath}.weight`, issues, 0, 1000, { exclusiveMinimum: true });
    if (scenario.maxRegressionPercent !== undefined) {
      validateNumber(scenario.maxRegressionPercent, `${scenarioPath}.maxRegressionPercent`, issues, 0, 100);
    }
    validateSimulation(scenario.simulation, scenarioPath, issues, scenario.category, scenario.variant);
  }

  for (const requiredProfile of PROFILE_KEYS) {
    if (!profiles.has(requiredProfile)) {
      addIssue(issues, "SCENARIO_PROFILE_MISSING", "$.scenarios", `Perfil obrigatório ausente: ${requiredProfile}.`);
    }
  }
  if (profiles.size === PROFILE_KEYS.size && value.length !== PROFILE_KEYS.size) {
    addIssue(issues, "SCENARIO_COUNT_INVALID", "$.scenarios", `A matriz v1 deve conter exatamente ${PROFILE_KEYS.size} perfis.`);
  }

  const stShort = durations.get(`${SCENARIO_CATEGORY.SINGLE_TARGET}:short`);
  const stMedium = durations.get(`${SCENARIO_CATEGORY.SINGLE_TARGET}:medium`);
  const stLong = durations.get(`${SCENARIO_CATEGORY.SINGLE_TARGET}:long`);
  if ([stShort, stMedium, stLong].every(Number.isInteger) && !(stShort < stMedium && stMedium < stLong)) {
    addIssue(issues, "ST_DURATION_ORDER_INVALID", "$.scenarios", "ST deve respeitar duração short < medium < long.");
  }
  const shortPull = durations.get(`${SCENARIO_CATEGORY.DUNGEON_LIKE}:short_pull`);
  const prolongedPull = durations.get(`${SCENARIO_CATEGORY.DUNGEON_LIKE}:prolonged_pull`);
  if ([shortPull, prolongedPull].every(Number.isInteger) && !(shortPull < prolongedPull)) {
    addIssue(
      issues,
      "DUNGEON_DURATION_ORDER_INVALID",
      "$.scenarios",
      "short_pull deve durar menos que prolonged_pull."
    );
  }
}

export function validateScenarioMatrix(document) {
  const issues = [];
  if (!isRecord(document)) {
    return { valid: false, issues: [{ code: "INVALID_DOCUMENT", path: "$", message: "Objeto esperado." }] };
  }
  knownFields(document, ROOT_FIELDS, "$", issues);
  if (document.schemaVersion !== 1) {
    addIssue(issues, "UNSUPPORTED_SCHEMA_VERSION", "$.schemaVersion", "schemaVersion deve ser 1.");
  }
  validateString(document.id, "$.id", issues, { pattern: NAMESPACED_ID });
  validateString(document.version, "$.version", issues, { maximum: 64, pattern: SEMANTIC_VERSION });
  validateString(document.description, "$.description", issues, { maximum: 4096, optional: true });
  validateDefaults(document.defaults, issues);
  validateFitness(document.fitness, issues);
  validateScenarios(document.scenarios, issues);
  return { valid: issues.length === 0, issues };
}

function deepFreeze(value) {
  Object.freeze(value);
  for (const child of Object.values(value)) {
    if (child !== null && typeof child === "object" && !Object.isFrozen(child)) {
      deepFreeze(child);
    }
  }
  return value;
}

function canonicalEvent(event) {
  return {
    type: event.type,
    name: event.name,
    count: event.count,
    first: event.first,
    duration: event.duration,
    cooldown: event.cooldown,
    last: event.last,
  };
}

function canonicalScenario(scenario) {
  const canonical = {
    id: scenario.id,
    category: scenario.category,
    variant: scenario.variant,
    label: scenario.label,
    weight: scenario.weight,
  };
  if (scenario.maxRegressionPercent !== undefined) {
    canonical.maxRegressionPercent = scenario.maxRegressionPercent;
  }
  canonical.simulation = {
    maxTime: scenario.simulation.maxTime,
    desiredTargets: scenario.simulation.desiredTargets,
    fightStyle: scenario.simulation.fightStyle,
  };
  if (scenario.simulation.raidEvents !== undefined) {
    canonical.simulation.raidEvents = scenario.simulation.raidEvents
      .map(canonicalEvent)
      .sort((left, right) => left.first - right.first || left.name.localeCompare(right.name, "en"));
  }
  return canonical;
}

export function canonicalizeScenarioMatrix(document) {
  const canonical = {
    schemaVersion: 1,
    id: document.id,
    version: document.version,
  };
  if (document.description !== undefined) {
    canonical.description = document.description;
  }
  canonical.defaults = {
    iterations: document.defaults.iterations,
    threads: document.defaults.threads,
    fixedTime: document.defaults.fixedTime,
    varyCombatLength: document.defaults.varyCombatLength,
  };
  canonical.fitness = {
    metric: document.fitness.metric,
    aggregation: document.fitness.aggregation,
    defaultMaxRegressionPercent: document.fitness.defaultMaxRegressionPercent,
  };
  canonical.scenarios = document.scenarios
    .map(canonicalScenario)
    .sort((left, right) => left.id.localeCompare(right.id, "en"));
  return deepFreeze(canonical);
}

export function summarizeScenarioMatrix(document) {
  const categories = Object.fromEntries(Object.values(SCENARIO_CATEGORY).map((category) => [category, 0]));
  let totalWeight = 0;
  let eventScenarios = 0;
  for (const scenario of document.scenarios) {
    categories[scenario.category] += 1;
    totalWeight += scenario.weight;
    if ((scenario.simulation.raidEvents?.length ?? 0) > 0) {
      eventScenarios += 1;
    }
  }
  return { scenarios: document.scenarios.length, categories, totalWeight, eventScenarios };
}
