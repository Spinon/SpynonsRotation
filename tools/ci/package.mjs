import fs from "node:fs";
import path from "node:path";
import {buildPackage, verifyPackage} from "../packaging/package.mjs";
const first = buildPackage(), second = buildPackage();
if (first.sourceDirty || second.sourceDirty || first.zipSha256 !== second.zipSha256 || first.directory !== second.directory) {
  throw new Error("CI package must be clean and reproducible");
}
verifyPackage(fs.readFileSync(path.join(first.directory, "SpynonRotation.zip")),
  JSON.parse(fs.readFileSync(path.join(first.directory, "manifest.json"), "utf8")));
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `directory=${first.directory}\n`);
console.log(JSON.stringify(first, null, 2));
