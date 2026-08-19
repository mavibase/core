import type { PackageManager } from "./index.js";

export interface PackageManagerCommands {
  install: string;
  add: string;
  remove: string;
  run: string;
  exec: string;
}

export interface PackageManagerFileMetadata {
  manifest: string;
  lockfiles: readonly string[];
}

export interface PackageManagerDefinition {
  id: PackageManager;
  name: string;
  supportedVersions: readonly string[];
  commands: PackageManagerCommands;
  files: PackageManagerFileMetadata;
  capabilities?: readonly string[];
}

export interface PackageManagerValidationIssue {
  path: string;
  message: string;
}

export class PackageManagerDefinitionError extends Error {
  readonly code = "MAVIBASE_PACKAGE_MANAGER_DEFINITION_ERROR";
  readonly issues: readonly PackageManagerValidationIssue[];

  constructor(issues: readonly PackageManagerValidationIssue[]) {
    super(`Invalid package manager definition: ${issues.map((issue) => issue.message).join(" ")}`);
    this.name = "PackageManagerDefinitionError";
    this.issues = issues;
  }
}

export class PackageManagerRegistryError extends Error {
  readonly code = "MAVIBASE_PACKAGE_MANAGER_REGISTRY_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "PackageManagerRegistryError";
  }
}

const packageManagerIds: readonly PackageManager[] = ["npm", "pnpm", "yarn", "bun"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateStringList(
  values: unknown,
  path: string,
  label: string,
  issues: PackageManagerValidationIssue[],
): void {
  if (!Array.isArray(values) || values.length === 0) {
    issues.push({ path, message: `${label} must contain at least one value.` });
    return;
  }

  const seen = new Set<string>();
  for (const [index, value] of values.entries()) {
    if (!isNonEmptyString(value)) {
      issues.push({
        path: `${path}[${index}]`,
        message: `${label} must contain non-empty strings.`,
      });
      continue;
    }
    if (seen.has(value)) {
      issues.push({
        path: `${path}[${index}]`,
        message: `${label} must not contain duplicate values: "${value}".`,
      });
    }
    seen.add(value);
  }
}

function validateCommands(value: unknown, issues: PackageManagerValidationIssue[]): void {
  if (!isRecord(value)) {
    issues.push({ path: "commands", message: "Package manager commands must be an object." });
    return;
  }

  for (const command of ["install", "add", "remove", "run", "exec"]) {
    if (!isNonEmptyString(value[command])) {
      issues.push({
        path: `commands.${command}`,
        message: `Package manager ${command} command must not be empty.`,
      });
    }
  }
}

function validateFiles(value: unknown, issues: PackageManagerValidationIssue[]): void {
  if (!isRecord(value)) {
    issues.push({ path: "files", message: "Package manager files must be an object." });
    return;
  }

  if (!isNonEmptyString(value["manifest"])) {
    issues.push({ path: "files.manifest", message: "Package manager manifest must not be empty." });
  }
  validateStringList(value["lockfiles"], "files.lockfiles", "Package manager lockfiles", issues);
}

export function validatePackageManagerDefinition(
  definition: unknown,
): PackageManagerValidationIssue[] {
  const issues: PackageManagerValidationIssue[] = [];

  if (!isRecord(definition)) {
    return [{ path: "packageManager", message: "Package manager definition must be an object." }];
  }

  if (!packageManagerIds.includes(definition["id"] as PackageManager)) {
    issues.push({
      path: "id",
      message: `Package manager id must be one of: ${packageManagerIds.join(", ")}.`,
    });
  }
  if (!isNonEmptyString(definition["name"])) {
    issues.push({ path: "name", message: "Package manager name must not be empty." });
  }
  validateStringList(
    definition["supportedVersions"],
    "supportedVersions",
    "Package manager supported versions",
    issues,
  );
  validateCommands(definition["commands"], issues);
  validateFiles(definition["files"], issues);

  if (definition["capabilities"] !== undefined) {
    validateStringList(
      definition["capabilities"],
      "capabilities",
      "Package manager capabilities",
      issues,
    );
  }

  return issues;
}

export function definePackageManager(
  definition: PackageManagerDefinition,
): PackageManagerDefinition {
  const issues = validatePackageManagerDefinition(definition);
  if (issues.length > 0) {
    throw new PackageManagerDefinitionError(issues);
  }

  return {
    ...definition,
    supportedVersions: [...definition.supportedVersions],
    commands: { ...definition.commands },
    files: {
      ...definition.files,
      lockfiles: [...definition.files.lockfiles],
    },
    ...(definition.capabilities ? { capabilities: [...definition.capabilities] } : {}),
  };
}

export class PackageManagerRegistry {
  private readonly definitions = new Map<PackageManager, PackageManagerDefinition>();

  constructor(definitions: readonly PackageManagerDefinition[] = []) {
    for (const definition of definitions) {
      this.register(definition);
    }
  }

  register(definition: PackageManagerDefinition): PackageManagerDefinition {
    const normalized = definePackageManager(definition);
    if (this.definitions.has(normalized.id)) {
      throw new PackageManagerRegistryError(
        `Package manager is already registered: "${normalized.id}".`,
      );
    }
    this.definitions.set(normalized.id, normalized);
    return normalized;
  }

  has(id: string): boolean {
    return this.definitions.has(id as PackageManager);
  }

  get(id: string): PackageManagerDefinition | undefined {
    return this.definitions.get(id as PackageManager);
  }

  require(id: string): PackageManagerDefinition {
    const definition = this.get(id);
    if (!definition) {
      throw new PackageManagerRegistryError(`Package manager is not registered: "${id}".`);
    }
    return definition;
  }

  commands(id: string): PackageManagerCommands {
    return this.require(id).commands;
  }

  list(): PackageManagerDefinition[] {
    return [...this.definitions.values()]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((definition) => definePackageManager(definition));
  }
}

export const builtInPackageManagerDefinitions: readonly PackageManagerDefinition[] = [
  {
    id: "npm",
    name: "npm",
    supportedVersions: [">=10"],
    commands: {
      install: "npm install",
      add: "npm install",
      remove: "npm uninstall",
      run: "npm run",
      exec: "npx",
    },
    files: { manifest: "package.json", lockfiles: ["package-lock.json"] },
    capabilities: ["workspaces", "package-scripts"],
  },
  {
    id: "pnpm",
    name: "pnpm",
    supportedVersions: [">=9"],
    commands: {
      install: "pnpm install",
      add: "pnpm add",
      remove: "pnpm remove",
      run: "pnpm run",
      exec: "pnpm exec",
    },
    files: { manifest: "package.json", lockfiles: ["pnpm-lock.yaml"] },
    capabilities: ["workspaces", "package-scripts", "content-addressable-store"],
  },
  {
    id: "yarn",
    name: "Yarn",
    supportedVersions: [">=4"],
    commands: {
      install: "yarn install",
      add: "yarn add",
      remove: "yarn remove",
      run: "yarn",
      exec: "yarn dlx",
    },
    files: { manifest: "package.json", lockfiles: ["yarn.lock"] },
    capabilities: ["workspaces", "package-scripts", "plug-and-play"],
  },
  {
    id: "bun",
    name: "Bun",
    supportedVersions: [">=1"],
    commands: {
      install: "bun install",
      add: "bun add",
      remove: "bun remove",
      run: "bun run",
      exec: "bunx",
    },
    files: { manifest: "package.json", lockfiles: ["bun.lock"] },
    capabilities: ["workspaces", "package-scripts", "runtime-integration"],
  },
];

export function createDefaultPackageManagerRegistry(): PackageManagerRegistry {
  return new PackageManagerRegistry(builtInPackageManagerDefinitions);
}
