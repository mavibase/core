import { describe, expect, it } from "vitest";

import { defineModel, field, relationship } from "@mavibase/core";
import { buildGraph } from "@mavibase/application-graph";

import { generateTypes, typeTemplateData } from "./type-generator.js";

describe("type generator", () => {
  it("generates deterministic TypeScript types through the generator engine", () => {
    const User = defineModel({
      name: "User",
      fields: {
        createdAt: field.datetime(),
        id: field.uuid(),
        email: field.string(),
      },
    });
    const graph = buildGraph({
      name: "type-app",
      version: "1.0.0",
      environment: "development",
      stack: { language: "typescript", runtime: "node" },
      models: [User],
    });

    const first = generateTypes(graph);
    const second = generateTypes(graph);

    expect(first).toEqual(second);
    expect(first?.path).toBe("types.ts");
    expect(first?.content).toBe(
      [
        "export type User = {",
        "  createdAt: Date;",
        "  email: string;",
        "  id: string;",
        "};",
        "",
      ].join("\n"),
    );
  });

  it("maps supported types and keeps optionality separate from nullability", () => {
    const RecordModel = defineModel({
      name: "RecordModel",
      fields: {
        requiredValue: field.string().required(),
        optionalValue: field.string().optional(),
        nullableValue: field.string().nullable(),
        optionalNullableValue: field.string().optional().nullable(),
        integerValue: field.integer(),
        floatValue: field.float(),
        decimalValue: field.decimal(),
        booleanValue: field.boolean(),
        uuidValue: field.uuid(),
        dateValue: field.datetime(),
        jsonValue: field.json(),
        readOnlyValue: field.string().readOnly(),
      },
    });
    const graph = buildGraph({
      name: "type-app",
      version: "1.0.0",
      environment: "development",
      stack: { language: "typescript", runtime: "node" },
      models: [RecordModel],
    });
    const artifact = generateTypes(graph);

    expect(artifact?.content).toContain("  requiredValue: string;");
    expect(artifact?.content).toContain("  optionalValue?: string;");
    expect(artifact?.content).toContain("  nullableValue: string | null;");
    expect(artifact?.content).toContain("  optionalNullableValue?: string | null;");
    expect(artifact?.content).toContain("  integerValue: number;");
    expect(artifact?.content).toContain("  floatValue: number;");
    expect(artifact?.content).toContain("  decimalValue: number;");
    expect(artifact?.content).toContain("  booleanValue: boolean;");
    expect(artifact?.content).toContain("  uuidValue: string;");
    expect(artifact?.content).toContain("  dateValue: Date;");
    expect(artifact?.content).toContain("  jsonValue: unknown;");
    expect(artifact?.content).toContain("  readonly readOnlyValue: string;");
  });

  it("generates relationship array and single-value types", () => {
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
      name: "type-app",
      version: "1.0.0",
      environment: "development",
      stack: { language: "typescript", runtime: "node" },
      models: [User, Post, Profile],
    });

    const artifact = generateTypes(graph);

    expect(artifact?.content).toContain("  posts: Post[];");
    expect(artifact?.content).toContain("  profile: Profile;");
  });

  it("returns no artifact when the graph has no models", () => {
    const graph = { name: "empty", version: "1.0.0", nodes: [], edges: [] };

    expect(typeTemplateData(graph).models).toEqual([]);
    expect(generateTypes(graph)).toBeUndefined();
  });
});
