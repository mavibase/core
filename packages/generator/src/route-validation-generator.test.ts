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
    expect(first?.content).toContain("export function parseUsersGetRequest");
    expect(first?.content).toContain('createApiError(400, "VALIDATION_ERROR"');
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

  it("generates validation parsers for CRUD model operations", () => {
    const graph = buildGraph(
      defineApp({
        name: "crud-validation-app",
        version: "1.0.0",
        environment: "development",
        stack: { language: "typescript", runtime: "node", backend: { framework: "express" } },
        models: [defineModel({
          name: "User",
          fields: { id: field.uuid().primary() },
          crud: { enabled: true, operations: { list: true, get: true, create: true, update: true, delete: true } },
        })],
      }),
    );

    const content = generateRouteValidation(graph)?.content ?? "";
    expect(routeValidationTemplateData(graph).routes).toHaveLength(5);
    expect(content).toContain('import { UserCreateSchema } from "./schemas.js";');
    expect(content).toContain('import { UserPatchSchema } from "./schemas.js";');
    expect(content).toContain("export const CrudUserGetRequestSchema");
    expect(content).toContain("path: z.object({ id: z.string().uuid() })");
    expect(content).toContain("body: UserCreateSchema");
    expect(content).toContain("body: UserPatchSchema");
    expect(content).toContain("page: z.coerce.number().int().positive().default(1)");
    expect(content).toContain("limit: z.coerce.number().int().positive().max(100).default(20)");
    expect(content).toContain("parseCrudUserUpdateRequest");
  });

  it("uses configured pagination defaults and maximums", () => {
    const graph = buildGraph(
      defineApp({
        name: "configured-pagination-app",
        version: "1.0.0",
        environment: "development",
        stack: { language: "typescript", runtime: "node", backend: { framework: "express" } },
        models: [defineModel({
          name: "User",
          crud: {
            enabled: true,
            operations: { list: true },
            pagination: { enabled: true, defaultLimit: 25, maxLimit: 50 },
          },
        })],
      }),
    );

    const content = generateRouteValidation(graph)?.content ?? "";
    expect(content).toContain("page: z.coerce.number().int().positive().default(1)");
    expect(content).toContain("limit: z.coerce.number().int().positive().max(50).default(25)");
  });

  it("generates an allow-listed, typed filter query", () => {
    const graph = buildGraph(
      defineApp({
        name: "filtering-app",
        version: "1.0.0",
        environment: "development",
        stack: { language: "typescript", runtime: "node", backend: { framework: "express" } },
        models: [defineModel({
          name: "User",
          fields: { id: field.uuid().primary(), age: field.integer(), email: field.string() },
          crud: { enabled: true, operations: { list: true }, filtering: { enabled: true, fields: ["age", "email"] } },
        })],
      }),
    );

    const content = generateRouteValidation(graph)?.content ?? "";
    expect(content).toContain("filter: z.object({ age: z.coerce.number().int().optional(), email: z.string().optional() }).strict()");
    expect(content).not.toContain("id: z.string().uuid().optional()");
  });

  it("generates allow-listed sorting with direction defaults", () => {
    const graph = buildGraph(
      defineApp({
        name: "sorting-app",
        version: "1.0.0",
        environment: "development",
        stack: { language: "typescript", runtime: "node", backend: { framework: "express" } },
        models: [defineModel({
          name: "User",
          fields: { id: field.uuid().primary(), email: field.string(), age: field.integer() },
          crud: {
            enabled: true,
            operations: { list: true },
            sorting: { enabled: true, fields: ["email", "age"], defaultField: "email", defaultDirection: "desc" },
          },
        })],
      }),
    );

    const content = generateRouteValidation(graph)?.content ?? "";
    expect(content).toContain('sort: z.enum(["age", "email"]).default("email")');
    expect(content).toContain('direction: z.enum(["asc", "desc"]).default("desc")');
    expect(content).not.toContain('sort: z.enum(["id"])');
  });

  it("renders composed route parameter schemas from the registry", () => {
    const graph = buildGraph(
      defineApp({
        name: "composed-route-app",
        version: "1.0.0",
        environment: "development",
        stack: { language: "typescript", runtime: "node" },
        definitions: {
          schemas: {
            CreateUser: {
              kind: "object",
              fields: {
                name: { kind: "reference", schema: { name: "UserPayload" } },
                tags: { kind: "array", item: { kind: "reference", schema: { name: "UserPayload" } } },
              },
            },
            UserPayload: {
              kind: "union",
              members: [
                { kind: "object", fields: { name: { kind: "model", model: "User" } } },
                { kind: "object", fields: { id: { kind: "model", model: "User" } } },
              ],
            },
          },
        },
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
                schema: { kind: "reference", schema: { name: "CreateUser" } },
              }),
            ],
          }),
        ],
      }),
    );

    const content = generateRouteValidation(graph)?.content;
    expect(content).toContain('import { CreateUserInputSchema } from "./schemas.js";');
    expect(content).toContain("body: z.lazy(() => CreateUserInputSchema).optional(),");
  });

  it("generates body, query, params, and headers validation together", () => {
    const graph = buildGraph(
      defineApp({
        name: "input-validation-app",
        version: "1.0.0",
        environment: "development",
        stack: { language: "typescript", runtime: "node" },
        models: [defineModel({ name: "User" })],
        routes: [
          defineRoute({
            name: "users.update",
            method: "PATCH",
            path: "/users/:id",
            parameters: [
              defineParameter({ name: "id", location: "path", type: "uuid" }),
              defineParameter({ name: "filter", location: "query", type: "string" }),
              defineParameter({ name: "authorization", location: "header", type: "string" }),
              defineParameter({
                name: "body",
                location: "body",
                schema: "UserSchema",
                required: false,
              }),
            ],
          }),
        ],
      }),
    );

    const content = generateRouteValidation(graph)?.content;

    expect(content).toContain("path: z.object({ id: z.string().uuid() }),");
    expect(content).toContain("query: z.object({ filter: z.string().optional() }),");
    expect(content).toContain("headers: z.object({ authorization: z.string().optional() }),");
    expect(content).toContain("body: UserSchema.optional(),");
    expect(content).toContain("parseUsersUpdateRequest");
    expect(content).toContain("UsersUpdateRequestSchema.body.parse(input.body)");
  });

  it("uses custom input validation and reusable schema references", () => {
    const graph = buildGraph(
      defineApp({
        name: "composed-validation-app",
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
              }),
              defineParameter({
                name: "email",
                location: "query",
                type: "string",
                validation: "z.string().email()",
              }),
            ],
          }),
        ],
      }),
    );

    const content = generateRouteValidation(graph)?.content;

    expect(content).toContain('import { UserSchema } from "./schemas.js";');
    expect(content).toContain("body: UserSchema.optional(),");
    expect(content).toContain("email: z.string().email().optional()");
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
