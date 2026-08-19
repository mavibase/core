import type { Language, Runtime } from "./index.js";

export interface RuntimeConfigurationRequirement {
  key: string;
  required: boolean;
  description?: string;
}

export interface RuntimeDefinition {
  id: Runtime;
  name: string;
  supportedVersions: readonly string[];
  languages: readonly Language[];
  capabilities: readonly string[];
  packageManagers?: readonly string[];
  configuration?: readonly RuntimeConfigurationRequirement[];
}

export interface RuntimeValidationIssue {
  path: string;
  message: string;
}

export class RuntimeDefinitionError extends Error {
  readonly code = "MAVIBASE_RUNTIME_DEFINITION_ERROR";
  readonly issues: readonly RuntimeValidationIssue[];

  constructor(issues: readonly RuntimeValidationIssue[]) {
    super(`Invalid runtime definition: ${issues.map((issue) => issue.message).join(" ")}`);
    this.name = "RuntimeDefinitionError";
    this.issues = issues;
  }
}

export class RuntimeRegistryError extends Error {
  readonly code = "MAVIBASE_RUNTIME_REGISTRY_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "RuntimeRegistryError";
  }
}

const runtimeIds: readonly Runtime[] = ["node", "bun", "deno"];
const languageIds: readonly Language[] = ["javascript", "typescript"];

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
  issues: RuntimeValidationIssue[],
  required: boolean,
): void {
  if (!Array.isArray(values) || (required && values.length === 0)) {
    issues.push({
      path,
      message: required
        ? `${label} must contain at least one value.`
        : `${label} must be an array.`,
    });
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

function validateConfiguration(value: unknown, issues: RuntimeValidationIssue[]): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    issues.push({ path: "configuration", message: "Runtime configuration must be an array." });
    return;
  }

  const keys = new Set<string>();
  for (const [index, requirement] of value.entries()) {
    if (
      !isRecord(requirement) ||
      !isNonEmptyString(requirement["key"]) ||
      typeof requirement["required"] !== "boolean"
    ) {
      issues.push({
        path: `configuration[${index}]`,
        message: "Runtime configuration requirements need a key and boolean required value.",
      });
      continue;
    }

    const key = requirement["key"] as string;
    if (keys.has(key)) {
      issues.push({
        path: `configuration[${index}].key`,
        message: `Runtime configuration keys must be unique: "${key}".`,
      });
    }
    keys.add(key);
  }
}

export function validateRuntimeDefinition(definition: unknown): RuntimeValidationIssue[] {
  const issues: RuntimeValidationIssue[] = [];

  if (!isRecord(definition)) {
    return [{ path: "runtime", message: "Runtime definition must be an object." }];
  }

  if (!runtimeIds.includes(definition["id"] as Runtime)) {
    issues.push({
      path: "id",
      message: `Runtime id must be one of: ${runtimeIds.join(", ")}.`,
    });
  }

  if (!isNonEmptyString(definition["name"])) {
    issues.push({ path: "name", message: "Runtime name must not be empty." });
  }

  validateStringList(
    definition["supportedVersions"],
    "supportedVersions",
    "Runtime supported versions",
    issues,
    true,
  );

  validateStringList(definition["languages"], "languages", "Runtime languages", issues, true);
  if (Array.isArray(definition["languages"])) {
    for (const [index, language] of definition["languages"].entries()) {
      if (!languageIds.includes(language as Language)) {
        issues.push({
          path: `languages[${index}]`,
          message: `Unknown language reference: "${String(language)}".`,
        });
      }
    }
  }

  validateStringList(
    definition["capabilities"],
    "capabilities",
    "Runtime capabilities",
    issues,
    true,
  );
  validateStringList(
    definition["packageManagers"],
    "packageManagers",
    "Runtime package managers",
    issues,
    false,
  );
  validateConfiguration(definition["configuration"], issues);

  return issues;
}

export function defineRuntime(definition: RuntimeDefinition): RuntimeDefinition {
  const issues = validateRuntimeDefinition(definition);
  if (issues.length > 0) {
    throw new RuntimeDefinitionError(issues);
  }

  return {
    ...definition,
    supportedVersions: [...definition.supportedVersions],
    languages: [...definition.languages],
    capabilities: [...definition.capabilities],
    ...(definition.packageManagers ? { packageManagers: [...definition.packageManagers] } : {}),
    ...(definition.configuration
      ? { configuration: definition.configuration.map((requirement) => ({ ...requirement })) }
      : {}),
  };
}

export class RuntimeRegistry {
  private readonly definitions = new Map<Runtime, RuntimeDefinition>();

  constructor(definitions: readonly RuntimeDefinition[] = []) {
    for (const definition of definitions) {
      this.register(definition);
    }
  }

  register(definition: RuntimeDefinition): RuntimeDefinition {
    const normalized = defineRuntime(definition);
    if (this.definitions.has(normalized.id)) {
      throw new RuntimeRegistryError(`Runtime is already registered: "${normalized.id}".`);
    }
    this.definitions.set(normalized.id, normalized);
    return normalized;
  }

  has(id: string): boolean {
    return this.definitions.has(id as Runtime);
  }

  get(id: string): RuntimeDefinition | undefined {
    return this.definitions.get(id as Runtime);
  }

  require(id: string): RuntimeDefinition {
    const definition = this.get(id);
    if (!definition) {
      throw new RuntimeRegistryError(`Runtime is not registered: "${id}".`);
    }
    return definition;
  }

  capabilities(id: string): readonly string[] {
    return this.require(id).capabilities;
  }

  supportedVersions(id: string): readonly string[] {
    return this.require(id).supportedVersions;
  }

  languages(id: string): readonly Language[] {
    return this.require(id).languages;
  }

  list(): RuntimeDefinition[] {
    return [...this.definitions.values()]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((definition) => defineRuntime(definition));
  }
}

export const builtInRuntimeDefinitions: readonly RuntimeDefinition[] = [
  {
    id: "node",
    name: "Node.js",
    supportedVersions: [">=20"],
    languages: ["javascript", "typescript"],
    capabilities: ["esm", "commonjs", "environment-variables", "filesystem", "network", "fetch"],
    packageManagers: ["npm", "pnpm", "yarn", "bun"],
  },
  {
    id: "bun",
    name: "Bun",
    supportedVersions: [">=1"],
    languages: ["javascript", "typescript"],
    capabilities: [
      "esm",
      "commonjs",
      "environment-variables",
      "filesystem",
      "network",
      "fetch",
      "workers",
    ],
    packageManagers: ["bun"],
  },
  {
    id: "deno",
    name: "Deno",
    supportedVersions: [">=1"],
    languages: ["javascript", "typescript"],
    capabilities: ["esm", "environment-variables", "filesystem", "network", "fetch", "workers"],
    packageManagers: ["bun"],
  },
];

export function createDefaultRuntimeRegistry(): RuntimeRegistry {
  return new RuntimeRegistry(builtInRuntimeDefinitions);
}
