import { describe, expect, it } from "vitest";
import type { DatabaseSchemaDefinition } from "@mavibase/core";

import { diffSchemas, SchemaDiffError } from "./schema-diff.js";

const empty: DatabaseSchemaDefinition = {
  name: "application",
  version: "1.0.0",
  tables: [],
};

describe("schema diffing", () => {
  it("orders table creation by foreign-key dependency and reverses it for rollback", () => {
    const current: DatabaseSchemaDefinition = {
      ...empty,
      version: "1.1.0",
      tables: [
        {
          id: "posts",
          name: "posts",
          columns: [{ name: "id", type: "uuid" }, { name: "user_id", type: "uuid" }],
          constraints: [
            {
              name: "posts_user_fk",
              type: "foreign-key",
              columns: ["user_id"],
              referencedTable: "users",
              referencedColumns: ["id"],
            },
          ],
        },
        {
          id: "users",
          name: "users",
          columns: [{ name: "id", type: "uuid" }],
        },
      ],
    };

    const plan = diffSchemas(empty, current);
    expect(plan.operations.map((operation) => `${operation.kind}:${operation.table}`)).toEqual([
      "create-table:users",
      "create-table:posts",
      "add-constraint:posts",
    ]);
    expect(plan.rollbackOperations.map((operation) => `${operation.kind}:${operation.table}`)).toEqual([
      "drop-constraint:posts",
      "drop-table:posts",
      "drop-table:users",
    ]);
  });

  it("reports column additions and supported type changes deterministically", () => {
    const previous: DatabaseSchemaDefinition = {
      ...empty,
      tables: [
        {
          id: "users",
          name: "users",
          columns: [{ name: "id", type: "integer" }],
        },
      ],
    };
    const current: DatabaseSchemaDefinition = {
      ...previous,
      version: "1.1.0",
      tables: [
        {
          ...previous.tables[0]!,
          columns: [
            { name: "id", type: "bigint" },
            { name: "active", type: "boolean", defaultValue: true },
          ],
        },
      ],
    };

    const plan = diffSchemas(previous, current, { allowDestructive: true });
    expect(plan.operations.map((operation) => operation.kind)).toEqual([
      "add-column",
      "alter-column",
    ]);
    expect(plan.destructiveOperations).toEqual(["Change type of users.id"]);
  });

  it("refuses destructive changes unless explicitly allowed", () => {
    const current = { ...empty, version: "2.0.0" };

    expect(() => diffSchemas({ ...empty, tables: [{ id: "users", name: "users", columns: [] }] }, current)).toThrow(
      SchemaDiffError,
    );
  });
});
