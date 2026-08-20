import { describe, expect, it } from "vitest";

import { buildGraph } from "@mavibase/application-graph";
import { defineApp, defineModel, field } from "@mavibase/core";

import { createFilesystem } from "./filesystem.js";
import { planGeneration } from "./generation-plan.js";

function graph() {
  return buildGraph(
    defineApp({
      name: "plan-app",
      version: "1.0.0",
      environment: "test",
      stack: { language: "typescript", runtime: "node" },
      models: [defineModel({ name: "User", fields: { id: field.uuid() } })],
    }),
  );
}

describe("generation plan", () => {
  it("uses the same deterministic artifact and filesystem plan", async () => {
    const first = await planGeneration(
      { graph: graph(), options: { outDir: "generated" } },
      createFilesystem({ rootDir: process.cwd(), targetRoot: "generated", dryRun: true }),
    );
    const second = await planGeneration(
      { graph: graph(), options: { outDir: "generated" } },
      createFilesystem({ rootDir: process.cwd(), targetRoot: "generated", dryRun: true }),
    );

    expect(first).toEqual(second);
    expect(first.artifacts.map((artifact) => artifact.path)).toEqual(
      [...first.artifacts.map((artifact) => artifact.path)].sort(),
    );
    expect(first.operations.every((operation) => operation.operation === "create")).toBe(true);
  });

  it("returns a non-mutating preview plan", async () => {
    const filesystem = createFilesystem({
      rootDir: process.cwd(),
      targetRoot: "generated",
      dryRun: true,
    });
    const plan = await planGeneration({ graph: graph() }, filesystem);

    expect(plan.operations.length).toBeGreaterThan(0);
    expect(filesystem.dryRun).toBe(true);
  });
});
