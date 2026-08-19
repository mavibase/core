import type { Language, Runtime } from "./index.js";

export type FrameworkCategory = "frontend" | "backend" | "full-stack";

export interface FrameworkConfigurationRequirement {
  key: string;
  required: boolean;
  description?: string;
}

export interface FrameworkDefinition {
  id: string;
  name: string;
  category: FrameworkCategory;
  runtimes: readonly Runtime[];
  languages: readonly Language[];
  capabilities: readonly string[];
  configuration?: readonly FrameworkConfigurationRequirement[];
  generator?: string;
  version?: string;
  supportedVersions?: readonly string[];
}

export interface FrameworkValidationIssue {
  path: string;
  message: string;
}

export class FrameworkDefinitionError extends Error {
  readonly code = "MAVIBASE_FRAMEWORK_DEFINITION_ERROR";
  readonly issues: readonly FrameworkValidationIssue[];

  constructor(issues: readonly FrameworkValidationIssue[]) {
    super(`Invalid framework definition: ${issues.map((issue) => issue.message).join(" ")}`);
    this.name = "FrameworkDefinitionError";
    this.issues = issues;
  }
}

export class FrameworkRegistryError extends Error {
  readonly code = "MAVIBASE_FRAMEWORK_REGISTRY_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "FrameworkRegistryError";
  }
}

const frameworkCategories: readonly FrameworkCategory[] = ["frontend", "backend", "full-stack"];
const runtimes: readonly Runtime[] = ["node", "bun", "deno"];
const languages: readonly Language[] = ["typescript"];

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
  issues: FrameworkValidationIssue[],
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

export function validateFrameworkDefinition(definition: unknown): FrameworkValidationIssue[] {
  const issues: FrameworkValidationIssue[] = [];

  if (!isRecord(definition)) {
    return [{ path: "framework", message: "Framework definition must be an object." }];
  }

  if (
    !isNonEmptyString(definition["id"]) ||
    !/^[a-z][a-z0-9-]*$/.test(definition["id"] as string)
  ) {
    issues.push({
      path: "id",
      message:
        "Framework id must be a stable lowercase identifier using letters, numbers, and hyphens.",
    });
  }

  if (!isNonEmptyString(definition["name"])) {
    issues.push({ path: "name", message: "Framework name must not be empty." });
  }

  if (!frameworkCategories.includes(definition["category"] as FrameworkCategory)) {
    issues.push({
      path: "category",
      message: `Framework category must be one of: ${frameworkCategories.join(", ")}.`,
    });
  }

  validateStringList(definition["runtimes"], "runtimes", "Framework runtimes", issues);
  if (Array.isArray(definition["runtimes"])) {
    for (const [index, runtime] of definition["runtimes"].entries()) {
      if (!runtimes.includes(runtime as Runtime)) {
        issues.push({
          path: `runtimes[${index}]`,
          message: `Unknown runtime reference: "${String(runtime)}".`,
        });
      }
    }
  }

  validateStringList(definition["languages"], "languages", "Framework languages", issues);
  if (Array.isArray(definition["languages"])) {
    for (const [index, language] of definition["languages"].entries()) {
      if (!languages.includes(language as Language)) {
        issues.push({
          path: `languages[${index}]`,
          message: `Unknown language reference: "${String(language)}".`,
        });
      }
    }
  }

  validateStringList(definition["capabilities"], "capabilities", "Framework capabilities", issues);

  if (definition["configuration"] !== undefined) {
    if (!Array.isArray(definition["configuration"])) {
      issues.push({ path: "configuration", message: "Framework configuration must be an array." });
    } else {
      const keys = new Set<string>();
      for (const [index, requirement] of definition["configuration"].entries()) {
        if (
          !isRecord(requirement) ||
          !isNonEmptyString(requirement["key"]) ||
          typeof requirement["required"] !== "boolean"
        ) {
          issues.push({
            path: `configuration[${index}]`,
            message: "Framework configuration requirements need a key and boolean required value.",
          });
          continue;
        }
        const key = requirement["key"] as string;
        if (keys.has(key)) {
          issues.push({
            path: `configuration[${index}].key`,
            message: `Framework configuration keys must be unique: "${key}".`,
          });
        }
        keys.add(key);
      }
    }
  }

  for (const key of ["generator", "version"]) {
    if (definition[key] !== undefined && !isNonEmptyString(definition[key])) {
      issues.push({
        path: key,
        message: `Framework ${key} must be a non-empty string when provided.`,
      });
    }
  }

  if (definition["supportedVersions"] !== undefined) {
    validateStringList(
      definition["supportedVersions"],
      "supportedVersions",
      "Framework supported versions",
      issues,
    );
  }

  return issues;
}

export function defineFramework(definition: FrameworkDefinition): FrameworkDefinition {
  const issues = validateFrameworkDefinition(definition);
  if (issues.length > 0) {
    throw new FrameworkDefinitionError(issues);
  }

  return {
    ...definition,
    runtimes: [...definition.runtimes],
    languages: [...definition.languages],
    capabilities: [...definition.capabilities],
    ...(definition.configuration
      ? { configuration: definition.configuration.map((requirement) => ({ ...requirement })) }
      : {}),
    ...(definition.supportedVersions
      ? { supportedVersions: [...definition.supportedVersions] }
      : {}),
  };
}

export class FrameworkRegistry {
  private readonly definitions = new Map<string, FrameworkDefinition>();

  constructor(definitions: readonly FrameworkDefinition[] = []) {
    for (const definition of definitions) {
      this.register(definition);
    }
  }

  register(definition: FrameworkDefinition): FrameworkDefinition {
    const normalized = defineFramework(definition);
    if (this.definitions.has(normalized.id)) {
      throw new FrameworkRegistryError(`Framework is already registered: "${normalized.id}".`);
    }
    this.definitions.set(normalized.id, normalized);
    return normalized;
  }

  has(id: string): boolean {
    return this.definitions.has(id);
  }

  get(id: string): FrameworkDefinition | undefined {
    return this.definitions.get(id);
  }

  require(id: string): FrameworkDefinition {
    const definition = this.get(id);
    if (!definition) {
      throw new FrameworkRegistryError(`Framework is not registered: "${id}".`);
    }
    return definition;
  }

  capabilities(id: string): readonly string[] {
    return this.require(id).capabilities;
  }

  list(): FrameworkDefinition[] {
    return [...this.definitions.values()]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((definition) => defineFramework(definition));
  }
}

export const builtInFrameworkDefinitions: readonly FrameworkDefinition[] = [
  {
    id: "react",
    name: "React",
    category: "frontend",
    runtimes: ["node", "bun"],
    languages: ["typescript"],
    capabilities: ["client-rendering", "component-based-ui"],
    generator: "frontend-react",
  },
  {
    id: "express",
    name: "Express",
    category: "backend",
    runtimes: ["node"],
    languages: ["typescript"],
    capabilities: ["http-server", "routing", "middleware"],
    generator: "backend-express",
  },
  {
    id: "fastify",
    name: "Fastify",
    category: "backend",
    runtimes: ["node"],
    languages: ["typescript"],
    capabilities: ["http-server", "routing", "schema-validation"],
    generator: "backend-fastify",
  },
  {
    id: "nextjs",
    name: "Next.js",
    category: "full-stack",
    runtimes: ["node"],
    languages: ["typescript"],
    capabilities: ["client-rendering", "server-rendering", "routing"],
    generator: "full-stack-nextjs",
  },
  {
    id: "vue",
    name: "Vue",
    category: "frontend",
    runtimes: ["node", "bun"],
    languages: ["typescript"],
    capabilities: ["client-rendering", "component-based-ui"],
    generator: "frontend-vue",
  },
  {
    id: "svelte",
    name: "Svelte",
    category: "frontend",
    runtimes: ["node", "bun"],
    languages: ["typescript"],
    capabilities: ["client-rendering", "component-based-ui"],
    generator: "frontend-svelte",
  },
  {
    id: "nestjs",
    name: "NestJS",
    category: "backend",
    runtimes: ["node"],
    languages: ["typescript"],
    capabilities: ["http-server", "routing", "dependency-injection"],
    generator: "backend-nestjs",
  },
  {
    id: "hono",
    name: "Hono",
    category: "backend",
    runtimes: ["node", "bun", "deno"],
    languages: ["typescript"],
    capabilities: ["http-server", "routing", "edge-runtime"],
    generator: "backend-hono",
  },
];

export function createDefaultFrameworkRegistry(): FrameworkRegistry {
  return new FrameworkRegistry(builtInFrameworkDefinitions);
}
