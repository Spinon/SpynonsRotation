import fs from "node:fs";
import path from "node:path";
import { ROOT, STATUS_PATH, readBoard, renderStatus, validateBoard } from "./board.mjs";

const board = readBoard();
const errors = validateBoard(board);
if (errors.length > 0) {
  console.error("Board inválido; STATUS não foi gerado:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

fs.mkdirSync(path.dirname(STATUS_PATH), { recursive: true });
fs.writeFileSync(STATUS_PATH, renderStatus(board), "utf8");
console.log(`STATUS gerado: ${path.relative(ROOT, STATUS_PATH)}`);
