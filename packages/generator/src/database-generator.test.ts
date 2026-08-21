import { describe, expect, it } from "vitest";

import { buildGraph } from "@mavibase/application-graph";
import { defineApp, defineModel, field } from "@mavibase/core";

import {
  DatabaseGeneratorRegistryError,
  generateDatabaseArtifacts,
  generate,
} from "./index.js";

function graph() {
  return buildGraph(
    defineApp({
      name: "database-app",
      version: "1.0.0",
      environment: "test",
      stack: {
        language: "typescript",
        runtime: "node",
        database: { provider: "postgresql" },
      },
      models: [
        defineModel({
          name: "User",
          fields: { id: field.uuid().primary(), name: field.string() },
        }),
      ],
    }),
  );
}

describe("database generation registration", () => {
  it("selects the registered provider generator from stack configuration", () => {
    const result = generate(graph(), {
      database: {
        seeds: [
          {
            id: "users",
            name: "Users",
            tables: [{ table: "User", rows: [{ name: "Ada" }] }],
          },
        ],
      },
    });

    expect(result.artifacts.map((artifact) => artifact.path)).toContain("database/schema.sql");
    expect(result.artifacts.map((artifact) => artifact.path)).toContain("database/seeds.sql");
    expect(result.artifacts.find((artifact) => artifact.path === "database/schema.sql")?.content).toContain(
      'CREATE TABLE "User"',
    );
  });

  it("does not generate database artifacts without a configured provider", () => {
    const noDatabase = { ...graph(), nodes: graph().nodes.map((node) => ({
      ...node,
      ...(node.type === "application" ? { data: { ...node.data, stack: undefined } } : {}),
    })) };
    const result = generate(noDatabase);

    expect(result.artifacts.some((artifact) => artifact.path.startsWith("database/"))).toBe(false);
  });

  it("reports providers without a registered generator", () => {
    expect(() => generateDatabaseArtifacts(graph(), { provider: "sqlite" })).toThrow(
      DatabaseGeneratorRegistryError,
    );
  });
});
