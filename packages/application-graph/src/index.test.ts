import { describe, expect, it } from "vitest";
import {
  buildGraph,
  canonicalizeGraph,
  createEdge,
  createNode,
  deserializeGraph,
  GraphValidationError,
  serializeGraph,
  validateGraph,
  validateGraphResult,
  version,
} from "./index.js";
import {
  defineApp,
  defineModel,
  defineParameter,
  defineRoute,
  field,
  relationship,
} from "@mavibase/core";

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
      expect(createEdge("a", "b", "has-relationship").type).toBe("has-relationship");
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
      expect(createNode("route", "route:users.list", { method: "GET" })).toEqual({
        id: "route:users.list",
        type: "route",
        data: { method: "GET" },
      });
    });

    it("supports every graph node type", () => {
      expect(createNode("application", "app:test").type).toBe("application");
      expect(createNode("model", "model:user").type).toBe("model");
      expect(createNode("field", "field:user.name").type).toBe("field");
      expect(createNode("relationship", "relationship:user.posts").type).toBe("relationship");
      expect(createNode("route", "route:users.list").type).toBe("route");
      expect(createNode("operation", "operation:create-user").type).toBe("operation");
      expect(createNode("event", "event:user-created").type).toBe("event");
      expect(createNode("policy", "policy:owns-post").type).toBe("policy");
      expect(createNode("workflow", "workflow:checkout").type).toBe("workflow");
      expect(createNode("service", "service:auth").type).toBe("service");
      expect(createNode("integration", "integration:stripe").type).toBe("integration");
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

  it("creates route nodes from explicit route definitions", () => {
    const app = defineApp({
      name: "my-app",
      version: "1.0.0",
      environment: "development",
      stack: { language: "typescript", runtime: "node" },
      routes: [
        defineRoute({
          name: "users.list",
          method: "GET",
          path: "/users",
          description: "List users",
          parameters: [defineParameter({ name: "limit", location: "query", type: "integer" })],
        }),
      ],
    });

    const graph = buildGraph(app);

    expect(graph.nodes).toContainEqual({
      id: "route:get:users.list",
      type: "route",
      data: {
        id: "get:users.list",
        name: "users.list",
        method: "GET",
        path: "/users",
        description: "List users",
        parameters: [{ name: "limit", location: "query", required: false, type: "integer" }],
      },
    });
    expect(graph.edges).toContainEqual({
      from: "app:my-app",
      to: "route:get:users.list",
      type: "contains",
    });
  });

  describe("serializeGraph", () => {
    it("serializes a graph into a stable JSON string", () => {
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

      const graph = buildGraph(app);
      const json = serializeGraph(graph);

      const parsed = JSON.parse(json);

      expect(parsed["format"]).toBe("mavibase-graph");
      expect(parsed["schemaVersion"]).toBe(1);
      expect(parsed["graph"]).toEqual(graph);
    });

    it("produces identical output for the same graph", () => {
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

      expect(serializeGraph(graph)).toBe(serializeGraph(graph));
    });

    it("produces identical output for shuffled non-semantic graph ordering", () => {
      const first = {
        name: "my-app",
        version: "1.0.0",
        nodes: [
          { id: "model:post", type: "model" as const, data: { z: 1, a: 2 } },
          { id: "app:my-app", type: "application" as const },
        ],
        edges: [
          { from: "model:post", to: "field:post:title", type: "has-field" as const },
          { from: "app:my-app", to: "model:post", type: "contains" as const },
        ],
      };
      const second = {
        name: "my-app",
        version: "1.0.0",
        nodes: [
          { id: "app:my-app", type: "application" as const },
          { id: "model:post", type: "model" as const, data: { a: 2, z: 1 } },
        ],
        edges: [
          { from: "app:my-app", to: "model:post", type: "contains" as const },
          { from: "model:post", to: "field:post:title", type: "has-field" as const },
        ],
      };

      expect(serializeGraph(first)).toBe(serializeGraph(second));
    });

    it("does not mutate caller-owned graph arrays or nested data", () => {
      const graph = {
        name: "my-app",
        version: "1.0.0",
        nodes: [
          { id: "model:post", type: "model" as const, data: { z: 1, a: 2 } },
          { id: "app:my-app", type: "application" as const },
        ],
        edges: [],
      };
      const originalNodes = [...graph.nodes];
      const originalData = graph.nodes[0]?.data;

      canonicalizeGraph(graph);

      expect(graph.nodes).toEqual(originalNodes);
      expect(graph.nodes[0]?.data).toBe(originalData);
    });
  });

  describe("deserializeGraph", () => {
    it("deserializes a serialized graph back to its original form", () => {
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

      const graph = buildGraph(app);
      const restored = deserializeGraph(serializeGraph(graph));

      expect(restored).toEqual(graph);
    });

    it("round-trips through build -> serialize -> deserialize", () => {
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
      const restored = deserializeGraph(serializeGraph(graph));

      expect(restored.name).toBe("my-app");
      expect(restored.nodes).toHaveLength(graph.nodes.length);
      expect(restored.edges).toEqual(graph.edges);
    });

    it("throws for invalid JSON", () => {
      expect(() => deserializeGraph("not-json")).toThrow("Failed to parse graph JSON.");
    });

    it("throws for an invalid format", () => {
      expect(() =>
        deserializeGraph(JSON.stringify({ format: "other", schemaVersion: 1, graph: {} })),
      ).toThrow('Invalid graph format. Expected "mavibase-graph".');
    });

    it("throws for an unsupported schema version", () => {
      expect(() =>
        deserializeGraph(
          JSON.stringify({
            format: "mavibase-graph",
            schemaVersion: 99,
            graph: {},
          }),
        ),
      ).toThrow('Unsupported graph schema version: "99".');
    });

    it("throws for a missing graph payload", () => {
      expect(() =>
        deserializeGraph(JSON.stringify({ format: "mavibase-graph", schemaVersion: 1 })),
      ).toThrow("Invalid graph payload.");
    });

    it("throws with diagnostics for an invalid graph structure", () => {
      expect(() =>
        deserializeGraph(
          JSON.stringify({
            format: "mavibase-graph",
            schemaVersion: 1,
            graph: { name: "my-app", version: "1.0.0", nodes: {}, edges: [] },
          }),
        ),
      ).toThrow(GraphValidationError);

      try {
        deserializeGraph(
          JSON.stringify({
            format: "mavibase-graph",
            schemaVersion: 1,
            graph: { name: "my-app", version: "1.0.0", nodes: {}, edges: [] },
          }),
        );
      } catch (error) {
        expect(error).toBeInstanceOf(GraphValidationError);
        expect((error as GraphValidationError).diagnostics).toContainEqual(
          expect.objectContaining({
            code: "graph.invalid-shape",
            path: "nodes",
          }),
        );
      }
    });
  });

  describe("validateGraph", () => {
    it("returns no issues for a valid graph", () => {
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

      const graph = buildGraph(app);

      expect(validateGraph(graph)).toEqual([]);
    });

    it("reports duplicate node ids", () => {
      const graph = {
        name: "my-app",
        version: "1.0.0",
        nodes: [
          { id: "model:user", type: "model" as const },
          { id: "model:user", type: "model" as const },
        ],
        edges: [],
      };

      expect(validateGraph(graph)).toContainEqual({
        path: "nodes[model:user]",
        message: 'Duplicate node id: "model:user". Node ids must be unique.',
      });
    });

    it("reports edges referencing unknown source nodes", () => {
      const graph = {
        name: "my-app",
        version: "1.0.0",
        nodes: [{ id: "model:user", type: "model" as const }],
        edges: [
          {
            from: "model:missing",
            to: "model:user",
            type: "connects" as const,
          },
        ],
      };

      expect(validateGraph(graph)).toContainEqual({
        path: "edges[model:missing -> model:user]",
        message: 'Edge references unknown source node: "model:missing".',
      });
    });

    it("reports edges referencing unknown target nodes", () => {
      const graph = {
        name: "my-app",
        version: "1.0.0",
        nodes: [{ id: "model:user", type: "model" as const }],
        edges: [
          {
            from: "model:user",
            to: "model:missing",
            type: "connects" as const,
          },
        ],
      };

      expect(validateGraph(graph)).toContainEqual({
        path: "edges[model:user -> model:missing]",
        message: 'Edge references unknown target node: "model:missing".',
      });
    });

    it("reports edges with missing endpoints", () => {
      const graph = {
        name: "my-app",
        version: "1.0.0",
        nodes: [{ id: "model:user", type: "model" as const }],
        edges: [{ from: "", to: "", type: "connects" as const }],
      };

      expect(validateGraph(graph)).toContainEqual({
        path: "edges",
        message: "Edge must define both from and to node ids.",
      });
    });

    it("reports application nodes with non-contains edges", () => {
      const graph = {
        name: "my-app",
        version: "1.0.0",
        nodes: [{ id: "app:my-app", type: "application" as const }],
        edges: [
          {
            from: "app:my-app",
            to: "app:my-app",
            type: "targets" as const,
          },
        ],
      };

      expect(validateGraph(graph)).toContainEqual({
        path: "edges[app:my-app -> app:my-app]",
        message: "Application nodes may only have contains edges.",
      });
    });

    it("reports invalid node and edge shapes", () => {
      const result = validateGraphResult({
        name: "my-app",
        version: "1.0.0",
        nodes: [
          { id: "model:user", type: "unknown" },
          { id: "model:user", type: "model", data: [] },
        ],
        edges: [
          { from: "model:user", to: "model:user", type: "unknown", data: [] },
        ],
      });

      expect(result.valid).toBe(false);
      expect(result.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "graph.invalid-node", path: "nodes[0].type" }),
          expect.objectContaining({ code: "graph.invalid-node", path: "nodes[1].data" }),
          expect.objectContaining({ code: "graph.invalid-edge", path: "edges[0].type" }),
          expect.objectContaining({ code: "graph.invalid-edge", path: "edges[0].data" }),
        ]),
      );
    });

    it("reports duplicate edges", () => {
      const issues = validateGraph({
        name: "my-app",
        version: "1.0.0",
        nodes: [
          { id: "model:user", type: "model" as const },
          { id: "model:post", type: "model" as const },
        ],
        edges: [
          { from: "model:user", to: "model:post", type: "connects" as const },
          { from: "model:user", to: "model:post", type: "connects" as const },
        ],
      });

      expect(issues).toContainEqual({
        path: "edges[1]",
        message: 'Duplicate edge: "model:user -> model:post (connects)".',
      });
    });
  });

  describe("graph traversal", () => {
    it("traverses from a node to its dependents via edges", () => {
      const User = defineModel({
        name: "User",
        fields: {
          id: field.uuid(),
          email: field.string(),
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

      const outgoing = graph.edges
        .filter((edge) => edge.from === "model:user")
        .map((edge) => edge.to);

      expect(outgoing).toEqual(["field:user.id", "field:user.email"]);

      const incoming = graph.edges
        .filter((edge) => edge.to === "model:user")
        .map((edge) => edge.from);

      expect(incoming).toEqual(["app:my-app"]);
    });
  });
});
