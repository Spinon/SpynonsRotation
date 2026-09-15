import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {fileURLToPath} from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const sourcePath = "assets/brand/Spynon Logo.png";
const signature = Buffer.from([137,80,78,71,13,10,26,10]);
function requireValue(condition, message) {
  if (!condition) throw new Error(`Brand source: ${message}`);
}
export function inspectPng(bytes) {
  requireValue(Buffer.isBuffer(bytes) && bytes.length >= 33, "missing PNG header");
  requireValue(bytes.subarray(0,8).equals(signature), "invalid PNG signature");
  requireValue(bytes.readUInt32BE(8) === 13 && bytes.toString("ascii",12,16) === "IHDR", "invalid IHDR");
  return {bytes:bytes.length, width:bytes.readUInt32BE(16), height:bytes.readUInt32BE(20),
    bitDepth:bytes[24], colorType:bytes[25],
    sha256:crypto.createHash("sha256").update(bytes).digest("hex").toUpperCase()};
}
export function validateSource(record, bytes) {
  requireValue(record?.schemaVersion === 1 && record.brand === "Spynon", "unsupported identity/schema");
  requireValue(record.approval?.status === "APPROVED_SOURCE" && record.approval.authority === "Product Owner"
    && record.approval.reference === "docs/product/PRODUCT_CONTEXT.md#21-identidade-spynon--logotipo-aprovado",
  "approval provenance missing");
  requireValue(record.source?.path === sourcePath, "unexpected source path");
  requireValue(/^[a-f0-9]{40}$/u.test(record.source.firstTrackedCommit)
    && Number.isFinite(Date.parse(record.source.firstTrackedAt)), "Git provenance missing");
  const actual = inspectPng(bytes);
  for (const key of Object.keys(actual)) {
    requireValue(actual[key] === record.source[key], `source ${key} changed; review required`);
  }
  requireValue(record.integration?.stage === "REFERENCE_ONLY" && record.integration.runtimeAsset === false,
    "source sheet is not a runtime asset");
  return actual;
}
export function checkSource(repository = root) {
  const record = JSON.parse(fs.readFileSync(path.join(repository,"assets/brand/source.json"),"utf8"));
  const original = path.join(repository,sourcePath);
  requireValue(fs.lstatSync(original).isFile() && !fs.lstatSync(original).isSymbolicLink(), "source must be a regular file");
  return validateSource(record,fs.readFileSync(original));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkSource();
  console.log(`Approved brand source verified: ${result.width}x${result.height}; ${result.sha256}; unchanged.`);
}
