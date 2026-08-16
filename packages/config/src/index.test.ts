import { describe, expect, it } from "vitest";
import { defineConfig, version } from "./index.js";

describe("config", () => {
  it("exports a version", () => {
    expect(version).toBe("0.1.0");
  });

  it("defines a configuration", () => {
    const config = defineConfig({
      language: "typescript",
      monorepo: true,
      web: {
        framework: "react",
      },
      backend: {
        framework: "express",
      },
    });

    expect(config).toEqual({
      language: "typescript",
      monorepo: true,
      web: { framework: "react" },
      backend: { framework: "express" },
    });
  });
});
