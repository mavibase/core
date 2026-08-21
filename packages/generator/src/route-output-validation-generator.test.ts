import { describe, expect, it } from "vitest";

import { buildGraph } from "@mavibase/application-graph";
import { defineApp, defineModel, defineResponse, defineRoute } from "@mavibase/core";

import {
  generateRouteOutputValidation,
  RouteOutputValidationGenerationError,
  routeOutputValidationTemplateData,
} from "./route-output-validation-generator.js";

describe("route output validation generator", () => {
  it("generates deterministic status-specific response schemas", () => {
    const graph = buildGraph(
      defineApp({
        name: "output-validation-app",
        version: "1.0.0",
        environment: "development",
        stack: { language: "typescript", runtime: "node" },
        models: [defineModel({ name: "User" })],
        routes: [
          defineRoute({
            name: "users.get",
            method: "GET",
            path: "/users",
            responses: [
              defineResponse({ status: 204 }),
              defineResponse({ status: 200, schema: "UserSchema" }),
            ],
          }),
        ],
      }),
    );

    const first = generateRouteOutputValidation(graph);
    const second = generateRouteOutputValidation(graph);

    expect(first).toEqual(second);
    expect(first?.path).toBe("route-output-validation.ts");
    expect(first?.content).toContain('import { UserSchema } from "./schemas.js";');
    expect(first?.content).toContain("export const UsersGetResponseSchemas = {");
    expect(first?.content).toContain("200: UserSchema,");
    expect(first?.content).toContain("204: z.void(),");
    expect(first?.content).toContain("export function parseUsersGetResponse");
    expect(first?.content).toContain('createApiError(500, "OUTPUT_VALIDATION_ERROR"');
    expect(routeOutputValidationTemplateData(graph)[0]?.responses).toHaveLength(2);
  });

  it("uses unknown validation for responses without a schema", () => {
    const graph = buildGraph(
      defineApp({
        name: "output-validation-app",
        version: "1.0.0",
        environment: "development",
        stack: { language: "typescript", runtime: "node" },
        routes: [
          defineRoute({
            name: "health.check",
            method: "GET",
            path: "/health",
            responses: [defineResponse({ status: 200 })],
          }),
        ],
      }),
    );

    expect(generateRouteOutputValidation(graph)?.content).toContain("200: z.unknown(),");
  });

  it("rejects unavailable response model schemas", () => {
    const graph = buildGraph(
      defineApp({
        name: "output-validation-app",
        version: "1.0.0",
        environment: "development",
        stack: { language: "typescript", runtime: "node" },
        routes: [
          defineRoute({
            name: "users.get",
            method: "GET",
            path: "/users",
            responses: [defineResponse({ status: 200, schema: "MissingSchema" })],
          }),
        ],
      }),
    );

    expect(() => generateRouteOutputValidation(graph)).toThrow(
      RouteOutputValidationGenerationError,
    );
  });
});
