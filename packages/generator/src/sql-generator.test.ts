import { describe, expect, it } from "vitest";

import { generatePostgreSQLSql } from "./sql-generator.js";

describe("SQL generation", () => {
  it("renders table, index, foreign-key, and constraint operations", () => {
    const artifact = generatePostgreSQLSql([
      {
        type: "create-table",
        table: {
          id: "users",
          name: "users",
          columns: [{ name: "id", type: "uuid", primaryKey: true }],
        },
      },
      {
        type: "create-index",
        table: "users",
        index: { name: "users_id_idx", columns: ["id"], unique: true },
      },
      {
        type: "add-constraint",
        table: "users",
        constraint: { name: "users_id_unique", type: "unique", columns: ["id"] },
      },
      {
        type: "add-foreign-key",
        table: "users",
        constraint: {
          name: "users_parent_fk",
          type: "foreign-key",
          columns: ["id"],
          referencedTable: "users",
          referencedColumns: ["id"],
          onDelete: "cascade",
        },
      },
    ]);

    expect(artifact.content).toContain('CREATE TABLE "users"');
    expect(artifact.content).toContain('CREATE UNIQUE INDEX "users_id_idx"');
    expect(artifact.content).toContain('ADD CONSTRAINT "users_id_unique" UNIQUE');
    expect(artifact.content).toContain('ADD CONSTRAINT "users_parent_fk" FOREIGN KEY');
  });

  it("renders explicit ALTER TABLE actions", () => {
    const artifact = generatePostgreSQLSql([
      {
        type: "alter-table",
        table: "users",
        actions: [
          { type: "add-column", column: { name: "active", type: "boolean", defaultValue: true } },
          { type: "set-nullable", column: "active", nullable: false },
          { type: "alter-column-type", column: "active", dataType: "integer" },
          { type: "drop-default", column: "active" },
        ],
      },
    ]);

    expect(artifact.content).toContain(
      'ALTER TABLE "users" ADD COLUMN "active" BOOLEAN DEFAULT TRUE;',
    );
    expect(artifact.content).toContain('ALTER COLUMN "active" SET NOT NULL;');
    expect(artifact.content).toContain('ALTER COLUMN "active" TYPE INTEGER;');
    expect(artifact.content).toContain('ALTER COLUMN "active" DROP DEFAULT;');
  });
});
