import type {
  DatabaseColumnDefinition,
  DatabaseConstraintDefinition,
  DatabaseIndexDefinition,
  DatabaseMigrationOperation,
  DatabaseSchemaDefinition,
  DatabaseTableDefinition,
} from "@mavibase/core";
import { defineDatabaseSchema } from "@mavibase/core";

export interface SchemaDiffOptions {
  allowDestructive?: boolean;
}

export interface SchemaDiffPlan {
  previousVersion: string;
  currentVersion: string;
  operations: readonly DatabaseMigrationOperation[];
  rollbackOperations: readonly DatabaseMigrationOperation[];
  destructiveOperations: readonly string[];
}

export interface SchemaDiffIssue {
  path: string;
  message: string;
}

export class SchemaDiffError extends Error {
  readonly code = "MAVIBASE_SCHEMA_DIFF_ERROR";
  readonly issues: readonly SchemaDiffIssue[];

  constructor(issues: readonly SchemaDiffIssue[]) {
    super(`Unable to diff database schemas: ${issues.map((issue) => issue.message).join(" ")}`);
    this.name = "SchemaDiffError";
    this.issues = issues;
  }
}

type SchemaData = Readonly<Record<string, unknown>>;

function equalValues(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function operation(
  kind: DatabaseMigrationOperation["kind"],
  table: string,
  data: SchemaData,
): DatabaseMigrationOperation {
  return { kind, table, data };
}

function foreignKeyTables(table: DatabaseTableDefinition): readonly string[] {
  return (table.constraints ?? [])
    .filter((constraint) => constraint.type === "foreign-key")
    .map((constraint) => constraint.referencedTable);
}

function orderTables(tables: readonly DatabaseTableDefinition[]): DatabaseTableDefinition[] {
  const byName = new Map(tables.map((table) => [table.name, table]));
  const ordered: DatabaseTableDefinition[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(table: DatabaseTableDefinition): void {
    if (visited.has(table.name)) return;
    if (visiting.has(table.name)) return;
    visiting.add(table.name);
    for (const dependency of [...foreignKeyTables(table)].sort()) {
      const referenced = byName.get(dependency);
      if (referenced) visit(referenced);
    }
    visiting.delete(table.name);
    visited.add(table.name);
    ordered.push(table);
  }

  for (const table of [...tables].sort((left, right) => left.name.localeCompare(right.name))) {
    visit(table);
  }
  return ordered;
}

function withoutForeignKeys(table: DatabaseTableDefinition): DatabaseTableDefinition {
  return {
    ...table,
    ...(table.constraints
      ? { constraints: table.constraints.filter((constraint) => constraint.type !== "foreign-key") }
      : {}),
  };
}

function tableConstraints(table: DatabaseTableDefinition): readonly DatabaseConstraintDefinition[] {
  return [...(table.constraints ?? [])].sort((left, right) => left.name.localeCompare(right.name));
}

function tableIndexes(table: DatabaseTableDefinition): readonly DatabaseIndexDefinition[] {
  return [...(table.indexes ?? [])].sort((left, right) => left.name.localeCompare(right.name));
}

function tableColumns(table: DatabaseTableDefinition): readonly DatabaseColumnDefinition[] {
  return [...table.columns].sort((left, right) => left.name.localeCompare(right.name));
}

function destructiveDescription(operationValue: DatabaseMigrationOperation): string {
  const table = operationValue.table ?? "database";
  if (operationValue.kind === "drop-table") return `Drop table ${table}`;
  if (operationValue.kind === "drop-column") return `Drop column ${table}.${String(operationValue.data?.["column"] ?? "")}`;
  if (operationValue.kind === "drop-index") return `Drop index ${String(operationValue.data?.["index"] ?? "")}`;
  if (operationValue.kind === "drop-constraint") return `Drop constraint ${String(operationValue.data?.["constraint"] ?? "")}`;
  return `Alter ${table}`;
}

function inverse(operationValue: DatabaseMigrationOperation): DatabaseMigrationOperation {
  const data = operationValue.data ?? {};
  if (operationValue.kind === "create-table") {
    return operation("drop-table", operationValue.table ?? "", { table: data["table"] });
  }
  if (operationValue.kind === "drop-table") {
    return operation("create-table", operationValue.table ?? "", { table: data["table"] });
  }
  if (operationValue.kind === "add-column") return operation("drop-column", operationValue.table ?? "", data);
  if (operationValue.kind === "drop-column") return operation("add-column", operationValue.table ?? "", data);
  if (operationValue.kind === "alter-column") {
    return operation("alter-column", operationValue.table ?? "", {
      previous: data["current"],
      current: data["previous"],
    });
  }
  if (operationValue.kind === "create-index") return operation("drop-index", operationValue.table ?? "", data);
  if (operationValue.kind === "drop-index") return operation("create-index", operationValue.table ?? "", data);
  if (operationValue.kind === "add-constraint") return operation("drop-constraint", operationValue.table ?? "", data);
  return operation("add-constraint", operationValue.table ?? "", data);
}

export function diffSchemas(
  previousDefinition: DatabaseSchemaDefinition,
  currentDefinition: DatabaseSchemaDefinition,
  options: SchemaDiffOptions = {},
): SchemaDiffPlan {
  const previous = defineDatabaseSchema(previousDefinition);
  const current = defineDatabaseSchema(currentDefinition);
  const operations: DatabaseMigrationOperation[] = [];
  const destructiveOperations: string[] = [];
  const previousTables = new Map(previous.tables.map((table) => [table.name, table]));
  const currentTables = new Map(current.tables.map((table) => [table.name, table]));

  for (const table of orderTables(current.tables)) {
    const previousTable = previousTables.get(table.name);
    if (!previousTable) {
      operations.push(operation("create-table", table.name, { table: withoutForeignKeys(table) }));
      for (const index of tableIndexes(table)) operations.push(operation("create-index", table.name, { index }));
      for (const constraint of tableConstraints(table)) operations.push(operation("add-constraint", table.name, { constraint }));
      continue;
    }

    const previousColumns = new Map(previousTable.columns.map((column) => [column.name, column]));
    const currentColumns = new Map(table.columns.map((column) => [column.name, column]));
    for (const column of tableColumns(table)) {
      const previousColumn = previousColumns.get(column.name);
      if (!previousColumn) {
        operations.push(operation("add-column", table.name, { column }));
      } else if (!equalValues(previousColumn, column)) {
        const changedType = previousColumn.type !== column.type;
        const changedNullability = (previousColumn.nullable ?? true) !== (column.nullable ?? true);
        const changedDefault = !equalValues(previousColumn.defaultValue, column.defaultValue);
        if (changedType || changedNullability || changedDefault) {
          operations.push(operation("alter-column", table.name, { previous: previousColumn, current: column }));
          if (changedType) destructiveOperations.push(`Change type of ${table.name}.${column.name}`);
        }
      }
    }
    for (const column of tableColumns(previousTable)) {
      if (!currentColumns.has(column.name)) {
        const dropped = operation("drop-column", table.name, { column });
        operations.push(dropped);
        destructiveOperations.push(destructiveDescription(dropped));
      }
    }

    const previousConstraints = new Map(tableConstraints(previousTable).map((constraint) => [constraint.name, constraint]));
    const currentConstraints = new Map(tableConstraints(table).map((constraint) => [constraint.name, constraint]));
    for (const constraint of tableConstraints(previousTable)) {
      const next = currentConstraints.get(constraint.name);
      if (!next || !equalValues(constraint, next)) {
        const dropped = operation("drop-constraint", table.name, { constraint });
        operations.push(dropped);
        destructiveOperations.push(destructiveDescription(dropped));
      }
    }
    for (const constraint of tableConstraints(table)) {
      const old = previousConstraints.get(constraint.name);
      if (!old || !equalValues(old, constraint)) operations.push(operation("add-constraint", table.name, { constraint }));
    }

    const previousIndexes = new Map(tableIndexes(previousTable).map((index) => [index.name, index]));
    const currentIndexes = new Map(tableIndexes(table).map((index) => [index.name, index]));
    for (const index of tableIndexes(previousTable)) {
      const next = currentIndexes.get(index.name);
      if (!next || !equalValues(index, next)) {
        const dropped = operation("drop-index", table.name, { index });
        operations.push(dropped);
        destructiveOperations.push(destructiveDescription(dropped));
      }
    }
    for (const index of tableIndexes(table)) {
      const old = previousIndexes.get(index.name);
      if (!old || !equalValues(old, index)) operations.push(operation("create-index", table.name, { index }));
    }
  }

  for (const table of orderTables(previous.tables).reverse()) {
    if (currentTables.has(table.name)) continue;
    for (const constraint of tableConstraints(table)) {
      const dropped = operation("drop-constraint", table.name, { constraint });
      operations.push(dropped);
      destructiveOperations.push(destructiveDescription(dropped));
    }
    for (const index of tableIndexes(table)) {
      const dropped = operation("drop-index", table.name, { index });
      operations.push(dropped);
      destructiveOperations.push(destructiveDescription(dropped));
    }
    const dropped = operation("drop-table", table.name, { table });
    operations.push(dropped);
    destructiveOperations.push(destructiveDescription(dropped));
  }

  if (destructiveOperations.length > 0 && !options.allowDestructive) {
    throw new SchemaDiffError(
      destructiveOperations.map((description) => ({
        path: "migration",
        message: `Destructive operation requires allowDestructive: true: ${description}.`,
      })),
    );
  }

  return {
    previousVersion: previous.version,
    currentVersion: current.version,
    operations,
    rollbackOperations: operations.slice().reverse().map(inverse),
    destructiveOperations,
  };
}
