import { describe, expect, it } from "vitest";

import {
  builtInDatabaseProviderDefinitions,
  createDefaultDatabaseProviderRegistry,
  DatabaseProviderDefinitionError,
  DatabaseProviderRegistry,
  DatabaseProviderRegistryError,
  defineDatabaseProvider,
  validateDatabaseProviderDefinition,
} from "./database.js";

describe("database providers", () => {
  it("creates a valid PostgreSQL definition", () => {
    const definition = defineDatabaseProvider({
      id: "postgresql",
      name: "PostgreSQL",
      category: "relational",
      supportedVersions: [">=16"],
      capabilities: ["tables", "relations", "transactions"],
      configuration: [{ key: "DATABASE_URL", required: true }],
      generator: "database-postgresql",
    });

    expect(definition).toEqual({
      id: "postgresql",
      name: "PostgreSQL",
      category: "relational",
      supportedVersions: [">=16"],
      capabilities: ["tables", "relations", "transactions"],
      configuration: [{ key: "DATABASE_URL", required: true }],
      generator: "database-postgresql",
    });
  });

  it("provides valid built-in PostgreSQL, MySQL, and SQLite metadata", () => {
    const registry = createDefaultDatabaseProviderRegistry();

    expect(registry.require("postgresql").category).toBe("relational");
    expect(registry.require("mysql").category).toBe("relational");
    expect(registry.require("sqlite").category).toBe("relational");
    expect(registry.supportedVersions("postgresql")).toEqual([">=16"]);
    expect(registry.supportedVersions("mysql")).toEqual([">=8"]);
    expect(registry.supportedVersions("sqlite")).toEqual([">=3.35"]);
  });

  it("exposes provider-specific capability differences", () => {
    const registry = createDefaultDatabaseProviderRegistry();

    expect(registry.capabilities("postgresql")).toContain("arrays");
    expect(registry.capabilities("postgresql")).toContain("enums");
    expect(registry.capabilities("mysql")).toContain("enums");
    expect(registry.capabilities("mysql")).not.toContain("arrays");
    expect(registry.capabilities("sqlite")).not.toContain("arrays");
    expect(registry.capabilities("sqlite")).not.toContain("enums");
  });

  it("validates identifiers, categories, versions, capabilities, and configuration", () => {
    const issues = validateDatabaseProviderDefinition({
      id: "postgres",
      name: "",
      category: "document",
      supportedVersions: [],
      capabilities: ["tables", "tables", ""],
      configuration: [
        { key: "DATABASE_URL", required: true },
        { key: "DATABASE_URL", required: true },
      ],
    });

    expect(issues.map((issue) => issue.path)).toEqual([
      "id",
      "name",
      "category",
      "supportedVersions",
      "capabilities[1]",
      "capabilities[2]",
      "configuration[1].key",
    ]);
  });

  it("rejects invalid definitions with structured errors", () => {
    expect(() =>
      defineDatabaseProvider({
        id: "sqlite",
        name: "SQLite",
        category: "relational",
        supportedVersions: [">=3.35"],
        capabilities: [],
      }),
    ).toThrow(DatabaseProviderDefinitionError);
  });

  it("registers, retrieves, and lists providers deterministically", () => {
    const registry = new DatabaseProviderRegistry([
      builtInDatabaseProviderDefinitions[2]!,
      builtInDatabaseProviderDefinitions[0]!,
      builtInDatabaseProviderDefinitions[1]!,
    ]);

    expect(registry.has("postgresql")).toBe(true);
    expect(registry.get("mysql")?.name).toBe("MySQL");
    expect(registry.list().map((provider) => provider.id)).toEqual([
      "mysql",
      "postgresql",
      "sqlite",
    ]);
  });

  it("rejects duplicate and missing provider registrations", () => {
    const registry = new DatabaseProviderRegistry();
    registry.register(builtInDatabaseProviderDefinitions[0]!);

    expect(() => registry.register(builtInDatabaseProviderDefinitions[0]!)).toThrow(
      DatabaseProviderRegistryError,
    );
    expect(registry.get("missing")).toBeUndefined();
    expect(() => registry.require("missing")).toThrow(DatabaseProviderRegistryError);
  });

  it("returns stable results for repeated registry construction", () => {
    const first = createDefaultDatabaseProviderRegistry().list();
    const second = createDefaultDatabaseProviderRegistry().list();

    expect(first).toEqual(second);
  });
});
