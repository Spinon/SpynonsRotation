function luaString(value) {
  let output = '"';
  for (const character of value) {
    const code = character.codePointAt(0);
    if (character === "\\") {
      output += "\\\\";
    } else if (character === '"') {
      output += '\\"';
    } else if (character === "\n") {
      output += "\\n";
    } else if (character === "\r") {
      output += "\\r";
    } else if (character === "\t") {
      output += "\\t";
    } else if (code < 32 || code === 127) {
      output += `\\${String(code).padStart(3, "0")}`;
    } else {
      output += character;
    }
  }
  return `${output}"`;
}

function toLua(value, depth = 0) {
  if (value === null) {
    return "nil";
  }
  if (typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }
  if (typeof value === "string") {
    return luaString(value);
  }
  const indentation = "  ".repeat(depth);
  const childIndentation = "  ".repeat(depth + 1);
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "{}";
    }
    return `{\n${value.map((item) => `${childIndentation}${toLua(item, depth + 1)},`).join("\n")}\n${indentation}}`;
  }
  const entries = Object.keys(value)
    .sort()
    .map((key) => `${childIndentation}[${luaString(key)}] = ${toLua(value[key], depth + 1)},`);
  return entries.length === 0 ? "{}" : `{\n${entries.join("\n")}\n${indentation}}`;
}

export function serializeEnhancementCatalogLua(catalog) {
  return [
    "-- Generated from specs/shaman/enhancement/catalog.json; do not edit.",
    "local _, Spynon = ...",
    "",
    `local Catalog = ${toLua(catalog)}`,
    "",
    "Spynon.Classes = Spynon.Classes or {}",
    "Spynon.Classes.Shaman = Spynon.Classes.Shaman or {}",
    "Spynon.Classes.Shaman.Enhancement = Spynon.Classes.Shaman.Enhancement or {}",
    "Spynon.Classes.Shaman.Enhancement.Catalog = Catalog",
    "",
  ].join("\n");
}
