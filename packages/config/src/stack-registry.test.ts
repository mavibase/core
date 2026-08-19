import { describe, expect, it } from "vitest";

import {
  StackDefinitionError,
  StackRegistry,
  StackRegistryError,
  builtInStackDefinitions,
  createDefaultStackRegistry,
  createDefaultStackRegistries,
  defineStackDefinition,
  validateStackDefinition,
} from "./index.js";

const validDefinition = {
  id: "react-node-postgresql-pnpm-custom",
  name: "Custom React stack",
  description: "A custom valid stack.",
  framework: "react" as const,
  runtime: "node" as const,
  database: "postgresql" as const,
  packageManager: "pnpm" as const,
  metadata: { language: "typescript" },
};

describe("stack registry", () => {
  it("provides a small deterministic set of valid built-in stacks", () => {
    const registry = createDefaultStackRegistry();

    expect(registry.list().map((stack) => stack.id)).toEqual([
      "express-node-postgresql-pnpm",
      "fastify-node-postgresql-npm",
      "react-bun-sqlite-bun",
      "react-node-postgresql-pnpm",
    ]);
    expect(registry.list().every((stack) => registry.validate(stack).length === 0)).toBe(true);
  });

  it("registers, retrieves, checks, validates, and lists stacks", () => {
    const registry = new StackRegistry();
    const registered = registry.register(validDefinition);

    expect(registered).toEqual(registry.require(validDefinition.id));
    expect(registry.has(validDefinition.id)).toBe(true);
    expect(registry.get(validDefinition.id)?.framework).toBe("react");
    expect(registry.validate(validDefinition)).toEqual([]);
    expect(registry.list()).toEqual([registered]);
  });

  it("resolves references using the existing technology registries", () => {
    const registries = createDefaultStackRegistries();
    const definition = defineStackDefinition(validDefinition, registries);

    expect(registries.frameworks.require(definition.framework).name).toBe("React");
    expect(registries.runtimes.require(definition.runtime).name).toBe("Node.js");
    expect(registries.databases.require(definition.database).name).toBe("PostgreSQL");
    expect(registries.packageManagers.require(definition.packageManager).name).toBe("pnpm");
  });

  it("rejects duplicate stack identifiers", () => {
    const registry = new StackRegistry([validDefinition]);

    expect(() => registry.register(validDefinition)).toThrow(StackRegistryError);
  });

  it("rejects missing technology references", () => {
    const issues = validateStackDefinition({
      ...validDefinition,
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
    expect(() =>
      defineStackDefinition({
        ...validDefinition,
        framework: "missing-framework",
      } as never),
    ).toThrow(StackDefinitionError);
  });

  it("rejects invalid metadata and identifiers", () => {
    const issues = validateStackDefinition({
      ...validDefinition,
      id: "Invalid Stack",
      name: "",
      metadata: { language: "" },
    });

    expect(issues.map((issue) => issue.path)).toEqual(["id", "name", "metadata.language"]);
  });

  it("rejects incompatible stack definitions during registration", () => {
    const registry = new StackRegistry();
    const definition = {
      ...validDefinition,
      id: "express-bun-sqlite-bun",
      framework: "express",
      runtime: "bun",
      packageManager: "bun",
    };

    expect(() => registry.register(definition as never)).toThrow(StackDefinitionError);
    expect(registry.has(definition.id)).toBe(false);
  });

  it("rejects malformed definitions with structured errors", () => {
    expect(validateStackDefinition(null)).toEqual([
      {
        path: "stack",
        code: "invalid-configuration",
        message: "Stack definition must be an object.",
      },
    ]);
    expect(() => defineStackDefinition(null as never)).toThrow(StackDefinitionError);
  });

  it("keeps custom registries isolated from the default registry", () => {
    const customRegistry = new StackRegistry([validDefinition]);
    const defaultRegistry = createDefaultStackRegistry();

    expect(customRegistry.has(validDefinition.id)).toBe(true);
    expect(defaultRegistry.has(validDefinition.id)).toBe(false);
  });

  it("returns deterministic results and defensive list copies", () => {
    const first = createDefaultStackRegistry().list();
    const second = createDefaultStackRegistry().list();

    expect(first).toEqual(second);
    expect(first[0]!.metadata).not.toBe(second[0]!.metadata);
    expect(first[0]!.id).toBe(second[0]!.id);
  });

  it("handles missing stack lookups consistently", () => {
    const registry = new StackRegistry();

    expect(registry.has("missing")).toBe(false);
    expect(registry.get("missing")).toBeUndefined();
    expect(() => registry.require("missing")).toThrow(StackRegistryError);
  });

  it("uses the public config exports for built-in stack definitions", () => {
    expect(builtInStackDefinitions).toHaveLength(4);
    expect(createDefaultStackRegistry().require("react-node-postgresql-pnpm").database).toBe(
      "postgresql",
    );
  });
});
