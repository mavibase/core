import { describe, expect, it } from "vitest";

import {
  StackConfigurationError,
  createDefaultStackRegistries,
  defineStackConfiguration,
  isStackCompatible,
  serializeStackConfiguration,
  validateStackCompatibility,
  validateStackConfiguration,
} from "./index.js";

const validStack = {
  framework: "react",
  runtime: "node" as const,
  database: "postgresql" as const,
  packageManager: "pnpm" as const,
};

describe("stack compatibility and configuration", () => {
  it("validates supported framework, runtime, database, and package manager combinations", () => {
    expect(validateStackCompatibility(validStack)).toEqual([]);
    expect(isStackCompatible(validStack)).toBe(true);
    expect(defineStackConfiguration(validStack)).toEqual(validStack);
  });

  it("resolves all references through the supplied registries", () => {
    const registries = createDefaultStackRegistries();
    const configuration = defineStackConfiguration(
      { ...validStack, framework: "fastify", packageManager: "npm" },
      registries,
    );

    expect(registries.frameworks.require(configuration.framework).name).toBe("Fastify");
    expect(registries.runtimes.require(configuration.runtime).name).toBe("Node.js");
    expect(registries.databases.require(configuration.database).name).toBe("PostgreSQL");
    expect(registries.packageManagers.require(configuration.packageManager).name).toBe("npm");
  });

  it("reports invalid framework, runtime, database, and package manager references", () => {
    const issues = validateStackConfiguration({
      framework: "missing-framework",
      runtime: "missing-runtime",
      database: "missing-database",
      packageManager: "missing-package-manager",
    });

    expect(issues.map((issue) => issue.code)).toEqual([
      "unknown-framework",
      "unknown-runtime",
      "unknown-database",
      "unknown-package-manager",
    ]);
    expect(issues.map((issue) => issue.message)).toEqual([
      'Framework is not registered: "missing-framework".',
      'Runtime is not registered: "missing-runtime".',
      'Database provider is not registered: "missing-database".',
      'Package manager is not registered: "missing-package-manager".',
    ]);
  });

  it("reports framework and runtime incompatibility", () => {
    const issues = validateStackCompatibility({
      ...validStack,
      framework: "express",
      runtime: "bun",
      packageManager: "bun",
    });

    expect(issues).toEqual([
      {
        path: "runtime",
        code: "incompatible-framework-runtime",
        message: 'Framework "express" (Express) does not support runtime "bun" (Bun).',
      },
    ]);
  });

  it("reports runtime and package manager incompatibility", () => {
    const issues = validateStackCompatibility({
      ...validStack,
      runtime: "bun",
      packageManager: "pnpm",
    });

    expect(issues).toEqual([
      {
        path: "packageManager",
        code: "incompatible-runtime-package-manager",
        message: 'Runtime "bun" (Bun) does not support package manager "pnpm" (pnpm).',
      },
    ]);
  });

  it("reports missing stack configuration without selecting defaults", () => {
    const issues = validateStackConfiguration({ framework: "react" });

    expect(issues.map((issue) => issue.path)).toEqual(["runtime", "database", "packageManager"]);
    expect(() => defineStackConfiguration({ framework: "react" } as never)).toThrow(
      StackConfigurationError,
    );
  });

  it("serializes normalized configuration deterministically", () => {
    const first = serializeStackConfiguration(validStack);
    const second = serializeStackConfiguration({
      packageManager: "pnpm",
      database: "postgresql",
      runtime: "node",
      framework: "react",
    });

    expect(first).toBe(
      '{"framework":"react","runtime":"node","database":"postgresql","packageManager":"pnpm"}',
    );
    expect(first).toBe(second);
  });

  it("keeps compatibility validation deterministic", () => {
    const first = validateStackConfiguration({
      ...validStack,
      framework: "express",
      runtime: "bun",
    });
    const second = validateStackConfiguration({
      ...validStack,
      framework: "express",
      runtime: "bun",
    });

    expect(first).toEqual(second);
  });

  it("supports compatible combinations from each existing definition family", () => {
    expect(isStackCompatible({ ...validStack, framework: "express", packageManager: "npm" })).toBe(
      true,
    );
    expect(isStackCompatible({ ...validStack, framework: "fastify", packageManager: "npm" })).toBe(
      true,
    );
    expect(
      isStackCompatible({
        ...validStack,
        framework: "react",
        runtime: "bun",
        packageManager: "bun",
      }),
    ).toBe(true);
  });
});
