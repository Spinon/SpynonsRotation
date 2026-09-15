import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {checkSource,validateSource,inspectPng} from "../../tools/brand/source.mjs";
const record = JSON.parse(fs.readFileSync("assets/brand/source.json","utf8"));
const bytes = fs.readFileSync("assets/brand/Spynon Logo.png");

test("approved original is preserved with exact dimensions and RGB metadata", () => {
  const result = checkSource();
  assert.equal(result.width,1448); assert.equal(result.height,1086);
  assert.equal(result.colorType,2); assert.equal(result.bytes,1448115);
});
test("one changed source byte rejects provenance rather than approving a replacement", () => {
  const altered = Buffer.from(bytes); altered[100] ^= 1;
  assert.throws(() => validateSource(record,altered),/sha256 changed/u);
  assert.deepEqual(fs.readFileSync(record.source.path),bytes);
});
test("truncated and non-PNG files are rejected before metadata reads", () => {
  assert.throws(() => inspectPng(Buffer.alloc(8)),/missing PNG/u);
  assert.throws(() => inspectPng(Buffer.alloc(33)),/signature/u);
  const altered = Buffer.from(bytes); altered.write("IDAT",12);
  assert.throws(() => inspectPng(altered),/IHDR/u);
});
test("metadata and approval drift cannot silently change the official reference", () => {
  for (const key of ["width","height","bytes","bitDepth","colorType"]) {
    const altered = structuredClone(record); altered.source[key] += 1;
    assert.throws(() => validateSource(altered,bytes),/changed/u);
  }
  const altered = structuredClone(record); altered.approval.status = "GENERATED";
  assert.throws(() => validateSource(altered,bytes),/approval provenance/u);
});
test("source path and runtime claims are constrained independently of a matching hash", () => {
  const altered = structuredClone(record); altered.source.path = "../../outside.png";
  assert.throws(() => validateSource(altered,bytes),/unexpected source path/u);
  altered.source.path = record.source.path; altered.integration.runtimeAsset = true;
  assert.throws(() => validateSource(altered,bytes),/not a runtime asset/u);
});
