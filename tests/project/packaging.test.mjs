import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {safePath, encodeZip, decodeZip} from "../../tools/packaging/zip.mjs";
import {collect, createPackage, verifyPackage, parseToc, validateMetadata, sha256} from "../../tools/packaging/package.mjs";

const input = collect(), commit = "a".repeat(40), result = createPackage(input, commit, false);
test("package includes only TOC Lua and approved runtime textures under one addon root", () => {
  const entries = verifyPackage(result.zip, result.manifest);
  assert.equal(entries.length, 81); assert.equal(entries.filter((entry) => entry.name.endsWith(".tga")).length, 17);
  assert.ok(entries.every((entry) => entry.name.startsWith("SpynonRotation/")));
  assert.ok(entries.every((entry) => !/README|\.json|\.png|Probe|tests|rotation-lab|WTF/u.test(entry.name)));
});
test("identical inputs yield identical bytes and manifest independent of entry order", () => {
  const other = createPackage(input, commit, false);
  assert.deepEqual(other, result); assert.deepEqual(encodeZip([...input.entries].reverse()), encodeZip(input.entries));
  const changed = createPackage(input, "b".repeat(40), false);
  assert.notEqual(changed.manifest.zipSha256, result.manifest.zipSha256);
});
test("package records development provenance without claiming Retail validation", () => {
  const {manifest} = result;
  assert.equal(manifest.sourceCommit, commit); assert.equal(manifest.sourceDirty, false);
  assert.equal(manifest.wowBuild, "12.1.0.69587"); assert.equal(manifest.simcVersion, "1210.01");
  assert.equal(manifest.retailValidation, "PENDING"); assert.equal(manifest.validatedAt, null);
  assert.match(manifest.rotationRevision, /^[A-F0-9]{64}$/u);
  assert.equal(createPackage(input, commit, true).manifest.sourceDirty, true);
});
test("source TOC remains untouched while package receives versioned metadata", () => {
  const original = input.entries.find((entry) => entry.name.endsWith(".toc"));
  assert.equal(parseToc(original.data.toString()).metadata.Version, "0.0.0");
  const toc = verifyPackage(result.zip, result.manifest).find((entry) => entry.name.endsWith(".toc"));
  assert.match(parseToc(toc.data.toString()).metadata.Version, /^0\.0\.0-dev\./u);
});
test("TOC rejects traversal duplicate files and metadata, and version drift", () => {
  const toc = input.entries.find((entry) => entry.name.endsWith(".toc")).data.toString();
  for (const suffix of ["\n../evil.lua", "\nCore/Namespace.lua", "\n## Version: 1.0.0", "\nscript.xml"]) {
    assert.throws(() => parseToc(toc + suffix));
  }
  const meta = parseToc(toc).metadata;
  assert.throws(() => validateMetadata({...meta, Interface: "1"}, input.release, input.pins, "0.0.0"));
  assert.throws(() => validateMetadata(meta, {...input.release, status: "released"}, input.pins, "0.0.0"));
});
test("ZIP rejects unsafe names and case-insensitive collisions", () => {
  for (const name of ["../x", "/x", "x/../y", "x\\y", "x//y", "x:ads", "NUL.txt", ".env", "x/COM1.lua"]) assert.throws(() => safePath(name));
  assert.throws(() => encodeZip([{name: "a.lua", data: Buffer.alloc(0)}, {name: "A.lua", data: Buffer.alloc(0)}]));
});
test("ZIP verifier rejects changed payload headers CRC central directory or trailing bytes", () => {
  const tiny = encodeZip([{name: "a.lua", data: Buffer.from("return 1") }]);
  assert.equal(decodeZip(tiny)[0].data.toString(), "return 1");
  for (const index of [6, 14, 25, 36, tiny.length - 7]) {
    const changed = Buffer.from(tiny); changed[index] ^= 1; assert.throws(() => decodeZip(changed));
  }
  assert.throws(() => decodeZip(Buffer.concat([tiny, Buffer.from("extra")])));
  assert.throws(() => decodeZip(tiny.subarray(0, 35)));
});
test("manifest drift and a missing packaged TOC are rejected", () => {
  assert.throws(() => verifyPackage(result.zip, {...result.manifest, retailValidation: "PASS"}));
  assert.throws(() => verifyPackage(result.zip, {...result.manifest, sourceCommit: "bad"}));
  const files = structuredClone(result.manifest.files); files[0].sha256 = "F".repeat(64);
  assert.throws(() => verifyPackage(result.zip, {...result.manifest, files}));
  const without = decodeZip(result.zip).filter((entry) => !entry.name.endsWith(".toc")), zip = encodeZip(without);
  assert.throws(() => verifyPackage(zip, {...result.manifest, zipSha256: sha256(zip),
    files: without.map(({name, data}) => ({path: name, bytes: data.length, sha256: sha256(data)}))}));
});
test("collection rejects unlisted Lua and changed texture hashes", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "spynon-package-test-"));
  try {
    for (const relative of ["addon", "project-board.json", "package.json", "tools/toolchain/pins.json",
      "assets/ui/runtime/manifest.json", "assets/brand/runtime.json", "assets/brand/source.json"]) {
      fs.mkdirSync(path.dirname(path.join(temporary, relative)), {recursive: true});
      fs.cpSync(relative, path.join(temporary, relative), {recursive: true});
    }
    const extra = path.join(temporary, "addon/Unexpected.lua"); fs.writeFileSync(extra, "return true");
    assert.throws(() => collect(temporary), /Unlisted runtime/u); fs.unlinkSync(extra);
    const brandFile = path.join(temporary, "assets/brand/runtime.json");
    const originalBrand = fs.readFileSync(brandFile), brand = JSON.parse(originalBrand);
    for (const change of [{sourceSha256: "0".repeat(64)}, {approval: "UNREVIEWED"},
      {retailPreview: "PASS"}, {runtime: "../outside.tga"}]) {
      fs.writeFileSync(brandFile, JSON.stringify({...brand, ...change}));
      assert.throws(() => collect(temporary), /brand asset provenance/u);
    }
    fs.writeFileSync(brandFile, JSON.stringify({...brand, runtimeSha256: "0".repeat(64)}));
    assert.throws(() => collect(temporary), /Asset hash mismatch: brand/u);
    fs.writeFileSync(brandFile, originalBrand);
    const asset = input.entries.find((entry) => entry.name.endsWith(".tga"));
    fs.writeFileSync(path.join(temporary, "addon", asset.name.slice("SpynonRotation/".length)), "changed");
    assert.throws(() => collect(temporary), /Asset hash/u);
  } finally {
    // Exact unique directory created by this fixture, never a user directory.
    assert.ok(path.basename(temporary).startsWith("spynon-package-test-")); fs.rmSync(temporary, {recursive: true});
  }
});
