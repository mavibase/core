import { describe, expect, it } from "vitest";
import type { DatabaseSchemaDefinition } from "@mavibase/core";

import {
  generatePostgreSQLMigration,
  applyPostgreSQLMigration,
  planPostgreSQLMigration,
  PostgreSQLMigrationError,
} from "./migration-generator.js";

const previous: DatabaseSchemaDefinition = {
  name: "application",
  version: "1.0.0",
  tables: [
    {
      id: "users",
      name: "users",
      columns: [{ name: "id", type: "uuid" as const, primaryKey: true }],
    },
  ],
};

describe("PostgreSQL migrations", () => {
  it("creates a deterministic migration plan for schema additions", () => {
    const current = {
      ...previous,
      version: "1.1.0",
      tables: [
        {
          ...previous.tables[0]!,
          columns: [
            ...previous.tables[0]!.columns,
            { name: "active", type: "boolean" as const, defaultValue: true },
          ],
        },
      ],
    };
    const plan = planPostgreSQLMigration(previous, current);
    const artifact = generatePostgreSQLMigration(previous, current);

    expect(plan.destructiveOperations).toEqual([]);
    expect(plan.operations).toHaveLength(1);
    expect(artifact.path).toBe("database/migrations/migration-1-1-0.sql");
    expect(artifact.content).toContain(
      'ALTER TABLE "users" ADD COLUMN "active" BOOLEAN DEFAULT TRUE;',
    );
    expect(artifact).toEqual(generatePostgreSQLMigration(previous, current));
  });

  it("protects destructive changes unless explicitly enabled", () => {
    const current = { ...previous, version: "2.0.0", tables: [] };

    expect(() => planPostgreSQLMigration(previous, current)).toThrow(PostgreSQLMigrationError);

    const plan = planPostgreSQLMigration(previous, current, { allowDestructive: true });
    expect(plan.destructiveOperations).toEqual(["Drop table users"]);
    expect(plan.operations).toEqual([{ type: "drop-table", table: "users" }]);
  });

  it("generates table, index, and constraint additions in stable order", () => {
    const current = {
      ...previous,
      version: "1.2.0",
      tables: [
        ...previous.tables,
        {
          id: "posts",
          name: "posts",
          columns: [{ name: "id", type: "uuid" as const, primaryKey: true }],
          indexes: [{ name: "posts_id_idx", columns: ["id"] }],
        },
      ],
    };
    const artifact = generatePostgreSQLMigration(previous, current);

    expect(artifact.content.indexOf('CREATE TABLE "posts"')).toBeLessThan(
      artifact.content.indexOf('CREATE INDEX "posts_id_idx"'),
    );
  });

  it("applies a migration transactionally", async () => {
    const current = {
      ...previous,
      version: "1.3.0",
      tables: [{ ...previous.tables[0]!, columns: [...previous.tables[0]!.columns, { name: "active", type: "boolean" as const }] }],
    };
    const plan = planPostgreSQLMigration(previous, current);
    const queries: string[] = [];
    const result = await applyPostgreSQLMigration(plan, { query: async (sql) => { queries.push(sql); } });

    expect(result).toEqual({ applied: true, operationCount: 1 });
    expect(queries[0]).toBe("BEGIN");
    expect(queries[1]).toContain('ALTER TABLE "users" ADD COLUMN "active" BOOLEAN;');
    expect(queries[2]).toBe("COMMIT");
  });

  it("rolls back when applying a migration fails", async () => {
    const current = {
      ...previous,
      version: "1.4.0",
      tables: [{ ...previous.tables[0]!, columns: [...previous.tables[0]!.columns, { name: "active", type: "boolean" as const }] }],
    };
    const plan = planPostgreSQLMigration(previous, current);
    const queries: string[] = [];
    await expect(applyPostgreSQLMigration(plan, {
      query: async (sql) => {
        queries.push(sql);
        if (sql !== "BEGIN" && sql !== "ROLLBACK") throw new Error("database unavailable");
      },
    })).rejects.toThrow("database unavailable");

    expect(queries).toEqual(["BEGIN", expect.stringContaining("ALTER TABLE"), "ROLLBACK"]);
  });
});
