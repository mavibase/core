import { describe, expect, it } from "vitest";

import { buildGraph } from "@mavibase/application-graph";
import { defineApp, defineModel, field } from "@mavibase/core";

import { normalizeDatabaseSchema, SchemaNormalizationError } from "./schema-normalizer.js";

describe("database schema normalizer", () => {
  it("derives deterministic tables, columns, indexes, constraints, and naming policy", () => {
    const User = defineModel({
      name: "User",
      fields: {
        id: field.uuid().primary(),
        displayName: field.text().required(),
        birthday: field.date(),
        balance: field.bigint(),
        roles: field.array({ kind: "enum", values: ["admin", "member"] }),
      },
      indexes: [{ columns: ["displayName"] }],
      constraints: [{ type: "unique", columns: ["displayName"] }],
    });
    const graph = buildGraph(
      defineApp({
        name: "schema-app",
        version: "1.0.0",
        environment: "test",
        stack: { language: "typescript", runtime: "node" },
        models: [User],
      }),
    );
    const schema = normalizeDatabaseSchema(graph, {
      seeds: [
        {
          id: "seed-users",
          name: "Users",
          order: 1,
          tables: [{ table: "User", rows: [{ displayName: "Ada" }] }],
        },
      ],
    });

    expect(schema.tables.map((table) => table.name)).toEqual(["User"]);
    expect(schema.tables[0]?.columns.map((column) => [column.name, column.type])).toEqual([
      ["balance", "bigint"],
      ["birthday", "date"],
      ["displayName", "text"],
      ["id", "uuid"],
      ["roles", "json"],
    ]);
    expect(schema.tables[0]?.indexes?.[0]?.name).toBe("user_displayname_idx");
    expect(schema.tables[0]?.constraints?.[0]?.name).toBe("user_displayname_unique");
    expect(schema.seeds[0]?.tables[0]?.rows).toEqual([{ displayName: "Ada" }]);
    expect(schema.naming).toEqual({
      tableCase: "preserve",
      columnCase: "preserve",
      indexCase: "preserve",
      constraintCase: "preserve",
    });
    expect(schema.operations).toEqual([]);
    expect(normalizeDatabaseSchema(graph)).toEqual(normalizeDatabaseSchema(graph));
  });

  it("rejects invalid graph input before schema construction", () => {
    expect(() =>
      normalizeDatabaseSchema({
        name: "schema-app",
        version: "1.0.0",
        nodes: [],
        edges: [{ from: "missing", to: "also-missing", type: "contains" }],
      }),
    ).toThrow(SchemaNormalizationError);
  });
});
