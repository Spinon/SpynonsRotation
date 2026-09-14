import crypto from "node:crypto";

export const hash = (text) => crypto.createHash("sha256").update(text).digest("hex").toUpperCase();
export const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`;
const digest = /^[A-F0-9]{64}$/u;
const commit = /^[a-f0-9]{40}$/u;
const sourcePath = /^Interface\/AddOns\/(?:Blizzard_APIDocumentationGenerated\/[A-Za-z0-9]+|Blizzard_ActionBar\/Shared\/(?:ActionButton|ActionButtonUtil))\.lua$/u;
const modulePath = /^addon\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.lua$/u;
function requireValue(condition, message) { if (!condition) throw new Error(message); }

export function validateSnapshot(snapshot) {
  requireValue(snapshot?.schemaVersion === 1 && commit.test(snapshot.commit), "Invalid snapshot identity");
  requireValue(/^\d+\.\d+\.\d+\.\d+$/u.test(snapshot.version), "Invalid client version");
  requireValue(Number.isSafeInteger(snapshot.interface) && snapshot.interface > 0, "Invalid interface");
  requireValue(Array.isArray(snapshot.files) && snapshot.files.length > 0, "Empty coverage");
  const seen = new Set();
  for (const file of snapshot.files) {
    requireValue(sourcePath.test(file.path) && !seen.has(file.path), "Invalid or duplicate source path");
    seen.add(file.path);
    requireValue(typeof file.present === "boolean", "Missing presence marker");
    requireValue(file.present ? digest.test(file.sha256) : file.sha256 === null, "Invalid source digest");
    requireValue(Number.isSafeInteger(file.bytes) && (file.present ? file.bytes > 0 : file.bytes === 0), "Invalid source size");
    requireValue(Array.isArray(file.modules) && file.modules.length > 0 && file.modules.every((p) => modulePath.test(p)),
      "Invalid module ownership");
  }
  return snapshot;
}

export async function captureSnapshot(pin, files, fetchFile) {
  requireValue(commit.test(pin.commit), "Capture requires an immutable commit");
  const version = await fetchFile("version.txt");
  requireValue(version !== null && version.toString("utf8").trim() === pin.version, "Source build mismatch");
  const entries = await Promise.all(files.map(async ({ name, path: configuredPath, modules }) => {
    const path = configuredPath ?? `Interface/AddOns/Blizzard_APIDocumentationGenerated/${name}`;
    requireValue(sourcePath.test(path), "Invalid configured source path");
    const bytes = await fetchFile(path);
    return { path, present: bytes !== null, bytes: bytes?.length ?? 0,
      sha256: bytes === null ? null : hash(bytes), modules: [...modules].sort() };
  }));
  return validateSnapshot({ schemaVersion: 1, version: pin.version, interface: pin.interface, commit: pin.commit,
    files: entries.sort((a, b) => a.path.localeCompare(b.path, "en")) });
}

export function compareSnapshots(before, after) {
  validateSnapshot(before); validateSnapshot(after);
  const previous = new Map(before.files.map((file) => [file.path, file]));
  const current = new Map(after.files.map((file) => [file.path, file]));
  requireValue(previous.size === current.size && [...previous.keys()].every((p) => current.has(p)), "Coverage drift");
  const changes = [];
  for (const path of [...previous.keys()].sort()) {
    const a = previous.get(path), b = current.get(path);
    requireValue(JSON.stringify([...a.modules].sort()) === JSON.stringify([...b.modules].sort()), "Ownership drift");
    if (a.sha256 !== b.sha256 || !a.present || !b.present) changes.push({
      path, status: !a.present && b.present ? "added" : a.present && !b.present ? "removed"
        : !a.present && !b.present ? "unavailable" : "modified",
      modules: [...b.modules], beforeSha256: a.sha256, afterSha256: b.sha256,
      inspection: "REVIEW_COMPLETE_FILE_INCLUDING_SIGNATURES_AND_SECRET_METADATA",
    });
  }
  const interfaceChanged = before.interface !== after.interface;
  return {
    schemaVersion: 1, baseline: { version: before.version, commit: before.commit },
    candidate: { version: after.version, commit: after.commit }, interfaceChanged,
    coveredFiles: before.files.length, changes,
    affectedModules: [...new Set(changes.flatMap((change) => change.modules))].sort(),
    decision: changes.length || interfaceChanged ? "REVIEW_REQUIRED" : "NO_DOCUMENTED_CHANGE_IN_COVERED_FILES",
    retailValidation: "PENDING", simulationParity: "NOT_ASSERTED",
  };
}

export function verifyPinnedSnapshot(text, pin) {
  requireValue(digest.test(pin.snapshotSha256) && hash(text) === pin.snapshotSha256, "Snapshot hash drift");
  const snapshot = validateSnapshot(JSON.parse(text));
  requireValue(snapshot.commit === pin.commit && snapshot.version === pin.version && snapshot.interface === pin.interface,
    "Snapshot pin mismatch");
  return snapshot;
}
