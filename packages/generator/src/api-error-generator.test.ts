import { describe, expect, it } from "vitest";

import { defineApp, defineModel } from "@mavibase/core";
import { buildGraph } from "@mavibase/application-graph";

import { generateApiErrors } from "./api-error-generator.js";

describe("API error generator", () => {
  it("generates shared error codes, safe conversion, and Express middleware", () => {
    const graph = buildGraph(defineApp({
      name: "api-errors",
      version: "1.0.0",
      environment: "development",
      stack: { language: "typescript", runtime: "node", backend: { framework: "express" } },
      models: [defineModel({ name: "User", crud: { enabled: true, operations: { list: true } } })],
    }));

    const content = generateApiErrors(graph)?.content ?? "";
    expect(content).toContain("export const apiErrorCodes");
    expect(content).toContain('"VALIDATION_ERROR"');
    expect(content).toContain('"INTERNAL_ERROR"');
    expect(content).toContain("requestId?: string");
    expect(content).toContain("export function toApiError");
    expect(content).toContain("export function mapDatabaseError");
    expect(content).toContain('code === "23505" || code === "P2002"');
    expect(content).toContain('code === "23503" || code === "P2003"');
    expect(content).toContain('code === "P2025"');
    expect(content).toContain('code === "22P02" || code === "P2006"');
    expect(content).toContain('code === "23502" || code === "23514" || code === "22001" || code === "P2000"');
    expect(content).toContain("Resource already exists.");
    expect(content).toContain("Resource not found.");
    expect(content).toContain("Database input is invalid.");
    expect(content).toContain("Resource violates a database constraint.");
    expect(content).toContain("const databaseError = mapDatabaseError(error, requestId);");
    expect(content).not.toContain("error.message");
    expect(content).not.toContain("databaseError.message");
    expect(content).toContain("Internal server error.");
    expect(content).toContain("createApiErrorHandler");
    expect(content).toContain('response.status(apiError.status).json({ error: apiError });');
  });

  it("does not generate error infrastructure for an empty graph", () => {
    const graph = buildGraph(defineApp({
      name: "empty",
      version: "1.0.0",
      environment: "development",
      stack: { language: "typescript", runtime: "node" },
    }));

    expect(generateApiErrors(graph)).toBeUndefined();
  });
});
