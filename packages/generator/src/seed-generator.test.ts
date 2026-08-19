import { describe, expect, it } from "vitest";

import { generatePostgreSQLSeeds, PostgreSQLSeedGeneratorError } from "./seed-generator.js";

const schema = {
  name: "app",
  version: "1",
  tables: [
    {
      id: "users",
      name: "users",
      columns: [
        { name: "id", type: "uuid" as const },
        { name: "email", type: "string" as const },
        { name: "active", type: "boolean" as const },
      ],
    },
  ],
};

describe("PostgreSQL seed generator", () => {
  it("generates deterministic ordered seed SQL", () => {
    const artifact = generatePostgreSQLSeeds(schema, [
      {
        id: "users",
        name: "Users",
        order: 1,
        tables: [
          {
            table: "users",
            mode: "upsert",
            rows: [{ active: true, email: "admin@example.com", id: "user-1" }],
          },
        ],
      },
    ]);

    expect(artifact.path).toBe("database/seeds.sql");
    expect(artifact.content).toContain('INSERT INTO "users" ("active", "email", "id")');
    expect(artifact.content).toContain("ON CONFLICT DO NOTHING;");
    expect(artifact).toEqual(
      generatePostgreSQLSeeds(schema, [
        {
          id: "users",
          name: "Users",
          order: 1,
          tables: [
            {
              table: "users",
              mode: "upsert",
              rows: [{ id: "user-1", email: "admin@example.com", active: true }],
            },
          ],
        },
      ]),
    );
  });

  it("rejects seed rows that reference unknown tables or columns", () => {
    expect(() =>
      generatePostgreSQLSeeds(schema, [
        {
          id: "invalid",
          name: "Invalid",
          tables: [{ table: "missing", rows: [{ id: "1" }] }],
        },
      ]),
    ).toThrow(PostgreSQLSeedGeneratorError);
  });
});
