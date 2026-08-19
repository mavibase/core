import {
  createDefaultStackRegistries,
  type StackCompatibilityIssue,
  type StackRegistries,
} from "./stack-compatibility.js";
import {
  defineStackConfiguration,
  validateStackConfiguration,
  type StackConfiguration,
} from "./stack-configuration.js";

export interface StackDefinition extends StackConfiguration {
  id: string;
  name: string;
  description?: string;
  metadata?: Readonly<Record<string, string>>;
}

export interface StackValidationIssue {
  path: string;
  code:
    | StackCompatibilityIssue["code"]
    | "invalid-identifier"
    | "invalid-name"
    | "invalid-description"
    | "invalid-metadata";
  message: string;
}

export class StackDefinitionError extends Error {
  readonly code = "MAVIBASE_STACK_DEFINITION_ERROR";
  readonly issues: readonly StackValidationIssue[];

  constructor(issues: readonly StackValidationIssue[]) {
    super(`Invalid stack definition: ${issues.map((issue) => issue.message).join(" ")}`);
    this.name = "StackDefinitionError";
    this.issues = issues;
  }
}

export class StackRegistryError extends Error {
  readonly code = "MAVIBASE_STACK_REGISTRY_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "StackRegistryError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateMetadata(value: unknown, issues: StackValidationIssue[]): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    issues.push({
      path: "metadata",
      code: "invalid-metadata",
      message: "Stack metadata must be an object.",
    });
    return;
  }

  for (const [key, metadataValue] of Object.entries(value)) {
    if (!isNonEmptyString(key) || !isNonEmptyString(metadataValue)) {
      issues.push({
        path: `metadata.${key}`,
        code: "invalid-metadata",
        message: "Stack metadata keys and values must be non-empty strings.",
      });
    }
  }
}

export function validateStackDefinition(
  definition: unknown,
  registries: StackRegistries = createDefaultStackRegistries(),
): StackValidationIssue[] {
  const issues: StackValidationIssue[] = [];

  if (!isRecord(definition)) {
    return [
      {
        path: "stack",
        code: "invalid-configuration",
        message: "Stack definition must be an object.",
      },
    ];
  }

  if (
    !isNonEmptyString(definition["id"]) ||
    !/^[a-z][a-z0-9-]*$/.test(definition["id"] as string)
  ) {
    issues.push({
      path: "id",
      code: "invalid-identifier",
      message:
        "Stack id must be a stable lowercase identifier using letters, numbers, and hyphens.",
    });
  }
  if (!isNonEmptyString(definition["name"])) {
    issues.push({
      path: "name",
      code: "invalid-name",
      message: "Stack name must not be empty.",
    });
  }
  if (definition["description"] !== undefined && !isNonEmptyString(definition["description"])) {
    issues.push({
      path: "description",
      code: "invalid-description",
      message: "Stack description must be a non-empty string when provided.",
    });
  }
  validateMetadata(definition["metadata"], issues);

  issues.push(...validateStackConfiguration(definition, registries));
  return issues;
}

export function defineStackDefinition(
  definition: StackDefinition,
  registries: StackRegistries = createDefaultStackRegistries(),
): StackDefinition {
  const issues = validateStackDefinition(definition, registries);
  if (issues.length > 0) {
    throw new StackDefinitionError(issues);
  }

  const configuration = defineStackConfiguration(definition, registries);
  return {
    id: definition.id,
    name: definition.name,
    ...(definition.description !== undefined ? { description: definition.description } : {}),
    ...(definition.metadata ? { metadata: { ...definition.metadata } } : {}),
    ...configuration,
  };
}

export class StackRegistry {
  private readonly definitions = new Map<string, StackDefinition>();
  readonly registries: StackRegistries;

  constructor(
    definitions: readonly StackDefinition[] = [],
    registries: StackRegistries = createDefaultStackRegistries(),
  ) {
    this.registries = registries;
    for (const definition of definitions) {
      this.register(definition);
    }
  }

  register(definition: StackDefinition): StackDefinition {
    const normalized = defineStackDefinition(definition, this.registries);
    if (this.definitions.has(normalized.id)) {
      throw new StackRegistryError(`Stack is already registered: "${normalized.id}".`);
    }
    this.definitions.set(normalized.id, normalized);
    return normalized;
  }

  has(id: string): boolean {
    return this.definitions.has(id);
  }

  get(id: string): StackDefinition | undefined {
    return this.definitions.get(id);
  }

  require(id: string): StackDefinition {
    const definition = this.get(id);
    if (!definition) {
      throw new StackRegistryError(`Stack is not registered: "${id}".`);
    }
    return definition;
  }

  validate(definition: unknown): StackValidationIssue[] {
    return validateStackDefinition(definition, this.registries);
  }

  list(): StackDefinition[] {
    return [...this.definitions.values()]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((definition) => defineStackDefinition(definition, this.registries));
  }
}

export const builtInStackDefinitions: readonly StackDefinition[] = [
  {
    id: "react-node-postgresql-pnpm",
    name: "React, Node.js, PostgreSQL, and pnpm",
    description: "A TypeScript React stack running on Node.js with PostgreSQL and pnpm.",
    framework: "react",
    runtime: "node",
    database: "postgresql",
    packageManager: "pnpm",
    metadata: { language: "typescript", category: "full-stack" },
  },
  {
    id: "express-node-postgresql-pnpm",
    name: "Express, Node.js, PostgreSQL, and pnpm",
    description: "A TypeScript Express stack running on Node.js with PostgreSQL and pnpm.",
    framework: "express",
    runtime: "node",
    database: "postgresql",
    packageManager: "pnpm",
    metadata: { language: "typescript", category: "full-stack" },
  },
  {
    id: "fastify-node-postgresql-npm",
    name: "Fastify, Node.js, PostgreSQL, and npm",
    description: "A TypeScript Fastify stack running on Node.js with PostgreSQL and npm.",
    framework: "fastify",
    runtime: "node",
    database: "postgresql",
    packageManager: "npm",
    metadata: { language: "typescript", category: "full-stack" },
  },
  {
    id: "react-bun-sqlite-bun",
    name: "React, Bun, SQLite, and Bun",
    description: "A TypeScript React stack running on Bun with SQLite and Bun.",
    framework: "react",
    runtime: "bun",
    database: "sqlite",
    packageManager: "bun",
    metadata: { language: "typescript", category: "full-stack" },
  },
];

export function createDefaultStackRegistry(): StackRegistry {
  return new StackRegistry(builtInStackDefinitions);
}
