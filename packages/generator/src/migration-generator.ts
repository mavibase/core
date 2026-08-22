import type {
  DatabaseColumnDefinition,
  DatabaseConstraintDefinition,
  DatabaseMigrationOperation,
  DatabaseSchemaDefinition,
  DatabaseTableDefinition,
} from "@mavibase/core";

import type { GeneratedFile } from "./index.js";
import {
  renderPostgreSQLSqlOperations,
  type PostgreSQLAlterTableAction,
  type PostgreSQLSqlOperation,
} from "./sql-generator.js";
import { diffSchemas, SchemaDiffError } from "./schema-diff.js";

export interface PostgreSQLMigrationOptions {
  name?: string;
  allowDestructive?: boolean;
}

export interface PostgreSQLMigrationPlan {
  previousVersion: string;
  currentVersion: string;
  operations: readonly PostgreSQLSqlOperation[];
  destructiveOperations: readonly string[];
}

export interface PostgreSQLMigrationClient {
  query(sql: string): Promise<unknown>;
}

export interface PostgreSQLMigrationApplyOptions {
  allowDestructive?: boolean;
}

export interface PostgreSQLMigrationApplyResult {
  applied: boolean;
  operationCount: number;
}

export interface PostgreSQLMigrationIssue {
  path: string;
  message: string;
}

export class PostgreSQLMigrationError extends Error {
  readonly code = "MAVIBASE_POSTGRESQL_MIGRATION_ERROR";
  readonly issues: readonly PostgreSQLMigrationIssue[];

  constructor(issues: readonly PostgreSQLMigrationIssue[]) {
    super(
      `Unable to generate PostgreSQL migration: ${issues.map((issue) => issue.message).join(" ")}`,
    );
    this.name = "PostgreSQLMigrationError";
    this.issues = issues;
  }
}

function equalValues(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function toPostgreSQLOperation(operation: DatabaseMigrationOperation): PostgreSQLSqlOperation {
  const data = operation.data ?? {};
  if (operation.kind === "create-table") {
    return { type: "create-table", table: data["table"] as DatabaseTableDefinition };
  }
  if (operation.kind === "drop-table") return { type: "drop-table", table: operation.table ?? "" };
  if (operation.kind === "create-index") {
    return {
      type: "create-index",
      table: operation.table ?? "",
      index: data["index"] as NonNullable<DatabaseTableDefinition["indexes"]>[number],
    };
  }
  if (operation.kind === "drop-index") {
    const index = data["index"] as NonNullable<DatabaseTableDefinition["indexes"]>[number];
    return { type: "drop-index", table: operation.table ?? "", index: index.name };
  }
  if (operation.kind === "add-constraint") {
    const constraint = data["constraint"] as DatabaseConstraintDefinition;
    return constraint.type === "foreign-key"
      ? { type: "add-foreign-key", table: operation.table ?? "", constraint }
      : { type: "add-constraint", table: operation.table ?? "", constraint };
  }
  if (operation.kind === "drop-constraint") {
    const constraint = data["constraint"] as DatabaseConstraintDefinition;
    return { type: "drop-constraint", table: operation.table ?? "", constraint: constraint.name };
  }
  if (operation.kind === "add-column") {
    return {
      type: "alter-table",
      table: operation.table ?? "",
      actions: [{ type: "add-column", column: data["column"] as DatabaseColumnDefinition }],
    };
  }
  if (operation.kind === "drop-column") {
    const column = data["column"] as DatabaseColumnDefinition;
    return {
      type: "alter-table",
      table: operation.table ?? "",
      actions: [{ type: "drop-column", column: column.name }],
    };
  }
  const previous = data["previous"] as DatabaseColumnDefinition;
  const current = data["current"] as DatabaseColumnDefinition;
  const actions: PostgreSQLAlterTableAction[] = [];
  if (previous.type !== current.type) {
    actions.push({ type: "alter-column-type", column: current.name, dataType: current.type });
  }
  if ((previous.nullable ?? true) !== (current.nullable ?? true)) {
    actions.push({ type: "set-nullable", column: current.name, nullable: current.nullable ?? true });
  }
  if (!equalValues(previous.defaultValue, current.defaultValue)) {
    actions.push(
      current.defaultValue === undefined
        ? { type: "drop-default", column: current.name }
        : { type: "set-default", column: current.name, value: current.defaultValue, dataType: current.type },
    );
  }
  return { type: "alter-table", table: operation.table ?? "", actions };
}

export function planPostgreSQLMigration(
  previousDefinition: DatabaseSchemaDefinition,
  currentDefinition: DatabaseSchemaDefinition,
  options: PostgreSQLMigrationOptions = {},
): PostgreSQLMigrationPlan {
  try {
    const plan = diffSchemas(previousDefinition, currentDefinition, options);
    return {
      previousVersion: plan.previousVersion,
      currentVersion: plan.currentVersion,
      operations: plan.operations.map(toPostgreSQLOperation),
      destructiveOperations: plan.destructiveOperations,
    };
  } catch (error) {
    if (error instanceof SchemaDiffError) {
      throw new PostgreSQLMigrationError(error.issues);
    }
    throw error;
  }
}

function migrationName(version: string, name: string | undefined): string {
  const value = name ?? `migration-${version}`;
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "migration";
}

export function generatePostgreSQLMigration(
  previousDefinition: DatabaseSchemaDefinition,
  currentDefinition: DatabaseSchemaDefinition,
  options: PostgreSQLMigrationOptions = {},
): GeneratedFile {
  const plan = planPostgreSQLMigration(previousDefinition, currentDefinition, options);
  const body = renderPostgreSQLSqlOperations(plan.operations);
  return {
    path: `database/migrations/${migrationName(plan.currentVersion, options.name)}.sql`,
    content: `-- Generated by Mavibase PostgreSQL migration generator.\n-- Previous schema version: ${plan.previousVersion}\n-- Current schema version: ${plan.currentVersion}\n\n${body ? `${body}\n` : ""}`,
  };
}

export async function applyPostgreSQLMigration(
  plan: PostgreSQLMigrationPlan,
  client: PostgreSQLMigrationClient,
  options: PostgreSQLMigrationApplyOptions = {},
): Promise<PostgreSQLMigrationApplyResult> {
  if (plan.destructiveOperations.length > 0 && options.allowDestructive !== true) {
    throw new PostgreSQLMigrationError(
      plan.destructiveOperations.map((message) => ({ path: "destructiveOperations", message })),
    );
  }
  if (plan.operations.length === 0) return { applied: false, operationCount: 0 };

  await client.query("BEGIN");
  try {
    await client.query(renderPostgreSQLSqlOperations(plan.operations));
    await client.query("COMMIT");
    return { applied: true, operationCount: plan.operations.length };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original migration failure when rollback also fails.
    }
    throw error;
  }
}
