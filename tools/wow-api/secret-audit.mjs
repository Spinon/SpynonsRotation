import fs from "node:fs";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";

export const normalizedHash = (text) => crypto.createHash("sha256")
  .update(text.replaceAll("\r\n", "\n")).digest("hex").toUpperCase();
const sourcePath = /^addon\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.lua$/u;
const testPath = /^tests\/unit\/[a-z_]+_spec\.lua$/u;
function requireValue(value, message) { if (!value) throw new Error(message); }
export function validateAudit(audit, read, compatFiles, apiSources) {
  requireValue(audit?.schemaVersion === 1 && audit.retailValidation === "PENDING", "Invalid audit identity");
  requireValue(typeof audit.reviewedAt === "string" && Number.isFinite(Date.parse(audit.reviewedAt)), "Invalid review date");
  requireValue(JSON.stringify(audit.apiPins) === JSON.stringify(apiSources.builds), "API pins changed: review audit");
  requireValue(Array.isArray(audit.risks) && audit.risks.length > 0, "Missing risk matrix");
  requireValue(audit.files && typeof audit.files === "object" && !Array.isArray(audit.files), "Missing reviewed files");
  const covered = new Set(), ids = new Set();
  for (const risk of audit.risks) {
    requireValue(/^SECRET-\d{2}$/u.test(risk.id) && !ids.has(risk.id), "Invalid or duplicate risk ID");
    ids.add(risk.id);
    for (const key of ["signal", "classification", "guard", "fallback", "limitation"]) {
      requireValue(typeof risk[key] === "string" && risk[key].trim().length > 0, `Missing ${key}: ${risk.id}`);
    }
    requireValue(Array.isArray(risk.sources) && risk.sources.length > 0, "Missing risk sources");
    for (const file of risk.sources) {
      requireValue(sourcePath.test(file), "Unsafe source path"); covered.add(file);
      requireValue(/^[A-F0-9]{64}$/u.test(audit.files[file]), `Missing reviewed hash: ${file}`);
    }
    requireValue(Array.isArray(risk.tests) && risk.tests.length > 0, "Missing regressions");
    for (const file of risk.tests) {
      requireValue(testPath.test(file), "Unsafe regression path");
      requireValue(read(file).includes("test("), `Regression suite missing: ${file}`);
    }
  }
  for (const [file, digest] of Object.entries(audit.files)) {
    requireValue(sourcePath.test(file) && covered.has(file), "Unclassified reviewed source");
    requireValue(normalizedHash(read(file)) === digest, `Audit review required: ${file}`);
  }
  for (const file of compatFiles) requireValue(covered.has(file), `Unclassified Compat source: ${file}`);
  return { risks: ids.size, files: covered.size, retailValidation: "PENDING" };
}
export function checkWorkspace() {
  const read = (file) => fs.readFileSync(file, "utf8");
  const audit = JSON.parse(read("tools/wow-api/secret-audit.json"));
  const compat = fs.readdirSync("addon/Compat").filter((file) => file.endsWith(".lua"))
    .map((file) => `addon/Compat/${file}`);
  return validateAudit(audit, read, compat, JSON.parse(read("tools/wow-api/sources.json")));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = checkWorkspace();
  console.log(`Secret audit: ${result.risks} risks; ${result.files} reviewed files; Retail PENDING`);
}
