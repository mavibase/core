import { describe, expect, it } from "vitest";

import { buildGraph } from "@mavibase/application-graph";
import { defineModel, field, relationship } from "@mavibase/core";

import { normalizeModelContexts } from "./model-context.js";
import { modelTemplateData } from "./model-generator.js";
import { typeTemplateData } from "./type-generator.js";

describe("normalized model context", () => {
  it("is the shared semantic source for model and type artifacts", () => {
    const graph = buildGraph({
      name: "context-app",
      version: "1.0.0",
      environment: "test",
      stack: { language: "typescript", runtime: "node" },
      models: [
        defineModel({
          name: "User",
          fields: {
            id: field.uuid().primary(),
            name: field.string().optional().nullable(),
          },
          relationships: { posts: relationship.oneToMany().to("Post") },
        }),
        defineModel({ name: "Post" }),
      ],
    });

    const first = normalizeModelContexts(graph);
    const second = normalizeModelContexts(graph);

    expect(first).toEqual(second);
    expect(first[0]?.fields[0]).toMatchObject({
      name: "id",
      typescriptType: "string",
      primary: true,
      optional: false,
    });
    expect(first[0]?.relationships).toEqual([
      { name: "posts", target: "Post", type: "one-to-many", collection: true },
    ]);
    expect(modelTemplateData(graph)).toEqual(typeTemplateData(graph));
  });
});
