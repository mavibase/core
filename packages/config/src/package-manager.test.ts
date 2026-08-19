import { describe, expect, it } from "vitest";
import {
  PackageManagerDefinitionError,
  PackageManagerRegistry,
  PackageManagerRegistryError,
  builtInPackageManagerDefinitions,
  createDefaultPackageManagerRegistry,
  validatePackageManagerDefinition,
} from "./package-manager.js";

describe("package manager definitions", () => {
  it("defines all supported built-in package managers", () => {
    const registry = createDefaultPackageManagerRegistry();

    expect(registry.list().map((definition) => definition.id)).toEqual([
      "bun",
      "npm",
      "pnpm",
      "yarn",
    ]);
    expect(registry.require("npm").name).toBe("npm");
    expect(registry.require("pnpm").name).toBe("pnpm");
    expect(registry.require("yarn").name).toBe("Yarn");
    expect(registry.require("bun").name).toBe("Bun");
  });

  it("exposes deterministic command metadata", () => {
    const registry = createDefaultPackageManagerRegistry();

    expect(registry.commands("npm")).toEqual({
      install: "npm install",
      add: "npm install",
      remove: "npm uninstall",
      run: "npm run",
      exec: "npx",
    });
    expect(registry.commands("pnpm").add).toBe("pnpm add");
    expect(registry.commands("yarn").exec).toBe("yarn dlx");
    expect(registry.commands("bun").install).toBe("bun install");
  });

  it("includes manifest and lockfile metadata", () => {
    const registry = createDefaultPackageManagerRegistry();

    expect(registry.require("npm").files).toEqual({
      manifest: "package.json",
      lockfiles: ["package-lock.json"],
    });
    expect(registry.require("pnpm").files.lockfiles).toEqual(["pnpm-lock.yaml"]);
    expect(registry.require("yarn").files.lockfiles).toEqual(["yarn.lock"]);
    expect(registry.require("bun").files.lockfiles).toEqual(["bun.lock"]);
  });

  it("supports custom registration and rejects duplicates", () => {
    const registry = new PackageManagerRegistry();
    const definition = builtInPackageManagerDefinitions[0]!;

    expect(registry.register(definition)).toEqual(registry.require("npm"));
    expect(() => registry.register(definition)).toThrow(PackageManagerRegistryError);
  });

  it("rejects invalid definitions with structured issues", () => {
    const issues = validatePackageManagerDefinition({
      id: "invalid",
      name: "",
      supportedVersions: [],
      commands: { install: "" },
      files: { manifest: "", lockfiles: [] },
    });

    expect(issues.map((issue) => issue.path)).toEqual([
      "id",
      "name",
      "supportedVersions",
      "commands.install",
      "commands.add",
      "commands.remove",
      "commands.run",
      "commands.exec",
      "files.manifest",
      "files.lockfiles",
    ]);
    expect(() => new PackageManagerRegistry([{ id: "invalid" } as never])).toThrow(
      PackageManagerDefinitionError,
    );
  });

  it("returns stable independent definitions", () => {
    const first = createDefaultPackageManagerRegistry().list();
    const second = createDefaultPackageManagerRegistry().list();

    expect(first).toEqual(second);
    expect(first[0]!.files.lockfiles).not.toBe(second[0]!.files.lockfiles);
    expect(first[0]!.files.lockfiles).toEqual(second[0]!.files.lockfiles);
  });

  it("handles missing registry entries consistently", () => {
    const registry = createDefaultPackageManagerRegistry();

    expect(registry.has("npm")).toBe(true);
    expect(registry.has("unknown")).toBe(false);
    expect(registry.get("unknown")).toBeUndefined();
    expect(() => registry.require("unknown")).toThrow(PackageManagerRegistryError);
  });
});
