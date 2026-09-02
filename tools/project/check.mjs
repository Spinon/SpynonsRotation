import fs from "node:fs";
import path from "node:path";
import { STATUS_PATH, normalizeText, readBoard, renderStatus, validateBoard } from "./board.mjs";

let board;
try {
  board = readBoard();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const errors = validateBoard(board);
if (!fs.existsSync(STATUS_PATH)) {
  errors.push(`STATUS derivado não existe: ${path.relative(process.cwd(), STATUS_PATH)}`);
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
