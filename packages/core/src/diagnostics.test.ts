import { describe, expect, it } from "vitest";

import {
  hasErrors,
  normalizeDefinition,
  validateDefinitionResult,
} from "./index.js";

describe("diagnostics", () => {
  it("detects error diagnostics", () => {
    expect(
      hasErrors({
        diagnostics: [
          { severity: "info", code: "info", message: "Informational" },
          { severity: "warning", code: "warning", message: "Warning" },
        ],
      }),
    ).toBe(false);
    expect(
      hasErrors({
        diagnostics: [{ severity: "error", code: "error", message: "Error" }],
      }),
    ).toBe(true);
  });

  it("returns a normalized typed definition for valid input", () => {
    const result = normalizeDefinition({
      name: "my-app",
      version: "1.0.0",
      environment: "development",
      stack: { language: "typescript", runtime: "node" },
    });

    expect(result).toEqual({
      valid: true,
      value: {
        name: "my-app",
        version: "1.0.0",
        environment: "development",
        stack: { language: "typescript", runtime: "node" },
        models: [],
        routes: [],
        definitions: {},
      },
      diagnostics: [],
    });
  });

  it("returns structured diagnostics for invalid input", () => {
    const result = validateDefinitionResult({ models: {} });

    expect(result.valid).toBe(false);
    expect(result.value).toBeUndefined();
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        {
          severity: "error",
          code: "definition.invalid-name",
          message: "Application name must not be empty.",
          path: "name",
        },
        {
          severity: "error",
          code: "definition.invalid-stack",
          message: "Application stack configuration must be an object.",
          path: "stack",
        },
        {
          severity: "error",
          code: "definition.invalid-model",
          message: "Application models must be an array.",
          path: "models",
        },
      ]),
    );
  });
});
