import { describe, expect, it } from "vitest";

import { defineApp, defineRoute } from "@mavibase/core";
import { generateFromDefinition } from "./index.js";

describe("route handler generator", () => {
  it("generates deterministic Express handlers from the configured backend", () => {
    const app = defineApp({
      name: "api",
      version: "1.0.0",
      environment: "development",
      stack: { language: "typescript", runtime: "node", backend: { framework: "express" } },
      routes: [
        defineRoute({ name: "users.list", method: "GET", path: "/users" }),
        defineRoute({ name: "users.create", method: "POST", path: "/users" }),
      ],
    });

    const first = generateFromDefinition(app);
    const second = generateFromDefinition(app);
    const artifact = first.artifacts.find((candidate) => candidate.path === "route-handlers.ts");

    expect(first).toEqual(second);
    expect(artifact?.content).toContain(
      'import type { NextFunction, Request, Response } from "express";',
    );
    expect(artifact?.content).toContain("export interface UsersCreateDependencies");
    expect(artifact?.content).toContain("export function createUsersCreateHandler");
    expect(artifact?.content).toContain("deps.execute");
    expect(artifact?.content).toContain('throw new Error("Implement users.create service.")');
    expect(artifact?.content).not.toContain("notImplementedError");
  });

  it("passes the configured success status to the dependency-injected handler", () => {
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
          responses: [{ status: 201 }],
        }),
      ],
    });

    const artifact = generateFromDefinition(app).artifacts.find(
      (candidate) => candidate.path === "route-handlers.ts",
    );

    expect(artifact?.content).toContain("response.status(201).json(result);");
    expect(artifact?.content).toContain(
      "params: request.params as Record<string, unknown>, query: request.query as Record<string, unknown>",
    );
  });

  it("forwards dependency failures to the Express error boundary", () => {
    const app = defineApp({
      name: "api",
      version: "1.0.0",
      environment: "development",
      stack: { language: "typescript", runtime: "node", backend: { framework: "express" } },
      routes: [defineRoute({ name: "health", method: "GET", path: "/health" })],
    });

    const artifact = generateFromDefinition(app).artifacts.find(
      (candidate) => candidate.path === "route-handlers.ts",
    );

    expect(artifact?.content).toContain("catch (error)");
    expect(artifact?.content).toContain("next(error);");
  });

  it("supports an explicit Fastify framework", () => {
    const app = defineApp({
      name: "api",
      version: "1.0.0",
      environment: "development",
      stack: { language: "typescript", runtime: "node" },
      routes: [defineRoute({ name: "health", method: "GET", path: "/health" })],
    });

    const result = generateFromDefinition(app, { framework: "fastify", layout: "structured" });
    const artifact = result.artifacts.find(
      (candidate) => candidate.path === "controllers/index.ts",
    );

    expect(artifact?.content).toContain(
      'import type { FastifyReply, FastifyRequest } from "fastify";',
    );
    expect(artifact?.content).toContain("HealthHandler");
  });

  it("generates a NestJS controller with route decorators", () => {
    const app = defineApp({
      name: "api",
      version: "1.0.0",
      environment: "development",
      stack: { language: "typescript", runtime: "node" },
      routes: [defineRoute({ name: "health", method: "GET", path: "/health" })],
    });

    const result = generateFromDefinition(app, { framework: "nestjs" });

    expect(
      result.artifacts.find((candidate) => candidate.path === "route-handlers.ts")?.content,
    ).toContain('@Get("/health")');
  });

  it("does not generate handlers without a backend framework", () => {
    const app = defineApp({
      name: "api",
      version: "1.0.0",
      environment: "development",
      stack: { language: "typescript", runtime: "node" },
      routes: [defineRoute({ name: "health", method: "GET", path: "/health" })],
    });

    const artifacts = generateFromDefinition(app).artifacts;
    expect(artifacts.some((artifact) => artifact.path === "route-handlers.ts")).toBe(false);
    expect(artifacts.some((artifact) => artifact.path === "route-schemas.ts")).toBe(true);
  });
});
