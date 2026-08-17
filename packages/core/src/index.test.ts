import { describe, expect, it } from "vitest";
import { defineApp, defineModel, version } from "./index.js";

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
      models: [],
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

  describe("defineModel", () => {
    it("creates a model with a name", () => {
      const model = defineModel({ name: "User" });
      expect(model.name).toBe("User");
    });

    it("auto-generates a stable id from the name", () => {
      const model = defineModel({ name: "User" });
      expect(model.id).toBe("user");
    });

    it("auto-generates a stable id from a multi-word name", () => {
      const model = defineModel({ name: "User Profile" });
      expect(model.id).toBe("user-profile");
    });

    it("uses a custom id when provided", () => {
      const model = defineModel({ name: "User", id: "custom-id" });
      expect(model.id).toBe("custom-id");
    });

    it("defaults fields to an empty object", () => {
      const model = defineModel({ name: "User" });
      expect(model.fields).toEqual({});
    });

    it("defaults relationships to an empty object", () => {
      const model = defineModel({ name: "User" });
      expect(model.relationships).toEqual({});
    });

    it("defaults indexes to an empty array", () => {
      const model = defineModel({ name: "User" });
      expect(model.indexes).toEqual([]);
    });

    it("defaults constraints to an empty array", () => {
      const model = defineModel({ name: "User" });
      expect(model.constraints).toEqual([]);
    });

    it("defaults metadata to an empty object", () => {
      const model = defineModel({ name: "User" });
      expect(model.metadata).toEqual({});
    });

    it("preserves provided fields", () => {
      const fields = { id: { type: "uuid" } };
      const model = defineModel({ name: "User", fields });
      expect(model.fields).toBe(fields);
    });

    it("preserves provided relationships", () => {
      const relationships = { orders: { type: "hasMany" } };
      const model = defineModel({ name: "User", relationships });
      expect(model.relationships).toBe(relationships);
    });

    it("preserves provided indexes", () => {
      const indexes = [{ fields: ["email"] }];
      const model = defineModel({ name: "User", indexes });
      expect(model.indexes).toBe(indexes);
    });

    it("preserves provided constraints", () => {
      const constraints = [{ type: "unique" }];
      const model = defineModel({ name: "User", constraints });
      expect(model.constraints).toBe(constraints);
    });

    it("preserves provided metadata", () => {
      const metadata = { table: "users" };
      const model = defineModel({ name: "User", metadata });
      expect(model.metadata).toBe(metadata);
    });

    it("rejects an empty model name", () => {
      expect(() => defineModel({ name: "  " })).toThrow("Model name must not be empty.");
    });
  });

  describe("defineApp with models", () => {
    it("accepts models", () => {
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

      expect(app.models).toEqual([User]);
    });

    it("defaults models to an empty array when not provided", () => {
      const app = defineApp({
        name: "my-app",
        version: "1.0.0",
        environment: "development",
        stack: {
          language: "typescript",
          runtime: "node",
        },
      });

      expect(app.models).toEqual([]);
    });

    it("rejects duplicate model names", () => {
      const User1 = defineModel({ name: "User" });
      const User2 = defineModel({ name: "User" });

      expect(() =>
        defineApp({
          name: "my-app",
          version: "1.0.0",
          environment: "development",
          stack: {
            language: "typescript",
            runtime: "node",
          },
          models: [User1, User2],
        }),
      ).toThrow('Duplicate model name: "User". Model names must be unique.');
    });

    it("accepts models with different names", () => {
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

      expect(app.models).toEqual([User, Post]);
    });
  });
});
