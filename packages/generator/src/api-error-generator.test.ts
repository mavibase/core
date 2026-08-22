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
