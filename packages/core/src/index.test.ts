import { describe, expect, it } from "vitest";
import { defineApp, defineModel, field, version } from "./index.js";

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
      const fields = { id: field.uuid() };
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

  describe("field modifiers", () => {
    it("marks a field as required", () => {
      expect(field.string().required()).toEqual({
        type: "string",
        modifiers: { required: true, optional: false },
      });
    });

    it("marks a field as optional", () => {
      expect(field.string().optional()).toEqual({
        type: "string",
        modifiers: { optional: true, required: false },
      });
    });

    it("marks a field as nullable", () => {
      expect(field.string().nullable()).toEqual({
        type: "string",
        modifiers: { nullable: true },
      });
    });

    it("marks a field as unique", () => {
      expect(field.string().unique()).toEqual({
        type: "string",
        modifiers: { unique: true },
      });
    });

    it("marks a field as indexed", () => {
      expect(field.string().indexed()).toEqual({
        type: "string",
        modifiers: { indexed: true },
      });
    });

    it("marks a field as primary", () => {
      expect(field.uuid().primary()).toEqual({
        type: "uuid",
        modifiers: { primary: true },
      });
    });

    it("sets a default value", () => {
      expect(field.boolean().default(false)).toEqual({
        type: "boolean",
        modifiers: { default: false },
      });
    });

    it("marks a field as generated", () => {
      expect(field.datetime().generated()).toEqual({
        type: "datetime",
        modifiers: { generated: true },
      });
    });

    it("marks a field as read-only", () => {
      expect(field.string().readOnly()).toEqual({
        type: "string",
        modifiers: { readOnly: true },
      });
    });

    it("marks a field as write-only", () => {
      expect(field.string().writeOnly()).toEqual({
        type: "string",
        modifiers: { writeOnly: true },
      });
    });

    it("chains multiple modifiers", () => {
      expect(field.string().required().unique().indexed()).toEqual({
        type: "string",
        modifiers: {
          required: true,
          optional: false,
          unique: true,
          indexed: true,
        },
      });
    });

    it("keeps the original field unchanged when chaining", () => {
      const base = field.string();
      const modified = base.required();

      expect(base).toEqual({ type: "string" });
      expect(modified).toEqual({
        type: "string",
        modifiers: { required: true, optional: false },
      });
    });

    it("registers modified fields in a model", () => {
      const User = defineModel({
        name: "User",
        fields: {
          id: field.uuid().primary(),
          email: field.string().required().unique(),
          nickname: field.string().nullable(),
          createdAt: field.datetime().generated(),
        },
      });

      expect(User.fields).toEqual({
        id: { type: "uuid", modifiers: { primary: true } },
        email: {
          type: "string",
          modifiers: { required: true, optional: false, unique: true },
        },
        nickname: { type: "string", modifiers: { nullable: true } },
        createdAt: { type: "datetime", modifiers: { generated: true } },
      });
    });
  });

  describe("field", () => {
    it("creates a string field", () => {
      expect(field.string()).toEqual({ type: "string" });
    });

    it("creates an integer field", () => {
      expect(field.integer()).toEqual({ type: "integer" });
    });

    it("creates a float field", () => {
      expect(field.float()).toEqual({ type: "float" });
    });

    it("creates a decimal field", () => {
      expect(field.decimal()).toEqual({ type: "decimal" });
    });

    it("creates a boolean field", () => {
      expect(field.boolean()).toEqual({ type: "boolean" });
    });

    it("creates a uuid field", () => {
      expect(field.uuid()).toEqual({ type: "uuid" });
    });

    it("creates a datetime field", () => {
      expect(field.datetime()).toEqual({ type: "datetime" });
    });

    it("creates a json field", () => {
      expect(field.json()).toEqual({ type: "json" });
    });

    it("registers fields in a model", () => {
      const User = defineModel({
        name: "User",
        fields: {
          id: field.uuid(),
          email: field.string(),
          age: field.integer(),
          active: field.boolean(),
        },
      });

      expect(User.fields).toEqual({
        id: { type: "uuid" },
        email: { type: "string" },
        age: { type: "integer" },
        active: { type: "boolean" },
      });
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
