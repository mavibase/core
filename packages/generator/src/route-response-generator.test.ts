import { describe, expect, it } from "vitest";

import {
  defineApp,
  defineModel,
  defineParameter,
  defineResponse,
  defineRoute,
} from "@mavibase/core";
import { buildGraph } from "@mavibase/application-graph";

import {
  generateRouteResponses,
  RouteResponseGenerationError,
  routeResponseTemplateData,
} from "./route-response-generator.js";

describe("route response generator", () => {
  it("generates deterministic expected response metadata", () => {
    const graph = buildGraph(
      defineApp({
        name: "api-app",
        version: "1.0.0",
        environment: "development",
        stack: { language: "typescript", runtime: "node" },
        models: [defineModel({ name: "User" })],
        routes: [
          defineRoute({
            name: "users.get",
            method: "GET",
            path: "/users/:id",
            parameters: [defineParameter({ name: "id", location: "path", type: "uuid" })],
            responses: [
              defineResponse({ status: 404, description: "Not found" }),
              defineResponse({ status: 200, schema: "UserSchema" }),
            ],
          }),
        ],
      }),
    );

    const first = generateRouteResponses(graph);
    const second = generateRouteResponses(graph);

    expect(first).toEqual(second);
    expect(first?.path).toBe("route-responses.ts");
    expect(first?.content).toContain('import { UserSchema } from "./schemas.js";');
    expect(first?.content).toContain("export const UsersGetResponses = {");
    expect(first?.content).toContain("200: { schema: UserSchema },");
    expect(first?.content).toContain('404: { description: "Not found" },');
    expect(
      routeResponseTemplateData(graph)[0]?.responses.map((response) => response.status),
    ).toEqual([200, 404]);
  });

  it("rejects references to unavailable model schemas", () => {
    const graph = buildGraph(
      defineApp({
        name: "api-app",
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

    expect(() => generateRouteResponses(graph)).toThrow(RouteResponseGenerationError);
  });

  it("generates response metadata for CRUD operations", () => {
    const graph = buildGraph(defineApp({
      name: "crud-response-app",
      version: "1.0.0",
      environment: "development",
      stack: { language: "typescript", runtime: "node", backend: { framework: "express" } },
      models: [defineModel({
        name: "User",
        crud: { enabled: true, operations: { list: true, get: true, create: true, delete: true } },
      })],
    }));

    const content = generateRouteResponses(graph)?.content ?? "";
    expect(content).toContain("CrudUserListResponses");
    expect(content).toContain("schema: UserCollectionResponseSchema");
    expect(content).toContain("schema: UserResponseSchema");
    expect(content).toContain("CrudUserDeleteResponses");
  });
});
