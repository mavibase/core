import { describe, expect, it } from "vitest";

import { defineModel, field, relationship } from "@mavibase/core";
import { buildGraph } from "@mavibase/application-graph";

import { generate } from "./index.js";
import {
  assertModelGenerationValid,
  ModelGenerationValidationError,
  validateModelGeneration,
} from "./model-generation-validation.js";
import { validateModelGraph } from "./model-validation.js";

describe("model validation", () => {
  it("accepts valid models and relationships", () => {
    const User = defineModel({
      name: "User",
      fields: { id: field.uuid().primary(), email: field.string().required() },
      relationships: { posts: relationship.oneToMany().to("Post") },
    });
    const graph = buildGraph({
      name: "validation-app",
      version: "1.0.0",
      environment: "development",
      stack: { language: "typescript", runtime: "node" },
      models: [User, defineModel({ name: "Post" })],
    });

    expect(validateModelGraph(graph)).toEqual([]);
    expect(() => assertModelGenerationValid(graph, { outDir: "src/generated" })).not.toThrow();
  });

  it("reports invalid model, field, modifier, relationship, and output data", () => {
    const graph = {
      name: "invalid",
      version: "1.0.0",
      nodes: [
        { id: "model:bad", type: "model" as const, data: { name: "Bad Model" } },
        {
          id: "field:bad.value",
          type: "field" as const,
          data: {
            name: "bad-value",
            type: "unsupported",
            modifiers: { required: true, optional: true, default: undefined },
          },
        },
        {
          id: "relationship:bad.other",
          type: "relationship" as const,
          data: { name: "other", type: "invalid", model: "Missing" },
        },
      ],
      edges: [
        { from: "model:bad", to: "field:bad.value", type: "has-field" as const },
        { from: "model:bad", to: "relationship:bad.other", type: "has-relationship" as const },
      ],
    };

    const issues = validateModelGeneration(graph, { outDir: "../generated" });
    expect(issues.some((issue) => issue.path.includes("type"))).toBe(true);
    expect(issues.some((issue) => issue.message.includes("required and optional"))).toBe(true);
    expect(issues.some((issue) => issue.category === "relationship")).toBe(true);
    expect(issues.some((issue) => issue.path === "options.outDir")).toBe(true);
    expect(() => generate(graph)).toThrow(ModelGenerationValidationError);
  });
});
