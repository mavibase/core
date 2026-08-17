import { describe, expect, it } from "vitest";
import { defineApp, version } from "./index.js";

describe("core", () => {
  it("exports a version", () => {
    expect(version).toBe("0.1.0");
  });

  it("defines a minimal application", () => {
    const app = defineApp({
      name: "my-app",
      version: "1.0.0",
      environment: "development",
      stack: {
        language: "typescript",
        runtime: "node",
      },
    });

    expect(app.name).toBe("my-app");
    expect(app.version).toBe("1.0.0");
    expect(app.environment).toBe("development");
    expect(app.stack).toEqual({
      language: "typescript",
      runtime: "node",
    });
    expect(app.definitions).toEqual({});
  });

  it("defines an application with stack, features, and definitions", () => {
    const app = defineApp({
      name: "my-app",
      version: "1.2.3",
      environment: "production",
      stack: {
        language: "typescript",
        runtime: "node",
        web: { framework: "react" },
        backend: { framework: "express" },
        database: { provider: "postgresql" },
      },
      features: {
        authentication: true,
        validation: true,
        tests: true,
      },
      definitions: {
        User: { fields: [] },
      },
    });

    expect(app).toEqual({
      name: "my-app",
      version: "1.2.3",
      environment: "production",
      stack: {
        language: "typescript",
        runtime: "node",
        web: { framework: "react" },
        backend: { framework: "express" },
        database: { provider: "postgresql" },
      },
      features: {
        authentication: true,
        validation: true,
        tests: true,
      },
      definitions: {
        User: { fields: [] },
      },
    });
  });

  it("defaults definitions to an empty registry when not provided", () => {
    const app = defineApp({
      name: "my-app",
      version: "1.0.0",
      environment: "test",
      stack: {
        language: "typescript",
        runtime: "bun",
      },
    });

    expect(app.definitions).toEqual({});
  });

  it("preserves the provided definitions registry", () => {
    const definitions = {
      User: { fields: [] },
      Post: { fields: [] },
    };

    const app = defineApp({
      name: "my-app",
      version: "1.0.0",
      environment: "test",
      stack: {
        language: "typescript",
        runtime: "deno",
      },
      definitions,
    });

    expect(app.definitions).toBe(definitions);
  });

  it("rejects an empty application name", () => {
    expect(() =>
      defineApp({
        name: "  ",
        version: "1.0.0",
        environment: "development",
        stack: {
          language: "typescript",
          runtime: "node",
        },
      }),
    ).toThrow("Application name must not be empty.");
  });

  it("rejects an invalid application version", () => {
    expect(() =>
      defineApp({
        name: "my-app",
        version: "latest",
        environment: "development",
        stack: {
          language: "typescript",
          runtime: "node",
        },
      }),
    ).toThrow('Invalid application version: "latest". Expected semver.');
  });

  it("accepts a valid semver version", () => {
    const app = defineApp({
      name: "my-app",
      version: "0.1.0-beta.1",
      environment: "test",
      stack: {
        language: "typescript",
        runtime: "node",
      },
    });

    expect(app.version).toBe("0.1.0-beta.1");
    
  });
});
