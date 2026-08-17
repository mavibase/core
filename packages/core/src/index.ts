import type {
  BackendFramework,
  DatabaseProvider,
  Language,
  Runtime,
  WebFramework,
} from "@mavibase/config";

export const version = "0.1.0";

export type AppEnvironment = "development" | "test" | "production";

export interface AppFeatures {
  /** Enable auth generation */
  authentication?: boolean;

  /** Enable authorization and policies */
  authorization?: boolean;

  /** Enable validation generation */
  validation?: boolean;

  /** Enable rate limiting */
  rateLimiting?: boolean;

  /** Generate API clients */
  apiClients?: boolean;

  /** Generate tests */
  tests?: boolean;
}

export interface StackConfig {
  language: Language;
  runtime: Runtime;

  web?: {
    framework: WebFramework;
  };

  backend?: {
    framework: BackendFramework;
  };

  database?: {
    provider: DatabaseProvider;
  };
}

export interface DefinitionsRegistry {
  [name: string]: Record<string, unknown>;
}

export interface ModelDefinition {
  /** Stable identifier for the model */
  id: string;

  /** Human-readable model name */
  name: string;

  /** Model fields */
  fields?: Record<string, unknown>;

  /** Model relationships */
  relationships?: Record<string, unknown>;

  /** Database indexes */
  indexes?: unknown[];

  /** Database constraints */
  constraints?: unknown[];

  /** Additional model metadata */
  metadata?: Record<string, unknown>;
}

export interface DefineModelInput {
  name: string;
  id?: string;
  fields?: Record<string, unknown>;
  relationships?: Record<string, unknown>;
  indexes?: unknown[];
  constraints?: unknown[];
  metadata?: Record<string, unknown>;
}

export interface ApplicationDefinition {
  name: string;
  version: string;
  environment: AppEnvironment;
  stack: StackConfig;
  features?: AppFeatures;
  models?: ModelDefinition[];
  definitions?: DefinitionsRegistry;
}

/** Convert a model name into a stable identifier */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Define a model for the application */
export function defineModel(input: DefineModelInput): ModelDefinition {
  if (!input.name.trim()) {
    throw new Error("Model name must not be empty.");
  }

  const id = input.id ?? slugify(input.name);

  return {
    id,
    name: input.name,
    fields: input.fields ?? {},
    relationships: input.relationships ?? {},
    indexes: input.indexes ?? [],
    constraints: input.constraints ?? [],
    metadata: input.metadata ?? {},
  };
}

/** Define a Mavibase application */
export function defineApp(
  definition: ApplicationDefinition,
): ApplicationDefinition {
  if (!definition.name.trim()) {
    throw new Error("Application name must not be empty.");
  }

  if (!/^\d+\.\d+\.\d+/.test(definition.version)) {
    throw new Error(
      `Invalid application version: "${definition.version}". Expected semver.`,
    );
  }

  const models = definition.models ?? [];

  const seen = new Set<string>();

  for (const model of models) {
    if (seen.has(model.name)) {
      throw new Error(
        `Duplicate model name: "${model.name}". Model names must be unique.`,
      );
    }

    seen.add(model.name);
  }

  return {
    ...definition,
    models,
    definitions: definition.definitions ?? {},
  };
}