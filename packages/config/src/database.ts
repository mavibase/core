import type { DatabaseProvider } from "./index.js";

export type DatabaseCategory = "relational" | "non-relational";

export interface DatabaseConfigurationRequirement {
  key: string;
  required: boolean;
  description?: string;
}

export interface DatabaseProviderDefinition {
  id: DatabaseProvider;
  name: string;
  category: DatabaseCategory;
  supportedVersions: readonly string[];
  capabilities: readonly string[];
  configuration?: readonly DatabaseConfigurationRequirement[];
  generator?: string;
  dependencies?: readonly string[];
  dependencyVersions?: Readonly<Record<string, string>>;
}

export interface DatabaseValidationIssue {
  path: string;
  message: string;
}

export class DatabaseProviderDefinitionError extends Error {
  readonly code = "MAVIBASE_DATABASE_PROVIDER_DEFINITION_ERROR";
  readonly issues: readonly DatabaseValidationIssue[];

  constructor(issues: readonly DatabaseValidationIssue[]) {
    super(
      `Invalid database provider definition: ${issues.map((issue) => issue.message).join(" ")}`,
    );
    this.name = "DatabaseProviderDefinitionError";
    this.issues = issues;
  }
}

export class DatabaseProviderRegistryError extends Error {
  readonly code = "MAVIBASE_DATABASE_PROVIDER_REGISTRY_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "DatabaseProviderRegistryError";
  }
}

const providerIds: readonly DatabaseProvider[] = ["postgresql", "mysql", "sqlite"];
const categories: readonly DatabaseCategory[] = ["relational", "non-relational"];

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
  issues: DatabaseValidationIssue[],
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

function validateConfiguration(value: unknown, issues: DatabaseValidationIssue[]): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    issues.push({ path: "configuration", message: "Database configuration must be an array." });
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
        message: "Database configuration requirements need a key and boolean required value.",
      });
      continue;
    }

    const key = requirement["key"] as string;
    if (keys.has(key)) {
      issues.push({
        path: `configuration[${index}].key`,
        message: `Database configuration keys must be unique: "${key}".`,
      });
    }
    keys.add(key);
  }
}

export function validateDatabaseProviderDefinition(definition: unknown): DatabaseValidationIssue[] {
  const issues: DatabaseValidationIssue[] = [];

  if (!isRecord(definition)) {
    return [{ path: "database", message: "Database provider definition must be an object." }];
  }

  if (!providerIds.includes(definition["id"] as DatabaseProvider)) {
    issues.push({
      path: "id",
      message: `Database provider id must be one of: ${providerIds.join(", ")}.`,
    });
  }

  if (!isNonEmptyString(definition["name"])) {
    issues.push({ path: "name", message: "Database provider name must not be empty." });
  }

  if (!categories.includes(definition["category"] as DatabaseCategory)) {
    issues.push({
      path: "category",
      message: `Database provider category must be one of: ${categories.join(", ")}.`,
    });
  }

  validateStringList(
    definition["supportedVersions"],
    "supportedVersions",
    "Database provider supported versions",
    issues,
  );
  validateStringList(
    definition["capabilities"],
    "capabilities",
    "Database provider capabilities",
    issues,
  );
  validateConfiguration(definition["configuration"], issues);

  if (definition["generator"] !== undefined && !isNonEmptyString(definition["generator"])) {
    issues.push({
      path: "generator",
      message: "Database provider generator must be a non-empty string when provided.",
    });
  }

  if (definition["dependencies"] !== undefined) {
    validateStringList(
      definition["dependencies"],
      "dependencies",
      "Database provider dependencies",
      issues,
    );
  }

  return issues;
}

export function defineDatabaseProvider(
  definition: DatabaseProviderDefinition,
): DatabaseProviderDefinition {
  const issues = validateDatabaseProviderDefinition(definition);
  if (issues.length > 0) {
    throw new DatabaseProviderDefinitionError(issues);
  }

  return {
    ...definition,
    supportedVersions: [...definition.supportedVersions],
    capabilities: [...definition.capabilities],
    ...(definition.configuration
      ? { configuration: definition.configuration.map((requirement) => ({ ...requirement })) }
      : {}),
    ...(definition.dependencies ? { dependencies: [...definition.dependencies] } : {}),
    ...(definition.dependencyVersions
      ? { dependencyVersions: { ...definition.dependencyVersions } }
      : {}),
  };
}

export class DatabaseProviderRegistry {
  private readonly definitions = new Map<DatabaseProvider, DatabaseProviderDefinition>();

  constructor(definitions: readonly DatabaseProviderDefinition[] = []) {
    for (const definition of definitions) {
      this.register(definition);
    }
  }

  register(definition: DatabaseProviderDefinition): DatabaseProviderDefinition {
    const normalized = defineDatabaseProvider(definition);
    if (this.definitions.has(normalized.id)) {
      throw new DatabaseProviderRegistryError(
        `Database provider is already registered: "${normalized.id}".`,
      );
    }
    this.definitions.set(normalized.id, normalized);
    return normalized;
  }

  has(id: string): boolean {
    return this.definitions.has(id as DatabaseProvider);
  }

  get(id: string): DatabaseProviderDefinition | undefined {
    return this.definitions.get(id as DatabaseProvider);
  }

  require(id: string): DatabaseProviderDefinition {
    const definition = this.get(id);
    if (!definition) {
      throw new DatabaseProviderRegistryError(`Database provider is not registered: "${id}".`);
    }
    return definition;
  }

  capabilities(id: string): readonly string[] {
    return this.require(id).capabilities;
  }

  supportedVersions(id: string): readonly string[] {
    return this.require(id).supportedVersions;
  }

  list(): DatabaseProviderDefinition[] {
    return [...this.definitions.values()]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((definition) => defineDatabaseProvider(definition));
  }
}

export const builtInDatabaseProviderDefinitions: readonly DatabaseProviderDefinition[] = [
  {
    id: "postgresql",
    name: "PostgreSQL",
    category: "relational",
    supportedVersions: [">=16"],
    capabilities: [
      "tables",
      "relations",
      "foreign-keys",
      "indexes",
      "unique-constraints",
      "check-constraints",
      "transactions",
      "json",
      "arrays",
      "enums",
      "composite-indexes",
      "generated-default-values",
    ],
    configuration: [{ key: "DATABASE_URL", required: true }],
    generator: "database-postgresql",
    dependencies: ["pg"],
    dependencyVersions: { pg: "^8.0.0" },
  },
  {
    id: "mysql",
    name: "MySQL",
    category: "relational",
    supportedVersions: [">=8"],
    capabilities: [
      "tables",
      "relations",
      "foreign-keys",
      "indexes",
      "unique-constraints",
      "check-constraints",
      "transactions",
      "json",
      "enums",
      "composite-indexes",
      "generated-default-values",
    ],
    configuration: [{ key: "DATABASE_URL", required: true }],
    generator: "database-mysql",
    dependencies: ["mysql2"],
    dependencyVersions: { mysql2: "^3.0.0" },
  },
  {
    id: "sqlite",
    name: "SQLite",
    category: "relational",
    supportedVersions: [">=3.35"],
    capabilities: [
      "tables",
      "relations",
      "foreign-keys",
      "indexes",
      "unique-constraints",
      "check-constraints",
      "transactions",
      "json",
      "generated-default-values",
    ],
    configuration: [{ key: "DATABASE_PATH", required: true }],
    generator: "database-sqlite",
    dependencies: ["better-sqlite3"],
    dependencyVersions: { "better-sqlite3": "^11.0.0" },
  },
];

export function createDefaultDatabaseProviderRegistry(): DatabaseProviderRegistry {
  return new DatabaseProviderRegistry(builtInDatabaseProviderDefinitions);
}
