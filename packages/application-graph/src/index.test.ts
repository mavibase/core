import { describe, expect, it } from "vitest";
import { buildGraph, createEdge, createNode, version } from "./index.js";
import { defineApp, defineModel, field, relationship } from "@mavibase/core";

describe("application-graph", () => {
  it("exports a version", () => {
    expect(version).toBe("0.1.0");
  });

  describe("createEdge", () => {
    it("creates an edge without data", () => {
      expect(createEdge("app:my-app", "model:user", "contains")).toEqual({
        from: "app:my-app",
        to: "model:user",
        type: "contains",
      });
    });

    it("creates an edge with data", () => {
      expect(
        createEdge("route:users.list", "model:user", "uses", {
          readonly: true,
        }),
      ).toEqual({
        from: "route:users.list",
        to: "model:user",
        type: "uses",
        data: { readonly: true },
      });
    });

    it("supports every graph edge type", () => {
      expect(createEdge("a", "b", "contains").type).toBe("contains");
      expect(createEdge("a", "b", "has-field").type).toBe("has-field");
      expect(createEdge("a", "b", "has-relationship").type).toBe(
        "has-relationship",
      );
      expect(createEdge("a", "b", "targets").type).toBe("targets");
      expect(createEdge("a", "b", "uses").type).toBe("uses");
      expect(createEdge("a", "b", "validates").type).toBe("validates");
      expect(createEdge("a", "b", "protects").type).toBe("protects");
      expect(createEdge("a", "b", "triggers").type).toBe("triggers");
      expect(createEdge("a", "b", "implements").type).toBe("implements");
      expect(createEdge("a", "b", "connects").type).toBe("connects");
    });
  });

  describe("createNode", () => {
    it("creates a node without data", () => {
      expect(createNode("model", "model:user")).toEqual({
        id: "model:user",
        type: "model",
      });
    });

    it("creates a node with data", () => {
      expect(
        createNode("route", "route:users.list", { method: "GET" }),
      ).toEqual({
        id: "route:users.list",
        type: "route",
        data: { method: "GET" },
      });
    });

    it("supports every graph node type", () => {
      expect(createNode("application", "app:test").type).toBe("application");
      expect(createNode("model", "model:user").type).toBe("model");
      expect(createNode("field", "field:user.name").type).toBe("field");
      expect(createNode("relationship", "relationship:user.posts").type).toBe(
        "relationship",
      );
      expect(createNode("route", "route:users.list").type).toBe("route");
      expect(createNode("operation", "operation:create-user").type).toBe(
        "operation",
      );
      expect(createNode("event", "event:user-created").type).toBe("event");
      expect(createNode("policy", "policy:owns-post").type).toBe("policy");
      expect(createNode("workflow", "workflow:checkout").type).toBe("workflow");
      expect(createNode("service", "service:auth").type).toBe("service");
      expect(createNode("integration", "integration:stripe").type).toBe(
        "integration",
      );
    });
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
