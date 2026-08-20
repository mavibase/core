import { describe, expect, it } from "vitest";

import { defineModel, field, relationship } from "@mavibase/core";
import { buildGraph } from "@mavibase/application-graph";

import { generateModelTests, modelTestsTemplateData } from "./model-test-generator.js";

describe("model test generator", () => {
  it("generates deterministic structural model test fixtures", () => {
    const User = defineModel({
      name: "User",
      fields: {
        id: field.uuid().primary(),
        email: field.string().required(),
        nickname: field.string().optional().nullable(),
      },
      relationships: { posts: relationship.oneToMany().to("Post") },
    });
    const graph = buildGraph({
      name: "model-test-app",
      version: "1.0.0",
      environment: "test",
      stack: { language: "typescript", runtime: "node" },
      models: [User, defineModel({ name: "Post" })],
    });

    const first = generateModelTests(graph);
    const second = generateModelTests(graph);

    expect(first).toEqual(second);
    expect(first?.path).toBe("model-tests.ts");
    expect(first?.content).toContain('import { UserSchema } from "./schemas.js";');
    expect(first?.content).toContain("export const UserModelTests = {");
    expect(first?.content).toContain('requiredFields: ["email"] as const');
    expect(first?.content).toContain('optionalFields: ["nickname"] as const');
    expect(first?.content).toContain('relationshipNames: ["posts"] as const');
    expect(modelTestsTemplateData(graph).models).toHaveLength(2);
  });
});
