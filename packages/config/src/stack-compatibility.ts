import type { PackageManager, Runtime } from "./index.js";
import {
  createDefaultDatabaseProviderRegistry,
  type DatabaseProviderRegistry,
} from "./database.js";
import { createDefaultFrameworkRegistry, type FrameworkRegistry } from "./framework.js";
import {
  createDefaultPackageManagerRegistry,
  type PackageManagerRegistry,
} from "./package-manager.js";
import { createDefaultRuntimeRegistry, type RuntimeRegistry } from "./runtime.js";

import type { StackConfiguration } from "./stack-configuration.js";

export interface StackRegistries {
  frameworks: FrameworkRegistry;
  runtimes: RuntimeRegistry;
  databases: DatabaseProviderRegistry;
  packageManagers: PackageManagerRegistry;
}

export interface StackCompatibilityIssue {
  path: string;
  code:
    | "invalid-configuration"
    | "missing-reference"
    | "unknown-framework"
    | "unknown-runtime"
    | "unknown-database"
    | "unknown-package-manager"
    | "incompatible-framework-runtime"
    | "incompatible-runtime-package-manager";
  message: string;
}

export function createDefaultStackRegistries(): StackRegistries {
  return {
    frameworks: createDefaultFrameworkRegistry(),
    runtimes: createDefaultRuntimeRegistry(),
    databases: createDefaultDatabaseProviderRegistry(),
    packageManagers: createDefaultPackageManagerRegistry(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateStackCompatibility(
  configuration: unknown,
  registries: StackRegistries = createDefaultStackRegistries(),
): StackCompatibilityIssue[] {
  if (!isRecord(configuration)) {
    return [
      {
        path: "stack",
        code: "invalid-configuration",
        message: "Stack configuration must be an object.",
      },
    ];
  }

  const issues: StackCompatibilityIssue[] = [];
  const frameworkId = configuration["framework"];
  const runtimeId = configuration["runtime"];
  const databaseId = configuration["database"];
  const packageManagerId = configuration["packageManager"];

  if (!isNonEmptyString(frameworkId)) {
    issues.push({
      path: "framework",
      code: "missing-reference",
      message: "Stack configuration must provide a non-empty framework reference.",
    });
  }
  if (!isNonEmptyString(runtimeId)) {
    issues.push({
      path: "runtime",
      code: "missing-reference",
      message: "Stack configuration must provide a non-empty runtime reference.",
    });
  }
  if (!isNonEmptyString(databaseId)) {
    issues.push({
      path: "database",
      code: "missing-reference",
      message: "Stack configuration must provide a non-empty database reference.",
    });
  }
  if (!isNonEmptyString(packageManagerId)) {
    issues.push({
      path: "packageManager",
      code: "missing-reference",
      message: "Stack configuration must provide a non-empty package manager reference.",
    });
  }

  const framework = isNonEmptyString(frameworkId)
    ? registries.frameworks.get(frameworkId)
    : undefined;
  const runtime = isNonEmptyString(runtimeId) ? registries.runtimes.get(runtimeId) : undefined;
  const database = isNonEmptyString(databaseId) ? registries.databases.get(databaseId) : undefined;
  const packageManager = isNonEmptyString(packageManagerId)
    ? registries.packageManagers.get(packageManagerId)
    : undefined;

  if (isNonEmptyString(frameworkId) && !framework) {
    issues.push({
      path: "framework",
      code: "unknown-framework",
      message: `Framework is not registered: "${frameworkId}".`,
    });
  }
  if (isNonEmptyString(runtimeId) && !runtime) {
    issues.push({
      path: "runtime",
      code: "unknown-runtime",
      message: `Runtime is not registered: "${runtimeId}".`,
    });
  }
  if (isNonEmptyString(databaseId) && !database) {
    issues.push({
      path: "database",
      code: "unknown-database",
      message: `Database provider is not registered: "${databaseId}".`,
    });
  }
  if (isNonEmptyString(packageManagerId) && !packageManager) {
    issues.push({
      path: "packageManager",
      code: "unknown-package-manager",
      message: `Package manager is not registered: "${packageManagerId}".`,
    });
  }

  if (framework && runtime && !framework.runtimes.includes(runtime.id as Runtime)) {
    issues.push({
      path: "runtime",
      code: "incompatible-framework-runtime",
      message: `Framework "${framework.id}" (${framework.name}) does not support runtime "${runtime.id}" (${runtime.name}).`,
    });
  }

  if (
    runtime &&
    packageManager &&
    runtime.packageManagers &&
    !runtime.packageManagers.includes(packageManager.id as PackageManager)
  ) {
    issues.push({
      path: "packageManager",
      code: "incompatible-runtime-package-manager",
      message: `Runtime "${runtime.id}" (${runtime.name}) does not support package manager "${packageManager.id}" (${packageManager.name}).`,
    });
  }

  return issues;
}

export function isStackCompatible(
  configuration: StackConfiguration,
  registries: StackRegistries = createDefaultStackRegistries(),
): boolean {
  return validateStackCompatibility(configuration, registries).length === 0;
}
