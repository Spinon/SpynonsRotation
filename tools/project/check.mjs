import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  ROOT,
  SCHEMA_PATH,
  STATUS_PATH,
  normalizeText,
  readBoard,
  renderStatus,
  validateBoard,
  validateBoardTransition,
} from "./board.mjs";

let board;
try {
  board = readBoard();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const errors = validateBoard(board);
if (!fs.existsSync(SCHEMA_PATH)) {
  errors.push(`schema do board não existe: ${path.relative(ROOT, SCHEMA_PATH)}`);
} else {
  try {
    const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, "utf8"));
    if (schema.properties?.schemaVersion?.const !== board.schemaVersion) {
      errors.push("schemaVersion do board não corresponde ao project-board.schema.json");
    }
  } catch (error) {
    errors.push(`project-board.schema.json inválido: ${error.message}`);
  }
}

const previousResult = spawnSync("git", ["show", "HEAD:project-board.json"], {
  cwd: ROOT,
  encoding: "utf8",
});
if (previousResult.status === 0) {
  try {
    const previousBoard = JSON.parse(previousResult.stdout);
    errors.push(...validateBoardTransition(previousBoard, board));
  } catch (error) {
    errors.push(`não foi possível validar a transição contra HEAD: ${error.message}`);
  }
}

if (!fs.existsSync(STATUS_PATH)) {
  errors.push(`STATUS derivado não existe: ${path.relative(ROOT, STATUS_PATH)}`);
} else {
  const actual = normalizeText(fs.readFileSync(STATUS_PATH, "utf8"));
  const expected = normalizeText(renderStatus(board));
  if (actual !== expected) {
    errors.push("docs/project/STATUS.md está dessincronizado; execute npm run project:status");
  }
}

if (errors.length > 0) {
  console.error(`project:check encontrou ${errors.length} problema(s):`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Board válido: ${board.items.length} tasks; currentFocus=${board.currentFocus}`);
