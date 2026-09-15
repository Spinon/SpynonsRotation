import fs from "node:fs";
import { execFileSync } from "node:child_process";
import {validateBoard, validateBoardTransition} from "../project/board.mjs";
const git = (args) => execFileSync("git", args, {encoding: "utf8", windowsHide: true}).trim();
export function validateSequence(boards) {
  const errors = [];
  boards.forEach((board, index) => {
    errors.push(...validateBoard(board));
    if (index) errors.push(...validateBoardTransition(boards[index - 1], board));
  });
  return errors;
}
export function checkHistory() {
  const event = process.env.GITHUB_EVENT_PATH ? JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")) : {};
  const head = event.pull_request?.head?.sha ?? git(["rev-parse", "HEAD"]);
  if (!/^[a-f0-9]{40}$/u.test(head)) throw new Error("Invalid head SHA");
  let base = event.pull_request?.base?.sha ?? event.before ?? git(["rev-parse", "HEAD^"]);
  if (!/^[a-f0-9]{40}$/u.test(base) || /^0+$/u.test(base)) base = git(["rev-parse", "HEAD^"]);
  // Validate actual PR commits, not the synthetic merge as one planned→done jump.
  if (event.pull_request) base = git(["merge-base", base, head]);
  const commits = git(["rev-list", "--reverse", "--first-parent", `${base}..${head}`]).split("\n").filter(Boolean);
  if (commits.length > 500) throw new Error("History range exceeds CI safety limit");
  const boards = [base, ...commits].map((commit) => JSON.parse(git(["show", `${commit}:project-board.json`])));
  const errors = validateSequence(boards);
  if (errors.length) throw new Error(`Invalid board history: ${errors.join("; ")}`);
  console.log(`Board history validated: ${commits.length} commits`);
}
