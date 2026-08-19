import { describe, expect, it } from "vitest";

import {
  DatabaseSchemaDefinitionError,
  defineDatabaseSchema,
  validateDatabaseSchemaDefinition,
} from "./database.js";

describe("database schema abstraction", () => {
  it("normalizes valid tables, columns, indexes, and constraints deterministically", () => {
    const schema = defineDatabaseSchema({
      name: "application",
      version: "1",
      tables: [
        {
          id: "users",
          name: "users",
          columns: [
            { name: "email", type: "string", unique: true },
            { name: "id", type: "uuid", primaryKey: true },
          ],
          indexes: [{ name: "users_email_idx", columns: ["email"] }],
          constraints: [{ name: "users_pk", type: "primary-key", columns: ["id"] }],
        },
      ],
    });

    expect(schema.tables[0]?.columns.map((column) => column.name)).toEqual(["email", "id"]);
    expect(schema.tables[0]?.indexes?.[0]?.columns).toEqual(["email"]);
    expect(schema).toEqual(defineDatabaseSchema(schema));
  });

  it("validates references and duplicate schema objects", () => {
    const issues = validateDatabaseSchemaDefinition({
      name: "application",
      version: "1",
      tables: [
        {
          id: "users",
          name: "users",
          columns: [{ name: "id", type: "uuid" }],
          indexes: [{ name: "users_idx", columns: ["missing"] }],
        },
        { id: "users", name: "users", columns: [] },
      ],
    });

    expect(issues.some((issue) => issue.message.includes("missing"))).toBe(true);
    expect(issues.some((issue) => issue.message.includes("Table ids must be unique"))).toBe(true);
  });

  it("rejects invalid definitions with structured errors", () => {
    expect(() => defineDatabaseSchema({ name: "", version: "", tables: [] })).toThrow(
      DatabaseSchemaDefinitionError,
    );
  });
});
