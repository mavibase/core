import { describe, expect, it } from "vitest";

import { defineApp, defineModel, field } from "@mavibase/core";

import { generateFromDefinition } from "./index.js";
import {
  assertGeneratedArtifacts,
  GeneratedCodeVerificationError,
  verifyGeneratedArtifacts,
} from "./generated-code-testing.js";

describe("generated-code testing", () => {
  it("writes and compiles all generated artifacts in an isolated environment", async () => {
    const User = defineModel({
      name: "User",
      fields: {
        id: field.uuid(),
        email: field.string().required(),
      },
    });
    const definition = defineApp({
      name: "verification-app",
      version: "1.0.0",
      environment: "test",
      stack: { language: "typescript", runtime: "node" },
      models: [User],
    });
    const result = generateFromDefinition(definition);

    const verification = await assertGeneratedArtifacts(result.artifacts, {
      expectedPaths: [
        "models.ts",
        "model-metadata.ts",
        "query-helpers.ts",
        "schemas.ts",
        "types.ts",
        "model-tests.ts",
      ],
    });

    expect(verification.valid).toBe(true);
    expect(verification.files).toEqual([
      "model-metadata.ts",
      "model-tests.ts",
      "models.ts",
      "query-helpers.ts",
      "schemas.ts",
      "types.ts",
    ]);
    expect(verification.operations.map(({ operation }) => operation)).toEqual([
      "create",
      "create",
      "create",
      "create",
      "create",
      "create",
    ]);
  });

  it("reports parse and compile failures without throwing from verification", async () => {
    const result = await verifyGeneratedArtifacts([
      { path: "broken.ts", content: "export const = ;\n" },
    ]);

    expect(result.valid).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics.some((diagnostic) => diagnostic.includes("broken.ts"))).toBe(true);
  });

  it("reports unexpected artifact paths", async () => {
    const result = await verifyGeneratedArtifacts(
      [{ path: "models.ts", content: "export interface User {}\n" }],
      { expectedPaths: ["models.ts", "schemas.ts"] },
    );

    expect(result.valid).toBe(false);
    expect(result.diagnostics[0]).toContain("Generated paths differ from expectations");
  });

  it("asserts invalid generated output with a structured error", async () => {
    await expect(
      assertGeneratedArtifacts([{ path: "broken.ts", content: "not valid typescript =" }]),
    ).rejects.toBeInstanceOf(GeneratedCodeVerificationError);
  });

  it("produces deterministic verification results", async () => {
    const artifacts = [
      { path: "b.ts", content: "export type B = string;\n" },
      { path: "a.ts", content: "export type A = string;\n" },
    ];

    const first = await verifyGeneratedArtifacts(artifacts);
    const second = await verifyGeneratedArtifacts(artifacts);

    expect(first.valid).toBe(true);
    expect({ valid: second.valid, files: second.files, diagnostics: second.diagnostics }).toEqual({
      valid: first.valid,
      files: first.files,
      diagnostics: first.diagnostics,
    });
  });
});
