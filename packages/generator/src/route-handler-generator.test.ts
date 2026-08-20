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
    expect(artifact?.content).toContain('import type { Request, Response } from "express";');
    expect(artifact?.content).toContain("export async function UsersCreateHandler");
    expect(artifact?.content).toContain("export async function UsersListHandler");
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

    expect(generateFromDefinition(app).artifacts).toEqual([
      expect.objectContaining({ path: "route-schemas.ts" }),
    ]);
  });
});
