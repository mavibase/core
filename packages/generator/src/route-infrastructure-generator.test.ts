import { describe, expect, it } from "vitest";

import { defineApp, defineMiddleware, defineRoute, field } from "@mavibase/core";
import { generateFromDefinition } from "./index.js";

describe("route infrastructure generators", () => {
  it("generates middleware, consistent errors, and OpenAPI documentation", () => {
    const User = {
      id: "user",
      name: "User",
      fields: { id: field.uuid() },
    };
    const app = defineApp({
      name: "api",
      version: "1.0.0",
      environment: "development",
      stack: { language: "typescript", runtime: "node", backend: { framework: "express" } },
      models: [User],
      routes: [
        defineRoute({
          name: "users.get",
          method: "GET",
          path: "/users/:id",
          description: "Get a user",
          parameters: [{ name: "id", location: "path", type: "uuid" }],
          middleware: [defineMiddleware({ name: "auth", phase: "before" })],
          responses: [{ status: 200, schema: "UserSchema", description: "A user" }],
        }),
      ],
    });

    const result = generateFromDefinition(app, { layout: "structured" });
    const paths = result.artifacts.map((artifact) => artifact.path);
    const middleware = result.artifacts.find((artifact) => artifact.path === "middleware/index.ts");
    const errors = result.artifacts.find((artifact) => artifact.path === "errors/index.ts");
    const docs = result.artifacts.find((artifact) => artifact.path === "docs/openapi.ts");
    const controller = result.artifacts.find(
      (artifact) => artifact.path === "controllers/index.ts",
    );

    expect(paths).toContain("middleware/index.ts");
    expect(paths).toContain("errors/index.ts");
    expect(paths).toContain("docs/openapi.ts");
    expect(middleware?.content).toContain('"name":"auth"');
    expect(errors?.content).toContain('"NOT_IMPLEMENTED"');
    expect(docs?.content).toContain('"/users/{id}"');
    expect(docs?.content).toContain('"200"');
    expect(docs?.content).toContain('"#/components/schemas/UserSchema"');
    expect(controller?.content).toContain('from "../errors/index.js"');
  });

  it("produces the same documentation for the same graph", () => {
    const app = defineApp({
      name: "api",
      version: "1.0.0",
      environment: "development",
      stack: { language: "typescript", runtime: "node" },
      routes: [defineRoute({ name: "health", method: "GET", path: "/health" })],
    });

    const first = generateFromDefinition(app);
    const second = generateFromDefinition(app);

    expect(first).toEqual(second);
  });
});
