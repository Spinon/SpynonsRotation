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
  "tests/project",
  "tests/rotation-lab",
  "assets/brand",
  "docs/product",
  "docs/architecture",
  "docs/project",
  "tasks",
];
const requiredFiles = [
  "addon/SpynonRotation.toc",
  "addon/Core/Bootstrap.lua",
  "addon/Core/Namespace.lua",
  "addon/Core/Contracts/Action.lua",
  "addon/Core/Contracts/Capability.lua",
  "addon/Core/Contracts/CombatContext.lua",
  "addon/Core/Contracts/PlayerState.lua",
  "addon/Core/Contracts/Recommendation.lua",
  "addon/Core/Contracts/SpecModule.lua",
  "addon/Core/SpecRegistry.lua",
  "addon/Core/SpecDetector.lua",
  "addon/Compat/SafeCall.lua",
  "addon/Compat/Result.lua",
  "addon/Compat/Build.lua",
  "addon/Compat/Specialization.lua",
  "addon/Compat/Talents.lua",
  "addon/Compat/Secrets.lua",
  "addon/Compat/Facade.lua",
  "docs/architecture/COMPAT.md",
  "docs/architecture/CONTRACTS.md",
  "docs/architecture/SPEC_REGISTRY.md",
  "docs/architecture/SPEC_DETECTION.md",
  "tests/fixtures/specs/neutral_talent_environment.lua",
  "tests/fixtures/specs/neutral_vanguard.lua",
  "tests/unit/compat_spec.lua",
  "tests/unit/spec_registry_spec.lua",
  "tests/unit/spec_detector_spec.lua",
  "AGENTS.md",
  "project-board.json",
  "docs/project/BOARD_GOVERNANCE.md",
  "docs/project/project-board.schema.json",
  "tools/toolchain/pins.json",
  "rotation-lab/simc/cli.mjs",
  "rotation-lab/simc/runner.mjs",
  "rotation-lab/fixtures/simc-cli-smoke.simc",
  "tests/rotation-lab/simc-runner.test.mjs",
  "docs/architecture/SIMC_RUNNER.md",
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

const volatileApiPatterns = [
  { name: "GetBuildInfo", pattern: /\bGetBuildInfo\s*\(/u },
  { name: "C_SpecializationInfo", pattern: /\bC_SpecializationInfo\b/u },
  { name: "C_ClassTalents", pattern: /\bC_ClassTalents\b/u },
  { name: "C_Traits", pattern: /\bC_Traits\b/u },
  { name: "C_Secrets", pattern: /\bC_Secrets\b/u },
];

function checkApiBoundary(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      checkApiBoundary(target);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".lua")) {
      continue;
    }

    const relative = path.relative(path.join(root, "addon"), target).replaceAll("\\", "/");
    if (relative.startsWith("Compat/")) {
      continue;
    }

    const contents = fs.readFileSync(target, "utf8");
    for (const api of volatileApiPatterns) {
      if (api.pattern.test(contents)) {
        errors.push(`API volátil ${api.name} usada fora de addon/Compat: addon/${relative}`);
      }
    }
  }
}
checkApiBoundary(path.join(root, "addon"));

if (errors.length > 0) {
  console.error(`layout:check encontrou ${errors.length} problema(s):`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Fronteiras e TOC validados.");
