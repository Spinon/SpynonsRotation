import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const requiredDirectories = [
  "addon/Core",
  "addon/Rotation",
  "addon/Classes/Shaman/Shared",
  "addon/Classes/Shaman/Enhancement",
  "addon/UI",
  "addon/Config",
  "addon/Profiles",
  "addon/Skins",
  "addon/Compat",
  "rotation-lab/simc",
  "rotation-lab/optimizer",
  "rotation-lab/scenarios",
  "specs/shaman/enhancement",
  "tests/unit",
  "tests/integration",
  "tests/headless",
  "assets/brand",
  "docs/product",
  "docs/architecture",
  "docs/project",
  "tasks",
];
const requiredFiles = [
  "addon/SpynonRotation.toc",
  "addon/Core/Bootstrap.lua",
  "AGENTS.md",
  "project-board.json",
  "tools/toolchain/pins.json",
];
const errors = [];

for (const directory of requiredDirectories) {
  if (!fs.statSync(path.join(root, directory), { throwIfNoEntry: false })?.isDirectory()) {
    errors.push(`diretório obrigatório ausente: ${directory}`);
  }
}

for (const file of requiredFiles) {
  if (!fs.statSync(path.join(root, file), { throwIfNoEntry: false })?.isFile()) {
    errors.push(`arquivo obrigatório ausente: ${file}`);
  }
}

const tocPath = path.join(root, "addon", "SpynonRotation.toc");
if (fs.existsSync(tocPath)) {
  const toc = fs.readFileSync(tocPath, "utf8");
  if (!/^## Interface: 120100$/mu.test(toc)) {
    errors.push("SpynonRotation.toc não está fixado na Interface 120100");
  }

  for (const line of toc.split(/\r?\n/u)) {
    const entry = line.trim();
    if (!entry || entry.startsWith("#")) {
      continue;
    }
    if (!fs.existsSync(path.join(root, "addon", entry.replaceAll("\\", "/")))) {
      errors.push(`arquivo listado no TOC não existe: ${entry}`);
    }
  }
}

const genericLuaRoots = ["Core", "Rotation", "UI", "Config", "Profiles", "Skins", "Compat"];
function visit(directory) {
  if (!fs.existsSync(directory)) {
    return;
  }
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      visit(target);
    } else if (entry.isFile() && entry.name.endsWith(".lua")) {
      const contents = fs.readFileSync(target, "utf8");
      if (/Enhancement/iu.test(contents)) {
        errors.push(`lógica específica de Enhancement detectada em camada genérica: ${path.relative(root, target)}`);
      }
    }
  }
}
for (const directory of genericLuaRoots) {
  visit(path.join(root, "addon", directory));
}

if (errors.length > 0) {
  console.error(`layout:check encontrou ${errors.length} problema(s):`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Fronteiras e TOC validados.");
