import { describe, expect, it } from "vitest";

import { defineApp, defineMiddleware, defineRoute } from "@mavibase/core";
import { generateFromDefinition } from "./index.js";
import {
  generateRouteRegistration,
  routeRegistrationTemplateData,
} from "./route-registration-generator.js";
import { buildGraph } from "@mavibase/application-graph";

describe("route registration generator", () => {
  it("generates deterministic Express registration for sorted routes", () => {
    const app = defineApp({
      name: "api",
      version: "1.0.0",
      environment: "development",
      stack: { language: "typescript", runtime: "node", backend: { framework: "express" } },
      routes: [
        defineRoute({
          name: "users.create",
          method: "POST",
          path: "/users",
          middleware: [defineMiddleware({ name: "authenticate" })],
        }),
        defineRoute({ name: "health", method: "GET", path: "/health" }),
      ],
    });

    const graph = buildGraph(app);
    const first = generateRouteRegistration(graph);
    const second = generateRouteRegistration(graph);

    expect(first).toEqual(second);
    expect(first?.path).toBe("route-registration.ts");
    expect(first?.content).toContain(
      'import type { ErrorRequestHandler, Express, RequestHandler } from "express";',
    );
    expect(first?.content).toContain(
      'import { createUsersCreateHandler, type UsersCreateDependencies } from "./route-handlers.js";',
    );
    expect(first?.content).toContain(
      'app.get("/health", ...routeMiddleware(dependencies, []), createHealthHandler(dependencies.health));',
    );
    expect(first?.content).toContain(
      'import { resolveUsersCreateMiddleware } from "./route-middleware.js";',
    );
    expect(first?.content).toContain(
      'app.post("/users", ...resolveUsersCreateMiddleware<RequestHandler>(dependencies.middleware), createUsersCreateHandler(dependencies.usersCreate));',
    );
    expect(first?.content).toContain("if (dependencies.errorHandler) app.use(dependencies.errorHandler);");
    expect(routeRegistrationTemplateData(graph)?.routes.map((route) => route.name)).toEqual([
      "health",
      "users.create",
    ]);
  });

  it("emits structured registration imports next to structured handlers", () => {
    const app = defineApp({
      name: "api",
      version: "1.0.0",
      environment: "development",
      stack: { language: "typescript", runtime: "node", backend: { framework: "express" } },
      routes: [defineRoute({ name: "health", method: "GET", path: "/health" })],
    });

    const result = generateFromDefinition(app, { layout: "structured" });
    const artifact = result.artifacts.find(
      (candidate) => candidate.path === "routes/registration.ts",
    );

    expect(artifact?.content).toContain(
      'from "../controllers/index.js";',
    );
  });

  it("supports the existing non-Express framework adapters", () => {
    const app = defineApp({
      name: "api",
      version: "1.0.0",
      environment: "development",
      stack: { language: "typescript", runtime: "node" },
      routes: [defineRoute({ name: "health", method: "GET", path: "/health" })],
    });

    expect(generateFromDefinition(app, { framework: "fastify" }).artifacts
      .find((artifact) => artifact.path === "route-registration.ts")?.content)
      .toContain("app.route({ method: \"GET\"");
    expect(generateFromDefinition(app, { framework: "hono" }).artifacts
      .find((artifact) => artifact.path === "route-registration.ts")?.content)
      .toContain("app.on(\"GET\"");
    expect(generateFromDefinition(app, { framework: "nestjs" }).artifacts
      .find((artifact) => artifact.path === "route-registration.ts")?.content)
      .toContain("new MavibaseController(dependencies)");
  });
});
