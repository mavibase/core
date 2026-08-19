import { describe, expect, it } from "vitest";

import {
  builtInRuntimeDefinitions,
  createDefaultRuntimeRegistry,
  defineRuntime,
  RuntimeDefinitionError,
  RuntimeRegistry,
  RuntimeRegistryError,
  validateRuntimeDefinition,
} from "./runtime.js";

describe("runtime definitions", () => {
  it("creates a valid runtime definition", () => {
    const definition = defineRuntime({
      id: "node",
      name: "Node.js",
      supportedVersions: [">=20"],
      languages: ["javascript", "typescript"],
      capabilities: ["esm", "filesystem"],
      packageManagers: ["npm", "pnpm"],
      configuration: [{ key: "module", required: false }],
    });

    expect(definition).toEqual({
      id: "node",
      name: "Node.js",
      supportedVersions: [">=20"],
      languages: ["javascript", "typescript"],
      capabilities: ["esm", "filesystem"],
      packageManagers: ["npm", "pnpm"],
      configuration: [{ key: "module", required: false }],
    });
  });

  it("validates metadata and references", () => {
    const issues = validateRuntimeDefinition({
      id: "python",
      name: "",
      supportedVersions: [],
      languages: ["javascript", "javascript"],
      capabilities: ["", "filesystem"],
      packageManagers: ["npm", "npm"],
      configuration: [
        { key: "mode", required: true },
        { key: "mode", required: true },
      ],
    });

    expect(issues.map((issue) => issue.path)).toEqual([
      "id",
      "name",
      "supportedVersions",
      "languages[1]",
      "capabilities[0]",
      "packageManagers[1]",
      "configuration[1].key",
    ]);
  });

  it("rejects invalid definitions with structured errors", () => {
    expect(() =>
      defineRuntime({
        id: "node",
        name: "Node.js",
        supportedVersions: [">=20"],
        languages: [],
        capabilities: ["filesystem"],
      }),
    ).toThrow(RuntimeDefinitionError);
  });

  it("registers and retrieves runtimes deterministically", () => {
    const registry = new RuntimeRegistry([
      builtInRuntimeDefinitions[2]!,
      builtInRuntimeDefinitions[0]!,
      builtInRuntimeDefinitions[1]!,
    ]);

    expect(registry.has("node")).toBe(true);
    expect(registry.get("bun")?.name).toBe("Bun");
    expect(registry.supportedVersions("deno")).toEqual([">=1"]);
    expect(registry.languages("node")).toEqual(["javascript", "typescript"]);
    expect(registry.capabilities("node")).toContain("fetch");
    expect(registry.list().map((runtime) => runtime.id)).toEqual(["bun", "deno", "node"]);
  });

  it("provides built-in Node.js, Bun, and Deno definitions", () => {
    const registry = createDefaultRuntimeRegistry();

    expect(registry.require("node").supportedVersions).toEqual([">=20"]);
    expect(registry.require("bun").supportedVersions).toEqual([">=1"]);
    expect(registry.require("deno").supportedVersions).toEqual([">=1"]);
  });

  it("integrates with framework runtime references", () => {
    const frameworkRuntimes = ["node", "bun", "deno"] as const;
    const registry = createDefaultRuntimeRegistry();

    expect(frameworkRuntimes.every((runtime) => registry.has(runtime))).toBe(true);
  });

  it("rejects duplicate and missing runtime registrations", () => {
    const registry = new RuntimeRegistry();
    registry.register(builtInRuntimeDefinitions[0]!);

    expect(() => registry.register(builtInRuntimeDefinitions[0]!)).toThrow(RuntimeRegistryError);
    expect(registry.get("missing")).toBeUndefined();
    expect(() => registry.require("missing")).toThrow(RuntimeRegistryError);
  });

  it("returns stable results for repeated registry construction", () => {
    const first = createDefaultRuntimeRegistry().list();
    const second = createDefaultRuntimeRegistry().list();

    expect(first).toEqual(second);
  });
});
