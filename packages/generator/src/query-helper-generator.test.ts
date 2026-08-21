import { describe, expect, it } from "vitest";

import { defineModel, field, relationship } from "@mavibase/core";
import { buildGraph } from "@mavibase/application-graph";

import { generateQueryHelpers, queryHelpersTemplateData } from "./query-helper-generator.js";

describe("query helper generator", () => {
  it("generates deterministic typed query interfaces", () => {
    const User = defineModel({
      name: "User",
      fields: { id: field.uuid(), email: field.string() },
      relationships: { posts: relationship.oneToMany().to("Post") },
    });
    const Post = defineModel({ name: "Post" });
    const graph = buildGraph({
      name: "query-app",
      version: "1.0.0",
      environment: "development",
      stack: { language: "typescript", runtime: "node" },
      models: [User, Post],
    });

    const first = generateQueryHelpers(graph);
    const second = generateQueryHelpers(graph);

    expect(first).toEqual(second);
    expect(first?.path).toBe("query-helpers.ts");
    expect(first?.content).toContain('import type { User } from "./types.js";');
    expect(first?.content).toContain("export interface ModelAdapter<TModel, TCreate = TModel>");
    expect(first?.content).toContain("adapter: ModelAdapter<User>;");
    expect(first?.content).toContain("export interface UserQueryOptions extends QueryOptions<User>");
    expect(first?.content).toContain('with?: readonly ("posts")[];');
    expect(first?.content).toContain("findById(id: UserId): Promise<User | undefined>;");
    expect(first?.content).toContain("findMany(options?: UserQueryOptions): Promise<User[]>;");
    expect(first?.content).toContain("create(input: User): Promise<User>;");
    expect(first?.content).toContain("update(id: UserId, input: Partial<User>): Promise<User>;");
    expect(first?.content).toContain("delete(id: UserId): Promise<void>;");
    expect(queryHelpersTemplateData(graph).models.map((model) => model.name)).toEqual([
      "Post",
      "User",
    ]);
  });

  it("uses a stable fallback identifier and returns no artifact without models", () => {
    const graph = buildGraph({
      name: "query-app",
      version: "1.0.0",
      environment: "development",
      stack: { language: "typescript", runtime: "node" },
      models: [defineModel({ name: "WithoutId" })],
    });

    expect(generateQueryHelpers(graph)?.content).toContain(
      "export type WithoutIdId = string | number;",
    );
    expect(
      generateQueryHelpers({ name: "empty", version: "1.0.0", nodes: [], edges: [] }),
    ).toBeUndefined();
  });
});
