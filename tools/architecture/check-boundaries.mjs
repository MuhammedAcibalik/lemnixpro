import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();
const sourceRoots = ["apps", "services", "packages"];
const ignoredDirectoryNames = new Set([
  ".git",
  ".next",
  ".turbo",
  "coverage",
  "dist",
  "node_modules"
]);
const sourceExtensions = new Set([".ts", ".tsx", ".mts", ".cts"]);
const importPattern =
  /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;

const violations = [];
const files = sourceRoots.flatMap((root) => walk(path.join(workspaceRoot, root)));

for (const filePath of files) {
  const relativeFilePath = toWorkspacePath(filePath);
  const source = readFileSync(filePath, "utf8");

  for (const importPath of readImports(source)) {
    inspectImport(relativeFilePath, filePath, importPath);
  }
}

if (violations.length > 0) {
  console.error("Architecture boundary check failed:");

  for (const violation of violations) {
    console.error(`- ${violation}`);
  }

  process.exitCode = 1;
} else {
  console.log("Architecture boundary check passed.");
}

function walk(directoryPath) {
  if (!existsSync(directoryPath)) {
    return [];
  }

  const entries = readdirSync(directoryPath);
  const filePaths = [];

  for (const entry of entries) {
    const absolutePath = path.join(directoryPath, entry);
    const stat = statSync(absolutePath);

    if (stat.isDirectory()) {
      if (!ignoredDirectoryNames.has(entry)) {
        filePaths.push(...walk(absolutePath));
      }

      continue;
    }

    if (sourceExtensions.has(path.extname(entry))) {
      filePaths.push(absolutePath);
    }
  }

  return filePaths;
}

function readImports(source) {
  const imports = [];
  let match;

  while ((match = importPattern.exec(source)) !== null) {
    const importPath = match[1] ?? match[2];

    if (importPath) {
      imports.push(importPath);
    }
  }

  return imports;
}

function inspectImport(relativeFilePath, absoluteFilePath, importPath) {
  const owner = getWorkspaceOwner(relativeFilePath);

  if (!owner) {
    return;
  }

  if (importPath.startsWith("@lemnixpro/")) {
    inspectPackageImport(owner, relativeFilePath, importPath);
    return;
  }

  if (!importPath.startsWith(".")) {
    return;
  }

  const resolvedPath = toWorkspacePath(
    path.resolve(path.dirname(absoluteFilePath), importPath)
  );
  const resolvedOwner = getWorkspaceOwner(resolvedPath);

  if (!resolvedOwner) {
    return;
  }

  if (
    owner.kind === "service" &&
    resolvedOwner.kind === "service" &&
    owner.name !== resolvedOwner.name
  ) {
    violations.push(
      `${relativeFilePath} imports another service boundary via "${importPath}". Use HTTP/RabbitMQ contracts instead.`
    );
  }

  if (owner.kind === "app" && resolvedOwner.kind === "service") {
    violations.push(
      `${relativeFilePath} imports service code via "${importPath}". apps/web must call internal APIs or shared contracts only.`
    );
  }

  if (owner.kind === "package" && resolvedOwner.kind !== "package") {
    violations.push(
      `${relativeFilePath} imports runtime application code via "${importPath}". shared packages must stay domain-neutral.`
    );
  }
}

function inspectPackageImport(owner, relativeFilePath, importPath) {
  const packageName = importPath.split("/").slice(0, 2).join("/");
  const allowedSharedPackages = new Set([
    "@lemnixpro/shared-contracts",
    "@lemnixpro/shared-types",
    "@lemnixpro/shared-utils"
  ]);

  if (!allowedSharedPackages.has(packageName)) {
    violations.push(
      `${relativeFilePath} imports non-shared workspace package "${packageName}".`
    );
  }

  if (
    owner.kind === "package" &&
    owner.name !== packageName.replace("@lemnixpro/", "") &&
    packageName === "@lemnixpro/shared-utils"
  ) {
    return;
  }
}

function getWorkspaceOwner(workspacePath) {
  const normalizedPath = workspacePath.replaceAll("\\", "/");
  const [kind, name, segment] = normalizedPath.split("/");

  if (
    (kind === "apps" || kind === "services" || kind === "packages") &&
    name &&
    segment
  ) {
    return {
      kind: kind.slice(0, -1),
      name
    };
  }

  return null;
}

function toWorkspacePath(filePath) {
  return path.relative(workspaceRoot, filePath).replaceAll("\\", "/");
}
