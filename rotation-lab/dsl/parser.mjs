import fs from "node:fs";
import path from "node:path";
import { canonicalizeRotationDocument, validateRotationDocument } from "./schema.mjs";

export const MAX_DOCUMENT_BYTES = 1024 * 1024;

export class RotationDslError extends Error {
  constructor(code, message, { source = "<memory>", issues = [], cause } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "RotationDslError";
    this.code = code;
    this.source = source;
    this.issues = issues;
  }
}

function normalizeRelative(value) {
  return value.split(path.sep).join("/");
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

export function parseRotationDocument(document, { source = "<memory>" } = {}) {
  const validation = validateRotationDocument(document);
  if (!validation.valid) {
    throw new RotationDslError(
      "DSL_VALIDATION_FAILED",
      `Documento de rotação inválido: ${validation.issues.length} problema(s).`,
      { source, issues: validation.issues }
    );
  }
  return canonicalizeRotationDocument(document);
}

export function parseRotationText(text, { source = "<memory>" } = {}) {
  if (typeof text !== "string") {
    throw new RotationDslError("DSL_TEXT_REQUIRED", "O parser exige conteúdo JSON em texto.", { source });
  }
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes > MAX_DOCUMENT_BYTES) {
    throw new RotationDslError(
      "DSL_DOCUMENT_TOO_LARGE",
      `O documento excede o limite de ${MAX_DOCUMENT_BYTES} bytes.`,
      { source }
    );
  }

  let document;
  try {
    document = JSON.parse(text);
  } catch (error) {
    throw new RotationDslError("DSL_JSON_INVALID", "O arquivo não contém JSON válido.", {
      source,
      issues: [{ code: "INVALID_JSON", path: "$", message: error.message }],
      cause: error,
    });
  }
  return parseRotationDocument(document, { source });
}

export function loadRotationFile(file, { root = process.cwd() } = {}) {
  if (typeof file !== "string" || file.trim() === "") {
    throw new RotationDslError("DSL_FILE_REQUIRED", "Informe um arquivo .rotation.json.");
  }

  let projectRoot;
  try {
    projectRoot = fs.realpathSync(path.resolve(root));
  } catch (error) {
    throw new RotationDslError("DSL_ROOT_INVALID", "A raiz do projeto não existe ou não pode ser lida.", {
      source: String(root),
      cause: error,
    });
  }

  const candidate = path.resolve(projectRoot, file);
  const source = normalizeRelative(path.relative(projectRoot, candidate));
  if (!isInside(projectRoot, candidate)) {
    throw new RotationDslError("DSL_FILE_OUTSIDE_PROJECT", "O arquivo da DSL deve permanecer dentro do repositório.", {
      source,
    });
  }
  if (!candidate.toLowerCase().endsWith(".rotation.json")) {
    throw new RotationDslError("DSL_FILE_EXTENSION_INVALID", "O arquivo deve usar a extensão .rotation.json.", {
      source,
    });
  }

  const stat = fs.statSync(candidate, { throwIfNoEntry: false });
  if (!stat?.isFile()) {
    throw new RotationDslError("DSL_FILE_MISSING", `Arquivo da DSL não encontrado: ${source}.`, { source });
  }
  if (stat.size > MAX_DOCUMENT_BYTES) {
    throw new RotationDslError(
      "DSL_DOCUMENT_TOO_LARGE",
      `O documento excede o limite de ${MAX_DOCUMENT_BYTES} bytes.`,
      { source }
    );
  }

  const realFile = fs.realpathSync(candidate);
  if (!isInside(projectRoot, realFile)) {
    throw new RotationDslError(
      "DSL_FILE_OUTSIDE_PROJECT",
      "O arquivo da DSL resolve por link para fora do repositório.",
      { source }
    );
  }

  let contents;
  try {
    contents = fs.readFileSync(realFile, "utf8");
  } catch (error) {
    throw new RotationDslError("DSL_FILE_READ_FAILED", "O arquivo da DSL não pôde ser lido.", {
      source,
      cause: error,
    });
  }
  return parseRotationText(contents, { source });
}

export function serializeRotationDocument(document) {
  const canonical = parseRotationDocument(document);
  return `${JSON.stringify(canonical, null, 2)}\n`;
}
