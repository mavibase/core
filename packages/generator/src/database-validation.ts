import type { DatabaseSchemaDefinition } from "@mavibase/core";
import {
  defineDatabaseSchema,
  validateDatabaseSchemaDefinition,
  validateDatabaseSeedDefinition,
} from "@mavibase/core";

import { validatePostgreSQLSchema } from "./postgresql-generator.js";

export interface DatabaseGenerationValidationInput {
  schema: unknown;
  seeds?: readonly unknown[];
}

export interface DatabaseGenerationValidationIssue {
  path: string;
  message: string;
}

function schemaTables(
  schema: DatabaseSchemaDefinition,
): Map<string, DatabaseSchemaDefinition["tables"][number]> {
  return new Map(schema.tables.map((table) => [table.name, table]));
}

export function validateDatabaseGeneration(
  input: DatabaseGenerationValidationInput,
): DatabaseGenerationValidationIssue[] {
  const issues: DatabaseGenerationValidationIssue[] = validateDatabaseSchemaDefinition(
    input.schema,
  );
  let schema: DatabaseSchemaDefinition | undefined;
  if (issues.length === 0) {
    schema = defineDatabaseSchema(input.schema as DatabaseSchemaDefinition);
    issues.push(...validatePostgreSQLSchema(schema));
  }

  const seeds = input.seeds ?? [];
  const seedIds = new Set<string>();
  const tables = schema
    ? schemaTables(schema)
    : new Map<string, DatabaseSchemaDefinition["tables"][number]>();
  for (const [seedIndex, seed] of seeds.entries()) {
    const seedIssues = validateDatabaseSeedDefinition(seed);
    issues.push(
      ...seedIssues.map((issue) => ({
        path: `seeds[${seedIndex}].${issue.path}`,
        message: issue.message,
      })),
    );
    if (!seed || typeof seed !== "object") continue;
    const seedRecord = seed as Record<string, unknown>;
    const id = seedRecord["id"];
    if (typeof id === "string") {
      if (seedIds.has(id))
        issues.push({
          path: `seeds[${seedIndex}].id`,
          message: `Database seed ids must be unique: "${id}".`,
        });
      seedIds.add(id);
    }
    if (!Array.isArray(seedRecord["tables"])) continue;
    for (const [tableIndex, table] of seedRecord["tables"].entries()) {
      if (!table || typeof table !== "object") continue;
      const tableRecord = table as Record<string, unknown>;
      const tableName = tableRecord["table"];
      const schemaTable = typeof tableName === "string" ? tables.get(tableName) : undefined;
      if (!schemaTable) {
        if (typeof tableName === "string")
          issues.push({
            path: `seeds[${seedIndex}].tables[${tableIndex}].table`,
            message: `Seed references unknown table: "${tableName}".`,
          });
        continue;
      }
      const columns = new Set(schemaTable.columns.map((column) => column.name));
      if (!Array.isArray(tableRecord["rows"])) continue;
      for (const [rowIndex, row] of tableRecord["rows"].entries()) {
        if (!row || typeof row !== "object") continue;
        for (const column of Object.keys(row)) {
          if (!columns.has(column))
            issues.push({
              path: `seeds[${seedIndex}].tables[${tableIndex}].rows[${rowIndex}].${column}`,
              message: `Seed references unknown column "${column}" on table "${tableName}".`,
            });
        }
      }
    }
  }
  return issues;
}
