import { describe, expect, it } from "vitest";
import { buildGraph, version } from "./index.js";
import { defineApp, defineModel, field, relationship } from "@mavibase/core";

describe("application-graph", () => {
  it("exports a version", () => {
    expect(version).toBe("0.1.0");
  });

  it("builds an empty graph from a definition", () => {
    const app = defineApp({
      name: "my-app",
      version: "1.0.0",
      environment: "development",
      stack: {
        language: "typescript",
        runtime: "node",
      },
    });

    const graph = buildGraph(app);

    expect(graph.name).toBe("my-app");
    expect(graph.version).toBe("1.0.0");
    expect(graph.nodes).toEqual([
      {
        id: "app:my-app",
        type: "application",
        data: {
          name: "my-app",
          version: "1.0.0",
          environment: "development",
        },
      },
    ]);
    expect(graph.edges).toEqual([]);
  });

  it("creates an application node with a slugified id", () => {
    const app = defineApp({
      name: "My App",
      version: "1.0.0",
      environment: "test",
      stack: {
        language: "typescript",
        runtime: "node",
      },
    });

    const graph = buildGraph(app);

    expect(graph.nodes[0]).toEqual({
      id: "app:my-app",
      type: "application",
      data: {
        name: "My App",
        version: "1.0.0",
        environment: "test",
      },
    });
  });

  it("creates model nodes and contains edges", () => {
    const User = defineModel({ name: "User" });
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

    expect(graph.nodes).toContainEqual({
      id: "model:user",
      type: "model",
      data: { name: "User" },
    });
    expect(graph.nodes).toContainEqual({
      id: "model:post",
      type: "model",
      data: { name: "Post" },
    });
    expect(graph.edges).toContainEqual({
      from: "app:my-app",
      to: "model:user",
      type: "contains",
    });
    expect(graph.edges).toContainEqual({
      from: "app:my-app",
      to: "model:post",
      type: "contains",
    });
  });

  it("creates field nodes and has-field edges", () => {
    const User = defineModel({
      name: "User",
      fields: {
        id: field.uuid().primary(),
        email: field.string().required().unique(),
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

    const graph = buildGraph(app);

    expect(graph.nodes).toContainEqual({
      id: "field:user.id",
      type: "field",
      data: {
        name: "id",
        type: "uuid",
        modifiers: { primary: true },
      },
    });
    expect(graph.nodes).toContainEqual({
      id: "field:user.email",
      type: "field",
      data: {
        name: "email",
        type: "string",
        modifiers: { required: true, optional: false, unique: true },
      },
    });
    expect(graph.edges).toContainEqual({
      from: "model:user",
      to: "field:user.id",
      type: "has-field",
    });
    expect(graph.edges).toContainEqual({
      from: "model:user",
      to: "field:user.email",
      type: "has-field",
    });
  });

  it("creates relationship nodes and target edges", () => {
    const User = defineModel({
      name: "User",
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

    expect(graph.nodes).toContainEqual({
      id: "relationship:user.posts",
      type: "relationship",
      data: {
        name: "posts",
        type: "one-to-many",
        model: "Post",
      },
    });
    expect(graph.edges).toContainEqual({
      from: "model:user",
      to: "relationship:user.posts",
      type: "has-relationship",
    });
    expect(graph.edges).toContainEqual({
      from: "relationship:user.posts",
      to: "model:post",
      type: "targets",
    });
  });
});
