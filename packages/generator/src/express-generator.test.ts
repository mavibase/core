import { describe, expect, it } from "vitest";

import { defineApp, defineModel, field } from "@mavibase/core";
import { generateFromDefinition } from "./index.js";

describe("Express CRUD generator", () => {
  it("generates controller, repository, and route boundaries for enabled CRUD", () => {
    const app = defineApp({
      name: "api",
      version: "1.0.0",
      environment: "development",
      stack: {
        language: "typescript",
        runtime: "node",
        backend: { framework: "express" },
      },
      models: [defineModel({
        name: "User",
        fields: { id: field.uuid().primary(), email: field.string().required() },
        crud: {
          enabled: true,
          operations: { list: true, get: true, create: true, update: true, delete: true },
        },
      })],
    });

    const result = generateFromDefinition(app, { layout: "structured" });
    const paths = result.artifacts.map((artifact) => artifact.path);
    const controllers = result.artifacts.find((artifact) => artifact.path === "controllers/crud.ts");
    const repositories = result.artifacts.find((artifact) => artifact.path === "repositories/index.ts");
    const routes = result.artifacts.find((artifact) => artifact.path === "routes/crud.ts");

    expect(paths).toContain("controllers/crud.ts");
    expect(paths).toContain("repositories/index.ts");
    expect(paths).toContain("routes/crud.ts");
    expect(controllers?.content).toContain("createListUserController");
    expect(controllers?.content).toContain("repositories/index.js");
    expect(repositories?.content).toContain("export interface UserRepository");
    expect(repositories?.content).toContain("list(input: CrudRequestInput)");
    expect(routes?.content).toContain('app.get("/users"');
    expect(routes?.content).toContain('app.patch("/users/:id"');
    expect(routes?.content).toContain('app.delete("/users/:id"');
  });

  it("does not generate CRUD boundaries for disabled or unconfigured models", () => {
    const app = defineApp({
      name: "api",
      version: "1.0.0",
      environment: "development",
      stack: { language: "typescript", runtime: "node", backend: { framework: "express" } },
      models: [defineModel({ name: "User" })],
    });

    const result = generateFromDefinition(app, { layout: "structured" });
    const paths = result.artifacts.map((artifact) => artifact.path);

    expect(paths).not.toContain("controllers/crud.ts");
    expect(paths).not.toContain("repositories/index.ts");
    expect(paths).not.toContain("routes/crud.ts");
  });

  it("does not emit Express CRUD output for another backend framework", () => {
    const app = defineApp({
      name: "api",
      version: "1.0.0",
      environment: "development",
      stack: { language: "typescript", runtime: "node", backend: { framework: "fastify" } },
      models: [defineModel({ name: "User", crud: { enabled: true, operations: { list: true } } })],
    });

    const result = generateFromDefinition(app, { layout: "structured" });
    expect(result.artifacts.some((artifact) => artifact.path === "controllers/crud.ts")).toBe(false);
  });
});
