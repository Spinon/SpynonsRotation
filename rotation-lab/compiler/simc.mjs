import { deriveConditionCapability } from "../dsl/schema.mjs";
import {
  parseRotationDocument,
  RotationDslError,
  serializeRotationDocument,
} from "../dsl/parser.mjs";
import { CompilerError } from "./errors.mjs";
import { emitSimcCondition, parseSimcExpression } from "./expression.mjs";
import { indexCompilerMap } from "./mapping.mjs";

const ACTION_LINE = /^actions(?:\.([a-z][a-z0-9_]*))?(\+?=)\/(.+)$/u;

function inlineComment(line) {
  const index = line.indexOf("#");
  return (index === -1 ? line : line.slice(0, index)).trim();
}

function generatedRuleId(mapping, listId, actionId, occurrence) {
  const namespace = mapping.document.id.split(".", 1)[0];
  const actionName = actionId.split(".").slice(1).join("_");
  return `${namespace}.${listId}_${actionName}_${occurrence}`;
}

function validateDocumentIdentity(document, mapping) {
  if (document.id !== mapping.document.id || document.version !== mapping.document.version) {
    throw new CompilerError(
      "DSL_MAPPING_IDENTITY_MISMATCH",
      `A DSL ${document.id}@${document.version} não corresponde ao mapa ${mapping.document.id}@${mapping.document.version}.`,
      {
        dsl: { id: document.id, version: document.version },
        mapping: { id: mapping.document.id, version: mapping.document.version },
      }
    );
  }
  if (document.entrypoint !== mapping.document.entrypoint) {
    throw new CompilerError(
      "DSL_MAPPING_ENTRYPOINT_MISMATCH",
      `A DSL usa entrypoint ${document.entrypoint}, mas o mapa declara ${mapping.document.entrypoint}.`
    );
  }
}

export function compileSimcToDsl(sourceText, mapping, { source = "<simc>" } = {}) {
  if (typeof sourceText !== "string") {
    throw new CompilerError("SIMC_SOURCE_REQUIRED", "A fonte SimC deve ser fornecida como texto.", { source });
  }
  const { actionBySimc } = indexCompilerMap(mapping);
  const lists = new Map();
  const occurrences = new Map();
  const lines = sourceText.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const lineNumber = lineIndex + 1;
    const line = inlineComment(lines[lineIndex]);
    if (line === "") {
      continue;
    }
    if (!line.startsWith("actions")) {
      continue;
    }

    const match = ACTION_LINE.exec(line);
    if (!match) {
      throw new CompilerError(
        "SIMC_ACTION_LINE_UNSUPPORTED",
        "Linha de action fora do subconjunto suportado. Use actions[.lista][+]=/ação[,if=condição].",
        { source, line: lineNumber, text: line }
      );
    }

    const listId = match[1] ?? "default";
    const assignment = match[2];
    const parts = match[3].split(",");
    const simcAction = parts.shift()?.trim();
    if (!simcAction || !/^[a-z][a-z0-9_]*$/u.test(simcAction)) {
      throw new CompilerError("SIMC_ACTION_NAME_INVALID", "Nome de action SimC inválido.", {
        source,
        line: lineNumber,
        action: simcAction,
      });
    }
    const actionId = actionBySimc.get(simcAction);
    if (!actionId) {
      throw new CompilerError(
        "SIMC_ACTION_UNMAPPED",
        `A action ${simcAction} não possui mapeamento para a DSL.`,
        { source, line: lineNumber, action: simcAction }
      );
    }

    let expression;
    for (const rawModifier of parts) {
      const modifier = rawModifier.trim();
      if (!modifier.startsWith("if=")) {
        throw new CompilerError(
          "SIMC_ACTION_MODIFIER_UNSUPPORTED",
          `Modifier fora do subconjunto suportado: ${modifier || "<vazio>"}.`,
          { source, line: lineNumber, modifier }
        );
      }
      if (expression !== undefined) {
        throw new CompilerError("SIMC_ACTION_IF_DUPLICATE", "A linha contém mais de um modifier if.", {
          source,
          line: lineNumber,
        });
      }
      expression = modifier.slice(3);
      if (expression === "") {
        throw new CompilerError("SIMC_EXPRESSION_REQUIRED", "O modifier if está vazio.", {
          source,
          line: lineNumber,
        });
      }
    }

    let list = lists.get(listId);
    if (!list) {
      list = { id: listId, rules: [] };
      lists.set(listId, list);
    } else if (assignment === "=") {
      throw new CompilerError(
        "SIMC_LIST_RESET_UNSUPPORTED",
        `A lista ${listId} é redefinida depois de receber regras; normalize a fonte antes de importar.`,
        { source, line: lineNumber, list: listId }
      );
    }

    const occurrenceKey = `${listId}\u0000${actionId}`;
    const occurrence = (occurrences.get(occurrenceKey) ?? 0) + 1;
    occurrences.set(occurrenceKey, occurrence);
    const when = expression === undefined
      ? { kind: "constant", value: true }
      : parseSimcExpression(expression, mapping, { source, line: lineNumber });
    const capability = deriveConditionCapability(when);
    const rule = {
      id: generatedRuleId(mapping, listId, actionId, occurrence),
      priority: (list.rules.length + 1) * mapping.document.priorityStep,
      action: actionId,
      capability,
    };
    if (capability === "CONDITIONALLY_SECRET") {
      rule.onUnavailable = "skip_rule";
    }
    rule.when = when;
    list.rules.push(rule);
  }

  if (lists.size === 0) {
    throw new CompilerError("SIMC_ACTIONS_MISSING", "Nenhuma action list foi encontrada na fonte SimC.", { source });
  }
  if (!lists.has(mapping.document.entrypoint)) {
    throw new CompilerError(
      "SIMC_ENTRYPOINT_MISSING",
      `A fonte não define a lista de entrada ${mapping.document.entrypoint}.`,
      { source, entrypoint: mapping.document.entrypoint }
    );
  }

  const document = {
    schemaVersion: 1,
    id: mapping.document.id,
    version: mapping.document.version,
  };
  if (mapping.document.description !== undefined) {
    document.description = mapping.document.description;
  }
  document.entrypoint = mapping.document.entrypoint;
  document.lists = [...lists.values()];

  try {
    return parseRotationDocument(document, { source });
  } catch (error) {
    if (error instanceof RotationDslError) {
      throw new CompilerError(
        "SIMC_DSL_OUTPUT_INVALID",
        "A fonte SimC gerou uma DSL inválida; revise o mapa e os limites da DSL.",
        { source, issues: error.issues },
        { cause: error }
      );
    }
    throw error;
  }
}

export function compileDslToSimc(document, mapping) {
  const canonical = parseRotationDocument(document);
  validateDocumentIdentity(canonical, mapping);
  const { simcByAction } = indexCompilerMap(mapping);
  const lines = [
    "# Generated by Spynon's Rotation compiler; do not edit.",
    `# source=${canonical.id}@${canonical.version}`,
  ];

  for (const list of canonical.lists) {
    const listPrefix = list.id === "default" ? "actions" : `actions.${list.id}`;
    for (let index = 0; index < list.rules.length; index += 1) {
      const rule = list.rules[index];
      const simcAction = simcByAction.get(rule.action);
      if (!simcAction) {
        throw new CompilerError("DSL_ACTION_UNMAPPED", `A action ${rule.action} não possui mapeamento SimC.`, {
          rule: rule.id,
          action: rule.action,
        });
      }
      const assignment = index === 0 ? "=/" : "+=/";
      let line = `${listPrefix}${assignment}${simcAction}`;
      if (!(rule.when.kind === "constant" && rule.when.value === true)) {
        line += `,if=${emitSimcCondition(rule.when, mapping)}`;
      }
      lines.push(line);
    }
  }
  return `${lines.join("\n")}\n`;
}

export function verifySimcRoundTrip(document, mapping) {
  const expected = serializeRotationDocument(document);
  const simc = compileDslToSimc(document, mapping);
  const roundTripped = compileSimcToDsl(simc, mapping, { source: "<round-trip>" });
  return {
    equal: serializeRotationDocument(roundTripped) === expected,
    simc,
    document: roundTripped,
  };
}
