import { describe, expect, it } from "vitest";

import { defineModel, field, relationship } from "@mavibase/core";
import { buildGraph } from "@mavibase/application-graph";

import { generateModels, modelTemplateData } from "./model-generator.js";

describe("model generator", () => {
  it("generates a deterministic model artifact from model definitions", () => {
    const User = defineModel({
      name: "User",
      fields: {
        createdAt: field.datetime(),
        id: field.uuid().primary(),
        email: field.string().required(),
      },
    });
    const app = {
      name: "model-app",
      version: "1.0.0",
      environment: "development" as const,
      stack: { language: "typescript" as const, runtime: "node" as const },
      models: [User],
    };

    const first = generateModels(buildGraph(app));
    const second = generateModels(buildGraph(app));

    expect(first).toEqual(second);
    expect(first?.path).toBe("models.ts");
    expect(first?.content).toBe(
      [
        "export interface User {",
        "  createdAt: Date;",
        "  email: string;",
        "  id: string;",
        "}",
        "",
      ].join("\n"),
    );
  });

  it("maps supported field types and applicable modifiers", () => {
    const Profile = defineModel({
      name: "Profile",
      fields: {
        name: field.string().optional().nullable().readOnly(),
        age: field.integer(),
        score: field.float(),
        amount: field.decimal(),
        active: field.boolean(),
        id: field.uuid(),
        createdAt: field.datetime(),
        metadata: field.json(),
      },
    });

    const graph = buildGraph({
      name: "model-app",
      version: "1.0.0",
      environment: "development",
      stack: { language: "typescript", runtime: "node" },
      models: [Profile],
    });
    const artifact = generateModels(graph);

    expect(artifact?.content).toContain("  readonly name?: string | null;");
    expect(artifact?.content).toContain("  age: number;");
    expect(artifact?.content).toContain("  score: number;");
    expect(artifact?.content).toContain("  amount: number;");
    expect(artifact?.content).toContain("  active: boolean;");
    expect(artifact?.content).toContain("  id: string;");
    expect(artifact?.content).toContain("  createdAt: Date;");
    expect(artifact?.content).toContain("  metadata: unknown;");
  });

  it("generates relationship fields with deterministic cardinality", () => {
    const User = defineModel({
      name: "User",
      relationships: {
        posts: relationship.oneToMany().to("Post"),
        profile: relationship.oneToOne().to("Profile"),
      },
    });
    const Post = defineModel({ name: "Post" });
    const Profile = defineModel({ name: "Profile" });

    const graph = buildGraph({
      name: "model-app",
      version: "1.0.0",
      environment: "development",
      stack: { language: "typescript", runtime: "node" },
      models: [User, Post, Profile],
    });
    const artifact = generateModels(graph);

    expect(artifact?.content).toContain("  posts: Post[];");
    expect(artifact?.content).toContain("  profile: Profile;");
  });

  it("returns no artifact when the graph has no models", () => {
    const graph = {
      name: "empty",
      version: "1.0.0",
      nodes: [],
      edges: [],
    };

    expect(modelTemplateData(graph).models).toEqual([]);
    expect(generateModels(graph)).toBeUndefined();
  });
});
