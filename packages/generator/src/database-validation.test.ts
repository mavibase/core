import { describe, expect, it } from "vitest";

import { validateDatabaseGeneration } from "./database-validation.js";

describe("database generation validation", () => {
  it("accepts consistent schema and seed definitions", () => {
    expect(
      validateDatabaseGeneration({
        schema: {
          name: "app",
          version: "1",
          tables: [{ id: "users", name: "users", columns: [{ name: "id", type: "uuid" }] }],
        },
        seeds: [{ id: "users", name: "Users", tables: [{ table: "users", rows: [{ id: "1" }] }] }],
      }),
    ).toEqual([]);
  });

  it("reports invalid schema references, duplicate seeds, and seed columns", () => {
    const issues = validateDatabaseGeneration({
      schema: {
        name: "app",
        version: "1",
        tables: [{ id: "users", name: "users", columns: [{ name: "id", type: "uuid" }] }],
      },
      seeds: [
        { id: "users", name: "Users", tables: [{ table: "users", rows: [{ missing: true }] }] },
        { id: "users", name: "Users again", tables: [{ table: "missing", rows: [] }] },
      ],
    });

    expect(issues.some((issue) => issue.message.includes("unknown column"))).toBe(true);
    expect(issues.some((issue) => issue.message.includes("must be unique"))).toBe(true);
    expect(issues.some((issue) => issue.message.includes("unknown table"))).toBe(true);
  });
});
