import { describe, expect, it } from "vitest";

import { defineModel, field, relationship } from "@mavibase/core";
import { buildGraph } from "@mavibase/application-graph";

import { assertModelGeneration, verifyModelGeneration } from "./model-generation-testing.js";

describe("model generation testing", () => {
  it("verifies generated model output in an isolated environment", async () => {
    const User = defineModel({
      name: "User",
      fields: { id: field.uuid() },
      relationships: { posts: relationship.oneToMany().to("Post") },
    });
    const graph = buildGraph({
      name: "generation-test-app",
      version: "1.0.0",
      environment: "test",
      stack: { language: "typescript", runtime: "node" },
      models: [User, defineModel({ name: "Post" })],
    });

    const result = await assertModelGeneration(graph);

    expect(result.valid).toBe(true);
    expect(result.files).toContain("model-tests.ts");
    expect(result.files).toContain("relationships.ts");
    expect(result.operations.every((operation) => operation.operation === "create")).toBe(true);
  });

  it("returns deterministic validation failures without writing files", async () => {
    const graph = {
      name: "invalid",
      version: "1.0.0",
      nodes: [{ id: "model:bad", type: "model" as const, data: { name: "Bad Model" } }],
      edges: [],
    };

    const first = await verifyModelGeneration(graph);
    const second = await verifyModelGeneration(graph);

    expect(first.valid).toBe(false);
    expect(first.files).toEqual([]);
    expect(first.operations).toEqual([]);
    expect(second.diagnostics).toEqual(first.diagnostics);
  });
});
