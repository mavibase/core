 
 import { describe, expect, it } from "vitest";
import { buildGraph, version } from "./index.js";
import { defineApp } from "@mavibase/core";

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

    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
  });
});
