import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { safePath, encodeZip, decodeZip } from "./zip.mjs";

const ADDON = "SpynonRotation", TOC = `${ADDON}.toc`;
export const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex").toUpperCase();
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
function read(root, relative) {
  safePath(relative); let current = root;
  for (const segment of relative.split("/")) {
    current = path.join(current, segment);
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error(`Symlink forbidden: ${relative}`);
  }
  return fs.readFileSync(current);
}
const textBytes = (bytes) => Buffer.from(bytes.toString("utf8").replaceAll("\r\n", "\n"));
export function parseToc(text) {
  const metadata = {}, files = [], seen = new Set();
  for (const line of text.replaceAll("\r\n", "\n").split("\n")) {
    if (!line.trim() || (line.startsWith("#") && !line.startsWith("##"))) continue;
    if (line.startsWith("##")) {
      const match = /^## ([A-Za-z-]+): (.+)$/u.exec(line);
      if (!match || Object.hasOwn(metadata, match[1])) throw new Error("Invalid or duplicate TOC metadata");
      metadata[match[1]] = match[2];
    } else {
      safePath(line);
      if (!line.endsWith(".lua") || seen.has(line.toLowerCase())) throw new Error("Invalid or duplicate TOC runtime path");
      seen.add(line.toLowerCase()); files.push(line);
    }
  }
  if (!files.length || metadata.Title !== "Spynon's Rotation" || metadata.Author !== "Spynon"
    || metadata.SavedVariables !== "SpynonRotationDB" || !metadata.Notes) throw new Error("Missing addon identity");
  return {metadata, files};
}
export function validateMetadata(metadata, release, pins, packageVersion) {
  if (release.status !== "unreleased" || release.validatedAt !== null) throw new Error("Only unvalidated development packaging is enabled");
  if (metadata.Version !== release.version || packageVersion !== release.version
    || !/^\d+\.\d+\.\d+$/u.test(release.version)
    || metadata.Interface !== String(release.interface) || release.interface !== pins.wowRetail.interface
    || metadata["X-WoW-Build"] !== release.wowBuild || release.wowBuild !== pins.simulationCraft.wowVersion
    || release.simc !== pins.simulationCraft.version) throw new Error("TOC/board/toolchain metadata mismatch");
}
export function collect(root = process.cwd()) {
  const board = JSON.parse(read(root, "project-board.json"));
  const pins = JSON.parse(read(root, "tools/toolchain/pins.json"));
  const pkg = JSON.parse(read(root, "package.json"));
  const toc = textBytes(read(root, `addon/${TOC}`));
  const parsed = parseToc(toc.toString()); validateMetadata(parsed.metadata, board.release, pins, pkg.version);
  const assets = JSON.parse(read(root, "assets/ui/runtime/manifest.json"));
  if (assets.schemaVersion !== 1 || assets.status !== "approved") throw new Error("Unapproved runtime assets");
  const entries = [{name: `${ADDON}/${TOC}`, data: toc}];
  for (const file of parsed.files) entries.push({name: `${ADDON}/${file}`, data: textBytes(read(root, `addon/${file}`))});
  for (const component of Object.values(assets.components)) {
    for (const layer of Object.values(component.layers ?? {})) {
      if (!layer.runtime) continue;
      const relative = layer.runtime.replace(/^\.\.\/\.\.\/\.\.\/addon\//u, "");
      if (!relative.startsWith("UI/Media/Textures/") || !relative.endsWith(".tga")) throw new Error("Asset outside runtime texture root");
      const data = read(root, `addon/${relative}`);
      if (sha256(data) !== layer.runtimeSha256) throw new Error(`Asset hash mismatch: ${relative}`);
      entries.push({name: `${ADDON}/${relative}`, data});
    }
  }
  const expected = new Set(entries.map((entry) => entry.name.slice(ADDON.length + 1)));
  function inspect(directory, prefix = "") {
    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
      const relative = `${prefix}${entry.name}`;
      if (entry.isSymbolicLink()) throw new Error("Runtime symlink forbidden");
      if (entry.isDirectory()) inspect(path.join(directory, entry.name), `${relative}/`);
      else if (/\.(?:lua|toc|tga)$/iu.test(entry.name) && !expected.has(relative)) throw new Error(`Unlisted runtime file: ${relative}`);
    }
  }
  inspect(path.join(root, "addon"));
  entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  encodeZip(entries); // validates collisions and size before any output is written
  const index = entries.map(({name, data}) => ({path: name, bytes: data.length, sha256: sha256(data)}));
  const rotations = index.filter((entry) => entry.path.endsWith("/RotationData.lua"));
  if (!rotations.length) throw new Error("No compiled rotation revision");
  return {entries, inputSha256: sha256(jsonBytes(index)), rotationRevision: sha256(jsonBytes(rotations)), release: board.release, pins};
}
export function createPackage(input, sourceCommit, sourceDirty) {
  if (!/^[a-f0-9]{40}$/u.test(sourceCommit) || typeof sourceDirty !== "boolean") throw new Error("Invalid source provenance");
  const {inputSha256, rotationRevision, release, pins} = input;
  const version = `${release.version}-dev.${inputSha256.slice(0, 12).toLowerCase()}`;
  const entries = input.entries.map(({name, data}) => name.endsWith(`/${TOC}`) ? {name, data: Buffer.from(data.toString()
    .replace(/^## Version: .+$/mu, `## Version: ${version}`)
    .replace(/^## X-Project-Revision: .+$/mu, `## X-Project-Revision: ${sourceCommit}`)
    + `\n## X-SimC-Version: ${pins.simulationCraft.version}\n## X-SimC-Commit: ${pins.simulationCraft.engineCommit}\n`
    + `## X-Rotation-Revision: ${rotationRevision}\n## X-Validation-Date: PENDING\n## X-Package-Channel: development-only\n`)} : {name, data});
  const zip = encodeZip(entries);
  const manifest = {schemaVersion: 1, kind: "development-only", publication: "unreleased", version,
    sourceCommit, sourceDirty, inputSha256, wowBuild: release.wowBuild, interface: release.interface,
    simcVersion: pins.simulationCraft.version, simcCommit: pins.simulationCraft.engineCommit,
    rotationRevision, rotationRevisionKind: "sha256-of-compiled-bundle-index",
    validatedAt: null, retailValidation: "PENDING", zipProfile: "STORE_FIXED_1980_V1", zipSha256: sha256(zip),
    files: entries.map(({name, data}) => ({path: name, bytes: data.length, sha256: sha256(data)}))};
  return {zip, manifest};
}
export function verifyPackage(zip, manifest) {
  if (manifest.schemaVersion !== 1 || manifest.kind !== "development-only" || manifest.publication !== "unreleased"
    || manifest.retailValidation !== "PENDING" || manifest.validatedAt !== null || manifest.zipSha256 !== sha256(zip)
    || !/^[a-f0-9]{40}$/u.test(manifest.sourceCommit) || typeof manifest.sourceDirty !== "boolean"
    || !/^[A-F0-9]{64}$/u.test(manifest.inputSha256) || !/^[A-F0-9]{64}$/u.test(manifest.rotationRevision)
    || !/^[a-f0-9]{40}$/u.test(manifest.simcCommit) || manifest.zipProfile !== "STORE_FIXED_1980_V1") throw new Error("Package evidence mismatch");
  const entries = decodeZip(zip);
  for (const entry of entries) {
    if (!entry.name.startsWith(`${ADDON}/`) || !/\.(?:lua|toc|tga)$/u.test(entry.name)) throw new Error("Non-runtime package entry");
  }
  const index = entries.map(({name, data}) => ({path: name, bytes: data.length, sha256: sha256(data)}));
  if (JSON.stringify(index) !== JSON.stringify(manifest.files)) throw new Error("Package contents mismatch");
  const toc = entries.find((entry) => entry.name === `${ADDON}/${TOC}`);
  if (!toc) throw new Error("Package TOC missing");
  const {metadata, files} = parseToc(toc.data.toString());
  const expected = {Version: manifest.version, Interface: String(manifest.interface), "X-WoW-Build": manifest.wowBuild,
    "X-Project-Revision": manifest.sourceCommit, "X-SimC-Version": manifest.simcVersion, "X-SimC-Commit": manifest.simcCommit,
    "X-Rotation-Revision": manifest.rotationRevision, "X-Validation-Date": "PENDING", "X-Package-Channel": "development-only"};
  if (Object.entries(expected).some(([key, value]) => metadata[key] !== value)
    || files.some((file) => !entries.some((entry) => entry.name === `${ADDON}/${file}`))
    || entries.filter((entry) => entry.name.endsWith(".toc")).length !== 1
    || entries.filter((entry) => entry.name.endsWith(".lua")).length !== files.length) throw new Error("Packaged TOC mismatch");
  return entries;
}
export function buildPackage(root = process.cwd()) {
  const git = (args) => execFileSync("git", args, {cwd: root, encoding: "utf8", windowsHide: true}).trim();
  const result = createPackage(collect(root), git(["rev-parse", "HEAD"]), git(["status", "--porcelain"]) !== "");
  verifyPackage(result.zip, result.manifest);
  const directory = path.join(root, "dist", `package-${sha256(jsonBytes(result.manifest)).slice(0, 16).toLowerCase()}`);
  const outputs = [["SpynonRotation.zip", result.zip], ["manifest.json", jsonBytes(result.manifest)]];
  for (const target of [path.join(root, "dist"), directory]) {
    if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) throw new Error("Output symlink forbidden");
  }
  if (fs.existsSync(directory)) {
    for (const [name, data] of outputs) if (!read(directory, name).equals(data)) throw new Error("Existing package differs; refusing overwrite");
  } else {
    // Reject symlinked output roots; never overwrite, delete, install or publish a package.
    const dist = path.join(root, "dist");
    if (fs.existsSync(dist) && fs.lstatSync(dist).isSymbolicLink()) throw new Error("Output symlink forbidden");
    fs.mkdirSync(directory, {recursive: true});
    for (const [name, data] of outputs) fs.writeFileSync(path.join(directory, name), data, {flag: "wx"});
  }
  return {directory, files: result.manifest.files.length, zipSha256: result.manifest.zipSha256, sourceDirty: result.manifest.sourceDirty};
}
