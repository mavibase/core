import { describe, expect, it } from "vitest";

import {
  builtInFrameworkDefinitions,
  createDefaultFrameworkRegistry,
  defineFramework,
  FrameworkDefinitionError,
  FrameworkRegistry,
  FrameworkRegistryError,
  validateFrameworkDefinition,
} from "./framework.js";

describe("framework definitions", () => {
  it("creates a valid framework definition", () => {
    const definition = defineFramework({
      id: "react",
      name: "React",
      category: "frontend",
      runtimes: ["node", "bun"],
      languages: ["typescript"],
      capabilities: ["client-rendering", "component-based-ui"],
      configuration: [{ key: "jsx", required: false }],
      generator: "frontend-react",
      supportedVersions: ["18", "19"],
    });

    expect(definition).toEqual({
      id: "react",
      name: "React",
      category: "frontend",
      runtimes: ["node", "bun"],
      languages: ["typescript"],
      capabilities: ["client-rendering", "component-based-ui"],
      configuration: [{ key: "jsx", required: false }],
      generator: "frontend-react",
      supportedVersions: ["18", "19"],
    });
  });

  it("validates categories, runtime/language references, and capabilities", () => {
    const issues = validateFrameworkDefinition({
      id: "React Framework",
      name: "",
      category: "mobile",
      runtimes: ["unknown"],
      languages: ["javascript"],
      capabilities: ["routing", "routing", ""],
    });

    expect(issues.map((issue) => issue.path)).toEqual([
      "id",
      "name",
      "category",
      "runtimes[0]",
      "languages[0]",
      "capabilities[1]",
      "capabilities[2]",
    ]);
    expect(issues.some((issue) => issue.message.includes("duplicate values"))).toBe(true);
  });

  it("rejects invalid definitions with structured issues", () => {
    expect(() =>
      defineFramework({
        id: "express",
        name: "Express",
        category: "backend",
        runtimes: [],
        languages: ["typescript"],
        capabilities: ["routing"],
      }),
    ).toThrow(FrameworkDefinitionError);
  });

  it("registers and looks up frameworks deterministically", () => {
    const registry = new FrameworkRegistry([
      builtInFrameworkDefinitions[2]!,
      builtInFrameworkDefinitions[0]!,
      builtInFrameworkDefinitions[1]!,
    ]);

    expect(registry.has("react")).toBe(true);
    expect(registry.get("express")?.category).toBe("backend");
    expect(registry.capabilities("fastify")).toContain("routing");
    expect(registry.list().map((framework) => framework.id)).toEqual([
      "express",
      "fastify",
      "react",
    ]);
  });

  it("supports representative built-in framework definitions", () => {
    const registry = createDefaultFrameworkRegistry();

    expect(registry.get("react")?.category).toBe("frontend");
    expect(registry.get("express")?.category).toBe("backend");
    expect(registry.get("fastify")?.category).toBe("backend");
    expect(registry.get("nextjs")?.category).toBe("full-stack");
  });

  it("rejects duplicate and missing registry entries", () => {
    const registry = new FrameworkRegistry();
    registry.register(builtInFrameworkDefinitions[0]!);

    expect(() => registry.register(builtInFrameworkDefinitions[0]!)).toThrow(
      FrameworkRegistryError,
    );
    expect(registry.get("missing")).toBeUndefined();
    expect(() => registry.require("missing")).toThrow(FrameworkRegistryError);
  });

  it("returns stable results for repeated registry construction", () => {
    const first = createDefaultFrameworkRegistry().list();
    const second = createDefaultFrameworkRegistry().list();

    expect(first).toEqual(second);
  });
});
