import { indexCompilerMap } from "./mapping.mjs";
import { CompilerError } from "./errors.mjs";

const COMPARISONS = new Set(["=", "!=", "<", "<=", ">", ">="]);
const DSL_COMPARISONS = Object.freeze({
  "=": "eq",
  "!=": "ne",
  "<": "lt",
  "<=": "lte",
  ">": "gt",
  ">=": "gte",
});
const SIMC_COMPARISONS = Object.freeze({
  eq: "=",
  ne: "!=",
  lt: "<",
  lte: "<=",
  gt: ">",
  gte: ">=",
});

function expressionError(code, message, context, token) {
  throw new CompilerError(code, message, {
    source: context.source,
    line: context.line,
    column: (token?.start ?? context.text.length) + 1,
    expression: context.text,
  });
}

function tokenize(text, context) {
  const tokens = [];
  let index = 0;
  while (index < text.length) {
    const character = text[index];
    if (/\s/u.test(character)) {
      index += 1;
      continue;
    }
    const twoCharacters = text.slice(index, index + 2);
    if (["!=", "<=", ">="].includes(twoCharacters)) {
      tokens.push({ type: "operator", value: twoCharacters, start: index });
      index += 2;
      continue;
    }
    if ("()!&|=<>".includes(character)) {
      tokens.push({
        type: character === "(" || character === ")" ? "punctuation" : "operator",
        value: character,
        start: index,
      });
      index += 1;
      continue;
    }
    const remaining = text.slice(index);
    const number = /^(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)/u.exec(remaining);
    if (number) {
      tokens.push({ type: "number", value: number[0], start: index });
      index += number[0].length;
      continue;
    }
    const identifier = /^[A-Za-z_][A-Za-z0-9_.]*/u.exec(remaining);
    if (identifier) {
      tokens.push({ type: "identifier", value: identifier[0], start: index });
      index += identifier[0].length;
      continue;
    }
    expressionError("SIMC_EXPRESSION_TOKEN_UNSUPPORTED", `Token não suportado: ${character}.`, context, { start: index });
  }
  tokens.push({ type: "eof", value: "", start: text.length });
  return tokens;
}

function combine(kind, left, right) {
  const conditions = [];
  if (left.kind === kind) {
    conditions.push(...left.conditions);
  } else {
    conditions.push(left);
  }
  if (right.kind === kind) {
    conditions.push(...right.conditions);
  } else {
    conditions.push(right);
  }
  return { kind, conditions };
}

export function parseSimcExpression(text, mapping, { source = "<expression>", line = 1 } = {}) {
  if (typeof text !== "string" || text.trim() === "") {
    throw new CompilerError("SIMC_EXPRESSION_REQUIRED", "A condição SimC está vazia.", { source, line });
  }
  const context = { text, source, line };
  const tokens = tokenize(text, context);
  const { stateBySimc } = indexCompilerMap(mapping);
  let cursor = 0;

  function peek() {
    return tokens[cursor];
  }

  function match(value) {
    if (peek().value === value) {
      cursor += 1;
      return true;
    }
    return false;
  }

  function stateValue(token) {
    const mapped = stateBySimc.get(token.value);
    if (!mapped) {
      expressionError(
        "SIMC_STATE_UNMAPPED",
        `A expressão ${token.value} não possui mapeamento para a DSL.`,
        context,
        token
      );
    }
    return { kind: "state", path: [...mapped.path], capability: mapped.capability };
  }

  function parseValue() {
    const token = peek();
    if (token.type === "number") {
      cursor += 1;
      return { kind: "literal", value: Number(token.value) };
    }
    if (token.type === "identifier") {
      cursor += 1;
      return stateValue(token);
    }
    expressionError("SIMC_VALUE_EXPECTED", "Era esperado um número ou sinal mapeado.", context, token);
  }

  function parsePredicate() {
    const left = parseValue();
    const token = peek();
    if (COMPARISONS.has(token.value)) {
      cursor += 1;
      const right = parseValue();
      return { kind: "compare", operator: DSL_COMPARISONS[token.value], left, right };
    }
    if (left.kind === "literal") {
      return { kind: "constant", value: left.value !== 0 };
    }
    return { kind: "truthy", value: left };
  }

  function parseUnary() {
    if (match("!")) {
      const grouped = peek().value === "(";
      const condition = parseUnary();
      if (!grouped && condition.kind === "compare") {
        expressionError(
          "SIMC_NEGATION_AMBIGUOUS",
          "Use parênteses para negar uma comparação, por exemplo !(signal=1).",
          context,
          tokens[cursor - 1]
        );
      }
      return { kind: "not", condition };
    }
    if (match("(")) {
      const condition = parseOr();
      if (!match(")")) {
        expressionError("SIMC_PARENTHESIS_MISSING", "Parêntese de fechamento ausente.", context, peek());
      }
      return condition;
    }
    return parsePredicate();
  }

  function parseAnd() {
    let condition = parseUnary();
    while (match("&")) {
      condition = combine("all", condition, parseUnary());
    }
    return condition;
  }

  function parseOr() {
    let condition = parseAnd();
    while (match("|")) {
      condition = combine("any", condition, parseAnd());
    }
    return condition;
  }

  const condition = parseOr();
  if (peek().type !== "eof") {
    expressionError("SIMC_EXPRESSION_TRAILING_TOKEN", `Token inesperado: ${peek().value}.`, context, peek());
  }
  return condition;
}

function literalToSimc(value) {
  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  throw new CompilerError(
    "DSL_LITERAL_UNSUPPORTED_BY_SIMC",
    "O subconjunto SimC aceita somente literais numéricos ou booleanos."
  );
}

export function emitSimcCondition(condition, mapping) {
  const { stateByPath } = indexCompilerMap(mapping);

  function emitValue(value) {
    if (value.kind === "literal") {
      return literalToSimc(value.value);
    }
    const mapped = stateByPath.get(JSON.stringify(value.path));
    if (!mapped) {
      throw new CompilerError("DSL_STATE_UNMAPPED", `O caminho ${value.path.join(".")} não possui mapeamento SimC.`, {
        path: value.path,
      });
    }
    if (mapped.capability !== value.capability) {
      throw new CompilerError(
        "DSL_STATE_CAPABILITY_MISMATCH",
        `O caminho ${value.path.join(".")} usa ${value.capability}, mas o mapa declara ${mapped.capability}.`,
        { path: value.path }
      );
    }
    return mapped.simc;
  }

  function emit(current) {
    if (current.kind === "constant") {
      return current.value ? "1" : "0";
    }
    if (current.kind === "truthy") {
      return emitValue(current.value);
    }
    if (current.kind === "exists") {
      throw new CompilerError(
        "DSL_EXISTS_UNSUPPORTED_BY_SIMC",
        "exists não pertence ao subconjunto SimC reversível; mapeie um sinal booleano explícito."
      );
    }
    if (current.kind === "not") {
      return `!(${emit(current.condition)})`;
    }
    if (current.kind === "all" || current.kind === "any") {
      const operator = current.kind === "all" ? "&" : "|";
      return current.conditions.map((child) => `(${emit(child)})`).join(operator);
    }
    if (current.kind === "compare") {
      return `${emitValue(current.left)}${SIMC_COMPARISONS[current.operator]}${emitValue(current.right)}`;
    }
    throw new CompilerError("DSL_CONDITION_UNSUPPORTED", `Condição desconhecida: ${current.kind}.`);
  }

  return emit(condition);
}
