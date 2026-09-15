// Minimal ZIP STORE profile: no compression, descriptors, extras, ZIP64 or extraction.
// PKWARE APPNOTE 6.3.10 sections 4.3 / 4.4; fixed 1980-01-01 timestamp.
import { crc32 } from "node:zlib";

export function safePath(name) {
  if (typeof name !== "string" || name.length > 240 || !/^[A-Za-z0-9_./-]+$/u.test(name)
    || name.split("/").some((part) => !part || part.startsWith(".") || part.endsWith(".")
      || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(part))) throw new Error("Unsafe package path");
  return name;
}
export function encodeZip(entries) {
  if (!entries.length || entries.length > 4096) throw new Error("Invalid ZIP entry count");
  const local = [], central = [], names = new Set(); let offset = 0;
  for (const {name, data} of [...entries].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
    safePath(name); const key = name.toLowerCase();
    if (names.has(key) || !Buffer.isBuffer(data)) throw new Error("Duplicate ZIP path or invalid bytes");
    names.add(key);
    const filename = Buffer.from(name), crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x800, 6); header.writeUInt16LE(33, 12);
    header.writeUInt32LE(crc, 14); header.writeUInt32LE(data.length, 18); header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(filename.length, 26);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0x800, 8); directory.writeUInt16LE(33, 14);
    directory.writeUInt32LE(crc, 16); directory.writeUInt32LE(data.length, 20); directory.writeUInt32LE(data.length, 24);
    directory.writeUInt16LE(filename.length, 28); directory.writeUInt32LE(offset, 42);
    local.push(header, filename, data); central.push(directory, filename);
    offset += header.length + filename.length + data.length;
    if (offset > 128 * 1024 * 1024) throw new Error("Package exceeds 128 MiB limit");
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
export function decodeZip(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 22 || bytes.length > 129 * 1024 * 1024) throw new Error("Invalid ZIP size");
  const entries = []; let offset = 0;
  while (offset + 30 <= bytes.length && bytes.readUInt32LE(offset) === 0x04034b50) {
    const size = bytes.readUInt32LE(offset + 18), length = bytes.readUInt16LE(offset + 26);
    const start = offset + 30 + length, end = start + size;
    if (end > bytes.length || entries.length >= 4096) throw new Error("Truncated ZIP");
    const name = bytes.subarray(offset + 30, start).toString("utf8"), data = bytes.subarray(start, end);
    entries.push({name, data}); offset = end;
  }
  // Re-encoding checks CRC, every header, central-directory offsets, ordering and trailing bytes.
  if (!encodeZip(entries).equals(bytes)) throw new Error("ZIP differs from canonical STORE profile");
  return entries;
}
