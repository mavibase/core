import type { DatabaseProvider, PackageManager, Runtime } from "./index.js";
import {
  createDefaultStackRegistries,
  validateStackCompatibility,
  type StackCompatibilityIssue,
  type StackRegistries,
} from "./stack-compatibility.js";

export interface StackConfiguration {
  framework: string;
  runtime: Runtime;
  database: DatabaseProvider;
  packageManager: PackageManager;
}

export class StackConfigurationError extends Error {
  readonly code = "MAVIBASE_STACK_CONFIGURATION_ERROR";
  readonly issues: readonly StackCompatibilityIssue[];

  constructor(issues: readonly StackCompatibilityIssue[]) {
    super(`Invalid stack configuration: ${issues.map((issue) => issue.message).join(" ")}`);
    this.name = "StackConfigurationError";
    this.issues = issues;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateStackConfiguration(
  configuration: unknown,
  registries: StackRegistries = createDefaultStackRegistries(),
): StackCompatibilityIssue[] {
  const issues: StackCompatibilityIssue[] = [];

  if (!isRecord(configuration)) {
    return [
      {
        path: "stack",
        code: "invalid-configuration",
        message: "Stack configuration must be an object.",
      },
    ];
  }

  for (const key of ["framework", "runtime", "database", "packageManager"]) {
    if (!isNonEmptyString(configuration[key])) {
      issues.push({
        path: key,
        code: "missing-reference",
        message: `Stack configuration must provide a non-empty ${key} reference.`,
      });
    }
  }

  if (issues.length > 0) {
    return issues;
  }

  return validateStackCompatibility(configuration as unknown as StackConfiguration, registries);
}

export function defineStackConfiguration(
  configuration: StackConfiguration,
  registries: StackRegistries = createDefaultStackRegistries(),
): StackConfiguration {
  const issues = validateStackConfiguration(configuration, registries);
  if (issues.length > 0) {
    throw new StackConfigurationError(issues);
  }

  return {
    framework: configuration.framework,
    runtime: configuration.runtime,
    database: configuration.database,
    packageManager: configuration.packageManager,
  };
}

export function serializeStackConfiguration(
  configuration: StackConfiguration,
  registries: StackRegistries = createDefaultStackRegistries(),
): string {
  return JSON.stringify(defineStackConfiguration(configuration, registries));
}
