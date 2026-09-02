import fs from "node:fs";
import path from "node:path";
import { ScenarioMatrixError } from "./errors.mjs";
import { canonicalizeScenarioMatrix, validateScenarioMatrix } from "./schema.mjs";

export const MAX_SCENARIO_MATRIX_BYTES = 1024 * 1024;

function normalizeRelative(value) {
  return value.split(path.sep).join("/");
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

export function parseScenarioMatrixDocument(document, { source = "<memory>" } = {}) {
  const validation = validateScenarioMatrix(document);
  if (!validation.valid) {
    throw new ScenarioMatrixError(
      "SCENARIO_MATRIX_VALIDATION_FAILED",
      `Matriz de cenários inválida: ${validation.issues.length} problema(s).`,
      { source, issues: validation.issues }
    );
  }
  return canonicalizeScenarioMatrix(document);
}

export function parseScenarioMatrixText(text, { source = "<memory>" } = {}) {
  if (typeof text !== "string") {
    throw new ScenarioMatrixError("SCENARIO_MATRIX_TEXT_REQUIRED", "A matriz deve ser fornecida como texto JSON.", {
      source,
    });
  }
  if (Buffer.byteLength(text, "utf8") > MAX_SCENARIO_MATRIX_BYTES) {
    throw new ScenarioMatrixError(
      "SCENARIO_MATRIX_TOO_LARGE",
      `A matriz excede ${MAX_SCENARIO_MATRIX_BYTES} bytes.`,
      { source }
    );
  }
  try {
    return parseScenarioMatrixDocument(JSON.parse(text), { source });
  } catch (error) {
    if (error instanceof ScenarioMatrixError) {
      throw error;
    }
    throw new ScenarioMatrixError("SCENARIO_MATRIX_JSON_INVALID", "A matriz não contém JSON válido.", {
      source,
      cause: error,
    });
  }
}

export function loadScenarioMatrixFile(file, { root = process.cwd() } = {}) {
  if (typeof file !== "string" || file.trim() === "") {
    throw new ScenarioMatrixError("SCENARIO_MATRIX_FILE_REQUIRED", "Informe um arquivo .scenario-matrix.json.");
  }

  let projectRoot;
  try {
    projectRoot = fs.realpathSync(path.resolve(root));
  } catch (error) {
    throw new ScenarioMatrixError("SCENARIO_MATRIX_ROOT_INVALID", "A raiz do projeto não pôde ser lida.", {
      source: String(root),
      cause: error,
    });
  }

  const candidate = path.resolve(projectRoot, file);
  const source = normalizeRelative(path.relative(projectRoot, candidate));
  if (!isInside(projectRoot, candidate)) {
    throw new ScenarioMatrixError(
      "SCENARIO_MATRIX_OUTSIDE_PROJECT",
      "A matriz deve permanecer dentro do repositório.",
      { source }
    );
  }
  if (!candidate.toLowerCase().endsWith(".scenario-matrix.json")) {
    throw new ScenarioMatrixError(
      "SCENARIO_MATRIX_EXTENSION_INVALID",
      "O arquivo deve usar a extensão .scenario-matrix.json.",
      { source }
    );
  }

  const stat = fs.statSync(candidate, { throwIfNoEntry: false });
  if (!stat?.isFile()) {
    throw new ScenarioMatrixError("SCENARIO_MATRIX_FILE_MISSING", `Matriz não encontrada: ${source}.`, { source });
  }
  if (stat.size > MAX_SCENARIO_MATRIX_BYTES) {
    throw new ScenarioMatrixError(
      "SCENARIO_MATRIX_TOO_LARGE",
      `A matriz excede ${MAX_SCENARIO_MATRIX_BYTES} bytes.`,
      { source }
    );
  }

  const realFile = fs.realpathSync(candidate);
  if (!isInside(projectRoot, realFile)) {
    throw new ScenarioMatrixError(
      "SCENARIO_MATRIX_OUTSIDE_PROJECT",
      "A matriz resolve por link para fora do repositório.",
      { source }
    );
  }

  try {
    return parseScenarioMatrixText(fs.readFileSync(realFile, "utf8"), { source });
  } catch (error) {
    if (error instanceof ScenarioMatrixError) {
      throw error;
    }
    throw new ScenarioMatrixError("SCENARIO_MATRIX_READ_FAILED", "A matriz não pôde ser lida.", {
      source,
      cause: error,
    });
  }
}

export function serializeScenarioMatrix(document) {
  return `${JSON.stringify(parseScenarioMatrixDocument(document), null, 2)}\n`;
}
