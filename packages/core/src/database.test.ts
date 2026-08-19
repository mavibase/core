import { describe, expect, it } from "vitest";

import {
  createDatabaseIndexName,
  DatabaseSchemaDefinitionError,
  defineDatabaseIndex,
  defineDatabaseSchema,
  validateDatabaseSchemaDefinition,
} from "./database.js";

describe("database schema abstraction", () => {
  it("creates deterministic explicit and generated index definitions", () => {
    expect(createDatabaseIndexName("User Accounts", ["tenant_id", "email"], true)).toBe(
      "user_accounts_tenant_id_email_uniq",
    );
    expect(defineDatabaseIndex("users", { columns: ["email"] })).toEqual({
      name: "users_email_idx",
      columns: ["email"],
    });
    expect(
      defineDatabaseIndex("users", {
        name: "users_email_unique",
        columns: ["email"],
        unique: true,
      }),
    ).toEqual({
      name: "users_email_unique",
      columns: ["email"],
      unique: true,
    });
  });

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
    expect(() => defineDatabaseIndex("users", { columns: ["email", "email"] })).toThrow(
      DatabaseSchemaDefinitionError,
    );
  });
});
