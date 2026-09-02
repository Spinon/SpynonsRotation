import crypto from "node:crypto";
import {
  parseRotationDocument,
  RotationDslError,
  serializeRotationDocument,
} from "../dsl/parser.mjs";
import { OptimizerError } from "./errors.mjs";

export function rotationDigest(document) {
  return crypto
    .createHash("sha256")
    .update(serializeRotationDocument(document), "utf8")
    .digest("hex")
    .toUpperCase();
}

function findList(document, mutation) {
  const list = document.lists.find((candidate) => candidate.id === mutation.listId);
  if (!list) {
    throw new OptimizerError(
      "OPTIMIZER_MUTATION_LIST_MISSING",
      `A mutação ${mutation.id} referencia a lista inexistente ${mutation.listId}.`,
      { details: { mutation: mutation.id, listId: mutation.listId } }
    );
  }
  return list;
}

function findRule(list, ruleId, mutation) {
  const rule = list.rules.find((candidate) => candidate.id === ruleId);
  if (!rule) {
    throw new OptimizerError(
      "OPTIMIZER_MUTATION_RULE_MISSING",
      `A mutação ${mutation.id} referencia a regra inexistente ${ruleId} na lista ${list.id}.`,
      { details: { mutation: mutation.id, listId: list.id, ruleId } }
    );
  }
  return rule;
}

function applySwap(document, mutation) {
  const list = findList(document, mutation);
  const first = findRule(list, mutation.firstRuleId, mutation);
  const second = findRule(list, mutation.secondRuleId, mutation);
  const firstPriority = first.priority;
  first.priority = second.priority;
  second.priority = firstPriority;
}

function applyNumericLiteral(document, mutation) {
  const list = findList(document, mutation);
  const rule = findRule(list, mutation.ruleId, mutation);
  let node = rule.when;
  for (let index = 0; index < mutation.valuePath.length; index += 1) {
    const segment = mutation.valuePath[index];
    const segmentExists = node !== null
      && typeof node === "object"
      && Object.prototype.hasOwnProperty.call(node, segment);
    if (!segmentExists) {
      throw new OptimizerError(
        "OPTIMIZER_MUTATION_PATH_INVALID",
        `A mutação ${mutation.id} não encontra o segmento ${String(segment)} no caminho declarado.`,
        {
          details: {
            mutation: mutation.id,
            ruleId: mutation.ruleId,
            valuePath: mutation.valuePath,
            failedAt: index,
          },
        }
      );
    }
    node = node[segment];
  }
  if (node === null || typeof node !== "object" || node.kind !== "literal" || typeof node.value !== "number") {
    throw new OptimizerError(
      "OPTIMIZER_MUTATION_TARGET_NOT_NUMERIC_LITERAL",
      `A mutação ${mutation.id} deve apontar para um literal numérico da condição.`,
      {
        details: {
          mutation: mutation.id,
          ruleId: mutation.ruleId,
          valuePath: mutation.valuePath,
        },
      }
    );
  }
  node.value = mutation.value;
}

export function applyMutation(document, mutation) {
  const canonical = parseRotationDocument(document);
  const candidate = structuredClone(canonical);
  if (mutation.kind === "swap_rules") {
    applySwap(candidate, mutation);
  } else if (mutation.kind === "set_numeric_literal") {
    applyNumericLiteral(candidate, mutation);
  } else {
    throw new OptimizerError("OPTIMIZER_MUTATION_KIND_UNSUPPORTED", `Mutação não suportada: ${mutation.kind}.`, {
      details: { mutation: mutation.id, kind: mutation.kind },
    });
  }

  try {
    return parseRotationDocument(candidate, { source: `<mutation:${mutation.id}>` });
  } catch (error) {
    if (error instanceof RotationDslError) {
      throw new OptimizerError(
        "OPTIMIZER_MUTATION_DSL_INVALID",
        `A mutação ${mutation.id} produziu uma Rotation DSL inválida.`,
        { details: { mutation: mutation.id }, issues: error.issues, cause: error }
      );
    }
    throw error;
  }
}

export function validateMutationCatalog(baseline, mutations) {
  const canonicalBaseline = parseRotationDocument(baseline);
  const baselineSha256 = rotationDigest(canonicalBaseline);
  const validated = [];
  for (const mutation of mutations) {
    const candidate = applyMutation(canonicalBaseline, mutation);
    const candidateSha256 = rotationDigest(candidate);
    if (candidateSha256 === baselineSha256) {
      throw new OptimizerError(
        "OPTIMIZER_MUTATION_NO_EFFECT",
        `A mutação ${mutation.id} não altera a baseline.`,
        { details: { mutation: mutation.id } }
      );
    }
    validated.push({ mutationId: mutation.id, candidateSha256 });
  }
  return Object.freeze(validated.map((entry) => Object.freeze(entry)));
}
