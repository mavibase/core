import { describe, expect, it } from "vitest";
import { generate, generateFromDefinition, version } from "./index.js";
import { defineApp, defineModel, field, relationship } from "@mavibase/core";
import { buildGraph } from "@mavibase/application-graph";

describe("generator", () => {
  it("exports a version", () => {
    expect(version).toBe("0.1.0");
  });

  it("generates no files from an empty graph", () => {
    const result = generate({
      name: "my-app",
      version: "1.0.0",
      nodes: [],
      edges: [],
    });

    expect(result.files).toEqual([]);
    expect(result.artifacts).toEqual([]);
  });

  it("generates from an application definition", () => {
    const app = defineApp({
      name: "my-app",
      version: "1.0.0",
      environment: "development",
      stack: {
        language: "typescript",
        runtime: "node",
      },
    });

    const result = generateFromDefinition(app);

    expect(result.files).toEqual([]);
    expect(result.artifacts).toEqual([]);
  });

  it("generates a models artifact from a model definition", () => {
    const User = defineModel({
      name: "User",
      fields: {
        id: field.uuid().primary(),
        email: field.string().required().unique(),
        age: field.integer(),
      },
    });

    const app = defineApp({
      name: "my-app",
      version: "1.0.0",
      environment: "development",
      stack: {
        language: "typescript",
        runtime: "node",
      },
      models: [User],
    });

    const result = generateFromDefinition(app);
    const modelArtifact = result.artifacts[0];

    if (!modelArtifact) {
      throw new Error("Expected a model artifact.");
    }

    expect(result.files).toEqual([
      "generated/models.ts",
      "generated/model-metadata.ts",
      "generated/query-helpers.ts",
      "generated/schemas.ts",
      "generated/types.ts",
      "generated/model-tests.ts",
    ]);
    expect(result.artifacts.length).toBe(6);
    expect(modelArtifact.path).toBe("models.ts");
    expect(modelArtifact.content).toContain("export interface User {");
    expect(modelArtifact.content).toContain("  id: string;");
    expect(modelArtifact.content).toContain("  email: string;");
    expect(modelArtifact.content).toContain("  age: number;");
  });

  it("honors a custom outDir option", () => {
    const User = defineModel({ name: "User" });
    const app = defineApp({
      name: "my-app",
      version: "1.0.0",
      environment: "development",
      stack: {
        language: "typescript",
        runtime: "node",
      },
      models: [User],
    });

    const result = generateFromDefinition(app, { outDir: "src/generated" });

    expect(result.files).toEqual([
      "src/generated/models.ts",
      "src/generated/model-metadata.ts",
      "src/generated/query-helpers.ts",
      "src/generated/schemas.ts",
      "src/generated/types.ts",
      "src/generated/model-tests.ts",
    ]);
  });

  it("supports deterministic structured artifact output", () => {
    const User = defineModel({ name: "User" });
    const app = defineApp({
      name: "structured-app",
      version: "1.0.0",
      environment: "development",
      stack: { language: "typescript", runtime: "node" },
      models: [User],
    });

    const result = generateFromDefinition(app, { layout: "structured" });

    expect(result.files).toEqual([
      "generated/models/index.ts",
      "generated/models/metadata.ts",
      "generated/queries/index.ts",
      "generated/schemas/index.ts",
      "generated/types/index.ts",
      "generated/models/tests.ts",
    ]);
    expect(
      result.artifacts.find((artifact) => artifact.path === "queries/index.ts")?.content,
    ).toContain('from "../types/index.js"');
    expect(
      result.artifacts.find((artifact) => artifact.path === "models/tests.ts")?.content,
    ).toContain('from "../schemas/index.js"');
    expect(
      result.artifacts.find((artifact) => artifact.path === "models/tests.ts")?.content,
    ).toContain('from "./metadata.js"');
  });

  it("generates a models artifact from a built graph", () => {
    const User = defineModel({
      name: "User",
      fields: {
        id: field.uuid(),
      },
      relationships: {
        posts: relationship.oneToMany().to("Post"),
      },
    });
    const Post = defineModel({ name: "Post" });

    const app = defineApp({
      name: "my-app",
      version: "1.0.0",
      environment: "development",
      stack: {
        language: "typescript",
        runtime: "node",
      },
      models: [User, Post],
    });

    const graph = buildGraph(app);
    const result = generate(graph);
    const artifact = result.artifacts[0];

    if (!artifact) {
      throw new Error("Expected a model artifact.");
    }

    expect(result.files).toEqual([
      "generated/models.ts",
      "generated/model-metadata.ts",
      "generated/relationships.ts",
      "generated/query-helpers.ts",
      "generated/schemas.ts",
      "generated/types.ts",
      "generated/model-tests.ts",
    ]);
    expect(result.artifacts.length).toBe(7);
    expect(artifact.content).toContain("export interface User {");
    expect(artifact.content).toContain("export interface Post {");
    expect(result.artifacts[2]?.content).toContain("export const UserRelationships = {");
  });
});
