import crypto from "node:crypto";
import { CAPABILITY } from "../dsl/schema.mjs";
import { parseRotationDocument, serializeRotationDocument } from "../dsl/parser.mjs";
import { CompilerError } from "./errors.mjs";
import { indexCompilerMap } from "./mapping.mjs";

function sha256(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex").toUpperCase();
}

function assertIdentity(document, mapping) {
  if (document.id !== mapping.document.id || document.version !== mapping.document.version) {
    throw new CompilerError(
      "RUNTIME_MAPPING_IDENTITY_MISMATCH",
      "A identidade da DSL não corresponde ao mapa do compilador.",
      {
        dsl: `${document.id}@${document.version}`,
        mapping: `${mapping.document.id}@${mapping.document.version}`,
      }
    );
  }
  if (document.entrypoint !== mapping.document.entrypoint) {
    throw new CompilerError(
      "RUNTIME_MAPPING_ENTRYPOINT_MISMATCH",
      `A DSL usa entrypoint ${document.entrypoint}, mas o mapa declara ${mapping.document.entrypoint}.`
    );
  }
}

function compileCondition(condition, stateByPath) {
  const program = [];

  function stateInstruction(value, operation) {
    const mapped = stateByPath.get(JSON.stringify(value.path));
    if (!mapped) {
      throw new CompilerError("RUNTIME_STATE_UNMAPPED", `O caminho ${value.path.join(".")} não existe no mapa.`, {
        path: value.path,
      });
    }
    if (mapped.capability !== value.capability) {
      throw new CompilerError(
        "RUNTIME_STATE_CAPABILITY_MISMATCH",
        `Capability divergente para ${value.path.join(".")}: DSL=${value.capability}, mapa=${mapped.capability}.`,
        { path: value.path }
      );
    }
    program.push({ op: operation, path: [...value.path], capability: value.capability });
  }

  function value(current) {
    if (current.kind === "literal") {
      program.push({ op: "PUSH_LITERAL", value: current.value });
    } else {
      stateInstruction(current, "READ_STATE");
    }
  }

  function conditionNode(current) {
    if (current.kind === "constant") {
      program.push({ op: "PUSH_LITERAL", value: current.value });
      return;
    }
    if (current.kind === "truthy") {
      value(current.value);
      program.push({ op: "TRUTHY" });
      return;
    }
    if (current.kind === "exists") {
      stateInstruction(current.value, "HAS_STATE");
      return;
    }
    if (current.kind === "not") {
      conditionNode(current.condition);
      program.push({ op: "NOT" });
      return;
    }
    if (current.kind === "all" || current.kind === "any") {
      for (const child of current.conditions) {
        conditionNode(child);
      }
      program.push({ op: current.kind === "all" ? "ALL" : "ANY", count: current.conditions.length });
      return;
    }
    if (current.kind === "compare") {
      value(current.left);
      value(current.right);
      program.push({ op: "COMPARE", operator: current.operator });
      return;
    }
    throw new CompilerError("RUNTIME_CONDITION_UNSUPPORTED", `Condição desconhecida: ${current.kind}.`);
  }

  conditionNode(condition);
  return program;
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

export function compileDslToRuntime(document, mapping) {
  const canonical = parseRotationDocument(document);
  assertIdentity(canonical, mapping);
  const { simcByAction, stateByPath } = indexCompilerMap(mapping);
  const lists = [];
  const excludedRules = [];

  for (const list of canonical.lists) {
    const rules = [];
    for (const rule of list.rules) {
      if (!simcByAction.has(rule.action)) {
        throw new CompilerError("RUNTIME_ACTION_UNMAPPED", `A action ${rule.action} não existe no mapa.`, {
          rule: rule.id,
          action: rule.action,
        });
      }
      const program = compileCondition(rule.when, stateByPath);
      if (rule.capability === CAPABILITY.SIM_ONLY) {
        excludedRules.push({
          list: list.id,
          rule: rule.id,
          action: rule.action,
          reason: "SIM_ONLY",
        });
        continue;
      }
      const compiledRule = {
        id: rule.id,
        priority: rule.priority,
        action: rule.action,
        capability: rule.capability,
      };
      if (rule.onUnavailable !== undefined) {
        compiledRule.onUnavailable = rule.onUnavailable;
      }
      compiledRule.program = program;
      rules.push(compiledRule);
    }
    lists.push({ id: list.id, rules });
  }

  return deepFreeze({
    schemaVersion: 1,
    source: {
      dslSchemaVersion: canonical.schemaVersion,
      id: canonical.id,
      version: canonical.version,
      sha256: sha256(serializeRotationDocument(canonical)),
    },
    entrypoint: canonical.entrypoint,
    lists,
    excludedRules,
  });
}

export function serializeRuntimeJson(bundle) {
  return `${JSON.stringify(bundle, null, 2)}\n`;
}

function luaString(value) {
  let output = '"';
  for (const character of value) {
    const code = character.codePointAt(0);
    if (character === "\\") {
      output += "\\\\";
    } else if (character === '"') {
      output += '\\"';
    } else if (character === "\n") {
      output += "\\n";
    } else if (character === "\r") {
      output += "\\r";
    } else if (character === "\t") {
      output += "\\t";
    } else if (code < 32 || code === 127) {
      output += `\\${String(code).padStart(3, "0")}`;
    } else {
      output += character;
    }
  }
  return `${output}"`;
}

function toLua(value, depth = 0) {
  if (value === null) {
    return "nil";
  }
  if (typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }
  if (typeof value === "string") {
    return luaString(value);
  }
  const indentation = "  ".repeat(depth);
  const childIndentation = "  ".repeat(depth + 1);
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "{}";
    }
    return `{\n${value.map((item) => `${childIndentation}${toLua(item, depth + 1)},`).join("\n")}\n${indentation}}`;
  }
  const entries = Object.keys(value)
    .sort()
    .map((key) => `${childIndentation}[${luaString(key)}] = ${toLua(value[key], depth + 1)},`);
  return entries.length === 0 ? "{}" : `{\n${entries.join("\n")}\n${indentation}}`;
}

export function serializeRuntimeLua(bundle) {
  return `-- Generated by Spynon's Rotation compiler; do not edit.\nreturn ${toLua(bundle)}\n`;
}
