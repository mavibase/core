import { describe, expect, it } from "vitest";
import { generate, generateFromDefinition, version } from "./index.js";
import { defineApp } from "@mavibase/core";

describe("generator", () => {
  it("exports a version", () => {
    expect(version).toBe("0.1.0");
  });

  it("generates from an application graph", () => {
    const result = generate({
      nodes: [],
      edges: [],
    });

    expect(result.files).toEqual([]);
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
  });
});
