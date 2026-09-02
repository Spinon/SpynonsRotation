import fs from "node:fs";
import path from "node:path";

export const ROOT = path.resolve(process.env.SPYNON_PROJECT_ROOT ?? process.cwd());
export const BOARD_PATH = path.resolve(process.env.SPYNON_BOARD_PATH ?? path.join(ROOT, "project-board.json"));
export const STATUS_PATH = path.resolve(process.env.SPYNON_STATUS_PATH ?? path.join(ROOT, "docs", "project", "STATUS.md"));
export const SCHEMA_PATH = path.join(ROOT, "docs", "project", "project-board.schema.json");

export const VALID_STATUSES = Object.freeze(["planned", "in_progress", "blocked", "done"]);
export const VALID_PRIORITIES = Object.freeze(["P0", "P1", "P2", "P3"]);
export const ALLOWED_STATUS_TRANSITIONS = Object.freeze({
  planned: Object.freeze(["planned", "in_progress", "blocked"]),
  in_progress: Object.freeze(["in_progress", "blocked", "done"]),
  blocked: Object.freeze(["blocked", "planned", "in_progress"]),
  done: Object.freeze(["done"]),
});

const STATUS_SET = new Set(VALID_STATUSES);
const PRIORITY_SET = new Set(VALID_PRIORITIES);
const TASK_ID_PATTERN = /^[A-Z]+(?:-[A-Z]+)*-\d{3}$/u;

export function readBoard(boardPath = BOARD_PATH) {
  if (!fs.existsSync(boardPath)) {
    throw new Error(`Board não encontrado: ${boardPath}`);
  }

  return JSON.parse(fs.readFileSync(boardPath, "utf8"));
}

function isIsoDate(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function dateIsAfter(nextValue, previousValue) {
  return isIsoDate(nextValue) && isIsoDate(previousValue) && Date.parse(nextValue) > Date.parse(previousValue);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function validateKnownFields(value, allowedFields, prefix, errors) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${prefix} deve ser um objeto`);
    return;
  }

  const allowed = new Set(allowedFields);
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) {
      errors.push(`${prefix}.${field} não é permitido pelo schema v1`);
    }
  }
}

function sourceFileExists(source, root) {
  if (!isNonEmptyString(source)) {
    return false;
  }

  if (/^https?:\/\//u.test(source)) {
    return true;
  }

  const filePart = source.split("#", 1)[0];
  return fs.existsSync(path.join(root, filePart));
}

function validateStringList(value, field, prefix, errors, { allowEmpty = true } = {}) {
  if (!Array.isArray(value)) {
    errors.push(`${prefix}.${field} deve ser uma lista`);
    return;
  }

  if (!allowEmpty && value.length === 0) {
    errors.push(`${prefix}.${field} deve ser uma lista não vazia`);
  }

  for (const [index, entry] of value.entries()) {
    if (!isNonEmptyString(entry)) {
      errors.push(`${prefix}.${field}[${index}] deve ser texto não vazio`);
    }
  }
}

export function validateBoard(board, { root = ROOT } = {}) {
  const errors = [];

  if (!board || typeof board !== "object" || Array.isArray(board)) {
    return ["board deve ser um objeto JSON"];
  }

  validateKnownFields(board, ["schemaVersion", "project", "updatedAt", "currentFocus", "release", "items"], "board", errors);

  if (board.schemaVersion !== 1) {
    errors.push("schemaVersion deve ser 1");
  }

  validateKnownFields(board.project, ["name", "product", "repository", "defaultBranch"], "project", errors);
  for (const field of ["name", "product", "repository", "defaultBranch"]) {
    if (!isNonEmptyString(board.project?.[field])) {
      errors.push(`project.${field} é obrigatório`);
    }
  }

  if (isNonEmptyString(board.project?.repository)) {
    try {
      new URL(board.project.repository);
    } catch {
      errors.push("project.repository deve ser uma URL válida");
    }
  }

  if (!isIsoDate(board.updatedAt)) {
    errors.push("updatedAt deve ser uma data ISO válida");
  }

  validateKnownFields(board.release, ["version", "channel", "status", "wowBuild", "interface", "simc", "rotationRevision", "validatedAt"], "release", errors);
  for (const field of ["version", "channel", "status", "wowBuild", "simc"]) {
    if (!isNonEmptyString(board.release?.[field])) {
      errors.push(`release.${field} é obrigatório`);
    }
  }

  if (!Number.isInteger(board.release?.interface) || board.release.interface < 1) {
    errors.push("release.interface deve ser um inteiro positivo");
  }
  if (board.release?.rotationRevision !== null && !isNonEmptyString(board.release?.rotationRevision)) {
    errors.push("release.rotationRevision deve ser texto não vazio ou null");
  }
  if (board.release?.validatedAt !== null && !isIsoDate(board.release?.validatedAt)) {
    errors.push("release.validatedAt deve ser uma data ISO válida ou null");
  }

  if (!Array.isArray(board.items) || board.items.length === 0) {
    errors.push("items deve ser uma lista não vazia");
    return errors;
  }

  const ids = new Set();
  const itemsById = new Map();

  for (const [index, item] of board.items.entries()) {
    const prefix = item?.id || `items[${index}]`;

    if (!item || !isNonEmptyString(item.id)) {
      errors.push(`items[${index}].id é obrigatório`);
      continue;
    }

    validateKnownFields(item, [
      "id",
      "title",
      "lane",
      "owner",
      "status",
      "priority",
      "source",
      "updatedAt",
      "reviewBy",
      "nextAction",
      "dependencies",
      "acceptanceCriteria",
      "evidence",
    ], prefix, errors);

    if (!TASK_ID_PATTERN.test(item.id)) {
      errors.push(`${prefix}.id deve seguir o formato LANE-001`);
    }

    if (ids.has(item.id)) {
      errors.push(`ID duplicado: ${item.id}`);
    }
    ids.add(item.id);
    itemsById.set(item.id, item);

    for (const field of ["title", "lane", "owner"]) {
      if (!isNonEmptyString(item[field])) {
        errors.push(`${prefix}.${field} é obrigatório`);
      }
    }

    if (!STATUS_SET.has(item.status)) {
      errors.push(`${prefix}.status inválido: ${String(item.status)}`);
    }

    if (!PRIORITY_SET.has(item.priority)) {
      errors.push(`${prefix}.priority inválida: ${String(item.priority)}`);
    }

    if (!isIsoDate(item.updatedAt)) {
      errors.push(`${prefix}.updatedAt deve ser uma data ISO válida`);
    }

    if (!sourceFileExists(item.source, root)) {
      errors.push(`${prefix}.source não existe ou está vazio: ${String(item.source)}`);
    }

    if (item.reviewBy !== null && !isNonEmptyString(item.reviewBy)) {
      errors.push(`${prefix}.reviewBy deve ser texto não vazio ou null`);
    }

    validateStringList(item.dependencies, "dependencies", prefix, errors);
    validateStringList(item.acceptanceCriteria, "acceptanceCriteria", prefix, errors, { allowEmpty: false });
    validateStringList(item.evidence, "evidence", prefix, errors);

    if (item.status === "done") {
      if (!Array.isArray(item.evidence) || item.evidence.length === 0) {
        errors.push(`${prefix} está done sem evidence`);
      }
      if (item.nextAction !== null) {
        errors.push(`${prefix}.nextAction deve ser null quando a task está done`);
      }
    } else if (!isNonEmptyString(item.nextAction)) {
      errors.push(`${prefix}.nextAction é obrigatório enquanto a task não estiver done`);
    }
  }

  const focus = itemsById.get(board.currentFocus);
  if (!focus) {
    errors.push(`currentFocus inexistente: ${String(board.currentFocus)}`);
  } else if (focus.status === "done") {
    errors.push(`currentFocus aponta para task concluída: ${focus.id}`);
  }

  const inProgress = board.items.filter((item) => item.status === "in_progress");
  if (inProgress.length > 1) {
    errors.push(`fila incoerente: ${inProgress.length} tasks estão in_progress`);
  }
  if (inProgress.length === 1 && inProgress[0].id !== board.currentFocus) {
    errors.push(`fila incoerente: ${inProgress[0].id} está in_progress, mas currentFocus é ${board.currentFocus}`);
  }

  for (const item of board.items) {
    if (!Array.isArray(item.dependencies)) {
      continue;
    }

    const seenDependencies = new Set();
    for (const dependencyId of item.dependencies) {
      if (seenDependencies.has(dependencyId)) {
        errors.push(`${item.id} repete a dependência ${dependencyId}`);
      }
      seenDependencies.add(dependencyId);

      if (dependencyId === item.id) {
        errors.push(`${item.id} não pode depender de si mesma`);
        continue;
      }

      const dependency = itemsById.get(dependencyId);
      if (!dependency) {
        errors.push(`${item.id} depende de ID inexistente: ${dependencyId}`);
        continue;
      }

      const dependencyMustBeDone = item.status === "in_progress"
        || item.status === "done"
        || item.id === board.currentFocus;
      if (dependencyMustBeDone && dependency.status !== "done") {
        errors.push(`${item.id} depende de task não concluída: ${dependencyId}`);
      }
    }
  }

  return errors;
}

export function validateBoardTransition(previousBoard, nextBoard) {
  const errors = [];
  const previousItems = new Map(previousBoard.items.map((item) => [item.id, item]));
  const nextItems = new Map(nextBoard.items.map((item) => [item.id, item]));
  let changed = previousBoard.currentFocus !== nextBoard.currentFocus
    || JSON.stringify(previousBoard.project) !== JSON.stringify(nextBoard.project)
    || JSON.stringify(previousBoard.release) !== JSON.stringify(nextBoard.release)
    || previousBoard.items.length !== nextBoard.items.length;

  if (previousBoard.schemaVersion !== nextBoard.schemaVersion) {
    errors.push("mudança de schemaVersion exige migração explícita e não é uma transição comum");
  }

  for (const [id, previousItem] of previousItems) {
    const nextItem = nextItems.get(id);
    if (!nextItem) {
      errors.push(`task removida sem migração: ${id}`);
      changed = true;
      continue;
    }

    if (JSON.stringify(previousItem) !== JSON.stringify(nextItem)) {
      changed = true;
    }

    const allowed = ALLOWED_STATUS_TRANSITIONS[previousItem.status] ?? [];
    if (!allowed.includes(nextItem.status)) {
      errors.push(`transição inválida em ${id}: ${previousItem.status} → ${nextItem.status}`);
    }

    if (previousItem.status !== nextItem.status && !dateIsAfter(nextItem.updatedAt, previousItem.updatedAt)) {
      errors.push(`${id}.updatedAt deve avançar quando o status muda`);
    }
  }

  for (const [id, nextItem] of nextItems) {
    if (!previousItems.has(id) && nextItem.status !== "planned") {
      errors.push(`task nova deve iniciar como planned: ${id}`);
    }
  }

  const previousActive = previousBoard.items.find((item) => item.status === "in_progress");
  if (previousActive && nextBoard.currentFocus !== previousBoard.currentFocus) {
    const transitioned = nextItems.get(previousActive.id);
    if (!transitioned || !["done", "blocked"].includes(transitioned.status)) {
      errors.push(`currentFocus só pode sair de ${previousActive.id} após done ou blocked`);
    }
  }

  if (changed && !dateIsAfter(nextBoard.updatedAt, previousBoard.updatedAt)) {
    errors.push("board.updatedAt deve avançar quando o board muda");
  }

  return errors;
}

function escapeCell(value) {
  return String(value ?? "—").replaceAll("|", "\\|").replaceAll("\n", " ");
}

export function renderStatus(board) {
  const counts = Object.fromEntries(VALID_STATUSES.map((status) => [status, 0]));
  for (const item of board.items) {
    counts[item.status] += 1;
  }

  const focus = board.items.find((item) => item.id === board.currentFocus);
  const lines = [
    "<!-- GENERATED BY npm run project:status. DO NOT EDIT MANUALLY. -->",
    "",
    "# Status do projeto",
    "",
    `Atualizado pelo board em: ${board.updatedAt}`,
    "",
    `Release: **${board.release.version}** (${board.release.channel}; ${board.release.status})`,
    "",
    "## Foco atual",
    "",
    focus ? `**${focus.id} — ${focus.title}**` : `Foco inválido: ${board.currentFocus}`,
    "",
    focus ? `Status: \`${focus.status}\` · Prioridade: \`${focus.priority}\` · Responsável: ${focus.owner}` : "",
    "",
    focus ? `Próxima ação: ${focus.nextAction}` : "",
    "",
    "## Progresso",
    "",
    `- Planejadas: ${counts.planned}`,
    `- Em andamento: ${counts.in_progress}`,
    `- Bloqueadas: ${counts.blocked}`,
    `- Concluídas: ${counts.done}`,
    `- Total: ${board.items.length}`,
    "",
    "## Fila canônica",
    "",
    "| ID | Lane | Título | Status | Prioridade | Dependências |",
    "| --- | --- | --- | --- | --- | --- |",
  ];

  for (const item of board.items) {
    lines.push(`| ${escapeCell(item.id)} | ${escapeCell(item.lane)} | ${escapeCell(item.title)} | ${escapeCell(item.status)} | ${escapeCell(item.priority)} | ${escapeCell(item.dependencies.length ? item.dependencies.join(", ") : "—")} |`);
  }

  const completed = board.items.filter((item) => item.status === "done");
  lines.push("", "## Evidências concluídas", "");
  if (completed.length === 0) {
    lines.push("Nenhuma task concluída ainda.");
  } else {
    for (const item of completed) {
      lines.push(`### ${item.id}`, "");
      for (const evidence of item.evidence) {
        lines.push(`- ${evidence}`);
      }
      lines.push("");
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export function normalizeText(value) {
  return value.replaceAll("\r\n", "\n");
}
