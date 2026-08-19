import type {
  DatabaseConstraintDefinition,
  DatabaseSchemaDefinition,
  DatabaseTableDefinition,
} from "@mavibase/core";
import { defineDatabaseSchema } from "@mavibase/core";

import type { GeneratedFile } from "./index.js";
import {
  renderPostgreSQLSqlOperations,
  type PostgreSQLAlterTableAction,
  type PostgreSQLSqlOperation,
} from "./sql-generator.js";

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

function withoutForeignKeys(table: DatabaseTableDefinition): DatabaseTableDefinition {
  return {
    ...table,
    ...(table.constraints
      ? { constraints: table.constraints.filter((constraint) => constraint.type !== "foreign-key") }
      : {}),
  };
}

function constraintOperation(
  table: string,
  constraint: DatabaseConstraintDefinition,
): PostgreSQLSqlOperation {
  return constraint.type === "foreign-key"
    ? { type: "add-foreign-key", table, constraint }
    : { type: "add-constraint", table, constraint };
}

function columnChanges(
  previous: DatabaseTableDefinition,
  current: DatabaseTableDefinition,
  destructiveOperations: string[],
): PostgreSQLAlterTableAction[] {
  const actions: PostgreSQLAlterTableAction[] = [];
  const previousColumns = new Map(previous.columns.map((column) => [column.name, column]));
  const currentColumns = new Map(current.columns.map((column) => [column.name, column]));

  for (const column of current.columns) {
    const oldColumn = previousColumns.get(column.name);
    if (!oldColumn) {
      actions.push({ type: "add-column", column });
      continue;
    }
    if (oldColumn.type !== column.type) {
      actions.push({ type: "alter-column-type", column: column.name, dataType: column.type });
      destructiveOperations.push(`Change type of ${current.name}.${column.name}`);
    }
    if ((oldColumn.nullable ?? true) !== (column.nullable ?? true)) {
      actions.push({
        type: "set-nullable",
        column: column.name,
        nullable: column.nullable ?? true,
      });
    }
    if (!equalValues(oldColumn.defaultValue, column.defaultValue)) {
      if (column.defaultValue === undefined)
        actions.push({ type: "drop-default", column: column.name });
      else
        actions.push({
          type: "set-default",
          column: column.name,
          value: column.defaultValue,
          dataType: column.type,
        });
    }
  }

  for (const column of previous.columns) {
    if (!currentColumns.has(column.name)) {
      actions.push({ type: "drop-column", column: column.name });
      destructiveOperations.push(`Drop column ${previous.name}.${column.name}`);
    }
  }
  return actions;
}

function compareTable(
  previous: DatabaseTableDefinition,
  current: DatabaseTableDefinition,
  destructiveOperations: string[],
): PostgreSQLSqlOperation[] {
  const operations: PostgreSQLSqlOperation[] = [];
  const actions = columnChanges(previous, current, destructiveOperations);
  if (actions.length > 0) operations.push({ type: "alter-table", table: current.name, actions });

  const previousConstraints = new Map(
    (previous.constraints ?? []).map((constraint) => [constraint.name, constraint]),
  );
  const currentConstraints = new Map(
    (current.constraints ?? []).map((constraint) => [constraint.name, constraint]),
  );
  for (const constraint of previous.constraints ?? []) {
    const next = currentConstraints.get(constraint.name);
    if (!next || !equalValues(constraint, next)) {
      operations.push({
        type: "drop-constraint",
        table: current.name,
        constraint: constraint.name,
      });
    }
  }
  for (const constraint of current.constraints ?? []) {
    const old = previousConstraints.get(constraint.name);
    if (!old || !equalValues(old, constraint))
      operations.push(constraintOperation(current.name, constraint));
  }

  const previousIndexes = new Map((previous.indexes ?? []).map((index) => [index.name, index]));
  const currentIndexes = new Map((current.indexes ?? []).map((index) => [index.name, index]));
  for (const index of previous.indexes ?? []) {
    const next = currentIndexes.get(index.name);
    if (!next || !equalValues(index, next))
      operations.push({ type: "drop-index", table: current.name, index: index.name });
  }
  for (const index of current.indexes ?? []) {
    const old = previousIndexes.get(index.name);
    if (!old || !equalValues(old, index))
      operations.push({ type: "create-index", table: current.name, index });
  }
  return operations;
}

export function planPostgreSQLMigration(
  previousDefinition: DatabaseSchemaDefinition,
  currentDefinition: DatabaseSchemaDefinition,
  options: PostgreSQLMigrationOptions = {},
): PostgreSQLMigrationPlan {
  const previous = defineDatabaseSchema(previousDefinition);
  const current = defineDatabaseSchema(currentDefinition);
  const operations: PostgreSQLSqlOperation[] = [];
  const deferredForeignKeys: PostgreSQLSqlOperation[] = [];
  const destructiveOperations: string[] = [];
  const previousTables = new Map(previous.tables.map((table) => [table.name, table]));
  const currentTables = new Map(current.tables.map((table) => [table.name, table]));

  for (const table of current.tables) {
    if (!previousTables.has(table.name)) {
      operations.push({ type: "create-table", table: withoutForeignKeys(table) });
      for (const constraint of table.constraints ?? []) {
        if (constraint.type === "foreign-key")
          deferredForeignKeys.push(constraintOperation(table.name, constraint));
      }
      for (const index of table.indexes ?? [])
        operations.push({ type: "create-index", table: table.name, index });
    } else {
      operations.push(
        ...compareTable(previousTables.get(table.name)!, table, destructiveOperations),
      );
    }
  }

  operations.push(...deferredForeignKeys);

  for (const table of previous.tables) {
    if (!currentTables.has(table.name)) {
      operations.push({ type: "drop-table", table: table.name });
      destructiveOperations.push(`Drop table ${table.name}`);
    }
  }

  if (destructiveOperations.length > 0 && !options.allowDestructive) {
    throw new PostgreSQLMigrationError(
      destructiveOperations.map((operation) => ({
        path: "migration",
        message: `Destructive operation requires allowDestructive: true: ${operation}.`,
      })),
    );
  }

  return {
    previousVersion: previous.version,
    currentVersion: current.version,
    operations,
    destructiveOperations,
  };
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
