import fs from "node:fs";
import path from "node:path";
import { collect, createPackage, verifyPackage, buildPackage } from "./package.mjs";
const [command, directory, ...rest] = process.argv.slice(2);
if (rest.length || (command !== "verify" && directory)) throw new Error("Unexpected packaging arguments");
if (command === "check") {
  const result = createPackage(collect(), "0".repeat(40), false);
  verifyPackage(result.zip, result.manifest);
  console.log(`Package inputs verified: ${result.manifest.files.length} runtime files; Retail PENDING`);
} else if (command === "build") console.log(JSON.stringify(buildPackage(), null, 2));
else if (command === "verify" && directory) {
  const files = verifyPackage(fs.readFileSync(path.join(directory, "SpynonRotation.zip")),
    JSON.parse(fs.readFileSync(path.join(directory, "manifest.json"), "utf8")));
  console.log(`Package verified: ${files.length} runtime files; Retail PENDING`);
} else throw new Error("Use package:check, package:build or package:verify -- <directory>");
