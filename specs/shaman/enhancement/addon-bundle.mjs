import fs from "node:fs";
import { serializeRuntimeLua } from "../../../rotation-lab/compiler/runtime.mjs";
import { verifyEnhancementBaseline } from "./baseline.mjs";

// Mechanical packaging only: priority, conditions, exclusions and provenance remain identical.
verifyEnhancementBaseline();
const bundle = JSON.parse(fs.readFileSync("specs/shaman/enhancement/baseline/baseline.runtime.json", "utf8"));
const text = serializeRuntimeLua(bundle).replace(
  "return {", "local _, Spynon = ...\nSpynon.Classes.Shaman.Enhancement.RotationBundle = {"
);
const target = "addon/Classes/Shaman/Enhancement/RotationData.lua";
if (process.argv.includes("--write")) {
  fs.writeFileSync(target, text, "utf8");
} else if (!fs.existsSync(target) || fs.readFileSync(target, "utf8") !== text) {
  throw new Error("Runtime bundle drift: run npm run enhancement:addon-generate");
}
console.log(`Addon bundle verified: ${bundle.source.sha256}`);
