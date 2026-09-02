import fs from "node:fs";
import path from "node:path";
import { loadRotationFile, serializeRotationDocument } from "../dsl/parser.mjs";
import { CompilerError } from "./errors.mjs";
import { loadCompilerMapFile } from "./mapping.mjs";
import { compileDslToRuntime, serializeRuntimeJson, serializeRuntimeLua } from "./runtime.mjs";
import { compileDslToSimc, compileSimcToDsl } from "./simc.mjs";

const CONFIG_FIELDS = new Set([
  "schemaVersion",
  "source",
  "mapping",
  "expectedDsl",
  "expectedSimc",
  "expectedRuntimeJson",
  "expectedRuntimeLua",
]);

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function readInside(projectRoot, baseDirectory, relativeFile, label) {
  if (typeof relativeFile !== "string" || relativeFile.length === 0 || path.isAbsolute(relativeFile)) {
    throw new CompilerError("COMPILER_FIXTURE_PATH_INVALID", `${label} deve ser um caminho relativo não vazio.`, {
      label,
      file: relativeFile,
    });
  }
  const candidate = path.resolve(baseDirectory, relativeFile);
  if (!isInside(projectRoot, candidate)) {
    throw new CompilerError("COMPILER_FIXTURE_OUTSIDE_PROJECT", `${label} deve permanecer dentro do repositório.`, {
      label,
      file: relativeFile,
    });
  }
  if (!fs.statSync(candidate, { throwIfNoEntry: false })?.isFile()) {
    throw new CompilerError("COMPILER_FIXTURE_FILE_MISSING", `${label} não encontrado: ${relativeFile}.`, {
      label,
      file: relativeFile,
    });
  }
  const realFile = fs.realpathSync(candidate);
  if (!isInside(projectRoot, realFile)) {
    throw new CompilerError("COMPILER_FIXTURE_OUTSIDE_PROJECT", `${label} resolve por link para fora do repositório.`, {
      label,
      file: relativeFile,
    });
  }
  return { path: realFile, contents: fs.readFileSync(realFile, "utf8") };
}

function loadConfig(configFile, root) {
  const projectRoot = fs.realpathSync(path.resolve(root));
  const candidate = path.resolve(projectRoot, configFile);
  if (!isInside(projectRoot, candidate) || !candidate.toLowerCase().endsWith(".compiler-fixture.json")) {
    throw new CompilerError(
      "COMPILER_FIXTURE_CONFIG_INVALID",
      "A configuração deve ser um .compiler-fixture.json dentro do repositório.",
      { configFile }
    );
  }
  const configRead = readInside(projectRoot, projectRoot, path.relative(projectRoot, candidate), "Configuração");
  let config;
  try {
    config = JSON.parse(configRead.contents);
  } catch (error) {
    throw new CompilerError("COMPILER_FIXTURE_JSON_INVALID", "A configuração da fixture não contém JSON válido.", {
      configFile,
    }, { cause: error });
  }
  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    throw new CompilerError("COMPILER_FIXTURE_CONFIG_INVALID", "A configuração da fixture deve ser um objeto.");
  }
  const unknown = Object.keys(config).filter((field) => !CONFIG_FIELDS.has(field));
  const required = [...CONFIG_FIELDS].filter((field) => !Object.hasOwn(config, field));
  if (config.schemaVersion !== 1 || unknown.length > 0 || required.length > 0) {
    throw new CompilerError("COMPILER_FIXTURE_CONFIG_INVALID", "A configuração da fixture é incompatível.", {
      schemaVersion: config.schemaVersion,
      unknown,
      required,
    });
  }
  const directory = path.dirname(configRead.path);
  return { projectRoot, directory, config };
}

function firstDifference(expected, actual) {
  const expectedLines = expected.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
  const actualLines = actual.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
  const length = Math.max(expectedLines.length, actualLines.length);
  for (let index = 0; index < length; index += 1) {
    if (expectedLines[index] !== actualLines[index]) {
      return {
        line: index + 1,
        expected: expectedLines[index] ?? "<fim do arquivo>",
        actual: actualLines[index] ?? "<fim do arquivo>",
      };
    }
  }
  return null;
}

function assertGolden(artifact, expected, actual) {
  const difference = firstDifference(expected, actual);
  if (difference) {
    throw new CompilerError(
      "COMPILER_GOLDEN_DIVERGENCE",
      `O artefato ${artifact} divergiu na linha ${difference.line}.`,
      { artifact, ...difference }
    );
  }
}

export function buildCompilerFixture(configFile, { root = process.cwd() } = {}) {
  const fixture = loadConfig(configFile, root);
  const { projectRoot, directory, config } = fixture;
  const source = readInside(projectRoot, directory, config.source, "Fonte SimC");
  const mappingFile = readInside(projectRoot, directory, config.mapping, "Mapa").path;
  const mapping = loadCompilerMapFile(path.relative(projectRoot, mappingFile), { root: projectRoot });
  const document = compileSimcToDsl(source.contents, mapping, {
    source: path.relative(projectRoot, source.path).replaceAll("\\", "/"),
  });
  const runtime = compileDslToRuntime(document, mapping);
  return {
    document,
    mapping,
    runtime,
    artifacts: {
      dsl: serializeRotationDocument(document),
      simc: compileDslToSimc(document, mapping),
      runtimeJson: serializeRuntimeJson(runtime),
      runtimeLua: serializeRuntimeLua(runtime),
    },
    fixture,
  };
}

export function verifyCompilerFixture(configFile, { root = process.cwd() } = {}) {
  const built = buildCompilerFixture(configFile, { root });
  const { projectRoot, directory, config } = built.fixture;
  const expectedDslPath = readInside(projectRoot, directory, config.expectedDsl, "Golden DSL").path;
  const expectedDsl = loadRotationFile(path.relative(projectRoot, expectedDslPath), { root: projectRoot });
  const expectedArtifacts = {
    dsl: serializeRotationDocument(expectedDsl),
    simc: readInside(projectRoot, directory, config.expectedSimc, "Golden SimC").contents,
    runtimeJson: readInside(projectRoot, directory, config.expectedRuntimeJson, "Golden runtime JSON").contents,
    runtimeLua: readInside(projectRoot, directory, config.expectedRuntimeLua, "Golden runtime Lua").contents,
  };

  for (const artifact of ["dsl", "simc", "runtimeJson", "runtimeLua"]) {
    assertGolden(artifact, expectedArtifacts[artifact], built.artifacts[artifact]);
  }

  return {
    ok: true,
    id: built.document.id,
    version: built.document.version,
    digest: built.runtime.source.sha256,
    lists: built.runtime.lists.length,
    runtimeRules: built.runtime.lists.reduce((total, list) => total + list.rules.length, 0),
    excludedRules: built.runtime.excludedRules.length,
  };
}

export { firstDifference };
