import type { ApplicationGraph } from "@mavibase/application-graph";
import type {
  DatabaseProviderCapabilities,
  SchemaNormalizationOptions,
} from "./schema-normalizer.js";
import { normalizeDatabaseSchema } from "./schema-normalizer.js";
import type {
  DatabaseSchemaDefinition,
  DatabaseSeedDefinition,
} from "@mavibase/core";
import type { GeneratedFile } from "./index.js";
import { generatePostgreSQLMigration } from "./migration-generator.js";
import { generatePostgreSQLSchema } from "./postgresql-generator.js";
import { generatePostgreSQLSeeds } from "./seed-generator.js";

export type DatabaseProviderId = "postgresql" | "mysql" | "sqlite";

export interface DatabaseGenerationOptions {
  provider?: DatabaseProviderId;
  seeds?: readonly DatabaseSeedDefinition[];
  previousSchema?: DatabaseSchemaDefinition;
  allowDestructive?: boolean;
}

export interface DatabaseGeneratorContext {
  previousSchema?: DatabaseSchemaDefinition;
  allowDestructive?: boolean;
}

export interface DatabaseGenerator {
  provider: DatabaseProviderId;
  capabilities: DatabaseProviderCapabilities;
  generate(
    schema: ReturnType<typeof normalizeDatabaseSchema>,
    context: DatabaseGeneratorContext,
  ): readonly GeneratedFile[];
}

export class DatabaseGeneratorRegistryError extends Error {
  readonly code = "MAVIBASE_DATABASE_GENERATOR_REGISTRY_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "DatabaseGeneratorRegistryError";
  }
}

export class DatabaseGeneratorRegistry {
  private readonly generators = new Map<DatabaseProviderId, DatabaseGenerator>();

  register(generator: DatabaseGenerator): DatabaseGenerator {
    if (this.generators.has(generator.provider)) {
      throw new DatabaseGeneratorRegistryError(
        `Database generator is already registered: "${generator.provider}".`,
      );
    }
    this.generators.set(generator.provider, generator);
    return generator;
  }

  get(provider: DatabaseProviderId): DatabaseGenerator | undefined {
    return this.generators.get(provider);
  }

  require(provider: DatabaseProviderId): DatabaseGenerator {
    const generator = this.get(provider);
    if (!generator) {
      throw new DatabaseGeneratorRegistryError(
        `Database generator is not registered for provider: "${provider}".`,
      );
    }
    return generator;
  }

  list(): readonly DatabaseGenerator[] {
    return [...this.generators.values()].sort((left, right) =>
      left.provider.localeCompare(right.provider),
    );
  }
}

const postgresqlCapabilities: DatabaseProviderCapabilities = {
  scalarTypes: [
    "string",
    "text",
    "integer",
    "float",
    "decimal",
    "boolean",
    "date",
    "uuid",
    "datetime",
    "json",
    "bigint",
  ],
  features: new Set(["arrays", "enums"]),
  constraints: new Set(["primary", "foreign-key", "unique", "check"]),
  indexes: { composite: true, unique: true },
  migrationOperations: new Set([
    "create-table",
    "drop-table",
    "add-column",
    "drop-column",
    "alter-column",
    "create-index",
    "drop-index",
    "add-constraint",
    "drop-constraint",
  ]),
  supportsDestructiveMigrations: false,
};

const postgresqlGenerator: DatabaseGenerator = {
  provider: "postgresql",
  capabilities: postgresqlCapabilities,
  generate(schema, context) {
    const artifacts: GeneratedFile[] = [generatePostgreSQLSchema(schema)];
    if (schema.seeds.length > 0) {
      artifacts.push(generatePostgreSQLSeeds(schema, schema.seeds));
    }
    if (context.previousSchema) {
      artifacts.push(
        generatePostgreSQLMigration(
          context.previousSchema,
          schema,
          context.allowDestructive === undefined
            ? {}
            : { allowDestructive: context.allowDestructive },
        ),
      );
    }
    return artifacts;
  },
};

export function createDefaultDatabaseGeneratorRegistry(): DatabaseGeneratorRegistry {
  const registry = new DatabaseGeneratorRegistry();
  registry.register(postgresqlGenerator);
  return registry;
}

export function databaseProviderFromGraph(graph: ApplicationGraph): DatabaseProviderId | undefined {
  const application = graph.nodes.find((node) => node.type === "application");
  const stack = application?.data?.["stack"];
  if (!stack || typeof stack !== "object" || Array.isArray(stack)) return undefined;
  const database = (stack as Record<string, unknown>)["database"];
  if (!database || typeof database !== "object" || Array.isArray(database)) return undefined;
  const provider = (database as Record<string, unknown>)["provider"];
  return provider === "postgresql" || provider === "mysql" || provider === "sqlite"
    ? provider
    : undefined;
}

export function generateDatabaseArtifacts(
  graph: ApplicationGraph,
  options: DatabaseGenerationOptions,
  registry = createDefaultDatabaseGeneratorRegistry(),
): readonly GeneratedFile[] {
  const provider = options.provider ?? databaseProviderFromGraph(graph);
  if (!provider) return [];
  const generator = registry.require(provider);
  const normalizationOptions: SchemaNormalizationOptions = {
    ...(options.seeds === undefined ? {} : { seeds: options.seeds }),
    capabilities: generator.capabilities,
  };
  const schema = normalizeDatabaseSchema(graph, normalizationOptions);
  return generator.generate(schema, {
    ...(options.previousSchema === undefined ? {} : { previousSchema: options.previousSchema }),
    ...(options.allowDestructive === undefined
      ? {}
      : { allowDestructive: options.allowDestructive }),
  });
}
