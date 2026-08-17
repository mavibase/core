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

  /** Enable authorization/policies */
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

export interface ApplicationDefinition {
  name: string;
  version: string;
  environment: AppEnvironment;
  stack: StackConfig;
  features?: AppFeatures;
  definitions?: DefinitionsRegistry;
}

/**
 * Entry point for defining a mvbs application
 */
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

  return {
    ...definition,
    definitions: definition.definitions ?? {},
  };
}