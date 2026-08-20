import { describe, expect, it } from "vitest";

import { defineModel, field, relationship } from "@mavibase/core";
import { buildGraph } from "@mavibase/application-graph";

import { generateZodSchemas, ZodGenerationError, zodTemplateData } from "./zod-generator.js";

describe("zod generator", () => {
  it("generates deterministic schemas through the generator engine", () => {
    const User = defineModel({
      name: "User",
      fields: {
        name: field.string(),
        id: field.uuid(),
        age: field.integer(),
      },
    });
    const graph = buildGraph({
      name: "zod-app",
      version: "1.0.0",
      environment: "development",
      stack: { language: "typescript", runtime: "node" },
      models: [User],
    });

    const first = generateZodSchemas(graph);
    const second = generateZodSchemas(graph);

    expect(first).toEqual(second);
    expect(first?.path).toBe("schemas.ts");
    expect(first?.content).toBe(
      [
        'import { z } from "zod";',
        "",
        "export const UserSchema = z.object({",
        "  age: z.number().int(),",
        "  id: z.string().uuid(),",
        "  name: z.string(),",
        "});",
        "",
      ].join("\n"),
    );
  });

  it("maps supported field types and modifiers", () => {
    const RecordModel = defineModel({
      name: "RecordModel",
      fields: {
        text: field.string().optional(),
        nullableText: field.string().nullable(),
        withDefault: field.string().default("pending"),
        integerValue: field.integer(),
        floatValue: field.float(),
        decimalValue: field.decimal(),
        booleanValue: field.boolean(),
        uuidValue: field.uuid(),
        dateValue: field.datetime(),
        jsonValue: field.json(),
      },
    });
    const graph = buildGraph({
      name: "zod-app",
      version: "1.0.0",
      environment: "development",
      stack: { language: "typescript", runtime: "node" },
      models: [RecordModel],
    });
    const artifact = generateZodSchemas(graph);

    expect(artifact?.content).toContain("  text: z.string().optional(),");
    expect(artifact?.content).toContain("  nullableText: z.string().nullable(),");
    expect(artifact?.content).toContain('  withDefault: z.string().default("pending"),');
    expect(artifact?.content).toContain("  integerValue: z.number().int(),");
    expect(artifact?.content).toContain("  floatValue: z.number(),");
    expect(artifact?.content).toContain("  decimalValue: z.number(),");
    expect(artifact?.content).toContain("  booleanValue: z.boolean(),");
    expect(artifact?.content).toContain("  uuidValue: z.string().uuid(),");
    expect(artifact?.content).toContain("  dateValue: z.coerce.date(),");
    expect(artifact?.content).toContain("  jsonValue: z.unknown(),");
  });

  it("handles multiple models and non-identifier field names deterministically", () => {
    const First = defineModel({ name: "First", fields: { "display-name": field.string() } });
    const Second = defineModel({ name: "Second" });
    const graph = buildGraph({
      name: "zod-app",
      version: "1.0.0",
      environment: "development",
      stack: { language: "typescript", runtime: "node" },
      models: [Second, First],
    });

    const artifact = generateZodSchemas(graph);

    expect(artifact?.content).toContain('  "display-name": z.string(),');
    expect(artifact?.content?.indexOf("FirstSchema")).toBeLessThan(
      artifact?.content?.indexOf("SecondSchema") ?? -1,
    );
  });

  it("generates lazy schemas for relationship fields", () => {
    const User = defineModel({
      name: "User",
      relationships: {
        posts: relationship.oneToMany().to("Post"),
      },
    });
    const Post = defineModel({
      name: "Post",
      relationships: {
        author: relationship.manyToOne().to("User"),
      },
    });
    const graph = buildGraph({
      name: "relationship-app",
      version: "1.0.0",
      environment: "development",
      stack: { language: "typescript", runtime: "node" },
      models: [User, Post],
    });

    expect(generateZodSchemas(graph)?.content).toContain(
      "  posts: z.array(z.lazy(() => PostSchema)),",
    );
    expect(generateZodSchemas(graph)?.content).toContain(
      "  author: z.lazy(() => UserSchema),",
    );
  });

  it("rejects relationships without targets", () => {
    const graph = buildGraph({
      name: "invalid-relationship",
      version: "1.0.0",
      environment: "development",
      stack: { language: "typescript", runtime: "node" },
      models: [
        defineModel({
          name: "User",
          relationships: { posts: relationship.oneToMany() },
        }),
      ],
    });

    expect(() => generateZodSchemas(graph)).toThrow("relationship target is missing");
  });

  it("rejects unsupported field types", () => {
    const graph = {
      name: "invalid",
      version: "1.0.0",
      nodes: [
        { id: "model:record", type: "model" as const, data: { name: "Record" } },
        {
          id: "field:record.value",
          type: "field" as const,
          data: { name: "value", type: "enum" },
        },
      ],
      edges: [{ from: "model:record", to: "field:record.value", type: "has-field" as const }],
    };

    expect(() => generateZodSchemas(graph)).toThrow(ZodGenerationError);
    expect(() => generateZodSchemas(graph)).toThrow("unsupported field type");
  });

  it("rejects non-serializable defaults", () => {
    const graph = {
      name: "invalid-default",
      version: "1.0.0",
      nodes: [
        { id: "model:record", type: "model" as const, data: { name: "Record" } },
        {
          id: "field:record.value",
          type: "field" as const,
          data: { name: "value", type: "string", modifiers: { default: BigInt(1) } },
        },
      ],
      edges: [{ from: "model:record", to: "field:record.value", type: "has-field" as const }],
    };

    expect(() => zodTemplateData(graph)).toThrow(ZodGenerationError);
  });

  it("returns no artifact for a graph without models", () => {
    expect(
      generateZodSchemas({ name: "empty", version: "1.0.0", nodes: [], edges: [] }),
    ).toBeUndefined();
  });
});
