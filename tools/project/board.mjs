import fs from "node:fs";
import path from "node:path";

export const ROOT = process.cwd();
export const BOARD_PATH = path.join(ROOT, "project-board.json");
export const STATUS_PATH = path.join(ROOT, "docs", "project", "STATUS.md");

const VALID_STATUSES = new Set(["planned", "in_progress", "blocked", "done"]);
const VALID_PRIORITIES = new Set(["P0", "P1", "P2", "P3"]);

export function readBoard() {
  if (!fs.existsSync(BOARD_PATH)) {
    throw new Error(`Board não encontrado: ${BOARD_PATH}`);
  }

  return JSON.parse(fs.readFileSync(BOARD_PATH, "utf8"));
}

function isIsoDate(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function sourceFileExists(source) {
  if (typeof source !== "string" || source.trim() === "") {
    return false;
  }

  if (/^https?:\/\//u.test(source)) {
    return true;
  }

  const filePart = source.split("#", 1)[0];
  return fs.existsSync(path.join(ROOT, filePart));
}

export function validateBoard(board) {
  const errors = [];

  if (board.schemaVersion !== 1) {
    errors.push("schemaVersion deve ser 1");
  }

  if (!board.project || typeof board.project.name !== "string") {
    errors.push("project.name é obrigatório");
  }

  if (!isIsoDate(board.updatedAt)) {
    errors.push("updatedAt deve ser uma data ISO válida");
  }

  if (!board.release || typeof board.release.version !== "string") {
    errors.push("release.version é obrigatório");
  }

  if (!Array.isArray(board.items) || board.items.length === 0) {
    errors.push("items deve ser uma lista não vazia");
    return errors;
  }

  const ids = new Set();
  const itemsById = new Map();

  for (const [index, item] of board.items.entries()) {
    const prefix = item?.id ? item.id : `items[${index}]`;

    if (!item || typeof item.id !== "string" || item.id.trim() === "") {
      errors.push(`items[${index}].id é obrigatório`);
      continue;
    }

    if (ids.has(item.id)) {
      errors.push(`ID duplicado: ${item.id}`);
    }
    ids.add(item.id);
    itemsById.set(item.id, item);

    for (const field of ["title", "lane", "owner"]) {
      if (typeof item[field] !== "string" || item[field].trim() === "") {
        errors.push(`${prefix}.${field} é obrigatório`);
      }
    }

    if (!VALID_STATUSES.has(item.status)) {
      errors.push(`${prefix}.status inválido: ${String(item.status)}`);
    }

    if (!VALID_PRIORITIES.has(item.priority)) {
      errors.push(`${prefix}.priority inválida: ${String(item.priority)}`);
    }

    if (!isIsoDate(item.updatedAt)) {
      errors.push(`${prefix}.updatedAt deve ser uma data ISO válida`);
    }

    if (!sourceFileExists(item.source)) {
      errors.push(`${prefix}.source não existe ou está vazio: ${String(item.source)}`);
    }

    if (!Array.isArray(item.dependencies)) {
      errors.push(`${prefix}.dependencies deve ser uma lista`);
    }

    if (!Array.isArray(item.acceptanceCriteria) || item.acceptanceCriteria.length === 0) {
      errors.push(`${prefix}.acceptanceCriteria deve ser uma lista não vazia`);
    }

    if (!Array.isArray(item.evidence)) {
      errors.push(`${prefix}.evidence deve ser uma lista`);
    }

    if (item.status === "done" && (!Array.isArray(item.evidence) || item.evidence.length === 0)) {
      errors.push(`${prefix} está done sem evidence`);
    }

    if (item.status !== "done" && (typeof item.nextAction !== "string" || item.nextAction.trim() === "")) {
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

      if ((item.status === "in_progress" || item.status === "done" || item.id === board.currentFocus) && dependency.status !== "done") {
        errors.push(`${item.id} depende de task não concluída: ${dependencyId}`);
      }
    }
  }

  return errors;
}

function escapeCell(value) {
  return String(value ?? "—").replaceAll("|", "\\|").replaceAll("\n", " ");
}

export function renderStatus(board) {
  const counts = Object.fromEntries([...VALID_STATUSES].map((status) => [status, 0]));
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
