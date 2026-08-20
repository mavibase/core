import { describe, expect, it } from "vitest";

import { defineApp, defineModel, defineParameter, defineRoute, field } from "@mavibase/core";
import { buildGraph } from "@mavibase/application-graph";

import {
  generateRouteValidation,
  RouteValidationGenerationError,
  routeValidationTemplateData,
} from "./route-validation-generator.js";

describe("route validation generator", () => {
  it("generates deterministic request schemas for route parameters", () => {
    const graph = buildGraph(
      defineApp({
        name: "api-app",
        version: "1.0.0",
        environment: "development",
        stack: { language: "typescript", runtime: "node" },
        models: [defineModel({ name: "User", fields: { id: field.uuid() } })],
        routes: [
          defineRoute({
            name: "users.list",
            method: "GET",
            path: "/users",
            parameters: [defineParameter({ name: "limit", location: "query", type: "integer" })],
          }),
          defineRoute({
            name: "users.get",
            method: "GET",
            path: "/users/:id",
            parameters: [defineParameter({ name: "id", location: "path", type: "uuid" })],
          }),
        ],
      }),
    );
    const first = generateRouteValidation(graph);
    const second = generateRouteValidation(graph);

    expect(first).toEqual(second);
    expect(first?.path).toBe("route-schemas.ts");
    expect(first?.content).toContain("export const UsersGetRequestSchema = {");
    expect(first?.content).toContain("path: z.object({ id: z.string().uuid() }),");
    expect(first?.content).toContain("query: z.object({ limit: z.number().int().optional() }),");
    expect(routeValidationTemplateData(graph).routes).toHaveLength(2);
  });

  it("connects explicit model schema references", () => {
    const graph = buildGraph(
      defineApp({
        name: "api-app",
        version: "1.0.0",
        environment: "development",
        stack: { language: "typescript", runtime: "node" },
        models: [defineModel({ name: "User" })],
        routes: [
          defineRoute({
            name: "users.create",
            method: "POST",
            path: "/users",
            parameters: [
              defineParameter({
                name: "body",
                location: "body",
                schema: "UserSchema",
                required: true,
              }),
            ],
          }),
        ],
      }),
    );

    expect(generateRouteValidation(graph)?.content).toContain(
      'import { UserSchema } from "./schemas.js";',
    );
    expect(generateRouteValidation(graph)?.content).toContain("body: UserSchema,");
  });

  it("rejects references to schemas that are not generated", () => {
    const graph = buildGraph(
      defineApp({
        name: "api-app",
        version: "1.0.0",
        environment: "development",
        stack: { language: "typescript", runtime: "node" },
        routes: [
          defineRoute({
            name: "users.create",
            method: "POST",
            path: "/users",
            parameters: [
              defineParameter({ name: "body", location: "body", schema: "MissingSchema" }),
            ],
          }),
        ],
      }),
    );

    expect(() => generateRouteValidation(graph)).toThrow(RouteValidationGenerationError);
  });
});
