import { describe, expect, it } from "vitest";
import {
  defineApp,
  defineModel,
  field,
  relationship,
  validateDefinition,
  version,
} from "./index.js";

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

    it("auto-generates a stable id trimming surrounding spaces", () => {
      const model = defineModel({ name: "  User  " });
      expect(model.id).toBe("user");
    });

    it("auto-generates a stable id collapsing consecutive separators", () => {
      const model = defineModel({ name: "User   Post   Comment" });
      expect(model.id).toBe("user-post-comment");
    });

    it("auto-generates a stable id stripping leading and trailing separators", () => {
      const model = defineModel({ name: "  --User Profile--  " });
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
      const relationships = { orders: relationship.oneToMany().to("Order") };
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

  describe("relationship", () => {
    it("creates a one-to-one relationship", () => {
      expect(relationship.oneToOne()).toEqual({ type: "one-to-one" });
    });

    it("creates a one-to-many relationship", () => {
      expect(relationship.oneToMany()).toEqual({ type: "one-to-many" });
    });

    it("creates a many-to-one relationship", () => {
      expect(relationship.manyToOne()).toEqual({ type: "many-to-one" });
    });

    it("creates a many-to-many relationship", () => {
      expect(relationship.manyToMany()).toEqual({ type: "many-to-many" });
    });

    it("points a relationship at a target model", () => {
      expect(relationship.oneToMany().to("Post")).toEqual({
        type: "one-to-many",
        model: "Post",
      });
    });

    it("keeps the original relationship unchanged when pointing", () => {
      const base = relationship.oneToMany();
      const pointed = base.to("Post");

      expect(base).toEqual({ type: "one-to-many" });
      expect(pointed).toEqual({
        type: "one-to-many",
        model: "Post",
      });
    });

    it("registers relationships with targets in a model", () => {
      const User = defineModel({
        name: "User",
        relationships: {
          posts: relationship.oneToMany().to("Post"),
          profile: relationship.oneToOne().to("Profile"),
        },
      });

      expect(User.relationships).toEqual({
        posts: { type: "one-to-many", model: "Post" },
        profile: { type: "one-to-one", model: "Profile" },
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

  describe("validateDefinition", () => {
    it("returns no issues for a valid definition", () => {
      const User = defineModel({
        name: "User",
        fields: {
          id: field.uuid().primary(),
          email: field.string().required().unique(),
        },
        relationships: {
          posts: relationship.oneToMany().to("Post"),
        },
      });

      const Post = defineModel({
        name: "Post",
        fields: {
          id: field.uuid().primary(),
          authorId: field.uuid().required(),
        },
      });

      const issues = validateDefinition({
        name: "my-app",
        version: "1.0.0",
        environment: "development",
        stack: {
          language: "typescript",
          runtime: "node",
        },
        models: [User, Post],
      });

      expect(issues).toEqual([]);
    });

    it("reports duplicate model names", () => {
      const User1 = defineModel({ name: "User" });
      const User2 = defineModel({ name: "User" });

      const issues = validateDefinition({
        name: "my-app",
        version: "1.0.0",
        environment: "development",
        stack: {
          language: "typescript",
          runtime: "node",
        },
        models: [User1, User2],
      });

      expect(issues).toContainEqual({
        path: "models.User",
        message: 'Duplicate model name: "User". Model names must be unique.',
      });
    });

    it("reports invalid field types", () => {
      const User = {
        id: "user",
        name: "User",
        fields: {
          profile: { type: "unknown-type" },
        },
      };

      const issues = validateDefinition({
        name: "my-app",
        version: "1.0.0",
        environment: "development",
        stack: {
          language: "typescript",
          runtime: "node",
        },
        models: [User],
      });

      expect(issues).toContainEqual({
        path: "models.User.fields.profile.type",
        message: 'Invalid field type for "User.profile".',
      });
    });

    it("reports invalid relationship types", () => {
      const User = {
        id: "user",
        name: "User",
        relationships: {
          posts: { type: "has-many" },
        },
      };

      const issues = validateDefinition({
        name: "my-app",
        version: "1.0.0",
        environment: "development",
        stack: {
          language: "typescript",
          runtime: "node",
        },
        models: [User],
      });

      expect(issues).toContainEqual({
        path: "models.User.relationships.posts.type",
        message: 'Invalid relationship type for "User.posts".',
      });
    });

    it("reports relationships referencing unknown models", () => {
      const User = defineModel({
        name: "User",
        relationships: {
          posts: relationship.oneToMany().to("Post"),
        },
      });

      const issues = validateDefinition({
        name: "my-app",
        version: "1.0.0",
        environment: "development",
        stack: {
          language: "typescript",
          runtime: "node",
        },
        models: [User],
      });

      expect(issues).toContainEqual({
        path: "models.User.relationships.posts.model",
        message: 'Relationship "User.posts" references unknown model "Post".',
      });
    });

    it("reports circular relationship dependencies", () => {
      const User = defineModel({
        name: "User",
        relationships: {
          posts: relationship.oneToMany().to("Post"),
        },
      });

      const Post = defineModel({
        name: "Post",
        relationships: {
          author: relationship.manyToOne().to("User"),
        },
      });

      const issues = validateDefinition({
        name: "my-app",
        version: "1.0.0",
        environment: "development",
        stack: {
          language: "typescript",
          runtime: "node",
        },
        models: [User, Post],
      });

      expect(issues).toContainEqual(
        expect.objectContaining({
          path: "models",
          message: expect.stringContaining(
            "Circular relationship dependency",
          ),
        }),
      );
    });

    it("does not report circular dependencies for self-referencing models", () => {
      const User = defineModel({
        name: "User",
        relationships: {
          manager: relationship.manyToOne().to("User"),
        },
      });

      const issues = validateDefinition({
        name: "my-app",
        version: "1.0.0",
        environment: "development",
        stack: {
          language: "typescript",
          runtime: "node",
        },
        models: [User],
      });

      expect(issues).toEqual([]);
    });

    it("returns no issues for a non-object definition", () => {
      expect(validateDefinition(null)).toEqual([]);
      expect(validateDefinition(undefined)).toEqual([]);
      expect(validateDefinition("not-a-definition")).toEqual([]);
      expect(validateDefinition(42)).toEqual([]);
    });

    it("ignores models without a name", () => {
      const issues = validateDefinition({
        name: "my-app",
        version: "1.0.0",
        environment: "development",
        stack: {
          language: "typescript",
          runtime: "node",
        },
        models: [{ id: "no-name" }],
      });

      expect(issues).toEqual([]);
    });

    it("reports multiple issues in a single definition", () => {
      const User = defineModel({
        name: "User",
        fields: {
          profile: { type: "unknown-type" as never },
        },
        relationships: {
          posts: relationship.oneToMany().to("Post"),
        },
      });

      const issues = validateDefinition({
        name: "my-app",
        version: "1.0.0",
        environment: "development",
        stack: {
          language: "typescript",
          runtime: "node",
        },
        models: [User],
      });

      expect(issues).toHaveLength(2);
      expect(issues).toContainEqual({
        path: "models.User.fields.profile.type",
        message: 'Invalid field type for "User.profile".',
      });
      expect(issues).toContainEqual({
        path: "models.User.relationships.posts.model",
        message: 'Relationship "User.posts" references unknown model "Post".',
      });
    });

    it("reports issues for definitions without required app fields", () => {
      const issues = validateDefinition({
        models: [defineModel({ name: "User" })],
      });

      expect(issues).toEqual([]);
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

    it("rejects models with invalid field types", () => {
      const User = {
        id: "user",
        name: "User",
        fields: {
          profile: { type: "unknown-type" as never },
        },
      };

      expect(() =>
        defineApp({
          name: "my-app",
          version: "1.0.0",
          environment: "development",
          stack: {
            language: "typescript",
            runtime: "node",
          },
          models: [User],
        }),
      ).toThrow("Invalid application definition");
    });

    it("rejects models with circular relationship dependencies", () => {
      const User = defineModel({
        name: "User",
        relationships: {
          posts: relationship.oneToMany().to("Post"),
        },
      });

      const Post = defineModel({
        name: "Post",
        relationships: {
          author: relationship.manyToOne().to("User"),
        },
      });

      expect(() =>
        defineApp({
          name: "my-app",
          version: "1.0.0",
          environment: "development",
          stack: {
            language: "typescript",
            runtime: "node",
          },
          models: [User, Post],
        }),
      ).toThrow("Circular relationship dependency");
    });
  });
});
